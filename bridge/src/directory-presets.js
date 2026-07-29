import { access, realpath } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

const PRESETS = ["Downloads", "Documents", "Desktop"]

export async function allowedDirectory(candidate, { roots = [] }) {
  const resolved = await realpath(candidate)
  const allowedRoots = await Promise.all((roots.length ? roots : [process.cwd()]).map((root) => realpath(root)))
  const withinRoot = allowedRoots.some((root) => {
    const relative = path.relative(root, resolved)
    return relative === "" || !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`)
  })
  if (!withinRoot) throw new Error("Directory is outside the configured --root boundary")
  return resolved
}

export async function hostDirectoryInfo({ roots = [], platform = process.platform, home = homedir() }) {
  const directoryPresets = []
  for (const label of PRESETS) {
    try {
      const candidate = path.join(home, label)
      await access(candidate)
      directoryPresets.push({ id: label.toLowerCase(), label, path: await allowedDirectory(candidate, { roots }) })
    } catch {
      // Missing and out-of-root presets are intentionally hidden.
    }
  }
  return {
    hostPlatform: platform === "win32" ? "windows" : platform === "darwin" ? "macos" : "linux",
    directoryPresets
  }
}
