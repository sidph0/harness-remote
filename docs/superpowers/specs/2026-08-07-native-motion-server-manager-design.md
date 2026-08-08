# Native iOS Motion and Desktop Server Manager Design

Date: 2026-08-07
Status: Approved for implementation

## Goal

Add restrained native-iOS navigation motion and a standalone desktop application that starts and monitors Harness Remote backends on Windows, Linux, and macOS without requiring command-line setup.

## Scope decisions

- Motion applies only to the native iOS Capacitor client.
- Use native touch events and CSS transforms/opacity; add no gesture or animation dependency.
- The desktop application uses Electron.
- The manager supports OMP, PI, Claude Code, and OpenCode.
- The manager detects missing prerequisites and gives exact guidance. It does not install Node.js, harnesses, firewall rules, or Tailscale.
- Phone-ready LAN binding is the default. Username and password are required before Start.
- The manager does not store the password. It persists only non-secret settings.
- The manager shows connection values, health, process details, capabilities, and recent redacted logs.
- The manager does not expose a backend directly to the public Internet or configure Tailscale Funnel.

## Native iOS motion

The existing top-level order is Sessions, Settings, Help. A horizontal swipe changes only these top-level tabs. A swipe starts only from non-interactive page content and must be horizontal and intentional. It does not take control from inputs, buttons, links, code blocks, horizontally scrolling strips, sheets, or dialogs.

Selecting a session pushes Conversation in from the right. The Sessions back control, including a rightward edge swipe, returns with the opposite direction. Top-level tab motion follows swipe direction. Sheets rise from the bottom. Newly mounted messages use a short opacity and vertical-offset entrance.

Durations stay between 140 and 220 ms with Material-style deceleration. Motion uses only transform and opacity. `prefers-reduced-motion: reduce` removes movement and keeps immediate state changes. Web, PWA, Android, and desktop layouts retain current navigation behavior.

## Desktop application architecture

A new `desktop/` Electron package contains:

- an Electron main process that owns backend processes, settings, health polling, file dialogs, and safe IPC;
- a context-isolated preload bridge with a narrow API;
- a small HTML/CSS/JavaScript renderer for setup, running status, connection details, prerequisites, and logs;
- a testable Node module for launch specifications, validation, connection URLs, and prerequisite rules.

Bridge backends run the repository bridge CLI as an Electron Node child process. Packaged builds copy `bridge/src/` into application resources. OMP requires the `omp` command. PI and Claude Code use their existing pinned `npx` adapters and require Node.js/npm. OpenCode starts through the existing pinned command shape `npx -y opencode-ai serve` and uses port 4096; bridge backends use port 4097.

## Setup and lifecycle

The setup form contains backend, username, password, workspace root when the bridge needs one, and an Advanced section for port. LAN bind is fixed to `0.0.0.0` for the phone-ready path. Start validates required fields and prerequisites before spawning.

The main process passes passwords only through child-process environment variables. It never puts them in command arguments, persisted settings, logs, IPC state, or error text. Closing the application stops its child process. Stop and Restart act only on the child owned by the manager.

The running view shows:

- starting, healthy, unhealthy, stopped, or failed state;
- backend and reported version;
- PID and uptime;
- workspace root and port;
- copyable LAN URLs and exact host, port, username, and password values for the client;
- detected prerequisite results;
- recent redacted output;
- firewall and Tailscale Serve guidance without privileged automation.

Native iOS supports OMP direct connections only. The manager labels PI, Claude Code, and OpenCode as web/PWA backends so it does not promise unsupported iOS behavior.

## Security and errors

- LAN start requires both username and password.
- Workspace roots keep the bridge's existing real-path boundary checks.
- Renderer Node integration is disabled; context isolation and sandboxing are enabled.
- IPC accepts only the manager's explicit operations.
- The renderer uses a restrictive Content Security Policy and local assets only.
- Process output is bounded and redacted before display.
- Failed prerequisite, spawn, early exit, and health checks remain visible with a direct recovery action.

## Verification

- Unit tests cover native swipe decisions and manager validation/launch/connection rules.
- Existing web regression checks and production build pass.
- Existing bridge tests pass.
- Desktop tests pass and Electron packages the application directory.
- Browser smoke checks exercise native-iOS tab swipes, session push/back motion, sheets, reduced motion, and unchanged desktop web behavior.
- Desktop application smoke checks start an owned test backend, report health and connection values, copy values, and stop cleanly.

## Excluded

- Automatic prerequisite installation or updates.
- Firewall changes, administrator elevation, Tailscale installation, account login, Serve automation, or Funnel.
- Password persistence or cloud synchronization.
- New animation, gesture, component, or process-management libraries beyond Electron packaging itself.
- Changes to bridge HTTP/API contracts or native iOS backend availability.
