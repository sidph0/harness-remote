import type { MessageEnvelope, MessagePart, Session, SessionStatus } from "../types"

type Message = { role?: unknown, content?: unknown, timestamp?: unknown, toolCallId?: unknown, toolName?: unknown, isError?: unknown }
type Entry = { type?: unknown, id?: unknown, timestamp?: unknown, customType?: unknown, content?: unknown, details?: unknown, display?: unknown, message?: Message }
type Header = { id: string, title?: string, timestamp: string, cwd: string }
type Agent = { id: string, displayName: string, kind: string, parentId?: string, status: string, hasSessionFile: boolean, createdAt: number, lastActivity: number }
type ActiveTool = { toolCallId: string, toolName: string, args: unknown, intent?: string, partialResult?: unknown, startedAt: number }
type CompletedTool = ActiveTool & { result: unknown, isError: boolean, completedAt: number }
type UiRequest = { reqId: number, kind: string, title: string, options?: readonly unknown[], initialIndex?: number, helpText?: string, selectionMarker?: string, prefill?: string }
type Snapshot = {
  readonly header: Header | null
  readonly entries: readonly Entry[]
  readonly state: { isStreaming?: boolean, isAborting?: boolean, sessionName?: string } | null
  readonly agents: readonly Agent[]
  readonly progress: ReadonlyMap<string, { progress?: unknown }>
  readonly lifecycle: ReadonlyMap<string, unknown>
  readonly stream: Message | null
  readonly streamDone: boolean
  readonly streamSequence: number
  readonly activeTools: ReadonlyMap<string, ActiveTool>
  readonly completedTools: ReadonlyMap<string, CompletedTool>
  readonly toolSequences: ReadonlyMap<string, number>
  readonly working: boolean
  readonly uiRequest: UiRequest | null
}
type Callbacks = { sendUiResponse(reqId: number, value?: string): Promise<void> }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function timestamp(value: unknown, fallback?: unknown): number {
  if (typeof value === "number") return value
  const parsed = typeof value === "string" ? Date.parse(value) : NaN
  if (Number.isFinite(parsed)) return parsed
  return typeof fallback === "string" ? Date.parse(fallback) : 0
}

function text(value: unknown): string {
  if (typeof value === "string") return value
  if (Array.isArray(value)) return value
    .flatMap(part => isRecord(part) && part.type === "text" && typeof part.text === "string" ? [part.text] : [])
    .join("\n")
  if (value === undefined) return ""
  return typeof value === "object" ? JSON.stringify(value) ?? "" : String(value)
}

function messageParts(
  id: string,
  message: Message,
  created: number,
  results: ReadonlyMap<string, { message: Message, completed: number }>,
  activeTools: ReadonlyMap<string, ActiveTool>,
  completedTools: ReadonlyMap<string, CompletedTool>,
  seenTools?: Set<string>
): MessagePart[] {
  const content: unknown[] = typeof message.content === "string"
    ? [{ type: "text", text: message.content }]
    : Array.isArray(message.content) ? message.content : []

  return content.flatMap((part, index): MessagePart[] => {
    if (!isRecord(part)) return []
    if (part.type === "text" && typeof part.text === "string") {
      return [{ id: `${id}:text:${index}`, messageID: id, type: "text", text: part.text }]
    }
    if (part.type === "thinking" && typeof part.thinking === "string") {
      return [{ id: `${id}:reasoning:${index}`, messageID: id, type: "reasoning", text: part.thinking }]
    }
    if (part.type !== "toolCall" || typeof part.id !== "string" || typeof part.name !== "string") return []

    seenTools?.add(part.id)
    const result = results.get(part.id)
    const completed = completedTools.get(part.id)
    const active = activeTools.get(part.id)
    const event = completed ?? active
    const input = event ? event.args : part.arguments
    const output = result
      ? text(result.message.content)
      : completed
        ? text(completed.result)
        : active?.partialResult === undefined ? undefined : text(active.partialResult)
    const isError = result ? Boolean(result.message.isError) : Boolean(completed?.isError)
    const state = {
      status: isError ? "error" : result || completed ? "completed" : "running",
      ...(input === undefined ? {} : { input: isRecord(input) ? input : { value: input } }),
      ...(output === undefined ? {} : { output }),
      ...(isError ? { error: output ?? "" } : {}),
      ...(event?.intent ? { metadata: { intent: event.intent } } : {}),
      time: {
        start: event?.startedAt ?? created,
        ...(result ? { end: result.completed } : completed ? { end: completed.completedAt } : {})
      }
    }
    return [{ id: `${id}:tool:${part.id}`, messageID: id, type: "tool", tool: part.name, callID: part.id, state }]
  })
}

function uiRequest(request: UiRequest | null, callbacks?: Callbacks) {
  if (!request) return null
  if (request.kind === "select" && request.selectionMarker === "checkbox") {
    return { id: request.reqId, kind: "select" as const, title: request.title, supported: false as const, reason: "checkbox selection is not supported" }
  }
  if (request.kind === "select") {
    const options = (request.options ?? []).map(option => {
      if (typeof option === "string") return { label: option, description: "" }
      if (!isRecord(option)) return { label: "", description: "" }
      return {
        label: typeof option.label === "string" ? option.label : "",
        description: typeof option.description === "string" ? option.description : ""
      }
    })
    const initialValue = request.initialIndex === undefined ? undefined : options[request.initialIndex]?.label
    return {
      id: request.reqId,
      kind: "select" as const,
      title: request.title,
      supported: true as const,
      options,
      ...(initialValue === undefined ? {} : { initialValue }),
      ...(request.helpText === undefined ? {} : { helpText: request.helpText }),
      submit: (value: string): Promise<void> => Promise.resolve(callbacks?.sendUiResponse(request.reqId, value)),
      cancel: (): Promise<void> => Promise.resolve(callbacks?.sendUiResponse(request.reqId))
    }
  }
  if (request.kind === "editor") {
    return {
      id: request.reqId,
      kind: "editor" as const,
      title: request.title,
      supported: true as const,
      ...(request.prefill === undefined ? {} : { prefill: request.prefill }),
      submit: (value: string): Promise<void> => Promise.resolve(callbacks?.sendUiResponse(request.reqId, value)),
      cancel: (): Promise<void> => Promise.resolve(callbacks?.sendUiResponse(request.reqId))
    }
  }
  return { id: request.reqId, kind: request.kind, title: request.title, supported: false as const, reason: "request type is not supported" }
}

export function adaptCollabSnapshot(snapshot: Snapshot, callbacks?: Callbacks) {
  const header = snapshot.header
  const session: Session | null = header ? {
    id: header.id,
    title: header.title ?? snapshot.state?.sessionName ?? header.id,
    directory: header.cwd,
    time: { created: timestamp(header.timestamp), updated: timestamp(header.timestamp) },
    external: true
  } : null
  const status: SessionStatus = snapshot.state?.isAborting
    ? { type: "aborting" }
    : snapshot.working || snapshot.state?.isStreaming
      ? { type: "busy" }
      : { type: "idle" }
  const sessionID = header?.id ?? ""
  const results = new Map<string, { message: Message, completed: number }>()

  for (const entry of snapshot.entries) {
    if (entry.type === "message" && entry.message?.role === "toolResult" && typeof entry.message.toolCallId === "string") {
      results.set(entry.message.toolCallId, { message: entry.message, completed: timestamp(entry.message.timestamp, entry.timestamp) })
    }
  }

  const messages: MessageEnvelope[] = []
  const seenTools = new Set<string>()
  const activitySequences = new Map<MessageEnvelope, number>()
  for (const entry of snapshot.entries) {
    if (entry.type === "message" && typeof entry.id === "string" && (entry.message?.role === "user" || entry.message?.role === "assistant")) {
      const created = timestamp(entry.message.timestamp, entry.timestamp)
      messages.push({
        info: {
          id: entry.id,
          role: entry.message.role,
          sessionID,
          time: { created, ...(entry.message.role === "assistant" ? { completed: timestamp(entry.timestamp) } : {}) }
        },
        parts: messageParts(entry.id, entry.message, created, results, snapshot.activeTools, snapshot.completedTools, entry.message.role === "assistant" ? seenTools : undefined)
      })
      continue
    }
    if (entry.type !== "custom_message" || entry.customType !== "collab-prompt" || entry.display === false || typeof entry.id !== "string") continue
    const created = timestamp(entry.timestamp)
    const parts = messageParts(entry.id, { role: "user", content: entry.content }, created, results, snapshot.activeTools, snapshot.completedTools)
    const from = isRecord(entry.details) && typeof entry.details.from === "string" ? entry.details.from : ""
    parts.push({ id: `${entry.id}:source`, messageID: entry.id, type: "collab-prompt", text: from })
    messages.push({ info: { id: entry.id, role: "user", sessionID, time: { created } }, parts })
  }

  let streamReasoningID: string | undefined
  if (snapshot.stream) {
    const streamCreated = timestamp(snapshot.stream.timestamp)
    const committed = snapshot.streamDone && snapshot.entries.some(entry =>
      entry.type === "message" && entry.message?.role === "assistant" && timestamp(entry.message.timestamp, entry.timestamp) === streamCreated)
    if (!committed) {
      const id = `collab-stream-${streamCreated}`
      const streamMessage: MessageEnvelope = {
        info: { id, role: "assistant", sessionID, time: { created: streamCreated } },
        parts: messageParts(id, snapshot.stream, streamCreated, results, snapshot.activeTools, snapshot.completedTools, seenTools)
      }
      if (!snapshot.streamDone) {
        const trailing = streamMessage.parts[streamMessage.parts.length - 1]
        if (trailing?.type === "reasoning") streamReasoningID = trailing.id
      }
      activitySequences.set(streamMessage, snapshot.streamSequence)
      messages.push(streamMessage)
    }
  }

  const synthetic: MessageEnvelope[] = []
  for (const tool of snapshot.completedTools.values()) {
    if (seenTools.has(tool.toolCallId)) continue
    const id = `collab-tool-${tool.toolCallId}`
    const message: MessageEnvelope = {
      info: { id, role: "assistant", sessionID, time: { created: tool.startedAt, completed: tool.completedAt } },
      parts: messageParts(id, { content: [{ type: "toolCall", id: tool.toolCallId, name: tool.toolName, arguments: tool.args }] }, tool.startedAt, results, snapshot.activeTools, snapshot.completedTools)
    }
    activitySequences.set(message, snapshot.toolSequences.get(tool.toolCallId) ?? 0)
    synthetic.push(message)
  }
  for (const tool of snapshot.activeTools.values()) {
    if (seenTools.has(tool.toolCallId) || snapshot.completedTools.has(tool.toolCallId)) continue
    const id = `collab-tool-${tool.toolCallId}`
    const message: MessageEnvelope = {
      info: { id, role: "assistant", sessionID, time: { created: tool.startedAt } },
      parts: messageParts(id, { content: [{ type: "toolCall", id: tool.toolCallId, name: tool.toolName, arguments: tool.args }] }, tool.startedAt, results, snapshot.activeTools, snapshot.completedTools)
    }
    activitySequences.set(message, snapshot.toolSequences.get(tool.toolCallId) ?? 0)
    synthetic.push(message)
  }
  synthetic.sort((a, b) => a.info.time.created - b.info.time.created || a.info.id.localeCompare(b.info.id))
  for (const message of synthetic) {
    const index = messages.findIndex(existing => existing.info.time.created > message.info.time.created)
    messages.splice(index < 0 ? messages.length : index, 0, message)
  }

  const activitySlots: number[] = []
  for (let index = 0; index < messages.length; index += 1) {
    if (activitySequences.has(messages[index])) activitySlots.push(index)
  }
  const orderedActivity = activitySlots
    .map((index) => messages[index])
    .sort((a, b) => activitySequences.get(a)! - activitySequences.get(b)!)
  for (let index = 0; index < activitySlots.length; index += 1) messages[activitySlots[index]] = orderedActivity[index]

  return {
    session,
    status,
    messages,
    streamReasoningID,
    agents: snapshot.agents.map(agent => ({
      id: agent.id,
      name: agent.displayName,
      kind: agent.kind,
      parentId: agent.parentId ?? null,
      status: agent.status,
      hasTranscript: agent.hasSessionFile,
      createdAt: agent.createdAt,
      lastActivity: agent.lastActivity,
      progress: snapshot.progress.get(agent.id)?.progress ?? null,
      lifecycle: snapshot.lifecycle.get(agent.id) ?? null
    })),
    uiRequest: uiRequest(snapshot.uiRequest, callbacks)
  }
}
