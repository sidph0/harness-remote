import type { BackendKind, HealthResponse, ServerConfig, Session } from "./types"

const BACKENDS: readonly BackendKind[] = ["opencode", "omp", "pi", "claude"]

function isBackend(value: unknown): value is BackendKind {
  return typeof value === "string" && BACKENDS.includes(value as BackendKind)
}

export function resolveInitialBackend(
  platform: string,
  storedBackend: unknown,
  legacyBackend: unknown,
): BackendKind {
  if (platform === "ios") return "omp"
  if (isBackend(storedBackend)) return storedBackend
  if (isBackend(legacyBackend)) return legacyBackend
  return "opencode"
}

export async function loadVerifiedCapabilities<T>(
  config: ServerConfig,
  fallback: T,
  client: {
    health(config: ServerConfig): Promise<HealthResponse>
    capabilities(config: ServerConfig): Promise<T>
  },
): Promise<T> {
  const health = await client.health(config)
  if (health.backend && health.backend !== config.backend) {
    throw new Error(`Expected backend ${config.backend}, reached ${health.backend}`)
  }

  try {
    return await client.capabilities(config)
  } catch {
    return fallback
  }
}

type SelectedSession = Pick<Session, "id" | "directory">

export async function resumeDirectSession(actions: {
  resetTransport(): void
  refreshSessions(force: boolean): Promise<unknown>
  selected(): SelectedSession | null | undefined
  loadSelected(id: string, directory: string, force: boolean): Promise<unknown>
}): Promise<void> {
  actions.resetTransport()
  await actions.refreshSessions(true)
  const selected = actions.selected()
  if (selected) await actions.loadSelected(selected.id, selected.directory, true)
}

export function activeSessionDirectory(
  session: Pick<Session, "directory"> | null | undefined,
): string | undefined {
  return session?.directory
}
