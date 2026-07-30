# Collaboration Live Activity and Windows Help Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep persisted Collab cards stable across handshake, expose complete live activity inline with adaptive expansion, and show safe macOS/Linux plus Windows PowerShell connection commands.

**Architecture:** The persisted `CollabAttachment[]` list becomes the existence and identity source for synthetic `collab:<attachment.id>` sessions. `CollabClient` retains a bounded in-memory map of completed live tool events; `adaptCollabSnapshot` merges that map with historical tool results and creates parts for event-only tools. `App.tsx` renders the enriched snapshots using inline expandable activity rows and renders both host-platform command families without detecting the app device OS.

**Tech Stack:** React 18, TypeScript, Vite, Capacitor, Node assertion regression scripts, existing `CollabClient` transport and `@oh-my-pi/pi-wire` event types.

## Global Constraints

- Do not add dependencies.
- Treat persisted, validated `CollabAttachment[]` as the source of truth for attached cards.
- Keep `collab:<attachment.id>` and `attachment.name` stable for the attachment lifetime.
- Never move the card backward in time when host metadata arrives.
- Show only protocol-provided model `thinking`; do not reconstruct hidden reasoning.
- Retain the latest 256 completed tool results in memory; clear them on a new handshake; never persist or log them.
- Event-only tools must expose start/update/end data even without an assistant `toolCall`.
- Retain ended Collab cards and their transcript; only detach removes them.
- Show macOS/Linux and Windows PowerShell commands together; use environment variables for credentials.
- Preserve bearer-link secrecy and sanitize any displayed or stored end reason.
- Do not alter unrelated direct-session behavior or user-owned changes.

---

### Task 1: Retain completed live tool activity

**Files:**
- Modify: `web/src/types.ts:249-290`
- Modify: `web/src/collab/client.ts:154-199,300-405,444-450`
- Test: `web/src/collab/client.test.mjs:481-530`

**Interfaces:**
- Consumes: validated `tool_execution_start`, `tool_execution_update`, and `tool_execution_end` events already handled by `CollabClient`.
- Produces: `CollabSnapshot.completedTools: ReadonlyMap<string, CompletedCollabTool>` with `toolCallId`, `toolName`, `args`, optional `intent`, optional `partialResult`, `result`, `isError`, `startedAt`, and `completedAt`.

- [ ] **Step 1: Add the failing client contract assertion.**

Extend the existing streaming/tool event block after the current active-tool removal assertion:

```js
  socket.emitFrame({ t: 'event', event: { type: 'tool_execution_end', toolCallId: 'tool-1', toolName: 'read', result: 'done' } })
  assert.equal(snapshot(client).activeTools.has('tool-1'), false)
  assert.deepEqual(snapshot(client).completedTools.get('tool-1'), {
    toolCallId: 'tool-1',
    toolName: 'read',
    args: {},
    intent: 'inspect',
    partialResult: 'partial',
    result: 'done',
    isError: false,
    startedAt: 0,
    completedAt: 0
  })
```

Use the test fixture's deterministic timer or event timestamp convention so the expected times are stable; do not assert wall-clock time.

- [ ] **Step 2: Run the focused test and verify it fails.**

Run from `web`:

```bash
node --experimental-strip-types src/collab/client.test.mjs
```

Expected: FAIL because `completedTools` is not present in the snapshot.

- [ ] **Step 3: Add the completed-tool type and snapshot field.**

In `web/src/types.ts`, add immediately after `ActiveCollabTool`:

```ts
export type CompletedCollabTool = {
  readonly toolCallId: string
  readonly toolName: string
  readonly args: unknown
  readonly intent?: string
  readonly partialResult?: unknown
  readonly result: unknown
  readonly isError: boolean
  readonly startedAt: number
  readonly completedAt: number
}
```

Add `completedTools: ReadonlyMap<string, CompletedCollabTool>` to `CollabSnapshot` beside `activeTools`.

In `web/src/collab/client.ts`, import `CompletedCollabTool`, add `MAX_COMPLETED_TOOLS = 256`, and add a private map:

```ts
#completedTools = new Map<string, CompletedCollabTool>()
```

Initialize it as an empty map at construction through `#buildSnapshot`. Clear it when a new host handshake begins, at the same reset point that clears entries, stream, active tools, progress, and lifecycle. On `tool_execution_end`, copy the active tool's args/intent/partial result and the event's result/error into a `CompletedCollabTool`, insert it, and delete the active entry. If the map exceeds 256 entries, delete its oldest key before committing. If an end arrives without a matching start, still insert an event-only completed tool using `args: {}`, `startedAt: completedAt`, and the event result.

`#buildSnapshot()` must expose a read-only map snapshot:

```ts
completedTools: new Map(this.#completedTools)
```

Do not include links, keys, write tokens, or raw frames in this map.

- [ ] **Step 4: Run the focused client test and verify it passes.**

```bash
node --experimental-strip-types src/collab/client.test.mjs
```

Expected: `collab client tests passed`.

- [ ] **Step 5: Commit the transport change.**

```bash
git add web/src/types.ts web/src/collab/client.ts web/src/collab/client.test.mjs
git commit -m "feat: retain completed collab tool activity"
```

---

### Task 2: Adapt historical, live, and event-only activity

**Files:**
- Modify: `web/src/collab/adapter.ts:1-198`
- Test: `web/src/collab/adapter.test.mjs:29-193,195-235`

**Interfaces:**
- Consumes: `snapshot.activeTools` and `snapshot.completedTools` from Task 1, assistant `toolCall` blocks, historical `toolResult` entries, and live `stream` content.
- Produces: `MessagePart[]` containing reasoning parts, completed/running/error tool parts, and synthetic tool parts for event-only calls.

- [ ] **Step 1: Add failing adapter assertions for completed and event-only tools.**

Update the test snapshot fixture with `completedTools: new Map()`. Add a completed tool to a streaming snapshot without a matching historical result and assert the adapted tool state is completed:

```js
const liveCompleted = adaptCollabSnapshot(snapshot({
  entries: [{
    type: 'message',
    id: 'assistant-live',
    parentId: null,
    timestamp: '2026-07-28T12:00:08.000Z',
    message: {
      role: 'assistant',
      content: [{ type: 'toolCall', id: 'live-call', name: 'bash', arguments: { command: 'echo live' } }],
      model: 'synthetic/model', usage, stopReason: 'toolUse', timestamp: 1_785_240_008_000
    }
  }],
  completedTools: new Map([['live-call', {
    toolCallId: 'live-call', toolName: 'bash', args: { command: 'echo live' },
    result: 'live result', isError: false, startedAt: 1_785_240_008_000, completedAt: 1_785_240_009_000
  }]])
}))
assert.equal(liveCompleted.messages[0].parts[0].state.status, 'completed')
assert.equal(liveCompleted.messages[0].parts[0].state.output, 'live result')
```

Add an event-only completed tool to `completedTools` without an assistant message and assert the adapter creates a visible synthetic assistant message with a tool part containing the command and result. Assert an event-only error has `state.status === 'error'` and `state.error === 'failure'`.

- [ ] **Step 2: Run the focused adapter test and verify it fails.**

```bash
node --experimental-strip-types src/collab/adapter.test.mjs
```

Expected: FAIL because the fixture lacks the new snapshot field and `messageParts` only walks assistant `toolCall` content.

- [ ] **Step 3: Update adapter types and result precedence.**

Extend the local `Snapshot` type with:

```ts
readonly completedTools: ReadonlyMap<string, {
  toolCallId: string
  toolName: string
  args: unknown
  intent?: string
  partialResult?: unknown
  result: unknown
  isError: boolean
  startedAt: number
  completedAt: number
}>
```

Change `messageParts` to accept `completedTools`. For each assistant `toolCall`, choose data in this order:

1. historical `toolResult` entry;
2. completed live event;
3. active live event;
4. the call's own arguments with no output.

Set `state.status` to `error`, `completed`, or `running`; set `state.input` from active/completed args before call arguments; set `state.output` from historical content, completed result, active partial result, or omit it; set `state.error` for historical/completed `isError`; and use `startedAt`/`completedAt` for the time range.

After walking all entries and the live stream, append synthetic activity for each `completedTools` key not seen in an assistant `toolCall`. Use a deterministic message id `collab-tool-${toolCallId}`, role `assistant`, session id from the header, creation time `startedAt`, and one tool part. For a live active tool with no assistant `toolCall`, append a running synthetic part using `collab-tool-${toolCallId}` and `startedAt`. Sort synthetic activity by start time relative to the existing stream, without changing the order of ordinary transcript entries. Synthetic event-only parts must never include the bearer link or transport frame.

When no header exists, use the existing empty session behavior; do not fabricate a session id for persisted history.

- [ ] **Step 4: Run the adapter and client tests together.**

```bash
node --experimental-strip-types src/collab/client.test.mjs && node --experimental-strip-types src/collab/adapter.test.mjs
```

Expected: both scripts print their success message.

- [ ] **Step 5: Commit the adapter change.**

```bash
git add web/src/collab/adapter.ts web/src/collab/adapter.test.mjs
git commit -m "feat: adapt live collab activity results"
```

---

### Task 3: Preserve attachment-backed cards and render adaptive inline activity

**Files:**
- Create: `web/src/collab/sessionView.ts`
- Create: `web/src/collab/sessionView.test.mjs`
- Modify: `web/src/App.tsx:1048-1217,2063-2110,2912-2945,3329-3439,4092-4110`
- Modify: `web/src/styles.css:1055-1151`
- Modify: `web/package.json`

**Interfaces:**
- Consumes: `CollabAttachment[]`, `CollabSnapshot.completedTools`, and adapter output from Tasks 1–2.
- Produces: stable `SessionView` records and inline activity UI with live expansion and completed disclosure rows.

- [ ] **Step 1: Add failing behavior tests for attachment-backed session views.**

Create `web/src/collab/sessionView.test.mjs` and import the pure session-view helper from `sessionView.ts`. Cover these observable contracts:

```js
const attachment = { id: 'desktop-build', name: 'Desktop build', link: 'secret', readOnly: false }
const initial = collabSessionView(attachment, undefined, undefined, 200)
assert.equal(initial.id, 'collab:desktop-build')
assert.equal(initial.title, 'Desktop build')
assert.equal(initial.directory, 'OMP Collab')

const updated = collabSessionView(attachment, initial, {
  title: 'Older host title', directory: 'C:\\work', updated: 100,
  files: 0, additions: 0, deletions: 0, status: 'idle', external: true
}, 300)
assert.equal(updated.title, 'Desktop build')
assert.equal(updated.directory, 'C:\\work')
assert.equal(updated.updated, 200)

const merged = mergeCollabSessionViews([directSession], [attachment], new Map(), 200)
assert.ok(merged.some((session) => session.id === 'collab:desktop-build'))
```

Also cover that an ended view remains in the merge and that removing the attachment removes the synthetic card. Add this test to `npm run test:collab` in `web/package.json`.

- [ ] **Step 2: Run the focused behavior test and verify it fails.**

```bash
bun src/collab/sessionView.test.mjs
```

Expected: FAIL because `sessionView.ts` and its helpers do not exist yet.

- [ ] **Step 3: Make the attachment list the card source of truth.**

Add a stable metadata map or extend the existing `collabViewsRef` records so every loaded attachment has a fallback `SessionView` before handshake:

```ts
const attachmentView = (attachment: CollabAttachment, current?: SessionView): SessionView => ({
  ...(current ?? { files: 0, additions: 0, deletions: 0, external: true, status: "connecting" }),
  id: `collab:${attachment.id}`,
  title: attachment.name,
  directory: current?.directory || "OMP Collab",
  updated: Math.max(current?.updated ?? 0, Date.now())
})
```

Use the persisted attachment array in `mergeCollabSessions`: filter direct sessions by ids from the attachment list, create or retain one view for every attachment, and sort by `updated`. `connectCollabAttachment` must call the fallback view before `client.connect()`. On snapshot updates, use host directory/title only as secondary metadata; preserve `title: attachment.name` and set `updated` to `Math.max(previous.updated, adapted?.updated ?? 0)`. Map `connecting`, `waiting`, `live`, `reconnecting`, and `ended` to the card status while retaining ended entries.

During the native attachment effect cleanup, close clients and unsubscribe but do not treat `collabViewsRef.clear()` as deletion of persisted cards. On the next setup, rebuild fallback cards from `collabAttachmentsRef` before handshaking. `detachCollab` remains the only path that filters the persisted attachment and removes its session.

- [ ] **Step 4: Replace modal-only action groups with inline disclosure rows.**

Change `ActionGroupView` to maintain `open` and render a `<button>` with `aria-expanded={open}` plus a sibling `<div className="message-action-details" hidden={!open}>`. Keep the summary label and render each `MessagePartView` directly inside that div. Do not render `Modal` for action groups. Change `ToolPartView` and `ReasoningPartView` the same way: the current live item is open by default; completed items start closed; each button uses `aria-controls` tied to a stable part id. Preserve the existing diff, todo, question, output, and error content.

Derive live status from `selectedCollabSnapshot.phase === "live"` plus `part.state?.status === "running"` or the current reasoning stream; do not add a new `MessagePart` field. The active thinking/tool row defaults expanded while live. A completed activity row remains tappable and collapsed after the live step ends. Ensure keyboard Enter/Space toggles every disclosure and focus remains on the triggering button.

- [ ] **Step 5: Add narrow-screen CSS without horizontal overflow.**

Add inline activity rules near the existing message action rules:

```css
.message-action-details,
.message-reasoning-details,
.message-tool-details {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  padding: 0 var(--space-2) var(--space-2);
}

.message-action-details[hidden],
.message-reasoning-details[hidden],
.message-tool-details[hidden] {
  display: none;
}

.message-action-details pre,
.message-reasoning-details pre,
.message-tool-details pre {
  max-width: 100%;
  overflow-x: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (max-width: 520px) {
  .message-reasoning-summary,
  .message-action-summary,
  .message-tool-summary {
    padding-inline: var(--space-2);
    font-size: 0.78rem;
  }
}
```

Reuse existing variables and do not introduce a second mobile breakpoint system.

- [ ] **Step 6: Run the Collab behavior tests, UI regression, and build.**

```bash
npm run test:collab
node src/ui-regression.test.mjs
npm run build
```

Expected: the Collab behavior tests and UI regression print success messages and Vite completes without TypeScript errors.

- [ ] **Step 7: Commit stable cards and inline activity.**

```bash
git add web/src/collab/sessionView.ts web/src/collab/sessionView.test.mjs web/src/App.tsx web/src/styles.css web/package.json
git commit -m "feat: stabilize collab cards and inline activity"
```

---

### Task 4: Add Windows PowerShell connection commands

**Files:**
- Create: `web/src/helpCommands.ts`
- Create: `web/src/helpCommands.test.mjs`
- Modify: `web/src/App.tsx:4499-4526`
- Modify: `web/package.json`

**Interfaces:**
- Consumes: `config.backend`, `helpBackendName`, `helpPort`, and existing Help tab state.
- Produces: per-backend macOS/Linux and Windows PowerShell startup blocks, with credential values supplied through environment variables.

- [ ] **Step 1: Add failing behavior tests for generated host commands.**

Create `web/src/helpCommands.test.mjs`, import `connectionHelpCommands` from `helpCommands.ts`, and assert the returned platform labels and command strings for all four backends:

```js
for (const backend of ['omp', 'pi', 'claude', 'opencode']) {
  const commands = connectionHelpCommands(backend)
  assert.equal(commands.length, 2)
  assert.equal(commands[0].platform, 'macOS / Linux')
  assert.equal(commands[1].platform, 'Windows PowerShell')
}

assert.match(connectionHelpCommands('omp')[1].command, /\$env:HARNESS_REMOTE_USERNAME/)
assert.doesNotMatch(connectionHelpCommands('omp')[1].command, /--password/)
assert.match(connectionHelpCommands('pi')[1].command, /--backend pi/)
assert.match(connectionHelpCommands('claude')[1].command, /--backend claude/)
assert.match(connectionHelpCommands('opencode')[1].command, /npx\.cmd -y opencode-ai serve/)
```

Add the behavior test to `npm run test:settings` in `web/package.json`; do not add new source-text assertions.

- [ ] **Step 2: Run the focused behavior test and verify it fails.**

```bash
node --experimental-strip-types src/helpCommands.test.mjs
```

Expected: FAIL because `helpCommands.ts` and `connectionHelpCommands` do not exist yet.

- [ ] **Step 3: Render both platform blocks with safe credential placeholders.**

For each backend branch in `App.tsx`, retain a macOS/Linux block and add a Windows PowerShell block. Set `HARNESS_REMOTE_USERNAME` and `HARNESS_REMOTE_PASSWORD` before starting bridge backends; do not pass either credential as a command-line argument. Set `HARNESS_REMOTE_BACKEND=pi` or `HARNESS_REMOTE_BACKEND=claude` for the non-OMP bridge variants, or pass the non-secret `--backend` option.

Use these exact OMP PowerShell lines:

```powershell
Set-Location C:\path\to\harness-remote
$env:HARNESS_REMOTE_USERNAME = "omp"
$env:HARNESS_REMOTE_PASSWORD = "<bridge-password>"
node .\bridge\src\cli.js --host 0.0.0.0 --port 4097 --root "C:\" --cors capacitor://localhost
```

Use the same four lines for PI and Claude Code, adding the non-secret selector before host options:

```powershell
$env:HARNESS_REMOTE_BACKEND = "pi"
node .\bridge\src\cli.js --backend pi --host 0.0.0.0 --port 4097 --root "C:\" --cors capacitor://localhost
```

Replace `pi` with `claude` for the Claude Code block. For OpenCode render:

```powershell
$env:OPENCODE_SERVER_USERNAME = "opencode"
$env:OPENCODE_SERVER_PASSWORD = "<server-password>"
npx.cmd -y opencode-ai serve --hostname 0.0.0.0 --port 4096
```

Keep the existing `curl.exe` health check, Tailscale Serve, firewall, CORS, and bearer-link security copy. Make the code blocks wrap or scroll on narrow iOS screens; do not put credentials into a URL or log.

- [ ] **Step 4: Run the settings behavior tests and build.**

```bash
npm run test:settings
npm run build
```

Expected: both commands pass.

- [ ] **Step 5: Commit the Help change.**

```bash
git add web/src/helpCommands.ts web/src/helpCommands.test.mjs web/src/App.tsx web/package.json
git commit -m "feat: document Windows PowerShell connections"
```

---

### Task 5: End-to-end verification and cleanup

**Files:**
- Modify: `web/src/collab/client.test.mjs`, `web/src/collab/adapter.test.mjs`, `web/src/ui-regression.test.mjs`, or `web/src/settings-regression.test.mjs` only if a failing observable contract from Tasks 1–4 is still uncovered.
- Verify: `web/src/App.tsx`, `web/src/styles.css`, `web/src/types.ts`, `web/src/collab/client.ts`, `web/src/collab/adapter.ts`.

**Interfaces:**
- Consumes: all completed implementation tasks.
- Produces: evidence that the browser flow works on a narrow iOS-sized viewport and that all existing regressions/build checks pass.

- [ ] **Step 1: Run the focused regression set.**

From `web`:

```bash
node --experimental-strip-types src/collab/client.test.mjs
node --experimental-strip-types src/collab/adapter.test.mjs
bun src/collab/sessionView.test.mjs
node src/ui-regression.test.mjs
npm run test:settings
```

Expected: all five commands print their success messages.

- [ ] **Step 2: Run the remaining web regression tests.**

```bash
npm run test:i18n
npm run test:model
npm run test:events
npm run test:config
npm run test:collab
```

Expected: every command exits zero. Do not weaken unrelated tests to make this feature pass.

- [ ] **Step 3: Run the production build.**

```bash
npm run build
```

Expected: `tsc -b` and Vite complete with no diagnostics.

- [ ] **Step 4: Browser-check the stable-card flow.**

Start the Vite dev server with the existing project command, open the app in Chromium at 390×844, and exercise a synthetic or real attached Collab entry:

1. Attach a link named `Desktop build`.
2. Confirm the card appears immediately with that title and `OMP Collab` fallback directory.
3. Let a host snapshot with an older timestamp and a different title arrive.
4. Confirm the card still says `Desktop build`, remains searchable by that exact name, and remains visible after Sessions refresh.
5. Close/reconnect the client and confirm the card remains.
6. End the host session and confirm the card remains selectable with its transcript and ended reason.
7. Detach it and confirm it is removed.

Record any console error, horizontal scroll, or secret string visible in the UI as a failure to fix before completion.

- [ ] **Step 5: Browser-check adaptive activity.**

With a live Collab session:

1. Confirm streaming model-provided thinking is expanded inline.
2. Confirm a running tool shows command/arguments and partial output inline.
3. Confirm the completed tool collapses into a chronological row after its end event.
4. Tap/keyboard-toggle the row and confirm final output/error appears inline without a modal.
5. Confirm an event-only tool still renders when no assistant `toolCall` exists.
6. Confirm subagent progress remains visible.
7. Confirm hidden/redacted reasoning is not fabricated.
8. Confirm 390px width has no horizontal overflow.

- [ ] **Step 6: Browser-check Help.**

Open Help → Connections for each backend and confirm both macOS/Linux and Windows PowerShell blocks are present, commands use `$env:` credential variables, the correct ports/backends are shown, and the existing Windows `curl.exe` health check remains in Troubleshooting.

- [ ] **Step 7: Sync generated iOS output.**

```bash
npm run cap:sync:ios
```

Expected: Capacitor sync completes and the native iOS project receives the updated web bundle. If the local machine cannot execute Xcode tooling, record that limitation without changing source behavior.

- [ ] **Step 8: Review the diff and commit verification-only fixes.**

```bash
git diff --check
git status --short
```

Expected: only feature files and the approved plan/spec commits are present. Remove dead modal-only activity paths, unused imports, and stale comments introduced by this work. Commit any final source/test cleanup:

```bash
git add web/src/App.tsx web/src/styles.css web/src/types.ts web/src/collab/client.ts web/src/collab/adapter.ts web/src/collab/*.test.mjs web/src/*-regression.test.mjs
git commit -m "test: verify collab activity and Windows help"
```

