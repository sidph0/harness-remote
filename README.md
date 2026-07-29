# Harness Remote

Harness Remote is a companion app for controlling coding-agent harnesses from phone or desktop, even when you are not at your main workstation.
It is designed to make daily usage simple: connect to a backend, check active sessions, see progress, send new prompts or slash commands, and stop a running action when supported.

## Supported Harnesses

The web and PWA builds offer all four backends: pick the harness in **Settings**, and each one keeps its own saved connection. The sideloaded iOS app is intentionally OMP-only, with direct bridge sessions and OMP Collab attachments.

| Harness | Status | How it connects |
|---|---|---|
| [OpenCode](https://github.com/sst/opencode) | supported | directly to the OpenCode HTTP server |
| [Oh My Pi (OMP)](https://omp.sh/) | supported | through the local bridge included in this repository |
| [PI](https://pi.dev/) | supported | through the local ACP bridge and the [`@automatalabs/pi-acp`](https://www.npmjs.com/package/@automatalabs/pi-acp) adapter |
| [Claude Code](https://code.claude.com/) | supported | through the local ACP bridge and the [`@agentclientprotocol/claude-agent-acp`](https://www.npmjs.com/package/@agentclientprotocol/claude-agent-acp) adapter |

What each harness actually provides, the assumptions the code makes about it, and what to re-check
when one of them changes are recorded in [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).

Support levels differ by what each harness exposes. The [OpenCode](#opencode-server-setup), [OMP](#oh-my-pi-bridge-setup), [PI](#pi-bridge-setup), and [Claude Code](#claude-code-bridge-setup) sections below document the setup and per-backend limitations.

> **Note for AI/harness systems**: This repository is self-documenting. To configure a supported harness and the app autonomously, point your AI assistant to this repository URL (`https://github.com/giuliastro/harness-remote`) or this README and ask it to set up Harness Remote. Each supported harness has its own setup section below, and adding a harness means adding a backend entry plus its section.

## Screenshots

<!-- A raw table with 50% columns, rather than a markdown one: GitHub sizes markdown table columns
     from their content, and "Sessions" is a wider heading than "Detail", so that column took ~14px
     more and each screenshot scaled to fill whichever column it landed in — the right one rendered
     visibly smaller. Pinning the columns keeps the pair identical at any viewport width, which a
     fixed width on the images alone does not: max-width: 100% still clamps each to its own cell. -->

<table>
  <tr>
    <th width="50%">Sessions</th>
    <th width="50%">Detail</th>
  </tr>
  <tr>
    <td><img src="docs/screenshots/sessions.jpg" alt="Sessions list showing connection status, session cards with relative timestamps, and rename and delete actions"></td>
    <td><img src="docs/screenshots/detail.jpg" alt="Session detail showing the model chip, a collapsed reasoning bubble, an assistant reply, and the composer"></td>
  </tr>
</table>

## What It Can Do

In the web and PWA builds, everything in the first group works on all four harnesses. The rest
depends on what the harness exposes, so each entry says where it applies; the app hides what a
backend cannot do rather than offering a control that fails.

- configure and test the connection to any supported harness — OpenCode, OMP, PI, or Claude Code — each with its
  own saved credentials
- browse and monitor sessions (`idle`, `busy`, `retry`)
- open a session and read messages and progress
- send prompts from the chat input, including a follow-up typed while the agent is still working
- stop running work when necessary
- pick the model a session uses
- browse the filesystem to choose the working directory for a new session
- adapt to the screen: touch-friendly bottom navigation on a phone, a two-pane sidebar layout on a
  wide screen (see [Desktop Mode](#desktop-mode))
- jump to the top or the bottom of a long transcript or session list without dragging through it
- play a completion sound when a running session finishes
- switch UI language between English, Italian, and Traditional Chinese, and the theme between light,
  dark, and system

Depending on the harness:

- answer the questions the agent asks, options or free text, without leaving the app — OpenCode
- follow todo/plan updates as the agent works — OpenCode, OMP, Claude Code
- send server `/commands` — OpenCode
- choose the agent a session runs as — OpenCode
- review changed files and their diffs — OpenCode
- rename and delete sessions — OpenCode changes them in the harness; on OMP, PI and Claude Code the
  same controls keep a bridge-local nickname and hide the session from that bridge only

## Desktop Mode

The app is one build with two layouts. There is no switch to flip and no separate desktop
download: open it in a window at least 781px wide and it rearranges itself into a two-pane
desktop layout. Narrow the window below that and it goes back to the phone layout, live.

| | Phone layout | Desktop layout |
|---|---|---|
| Navigation | bottom nav, one view at a time | permanent left sidebar next to the chat |
| Sessions | full-screen list, tap to open | compact rows in the sidebar, always visible |
| Settings / Help | own full-screen views | modal over the chat, so the session stays put |
| Session status | `idle` / `busy` / `retry` pill | animated accent bar on the row, only while busy or retrying |

### Using it

1. Serve the web app — `npm run dev` in `web/` during development, or any static host for a
   `npm run build` bundle. The native iOS build uses the same React app.
2. Open it in a desktop browser. Above 781px the sidebar appears and the first session opens by
   itself, so you land in a conversation rather than on an empty pane.
3. Pick sessions from the sidebar. Hovering a row reveals its rename and delete icons; the
   session you are reading stays highlighted while you browse the rest.
4. Drag any of the three vertical borders to resize: the sidebar's outer edge, the divider between
   the two panes, and the chat's outer edge. The sidebar accepts 220–480px and the chat 420–1400px.
   Both widths are remembered per browser and are clamped back inside the window if you later open
   the app on a smaller screen.
5. Use the floating arrow buttons at the bottom right of a long transcript or session list to jump
   to either end. They only appear when there is enough scrolling left to be worth it, and jumping
   to the top also releases the chat's auto-follow so incoming output stops yanking the view down.

Everything else — prompts, slash commands, stopping a run, model and agent selection, todos,
diffs — behaves exactly as it does in a phone browser. The web/PWA backend setup is identical in
both layouts; the sideloaded iOS app remains OMP-only.

## Progressive Web App (PWA)

The web app is installable and is published straight from this repo via GitHub Pages, at
https://giuliastro.github.io/harness-remote/. Open that URL over HTTPS and browsers will offer to
add it to the home screen / app list, opening in its own standalone window.

It is redeployed on every merge to `main` that touches `web/`, so it carries the current tip of the
branch rather than a separately cut native build. Use it to try the web path; the iOS app is built
and sideloaded from this checkout using the steps below.

The deploy runs the web regression suites first, so a merge that breaks them does not reach the URL.

- A service worker caches the app shell (`index.html`, the manifest, and the icons) plus other
  same-origin static assets on a stale-while-revalidate basis, so the UI still loads offline or on
  a flaky connection after the first visit.
- Requests to your harness server are never cached — they go to whatever host you configured in
  Settings, cross-origin from wherever the PWA itself is hosted, so session data always comes from
  the live server.
- The service worker is skipped entirely in the native iOS app (Capacitor) and in local dev builds;
  it only registers in production web builds.

Because the app talks to your server cross-origin, the server needs the PWA's origin listed
in `--cors`:

```bash
npx -y opencode-ai serve --hostname 0.0.0.0 --port 4096 --cors https://giuliastro.github.io
```

### The hosted PWA cannot reach a plain-http server on your LAN

CORS is only the second obstacle. The first is that the hosted app is served over HTTPS, and an
HTTPS page is not allowed to talk to an `http://` address unless that address is loopback:

- `http://localhost:4096` and `http://127.0.0.1:4096` work — browsers treat loopback as
  trustworthy. Good enough when the server runs on the same machine as the browser.
- `http://192.168.1.64:4096` is refused as mixed content, *before the request is sent*. The
  server never sees it, so no amount of `--cors` helps, and the app can only report
  `Failed to fetch`. Settings shows a warning next to the host field when the address you typed
  falls into this case.

So the phone-to-computer setup — the reason this app exists — needs one of:

- **the sideloaded iOS app** built below. Ordinary Capacitor native HTTP requests are not subject to
  browser mixed-content or CORS restrictions, so this is the recommended iPhone route. The OMP
  bridge's authenticated SSE stream is the exception described in its setup below.
- **HTTPS on the server**, via a reverse proxy holding a certificate the phone trusts.
- **a tunnel** (Tailscale Serve, Cloudflare Tunnel, ngrok) that gives the server its own HTTPS
  origin — remember to add that origin to `--cors`.
- **self-hosting this build over plain http** on your LAN, e.g. `npm run preview -- --host` in
  `web/`. An `http://` page may talk to an `http://` server freely; you lose installability and
  the service worker, both of which require a secure context.

## Technology Stack

- frontend: React + TypeScript + Vite
- mobile packaging: Capacitor 8 for iOS 15+; native builds require Xcode 26+
- networking: direct OpenCode HTTP, the local HTTP/SSE ACP bridge for OMP, PI, and Claude Code,
  plus encrypted WebSocket attachment to OMP Collab
- OMP Collab wire protocol: [`@oh-my-pi/pi-wire`](https://www.npmjs.com/package/@oh-my-pi/pi-wire), pinned to `17.1.8`
- i18n: lightweight custom i18n module with English, Italian, and Traditional Chinese

## Install on iPhone

There is no prebuilt download or App Store/TestFlight channel. Build an IPA on a Mac and install it
with Sideloadly by following [iOS Sideload Build](#ios-sideload-build).

## Harness Setup

### OpenCode Server Setup

Start the OpenCode server with network access and Basic Auth.

macOS / Linux (bash/zsh):

```bash
OPENCODE_SERVER_USERNAME=opencode OPENCODE_SERVER_PASSWORD=your-password npx -y opencode-ai serve --hostname 0.0.0.0 --port 4096
```

Windows PowerShell:

```powershell
$env:OPENCODE_SERVER_USERNAME="opencode"
$env:OPENCODE_SERVER_PASSWORD="your-password"
npx -y opencode-ai serve --hostname 0.0.0.0 --port 4096
```

Windows cmd:

```cmd
set OPENCODE_SERVER_USERNAME=opencode
set OPENCODE_SERVER_PASSWORD=your-password
npx -y opencode-ai serve --hostname 0.0.0.0 --port 4096
```

For browser-based web debugging, add CORS origins as needed:

```bash
npx -y opencode-ai serve --hostname 0.0.0.0 --port 4096 --cors http://localhost:5173 --cors http://127.0.0.1:5173
```

The sideloaded iOS app does not expose OpenCode; use this setup with the web or PWA build, which
needs every exact browser origin allowed.

If you use browser mode from another host/IP, include both localhost and your dev host:

```powershell
npx -y opencode-ai serve --hostname 0.0.0.0 --port 4096 --cors http://localhost --cors http://localhost:5173 --cors http://<YOUR_PC_IP>:5173
```

If remote/mobile cannot connect, open TCP 4096 in your OS firewall and network firewall/NAT.

### Oh My Pi Bridge Setup

Harness Remote connects to OMP through the bridge included in this repository. The bridge starts `omp acp` on the same computer and translates its ACP stdio protocol to the app's HTTP/SSE API. To show sessions created by another OMP process without loading and interrupting them, it reads the append-only user/assistant transcript under OMP's session directory; it does not modify OMP state.

#### Prerequisites

- Node.js 20 or newer;
- a working `omp` command in `PATH`;
- a checkout of this repository on the computer that runs OMP.

For direct access on a trusted LAN, start the bridge from the repository root. Restrict every
worktree that the iPhone may access with `--root`; repeat the option to allow more than one root.

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

The default ACP launch is `omp acp`. The bridge can launch another ACP adapter with `--acp-command` and repeatable `--acp-arg` options, for example:

```bash
npx --yes ./bridge \
  --acp-command npx \
  --acp-arg -y \
  --acp-arg @automatalabs/pi-acp@0.2.5
```

The preferred environment variables are `HARNESS_REMOTE_ACP_COMMAND` and
`HARNESS_REMOTE_ACP_ARGS`, where the latter is a JSON array of strings.
Existing `OMP_BRIDGE_*` names remain aliases for one compatibility release.
The PI setup below selects the adapter and the matching app backend automatically.

The default bind address is `127.0.0.1`. A phone connection requires a non-loopback bind such as
`0.0.0.0`. This guide requires credentials and an explicit `--root` for every such connection. The
CLI enforces only the username and password; if `--root` is omitted, it allows the current working
directory. Do not rely on that default for phone access.

#### Configure the app

1. On web/PWA, in **Settings**, select **Oh My Pi (bridge)**. The native iOS app is already fixed to OMP, so it has no backend selector.
2. Enter the computer's LAN or VPN address, port `4097`, and the same Basic Auth credentials.
3. Select **Test connection**. A healthy bridge reports the installed OMP version.
4. Create or open a session, then send a prompt. The user message appears immediately, followed by streamed assistant output.

To verify the bridge from the host before configuring the app, let `curl` prompt for the password so
it does not appear in the command line or shell history:

```bash
curl --user omp http://127.0.0.1:4097/v1/health
```

Expected response:

```json
{"healthy":true,"backend":"omp","version":"…"}
```

OMP sessions expose their configured model when ACP provides it, and model changes apply to subsequent prompts. Agent selection, server slash commands, and VCS/diff are intentionally unavailable.

A prompt sent while the agent is still working is queued rather than refused: it appears in the conversation
straight away and runs when the current turn ends. Stopping the session discards anything still queued.

Session titles come from the title you give a session in the app, otherwise from its first prompt; sessions created outside the app are listed with a generated `Session <id>` title when the ACP listing carries no title.

Rename and delete use the same controls as OpenCode, but they are bridge-local metadata: a rename is a
nickname and a delete hides the session from this bridge only. Both live under the bridge's state
directory, so clearing or moving `--state-dir` restores the harness title and makes hidden sessions
visible again. ACP defines no physical session deletion, so the native OMP history stays intact and
remains visible to desktop clients.

#### Tailscale access

Tailscale provides routing only; the bridge's Basic Auth remains required.

1. Install Tailscale separately on the bridge host and the iPhone, sign in on both, and confirm they
   are on the same tailnet.
2. Start the bridge on a non-loopback address with an explicit allowed root and credentials:

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

3. In Harness Remote, use the host's Tailscale MagicDNS name or tailnet IP, port `4097`, and those
   same bridge credentials. Restrict the host firewall to the tailnet where possible.

Harness Remote does not install, sign in to, or authenticate Tailscale. Do not publish port `4097`
to the Internet; a tailnet connection does not replace bridge authentication or `--root`.

#### Attach an OMP Collab session

OMP Collab is a separate path for following the arbitrary OMP session already running on your
desktop; it does not use or discover the bridge's session list.

1. Run `/collab` in that desktop OMP session and copy the bearer link it prints.
2. On the iPhone, choose **Attach OMP Collab**, enter the required display name, paste the link, and
   attach. There is no automatic global discovery or account lookup.

Treat the link as a password. It contains the room key and, for a writable link, an optional write
token. Harness Remote connects over WebSocket and encrypts frames with AES-256-GCM using a 12-byte
IV. Custom non-local relays must use `wss://`; do not downgrade them to plaintext WebSocket.
Snapshots stay in memory. Saved attachment links persist only in the iOS Keychain, not browser
storage. A writable link exposes prompt, abort, and reply controls; a read-only link exposes no
mutation controls at all — prompt, abort, and reply controls are absent — while it follows live
output. Remove an attachment when the phone should no longer retain its bearer link.

#### What `--root` does and does not restrict

`--root` restricts the bridge's own surface: which directories the app may browse (`/file`, `/path`) and which working directory a new session may use. It is not a sandbox for the agent. Once a session is running, OMP executes with your full user privileges and approves its own tool calls, so it can read and write outside the configured roots exactly as it would on the desktop. Point the bridge only at machines and accounts where you would already let OMP work unattended.

#### Browser access

Ordinary Capacitor HTTP requests bypass browser CORS, but authenticated SSE in the sideloaded app
uses WebView `fetch`. Native direct and Tailscale bridge launches therefore must allow the exact
`capacitor://localhost` origin, as shown above. For browser access, also list each exact browser
origin with repeatable `--cors` options; no origin is allowed by default:

```bash
export HARNESS_REMOTE_USERNAME=omp
printf 'Bridge password: '; read -s HARNESS_REMOTE_PASSWORD; printf '\n'; export HARNESS_REMOTE_PASSWORD
npx --yes ./bridge --port 4097 --root "$HOME/Software" \
  --cors http://localhost:5173
unset HARNESS_REMOTE_PASSWORD
```

#### Live synchronization scope

The bridge streams `busy`, assistant chunks, todos, and completion for work started through that same bridge. Sessions created by desktop OMP or another client are listed with their persisted history and remain writable: the first prompt from the app loads that session into the bridge's ACP process and continues it there. This supports sequential hand-off between desktop and mobile, including sessions created days earlier.

OMP ACP does not expose a global cross-client event feed, shared running-status API, or session lock. Concurrent desktop and app turns are accepted, and the bridge merges newly persisted OMP transcript branches into the app during polling so neither client's messages disappear. The two agent processes still run independently: response order and the context seen by each turn can branch. Sequential hand-off is deterministic; simultaneous use is supported for visibility but cannot provide server-level turn serialization.

The bridge keeps its last successful message/todo snapshot and bridge-local session nicknames/archive state under `~/.harness-remote/<backend>/`. This prevents an empty or partial ACP replay from erasing the app's conversation after navigation or a bridge restart. Use `--state-dir <path>` or `HARNESS_REMOTE_STATE_DIR` to relocate this state; deleting or replacing that directory also discards bridge-local renames and hidden-session records.

Do not expose the bridge directly to the Internet. Use Tailscale, another VPN, or a TLS-terminating reverse proxy, and open port `4097` only to the network that needs it.

### PI Bridge Setup

Harness Remote connects to PI through the same ACP bridge, using the community
[`@automatalabs/pi-acp`](https://www.npmjs.com/package/@automatalabs/pi-acp)
adapter, which embeds PI through its published SDK and speaks ACP over stdio.
The bridge starts the adapter and translates ACP into the HTTP/SSE API used by
the app.

#### Prerequisites

- Node.js 22.19 or newer, as required by the adapter. Nothing here needs Bun: the other
  widely referenced adapter, `@victor-software-house/pi-acp`, declares `engines.bun` and shells
  out to `bun`, which is why this project does not use it;
- a working `pi` command, with its provider credentials already configured — the bridge
  authenticates with PI's stored credentials rather than reading an API key from the environment;
- a checkout of this repository on the computer that runs the bridge.

Start the bridge from the repository root:

```bash
export HARNESS_REMOTE_USERNAME=pi
printf 'Bridge password: '; read -s HARNESS_REMOTE_PASSWORD; printf '\n'; export HARNESS_REMOTE_PASSWORD
npx --yes ./bridge \
  --backend pi \
  --host 0.0.0.0 \
  --port 4097 \
  --root "$HOME/Software"
unset HARNESS_REMOTE_PASSWORD
```

The `pi` backend defaults to `npx -y @automatalabs/pi-acp@0.2.5`. The version is pinned
deliberately: an unpinned default failed with `notarget` when an upstream release appeared in
the registry index before its tarball could be fetched. Use `--acp-command` and repeated
`--acp-arg` options to track a newer adapter, or to launch one installed globally or from a
local checkout. The first start downloads the adapter, which is why the handshake allows 90s.

In the web or PWA app, select **PI (ACP bridge)** and enter the same host, port, username,
and password. A successful health check reports `backend: "pi"` and the
adapter version.

PI supports session listing, history replay, streaming prompts, cancellation,
queued follow-up prompts, model selection, and bridge-local rename/delete.
Plan/todo updates, server slash commands, and VCS/diff are not currently exposed
through this bridge.

The nickname and hidden-session records live under the bridge state directory:
clearing or moving it restores PI's native title and listing. ACP does not define
physical session deletion, so deleted sessions remain in PI's own history.

Unlike OMP, PI's adapter asks before each tool call. **The bridge grants those requests
automatically**, choosing the broadest allow option the adapter offers, because there is no way
to prompt you on the phone mid-turn and a refusal silently prevents PI from doing any work at
all. The practical effect matches OMP, which approves its own tool calls without asking: an
agent reached through this bridge edits files unattended.

The bridge's `--root` restriction applies to directory browsing and new-session
selection; it is not a sandbox for PI. The adapter still runs with the full
filesystem privileges of the account that launched it. Do not expose the
bridge directly to the Internet; use a trusted LAN, VPN, or TLS-terminating
reverse proxy.

### Claude Code Bridge Setup

Harness Remote connects to Claude Code through the same ACP bridge, using the official
[`@agentclientprotocol/claude-agent-acp`](https://www.npmjs.com/package/@agentclientprotocol/claude-agent-acp)
adapter, which wraps the Claude Agent SDK and speaks ACP over stdio.

#### Prerequisites

- Node.js 22 or newer (same requirement as the PI adapter);
- a working `claude` command, authenticated via `claude login` (OAuth) — a subscription login
  is sufficient and does not require `ANTHROPIC_API_KEY`;
- a checkout of this repository on the computer that runs Claude Code.

Start the bridge from the repository root:

```bash
export HARNESS_REMOTE_USERNAME=claude
printf 'Bridge password: '; read -s HARNESS_REMOTE_PASSWORD; printf '\n'; export HARNESS_REMOTE_PASSWORD
npx --yes ./bridge \
  --backend claude \
  --host 0.0.0.0 \
  --port 4097 \
  --root "$HOME/Software"
unset HARNESS_REMOTE_PASSWORD
```

The `claude` backend defaults to `npx -y @agentclientprotocol/claude-agent-acp@0.63.0`.
The version is pinned to avoid the same `notarget` issue that motivated pinning the
PI adapter. Use `--acp-command` and repeated `--acp-arg` options to track a newer
adapter. The first start downloads the adapter, which is why the handshake allows 90s.

In the web or PWA app, select **Claude Code (ACP bridge)** and enter the same host, port,
username, and password. A successful health check reports `backend: "claude"`
and the adapter version.

Claude Code supports session listing, history replay, streaming prompts,
cancellation, queued follow-up prompts, todo/plan updates as the agent works, and
model selection. The picker offers whatever the adapter reports — Default, Sonnet,
Fable, Opus with 1M context, Haiku — each with the version it stands for, so
"Sonnet" reads as `Sonnet 5 · Efficient for routine tasks`. Agent selection, server
slash commands, and VCS/diff are not currently exposed through this bridge.

The adapter also advertises a permission `mode` and an `effort` level, which the app
does not use yet.

**Rename and delete are bridge-local.** Renames persist in `~/.harness-remote/claude/`
and survive bridge restarts, but are not propagated to the `claude` CLI itself.
Deletion hides the session from this bridge and clears its cached data; it does
not erase Claude Code's own history on disk. Deleted sessions reappear if the
bridge is started from a fresh state directory.

**Session visibility is not restricted by `--root`.** The bridge enumerates all
Claude Code sessions on the machine, potentially spanning every repository the
user has ever worked in. Anyone holding the bridge credentials can list and read
every past conversation. The `--root` option only governs directory browsing and
new-session cwd, not which sessions are visible.

Like PI, the Claude Code adapter asks before each tool call. **The bridge grants
those requests automatically** — there is no way to prompt on the phone mid-turn
and a refusal would silently prevent the agent from working. An agent reached
through this bridge edits files unattended.

The adapter still runs with the full filesystem privileges of the account that
launched it. Do not expose the bridge directly to the Internet; use a trusted
LAN, VPN, or TLS-terminating reverse proxy.

## Run Locally (Web)

```bash
cd web
npm install
npm run dev
```
Open the shown URL from your browser (or your phone on the same LAN). A desktop browser window
gets the two-pane layout described in [Desktop Mode](#desktop-mode); a phone gets the phone layout.

## iOS Sideload Build

You need Node.js 22.12 or newer, a Mac with Xcode 26 or newer, an iPhone running iOS 15 or newer,
an Apple ID accepted by Xcode/Sideloadly, and [Sideloadly](https://sideloadly.io/) installed.
`web/ios/` is generated and ignored; do not expect it in a fresh checkout.

### Generate and synchronize the Xcode project

```bash
cd web
npm install
npm run build
npm run cap:add:ios       # first generation only
npm run cap:sync:ios
open ios/App/App.xcodeproj
```

On later builds, run `npm run build` and `npm run cap:sync:ios`; do not run `cap:add:ios` again.

### Archive and export the IPA

1. In Xcode, select the **App** target, choose your development team under **Signing &
   Capabilities**, and set a bundle identifier accepted by that team.
2. Select **Any iOS Device (arm64)** as the run destination.
3. Choose **Product > Archive**.
4. In Organizer, select the new archive, choose **Distribute App > Custom > Development**, and
   export the signed `.ipa` to a local folder. This project does not use the App Store or TestFlight
   workflow.

### Install with Sideloadly

1. Connect the iPhone to the Mac, unlock it, and trust the computer.
2. Open Sideloadly, select the iPhone, drag in the exported IPA, enter the signing Apple ID, and
   choose **Start**. Complete any Apple sign-in or two-factor prompt.
3. If iOS asks, enable **Developer Mode** and trust the signing profile under **Settings > General >
   VPN & Device Management**, then launch Harness Remote.

The installation remains valid only as long as its Apple signing profile. Free Apple IDs commonly
require re-signing and reinstalling every seven days; paid-account validity follows the profile
Sideloadly creates.

### iPhone smoke check

Do not treat a successful archive as network validation. On the installed app:

- **Direct OMP bridge:** test the connection, create a session under an allowed `--root`, select it,
  send a prompt and observe streamed output, stop an active turn, then interrupt and restore the
  network (or background/foreground the app) and confirm it reconnects.
- **OMP Collab writable link:** attach the link, observe live desktop output, then verify prompt,
  abort, and reply controls against a disposable session.
- **OMP Collab read-only link:** attach it and confirm live output arrives while prompt, abort, and
  reply controls are absent.
- **Keychain lifecycle:** attach a Collab link, relaunch and confirm it remains attached, then detach
  it, relaunch again, and confirm it remains removed.

Re-run the direct fetch/SSE smoke check after every relevant Capacitor or iOS networking change.

## App Configuration

Use your server values:

- Backend (web/PWA): OpenCode, OMP, PI, or Claude Code; the choice also decides the default port
- Backend (sideloaded iOS): fixed to OMP, with direct bridge and Collab attachment paths
- Host: computer LAN IP (for example `192.168.1.20`)
- Port: `4096` for an OpenCode server, `4097` for the bridge in front of OMP, PI, or Claude Code
- Username/password: the Basic Auth credentials you started that server or bridge with

The web and PWA builds keep a separate saved connection for each backend, so switching in Settings
does not make you retype anything.

For remote use, prefer Tailscale or another trusted VPN. Never expose an ACP bridge directly to the
public Internet.

## Main Endpoints Used

Against an OpenCode server, spoken directly: `/global/health`, `/global/event`, `/session*`
(including `/session/:id/message`, `/command`, `/abort`, `/todo`, `/diff`), `/experimental/session`,
`/config/providers`, `/command`, `/agent`, `/project/current`, `/vcs`, `/path`, `/file*`, and
`/question*`.

For OMP and PI the bridge implements a deliberate subset of those paths, plus its own `/v1/health`
and `/v1/capabilities` — which is how the app learns what a harness can do and hides the rest, rather
than calling something that 404s. [CONTRIBUTING.md](CONTRIBUTING.md) lists exactly what the bridge
does and does not answer.

What each harness actually provides behind those paths, and what to re-check when one of them
changes, is in [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).

## Contributing

Setup, the checks CI expects, how the regression suites work, and the rules that every change has to
hold on more than one harness and in both layouts are all in [CONTRIBUTING.md](CONTRIBUTING.md).
