# In-app Help redesign

## Goal

Replace the inherited, OpenCode-centric Help content with a concise operational guide for the current Harness Remote app. The guide must support every exposed backend and connection mode while giving especially useful symptom-based troubleshooting.

## Audience

Help serves all supported modes:

- native iOS using the OMP bridge and OMP Collab;
- responsive web and desktop;
- OMP, PI, Claude Code, and OpenCode backends;
- direct LAN, Tailscale Serve, and Collab connections.

Repository documentation remains the detailed source of truth. In-app Help explains the shortest path to operate and recover the app.

## Navigation

Replace the five tabs `Overview`, `Server`, `Network`, `Troubleshooting`, and `Commands` with four tabs:

1. `Quick Start`
2. `Connections`
3. `Troubleshooting`
4. `Commands`

The corresponding Help state is `quick-start | connections | troubleshooting | commands`. Tab labels remain translated in English, Italian, and Traditional Chinese. Body copy remains English, matching the existing Help implementation.

## Quick Start

Remove the inherited feature-marketing list. Explain the current user flow:

1. Open Settings and enter the host, port, username, and password.
2. Test the connection; configuration continues to save automatically.
3. Open Sessions, refresh or search, and create a session when the selected backend supports it.
4. Use a session's More action for rename/delete/detach where available.
5. Open the conversation, choose AI/session details when needed, and send prompts or server commands.
6. For an existing desktop OMP session, run `/collab` in that session and attach its bearer link in Harness Remote.

Desktop-only sidebar and hover guidance stays conditional on non-iOS desktop layouts. Native iOS guidance uses the Sessions, Settings, and Help tabs and does not mention the removed Detail tab.

## Connections

Merge the old Server and Network pages.

### Backend-aware setup

- OMP, PI, and Claude Code use the repository bridge, port `4097` by default, and an explicit `--backend` value.
- Native iOS exposes OMP as its direct backend.
- OpenCode uses its server on port `4096`.
- Commands and copy derive from `config.backend`; no page may claim every backend is OpenCode.

### Connection modes

- LAN: bind the bridge/server to an address reachable by the phone, use the host's LAN address, and allow the selected port through the host firewall.
- Remote: recommend Tailscale Serve with the generated HTTPS MagicDNS hostname and port `443`. Do not recommend public NAT/port-forward exposure.
- OMP Collab: explain that `/collab` shares an arbitrary desktop OMP session, direct bridge and Collab cards are distinct, bearer links are secrets, and native iOS persists attachments in Keychain.

### Security

Keep Basic Auth enabled, use strong credentials, constrain browsing with `--root`, use exact CORS origins, require `wss://` for non-local custom Collab relays, and never expose the bridge directly to the public internet.

Link to `https://github.com/sidph0/harness-remote` for full setup and build instructions. Remove the inherited `giuliastro` link and obsolete anchors.

## Troubleshooting

Organize content by visible symptom.

### Diagnostic order

1. Run Test Connection in Settings.
2. Check the backend locally on its host.
3. Check the same address through LAN or Tailscale.
4. Interpret the response before changing configuration.

Health examples are backend-aware:

- bridge backends: default port `4097`, `/v1/health`, configured bridge username;
- OpenCode: default port `4096`, `/global/health`, configured OpenCode username.

On Windows, say to use `curl.exe` rather than the PowerShell `curl` alias.

### Symptoms

- **Cannot reach the backend:** verify the process is running, host/port, `0.0.0.0` binding for LAN, firewall, both Tailscale clients, and the bridge terminal.
- **401 Unauthorized:** the network path works; correct username/password and restart the bridge after credential changes.
- **Wrong backend or capabilities mismatch:** ensure Settings and the bridge `--backend` agree.
- **Works in Safari/browser but not native iOS:** prefer Tailscale Serve HTTPS on port `443`; direct Tailscale `100.x.x.x` HTTP can fail in native iOS.
- **CORS error or Live updates reconnecting:** allow the exact browser origin and `capacitor://localhost`; health requests succeeding does not prove authenticated SSE is allowed.
- **Sessions missing or not updating:** refresh, confirm the bridge ACP process, and explain that arbitrary desktop OMP sessions require `/collab`; there is no automatic desktop-session discovery.
- **Folder rejected:** restart the bridge with a `--root` that contains the folder.
- **Collab missing/read-only/not persisting:** verify the bearer link and desktop handshake; read-only links intentionally hide mutation controls; native persistence requires the Keychain plugin.
- **Models, agents, or commands unavailable:** reconnect, refresh AI options/Commands, and verify the selected backend/provider supports them.

Do not recommend generic router port forwarding or imply that every issue uses port `4096`.

## Commands

Explain that:

- commands are loaded dynamically from the selected backend after connection;
- typing `/name arguments` sends the command to the active session;
- Enter sends and Shift+Enter inserts a new line;
- the Server Commands and Skills filters show only capabilities reported by the current backend.

Remove hardcoded examples such as `/help`, `/commands`, `/skills`, and `/status`, because availability is backend-specific. The empty state says to connect to the selected backend and refresh Commands.

## Implementation scope

Expected production files:

- `web/src/App.tsx`
- `web/src/i18n.ts`

Expected regression files:

- `web/src/settings-regression.test.mjs`
- `web/src/i18n.test.mjs` only if its key contract requires adjustment.

No new component hierarchy, diagnostics engine, dependency, network request, or documentation loader is introduced. Reuse the existing Help tabs and content styling.

## Verification

- Regression test first proves the obsolete repository link and five-tab state still exist.
- Focused Help/settings/i18n checks pass after implementation.
- Production build passes.
- Browser verification at 390×844 native iOS and desktop web confirms four tabs, correct active-tab semantics, no horizontal overflow, platform-appropriate Quick Start copy, current repository link, backend-aware Connections/Troubleshooting content, and dynamic Commands behavior.
- Troubleshooting is checked with OMP and OpenCode configurations so ports, health paths, and backend names change correctly.
- Non-iOS desktop layout guidance remains present only where applicable.
