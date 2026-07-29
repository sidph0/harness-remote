import type { CollabAttachment } from "../types"
import { secureStorage } from "../secureStorage"
import { parseCollabLink } from "./link"

const STORAGE_KEY = "collab:attachments"

type SecureStorage = Pick<typeof secureStorage, "get" | "set" | "remove">

export function attachmentFromLink(name: string, link: string, id: string = crypto.randomUUID()): CollabAttachment {
  const trimmedName = name.trim()
  const trimmedLink = link.trim()
  const trimmedId = id.trim()
  if (!trimmedName) throw new Error("Collab attachment name is required")
  if (!trimmedId) throw new Error("Collab attachment id is required")

  const parsed = parseCollabLink(trimmedLink)
  if ("error" in parsed) throw new Error("Invalid collab link")

  return {
    id: trimmedId,
    name: trimmedName,
    link: trimmedLink,
    readOnly: parsed.writeToken === undefined,
  }
}

export async function loadCollabAttachments(storage: SecureStorage = secureStorage): Promise<CollabAttachment[]> {
  const value = await storage.get(STORAGE_KEY)
  if (value === null) return []

  let records: unknown
  try {
    records = JSON.parse(value)
  } catch {
    return []
  }
  if (!Array.isArray(records)) return []

  const attachments: CollabAttachment[] = []
  for (const record of records) {
    if (record === null || typeof record !== "object") continue
    const { id, name, link, readOnly } = record as Record<string, unknown>
    if (typeof id !== "string" || typeof name !== "string" || typeof link !== "string" || typeof readOnly !== "boolean") continue
    try {
      attachments.push(attachmentFromLink(name, link, id))
    } catch {
      // Ignore corrupt persisted entries without exposing their bearer links.
    }
  }
  return attachments
}

export function saveCollabAttachments(
  attachments: readonly CollabAttachment[],
  storage: SecureStorage = secureStorage,
): Promise<void> {
  return attachments.length
    ? storage.set(STORAGE_KEY, JSON.stringify(attachments))
    : storage.remove(STORAGE_KEY)
}
