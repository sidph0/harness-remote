import type {
  GuestFrame,
  HostFrame,
  ParsedCollabLink,
  RelayControlMessage,
} from "@oh-my-pi/pi-wire"
import { importRoomKey, open, seal } from "./codec"
import { encodeBase64Url, packEnvelope, unpackEnvelope } from "./link"

const FATAL_CLOSE_REASONS: Readonly<Record<number, string>> = {
  4001: "room closed",
  4004: "no such room",
  4009: "host conflict",
  4029: "room full",
}
const SOCKET_OPEN = 1
const BACKOFF_MAX_MS = 30_000

type TimerHandle = number

export interface CollabSocketTimers {
  setTimeout(callback: () => void, delay: number): TimerHandle
  clearTimeout(handle: TimerHandle): void
}

export interface RawWebSocket {
  readyState: number
  binaryType: string
  onopen: ((event: unknown) => void) | null | undefined
  onmessage: ((event: { data: unknown }) => void) | null | undefined
  onerror: ((event: unknown) => void) | null | undefined
  onclose: ((event: { code: number; reason: string }) => void) | null | undefined
  send(data: ArrayBufferView | ArrayBuffer): void
  close(code?: number, reason?: string): void
}

export interface CollabSocketDependencies {
  webSocketFactory?: (url: string) => RawWebSocket
  timers?: CollabSocketTimers
  random?: () => number
}

export class CollabSocket {
  onOpen?: () => void
  onFrame?: (frame: HostFrame, peerId: number) => void
  onControl?: (control: RelayControlMessage) => void
  onClose?: (reason: string, willReconnect: boolean) => void

  readonly #parsed: ParsedCollabLink
  readonly #webSocketFactory: (url: string) => RawWebSocket
  readonly #timers: CollabSocketTimers
  readonly #random: () => number
  readonly #secretStrings: readonly string[]
  #key?: Promise<CryptoKey>
  #socket: RawWebSocket | null = null
  #retryTimer?: TimerHandle
  #attempt = 0
  #closed = true
  #sendChain: Promise<void> = Promise.resolve()
  #receiveChain: Promise<void> = Promise.resolve()

  constructor(parsed: ParsedCollabLink, dependencies: CollabSocketDependencies = {}) {
    this.#parsed = {
      wsUrl: parsed.wsUrl,
      roomId: parsed.roomId,
      key: parsed.key.slice(),
    }
    this.#webSocketFactory = dependencies.webSocketFactory
      ?? ((url) => new globalThis.WebSocket(url) as unknown as RawWebSocket)
    this.#timers = dependencies.timers ?? {
      setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
      clearTimeout: (handle) => globalThis.clearTimeout(handle),
    }
    this.#random = dependencies.random ?? Math.random
    this.#secretStrings = [parsed.key, parsed.writeToken]
      .filter((value): value is Uint8Array => value !== undefined)
      .map(encodeBase64Url)
  }

  get isOpen(): boolean {
    return this.#socket?.readyState === SOCKET_OPEN
  }

  connect(): void {
    if (this.#socket || this.#retryTimer !== undefined) return
    this.#closed = false
    this.#attempt = 0
    this.#openSocket()
  }

  send(frame: GuestFrame): Promise<void> {
    const socket = this.#socket
    if (this.#closed || !socket || socket.readyState !== SOCKET_OPEN) {
      throw new Error("Collab socket is not open")
    }

    const delivery = this.#sendChain.then(async () => {
      let sealed: Uint8Array
      try {
        sealed = await seal(await this.#roomKey(), frame)
      } catch {
        try {
          if (!this.#closed && this.#socket === socket) this.#failFatal("Unable to encrypt collab frame")
        } finally {
          throw new Error("Unable to deliver collab frame")
        }
      }
      if (this.#closed || this.#socket !== socket || socket.readyState !== SOCKET_OPEN) {
        throw new Error("Unable to deliver collab frame")
      }
      try {
        socket.send(packEnvelope(0, sealed))
      } catch {
        throw new Error("Unable to deliver collab frame")
      }
    })
    this.#sendChain = delivery.catch(() => undefined)
    return delivery
  }

  close(): void {
    const active = !this.#closed && (this.#socket !== null || this.#retryTimer !== undefined)
    this.#closed = true
    this.#clearRetry()
    const socket = this.#socket
    this.#socket = null
    if (socket) {
      try {
        socket.close(1000, "closed")
      } catch {
        // The transport is already closed.
      }
    }
    if (active) this.onClose?.("closed", false)
  }

  #roomKey(): Promise<CryptoKey> {
    return this.#key ??= importRoomKey(this.#parsed.key)
  }

  #openSocket(): void {
    let socket: RawWebSocket
    try {
      socket = this.#webSocketFactory(`${this.#parsed.wsUrl}?role=guest`)
    } catch {
      this.onClose?.("Unable to connect to relay", true)
      this.#scheduleRetry()
      return
    }

    socket.binaryType = "arraybuffer"
    this.#socket = socket
    socket.onopen = () => {
      if (this.#closed || this.#socket !== socket) return
      this.#attempt = 0
      this.onOpen?.()
    }
    socket.onmessage = (event) => {
      if (!this.#closed && this.#socket === socket) this.#handleMessage(socket, event.data)
    }
    socket.onerror = () => undefined
    socket.onclose = (event) => {
      this.#receiveChain = this.#receiveChain.then(() => {
        if (this.#socket !== socket) return
        this.#socket = null
        this.#handleClose(event.code, event.reason)
      }).catch(() => {
        // An application callback must not break receive ordering.
      })
    }
  }

  #handleMessage(socket: RawWebSocket, data: unknown): void {
    if (typeof data === "string") {
      const control = parseControl(data)
      if (!control) return
      this.#receiveChain = this.#receiveChain.then(() => {
        if (this.#closed || this.#socket !== socket) return
        if (control.t === "room-closed") {
          try {
            this.onControl?.(control)
          } finally {
            this.#failFatal("room closed")
          }
        } else this.onControl?.(control)
      }).catch(() => {
        // An application callback must not break receive ordering.
      })
      return
    }

    const bytes = data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : data instanceof Uint8Array
        ? data
        : null
    if (!bytes) return
    const envelope = unpackEnvelope(bytes)
    if (!envelope) return

    this.#receiveChain = this.#receiveChain.then(async () => {
      if (this.#closed || this.#socket !== socket) return
      let frame: HostFrame
      try {
        frame = await open(await this.#roomKey(), envelope.payload) as HostFrame
      } catch {
        this.#failFatal("Authentication or decryption failed")
        return
      }
      if (!this.#closed && this.#socket === socket) this.onFrame?.(frame, envelope.peerId)
    }).catch(() => {
      // An application callback must not break receive ordering.
    })
  }

  #handleClose(code: number, reason: string): void {
    if (this.#closed) return
    const fatalReason = FATAL_CLOSE_REASONS[code]
    if (fatalReason) {
      this.#closed = true
      this.#clearRetry()
      this.onClose?.(fatalReason, false)
      return
    }
    this.onClose?.(this.#safeReason(reason), true)
    this.#scheduleRetry()
  }

  #failFatal(reason: string): void {
    if (this.#closed) return
    this.#closed = true
    this.#clearRetry()
    const socket = this.#socket
    this.#socket = null
    if (socket) {
      try {
        socket.close(1000, "closed")
      } catch {
        // The transport is already closed.
      }
    }
    this.onClose?.(reason, false)
  }

  #scheduleRetry(): void {
    if (this.#closed || this.#retryTimer !== undefined) return
    const base = Math.min(1_000 * 2 ** this.#attempt, BACKOFF_MAX_MS)
    this.#attempt++
    const delay = base * (0.75 + Math.min(1, Math.max(0, this.#random())) * 0.5)
    this.#retryTimer = this.#timers.setTimeout(() => {
      this.#retryTimer = undefined
      if (!this.#closed) this.#openSocket()
    }, delay)
  }

  #clearRetry(): void {
    if (this.#retryTimer === undefined) return
    this.#timers.clearTimeout(this.#retryTimer)
    this.#retryTimer = undefined
  }

  #safeReason(reason: string): string {
    const normalized = reason.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 256)
    if (!normalized) return "connection lost"
    if (normalized.includes(this.#parsed.roomId) || this.#secretStrings.some((secret) => normalized.includes(secret))) {
      return "connection lost"
    }
    return normalized
  }
}

function parseControl(text: string): RelayControlMessage | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!value || typeof value !== "object") return null
  const control = value as Record<string, unknown>
  if (control.t === "room-closed") return { t: "room-closed" }
  if ((control.t === "peer-joined" || control.t === "peer-left")
    && Number.isInteger(control.peer) && (control.peer as number) >= 0) {
    return { t: control.t, peer: control.peer as number }
  }
  return null
}

