import type { MessageEnvelope } from "../types"

export function currentStreamReasoningID(messages: readonly MessageEnvelope[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message.info.id.startsWith("collab-stream-")) continue
    const trailing = message.parts[message.parts.length - 1]
    return trailing?.type === "reasoning" ? trailing.id : undefined
  }
  return undefined
}

export function nextDisclosureOpen(current: boolean, live: boolean | "toggle"): boolean {
  return live === "toggle" ? !current : live
}
