export function nextDisclosureOpen(current: boolean, live: boolean | "toggle"): boolean {
  return live === "toggle" ? !current : live
}

export function shouldLoadPatchDiff(visible: boolean, diffs: unknown[] | null): boolean {
  return visible && diffs === null
}
