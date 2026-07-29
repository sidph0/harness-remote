import assert from 'node:assert/strict'
import { updateInfoPlist } from '../scripts/sync-ios-native.mjs'

const input = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDisplayName</key>
	<string>Harness Remote</string>
	<key>NSAppTransportSecurity</key>
	<dict>
		<key>NSExceptionDomains</key>
		<dict/>
		<key>NSAllowsArbitraryLoads</key>
		<true/>
	</dict>
</dict>
</plist>
`

const output = updateInfoPlist(input)

assert.match(
  output,
  /<key>NSExceptionDomains<\/key>\s*<dict\/>/,
  'nested self-closing dictionaries should be preserved'
)
assert.match(
  output,
  /<key>NSLocalNetworkUsageDescription<\/key>\s*<string>Connect to your Harness Remote bridge on your local network\.<\/string>/,
  'local-network usage description should be exact'
)
assert.match(
  output,
  /<key>NSAllowsLocalNetworking<\/key>\s*<true\/>/,
  'local networking should be allowed inside App Transport Security'
)
assert.doesNotMatch(output, /<key>NSAllowsArbitraryLoads<\/key>/)
assert.equal(updateInfoPlist(output), output, 'Info.plist synchronization should be byte-idempotent')

console.log('iOS native sync regression tests passed')
