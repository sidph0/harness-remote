import assert from 'node:assert/strict'

for (const name of ['localStorage', 'sessionStorage']) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: new Proxy({}, {
      get() {
        throw new Error(`${name} must not be accessed by Collab attachment persistence`)
      }
    })
  })
}

const { attachmentFromLink, loadCollabAttachments, saveCollabAttachments } = await import('./attachments.ts')

const room = 'AbCdEf123456_-Xy'
const key = Uint8Array.from({ length: 32 }, (_, index) => index)
const token = Uint8Array.from({ length: 16 }, (_, index) => 240 + index)
const encode = (bytes) => Buffer.from(bytes).toString('base64url')
const viewLink = `${room}.${encode(key)}`
const fullLink = `${room}.${encode(Uint8Array.from([...key, ...token]))}`
const allCalls = []

class FakeSecureStore {
  constructor(value = null, errors = {}) {
    this.value = value
    this.errors = errors
    this.calls = []
  }

  record(method, key, value) {
    const call = value === undefined ? { method, key } : { method, key, value }
    this.calls.push(call)
    allCalls.push(call)
    if (this.errors[method]) throw this.errors[method]
  }

  async get(key) {
    this.record('get', key)
    return this.value
  }

  async set(key, value) {
    this.record('set', key, value)
    this.value = value
  }

  async remove(key) {
    this.record('remove', key)
    this.value = null
  }
}

const view = attachmentFromLink('  View only  ', `  ${viewLink}  `, 'attachment-view')
assert.deepEqual(view, {
  id: 'attachment-view',
  name: 'View only',
  link: viewLink,
  readOnly: true
})

const full = attachmentFromLink('  Full access  ', `  ${fullLink}  `, 'attachment-full')
assert.deepEqual(full, {
  id: 'attachment-full',
  name: 'Full access',
  link: fullLink,
  readOnly: false
})

assert.throws(() => attachmentFromLink('   ', viewLink, 'empty-name'), /name/i)
const invalidSecret = 'not+base64-secret'
const invalidLink = `${room}.${invalidSecret}`
assert.throws(
  () => attachmentFromLink('Invalid', invalidLink, 'attachment-invalid'),
  (error) => {
    assert.ok(error instanceof Error)
    assert.equal(error.message.includes(invalidSecret), false, 'validation errors must not echo link secrets')
    assert.equal(error.message.includes(invalidLink), false, 'validation errors must not echo complete links')
    return true
  }
)

const roundTripStore = new FakeSecureStore()
await saveCollabAttachments([view, full], roundTripStore)
assert.equal(roundTripStore.calls.length, 1)
assert.equal(roundTripStore.calls[0].method, 'set')
assert.equal(typeof roundTripStore.calls[0].key, 'string')
assert.ok(roundTripStore.calls[0].key.length > 0)
assert.deepEqual(JSON.parse(roundTripStore.calls[0].value), [view, full], 'the full array must be written as one JSON value')
assert.deepEqual(await loadCollabAttachments(roundTripStore), [view, full])
assert.deepEqual(roundTripStore.calls.map(({ method, key }) => ({ method, key })), [
  { method: 'set', key: roundTripStore.calls[0].key },
  { method: 'get', key: roundTripStore.calls[0].key }
])

const emptyStore = new FakeSecureStore('previous value')
await saveCollabAttachments([], emptyStore)
assert.deepEqual(emptyStore.calls, [{ method: 'remove', key: roundTripStore.calls[0].key }])
assert.equal(emptyStore.value, null)

for (const stored of [null, '{invalid json']) {
  const store = new FakeSecureStore(stored)
  assert.deepEqual(await loadCollabAttachments(store), [])
  assert.deepEqual(store.calls, [{ method: 'get', key: roundTripStore.calls[0].key }])
}

const malformedSecret = Buffer.alloc(31, 7).toString('base64url')
const malformedStore = new FakeSecureStore(JSON.stringify([
  { id: 'kept', name: '  Kept  ', link: `  ${viewLink}  `, readOnly: false },
  null,
  { id: '', name: 'Missing id', link: fullLink, readOnly: false },
  { id: 'bad-link', name: 'Bad link', link: `${room}.${malformedSecret}`, readOnly: false }
]))
assert.deepEqual(await loadCollabAttachments(malformedStore), [{
  id: 'kept',
  name: 'Kept',
  link: viewLink,
  readOnly: true
}], 'malformed entries must be omitted and stored permissions must not override the link')

for (const method of ['get', 'set', 'remove']) {
  const expected = new Error(`synthetic ${method} failure`)
  const store = new FakeSecureStore(null, { [method]: expected })
  const operation = method === 'get'
    ? () => loadCollabAttachments(store)
    : method === 'set'
      ? () => saveCollabAttachments([view], store)
      : () => saveCollabAttachments([], store)
  await assert.rejects(operation, (error) => error === expected, `${method} errors must propagate unchanged`)
}

assert.equal(new Set(allCalls.map(({ key }) => key)).size, 1, 'all attachment persistence must use one fixed secure key')

console.log('collab attachment persistence contract tests passed')
