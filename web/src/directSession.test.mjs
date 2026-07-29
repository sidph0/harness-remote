import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadVerifiedCapabilities, resolveInitialBackend, resumeDirectSession } from './directSession.ts'

const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')

const directoryInput = app.match(/<input\b(?:(?!<input)[\s\S])*?value=\{newSessionDirectory\}(?:(?!<input)[\s\S])*?\/>/)
assert.ok(directoryInput, 'new-session directory should be directly editable without borrowing the selected session directory')
assert.match(
  directoryInput[0],
  /onChange=\{\(event\)\s*=>\s*setNewSessionDirectory\(event\.target\.value\)\}/,
  'typing a new-session directory should update only the new-session draft'
)
assert.equal(directoryInput[0].includes('selectedSession'), false, 'the new-session directory input must not mutate or derive from an existing session')

const createSession = app.match(/async function createSession[\s\S]*?\n  async function send/)
assert.ok(createSession, 'createSession function should be present')
const beforeCreateRequest = createSession[0].split('api.createSession')[0]
const openCodeValidation = beforeCreateRequest.match(
  /if \(config\.backend === ["']opencode["'] && directory\) \{[\s\S]*?api\.loadPath\(config,\s*directory\)[\s\S]*?\n\s*\}/
)
assert.ok(openCodeValidation, 'OpenCode should retain its project-directory validation before session creation')
assert.match(openCodeValidation[0], /api\.loadPath\(config,\s*directory\)/, 'OpenCode validation should resolve the typed project directory')
const directSessionSetup = beforeCreateRequest.replace(openCodeValidation[0], '')
assert.equal(
  /api\.(?:loadPath|listFiles)\(config,\s*directory/.test(directSessionSetup),
  false,
  'direct bridge paths should go to createSession without a preflight path or file request'
)
assert.match(
  createSession[0],
  /api\.createSession\(config,[^\n]*,\s*directory\)/,
  'only api.createSession should receive the typed new-session path'
)
assert.match(createSession[0], /setPickerError\(\(err as Error\)\.message\)/, 'outside-root bridge errors should be shown in the new-session picker')
assert.match(createSession[0], /setRuntimeError\(\(err as Error\)\.message\)/, 'outside-root bridge errors should remain visible after the picker closes')

const browseDirectory = app.match(/async function browseNewSessionDirectory[\s\S]*?\n  async function openNewSessionPicker/)
assert.ok(browseDirectory, 'new-session child navigation should have a focused browser function')
assert.match(browseDirectory[0], /api\.listFiles\(config,\s*path(?:,\s*path)?\)/, 'child navigation should continue through the root-safe listFiles bridge endpoint')
assert.equal(/setSessions\(|selectedSession\.directory\s*=/.test(browseDirectory[0]), false, 'selecting a child directory must not rewrite an existing session')

for (const savedBackend of ['opencode', 'pi', 'claude']) {
  assert.equal(resolveInitialBackend('ios', savedBackend, undefined), 'omp', `iOS should force OMP over saved ${savedBackend}`)
}

assert.equal(resolveInitialBackend('web', 'claude', 'pi'), 'claude', 'non-iOS should preserve a valid saved backend')
assert.equal(resolveInitialBackend('web', 'invalid', 'pi'), 'pi', 'non-iOS should ignore an invalid saved backend and preserve a valid legacy backend')
assert.equal(resolveInitialBackend('web', 'invalid', 'invalid'), 'opencode', 'non-iOS should default to OpenCode when no valid selection exists')

const config = { backend: 'omp', host: 'bridge.local', port: 4097, username: 'omp', password: 'secret' }
const fallbackCapabilities = { sessions: true, source: 'fallback' }
const remoteCapabilities = { sessions: true, source: 'remote' }
const capabilityCalls = []
const loadedCapabilities = await loadVerifiedCapabilities(config, fallbackCapabilities, {
  async health(receivedConfig) {
    assert.equal(receivedConfig, config)
    capabilityCalls.push('health')
    return { healthy: true, version: '1.0.0', backend: 'omp' }
  },
  async capabilities(receivedConfig) {
    assert.equal(receivedConfig, config)
    capabilityCalls.push('capabilities')
    return remoteCapabilities
  }
})
assert.equal(loadedCapabilities, remoteCapabilities, 'verified capabilities should be returned')
assert.deepEqual(capabilityCalls, ['health', 'capabilities'], 'health must verify the backend before capabilities are requested')

const fallbackCalls = []
const fallbackResult = await loadVerifiedCapabilities(config, fallbackCapabilities, {
  async health() {
    fallbackCalls.push('health')
    return { healthy: true, version: '1.0.0', backend: 'omp' }
  },
  async capabilities() {
    fallbackCalls.push('capabilities')
    throw new Error('capabilities unavailable')
  }
})
assert.equal(fallbackResult, fallbackCapabilities, 'a verified backend should use fallback capabilities when its capabilities request fails')
assert.deepEqual(fallbackCalls, ['health', 'capabilities'], 'fallback handling should still verify health first')

const unhealthyCalls = []
await assert.rejects(
  loadVerifiedCapabilities(config, fallbackCapabilities, {
    async health() {
      unhealthyCalls.push('health')
      return { healthy: false, version: '1.0.0', backend: 'omp' }
    },
    async capabilities() {
      unhealthyCalls.push('capabilities')
      return remoteCapabilities
    }
  }),
  'an unhealthy response should be rejected even when its backend matches'
)
assert.deepEqual(unhealthyCalls, ['health'], 'capabilities must not be requested from an unhealthy backend')

const missingBackendCalls = []
await assert.rejects(
  loadVerifiedCapabilities(config, fallbackCapabilities, {
    async health() {
      missingBackendCalls.push('health')
      return { healthy: true, version: '1.0.0' }
    },
    async capabilities() {
      missingBackendCalls.push('capabilities')
      return remoteCapabilities
    }
  }),
  'a healthy response without a backend identity should be rejected'
)
assert.deepEqual(missingBackendCalls, ['health'], 'capabilities must not be requested until the response identifies the expected backend')

const mismatchCalls = []
await assert.rejects(
  loadVerifiedCapabilities({ ...config, backend: 'pi' }, fallbackCapabilities, {
    async health() {
      mismatchCalls.push('health')
      return { healthy: true, version: '1.0.0', backend: 'omp' }
    },
    async capabilities() {
      mismatchCalls.push('capabilities')
      return remoteCapabilities
    }
  }),
  (error) => /pi/.test(error.message) && /omp/.test(error.message),
  'a backend mismatch should identify both the expected and reached backend'
)
assert.deepEqual(mismatchCalls, ['health'], 'capabilities must not be requested from the wrong backend')

const resumeCalls = []
await resumeDirectSession({
  resetTransport() {
    resumeCalls.push('reset')
  },
  async refreshSessions(force) {
    assert.equal(force, true)
    resumeCalls.push('refresh')
  },
  selected() {
    resumeCalls.push('selected')
    return { id: 'session-1', directory: '/project' }
  },
  async loadSelected(id, directory, force) {
    assert.deepEqual([id, directory, force], ['session-1', '/project', true])
    resumeCalls.push('transcript')
  }
})
assert.deepEqual(resumeCalls, ['reset', 'refresh', 'selected', 'transcript'], 'resume should reset transport, refresh sessions, then load the latest selection')

const noSelectionCalls = []
await resumeDirectSession({
  resetTransport: () => noSelectionCalls.push('reset'),
  refreshSessions: async () => noSelectionCalls.push('refresh'),
  selected: () => {
    noSelectionCalls.push('selected')
    return undefined
  },
  loadSelected: async () => noSelectionCalls.push('transcript')
})
assert.deepEqual(noSelectionCalls, ['reset', 'refresh', 'selected'], 'resume should not load a transcript without a selected session')

const refreshFailure = new Error('refresh failed')
const failedResumeCalls = []
await assert.rejects(
  resumeDirectSession({
    resetTransport: () => failedResumeCalls.push('reset'),
    refreshSessions: async () => {
      failedResumeCalls.push('refresh')
      throw refreshFailure
    },
    selected: () => failedResumeCalls.push('selected'),
    loadSelected: async () => failedResumeCalls.push('transcript')
  }),
  refreshFailure,
  'refresh failures should propagate to the lifecycle caller'
)
assert.deepEqual(failedResumeCalls, ['reset', 'refresh'], 'a failed refresh should stop resume before reading or loading a selection')

assert.match(app, /CapacitorApp\.addListener\(["']backButton["']/, 'resume handling should remain distinct from native back-button handling')

console.log('direct session regression tests passed')
