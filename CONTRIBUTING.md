# Contributing to Harness Remote

Thanks for wanting to work on this. Harness Remote is a companion app for driving coding-agent
harnesses from a phone or a desktop browser. The web/PWA supports OpenCode, Oh My Pi (OMP), PI, and
Claude. Native iOS is intentionally OMP-only: it hides backend selection and supports OMP direct and
OMP Collab. Adding a web harness should mean adding a profile entry and its setup section, never a
special case threaded through the app.

This document is long on purpose. Read the section that matches what you are touching, or all of it
if you are having an agent do the work.

## Repository layout

| Path | What it is |
|---|---|
| `web/` | The React + TypeScript + Vite app and Capacitor 8 configuration |
| `web/src/` | Application source. `App.tsx` holds most of the UI, `api.ts` the HTTP client, and `i18n.ts` the translations |
| `web/native-ios/` | Swift sources copied into the generated Xcode project by `npm run cap:sync:ios` |
| `web/ios/` | Generated, ignored Xcode project; create it on a Mac and never commit it |
| `bridge/` | Local HTTP/SSE-to-ACP service for OMP and PI. Launch commands and capabilities live in `src/harness-profiles.js` |
| `desktop/` | Electron server manager. The main process owns backend children; the renderer has no Node integration |
| `.github/workflows/` | Web deployment checks; native iOS packaging remains manual |
| `OMP-INTEGRATION-PLAN.md` | Design notes and findings from the OMP integration, in Italian |

## Prerequisites

- **Node.js 22.12 or newer.** `web/` needs `npm install`; `bridge/` has no runtime dependencies and
  uses the standard library, so do not look for a lockfile there.
- **Bun for the Collab contract suite.** `npm run test:collab` invokes Bun directly.
- **A harness to talk to.** An OpenCode server, a working `omp` command, or PI. UI-only work can
  start without one, but it is not a substitute for [testing against a real agent](#test-against-a-real-agent).
- **For native work:** a Mac with Xcode 26 or newer, an iPhone on iOS 15 or newer, an Apple ID
  accepted for signing, and Sideloadly. The automated web and bridge gates run on any supported
  development platform; Xcode generation, synchronization, archive, export, and iPhone checks do not.
- **For desktop manager work:** install `desktop/` dependencies. Packaging produces ignored output under `desktop/dist/`.

## Getting it running

```bash
cd web
npm install
npm run dev
```

Open the printed URL. In the web/PWA, configure the connection in **Settings**; each backend keeps
its own saved connection, so switching between them does not lose anything. Native iOS forces OMP
and does not show the backend picker.

### Against OpenCode

Start the server with Basic Auth and, for browser development, CORS origins. The README's
[OpenCode Server Setup](README.md#opencode-server-setup) has the exact commands.

### Against OMP directly

OMP speaks ACP over stdio. The bridge launches `omp acp` and translates the app's HTTP/SSE API:

```bash
cd bridge
export HARNESS_REMOTE_USERNAME=harness
printf 'Bridge password: '
read -s HARNESS_REMOTE_PASSWORD
printf '\n'
export HARNESS_REMOTE_PASSWORD
node src/cli.js --host 0.0.0.0 --port 4097 \
  --cors capacitor://localhost \
  --root "$HOME/your-project"
unset HARNESS_REMOTE_PASSWORD
```

Set the app's OMP connection to the host computer's LAN address, port `4097`, and the same Basic
Auth credentials. The bridge defaults to `127.0.0.1`; any non-loopback bind requires a username and
password, supplied above through the environment so the password does not enter argv or shell
history. The CLI defaults omitted roots to the current directory, but this guide requires an
explicit `--root` for every non-loopback launch as a safety boundary. Never expose this HTTP service
directly to the public Internet. Ordinary native Capacitor HTTP requests bypass browser CORS, but
iOS authenticated SSE uses WebView `fetch`, so IPA bridge launches must allow the exact
`capacitor://localhost` origin. For web development, allow that browser's exact origin instead, for
example `--cors http://localhost:5173`.

Tailscale is an alternative private route, not an app feature: install and authenticate it
separately on the host and iPhone, then enter the host's MagicDNS name or tailnet IP in the app.
Keep bridge Basic Auth enabled over Tailscale.

### Against OMP Collab

Run `/collab` inside the arbitrary desktop OMP session you want to share. Manually copy its bearer
link to **Attach OMP Collab**; the app does not discover global OMP sessions. A link contains the
room key and may contain a write token, so handle it like a password. The client uses WebSocket and
AES-256-GCM with a 12-byte IV; a custom non-local relay must use `wss://`. Snapshots remain in
memory, while attached bearer links persist only in iOS Keychain.

### Desktop server manager

```bash
cd desktop
npm install
npm start
```

The renderer is intentionally dependency-free and context-isolated. Keep passwords out of persisted settings, process arguments, manager state, and logs. The main process is the only layer allowed to spawn or stop backend processes. The manager detects prerequisites and gives setup instructions; it must not install software, elevate privileges, edit firewall rules, or configure Tailscale.
PI and Claude use the bridge but are web/PWA-only, so the setup form requires their exact browser origin for credentialed CORS. OMP always allows `capacitor://localhost` and accepts an optional exact browser origin.

Run `npm run pack` to create an unpacked build for the current platform. Build and sign release installers on each target platform.

## The checks you must run

Run the full automated matrix locally; GitHub's web workflow covers only its listed web gates and
does not package or validate iOS:

```bash
cd web
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

cd ../bridge
npm test

cd ../desktop
npm test
npm run pack
```

`npm run build` is `tsc -b && vite build`, so it type-checks as well as bundles.

| Gate | What it protects |
|---|---|
| Build plus `test:i18n`, `test:config`, `test:ui`, `test:settings`, `test:model`, `test:events` | Web bundle and established web regressions |
| `directSession.test.mjs` | Direct session creation, selection, capabilities, and resume behavior |
| `secureStorage.test.mjs` | iOS Keychain plugin boundary with no web-storage fallback |
| `ios-native-sync.test.mjs` and `ios-packaging.test.mjs` | Repeatable iOS metadata/native-source sync and packaging assumptions |
| `test:collab` | Collab links, crypto, transport, adapter, attachment persistence, and read-only enforcement |
| Bridge `npm test` | HTTP/SSE-to-ACP behavior, security boundaries, and harness fakes |
| Desktop `npm test` and `npm run pack` | Manager validation, secret boundaries, isolated IPC shell, and current-platform packaging |

## The rule that matters most: every change lives on two backends

This is the way the app has actually been broken, twice. A feature written against one harness will
reach for an endpoint the other does not have, and the failure shows up as a red error in the user's
face rather than a missing feature.

The bridge implements a deliberate subset of the app's API:

**Implemented:** `/v1/health`, `/global/health`, `/v1/capabilities`, `/v1/events`, `/global/event`,
`/session` (list and create), `/v1/sessions`, `/experimental/session`, `/session/status`, `/path`,
`/file`, `/command` (empty), `/agent` (empty), `/config/providers`, and on a session:
`message`, `todo`, `diff` (empty), `prompt_async`, `abort`.

**Not implemented — anything else 404s**, including `/question` and its replies, `/project/current`,
`/vcs`, `/file/status`, `/session/{id}/command`, and renaming or deleting a session.

When you add a call, pick one of two patterns already used in the codebase:

**Gate it** when the feature is meaningless without the endpoint. There are already fifteen such
gates in `App.tsx`, covering agent selection, session rename and delete, diffs and interactive
questions:

```ts
config.backend === "omp" ? Promise.resolve([]) : api.loadQuestions(config, directory).catch(() => [])
```

**Let it fail soft** when the feature is decoration that can simply be absent. The project dashboard
does this — `/project/current`, `/vcs` and `/file/status` all 404 against the bridge and the panel
just renders without them:

```ts
api.loadProjectCurrent(config, directory).catch(() => null)
```

Do not add a third pattern where an unimplemented endpoint surfaces an error to the user.

When a feature is genuinely unavailable on a backend, say so in the README's harness section rather
than leaving the user to discover a dead button.

## The other rule: every UI change lives in two layouts

Below 781px the app is a single view with bottom navigation; above it, a permanent sidebar sits next
to the chat. `App.tsx` keeps an `isDesktop` flag from a `matchMedia` query on that exact breakpoint,
so the JS layout and the stylesheet's `@media (max-width: 780px)` block never disagree. Change one
and you have to change the other.

Two things make this easy to get wrong:

- **The scroller moves.** On mobile the page scrolls and `.messages` is a plain block; on desktop the
  chat pane is height-bounded and `.messages` is the scroller. Anything reading or setting scroll
  position has to ask which one is live rather than assuming — `scrollsItself()` and
  `messagesScrollMetrics()` exist for that.
- **The session list is rendered twice.** `renderSessionCard` is shared by the mobile panel and the
  desktop sidebar, with the sidebar's compact row shape coming from CSS overrides under
  `.sidebar-sessions`. Add a field to the card and check it in both, rather than forking the markup.

Resize the browser window across 781px before opening a PR that touches layout. It is the cheapest
check in this document and it catches most of these.

## How the tests work here, and how to change one

The suites under `web/src/*-regression.test.mjs` are unusual: they assert against the **source text**
of `App.tsx` and its siblings rather than rendering anything. There is no DOM test runner in this
project. These are cheap guards that pin specific regressions we have already paid for once.

This will surprise you the first time a code change fails a test whose message talks about a string.
That is working as intended. What matters is how you fix it.

**Assert the invariant, not the shape of the code.** A test that forbids an identifier will block a
legitimate refactor; a test that checks the behavioural guarantee survives it. A real example from
this repo: an assertion once required that `messageScrollSignature` did not exist, as a proxy for
"background refreshes must not force the conversation to scroll". Streamed rendering needed that
value back, and the right fix was not to delete the test but to assert the actual guarantee — that
content-driven scrolling is gated on the user already being pinned to the bottom:

```js
assert.ok(
  /if \(!stickToBottomRef\.current\) return[\s\S]*?scrollMessagesToBottom\("auto"\)/.test(app),
  'content-driven auto-scroll must be gated on the user already being pinned to the bottom'
)
```

If you cannot express the invariant, that is a signal the guard belongs somewhere else — a unit test
against an extracted function, as `web/src/serverConfig.ts` and `test:config` do.

**Never weaken these two.** `test:config` protects against a saved configuration that cannot be
loaded: a half-typed host such as `http://` used to throw while rendering, which unmounted the app
and, because the value had already been persisted, reproduced a blank screen on every launch. The
guard in the autosave effect, and every `isValidServerConfig` check that gates a connection, are what
prevent that.
The `ErrorBoundary` in `main.tsx` is the backstop that keeps any future crash recoverable from
inside the app.

## Test against a real agent

Every bug that reached a user came from a real agent behaving unlike the spec, not from a logic error
the fakes could have caught. These direct ACP observations were made against OMP 17.1.3:

- it never echoes the prompt you submitted, so a deduplication scheme that assumes an echo silently
  ate the user's message;
- its session listings carry no title, so every session rendered with the same placeholder;
- it does not emit ACP `agent_plan`, so the plan panel stays empty;
- it approves its own tool calls and sends no permission requests.

Every quirk found this way is recorded in [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md), together with
what breaks if it changes. Read it before touching a harness integration, and update it in the same
commit when you learn something new.

The fakes in `bridge/test/` exist to keep fixed behaviour fixed. They are not evidence about how an
agent behaves. When you add support for something, drive it with the real thing at least once, then
encode what you observed in a fake.

## Internationalisation

The UI ships in English, Italian and Traditional Chinese, in one small module with no framework.
`test:i18n` enforces key parity, so a string added to one language and not the others fails the
suite. Add all three.

## Native packaging and release verification

iOS packaging is a manual Mac/iPhone gate. `web/ios/` is generated by Capacitor and ignored, so a
fresh checkout intentionally has no Xcode project. On a Mac:

```bash
cd web
npm install
npm run build
npm run cap:add:ios       # first generation only
npm run cap:sync:ios
open ios/App/App.xcodeproj
```

Run `cap:add:ios` only when `web/ios/` does not exist. On every later native build, run
`npm run build` followed by `npm run cap:sync:ios`; the project script copies `web/native-ios/` and
updates the generated iOS metadata. A plain Capacitor sync does not perform those repository-specific
steps.

In Xcode, select the **App** target, choose the development team and a bundle identifier accepted by
it, select **Any iOS Device (arm64)**, then use **Product > Archive**. In Organizer choose
**Distribute App > Custom > Development** and export the signed IPA. This repository has no App
Store or TestFlight release workflow.

Install that IPA with Sideloadly: connect and trust the iPhone, select it in Sideloadly, provide the
IPA and signing Apple ID, and complete any sign-in, Developer Mode, or profile-trust prompts. The
install remains valid only while its Apple signing profile is valid. Free Apple IDs commonly need a
re-sign and reinstall every seven days; paid-account validity follows the generated profile.

### Manual Mac/iPhone verification matrix

An archive is not evidence that networking, Keychain, or Collab works. Record each applicable row in
the PR or release notes; do not imply it passed unless it was exercised on the built IPA.

| Area | Required manual result |
|---|---|
| Native synchronization | Generate/sync the project on a Mac, archive and export without hand-editing generated sources, install the IPA, and launch it on iOS 15 or newer. Re-smoke native `fetch` and SSE after every relevant Capacitor or iOS change. |
| Direct bridge over LAN | Start the credentialed non-loopback OMP bridge with an explicit `--root`; on the iPhone connect using the host LAN address, create a session inside that root, select it, send a prompt and observe streamed output, stop an active turn, then interrupt/restore connectivity or background/foreground the app and confirm reconnection. |
| Direct bridge over Tailscale | With Tailscale installed and authenticated separately on both devices, repeat the direct smoke using the host MagicDNS name or tailnet IP and the same bridge Basic Auth. This may be marked not applicable when the change is unrelated and LAN was exercised. |
| Secure storage | Attach a disposable Collab bearer link, relaunch the app and confirm the attachment returns, then detach it, relaunch again, and confirm it stays removed. Bearer links must persist only through iOS Keychain, never web storage. |
| Collab writable | Run OMP `/collab` in a disposable desktop session, manually paste its write-capable bearer link into **Attach OMP Collab**, observe live desktop output, and verify prompt, abort, and interactive reply controls. |
| Collab read-only | Attach the room-key-only/read-only link, confirm live output still arrives, and confirm prompt, abort, and reply controls are absent. |

For a release candidate, repeat the archive/export/Sideloadly flow from a clean generated `web/ios/`,
run every automated gate above, complete the applicable manual rows on the installed IPA, and note
the signing profile's expiration. No CI artifact substitutes for this verification.

## The bridge is a network service

Treat these three areas as security-sensitive and explain your reasoning in the PR when you change
them:

- **Authentication.** Basic Auth compared in constant time. The bridge refuses to bind beyond
  loopback without credentials.
- **The `--root` boundary.** It restricts what the bridge exposes: which directories the app may
  browse and where a session may run. It is **not** a sandbox for the agent, which runs with full
  user privileges — do not describe it as one.
- **CORS.** Off by default; each origin must be listed explicitly, because credentialed CORS cannot
  use a wildcard. Ordinary Capacitor HTTP requests bypass browser CORS, but iOS SSE uses WebView
  `fetch`, so bridge launches used by the IPA must allow exactly `capacitor://localhost`.

## Commits and pull requests

Commit subjects use a conventional prefix. The ones actually in use here are `fix:`, `feat:`,
`docs:`, `chore:`, `perf:` and `ci:`, with an optional scope such as `fix(bridge):`.

Write the body to explain **why**, not what — the diff already says what. If a change fixes
something subtle, say what the failure looked like and how you confirmed it is gone. A commit that
records the reasoning is worth more than one that records the edit.

Group commits by intent rather than by the order you happened to write them, and keep each one
building and passing on its own so a bisect lands somewhere useful.

In the PR, say how you verified the change, and whether you tested against a real harness or only
against the fakes. Both are acceptable; which one it was is not obvious from the diff.

**Your commits stay yours.** We merge contributions rather than re-implementing them, and anything
that needs changing afterwards goes in separate commits on top. Squashing is up to you.

## Where to start

- [Open issues](https://github.com/giuliastro/harness-remote/issues), especially any labelled
  [`help wanted`](https://github.com/giuliastro/harness-remote/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).
  A fourth harness is the obvious next step: the profile mechanism in `bridge/src/harness-profiles.js`
  is what PI was added through, so it is a well-worn path rather than new ground.
- Bug reports from real use are genuinely valuable here, for the reason in
  [Test against a real agent](#test-against-a-real-agent).
- Translations, if the UI does not speak your language.

Questions are welcome in an issue before you write anything, especially for a large change — it is
cheaper for both of us than a rebase.
