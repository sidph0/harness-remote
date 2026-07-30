import assert from 'node:assert/strict'
import { CollabClient } from './client.ts'
import { importRoomKey, open, seal } from './codec.ts'
import { packEnvelope, unpackEnvelope } from './link.ts'
import { CollabSocket } from './socket.ts'

const encode = (bytes) => Buffer.from(bytes).toString('base64url')
const key = Uint8Array.from({ length: 32 }, (_, index) => index)
const token = Uint8Array.from({ length: 16 }, (_, index) => 240 + index)
const room = 'AbCdEf123456_-Xy'
const viewLink = `${room}.${encode(key)}`
const fullLink = `${room}.${encode(Uint8Array.from([...key, ...token]))}`
const genericDeliveryError = (error) => {
  assert.ok(error instanceof Error)
  for (const secret of [room, viewLink, fullLink, encode(key), encode(token)]) {
    assert.equal(error.message.includes(secret), false, 'delivery rejection must not expose collaboration secrets')
  }
  return true
}

class FakeTimers {
  now = 0
  nextId = 1
  tasks = new Map()

  setTimeout = (callback, delay) => {
    const id = this.nextId++
    this.tasks.set(id, { callback, at: this.now + delay })
    return id
  }

  clearTimeout = (id) => this.tasks.delete(id)

  advance(ms) {
    const end = this.now + ms
    for (;;) {
      const due = [...this.tasks.entries()]
        .filter(([, task]) => task.at <= end)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0]
      if (!due) break
      const [id, task] = due
      this.tasks.delete(id)
      this.now = task.at
      task.callback()
    }
    this.now = end
  }
}

class FakeSocket {
  sent = []
  connectCalls = 0
  closeCalls = 0
  open = false
  sendResult
  onOpen
  onFrame
  onControl
  onClose

  connect() {
    this.connectCalls++
  }

  send(frame) {
    if (!this.open) throw new Error('fake socket is closed')
    this.sent.push(structuredClone(frame))
    return this.sendResult
  }

  close() {
    this.open = false
    this.closeCalls++
  }

  emitOpen() {
    this.open = true
    this.onOpen?.()
  }

  emitFrame(frame) {
    this.onFrame?.(structuredClone(frame), 0)
  }

  emitClose(code, reason = '') {
    this.open = false
    const fatal = new Set([4001, 4004, 4009, 4029]).has(code)
    this.onClose?.(reason || (fatal ? 'relay rejected connection' : 'connection lost'), !fatal)
  }
}

function setup(link = fullLink, name = 'Synthetic iPhone') {
  const timers = new FakeTimers()
  const socket = new FakeSocket()
  const factoryOptions = []
  const client = new CollabClient(link, name, {
    socketFactory(options) {
      factoryOptions.push(options)
      return socket
    },
    timers
  })
  return { client, socket, timers, factoryOptions }
}

const header = (id = 'session-1') => ({
  type: 'session',
  id,
  title: `Session ${id}`,
  timestamp: '2026-01-02T03:04:05.000Z',
  cwd: '/synthetic/project'
})
const state = (overrides = {}) => ({
  isStreaming: false,
  queuedMessageCount: 0,
  cwd: '/synthetic/project',
  participants: [{ name: 'host', role: 'host' }],
  ...overrides
})
const welcome = (overrides = {}) => ({
  t: 'welcome',
  proto: 3,
  header: header(),
  state: state(),
  agents: [],
  entryCount: 0,
  ...overrides
})
const entry = (id, text = id) => ({
  type: 'message',
  id,
  parentId: null,
  timestamp: '2026-01-02T03:04:05.000Z',
  message: { role: 'user', content: text, timestamp: 1 }
})
const snapshot = (client) => client.getSnapshot()
const finishEmptyWelcome = (socket, overrides) => {
  socket.emitFrame(welcome(overrides))
  socket.emitFrame({ t: 'snapshot-chunk', entries: [], final: true })
}
const assertEnded = (client, message) => {
  assert.equal(snapshot(client).phase, 'ended', message)
  assert.equal(typeof snapshot(client).endedReason, 'string', 'terminal state should expose a sanitized reason')
  assert.doesNotMatch(snapshot(client).endedReason, new RegExp(encode(key).slice(0, 12)), 'terminal errors must not contain key material')
}

// Every transport open starts a new handshake. The token is base64url, optional,
// and hello is never preceded by an application frame.
{
  const { client, socket, factoryOptions } = setup()
  client.connect()
  assert.equal(socket.connectCalls, 1)
  assert.equal(factoryOptions.length, 1, 'the socket factory should be the only transport boundary')
  assert.throws(() => client.sendPrompt('before open'), /connect|live|writ/i)
  assert.deepEqual(socket.sent, [], 'disconnected application frames must not be queued')

  socket.emitOpen()
  assert.deepEqual(socket.sent, [{ t: 'hello', proto: 3, name: 'Synthetic iPhone', writeToken: encode(token) }])
  assert.equal(snapshot(client).phase, 'waiting')
  finishEmptyWelcome(socket)
  assert.equal(snapshot(client).phase, 'live')

  socket.emitClose(1006)
  assert.equal(snapshot(client).phase, 'reconnecting')
  assert.throws(() => client.sendPrompt('during reconnect'), /connect|live|writ/i)
  socket.emitOpen()
  assert.deepEqual(socket.sent.at(-1), { t: 'hello', proto: 3, name: 'Synthetic iPhone', writeToken: encode(token) })
  assert.equal(socket.sent.length, 2, 'a disconnected application send must never replay after reconnect')
}

// Accepted application sends expose the transport delivery Promise.
{
  const { client, socket } = setup()
  client.connect()
  socket.emitOpen()
  finishEmptyWelcome(socket)

  socket.sendResult = Promise.resolve()
  const promptDelivery = client.sendPrompt('promise-backed prompt')
  assert.ok(promptDelivery instanceof Promise)
  await promptDelivery

  socket.sendResult = Promise.resolve()
  const abortDelivery = client.sendAbort()
  assert.ok(abortDelivery instanceof Promise)
  await abortDelivery
}

{
  const { client, socket } = setup(viewLink)
  client.connect()
  socket.emitOpen()
  assert.deepEqual(socket.sent, [{ t: 'hello', proto: 3, name: 'Synthetic iPhone' }], 'view links must omit the hello token property')
}

// Fatal relay closes end immediately; transient closes retain state for a retry.
{
  const { client, socket } = setup()
  client.connect()
  socket.emitOpen()
  finishEmptyWelcome(socket)
  socket.emitClose(1006, 'temporary network loss')
  assert.equal(snapshot(client).phase, 'reconnecting')
  assert.equal(snapshot(client).endedReason, null)
  socket.emitClose(4004)
  assertEnded(client, 'fatal relay close codes must be terminal')
}

// An explicit reconnect leaves the terminal closed snapshot synchronously,
// before a new transport opens, and a pre-open fatal close remains visible.
{
  const { client, socket } = setup()
  client.connect()
  socket.emitOpen()
  finishEmptyWelcome(socket)
  client.close()
  assert.equal(snapshot(client).endedReason, 'closed')

  client.connect()
  assert.match(snapshot(client).phase, /^(?:re)?connecting$/)
  assert.equal(snapshot(client).endedReason, null)

  socket.emitClose(4004, 'synthetic fatal reconnect rejection')
  assert.equal(snapshot(client).phase, 'ended')
  assert.equal(snapshot(client).endedReason, 'synthetic fatal reconnect rejection')
}

// Welcome is required after every open, not just the first connect.
{
  const { client, socket, timers } = setup()
  client.connect()
  timers.advance(30_000)
  assert.notEqual(snapshot(client).phase, 'ended', 'welcome timeout must not run before the WebSocket opens')
  socket.emitOpen()
  timers.advance(29_999)
  assert.notEqual(snapshot(client).phase, 'ended')
  timers.advance(1)
  assertEnded(client, 'the welcome timeout must start from the successful open')
}

{
  const { client, socket, timers } = setup()
  client.connect()
  socket.emitOpen()
  timers.advance(29_999)
  assert.notEqual(snapshot(client).phase, 'ended')
  timers.advance(1)
  assertEnded(client, 'an unanswered initial hello must time out after 30 seconds')
}

{
  const { client, socket, timers } = setup()
  client.connect()
  socket.emitOpen()
  finishEmptyWelcome(socket)
  socket.emitClose(1006)
  socket.emitOpen()
  timers.advance(30_000)
  assertEnded(client, 'an unanswered reconnect hello must get its own 30 second timeout')
}

// Empty and multi-chunk snapshots become live only on final:true with an exact count.
{
  const { client, socket, timers } = setup()
  client.connect()
  socket.emitOpen()
  socket.emitFrame(welcome({ entryCount: 0 }))
  assert.equal(snapshot(client).phase, 'waiting', 'entryCount zero still requires the final empty chunk')
  socket.emitFrame({ t: 'snapshot-chunk', entries: [], final: true })
  assert.equal(snapshot(client).phase, 'live')

  socket.emitClose(1006)
  socket.emitOpen()
  socket.emitFrame(welcome({ entryCount: 3 }))
  socket.emitFrame({ t: 'snapshot-chunk', entries: [entry('a')], final: false })
  timers.advance(29_999)
  assert.notEqual(snapshot(client).phase, 'ended')
  socket.emitFrame({ t: 'snapshot-chunk', entries: [entry('b')], final: false })
  timers.advance(29_999)
  assert.notEqual(snapshot(client).phase, 'ended', 'each non-final chunk must reset the progress timeout')
  socket.emitFrame({ t: 'snapshot-chunk', entries: [entry('c')], final: true })
  assert.equal(snapshot(client).phase, 'live')
  assert.deepEqual(snapshot(client).entries.map((item) => item.id), ['a', 'b', 'c'])
}

// Snapshot counts describe wire entries, including well-formed future variants
// that this client cannot normalize yet.
{
  const { client, socket } = setup()
  client.connect()
  socket.emitOpen()
  socket.emitFrame(welcome({ entryCount: 2 }))
  socket.emitFrame({
    t: 'snapshot-chunk',
    entries: [entry('known'), { type: 'future-entry', id: 'future', payload: { version: 4 } }],
    final: true
  })
  assert.equal(snapshot(client).phase, 'live', 'well-formed unknown entries must still satisfy the host entryCount')
  assert.deepEqual(snapshot(client).entries.map((item) => item.id), ['known'], 'unknown entries must be omitted from normalized state')
}

// Recognized entry types are not future variants: malformed payloads must be
// rejected without publishing or contributing to the host entry count.
{
  const { client, socket } = setup()
  client.connect()
  socket.emitOpen()
  socket.emitFrame(welcome({ entryCount: 1 }))
  const stable = snapshot(client)
  socket.emitFrame({
    t: 'snapshot-chunk',
    entries: [{ ...entry('malformed'), message: { role: 'user' } }],
    final: true
  })
  assert.equal(snapshot(client), stable, 'a malformed recognized entry must not publish snapshot mutation')
  assert.equal(snapshot(client).phase, 'waiting', 'a malformed recognized entry must not satisfy entryCount')
  socket.emitFrame({ t: 'snapshot-chunk', entries: [entry('valid')], final: true })
  assert.equal(snapshot(client).phase, 'live', 'a subsequent valid known entry must satisfy the unchanged entryCount')
  assert.deepEqual(snapshot(client).entries.map((item) => item.id), ['valid'])
}

{
  const { client, socket } = setup()
  client.connect()
  socket.emitOpen()
  socket.emitFrame(welcome({ entryCount: 1 }))
  const stable = snapshot(client)
  socket.emitFrame({ t: 'snapshot-chunk', entries: [null], final: true })
  assert.equal(snapshot(client), stable, 'a malformed non-object snapshot entry must not publish partial state')
  assert.equal(snapshot(client).phase, 'waiting')
  socket.emitFrame({ t: 'snapshot-chunk', entries: [entry('valid')], final: true })
  assert.equal(snapshot(client).phase, 'live')
  assert.deepEqual(snapshot(client).entries.map((item) => item.id), ['valid'])
}

{
  const { client, socket, timers } = setup()
  client.connect()
  socket.emitOpen()
  socket.emitFrame(welcome({ entryCount: 2 }))
  timers.advance(30_000)
  assertEnded(client, 'a stalled snapshot must time out after 30 seconds')
}

for (const chunks of [
  [{ t: 'snapshot-chunk', entries: [entry('only')], final: true }],
  [{ t: 'snapshot-chunk', entries: [entry('one'), entry('two')], final: true }]
]) {
  const { client, socket } = setup()
  client.connect()
  socket.emitOpen()
  socket.emitFrame(welcome({ entryCount: chunks[0].entries.length === 1 ? 2 : 1 }))
  for (const chunk of chunks) socket.emitFrame(chunk)
  assertEnded(client, 'final snapshot count mismatch must be terminal')
}

// A reconnect preserves the last immutable snapshot until a new welcome arrives;
// the new welcome then clears every per-snapshot accumulator.
{
  const { client, socket } = setup()
  client.connect()
  socket.emitOpen()
  socket.emitFrame(welcome({ entryCount: 1 }))
  socket.emitFrame({ t: 'snapshot-chunk', entries: [entry('old')], final: true })
  const oldSnapshot = snapshot(client)
  const oldEntries = oldSnapshot.entries

  socket.emitClose(1006)
  assert.equal(snapshot(client).entries, oldEntries)
  assert.deepEqual(oldEntries.map((item) => item.id), ['old'])
  socket.emitOpen()
  assert.equal(snapshot(client).entries, oldEntries, 'opening alone must not blank the retained transcript')
  socket.emitFrame(welcome({ header: header('session-2'), entryCount: 1 }))
  assert.notEqual(snapshot(client).entries, oldEntries)
  assert.deepEqual(snapshot(client).entries, [], 'fresh welcome must reset the new snapshot accumulator')
  assert.deepEqual(oldEntries.map((item) => item.id), ['old'], 'published snapshots must remain immutable')
  socket.emitFrame({ t: 'snapshot-chunk', entries: [entry('new')], final: true })
  assert.deepEqual(snapshot(client).entries.map((item) => item.id), ['new'])
}

// An intentional suspension close is quiescent, but an explicit connect starts
// a completely fresh hello/welcome/snapshot handshake on the same client.
{
  const { client, socket } = setup()
  client.connect()
  socket.emitOpen()
  finishEmptyWelcome(socket)
  const hello = socket.sent[0]

  client.close()
  assert.equal(socket.closeCalls, 1)
  assert.equal(snapshot(client).phase, 'ended')
  client.connect()
  assert.equal(socket.connectCalls, 2)
  assert.deepEqual(socket.sent, [hello], 'explicit connect must not replay frames before the transport opens')

  socket.emitOpen()
  assert.deepEqual(socket.sent, [hello, hello], 'the fresh transport open must send exactly one fresh hello')
  socket.emitFrame(welcome({ header: header('session-after-resume'), entryCount: 1 }))
  socket.emitFrame({ t: 'snapshot-chunk', entries: [entry('after-resume')], final: true })
  assert.equal(snapshot(client).phase, 'live')
  assert.equal(snapshot(client).header?.id, 'session-after-resume')
  assert.deepEqual(snapshot(client).entries.map((item) => item.id), ['after-resume'])
}

// Invalid/protocol-mismatched welcome is terminal. Malformed recognized live
// frames and unknown future variants are ignored without publishing mutation.
for (const badWelcome of [
  welcome({ proto: 2 }),
  { t: 'welcome', proto: 3, header: null, state: state(), agents: [], entryCount: 0 },
  welcome({ entryCount: -1 })
]) {
  const { client, socket } = setup()
  client.connect()
  socket.emitOpen()
  socket.emitFrame(badWelcome)
  assertEnded(client, 'malformed or incompatible welcome must terminate the connection')
}

{
  const { client, socket } = setup()
  client.connect()
  socket.emitOpen()
  finishEmptyWelcome(socket)
  const stable = snapshot(client)
  let notifications = 0
  const unsubscribe = client.subscribe(() => notifications++)
  const stableNotifications = notifications

  const malformedFrames = [
    { t: 'entry', entry: null },
    { t: 'event', event: { type: 'tool_execution_start', toolCallId: 7 } },
    { t: 'state', state: { isStreaming: 'yes' } },
    { t: 'bus', channel: 'task:subagent:progress', data: { progress: null } },
    { t: 'future-frame', payload: { anything: true } }
  ]
  for (const frame of malformedFrames) {
    socket.emitFrame(frame)
    assert.equal(snapshot(client), stable, `${frame.t} should be ignored without notifying subscribers`)
    assert.equal(notifications, stableNotifications)
  }
  socket.emitFrame({ t: 'event', event: { type: 'future-event', payload: true } })
  assert.equal(snapshot(client), stable)
  socket.emitFrame({ t: 'entry', entry: { type: 'future-entry', id: 'future' } })
  assert.equal(snapshot(client), stable)
  assert.equal(notifications, stableNotifications)
  unsubscribe()
  socket.emitFrame({ t: 'agents', agents: [] })
  assert.equal(notifications, stableNotifications, 'unsubscribe must stop future snapshot notifications')
}

// Effective read-only is local-token absence OR an authoritative host downgrade.
for (const [link, hostReadOnly, expected] of [
  [viewLink, false, true],
  [fullLink, false, false],
  [fullLink, true, true]
]) {
  const { client, socket } = setup(link)
  client.connect()
  socket.emitOpen()
  finishEmptyWelcome(socket, { readOnly: hostReadOnly })
  assert.equal(snapshot(client).readOnly, expected)
  const sentBefore = socket.sent.length
  if (expected) {
    assert.throws(() => client.sendPrompt('blocked'), /read.?only|writ/i)
    assert.throws(() => client.sendAbort(), /read.?only|writ/i)
    assert.throws(() => client.sendUiResponse(1, 'blocked'), /read.?only|writ/i)
    assert.equal(socket.sent.length, sentBefore, 'read-only rejection must be synchronous and perform no socket write')
  } else {
    client.sendPrompt('allowed')
    client.sendAbort()
    client.sendUiResponse(1, 'allowed')
    assert.deepEqual(socket.sent.slice(sentBefore), [
      { t: 'prompt', text: 'allowed' },
      { t: 'abort' },
      { t: 'ui-response', reqId: 1, value: 'allowed' }
    ])
  }
}

// Streaming/tool events and valid subagent bus payloads update their focused
// snapshot surfaces; unknown/malformed variants above remain harmless.
{
  const { client, socket } = setup()
  client.connect()
  socket.emitOpen()
  finishEmptyWelcome(socket)
  const assistant = {
    role: 'assistant',
    content: [{ type: 'text', text: 'working' }],
    model: 'synthetic/model',
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { total: 0 } },
    stopReason: 'stop',
    timestamp: 2
  }
  socket.emitFrame({ t: 'event', event: { type: 'message_update', message: assistant } })
  assert.deepEqual(snapshot(client).stream, assistant)
  socket.emitFrame({ t: 'event', event: { type: 'tool_execution_start', toolCallId: 'tool-1', toolName: 'read', args: { path: '/synthetic' }, intent: 'inspect' } })
  assert.equal(snapshot(client).activeTools.get('tool-1').toolName, 'read')
  socket.emitFrame({ t: 'event', event: { type: 'tool_execution_update', toolCallId: 'tool-1', toolName: 'read', args: {}, partialResult: 'partial' } })
  assert.equal(snapshot(client).activeTools.get('tool-1').partialResult, 'partial')
  socket.emitFrame({ t: 'event', event: { type: 'tool_execution_end', toolCallId: 'tool-1', toolName: 'read', result: 'done' } })
  assert.equal(snapshot(client).activeTools.has('tool-1'), false)
  assert.deepEqual(snapshot(client).completedTools.get('tool-1'), {
    toolCallId: 'tool-1',
    toolName: 'read',
    args: {},
    intent: 'inspect',
    partialResult: 'partial',
    result: 'done',
    isError: false,
    startedAt: 0,
    completedAt: 0
  })

  socket.emitFrame({ t: 'event', event: { type: 'tool_execution_end', toolCallId: 'event-only', toolName: 'bash', result: 'failed', isError: true } })
  assert.deepEqual(snapshot(client).completedTools.get('event-only'), {
    toolCallId: 'event-only', toolName: 'bash', args: {}, result: 'failed', isError: true, startedAt: 0, completedAt: 0
  })

  for (let index = 0; index < 256; index++) {
    socket.emitFrame({ t: 'event', event: { type: 'tool_execution_end', toolCallId: `bounded-${index}`, toolName: 'read', result: index } })
  }
  assert.equal(snapshot(client).completedTools.size, 256)
  assert.equal(snapshot(client).completedTools.has('tool-1'), false)
  assert.equal(snapshot(client).completedTools.has('bounded-255'), true)

  socket.emitFrame(welcome())
  assert.equal(snapshot(client).completedTools.size, 0, 'a new host handshake must clear completed tools')

  const progress = {
    index: 0,
    agent: 'worker',
    task: 'synthetic task',
    progress: {
      index: 0, id: 'progress-1', agent: 'worker', status: 'running', task: 'synthetic task',
      recentTools: [], recentOutput: [], toolCount: 0, requests: 0, tokens: 0, cost: 0, durationMs: 1
    }
  }
  const lifecycle = { id: 'agent-1', agent: 'worker', status: 'started', index: 0 }
  socket.emitFrame({ t: 'bus', channel: 'task:subagent:progress', data: progress })
  socket.emitFrame({ t: 'bus', channel: 'task:subagent:lifecycle', data: lifecycle })
  assert.deepEqual(snapshot(client).progress.get('progress-1'), progress)
  assert.deepEqual(snapshot(client).lifecycle.get('agent-1'), lifecycle)

  socket.emitFrame({ t: 'state', state: state({ isStreaming: true, queuedMessageCount: 2 }) })
  assert.equal(snapshot(client).state.queuedMessageCount, 2)
  assert.equal(snapshot(client).working, true)
  socket.emitFrame({ t: 'event', event: { type: 'message_end', message: assistant } })
  assert.equal(snapshot(client).streamDone, true)
  socket.emitFrame({ t: 'state', state: state({ isStreaming: false, queuedMessageCount: 0 }) })
  assert.equal(snapshot(client).stream, null)
  assert.equal(snapshot(client).working, false)
  socket.emitFrame({ t: 'bye', reason: 'host ended the synthetic session' })
  assertEnded(client, 'bye must expose the ended state and reason')
}

// Compatible UI requests are FIFO. A response advances only after transport
// delivery fulfills; rejection preserves the active request and snapshot.
{
  const { client, socket } = setup()
  client.connect()
  socket.emitOpen()
  finishEmptyWelcome(socket)
  const select = { reqId: 10, kind: 'select', title: 'Choose one', options: ['A', { label: 'B', description: 'second' }] }
  const editor = { reqId: 11, kind: 'editor', title: 'Edit text', prefill: 'draft' }
  socket.emitFrame({ t: 'ui-request', request: select })
  socket.emitFrame({ t: 'ui-request', request: editor })
  const beforeRejectedResponse = snapshot(client)

  let rejectDelivery
  socket.sendResult = new Promise((_, reject) => { rejectDelivery = reject })
  const rejectedResponse = client.sendUiResponse(10, 'A')
  assert.ok(rejectedResponse instanceof Promise)
  assert.equal(snapshot(client), beforeRejectedResponse)
  rejectDelivery(new Error('synthetic delivery failure'))
  await assert.rejects(rejectedResponse, /synthetic delivery failure/)
  assert.equal(snapshot(client), beforeRejectedResponse)
  assert.deepEqual(snapshot(client).uiRequest, select)

  let fulfillDelivery
  socket.sendResult = new Promise((resolve) => { fulfillDelivery = resolve })
  const fulfilledResponse = client.sendUiResponse(10, 'B')
  assert.ok(fulfilledResponse instanceof Promise)
  assert.equal(snapshot(client), beforeRejectedResponse, 'pending delivery must not advance or publish a snapshot')
  fulfillDelivery()
  await fulfilledResponse
  assert.deepEqual(snapshot(client).uiRequest, editor)

  socket.sendResult = Promise.resolve()
  await client.sendUiResponse(11)
  assert.deepEqual(socket.sent.at(-1), { t: 'ui-response', reqId: 11 }, 'omitting value is the protocol cancel response')
  assert.equal(snapshot(client).uiRequest, null)

  const checkbox = {
    reqId: 12,
    kind: 'select',
    title: 'Unsupported multi-select',
    options: ['A', 'B'],
    selectionMarker: 'checkbox',
    checkedIndices: [0],
    markableCount: 2
  }
  const sentBefore = socket.sent.length
  socket.emitFrame({ t: 'ui-request', request: checkbox })
  assert.deepEqual(snapshot(client).uiRequest, checkbox, 'unsupported checkbox requests must remain visible rather than disappearing')
  assert.equal(socket.sent.length, sentBefore, 'unsupported checkbox semantics must not synthesize a response')
  socket.emitFrame({ t: 'ui-request-end', reqId: 12 })
  assert.equal(snapshot(client).uiRequest, null)
}

class FakeRawWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = FakeRawWebSocket.CONNECTING
  binaryType = ''
  sent = []
  closes = []
  onopen
  onmessage
  onerror
  onclose

  send(data) {
    if (this.readyState !== FakeRawWebSocket.OPEN) throw new Error('raw WebSocket is closed')
    this.sent.push(data)
  }

  close(code = 1000, reason = '') {
    this.closes.push({ code, reason })
    this.readyState = FakeRawWebSocket.CLOSED
  }

  emitOpen() {
    this.readyState = FakeRawWebSocket.OPEN
    this.onopen?.({})
  }

  emitMessage(data) {
    this.onmessage?.({ data })
  }

  emitClose(code, reason = '') {
    this.readyState = FakeRawWebSocket.CLOSED
    this.onclose?.({ code, reason })
  }
}

const parsedLink = { wsUrl: 'wss://relay.invalid/r/AbCdEf123456_-Xy', roomId: room, key, writeToken: token }

function setupRawSocket(random = () => 0.5) {
  const timers = new FakeTimers()
  const raws = []
  const urls = []
  const socket = new CollabSocket(parsedLink, {
    webSocketFactory(url) {
      urls.push(url)
      const raw = new FakeRawWebSocket()
      raws.push(raw)
      return raw
    },
    timers,
    random
  })
  return { socket, timers, raws, urls }
}

async function waitForSocketWork(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return
    await new Promise((resolve) => setImmediate(resolve))
  }
  assert.fail(message)
}

// CollabSocket owns the raw WebSocket/AES boundary. It uses the guest relay URL,
// sends and receives authenticated envelopes in order, and parses only relay text controls.
{
  const { socket, raws, urls } = setupRawSocket()
  const opens = []
  const frames = []
  const controls = []
  socket.onOpen = () => opens.push('open')
  socket.onFrame = (frame, peerId) => frames.push({ frame, peerId })
  socket.onControl = (control) => controls.push(control)
  socket.connect()
  assert.deepEqual(urls, [`${parsedLink.wsUrl}?role=guest`])
  assert.equal(raws[0].binaryType, 'arraybuffer')
  raws[0].emitOpen()
  assert.deepEqual(opens, ['open'])

  const outgoing = [
    { t: 'hello', proto: 3, name: 'Synthetic iPhone', writeToken: encode(token) },
    { t: 'prompt', text: 'ordered application frame' }
  ]
  const deliveries = outgoing.map((frame) => socket.send(frame))
  assert.ok(deliveries.every((delivery) => delivery instanceof Promise), 'accepted socket sends must return delivery Promises')
  await Promise.all(deliveries)
  assert.equal(raws[0].sent.length, 2, 'resolved deliveries should reach the raw WebSocket')
  const roomCryptoKey = await importRoomKey(key)
  const decoded = []
  for (const bytes of raws[0].sent) {
    const envelope = unpackEnvelope(new Uint8Array(bytes))
    assert.equal(envelope.peerId, 0, 'guest application envelopes must target the host')
    decoded.push(await open(roomCryptoKey, envelope.payload))
  }
  assert.deepEqual(decoded, outgoing, 'AES/envelope sends must preserve application order')

  const incoming = [
    { t: 'state', state: state({ queuedMessageCount: 1 }) },
    { t: 'state', state: state({ queuedMessageCount: 2 }) }
  ]
  raws[0].emitMessage(packEnvelope(7, await seal(roomCryptoKey, incoming[0])).buffer)
  raws[0].emitMessage(packEnvelope(8, await seal(roomCryptoKey, incoming[1])))
  await waitForSocketWork(() => frames.length === 2, 'ordered encrypted receives should reach onFrame')
  assert.deepEqual(frames, [
    { frame: incoming[0], peerId: 7 },
    { frame: incoming[1], peerId: 8 }
  ])

  raws[0].emitMessage(JSON.stringify({ t: 'peer-joined', peer: 9 }))
  await waitForSocketWork(() => controls.length === 1, 'queued relay control should reach onControl')
  assert.deepEqual(controls, [{ t: 'peer-joined', peer: 9 }])
  raws[0].emitMessage('{malformed')
  assert.deepEqual(controls, [{ t: 'peer-joined', peer: 9 }], 'malformed relay text must be ignored')
}

// Disconnected application frames are rejected synchronously and cannot replay.
{
  const { socket, timers, raws } = setupRawSocket()
  assert.throws(() => socket.send({ t: 'prompt', text: 'before open' }), /connect|open/i)
  socket.connect()
  raws[0].emitOpen()
  raws[0].emitClose(1006, 'temporary loss')
  await waitForSocketWork(() => timers.tasks.size > 0, 'transient close should schedule reconnect before send rejection')
  assert.throws(() => socket.send({ t: 'prompt', text: 'during reconnect' }), /connect|open/i)
  timers.advance(1_000)
  raws[1].emitOpen()
  assert.deepEqual(raws[1].sent, [], 'reconnect must not replay either rejected disconnected send')
}

// A delivery captured by an open transport rejects if that transport closes
// or is replaced while crypto is pending, and is never replayed later.
{
  const { socket, timers, raws } = setupRawSocket()
  socket.connect()
  raws[0].emitOpen()
  const delivery = socket.send({ t: 'prompt', text: 'closed while encrypting' })
  socket.close()
  await assert.rejects(delivery, genericDeliveryError)
  assert.deepEqual(raws[0].sent, [])
  timers.advance(60_000)
  assert.equal(raws.length, 1, 'an intentionally closed pending send must not replay')
}

{
  const { socket, timers, raws } = setupRawSocket()
  socket.connect()
  raws[0].emitOpen()
  const staleDelivery = socket.send({ t: 'prompt', text: 'replaced while encrypting' })
  raws[0].emitClose(1006, 'synthetic replacement')
  await waitForSocketWork(() => timers.tasks.size > 0, 'replacement close should schedule reconnect before advancing timers')
  timers.advance(1_000)
  raws[1].emitOpen()
  await assert.rejects(staleDelivery, genericDeliveryError)
  assert.deepEqual(raws[0].sent, [])
  assert.deepEqual(raws[1].sent, [], 'a replacement transport must not replay a stale delivery')

  const currentFrame = { t: 'prompt', text: 'current transport delivery' }
  await socket.send(currentFrame)
  assert.equal(raws[1].sent.length, 1, 'a rejected send must not poison the delivery chain')
  const envelope = unpackEnvelope(new Uint8Array(raws[1].sent[0]))
  assert.deepEqual(await open(await importRoomKey(key), envelope.payload), currentFrame)
}

// Transient closes schedule bounded exponential reconnects and construct a new
// raw socket. Failed pre-open retries continue backing off, capped at 30 seconds.
{
  const { socket, timers, raws, urls } = setupRawSocket()
  const closes = []
  socket.onClose = (reason, willReconnect) => closes.push({ reason, willReconnect })
  socket.connect()
  raws[0].emitOpen()
  raws[0].emitClose(1006, 'network changed')
  await waitForSocketWork(() => closes.length === 1, 'transient close should notify before reconnect assertions')
  assert.deepEqual(closes.at(-1), { reason: 'network changed', willReconnect: true })
  timers.advance(999)
  assert.equal(raws.length, 1)
  timers.advance(1)
  assert.equal(raws.length, 2)
  assert.equal(urls[1], `${parsedLink.wsUrl}?role=guest`)

  for (const delay of [2_000, 4_000, 8_000, 16_000, 30_000, 30_000]) {
    raws.at(-1).emitClose(1006)
    await waitForSocketWork(() => timers.tasks.size > 0, 'queued close should schedule reconnect before reading its timer')
    const scheduled = [...timers.tasks.values()][0]
    assert.equal(scheduled.at - timers.now, delay, 'reconnect backoff must double and cap at 30 seconds')
    timers.advance(delay)
  }
}
for (const [random, expectedDelay] of [[() => 0, 750], [() => 1, 1_250]]) {
  const { socket, timers, raws } = setupRawSocket(random)
  socket.connect()
  raws[0].emitClose(1006)
  await waitForSocketWork(() => timers.tasks.size > 0, 'pre-open close should schedule reconnect before reading its timer')
  const scheduled = [...timers.tasks.values()][0]
  assert.equal(scheduled.at - timers.now, expectedDelay, 'injected jitter must remain within the documented 0.75–1.25 bound')
}

// Fatal relay codes, room-closed control, authentication/decryption failure,
// and intentional close are terminal and never leave a reconnect timer.
for (const fatalCode of [4001, 4004, 4009, 4029]) {
  const { socket, timers, raws } = setupRawSocket()
  const closes = []
  socket.onClose = (reason, willReconnect) => closes.push({ reason, willReconnect })
  socket.connect()
  raws[0].emitOpen()
  raws[0].emitClose(fatalCode)
  await waitForSocketWork(() => closes.length === 1, 'fatal close should notify before terminal assertions')
  assert.equal(closes.at(-1).willReconnect, false)
  timers.advance(60_000)
  assert.equal(raws.length, 1, `fatal close ${fatalCode} must never retry`)
}

{
  const { socket, timers, raws } = setupRawSocket()
  const frames = []
  const controls = []
  const closes = []
  const order = []
  socket.onFrame = (frame) => { frames.push(frame); order.push('frame') }
  socket.onControl = (control) => { controls.push(control); order.push('control') }
  socket.onClose = (reason, willReconnect) => { closes.push({ reason, willReconnect }); order.push('close') }
  socket.connect()
  raws[0].emitOpen()
  const hostFrame = { t: 'state', state: state({ queuedMessageCount: 3 }) }
  raws[0].emitMessage(packEnvelope(4, await seal(await importRoomKey(key), hostFrame)))
  raws[0].emitMessage(JSON.stringify({ t: 'room-closed' }))
  raws[0].emitClose(4001, 'relay closed room')
  await waitForSocketWork(() => closes.length === 1, 'room-closed should finish after prior encrypted receive work')
  assert.deepEqual(order, ['frame', 'control', 'close'])
  assert.deepEqual(frames, [hostFrame])
  assert.deepEqual(controls, [{ t: 'room-closed' }])
  assert.equal(closes[0].willReconnect, false)
  timers.advance(60_000)
  assert.equal(raws.length, 1)
}

{
  const { socket, timers, raws } = setupRawSocket()
  const closes = []
  socket.onClose = (reason, willReconnect) => closes.push({ reason, willReconnect })
  socket.connect()
  raws[0].emitOpen()
  const wrongKey = await importRoomKey(Uint8Array.from({ length: 32 }, (_, index) => 255 - index))
  raws[0].emitMessage(packEnvelope(1, await seal(wrongKey, { t: 'bye', reason: 'synthetic' })))
  await waitForSocketWork(() => closes.length === 1, 'authentication failure should close the CollabSocket')
  assert.equal(closes[0].willReconnect, false)
  assert.doesNotMatch(closes[0].reason, new RegExp(encode(key).slice(0, 12)), 'authentication errors must not expose key material')
  timers.advance(60_000)
  assert.equal(raws.length, 1)
}

{
  const { socket, timers, raws } = setupRawSocket()
  const closes = []
  socket.onClose = (reason, willReconnect) => closes.push({ reason, willReconnect })
  socket.connect()
  raws[0].emitOpen()
  socket.close()
  assert.equal(closes.at(-1).willReconnect, false)
  timers.advance(60_000)
  assert.equal(raws.length, 1, 'intentional close must suppress reconnect')
}

console.log('collab client contract tests passed')
