const $ = (id) => document.getElementById(id)
const backend = $("backend")
const username = $("username")
const password = $("password")
const root = $("root")
const port = $("port")
const browserOrigin = $("browser-origin")
const originRow = $("origin-row")
const rootRow = $("root-row")
const errorBox = $("error")
const health = $("health")
const start = $("start")
const stop = $("stop")
const restart = $("restart")
const backendDefaults = {
  omp: { username: "omp", port: 4097, needsRoot: true, label: "Oh My Pi", client: "Native iOS, web, and PWA" },
  pi: { username: "pi", port: 4097, needsRoot: true, label: "PI", client: "Web and PWA" },
  claude: { username: "claude", port: 4097, needsRoot: true, label: "Claude Code", client: "Web and PWA. Run claude login before starting, or launch this app with ANTHROPIC_API_KEY set" },
  opencode: { username: "opencode", port: 4096, needsRoot: false, label: "OpenCode", client: "Web and PWA" },
}
let state = { status: "stopped", logs: [] }

const settings = () => ({ backend: backend.value, username: username.value.trim(), password: password.value, root: root.value, browserOrigin: browserOrigin.value.trim(), port: Number(port.value) })
const savedSettings = () => ({ backend: backend.value, username: username.value.trim(), root: root.value, browserOrigin: browserOrigin.value.trim(), port: Number(port.value) })
const running = () => ["starting", "healthy", "unhealthy"].includes(state.status)
const showError = (message = "") => { errorBox.textContent = message; errorBox.hidden = !message }
const friendlyError = (error) => String(error?.message ?? error).replace(/^Error invoking remote method '[^']+': Error: /, "")
const formatUptime = (milliseconds = 0) => {
  const seconds = Math.floor(milliseconds / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

async function copyButton(label, value) {
  const button = document.createElement("button")
  button.type = "button"
  button.className = "secondary copy"
  button.textContent = "Copy"
  button.setAttribute("aria-label", `Copy ${label}`)
  button.addEventListener("click", () => window.serverManager.copy(value))
  return button
}

async function renderConnection(connection) {
  const container = $("connection")
  container.replaceChildren()
  const heading = document.createElement("h3")
  heading.textContent = "Connect a client"
  container.append(heading)
  if (!connection) {
    const hint = document.createElement("p")
    hint.className = "hint"
    hint.textContent = "Start the server to show LAN connection values."
    container.append(hint)
    return
  }
  const description = document.createElement("p")
  description.className = "hint"
  description.textContent = `${connection.client}. Enter the values below in Settings. The password remains in this window only.`
  container.append(description)
  const grid = document.createElement("div")
  grid.className = "connection-grid"
  const values = [["Host", connection.host], ["Port", String(connection.port)], ["Username", connection.username], ["Password", password.value]]
  for (const [label, value] of values) {
    const row = document.createElement("div")
    row.className = "connection-row"
    const name = document.createElement("span")
    name.textContent = label
    const code = document.createElement("code")
    code.textContent = label === "Password" ? "••••••••" : value
    row.append(name, code, await copyButton(label, value))
    grid.append(row)
  }
  for (const item of connection.urls) {
    const row = document.createElement("div")
    row.className = "connection-row"
    const name = document.createElement("span")
    name.textContent = item.name
    const code = document.createElement("code")
    code.textContent = item.url
    row.append(name, code, await copyButton(`${item.name} URL`, item.url))
    grid.append(row)
  }
  container.append(grid)
}

function renderState(next) {
  state = next
  health.className = `status ${state.status}`
  const statusDot = document.createElement("span")
  health.replaceChildren(statusDot, `${state.status.charAt(0).toUpperCase()}${state.status.slice(1)}`)
  start.disabled = running()
  password.disabled = running()
  stop.disabled = !running()
  restart.disabled = !running()
  $("detail-backend").textContent = backendDefaults[state.backend]?.label ?? "—"
  $("detail-version").textContent = state.version || "—"
  $("detail-pid").textContent = state.pid ?? "—"
  $("detail-uptime").textContent = state.pid ? formatUptime(state.uptimeMs) : "—"
  $("detail-root").textContent = state.root || "Not used"
  $("logs").textContent = state.logs?.length ? state.logs.join("\n") : "No output yet."
  showError(state.healthError || "")
  void renderConnection(state.connection)
}

async function refreshPrerequisites() {
  const items = await window.serverManager.prerequisites(backend.value)
  const container = $("prerequisites")
  container.replaceChildren()
  for (const item of items) {
    const row = document.createElement("div")
    row.className = "prerequisite"
    const availability = document.createElement("span")
    availability.className = item.available ? "ok" : "missing"
    availability.textContent = item.available ? "Ready" : "Missing"
    const description = document.createElement("span")
    const label = document.createElement("strong")
    label.textContent = item.label
    description.append(label, document.createElement("br"), item.available ? "Detected on this computer." : item.install)
    row.append(availability, description)
    container.append(row)
  }
  start.disabled = running() || items.some((item) => !item.available)
}

function applyBackendDefaults(force = false) {
  const value = backendDefaults[backend.value]
  if (force || !username.value) username.value = value.username
  if (force || !port.value) port.value = value.port
  rootRow.hidden = !value.needsRoot
  originRow.hidden = backend.value === "opencode"
  browserOrigin.required = backend.value === "pi" || backend.value === "claude"
  $("origin-hint").textContent = browserOrigin.required
    ? "Required. Enter the exact origin shown in the web client address, such as http://localhost:5173."
    : "Optional for OMP. Add the exact web or PWA origin when a browser connects directly."
  $("backend-note").textContent = value.client
  void refreshPrerequisites()
}

async function startServer() {
  showError()
  try { renderState(await window.serverManager.start(settings())) }
  catch (error) { showError(friendlyError(error)) }
}

async function restartServer() {
  showError()
  try { renderState(await window.serverManager.restart(settings())) }
  catch (error) { showError(friendlyError(error)) }
}

backend.addEventListener("change", () => applyBackendDefaults(true))
$("choose-root").addEventListener("click", async () => { const value = await window.serverManager.chooseRoot(); if (value) root.value = value })
start.addEventListener("click", startServer)
stop.addEventListener("click", async () => { showError(); renderState(await window.serverManager.stop()) })
restart.addEventListener("click", restartServer)
$("tailscale-help").addEventListener("click", () => window.serverManager.openExternal("https://tailscale.com/kb/1242/tailscale-serve"))
for (const field of [backend, username, root, browserOrigin, port]) field.addEventListener("change", () => window.serverManager.saveSettings(savedSettings()))
window.serverManager.onState(renderState)

const initial = await window.serverManager.getState()
backend.value = initial.settings.backend
username.value = initial.settings.username
root.value = initial.settings.root
browserOrigin.value = initial.settings.browserOrigin ?? ""
port.value = initial.settings.port
applyBackendDefaults()
renderState(initial.state)
