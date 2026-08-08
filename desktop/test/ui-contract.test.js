import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8")

test("Electron window is isolated and exposes only the manager bridge", () => {
  const main = read("main.js")
  const preload = read("preload.cjs")
  assert.match(main, /contextIsolation:\s*true/)
  assert.match(main, /nodeIntegration:\s*false/)
  assert.match(main, /sandbox:\s*true/)
  assert.match(preload, /contextBridge\.exposeInMainWorld\("serverManager"/)
  assert.equal(preload.includes("ipcRenderer.send("), false, "renderer must not get an unrestricted send primitive")
})

test("manager UI contains setup, health, connection, and lifecycle controls", () => {
  const html = read("index.html")
  for (const id of ["backend", "username", "password", "root", "browser-origin", "port", "start", "stop", "restart", "health", "connection", "prerequisites", "logs"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`)
  }
  assert.match(html, /Content-Security-Policy/)
})

test("renderer keeps passwords local and never saves them", () => {
  const renderer = read("renderer.js")
  assert.match(renderer, /password:\s*password\.value/)
  assert.equal(/saveSettings\([^)]*password/s.test(renderer), false)
  assert.match(renderer, /serverManager\.start/)
  assert.match(renderer, /serverManager\.stop/)
  assert.match(renderer, /serverManager\.restart/)
  assert.equal(renderer.includes("innerHTML"), false, "manager state must render through text nodes, not HTML parsing")
  assert.match(renderer, /showError\(state\.healthError \|\| ""\)/, "a healthy state must clear a prior health alert")
  assert.match(renderer, /friendlyError\(error\)/, "renderer should remove Electron IPC prefixes from user-facing errors")
  assert.match(renderer, /password\.disabled = running\(\)/, "the running server credential must not be editable before restart")
})
