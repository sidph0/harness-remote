import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('./i18n.ts', import.meta.url), 'utf8')

const initialConfig = app.match(/function initialConfig\(\)[\s\S]*?\n\}/)
assert.ok(initialConfig, 'initialConfig function should be present')
assert.match(
  initialConfig[0],
  /resolveInitialBackend\(Capacitor\.getPlatform\(\),\s*storedBackend,\s*legacy\?\.backend\)/,
  'initial configuration should delegate platform-aware backend selection to the tested resolver'
)

const testConnection = app.match(/async function testConnection[\s\S]*?async function refreshSessions/)
assert.ok(testConnection, 'testConnection function should be present')
assert.equal(testConnection[0].includes('setView("sessions")'), false, 'Test Connection must not navigate away from settings')
assert.equal(testConnection[0].includes('setConfig(configToTest)'), false, 'Test Connection must not overwrite the current configuration')

const applyConfig = app.match(/function applyConfig[\s\S]*?async function testConnection/)
assert.ok(applyConfig, 'applyConfig function should persist the active configuration')
assert.equal(applyConfig[0].includes('setView("sessions")'), false, 'Automatic saves must leave the user on settings')
assert.ok(app.includes('setTimeout(() => applyConfig(draftConfig), 500)'), 'Configuration edits should be persisted after a short debounce')
assert.equal(app.includes('onClick={saveConfig}'), false, 'Settings should not require a separate Save action')
assert.ok(app.includes("t('settings.draftHint')"), 'Settings should explain automatic saving')
assert.ok(i18n.includes("'settings.saved': 'Changes saved automatically.'"), 'Automatic save feedback should be translated')
assert.ok(i18n.includes("'settings.testedNotSaved'"), 'Test success should remain distinct from connectivity state')
assert.ok(app.includes('function canTestConfig'), 'Settings should have a central testability check for required connection fields')
assert.ok(app.includes('disabled={testingConnection || !canTestDraft || testAlreadyPassedForDraft}'), 'Test button should be disabled when fields are missing, testing is active, or the unchanged configuration already passed')
assert.ok(app.includes('connection-help'), 'Settings should explain whether the current configuration can be tested')
assert.ok(app.includes('<option value="pi">PI (ACP bridge)</option>'), 'Settings should expose the PI backend')
assert.ok(app.includes('health.backend && health.backend !== configToTest.backend'), 'Connection tests should reject a bridge for the wrong backend')
assert.ok(app.includes('https://github.com/sidph0/harness-remote'), 'Help should link to the current repository')
assert.equal(app.includes('github.com/giuliastro'), false, 'Help must not link to the inherited repository owner')
assert.equal(app.includes('https://github.com/gervaso-assistant/opencode-remote-android#'), false, 'Help must not link to the obsolete repository owner')

assert.ok(app.includes('useState<"quick-start" | "connections" | "troubleshooting" | "commands">'), 'Help should use the approved four-page state')
assert.ok(app.includes("t('help.quickStart')") && app.includes("t('help.connections')"), 'Help should render Quick Start and Connections tabs')
assert.equal(app.includes('helpPage === "server"'), false, 'Help should not retain the old Server page')
assert.equal(app.includes('helpPage === "network"'), false, 'Help should not retain the old Network page')
assert.ok(app.includes('Tailscale Serve') && app.includes('port <code>443</code>'), 'Help should recommend the native-safe Tailscale path')
assert.equal(app.includes('Configure NAT/port forwarding'), false, 'Help must not recommend public router exposure')
assert.ok(app.includes('"/v1/health"') && app.includes('"/global/health"'), 'Help should select the health path for the active backend')
assert.ok(app.includes('curl.exe') && app.includes('401 Unauthorized'), 'Troubleshooting should explain Windows health checks and auth failures')
assert.ok(app.includes('capacitor://localhost'), 'Troubleshooting should document the native SSE CORS origin')
assert.ok(app.includes('arbitrary desktop OMP session') && app.includes('/collab'), 'Help should explain when Collab is required')
assert.equal(app.includes('Server commands are loaded from OpenCode'), false, 'Commands guidance must not be OpenCode-specific')
assert.equal(app.includes('<pre>/help</pre>'), false, 'Help must not promise backend-specific commands')

console.log('settings regression tests passed')
