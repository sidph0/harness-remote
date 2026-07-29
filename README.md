# Harness Remote

Harness Remote is an OMP-first remote client. Use it from an iPhone, browser, or desktop to create, monitor, and continue Oh My Pi sessions without sitting at the host computer.

The current project has two OMP transports:

1. **Direct Bridge**: the iPhone or browser connects to this repository's HTTP/SSE bridge, which starts `omp acp` on the OMP host.
2. **OMP Collab**: the app attaches manually to an arbitrary desktop OMP session through its `/collab` bearer link and encrypted WebSocket relay.

The native iOS build is intentionally OMP-only. The web and PWA builds also retain secondary OpenCode, PI, and Claude Code adapters.

## What changed

This branch is an iOS and OMP cutover, not the previous Android-focused app:

- OMP direct sessions are the primary product path.
- OMP sessions can be created from the phone under an explicit allowed root.
- LAN and Tailscale connections use the local bridge with Basic Auth.
- OMP Collab links can be attached manually for desktop sessions that are not owned by the bridge.
- Collab bearer links persist in iOS Keychain only.
- The iOS project is generated locally with Capacitor and is not committed.
- The bridge supports Windows, Linux, and macOS hosts without extra runtime dependencies.
- Android packaging and Android release instructions are no longer part of this project.

## Choose a connection mode

| Mode | Best for | Host process | App behavior |
|---|---|---|---|
| Direct OMP Bridge | Creating and continuing sessions from the phone | This repository starts `omp acp` | Full direct session controls supported by OMP |
| OMP Collab writable | Sharing a running desktop session with the phone | Desktop OMP starts `/collab` | Live transcript, prompt, abort, and agent replies |
| OMP Collab read-only | Watching a desktop session safely | Desktop OMP starts `/collab` | Live transcript only, no mutation controls |
| Web/PWA secondary backend | Existing OpenCode, PI, or Claude workflows | Their existing server or bridge | Available only in web and PWA builds |

## OMP Direct Bridge

### How it works

```text
Harness Remote on iPhone or browser
        HTTP + authenticated SSE
                    |
                    v
        bridge/ on the OMP host
                    |
                    v
              omp acp over stdio
```

The bridge does not read or modify OMP databases. It starts an ACP process for the bridge and reads only the supported persisted session history needed to list and refresh sessions. A session running in another desktop client does not provide a global event stream to the bridge. Use OMP Collab for live sharing of that desktop session.

### Requirements

- OMP installed and available as `omp` on the host computer.
- Node.js 22.12 or newer for the full repository workflow. The bridge itself requires Node.js 20 or newer.
- A checkout of this repository on the host computer. The Mac must clone or copy the repository to build the IPA; the Windows host must also clone or copy it to run the bridge.
- An explicit `--root` directory containing the worktrees the phone may browse and use for new sessions. Windows examples use `--root "C:\"` so every directory accessible to the Windows account is available.
- Basic Auth credentials for every non-loopback bridge listener.
- A trusted LAN or a Tailscale network. Never expose the bridge directly to the public Internet.

The root limits bridge browsing and new-session selection. It is not a sandbox for OMP, which still runs with the host account's normal privileges. On Windows, `--root "C:\"` allows any accessible directory on the C drive; repeat `--root` for other drives. The first root is used by **Use server default**.

### Start the bridge on macOS or Linux

Run from the repository root. This shell sequence keeps the password out of the command arguments and clears it after the bridge exits.

```bash
export HARNESS_REMOTE_USERNAME=omp
printf 'Bridge password: '; read -s HARNESS_REMOTE_PASSWORD; printf '\n'; export HARNESS_REMOTE_PASSWORD
npx --yes ./bridge \
  --host 0.0.0.0 \
  --port 4097 \
  --root "$HOME/Software" \
  --cors capacitor://localhost
unset HARNESS_REMOTE_PASSWORD
```

Use one or more `--root` options when the phone needs more than one directory. The `capacitor://localhost` origin is required for authenticated SSE in the native iOS WebView. Browser development needs its exact browser origin as an additional `--cors` value.

### Start the bridge on Windows PowerShell

Run from the repository root. Replace the password placeholder or load it from your password manager. It is passed through the environment, not the bridge command line.

```powershell
Set-Location C:\path\to\harness-remote
$env:HARNESS_REMOTE_USERNAME = "omp"
$env:HARNESS_REMOTE_PASSWORD = "<bridge-password>"
node .\bridge\src\cli.js `
  --host 0.0.0.0 `
  --port 4097 `
  --root "C:\" `
  --cors capacitor://localhost
```

For Windows Command Prompt:

```cmd
cd C:\path\to\harness-remote
set HARNESS_REMOTE_USERNAME=omp
set HARNESS_REMOTE_PASSWORD=<bridge-password>
node .\bridge\src\cli.js --host 0.0.0.0 --port 4097 --root "C:\" --cors capacitor://localhost
```

Replace the repository path and password. Keep the bridge terminal open. Restart the bridge after changing environment variables or `--root` values.

### Check bridge health

PowerShell and Command Prompt must use `curl.exe`, not the PowerShell `curl` alias:

```powershell
curl.exe -v --user omp http://127.0.0.1:4097/v1/health
```

For a Tailscale test, use the Windows Tailscale address:

```powershell
$ts = (tailscale ip -4).Trim()
curl.exe -v --user omp "http://${ts}:4097/v1/health"
```

Enter the bridge password when prompted. A healthy response includes:

```json
{"healthy":true,"backend":"omp","version":"17.x.x"}
```

`401 Unauthorized` means the network connection reached the bridge and only the username or password is wrong. `Cannot reach` means the request did not reach the bridge.

### Connect the app

For the web or PWA build:

1. Open **Settings**.
2. Select **Oh My Pi (bridge)**.
3. Enter the host address, port `4097`, username, and password.
4. Test the connection.

For the native iOS build, OMP is already selected and the backend picker is hidden.

For a local connection, use the Windows LAN IPv4 address and port `4097`.

For remote iPhone access, install Tailscale on Windows and iPhone, sign in to the same tailnet, then run:

```powershell
tailscale serve --bg http://127.0.0.1:4097
tailscale serve status
```

Use the HTTPS hostname printed by `tailscale serve status` in the iPhone app with port `443`, for example:

```text
Host: https://your-pc.your-tailnet.ts.net
Port: 443
```

This HTTPS path is recommended for native iOS. Direct `100.x.x.x` HTTP may work in Safari while native iOS networking rejects it. Tailscale traffic uses a VPN interface, so Harness Remote may not appear under iOS **Local Network** settings. That is not required for the Tailscale path.

Install Tailscale from [tailscale.com/download/windows](https://tailscale.com/download/windows) and the [iPhone App Store](https://apps.apple.com/us/app/tailscale/id1470499037). Tailscale provides routing only. Keep bridge Basic Auth enabled.

## OMP Collab

Collab is the manual path for an arbitrary desktop OMP session.

1. In the desktop OMP session, run `/collab`.
2. Copy the bearer link it prints.
3. In the iOS app, choose **Attach OMP Collab**.
4. Enter a display name. The name is required.
5. Paste the link and attach it.
6. Close the attachment dialog and open **Sessions**. The attached room appears as a separate card named with the display name and labeled **OMP Collab**.

The terminal's join message confirms the handshake. It does not select the card in the app automatically. Direct Bridge sessions and desktop terminal sessions are separate; to share one session between the terminal and phone, use Collab.

There is no automatic desktop-session discovery, account lookup, host scan, or OMP database inspection.

Treat the link like a password. It contains a 32-byte room key and may contain a write token. The client uses WebSocket and AES-256-GCM with 12-byte IVs. Custom non-local relays must use `wss://`. Runtime snapshots stay in memory. Persisted attachment metadata and bearer links use the iOS Keychain only.

A writable link enables prompt, abort, and interactive agent replies. A read-only link displays live output but renders no prompt, abort, or reply controls. Removing an attachment removes its saved bearer link.

## Supported OMP operations

This is the user-facing OMP command matrix. Unsupported controls are hidden instead of simulated.

| Operation | Direct Bridge | Collab writable | Collab read-only |
|---|---:|---:|---:|
| Test health and capabilities | Yes | N/A | N/A |
| List sessions | Yes | One attached room | One attached room |
| Create a session from the app | Yes | No | No |
| Open and refresh persisted history | Yes | Snapshot and live room data | Snapshot and live room data |
| Send a prompt | Yes | Yes | No |
| Queue a follow-up prompt while busy | Yes | Host-dependent room behavior | No |
| Stream assistant output | Yes | Yes | Yes |
| Abort active work | Yes | Yes | No |
| Select an OMP model | Yes, when ACP exposes models | No | No |
| View todos and subagent state | Yes, when exposed | Yes, when the room publishes it | Yes, when the room publishes it |
| Browse allowed directories | Yes | No | No |
| Rename or hide a session | Bridge-local metadata | Attachment name only | Attachment name only |
| Physical OMP session deletion | No | No | No |
| OpenCode questions, commands, agents, diffs, and VCS | No | No | No |
| Automatic desktop Collab discovery | No | No | No |

Direct bridge session names, hidden sessions, and snapshots are bridge-local metadata. OMP's native history is not physically deleted by this app.

## Bridge command options

The bridge is dependency-free and runs on the Node.js standard library.

| Option | Purpose |
|---|---|
| `--backend omp` | Use OMP. This is the default and the iOS backend. |
| `--host <address>` | Bind address. Defaults to `127.0.0.1`. Use `0.0.0.0` for phone access. |
| `--port <number>` | HTTP port. Defaults to `4097`. |
| `--username <name>` and `--password <value>` | Basic Auth. Environment variables are safer for real passwords. |
| `--root <path>` | Allowed directory root. Repeat for multiple roots. Windows can use `C:\` to allow the whole C drive. |
| `--cors <origin>` | Allow one exact browser or native WebView origin. Repeat as needed. |
| `--state-dir <path>` | Store bridge-local snapshots and session metadata elsewhere. |
| `--acp-command <path>` and `--acp-arg <value>` | Replace the default `omp acp` command when using another ACP adapter. |
| `--log-requests` | Log limited request paths for local debugging. It does not print prompts or assistant replies. |

The bridge also accepts the matching `HARNESS_REMOTE_*` environment variables. The legacy `OMP_BRIDGE_*` names are still accepted as compatibility aliases.

## iOS build and installation

The generated iOS project is ignored and must be created on a Mac. The repository does not publish an App Store or TestFlight build.

Requirements:

- macOS with Xcode 26 or newer.
- iPhone running iOS 15 or newer.
- Node.js 22.12 or newer.
- An Apple signing identity accepted by Xcode.
- A sideloader of your choice that can install the exported IPA.

On the Mac:

```bash
cd web
npm install
npm run build
npm run cap:add:ios       # first generation only
npm run cap:sync:ios
open ios/App/App.xcodeproj
```

On later builds, run `npm run build` and `npm run cap:sync:ios`. Do not run `cap:add:ios` again unless `web/ios/` was removed.

In Xcode, select the App target, choose the signing team, select an iPhone or **Any iOS Device**, archive the project, and export an IPA. Load that IPA onto the iPhone with the sideloader of your choice. The signing profile determines how long the installation remains valid. Free Apple IDs commonly require periodic re-signing.

After installation, verify the native path on the actual iPhone. An Xcode archive alone does not verify networking:

1. Direct LAN bridge: health, capabilities, create a session, select it, prompt, stream, abort, and reconnect.
2. Direct Tailscale bridge: repeat the same sequence through the HTTPS Tailscale Serve hostname on port `443`.
3. Collab writable: attach a disposable `/collab` link, receive live output, prompt, abort, and answer a request.
4. Collab read-only: attach a room-key-only link and confirm live output with no mutation controls.
5. Keychain: relaunch with an attachment, confirm it returns, detach it, relaunch again, and confirm it stays removed.

Re-run direct fetch and SSE checks after every relevant Capacitor, iOS, WebKit, or networking change.

## Web and PWA use

The web build is useful for desktop development and for the secondary OpenCode, PI, and Claude Code backends. Native iOS does not expose those backend choices.

Run locally from the repository root:

macOS or Linux:

```bash
cd web
npm install
npm run dev
```

Windows PowerShell:

```powershell
Set-Location C:\path\to\harness-remote\web
npm install
npm run dev
```

Open the printed URL. For browser access to a remote bridge, add the exact browser origin with `--cors`. The hosted HTTPS PWA cannot call a plain `http://` LAN host because of browser mixed-content rules. Use the native iOS app, HTTPS, a trusted tunnel, or a locally hosted HTTP build instead.

### Secondary backends

- **OpenCode** remains available in web and PWA builds through its HTTP server.
- **PI** remains available in web and PWA builds through the pinned `@automatalabs/pi-acp@0.2.5` bridge adapter.
- **Claude Code** remains available in web and PWA builds through the pinned `@agentclientprotocol/claude-agent-acp@0.63.0` bridge adapter.

These are secondary web paths. They are not available in the native iOS build and are not the priority of this repository cutover.

## Development and verification

Install web dependencies once:

```bash
cd web
npm install
```

The Collab contract suite also requires Bun because `npm run test:collab` invokes it directly.

Run the complete automated matrix from the repository root.

macOS or Linux:

```bash
cd bridge
npm test
cd ../web
npm run build
npm run test:i18n
npm run test:config
npm run test:ui
npm run test:settings
npm run test:model
npm run test:events
node --experimental-strip-types src/directSession.test.mjs
node --experimental-strip-types src/secureStorage.test.mjs
node src/ios-native-sync.test.mjs
node src/ios-packaging.test.mjs
npm run test:collab
```

Windows PowerShell:

```powershell
Set-Location C:\path\to\harness-remote\bridge
npm test
Set-Location ..\web
npm run build
npm run test:i18n
npm run test:config
npm run test:ui
npm run test:settings
npm run test:model
npm run test:events
node --experimental-strip-types src/directSession.test.mjs
node --experimental-strip-types src/secureStorage.test.mjs
node src/ios-native-sync.test.mjs
node src/ios-packaging.test.mjs
npm run test:collab
```

The bridge tests cover ACP translation, authentication, roots, lifecycle, and session behavior. The web tests cover configuration, direct sessions, iOS packaging assumptions, Keychain boundaries, UI behavior, and Collab wire ordering and permissions.

## Security and known limits

- Use Basic Auth on every non-loopback bridge listener.
- Use an explicit `--root` and expose port `4097` only to a trusted LAN or tailnet.
- Tailscale does not replace bridge authentication.
- `--root` limits bridge browsing and new-session selection, not the OMP process's host privileges.
- Do not log or paste Collab links into bug reports. They are bearer secrets.
- Collab custom relays outside loopback must use `wss://`.
- Collab runtime snapshots remain in memory. Attachment links persist only in iOS Keychain.
- The direct bridge only streams events from its own ACP process. Use `/collab` for live desktop-session sharing.
- There is no APNs background stream, global desktop-session discovery, OMP database inspection, or central service.

## Project layout

```text
bridge/                 Node standard-library HTTP/SSE to ACP bridge
web/src/                React application and transport adapters
web/src/collab/         OMP Collab link, crypto, WebSocket, and adapter code
web/native-ios/         Swift Keychain source copied during iOS sync
web/ios/                Generated Xcode project, ignored by Git
docs/DEPENDENCIES.md    Protocol and dependency assumptions
CONTRIBUTING.md         Contributor setup and verification details
```

For protocol assumptions, read [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md). For contribution rules and the complete manual iPhone matrix, read [CONTRIBUTING.md](CONTRIBUTING.md). The historical OMP integration notes are in [OMP-INTEGRATION-PLAN.md](OMP-INTEGRATION-PLAN.md).
