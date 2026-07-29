import { ROOM_KEY_BYTES } from '@oh-my-pi/pi-wire'
import type { WireFrame } from '@oh-my-pi/pi-wire'

const AES_ALGORITHM = 'AES-GCM'
const IV_LENGTH = 12
const TEXT_ENCODER = new TextEncoder()
const TEXT_DECODER = new TextDecoder()

export function generateRoomKey(): Uint8Array {
  const key = new Uint8Array(ROOM_KEY_BYTES)
  crypto.getRandomValues(key)
  return key
}

export function importRoomKey(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.byteLength !== ROOM_KEY_BYTES) return Promise.reject(new Error('Invalid room key'))
  return crypto.subtle.importKey('raw', strictBytes(raw), AES_ALGORITHM, false, ['encrypt', 'decrypt'])
}

export async function seal(key: CryptoKey, frame: WireFrame): Promise<Uint8Array> {
  try {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
    const plaintext = TEXT_ENCODER.encode(JSON.stringify(frame))
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: AES_ALGORITHM, iv }, key, plaintext))
    const sealed = new Uint8Array(iv.byteLength + ciphertext.byteLength)
    sealed.set(iv)
    sealed.set(ciphertext, iv.byteLength)
    return sealed
  } catch {
    throw new Error('Unable to seal collab frame')
  }
}

export async function open(key: CryptoKey, sealed: Uint8Array): Promise<WireFrame> {
  try {
    if (sealed.byteLength <= IV_LENGTH) throw new Error()
    const iv = strictBytes(sealed.subarray(0, IV_LENGTH))
    const ciphertext = strictBytes(sealed.subarray(IV_LENGTH))
    const plaintext = await crypto.subtle.decrypt({ name: AES_ALGORITHM, iv }, key, ciphertext)
    return JSON.parse(TEXT_DECODER.decode(plaintext)) as WireFrame
  } catch {
    throw new Error('Unable to open collab frame')
  }
}

function strictBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes
  }
  return bytes.slice()
}
