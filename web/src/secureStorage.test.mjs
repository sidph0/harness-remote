import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const calls = []
const values = new Map([
  ['collab:existing', 'omp://collab/existing'],
  ['collab:null', null],
])
const invalidKeyError = new Error('invalid key')
const missingValueError = new Error('missing value')

// Capacitor discovers this test double as an iOS plugin, so the production boundary is exercised
// without a native runtime or a web-storage fallback.
globalThis.webkit = { messageHandlers: { bridge: {} } }
globalThis.Capacitor = {
  PluginHeaders: [{
    name: 'SecureStorage',
    methods: ['get', 'set', 'remove'].map((name) => ({ name, rtype: 'promise' })),
  }],
  nativePromise(plugin, method, options) {
    calls.push({ plugin, method, options })
    if (!options.key) return Promise.reject(invalidKeyError)
    if (method === 'get') return Promise.resolve({ value: values.get(options.key) ?? null })
    if (method === 'set') {
      if (options.value === undefined) return Promise.reject(missingValueError)
      values.set(options.key, options.value)
      return Promise.resolve()
    }
    values.delete(options.key)
    return Promise.resolve()
  },
}

const localStorageWrites = []
globalThis.localStorage = {
  getItem: () => null,
  setItem: (...args) => localStorageWrites.push(args),
  removeItem: () => {},
}

const { secureStorage } = await import('./secureStorage.ts')

assert.equal(await secureStorage.get('collab:existing'), 'omp://collab/existing')
assert.equal(await secureStorage.get('collab:null'), null)
await secureStorage.set('collab:new', 'omp://collab/new')
await secureStorage.remove('collab:new')

assert.deepEqual(calls, [
  { plugin: 'SecureStorage', method: 'get', options: { key: 'collab:existing' } },
  { plugin: 'SecureStorage', method: 'get', options: { key: 'collab:null' } },
  { plugin: 'SecureStorage', method: 'set', options: { key: 'collab:new', value: 'omp://collab/new' } },
  { plugin: 'SecureStorage', method: 'remove', options: { key: 'collab:new' } },
])
assert.deepEqual(localStorageWrites, [], 'Collab links must never be written to localStorage')

await assert.rejects(() => secureStorage.get(''), (error) => error === invalidKeyError)
await assert.rejects(() => secureStorage.set('collab:missing'), (error) => error === missingValueError)
assert.deepEqual(localStorageWrites, [], 'plugin errors must not fall back to localStorage')

const nativeSecureStorage = readFileSync(new URL('../native-ios/SecureStoragePlugin.swift', import.meta.url), 'utf8')
const setMethod = nativeSecureStorage.match(/@objc public func set\(_ call: CAPPluginCall\) \{[\s\S]*?\n    \}/)
assert.ok(setMethod, 'SecureStorage set method should be present')
const setSource = setMethod[0]
const updateIndex = setSource.indexOf('SecItemUpdate(')
const addIndex = setSource.indexOf('SecItemAdd(')
assert.ok(updateIndex >= 0, 'set should update an existing Keychain item')
assert.ok(updateIndex < addIndex, 'set should attempt update before add')
assert.match(
  setSource,
  /\b(?:if|guard)\s+updateStatus\s*==\s*errSecItemNotFound\b[\s\S]*SecItemAdd\s*\(/,
  'set should add only when update reports errSecItemNotFound'
)
assert.equal(setSource.includes('SecItemDelete('), false, 'set must not delete the existing value before replacement')


console.log('secure storage boundary tests passed')
