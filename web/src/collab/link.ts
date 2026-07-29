import {
  DEFAULT_RELAY_URL,
  ENVELOPE_HEADER_LENGTH,
  ROOM_ID_BYTES,
  ROOM_KEY_BYTES,
  WRITE_TOKEN_BYTES,
} from '@oh-my-pi/pi-wire'
import type { ParsedCollabLink } from '@oh-my-pi/pi-wire'

export { COLLAB_PROTO, DEFAULT_RELAY_URL, ENVELOPE_HEADER_LENGTH, ROOM_ID_BYTES } from '@oh-my-pi/pi-wire'
export type { ParsedCollabLink }

const ROOM_PATH_RE = /^\/r\/([A-Za-z0-9_-]{10,64})(?:\.([A-Za-z0-9_-]+))?$/
const BARE_LINK_RE = /^([A-Za-z0-9_-]{10,64})[#.]([A-Za-z0-9_-]+)$/
const B64URL_RE = /^[A-Za-z0-9_-]+$/
const LOCAL_HOSTNAMES: Record<string, true> = { localhost: true, '127.0.0.1': true, '::1': true, '[::1]': true }

const INVALID_LINK = 'Invalid collab link'
const INVALID_RELAY = 'Invalid collab relay'
const INSECURE_RELAY = 'Collab relay must use a secure WebSocket'
const MISSING_ROOM = 'Collab link must contain a valid room path'
const MISSING_KEY = 'Collab link is missing its room secret'
const INVALID_KEY = 'Collab link has an invalid room secret'

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeBase64Url(text: string): Uint8Array | null {
  if (!B64URL_RE.test(text)) return null
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.length % 4 === 0 ? base64 : base64 + '='.repeat(4 - (base64.length % 4))
  try {
    const binary = atob(padded)
    return Uint8Array.from(binary, character => character.charCodeAt(0))
  } catch {
    return null
  }
}

export function packEnvelope(peerId: number, payload: Uint8Array): Uint8Array {
  const envelope = new Uint8Array(ENVELOPE_HEADER_LENGTH + payload.byteLength)
  new DataView(envelope.buffer).setUint32(0, peerId, false)
  envelope.set(payload, ENVELOPE_HEADER_LENGTH)
  return envelope
}

export function unpackEnvelope(data: Uint8Array): { peerId: number; payload: Uint8Array } | null {
  if (data.byteLength < ENVELOPE_HEADER_LENGTH) return null
  const peerId = new DataView(data.buffer, data.byteOffset, ENVELOPE_HEADER_LENGTH).getUint32(0, false)
  return { peerId, payload: data.subarray(ENVELOPE_HEADER_LENGTH) }
}

export function rewriteEnvelopePeer(data: Uint8Array, peerId: number): void {
  new DataView(data.buffer, data.byteOffset, ENVELOPE_HEADER_LENGTH).setUint32(0, peerId, false)
}

export function generateRoomId(): string {
  const bytes = new Uint8Array(ROOM_ID_BYTES)
  crypto.getRandomValues(bytes)
  return encodeBase64Url(bytes)
}

function normalizeRelayOrigin(relayUrl: string): { origin: string } | { error: string } {
  let url: URL
  try {
    url = new URL(relayUrl)
  } catch {
    return { error: INVALID_RELAY }
  }

  let protocol: 'ws:' | 'wss:'
  if (url.protocol === 'wss:' || url.protocol === 'https:') protocol = 'wss:'
  else if (url.protocol === 'ws:' || url.protocol === 'http:') protocol = 'ws:'
  else return { error: INVALID_RELAY }

  if (protocol === 'ws:' && !LOCAL_HOSTNAMES[url.hostname]) return { error: INSECURE_RELAY }
  return { origin: `${protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}` }
}

export function parseCollabLink(link: string): ParsedCollabLink | { error: string } {
  let text = link.trim().replace(/%23/gi, '#')
  const bare = BARE_LINK_RE.exec(text)
  if (bare) text = `${DEFAULT_RELAY_URL}/r/${bare[1]}.${bare[2]}`
  else if (!text.includes('://')) text = `wss://${text}`

  let url: URL
  try {
    url = new URL(text)
  } catch {
    return { error: INVALID_LINK }
  }

  if ((url.protocol === 'http:' || url.protocol === 'https:') && url.hash) {
    const parsed = parseCollabLink(url.hash.slice(1))
    if (!('error' in parsed)) return parsed
  }

  const relay = normalizeRelayOrigin(url.origin)
  if ('error' in relay) return relay

  const match = ROOM_PATH_RE.exec(url.pathname)
  if (!match) {
    if (url.hash && url.protocol !== 'http:' && url.protocol !== 'https:') {
      return parseCollabLink(url.hash.slice(1))
    }
    return { error: MISSING_ROOM }
  }

  const roomId = match[1]
  const secretText = match[2] ?? url.hash.slice(1)
  if (!secretText) return { error: MISSING_KEY }

  const secret = decodeBase64Url(secretText)
  if (!secret || (secret.byteLength !== ROOM_KEY_BYTES && secret.byteLength !== ROOM_KEY_BYTES + WRITE_TOKEN_BYTES)) {
    return { error: INVALID_KEY }
  }

  return {
    wsUrl: `${relay.origin}/r/${roomId}`,
    roomId,
    key: secret.subarray(0, ROOM_KEY_BYTES),
    ...(secret.byteLength === ROOM_KEY_BYTES + WRITE_TOKEN_BYTES
      ? { writeToken: secret.subarray(ROOM_KEY_BYTES) }
      : {}),
  }
}
