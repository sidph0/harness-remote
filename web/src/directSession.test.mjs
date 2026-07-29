import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

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

const resumeListener = app.match(/CapacitorApp\.addListener\(["']appStateChange["'][\s\S]*?\n\s*\}\)/)
assert.ok(resumeListener, 'iOS resume should have a distinct Capacitor appStateChange listener')
assert.match(resumeListener[0], /isActive/, 'the lifecycle listener should distinguish foreground resume from suspension')
assert.match(resumeListener[0], /refreshSessions\(/, 'foreground resume should refresh the session list')
assert.match(resumeListener[0], /selectedSessionRef\.current/, 'foreground resume should read the latest selected session')
assert.match(resumeListener[0], /loadSelected\(/, 'foreground resume should refresh the selected transcript')
assert.match(app, /CapacitorApp\.addListener\(["']backButton["']/, 'resume handling should remain distinct from native back-button handling')

console.log('direct session regression tests passed')
