import { spawn as nodeSpawn, spawnSync } from "node:child_process"
import { networkInterfaces } from "node:os"

const BRIDGE_BACKENDS = new Set(["omp", "pi", "claude"])

export const BACKENDS = {
  omp: { label: "Oh My Pi", username: "omp", port: 4097, needsRoot: true, client: "Native iOS, web, and PWA" },
  pi: { label: "PI", username: "pi", port: 4097, needsRoot: true, client: "Web and PWA" },
  claude: { label: "Claude Code", username: "claude", port: 4097, needsRoot: true, client: "Web and PWA" },
  opencode: { label: "OpenCode", username: "opencode", port: 4096, needsRoot: false, client: "Web and PWA" },
}

export function backendDefaults(backend) {
  const value = BACKENDS[backend]
  if (!value) throw new Error(`Unsupported backend: ${backend}`)
  return { username: value.username, port: value.port, needsRoot: value.needsRoot }
}

function validBrowserOrigin(value) {
  try {
    const parsed = new URL(value)
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.origin === value
  } catch {
    return false
  }
}

export function validateSettings(settings) {
  if (!BACKENDS[settings.backend]) return "Choose a supported backend."
  if (!settings.username?.trim()) return "Username is required for phone-ready LAN access."
  if (!settings.password) return "Password is required for phone-ready LAN access."
  if (!Number.isInteger(Number(settings.port)) || Number(settings.port) < 1 || Number(settings.port) > 65535) return "Port must be between 1 and 65535."
  if (BACKENDS[settings.backend].needsRoot && !settings.root?.trim()) return "Workspace root is required for this bridge."
  if ((settings.backend === "pi" || settings.backend === "claude") && !settings.browserOrigin?.trim()) return "Web client origin is required for this backend."
  if (BRIDGE_BACKENDS.has(settings.backend) && settings.browserOrigin?.trim() && !validBrowserOrigin(settings.browserOrigin.trim())) return "Web client origin must be a valid HTTP or HTTPS origin."
  return null
}

export function buildLaunchSpec(settings, runtime) {
  const error = validateSettings(settings)
  if (error) throw new Error(error)
  const port = String(settings.port)
  if (settings.backend === "opencode") {
    const npxCommand = runtime.platform === "win32" ? "npx.cmd" : "npx"
    return {
      command: runtime.platform === "win32" ? runtime.comspec ?? process.env.ComSpec ?? "cmd.exe" : npxCommand,
      args: runtime.platform === "win32"
        ? ["/d", "/s", "/c", npxCommand, "-y", "opencode-ai", "serve", "--hostname", "0.0.0.0", "--port", port]
        : ["-y", "opencode-ai", "serve", "--hostname", "0.0.0.0", "--port", port],
      env: {
        ...process.env,
        OPENCODE_SERVER_USERNAME: settings.username.trim(),
        OPENCODE_SERVER_PASSWORD: settings.password,
      },
      healthPath: "/global/health",
    }
  }

  const corsArgs = ["capacitor://localhost", settings.browserOrigin?.trim()].filter(Boolean).flatMap((origin) => ["--cors", origin])
  return {
    command: runtime.electronPath,
    args: [runtime.bridgeCli, "--backend", settings.backend, "--host", "0.0.0.0", "--port", port, "--root", settings.root.trim(), ...corsArgs],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HARNESS_REMOTE_USERNAME: settings.username.trim(),
      HARNESS_REMOTE_PASSWORD: settings.password,
    },
    healthPath: "/v1/health",
  }
}

export function prerequisiteCommands(backend, platform = process.platform) {
  if (backend === "omp") return [{ command: "omp", label: "Oh My Pi", install: "Install Oh My Pi and make the omp command available." }]
  return [{ command: platform === "win32" ? "npx.cmd" : "npx", label: "Node.js and npm", install: "Install Node.js 22.12 or newer." }]
}

export function checkPrerequisites(backend, platform = process.platform) {
  return prerequisiteCommands(backend, platform).map((item) => {
    const wrapped = platform === "win32" && /\.(cmd|bat)$/i.test(item.command)
    const command = wrapped ? process.env.ComSpec ?? "cmd.exe" : item.command
    const args = wrapped ? ["/d", "/s", "/c", item.command, "--version"] : ["--version"]
    return { ...item, available: spawnSync(command, args, { windowsHide: true, stdio: "ignore" }).status === 0 }
  })
}

export function lanAddresses(interfaces = networkInterfaces()) {
  const addresses = []
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) addresses.push({ name, address: entry.address })
    }
  }
  return addresses
}

export function connectionDetails(settings, addresses) {
  const urls = addresses.map(({ name, address }) => ({ name, url: `http://${address}:${settings.port}` }))
  return {
    host: addresses[0]?.address ?? "No LAN address detected",
    port: Number(settings.port),
    username: settings.username.trim(),
    urls,
    client: BACKENDS[settings.backend].client,
  }
}

async function fetchHealth(spec, settings) {
  const response = await fetch(`http://127.0.0.1:${settings.port}${spec.healthPath}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${settings.username}:${settings.password}`).toString("base64")}` },
  })
  if (!response.ok) throw new Error(`Health check returned ${response.status}`)
  return response.json()
}

function redactedLines(chunk, secrets) {
  let text = String(chunk)
  for (const secret of secrets) if (secret) text = text.replaceAll(secret, "[redacted]")
  return text.split(/\r?\n/).filter(Boolean)
}

function terminateProcessTree(child, platform, force = false) {
  if (platform === "win32" && child.pid) {
    const result = spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" })
    if (result.status === 0) return
  } else if (child.pid) {
    try {
      process.kill(-child.pid, force ? "SIGKILL" : "SIGTERM")
      return
    } catch {
      // Fall back when the process did not establish its own group.
    }
  }
  child.kill(force ? "SIGKILL" : "SIGTERM")
}

export class ServerManager {
  #child = null
  #listeners = new Set()
  #deps
  #settings = null
  #spec = null
  #startedAt = null
  #platform = process.platform
  #state = { status: "stopped", pid: null, version: "", backend: "", root: "", healthError: "", logs: [], connection: null }

  constructor(deps = {}) {
    this.#deps = {
      spawn: deps.spawn ?? ((command, args, options) => nodeSpawn(command, args, options)),
      terminate: deps.terminate ?? terminateProcessTree,
      health: deps.health ?? fetchHealth,
      networkAddresses: deps.networkAddresses ?? lanAddresses,
      now: deps.now ?? Date.now,
    }
  }

  subscribe(listener) {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  #emit() {
    const value = this.state()
    for (const listener of this.#listeners) listener(value)
  }

  #log(chunk) {
    this.#state.logs = [...this.#state.logs, ...redactedLines(chunk, [this.#settings?.password])].slice(-200)
    this.#emit()
  }

  state() {
    return {
      ...this.#state,
      logs: [...this.#state.logs],
      uptimeMs: this.#startedAt ? Math.max(0, this.#deps.now() - this.#startedAt) : 0,
    }
  }

  async start(settings, runtime) {
    if (this.#child) throw new Error("A server is already running.")
    const spec = buildLaunchSpec(settings, runtime)
    this.#settings = { ...settings }
    this.#spec = spec
    this.#platform = runtime.platform
    this.#startedAt = this.#deps.now()
    this.#state = {
      status: "starting",
      pid: null,
      version: "",
      backend: settings.backend,
      root: settings.root?.trim() ?? "",
      healthError: "",
      logs: [],
      connection: connectionDetails(settings, this.#deps.networkAddresses()),
    }
    const child = this.#deps.spawn(spec.command, spec.args, { env: spec.env, windowsHide: true, detached: runtime.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] })
    this.#child = child
    this.#state.pid = child.pid ?? null
    child.stdout?.on("data", (chunk) => this.#log(chunk))
    child.stderr?.on("data", (chunk) => this.#log(chunk))
    child.once("error", (error) => {
      if (this.#child !== child) return
      this.#state.status = "failed"
      this.#state.healthError = error.message
      this.#state.pid = null
      this.#state.connection = null
      this.#child = null
      this.#startedAt = null
      this.#settings = null
      this.#spec = null
      this.#emit()
    })
    child.once("exit", (code, signal) => {
      if (this.#child !== child) return
      this.#child = null
      this.#state.status = code === 0 ? "stopped" : "failed"
      if (code !== 0) this.#state.healthError = `Server exited with ${signal ?? `code ${code}`}.`
      this.#state.pid = null
      this.#state.connection = null
      this.#startedAt = null
      this.#settings = null
      this.#spec = null
      this.#emit()
    })
    this.#emit()
    return this.state()
  }

  async refreshHealth() {
    const child = this.#child
    const spec = this.#spec
    const settings = this.#settings
    if (!child || !settings || !spec) return this.state()
    try {
      const health = await this.#deps.health(spec, settings)
      if (this.#child !== child || this.#spec !== spec) return this.state()
      this.#state.status = health.healthy ? "healthy" : "unhealthy"
      this.#state.version = health.version ?? "unknown"
      this.#state.healthError = ""
    } catch (error) {
      if (this.#child !== child || this.#spec !== spec) return this.state()
      this.#state.status = "unhealthy"
      this.#state.healthError = error instanceof Error ? error.message : "Health check failed."
    }
    this.#emit()
    return this.state()
  }

  async stop() {
    const child = this.#child
    if (child) {
      await new Promise((resolve) => {
        const timeout = setTimeout(() => { this.#deps.terminate(child, this.#platform, true); resolve() }, 4000)
        timeout.unref?.()
        child.once("exit", () => { clearTimeout(timeout); resolve() })
        this.#deps.terminate(child, this.#platform, false)
      })
    }
    this.#child = null
    this.#settings = null
    this.#spec = null
    this.#state.connection = null
    this.#startedAt = null
    this.#state.status = "stopped"
    this.#state.pid = null
    this.#state.version = ""
    this.#state.healthError = ""
    this.#emit()
    return this.state()
  }

  async restart(settings, runtime) {
    const error = validateSettings(settings)
    if (error) throw new Error(error)
    await this.stop()
    this.#state.version = ""
    return this.start(settings, runtime)
  }
}

export const isBridgeBackend = (backend) => BRIDGE_BACKENDS.has(backend)
