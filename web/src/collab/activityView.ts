import type { MessageEnvelope } from "../types"

export function currentStreamReasoningID(messages: readonly MessageEnvelope[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.parts.length === 0) continue
    if (!message.info.id.startsWith("collab-stream-")) return undefined
    const trailing = message.parts[message.parts.length - 1]
    return trailing?.type === "reasoning" ? trailing.id : undefined
  }
  return undefined
}

export function nextDisclosureOpen(current: boolean, live: boolean | "toggle"): boolean {
  return live === "toggle" ? !current : live
}

export function shouldLoadPatchDiff(visible: boolean, diffs: unknown[] | null): boolean {
  return visible && diffs === null
}
