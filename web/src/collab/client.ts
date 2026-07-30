import { COLLAB_PROTO } from "@oh-my-pi/pi-wire"
import type {
  AgentEvent,
  AgentSnapshot,
  CollabUiRequest,
  GuestFrame,
  HostFrame,
  ParsedCollabLink,
  RelayControlMessage,
  SessionEntry,
  SessionHeader,
  SessionState,
  SubagentLifecyclePayload,
  SubagentProgressPayload,
} from "@oh-my-pi/pi-wire"
import type { ActiveCollabTool, CollabNotice, CollabSnapshot, CompletedCollabTool } from "../types"
import { encodeBase64Url, parseCollabLink } from "./link"
import { CollabSocket } from "./socket"

const HANDSHAKE_TIMEOUT_MS = 30_000
const SNAPSHOT_TIMEOUT_MS = 30_000
const MAX_NOTICES = 50
const MAX_COMPLETED_TOOLS = 256

type Timer = number
type Timers = {
  setTimeout(callback: () => void, delay: number): number
  clearTimeout(timer: number): void
  readonly now?: number
}
type SocketLike = {
  onOpen?: () => void
  onFrame?: (frame: HostFrame, peerId: number) => void
  onControl?: (control: RelayControlMessage) => void
  onClose?: (reason: string, willReconnect: boolean) => void
  connect(): void
  send(frame: GuestFrame): void | Promise<void>
  close(): void
}

export type CollabClientOptions = {
  socketFactory?: (parsed: ParsedCollabLink) => SocketLike
  timers?: Timers
}

type RecordValue = Record<string, unknown>
const object = (value: unknown): value is RecordValue => value !== null && typeof value === "object" && !Array.isArray(value)
const string = (value: unknown): value is string => typeof value === "string"
const boolean = (value: unknown): value is boolean => typeof value === "boolean"
const integer = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0
const optionalString = (value: unknown): boolean => value === undefined || string(value)
const optionalBoolean = (value: unknown): boolean => value === undefined || boolean(value)

function validHeader(value: unknown): value is SessionHeader {
  return object(value) && value.type === "session" && string(value.id) && string(value.timestamp) && string(value.cwd) && optionalString(value.title)
}

function validState(value: unknown): value is SessionState {
  if (!object(value) || !boolean(value.isStreaming) || !integer(value.queuedMessageCount) || !string(value.cwd) || !Array.isArray(value.participants)) return false
  if (!value.participants.every((participant) => object(participant) && string(participant.name) && (participant.role === "host" || participant.role === "guest") && optionalBoolean(participant.readOnly))) return false
  if (!optionalString(value.sessionName) || !optionalString(value.thinkingLevel) || !optionalBoolean(value.isAborting)) return false
  if (value.model !== undefined && (!object(value.model) || !string(value.model.id) || !string(value.model.name) || !string(value.model.provider) || !(value.model.contextWindow === null || (typeof value.model.contextWindow === "number" && Number.isFinite(value.model.contextWindow))))) return false
  if (value.contextUsage !== undefined) {
    if (!object(value.contextUsage)) return false
    for (const field of ["tokens", "contextWindow", "percent"] as const) {
      const item = value.contextUsage[field]
      if (!(item === null || (typeof item === "number" && Number.isFinite(item)))) return false
    }
  }
  return true
}

function validAgent(value: unknown): value is AgentSnapshot {
  return object(value) && string(value.id) && string(value.displayName) && (value.kind === "main" || value.kind === "sub") && optionalString(value.parentId) &&
    (value.status === "running" || value.status === "idle" || value.status === "parked" || value.status === "aborted") && boolean(value.hasSessionFile) &&
    typeof value.createdAt === "number" && Number.isFinite(value.createdAt) && typeof value.lastActivity === "number" && Number.isFinite(value.lastActivity)
}

function validMessage(value: unknown): boolean {
  if (!object(value) || !string(value.role) || typeof value.timestamp !== "number") return false
  if (value.role === "user" || value.role === "developer") return string(value.content) || Array.isArray(value.content)
  if (value.role === "assistant") return Array.isArray(value.content) && string(value.model) && object(value.usage) && string(value.stopReason)
  return value.role === "toolResult" && string(value.toolCallId) && string(value.toolName) && Array.isArray(value.content) && boolean(value.isError)
}

type EntryClassification = "valid" | "invalid" | "unknown"

function classifyEntry(value: unknown): EntryClassification {
  if (!object(value) || !string(value.type)) return "invalid"
  let variantValid: boolean
  switch (value.type) {
    case "message": variantValid = validMessage(value.message); break
    case "custom_message": variantValid = string(value.customType) && (string(value.content) || Array.isArray(value.content)) && boolean(value.display); break
    case "compaction": variantValid = string(value.summary) && string(value.firstKeptEntryId) && typeof value.tokensBefore === "number"; break
    case "branch_summary": variantValid = string(value.fromId) && string(value.summary); break
    case "model_change": variantValid = string(value.model) && optionalString(value.role); break
    case "thinking_level_change": variantValid = value.thinkingLevel === null || optionalString(value.thinkingLevel); break
    default: return "unknown"
  }
  return string(value.id) && string(value.timestamp) && (value.parentId === null || string(value.parentId)) && variantValid ? "valid" : "invalid"
}

function validEntry(value: unknown): value is SessionEntry {
  return classifyEntry(value) === "valid"
}

function validToolBase(event: RecordValue): boolean {
  return string(event.toolCallId) && string(event.toolName)
}

function validEvent(value: unknown): value is AgentEvent {
  if (!object(value) || !string(value.type)) return false
  switch (value.type) {
    case "agent_start": case "agent_end": case "turn_start": case "turn_end": return true
    case "message_start": case "message_update": case "message_end": return validMessage(value.message)
    case "tool_execution_start": return validToolBase(value) && optionalString(value.intent) && "args" in value
    case "tool_execution_update": return validToolBase(value) && "args" in value && "partialResult" in value
    case "tool_execution_end": return validToolBase(value) && "result" in value && optionalBoolean(value.isError)
    case "notice": return (value.level === "info" || value.level === "warning" || value.level === "error") && string(value.message) && optionalString(value.source)
    case "auto_compaction_start": return string(value.reason) && string(value.action)
    case "auto_compaction_end": return boolean(value.aborted) && boolean(value.willRetry) && optionalString(value.errorMessage) && optionalBoolean(value.skipped)
    case "auto_retry_start": return integer(value.attempt) && integer(value.maxAttempts) && integer(value.delayMs) && string(value.errorMessage)
    case "auto_retry_end": return boolean(value.success) && integer(value.attempt) && optionalString(value.finalError)
    case "thinking_level_changed": return optionalString(value.thinkingLevel)
    default: return false
  }
}

function validProgress(value: unknown): value is SubagentProgressPayload {
  if (!object(value) || !integer(value.index) || !string(value.agent) || !string(value.task) || !object(value.progress)) return false
  const progress = value.progress
  return integer(progress.index) && string(progress.id) && string(progress.agent) &&
    (progress.status === "pending" || progress.status === "running" || progress.status === "completed" || progress.status === "failed" || progress.status === "aborted") &&
    string(progress.task) && Array.isArray(progress.recentTools) && Array.isArray(progress.recentOutput) && integer(progress.toolCount) && integer(progress.requests) &&
    typeof progress.tokens === "number" && typeof progress.cost === "number" && typeof progress.durationMs === "number"
}

function validLifecycle(value: unknown): value is SubagentLifecyclePayload {
  return object(value) && string(value.id) && string(value.agent) && integer(value.index) &&
    (value.status === "started" || value.status === "completed" || value.status === "failed" || value.status === "aborted") && optionalString(value.description) && optionalString(value.sessionFile) && optionalString(value.parentToolCallId)
}

function validUiRequest(value: unknown): value is CollabUiRequest {
  if (!object(value) || !integer(value.reqId) || !string(value.title)) return false
  if (value.kind === "editor") return optionalString(value.prefill)
  if (value.kind !== "select" || !Array.isArray(value.options)) return false
  if (!value.options.every((option) => string(option) || (object(option) && string(option.label) && optionalString(option.description)))) return false
  return (value.initialIndex === undefined || integer(value.initialIndex)) &&
    (value.selectionMarker === undefined || value.selectionMarker === "radio" || value.selectionMarker === "checkbox") &&
    (value.checkedIndices === undefined || (Array.isArray(value.checkedIndices) && value.checkedIndices.every(integer))) &&
    (value.markableCount === undefined || integer(value.markableCount)) && optionalString(value.helpText)
}

const frozenArray = <T>(items: T[]): readonly T[] => Object.freeze(items)

export class CollabClient {
  readonly #socket: SocketLike
  readonly #name: string
  readonly #writeToken?: string
  readonly #timers: Timers
  readonly #listeners = new Set<() => void>()
  readonly #sensitive: string[]
  #phase: CollabSnapshot["phase"] = "connecting"
  #endedReason: string | null = null
  #header: SessionHeader | null = null
  #entries: readonly SessionEntry[] = frozenArray([])
  #state: SessionState | null = null
  #agents: readonly AgentSnapshot[] = frozenArray([])
  #stream: CollabSnapshot["stream"] = null
  #streamDone = false
  #working = false
  #readOnly: boolean
  #notices: readonly CollabNotice[] = frozenArray([])
  #activeTools: ReadonlyMap<string, ActiveCollabTool> = new Map()
  #completedTools = new Map<string, CompletedCollabTool>()
  #progress: ReadonlyMap<string, SubagentProgressPayload> = new Map()
  #lifecycle: ReadonlyMap<string, SubagentLifecyclePayload> = new Map()
  #uiRequest: CollabUiRequest | null = null
  #uiQueue: CollabUiRequest[] = []
  #snapshotExpected: number | null = null
  #snapshotReceived = 0
  #opened = false
  #welcomeTimer: Timer | null = null
  #snapshotTimer: Timer | null = null
  #noticeId = 0
  #snapshot: CollabSnapshot

  constructor(link: string, displayName: string, options: CollabClientOptions = {}) {
    const parsed = parseCollabLink(link)
    if ("error" in parsed) throw new Error(parsed.error)
    this.#name = displayName
    this.#writeToken = parsed.writeToken ? encodeBase64Url(parsed.writeToken) : undefined
    this.#readOnly = !parsed.writeToken
    this.#timers = options.timers ?? globalThis
    this.#sensitive = [link.trim(), encodeBase64Url(parsed.key), this.#writeToken].filter((value): value is string => Boolean(value))
    this.#socket = options.socketFactory?.(parsed) ?? new CollabSocket(parsed)
    this.#socket.onOpen = () => this.#handleOpen()
    this.#socket.onFrame = (frame) => this.#applyFrame(frame)
    this.#socket.onControl = (control) => { if (control.t === "room-closed") this.#end("room closed") }
    this.#socket.onClose = (reason, reconnect) => this.#handleClose(reason, reconnect)
    this.#snapshot = this.#buildSnapshot()
  }

  connect(): void {
    if (this.#phase === "ended") {
      if (this.#endedReason !== "closed") return
      this.#phase = this.#opened ? "reconnecting" : "connecting"
      this.#endedReason = null
      this.#commit()
    }
    this.#socket.connect()
  }

  close(): void {
    this.#clearTimers()
    this.#snapshotReceived = 0
    this.#socket.close()
    if (this.#phase !== "ended") {
      this.#phase = "ended"
      this.#endedReason = "closed"
      this.#commit()
    }
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  getSnapshot(): CollabSnapshot { return this.#snapshot }

  sendPrompt(text: string): Promise<void> {
    this.#assertWritable()
    return Promise.resolve(this.#socket.send({ t: "prompt", text }))
  }

  sendAbort(): Promise<void> {
    this.#assertWritable()
    return Promise.resolve(this.#socket.send({ t: "abort" }))
  }

  sendUiResponse(reqId: number, value?: string): Promise<void> {
    this.#assertWritable()
    if (this.#uiRequest?.reqId === reqId && this.#uiRequest.kind === "select" && this.#uiRequest.selectionMarker === "checkbox") throw new Error("checkbox selection is not supported")
    return Promise.resolve(this.#socket.send(value === undefined ? { t: "ui-response", reqId } : { t: "ui-response", reqId, value })).then(() => {
      if (this.#uiRequest?.reqId === reqId) {
        this.#advanceUiRequest()
        this.#commit()
      }
    })
  }

  #assertWritable(): void {
    if (this.#phase !== "live") throw new Error("collaboration session is not live")
    if (this.#readOnly) throw new Error("collaboration session is read-only")
  }

  #handleOpen(): void {
    this.#clearTimers()
    this.#snapshotExpected = null
    this.#phase = this.#opened ? "reconnecting" : "waiting"
    this.#opened = true
    void Promise.resolve(this.#socket.send(this.#writeToken === undefined
      ? { t: "hello", proto: COLLAB_PROTO, name: this.#name }
      : { t: "hello", proto: COLLAB_PROTO, name: this.#name, writeToken: this.#writeToken })).catch(() => {})
    this.#welcomeTimer = this.#timers.setTimeout(() => this.#end("timed out waiting for host welcome"), HANDSHAKE_TIMEOUT_MS)
    this.#commit()
  }

  #handleClose(reason: string, reconnect: boolean): void {
    this.#clearTimers()
    this.#snapshotExpected = null
    this.#snapshotReceived = 0
    if (this.#phase === "ended") return
    if (reconnect) {
      this.#phase = "reconnecting"
      this.#commit()
    } else this.#end(this.#sanitize(reason) || "connection closed")
  }

  #applyFrame(frame: unknown): void {
    if (!object(frame) || !string(frame.t) || this.#phase === "ended") return
    switch (frame.t) {
      case "welcome": this.#applyWelcome(frame); return
      case "snapshot-chunk": this.#applyChunk(frame); return
      case "entry":
        if (!validEntry(frame.entry) || this.#phase !== "live") return
        this.#entries = frozenArray([...this.#entries, frame.entry])
        if (this.#streamDone && frame.entry.type === "message" && frame.entry.message.role === "assistant") { this.#stream = null; this.#streamDone = false }
        break
      case "event": if (!validEvent(frame.event) || this.#phase !== "live") return; this.#applyEvent(frame.event); break
      case "state":
        if (!validState(frame.state) || this.#phase !== "live") return
        this.#state = frame.state
        this.#working = frame.state.isStreaming
        if (!frame.state.isStreaming) { this.#stream = null; this.#streamDone = false }
        break
      case "agents": if (!Array.isArray(frame.agents) || !frame.agents.every(validAgent) || this.#phase !== "live") return; this.#agents = frozenArray([...frame.agents]); break
      case "bus":
        if (this.#phase !== "live") return
        if (frame.channel === "task:subagent:progress" && validProgress(frame.data)) this.#progress = new Map(this.#progress).set(frame.data.progress.id, frame.data)
        else if (frame.channel === "task:subagent:lifecycle" && validLifecycle(frame.data)) this.#lifecycle = new Map(this.#lifecycle).set(frame.data.id, frame.data)
        else return
        break
      case "ui-request":
        if (!validUiRequest(frame.request) || this.#phase !== "live") return
        if (this.#uiRequest) this.#uiQueue = [...this.#uiQueue, frame.request]
        else this.#uiRequest = frame.request
        break
      case "ui-request-end":
        if (!integer(frame.reqId) || this.#phase !== "live") return
        if (this.#uiRequest?.reqId === frame.reqId) this.#advanceUiRequest()
        else this.#uiQueue = this.#uiQueue.filter((request) => request.reqId !== frame.reqId)
        break
      case "bye": if (!string(frame.reason)) return; this.#end(this.#sanitize(frame.reason) || "host ended the session"); return
      case "error":
        if (!string(frame.message)) return
        if (this.#snapshotExpected === null && this.#phase !== "live") { this.#end(this.#sanitize(frame.message) || "host rejected the connection"); return }
        this.#pushNotice("error", this.#sanitize(frame.message) || "host reported an error")
        break
      default: return
    }
    this.#commit()
  }

  #applyWelcome(frame: RecordValue): void {
    if (frame.proto !== COLLAB_PROTO || !validHeader(frame.header) || !validState(frame.state) || !Array.isArray(frame.agents) || !frame.agents.every(validAgent) || !integer(frame.entryCount) || !optionalBoolean(frame.readOnly)) {
      this.#end(frame.proto !== COLLAB_PROTO ? "incompatible collaboration protocol" : "invalid host welcome")
      return
    }
    this.#clearTimers()
    this.#header = frame.header
    this.#entries = frozenArray([])
    this.#state = frame.state
    this.#agents = frozenArray([...frame.agents])
    this.#stream = null
    this.#streamDone = false
    this.#activeTools = new Map()
    this.#completedTools = new Map()
    this.#progress = new Map()
    this.#lifecycle = new Map()
    this.#working = frame.state.isStreaming
    this.#readOnly = this.#writeToken === undefined || frame.readOnly === true
    this.#uiRequest = null
    this.#uiQueue = []
    this.#snapshotExpected = frame.entryCount
    this.#snapshotReceived = 0
    this.#endedReason = null
    this.#armSnapshotTimer()
    this.#commit()
  }

  #applyChunk(frame: RecordValue): void {
    if (this.#snapshotExpected === null || !Array.isArray(frame.entries) || !boolean(frame.final)) return
    const entries: SessionEntry[] = []
    for (const entry of frame.entries) {
      const classification = classifyEntry(entry)
      if (classification === "invalid") return
      if (classification === "valid") entries.push(entry as SessionEntry)
    }
    const received = this.#snapshotReceived + frame.entries.length
    if (received > this.#snapshotExpected || (frame.final && received !== this.#snapshotExpected)) {
      this.#end("host snapshot entry count mismatch")
      return
    }
    this.#snapshotReceived = received
    this.#entries = frozenArray([...this.#entries, ...entries])
    this.#clearSnapshotTimer()
    if (frame.final) {
      this.#phase = "live"
      this.#snapshotExpected = null
    } else this.#armSnapshotTimer()
    this.#commit()
  }

  #applyEvent(event: AgentEvent): void {
    switch (event.type) {
      case "message_start": case "message_update":
        if (event.message.role === "assistant") { this.#stream = event.message; this.#streamDone = false }
        break
      case "message_end":
        if (event.message.role === "assistant") { this.#stream = event.message; this.#streamDone = true }
        break
      case "tool_execution_start":
        this.#activeTools = new Map(this.#activeTools).set(event.toolCallId, { toolCallId: event.toolCallId, toolName: event.toolName, args: event.args, intent: event.intent, startedAt: this.#timers.now ?? Date.now() })
        break
      case "tool_execution_update": {
        const current = this.#activeTools.get(event.toolCallId)
        this.#activeTools = new Map(this.#activeTools).set(event.toolCallId, current ? { ...current, args: event.args, partialResult: event.partialResult } : { toolCallId: event.toolCallId, toolName: event.toolName, args: event.args, partialResult: event.partialResult, startedAt: this.#timers.now ?? Date.now() })
        break
      }
      case "tool_execution_end": {
        const completedAt = this.#timers.now ?? Date.now()
        const active = this.#activeTools.get(event.toolCallId)
        const completed: CompletedCollabTool = {
          ...(active ?? { toolCallId: event.toolCallId, toolName: event.toolName, args: {}, startedAt: completedAt }),
          result: event.result,
          isError: event.isError ?? false,
          completedAt,
        }
        const completedTools = new Map(this.#completedTools)
        completedTools.delete(event.toolCallId)
        completedTools.set(event.toolCallId, completed)
        if (completedTools.size > MAX_COMPLETED_TOOLS) completedTools.delete(completedTools.keys().next().value!)
        this.#completedTools = completedTools
        const activeTools = new Map(this.#activeTools)
        activeTools.delete(event.toolCallId)
        this.#activeTools = activeTools
        break
      }
      case "agent_start": this.#working = true; break
      case "agent_end": this.#working = false; break
      case "notice": this.#pushNotice(event.level, event.message); break
      case "auto_retry_start": this.#pushNotice("info", `retry ${event.attempt}/${event.maxAttempts}: ${event.errorMessage}`); break
      case "auto_compaction_start": this.#pushNotice("info", `compacting context (${event.reason})`); break
      case "auto_compaction_end": if (!event.skipped) this.#pushNotice("info", event.aborted ? "compaction aborted" : event.errorMessage ? `compaction failed: ${event.errorMessage}` : "context compacted"); break
      default: break
    }
  }

  #pushNotice(level: CollabNotice["level"], message: string): void {
    const next = [...this.#notices, Object.freeze({ id: ++this.#noticeId, level, message: this.#sanitize(message), at: Date.now() })]
    this.#notices = frozenArray(next.slice(-MAX_NOTICES))
  }

  #advanceUiRequest(): void {
    const [next, ...rest] = this.#uiQueue
    this.#uiRequest = next ?? null
    this.#uiQueue = rest
  }

  #armSnapshotTimer(): void {
    this.#clearSnapshotTimer()
    this.#snapshotTimer = this.#timers.setTimeout(() => this.#end("timed out waiting for host snapshot"), SNAPSHOT_TIMEOUT_MS)
  }

  #clearSnapshotTimer(): void {
    if (this.#snapshotTimer !== null) this.#timers.clearTimeout(this.#snapshotTimer)
    this.#snapshotTimer = null
  }

  #clearTimers(): void {
    if (this.#welcomeTimer !== null) this.#timers.clearTimeout(this.#welcomeTimer)
    this.#welcomeTimer = null
    this.#clearSnapshotTimer()
  }

  #sanitize(reason: string): string {
    let safe = reason
    for (const secret of this.#sensitive) safe = safe.split(secret).join("[redacted]")
    return safe.slice(0, 500)
  }

  #end(reason: string): void {
    if (this.#phase === "ended") return
    this.#clearTimers()
    this.#snapshotExpected = null
    this.#phase = "ended"
    this.#endedReason = this.#sanitize(reason) || "collaboration ended"
    this.#uiRequest = null
    this.#uiQueue = []
    this.#commit()
    this.#socket.close()
  }

  #buildSnapshot(): CollabSnapshot {
    return Object.freeze({ phase: this.#phase, header: this.#header, entries: this.#entries, state: this.#state, agents: this.#agents, stream: this.#stream, streamDone: this.#streamDone, working: this.#working, readOnly: this.#readOnly, notices: this.#notices, endedReason: this.#endedReason, activeTools: this.#activeTools, completedTools: new Map(this.#completedTools), progress: this.#progress, lifecycle: this.#lifecycle, uiRequest: this.#uiRequest })
  }

  #commit(): void {
    this.#snapshot = this.#buildSnapshot()
    for (const listener of [...this.#listeners]) listener()
  }
}
