# Collaboration Sessions, Live Activity, and Windows Help

## Goal

Make attached OMP Collab sessions reliable and inspectable on iOS and web, expose the Windows host commands needed to connect, and preserve the live execution context users currently lose behind collapsed summaries.

## Confirmed findings

### Collab session disappearance

An attached card is currently backed by `collabClientsRef` and `collabViewsRef` in `web/src/App.tsx`, not by the persisted attachment list. `connectCollabAttachment` creates a fallback card immediately, then replaces its title, directory, and timestamp with host snapshot metadata after the handshake. The host header timestamp can be older than the attachment time, so the card changes identity and moves in the sorted list. The card is also removed from both in-memory maps by the native attachment effect cleanup; a later session refresh cannot merge a view that no longer exists. Host `bye` itself is not a deletion path: `CollabClient` commits an ended snapshot and the subscribed update should retain the card.

### Activity visibility

The Collab protocol already delivers:

- accumulating assistant messages with `text`, model-provided `thinking`, and assistant `toolCall` blocks;
- tool start/update/end events with tool name, arguments, intent, partial output, and final result/error;
- subagent progress and lifecycle payloads with current tools and recent output.

The client currently deletes active tools at `tool_execution_end` without retaining its result. The adapter creates tool parts only when an assistant message contains a matching `toolCall`; event-only tools therefore disappear. The renderer groups consecutive reasoning/tools/patches into one summary button and opens details in a modal. Historical direct session history does not include reasoning, so reasoning already visible from the live stream must remain merged when snapshots refresh.

### Windows Help

The Help Connections tab renders one macOS/Linux startup block for each backend. Existing repository documentation provides an authoritative Windows PowerShell OMP bridge command. Existing health checks already distinguish Windows `curl.exe`. No reliable host-platform selector exists before connection, and the host OS can differ from the app OS; both command families should be shown. No authoritative Windows OpenCode command exists elsewhere in the repository, so the PowerShell form will use the documented Windows environment-variable and executable conventions without claiming automatic host detection.

## Design

### 1. Stable persisted Collab cards

Treat the persisted, validated `CollabAttachment` list as the source of truth for attached session cards. Client snapshots enrich a card but do not determine whether it exists.

Each attachment keeps:

- stable session id: `collab:<attachment.id>`;
- stable user-provided title: `attachment.name`;
- stable synthetic directory label: `OMP Collab` until a host path is available;
- activity timestamp that never moves backward when host metadata arrives;
- live status: connecting, waiting, live/busy, reconnecting, ended, or an error state;
- host directory and session title as secondary metadata, not as the card identity.

Rehydrating or reconnecting a client must repopulate the card before or alongside network handshaking. Refreshing direct sessions must preserve every attachment-backed card. Cleanup must close transport subscriptions without making persisted attachments disappear; a subsequent effect setup reconnects them. Detach remains the only operation that removes the attachment and its card.

The card remains selectable while reconnecting or ended. Selecting it shows the last retained transcript and a clear phase/reason. A writable composer is enabled only for a live writable client.

### 2. Adaptive inline activity feed

Use the selected adaptive layout:

- The current live thinking block is expanded inline while it streams.
- The current running tool is expanded inline with its command/arguments and partial output.
- Completed thinking, tools, patches, and subagent steps collapse into chronological tappable rows.
- Tapping a row expands its details inline; no modal is required for ordinary activity inspection.
- The final assistant answer remains in the normal conversation flow.

Activity details must preserve:

- model-provided `thinking` text, when transmitted;
- tool name, intent, arguments, and shell/test command text;
- partial output while a tool runs;
- final tool result and error state;
- subagent name, status, current tool, and recent output.

The client gains a bounded completed-tool result map keyed by tool call ID. `tool_execution_end` stores the result/error before removing the active entry. The adapter uses active data first, then completed event data, then historical `toolResult` entries. Event-only tool calls are represented as activity parts even when no assistant `toolCall` exists. Existing snapshot entries remain authoritative when available.

Only protocol-provided model `thinking` is displayed. Redacted or unknown content blocks remain omitted. The app must not infer, fabricate, or reconstruct hidden chain-of-thought. Activity is rendered locally and is not logged, sent to telemetry, or added to secure attachment persistence. Existing bearer-link secrecy rules remain unchanged; raw activity must not include or expose collaboration URLs or keys.

### 3. Windows connection Help

For the selected backend, show both:

- the existing macOS/Linux startup command, using environment variables for credentials;
- a Windows PowerShell startup command.

The OMP PowerShell command follows the repository setup guide:

```powershell
Set-Location C:\path\to\harness-remote
$env:HARNESS_REMOTE_USERNAME = "omp"
$env:HARNESS_REMOTE_PASSWORD = "<bridge-password>"
node .\bridge\src\cli.js --host 0.0.0.0 --port 4097 --root "C:\" --cors capacitor://localhost
```

PI and Claude bridge blocks use the same PowerShell environment-variable pattern and pass `--backend pi` or `--backend claude` to the bridge CLI. The OpenCode PowerShell block uses:

```powershell
$env:OPENCODE_SERVER_USERNAME = "opencode"
$env:OPENCODE_SERVER_PASSWORD = "<server-password>"
npx.cmd -y opencode-ai serve --hostname 0.0.0.0 --port 4096
```

The Help copy labels PowerShell explicitly and retains the existing `curl.exe` health check, LAN, firewall, Tailscale, and security guidance. No runtime OS detection is needed: the host is the machine running the backend, not necessarily the machine displaying Help.


## Scope

Modify only the smallest existing surfaces needed:

- `web/src/App.tsx` — attachment-backed session merging, activity rendering, Windows Help blocks;
- `web/src/collab/client.ts` — completed live tool-result retention and event-only activity;
- `web/src/collab/adapter.ts` — adapt completed/event-only activity and preserve stable session metadata;
- `web/src/types.ts` — completed-tool/activity types;
- `web/src/styles.css` — adaptive inline activity layout;
- `web/src/collab/client.test.mjs` and `web/src/collab/adapter.test.mjs` — live result/event coverage;
- `web/src/settings-regression.test.mjs` and `web/src/ui-regression.test.mjs` — Help, stable-card, and feed contracts.

Do not add dependencies, persist raw transcripts, implement transcript-fetch support for historical subagents, alter unrelated direct-session behavior, or modify user-owned changes outside this scope.

## Error handling and limits

- Malformed or unknown protocol frames remain ignored by existing validation.
- Completed activity retains the latest 256 completed tool results in memory, clears them on a new handshake, and never writes them to storage.
- If a client reconnects, the host snapshot replaces the in-memory transcript; stable attachment metadata remains.
- If the host ends the session, retain the card and transcript and disable writing.
- If the host never sends a header, retain the fallback attachment card and show the sanitized phase/error.
- Never place bearer links, room keys, write tokens, raw transport frames, or activity payloads in logs.

## Verification contract

Before implementation, add failing assertions for:

1. attached cards retain attachment id/name and survive direct refresh merge;
2. host snapshot title/time cannot move or rename the stable attachment card;
3. ended Collab cards remain selectable and visible;
4. tool-end results remain available after active-tool removal;
5. event-only tools render with arguments, partial output, and final result;
6. thinking is expanded while live and completed activity is represented as an expandable row;
7. Windows PowerShell startup commands appear for each supported backend and existing health checks remain present.

After implementation:

- run all existing web regressions and Collab contract tests;
- run the production build;
- browser-check a synthetic live, reconnecting, and ended Collab card at narrow iOS dimensions;
- browser-check an active thinking block, running command with partial output, completed command result, and expanded historical activity;
- verify no horizontal overflow, console errors, secret leakage, or new dependency;
- run `npm run cap:sync:ios` when the generated iOS platform is available.

A real host-backed OMP Collab session remains the final proof for relay reconnect, host `bye`, and protocol-version behavior.
