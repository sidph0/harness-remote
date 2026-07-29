import assert from 'node:assert/strict'
import { importRoomKey, open, seal } from './codec.ts'
import { packEnvelope, parseCollabLink, unpackEnvelope } from './link.ts'

const ROOM = 'AbCdEf123456_-Xy'
const KEY = Uint8Array.from({ length: 32 }, (_, index) => index)
const TOKEN = Uint8Array.from({ length: 16 }, (_, index) => 0xf0 + index)
const KEY_TEXT = Buffer.from(KEY).toString('base64url')
const FULL_TEXT = Buffer.from([...KEY, ...TOKEN]).toString('base64url')
const DEFAULT_ROOM_URL = `wss://my.omp.sh/r/${ROOM}`

function parsed(link) {
  const result = parseCollabLink(link)
  assert.equal('error' in result, false, 'synthetic collab link should parse')
  return result
}

function assertLink(link, wsUrl, writeToken) {
  const result = parsed(link)
  assert.equal(result.wsUrl, wsUrl)
  assert.equal(result.roomId, ROOM)
  assert.deepEqual(result.key, KEY)
  assert.deepEqual(result.writeToken, writeToken)
}

function assertSanitizedRejection(link, secret) {
  const result = parseCollabLink(link)
  assert.equal('error' in result, true, 'invalid synthetic collab link should be rejected')
  assert.equal(typeof result.error, 'string')
  assert.equal(result.error.includes(secret), false, 'parser errors must not echo link secrets')
}

assertLink(`${ROOM}.${KEY_TEXT}`, DEFAULT_ROOM_URL, undefined)
assertLink(`${ROOM}.${FULL_TEXT}`, DEFAULT_ROOM_URL, TOKEN)
assertLink(`${ROOM}#${KEY_TEXT}`, DEFAULT_ROOM_URL, undefined)
assertLink(`${ROOM}%23${KEY_TEXT}`, DEFAULT_ROOM_URL, undefined)
assertLink(`https://viewer.example/collab/#${ROOM}.${KEY_TEXT}`, DEFAULT_ROOM_URL, undefined)
assertLink(`relay.example:8443/r/${ROOM}.${KEY_TEXT}`, `wss://relay.example:8443/r/${ROOM}`, undefined)
assertLink(`wss://relay.example/r/${ROOM}.${KEY_TEXT}`, `wss://relay.example/r/${ROOM}`, undefined)

for (const [host, expectedHost] of [
  ['localhost', 'localhost'],
  ['127.0.0.1', '127.0.0.1'],
  ['[::1]', '[::1]']
]) {
  assertLink(`ws://${host}:7466/r/${ROOM}.${KEY_TEXT}`, `ws://${expectedHost}:7466/r/${ROOM}`, undefined)
}

for (const scheme of ['ws', 'http']) {
  assertSanitizedRejection(`${scheme}://relay.example/r/${ROOM}.${KEY_TEXT}`, KEY_TEXT)
}

const BAD_BASE64 = 'not+base64'
assertSanitizedRejection(`wss://relay.example/r/${ROOM}.${BAD_BASE64}`, BAD_BASE64)
for (const length of [16, 31, 33, 40, 47, 49]) {
  const wrongLengthSecret = Buffer.alloc(length, length).toString('base64url')
  assertSanitizedRejection(`${ROOM}.${wrongLengthSecret}`, wrongLengthSecret)
}
assertSanitizedRejection(`wss://relay.example/r/short.${KEY_TEXT}`, KEY_TEXT)

const payload = Uint8Array.of(9, 8, 7)
const envelope = packEnvelope(0x01020304, payload)
assert.deepEqual(envelope, Uint8Array.of(1, 2, 3, 4, 9, 8, 7), 'peer id must be encoded as four-byte big-endian')
assert.deepEqual(unpackEnvelope(envelope), { peerId: 0x01020304, payload })
for (const length of [0, 1, 2, 3]) assert.equal(unpackEnvelope(new Uint8Array(length)), null)

const VECTOR_KEY = 'AAcOFRwjKjE4P0ZNVFtiaXB3foWMk5qhqK-2vcTL0tk'
const VECTOR_SEALED = 'm0PA1QNfpOGtl_iq1yfKhoux0moFN_WQtCExumBVOWKeHFY_yx7T4s3B5YFUSn6Dc9aAyVsjIjPQXLxqsg8_UQiZ9Q'
const vectorKey = await importRoomKey(new Uint8Array(Buffer.from(VECTOR_KEY, 'base64url')))
assert.deepEqual(
  await open(vectorKey, new Uint8Array(Buffer.from(VECTOR_SEALED, 'base64url'))),
  { t: 'hello', proto: 1, name: 'vector' },
  'published coding-agent AES vector must decrypt exactly'
)

await assert.rejects(() => importRoomKey(new Uint8Array(31)))
await assert.rejects(() => importRoomKey(new Uint8Array(33)))

const roomKey = await importRoomKey(KEY)
const frame = { t: 'hello', proto: 3, name: 'round-trip' }
const sealed = await seal(roomKey, frame)
assert.equal(sealed.byteLength, 12 + new TextEncoder().encode(JSON.stringify(frame)).byteLength + 16)
assert.deepEqual(await open(roomKey, sealed), frame)

const tampered = sealed.slice()
tampered[tampered.length - 1] ^= 0xff
await assert.rejects(() => open(roomKey, tampered))
await assert.rejects(() => open(roomKey, new Uint8Array(12)))

const wrongKey = await importRoomKey(Uint8Array.from({ length: 32 }, (_, index) => 255 - index))
await assert.rejects(() => open(wrongKey, sealed))
