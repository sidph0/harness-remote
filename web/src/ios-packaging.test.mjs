import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const gitignore = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8').split(/\r?\n/)

assert.ok(packageJson.dependencies['@capacitor/ios'], 'package should declare @capacitor/ios')
assert.equal(packageJson.dependencies['@capacitor/android'], undefined, 'package should not declare @capacitor/android')
assert.equal(packageJson.scripts['cap:add:ios'], 'npx cap add ios', 'package should expose the iOS add command')
assert.equal(
  packageJson.scripts['cap:sync:ios'],
  'npx cap sync ios && node scripts/sync-ios-native.mjs',
  'package should expose the repeatable iOS sync command'
)
assert.ok(gitignore.includes('web/ios/'), 'generated iOS project should be ignored')

console.log('iOS packaging regression tests passed')
