import assert from 'node:assert/strict'
import { adaptCollabSnapshot } from './adapter.ts'

const usage = {
  input: 11,
  output: 7,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 18,
  cost: { total: 0.001 }
}

const header = {
  type: 'session',
  id: 'session-synthetic',
  title: 'Synthetic collab session',
  timestamp: '2026-07-28T12:00:00.000Z',
  cwd: '/workspace/synthetic'
}

const idleState = {
  isStreaming: false,
  queuedMessageCount: 0,
  sessionName: 'Synthetic collab session',
  cwd: '/workspace/synthetic',
  participants: [{ name: 'Host', role: 'host' }]
}

function snapshot(overrides = {}) {
  return {
    phase: 'live',
    endedReason: null,
    header,
    entries: [],
    state: idleState,
    agents: [],
    progress: new Map(),
    lifecycle: new Map(),
    stream: null,
    streamDone: false,
    activeTools: new Map(),
    working: false,
    readOnly: false,
    uiRequest: null,
    notices: [],
    ...overrides
  }
}

const entries = [
  {
    type: 'message',
    id: 'user-1',
    parentId: null,
    timestamp: '2026-07-28T12:00:01.500Z',
    message: { role: 'user', content: 'Please inspect the fixture.', timestamp: 1_785_240_001_000 }
  },
  {
    type: 'message',
    id: 'assistant-1',
    parentId: 'user-1',
    timestamp: '2026-07-28T12:00:04.000Z',
    message: {
      role: 'assistant',
      content: [
        { type: 'text', text: 'I inspected it.' },
        { type: 'thinking', thinking: 'Checked the synthetic fixture carefully.' },
        { type: 'image', data: 'synthetic-image-data', mimeType: 'image/png' },
        { type: 'toolCall', id: 'call-ok', name: 'read', arguments: { filePath: '/workspace/synthetic/input.txt' } },
        { type: 'toolCall', id: 'call-error', name: 'bash', arguments: { command: 'synthetic-command' } }
      ],
      model: 'synthetic/model',
      usage,
      stopReason: 'toolUse',
      timestamp: 1_785_240_002_000
    }
  },
  {
    type: 'message',
    id: 'result-ok',
    parentId: 'assistant-1',
    timestamp: '2026-07-28T12:00:03.000Z',
    message: {
      role: 'toolResult',
      toolCallId: 'call-ok',
      toolName: 'read',
      content: [{ type: 'text', text: 'synthetic contents' }],
      isError: false,
      timestamp: 1_785_240_003_000
    }
  },
  {
    type: 'message',
    id: 'result-error',
    parentId: 'assistant-1',
    timestamp: '2026-07-28T12:00:03.500Z',
    message: {
      role: 'toolResult',
      toolCallId: 'call-error',
      toolName: 'bash',
      content: [{ type: 'text', text: 'synthetic failure' }],
      isError: true,
      timestamp: 1_785_240_003_500
    }
  },
  {
    type: 'custom_message',
    id: 'guest-prompt-1',
    parentId: 'result-error',
    timestamp: '2026-07-28T12:00:05.000Z',
    customType: 'collab-prompt',
    content: [{ type: 'text', text: 'A guest follow-up' }],
    details: { from: 'Guest synthetic' },
    display: true
  }
]

const adapted = adaptCollabSnapshot(snapshot({ entries }))
assert.deepEqual(adapted.session, {
  id: 'session-synthetic',
  title: 'Synthetic collab session',
  directory: '/workspace/synthetic',
  time: { created: 1_785_240_000_000, updated: 1_785_240_000_000 },
  external: true
})
assert.deepEqual(adapted.status, { type: 'idle' })
assert.deepEqual(adapted.messages, [
  {
    info: {
      id: 'user-1',
      role: 'user',
      sessionID: 'session-synthetic',
      time: { created: 1_785_240_001_000 }
    },
    parts: [{ id: 'user-1:text:0', messageID: 'user-1', type: 'text', text: 'Please inspect the fixture.' }]
  },
  {
    info: {
      id: 'assistant-1',
      role: 'assistant',
      sessionID: 'session-synthetic',
      time: { created: 1_785_240_002_000, completed: 1_785_240_004_000 }
    },
    parts: [
      { id: 'assistant-1:text:0', messageID: 'assistant-1', type: 'text', text: 'I inspected it.' },
      {
        id: 'assistant-1:reasoning:1',
        messageID: 'assistant-1',
        type: 'reasoning',
        text: 'Checked the synthetic fixture carefully.'
      },
      {
        id: 'assistant-1:tool:call-ok',
        messageID: 'assistant-1',
        type: 'tool',
        tool: 'read',
        callID: 'call-ok',
        state: {
          status: 'completed',
          input: { filePath: '/workspace/synthetic/input.txt' },
          output: 'synthetic contents',
          time: { start: 1_785_240_002_000, end: 1_785_240_003_000 }
        }
      },
      {
        id: 'assistant-1:tool:call-error',
        messageID: 'assistant-1',
        type: 'tool',
        tool: 'bash',
        callID: 'call-error',
        state: {
          status: 'error',
          input: { command: 'synthetic-command' },
          output: 'synthetic failure',
          error: 'synthetic failure',
          time: { start: 1_785_240_002_000, end: 1_785_240_003_500 }
        }
      }
    ]
  },
  {
    info: {
      id: 'guest-prompt-1',
      role: 'user',
      sessionID: 'session-synthetic',
      time: { created: 1_785_240_005_000 }
    },
    parts: [
      { id: 'guest-prompt-1:text:0', messageID: 'guest-prompt-1', type: 'text', text: 'A guest follow-up' },
      { id: 'guest-prompt-1:source', messageID: 'guest-prompt-1', type: 'collab-prompt', text: 'Guest synthetic' }
    ]
  }
])

const streamingMessage = {
  role: 'assistant',
  content: [{ type: 'text', text: 'Partial answer' }],
  model: 'synthetic/model',
  usage,
  stopReason: 'stop',
  timestamp: 1_785_240_006_000
}
const streaming = adaptCollabSnapshot(snapshot({ stream: streamingMessage, working: true }))
assert.deepEqual(streaming.status, { type: 'busy' })
assert.deepEqual(streaming.messages, [{
  info: {
    id: 'collab-stream-1785240006000',
    role: 'assistant',
    sessionID: 'session-synthetic',
    time: { created: 1_785_240_006_000 }
  },
  parts: [{
    id: 'collab-stream-1785240006000:text:0',
    messageID: 'collab-stream-1785240006000',
    type: 'text',
    text: 'Partial answer'
  }]
}])
const committedStream = adaptCollabSnapshot(snapshot({
  entries: [{
    type: 'message',
    id: 'assistant-stream-committed',
    parentId: null,
    timestamp: '2026-07-28T12:00:07.000Z',
    message: streamingMessage
  }],
  stream: streamingMessage,
  streamDone: true
}))
assert.equal(committedStream.messages.length, 1, 'a durable assistant entry must replace its streaming ghost')
assert.equal(committedStream.messages[0].info.id, 'assistant-stream-committed')

assert.deepEqual(adaptCollabSnapshot(snapshot({ state: { ...idleState, isStreaming: true } })).status, { type: 'busy' })
assert.deepEqual(adaptCollabSnapshot(snapshot({ state: { ...idleState, isAborting: true }, working: true })).status, { type: 'aborting' })
assert.deepEqual(adaptCollabSnapshot(snapshot()).status, { type: 'idle' })

const progress = {
  index: 1,
  agent: 'scout',
  task: 'Inspect fixture',
  assignment: 'Read only',
  progress: {
    index: 1,
    id: 'agent-sub',
    agent: 'scout',
    status: 'running',
    task: 'Inspect fixture',
    currentTool: 'read',
    currentToolArgs: '{"path":"synthetic.txt"}',
    recentTools: [],
    recentOutput: ['Found fixture'],
    toolCount: 1,
    requests: 2,
    tokens: 30,
    cost: 0.002,
    durationMs: 500
  }
}
const lifecycle = {
  id: 'agent-sub',
  agent: 'scout',
  description: 'Inspect fixture',
  status: 'started',
  index: 1,
  parentToolCallId: 'call-agent'
}
const agentSnapshot = snapshot({
  agents: [
    { id: 'agent-main', displayName: 'Main', kind: 'main', status: 'running', hasSessionFile: true, createdAt: 100, lastActivity: 300 },
    { id: 'agent-sub', displayName: 'Scout', kind: 'sub', parentId: 'agent-main', status: 'running', hasSessionFile: true, createdAt: 200, lastActivity: 400 }
  ],
  progress: new Map([['agent-sub', progress]]),
  lifecycle: new Map([['agent-sub', lifecycle]])
})
assert.deepEqual(adaptCollabSnapshot(agentSnapshot).agents, [
  {
    id: 'agent-main',
    name: 'Main',
    kind: 'main',
    parentId: null,
    status: 'running',
    hasTranscript: true,
    createdAt: 100,
    lastActivity: 300,
    progress: null,
    lifecycle: null
  },
  {
    id: 'agent-sub',
    name: 'Scout',
    kind: 'sub',
    parentId: 'agent-main',
    status: 'running',
    hasTranscript: true,
    createdAt: 200,
    lastActivity: 400,
    progress: progress.progress,
    lifecycle
  }
])

const replies = []
const actions = { sendUiResponse: (reqId, value) => replies.push([reqId, value]) }
const select = adaptCollabSnapshot(snapshot({
  uiRequest: {
    reqId: 17,
    kind: 'select',
    title: 'Choose a mode',
    options: ['Fast', { label: 'Careful', description: 'Inspect first' }],
    initialIndex: 1,
    helpText: 'Synthetic choice'
  }
}), actions).uiRequest
assert.equal(select.supported, true)
assert.equal(select.kind, 'select')
assert.equal(select.id, 17)
assert.equal(select.title, 'Choose a mode')
assert.deepEqual(select.options, [
  { label: 'Fast', description: '' },
  { label: 'Careful', description: 'Inspect first' }
])
assert.equal(select.initialValue, 'Careful')
assert.equal(select.helpText, 'Synthetic choice')
select.submit('Fast')
select.cancel()

const editor = adaptCollabSnapshot(snapshot({
  uiRequest: { reqId: 18, kind: 'editor', title: 'Edit the response', prefill: 'synthetic draft' }
}), actions).uiRequest
assert.equal(editor.supported, true)
assert.equal(editor.kind, 'editor')
assert.equal(editor.id, 18)
assert.equal(editor.title, 'Edit the response')
assert.equal(editor.prefill, 'synthetic draft')
editor.submit('edited synthetic draft')
editor.cancel()
assert.deepEqual(replies, [
  [17, 'Fast'],
  [17, undefined],
  [18, 'edited synthetic draft'],
  [18, undefined]
])

const unsupported = adaptCollabSnapshot(snapshot({
  uiRequest: {
    reqId: 19,
    kind: 'select',
    title: 'Choose several',
    options: ['One', 'Two'],
    selectionMarker: 'checkbox',
    checkedIndices: [0],
    markableCount: 2
  }
}), actions).uiRequest
assert.deepEqual(unsupported, {
  id: 19,
  kind: 'select',
  title: 'Choose several',
  supported: false,
  reason: 'checkbox selection is not supported'
})
assert.equal(Object.hasOwn(unsupported, 'submit'), false, 'unsupported checkbox requests must not expose a fabricated reply bridge')
assert.equal(Object.hasOwn(unsupported, 'cancel'), false, 'unsupported checkbox requests must not expose a fabricated cancel bridge')
assert.equal(replies.length, 4, 'adapting an unsupported request must not send a reply')

assert.doesNotThrow(() => adaptCollabSnapshot(snapshot({
  entries: [
    { type: 'future_entry', id: 'future-entry', payload: { synthetic: true } },
    { type: 'message', id: 'future-role', timestamp: '2026-07-28T12:00:08.000Z', message: { role: 'future-role' } }
  ],
  events: [{ type: 'future_event', payload: { synthetic: true } }]
})), 'unknown future entry and event variants must be ignored')

console.log('collab adapter contract tests passed')
