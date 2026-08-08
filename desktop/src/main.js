import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from "electron"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { BACKENDS, ServerManager, checkPrerequisites } from "./server-manager.js"

const directory = path.dirname(fileURLToPath(import.meta.url))
const manager = new ServerManager()
let window
let healthTimer
let closing = false

const settingsPath = () => path.join(app.getPath("userData"), "settings.json")
const defaultSettings = { backend: "omp", username: "omp", root: "", browserOrigin: "", port: 4097 }
const safeSettings = (value = {}) => {
  const backend = BACKENDS[value.backend] ? value.backend : "omp"
  const defaults = BACKENDS[backend]
  return {
    backend,
    username: typeof value.username === "string" ? value.username : defaults.username,
    root: typeof value.root === "string" ? value.root : "",
    browserOrigin: typeof value.browserOrigin === "string" ? value.browserOrigin : "",
    port: Number.isInteger(Number(value.port)) ? Number(value.port) : defaults.port,
  }
}

async function loadSettings() {
  try { return safeSettings(JSON.parse(await readFile(settingsPath(), "utf8"))) }
  catch { return defaultSettings }
}

async function saveSettings(value) {
  const safe = safeSettings(value)
  await writeFile(settingsPath(), `${JSON.stringify(safe, null, 2)}\n`, "utf8")
  return safe
}

function runtime() {
  return {
    electronPath: process.execPath,
    bridgeCli: app.isPackaged ? path.join(process.resourcesPath, "bridge", "cli.js") : path.resolve(directory, "../../bridge/src/cli.js"),
    platform: process.platform,
    comspec: process.env.ComSpec,
  }
}

function publish(state = manager.state()) {
  if (window && !window.isDestroyed()) window.webContents.send("manager:state", state)
}

function startHealthPolling() {
  clearInterval(healthTimer)
  setTimeout(() => void manager.refreshHealth(), 600)
  healthTimer = setInterval(() => void manager.refreshHealth(), 2500)
  healthTimer.unref?.()
}

async function ensurePrerequisites(backend) {
  const results = checkPrerequisites(backend)
  const missing = results.filter((item) => !item.available)
  if (missing.length) throw new Error(missing.map((item) => `${item.label}: ${item.install}`).join("\n"))
  return results
}

function registerIpc() {
  ipcMain.handle("manager:get-state", async () => ({ state: manager.state(), settings: await loadSettings(), prerequisites: checkPrerequisites((await loadSettings()).backend) }))
  ipcMain.handle("manager:save-settings", (_event, value) => saveSettings(value))
  ipcMain.handle("manager:prerequisites", (_event, backend) => checkPrerequisites(backend))
  ipcMain.handle("manager:choose-root", async () => {
    const result = await dialog.showOpenDialog(window, { properties: ["openDirectory", "createDirectory"] })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle("manager:start", async (_event, value) => {
    await ensurePrerequisites(value.backend)
    await saveSettings(value)
    const state = await manager.start(value, runtime())
    startHealthPolling()
    return state
  })
  ipcMain.handle("manager:stop", async () => {
    clearInterval(healthTimer)
    return manager.stop()
  })
  ipcMain.handle("manager:restart", async (_event, value) => {
    await ensurePrerequisites(value.backend)
    await saveSettings(value)
    const state = await manager.restart(value, runtime())
    startHealthPolling()
    return state
  })
  ipcMain.handle("manager:copy", (_event, text) => clipboard.writeText(String(text)))
  ipcMain.handle("manager:open-external", (_event, url) => {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:") throw new Error("Only HTTPS help links are allowed.")
    return shell.openExternal(parsed.href)
  })
}

function createWindow() {
  window = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 760,
    minHeight: 600,
    show: false,
    title: "Harness Remote Server",
    webPreferences: {
      preload: path.join(directory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.removeMenu()
  window.loadFile(path.join(directory, "index.html"))
  window.once("ready-to-show", () => window.show())
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  window.on("close", (event) => {
    if (closing) return
    event.preventDefault()
    closing = true
    clearInterval(healthTimer)
    void manager.stop().finally(() => window.destroy())
  })
}

manager.subscribe(publish)
app.whenReady().then(() => {
  registerIpc()
  createWindow()
})
app.on("window-all-closed", () => app.quit())
