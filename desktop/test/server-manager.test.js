import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"
import test from "node:test"
import {
  BACKENDS,
  ServerManager,
  backendDefaults,
  buildLaunchSpec,
  connectionDetails,
  prerequisiteCommands,
  validateSettings,
} from "../src/server-manager.js"

const bridgeSettings = {
  backend: "omp",
  username: "sid",
  password: "bridge-secret",
  root: "C:\\work",
  port: 4097,
}

test("backend defaults match the existing server contracts", () => {
  assert.deepEqual(backendDefaults("omp"), { username: "omp", port: 4097, needsRoot: true })
  assert.deepEqual(backendDefaults("opencode"), { username: "opencode", port: 4096, needsRoot: false })
  assert.deepEqual(Object.keys(BACKENDS), ["omp", "pi", "claude", "opencode"])
})

test("phone-ready settings require credentials, roots, and browser origins where needed", () => {
  assert.equal(validateSettings(bridgeSettings), null)
  assert.match(validateSettings({ ...bridgeSettings, username: "" }), /Username is required/)
  assert.match(validateSettings({ ...bridgeSettings, password: "" }), /Password is required/)
  assert.match(validateSettings({ ...bridgeSettings, root: "" }), /Workspace root is required/)
  assert.match(validateSettings({ ...bridgeSettings, backend: "pi" }), /Web client origin is required/)
  assert.match(validateSettings({ ...bridgeSettings, backend: "pi", browserOrigin: "localhost:5173" }), /valid HTTP or HTTPS origin/)
  assert.equal(validateSettings({ ...bridgeSettings, backend: "pi", browserOrigin: "http://localhost:5173" }), null)
  assert.equal(validateSettings({ ...bridgeSettings, backend: "opencode", root: "", port: 4096 }), null)
  assert.equal(validateSettings({ ...bridgeSettings, backend: "opencode", root: "", port: 4096, browserOrigin: "not a visible OpenCode field" }), null)
})

test("bridge launch keeps credentials out of process arguments", () => {
  const spec = buildLaunchSpec({ ...bridgeSettings, browserOrigin: "https://client.example" }, {
    electronPath: "C:\\Harness Remote\\electron.exe",
    bridgeCli: "C:\\Harness Remote\\resources\\bridge\\cli.js",
    platform: "win32",
  })

  assert.equal(spec.command, "C:\\Harness Remote\\electron.exe")
  assert.ok(spec.args.includes("C:\\Harness Remote\\resources\\bridge\\cli.js"))
  assert.ok(spec.args.includes("--backend") && spec.args.includes("omp"))
  assert.ok(spec.args.includes("--host") && spec.args.includes("0.0.0.0"))
  assert.equal(spec.args.includes("bridge-secret"), false)
  assert.equal(spec.env.HARNESS_REMOTE_USERNAME, "sid")
  assert.equal(spec.env.HARNESS_REMOTE_PASSWORD, "bridge-secret")
  assert.equal(spec.env.ELECTRON_RUN_AS_NODE, "1")
  assert.equal(spec.healthPath, "/v1/health")
  assert.deepEqual(spec.args.filter((_value, index) => spec.args[index - 1] === "--cors"), ["capacitor://localhost", "https://client.example"])
})

test("OpenCode launch uses its existing server command and environment auth", () => {
  const spec = buildLaunchSpec({ ...bridgeSettings, backend: "opencode", root: "", port: 4096 }, {
    electronPath: "electron.exe",
    bridgeCli: "bridge.js",
    platform: "win32",
    comspec: "C:\\Windows\\System32\\cmd.exe",
  })

  assert.equal(spec.command, "C:\\Windows\\System32\\cmd.exe")
  assert.deepEqual(spec.args, ["/d", "/s", "/c", "npx.cmd", "-y", "opencode-ai", "serve", "--hostname", "0.0.0.0", "--port", "4096"])
  assert.equal(spec.env.OPENCODE_SERVER_USERNAME, "sid")
  assert.equal(spec.env.OPENCODE_SERVER_PASSWORD, "bridge-secret")
  assert.equal(spec.args.includes("bridge-secret"), false)
  assert.equal(spec.healthPath, "/global/health")
})

test("connection details provide copyable client values for each LAN address", () => {
  const details = connectionDetails(bridgeSettings, [
    { name: "Wi-Fi", address: "192.168.1.25" },
    { name: "Tailscale", address: "100.80.2.4" },
  ])

  assert.equal(details.host, "192.168.1.25")
  assert.equal(details.port, 4097)
  assert.equal(details.username, "sid")
  assert.deepEqual(details.urls, [
    { name: "Wi-Fi", url: "http://192.168.1.25:4097" },
    { name: "Tailscale", url: "http://100.80.2.4:4097" },
  ])
  assert.equal("password" in details, false, "manager state must not echo secrets")
})

test("prerequisite checks follow each backend launch path", () => {
  assert.deepEqual(prerequisiteCommands("omp"), [{ command: "omp", label: "Oh My Pi", install: "Install Oh My Pi and make the omp command available." }])
  for (const backend of ["pi", "claude", "opencode"]) {
    assert.equal(prerequisiteCommands(backend)[0].command, process.platform === "win32" ? "npx.cmd" : "npx")
  }
})

test("ServerManager owns health, bounded logs, and stop lifecycle", async () => {
  const child = new EventEmitter()
  child.pid = 4123
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.kill = () => { throw new Error("direct child kill leaves descendants") }
  const manager = new ServerManager({
    spawn: () => child,
    terminate: (target) => { target.killed = true; target.emit("exit", 0, null) },
    health: async () => ({ healthy: true, backend: "omp", version: "17.1.8" }),
    networkAddresses: () => [{ name: "Wi-Fi", address: "192.168.1.25" }],
    now: (() => { let value = 1000; return () => value += 100 })(),
  })

  await manager.start(bridgeSettings, { electronPath: "electron.exe", bridgeCli: "bridge.js", platform: "win32" })
  child.stdout.write("ready\n")
  await manager.refreshHealth()
  const running = manager.state()
  assert.equal(running.status, "healthy")
  assert.equal(running.pid, 4123)
  assert.equal(running.version, "17.1.8")
  assert.equal(running.connection.host, "192.168.1.25")
  assert.equal(JSON.stringify(running).includes("bridge-secret"), false)
  assert.match(running.logs.join("\n"), /ready/)

  await manager.stop()
  assert.equal(child.killed, true)
  assert.equal(manager.state().status, "stopped")
  assert.equal(manager.state().connection, null, "stopped server must not show a live connection")
})

test("invalid restart settings leave the running server intact", async () => {
  const child = new EventEmitter()
  child.pid = 4999
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  let terminated = false
  const manager = new ServerManager({
    spawn: () => child,
    terminate: () => { terminated = true; child.emit("exit", 0, null) },
    networkAddresses: () => [],
  })
  const runtime = { electronPath: "electron.exe", bridgeCli: "bridge.js", platform: "win32" }

  await manager.start(bridgeSettings, runtime)
  await assert.rejects(manager.restart({ ...bridgeSettings, password: "" }, runtime), /Password is required/)
  assert.equal(terminated, false)
  assert.equal(manager.state().pid, 4999)
})

test("a stale health result cannot overwrite stopped state", async () => {
  const child = new EventEmitter()
  child.pid = 5001
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  let resolveHealth
  const manager = new ServerManager({
    spawn: () => child,
    terminate: (target) => target.emit("exit", 0, null),
    health: () => new Promise((resolve) => { resolveHealth = resolve }),
    networkAddresses: () => [],
  })
  await manager.start(bridgeSettings, { electronPath: "electron.exe", bridgeCli: "bridge.js", platform: "win32" })
  const pending = manager.refreshHealth()
  await manager.stop()
  resolveHealth({ healthy: true, backend: "omp", version: "old" })
  await pending
  assert.equal(manager.state().status, "stopped")
  assert.equal(manager.state().version, "")
})

test("unexpected exits clear dead process details", async () => {
  const child = new EventEmitter()
  child.pid = 5002
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  const manager = new ServerManager({ spawn: () => child, networkAddresses: () => [] })
  await manager.start(bridgeSettings, { electronPath: "electron.exe", bridgeCli: "bridge.js", platform: "win32" })
  child.emit("exit", 1, null)
  const failed = manager.state()
  assert.equal(failed.status, "failed")
  assert.equal(failed.pid, null)
  assert.equal(failed.uptimeMs, 0)
  assert.equal(failed.connection, null)
})
