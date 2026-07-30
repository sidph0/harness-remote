import type { CollabAttachment, SessionView } from "../types"

export function collabSessionView(
  attachment: CollabAttachment,
  current?: SessionView,
  adapted?: SessionView,
  now = Date.now(),
): SessionView {
  return {
    files: 0,
    additions: 0,
    deletions: 0,
    status: "connecting",
    ...current,
    ...adapted,
    id: `collab:${attachment.id}`,
    title: attachment.name,
    directory: adapted?.directory || current?.directory || "OMP Collab",
    updated: current || adapted ? Math.max(current?.updated ?? 0, adapted?.updated ?? 0) : now,
    external: true,
  }
}

export function mergeCollabSessionViews(
  direct: readonly SessionView[],
  attachments: readonly CollabAttachment[],
  current: ReadonlyMap<string, SessionView>,
  now = Date.now(),
): SessionView[] {
  const ids = new Set(attachments.map((attachment) => `collab:${attachment.id}`))
  return [
    ...direct.filter((session) => !ids.has(session.id)),
    ...attachments.map((attachment) => collabSessionView(attachment, current.get(`collab:${attachment.id}`), undefined, now)),
  ].sort((a, b) => b.updated - a.updated)
}
