# Harness Remote iOS UI Redesign

Date: 2026-07-29
Status: Approved design

## Goal

Replace the native iPhone app's reused web interface with a clean, dark, iOS-style interface that is comfortable to navigate one-handed. Session management is the primary workflow. Long titles, paths, translated labels, and controls must wrap or truncate intentionally without widening the viewport or producing oversized buttons.

The redesign applies only when Capacitor reports the iOS platform. Responsive web and desktop retain their current information architecture and visual system.

## Approved decisions

- Native iOS only; web and desktop are not visually redesigned.
- Dark appearance only in the native iOS app.
- Session management receives the strongest visual hierarchy.
- Navigation uses the approved native drill-down direction.
- Existing backend, API, session, collaboration, storage, streaming, and message behavior remains unchanged.
- No new UI dependency or custom gesture library is added.

## Current problems

The current mobile interface presents desktop-style panels inside other panels, keeps large management buttons visible on every session card, and treats conversation detail as a top-level tab even though it depends on a selected session. This produces excessive borders, tall rows, awkward wrapping, and navigation that does not match iOS expectations.

The redesign fixes these problems at the native-iOS presentation layer rather than changing application behavior or creating a second frontend.

## Information architecture

The native iOS hierarchy is:

```text
Sessions
  -> Conversation
     -> AI sheet
     -> Session details sheet
Settings
Help
```

### Tab bar

The iOS tab bar contains three top-level destinations:

1. Sessions
2. Settings
3. Help

Conversation detail is removed from the tab bar. It is a destination reached by selecting a session, not an independent top-level area. The tab bar respects `env(safe-area-inset-bottom)` and remains usable above the home indicator.

### Sessions to conversation

- Tapping a session row opens that conversation.
- The conversation navigation bar provides an iOS back control labeled Sessions.
- Returning from a conversation preserves the selected session and restores it into view.
- Android and web back behavior is unchanged.
- A disabled or empty Detail tab is never rendered on native iOS.

## Native iOS visual system

### Color

The iOS app always declares a dark color scheme and uses the following semantic tokens:

| Role | Value |
|---|---|
| Canvas | `#000000` |
| Grouped surface | `#1C1C1E` |
| Raised control | `#2C2C2E` |
| Separator | `#38383A` |
| Primary text | `#F2F2F7` |
| Secondary text | `#8E8E93` |
| Accent | `#0A84FF` |
| Success | `#30D158` |
| Destructive | `#FF453A` |
| Warning | `#FFD60A` |

Semantic tokens, not raw values in components, drive connection, status, destructive, focus, and selection states. Color is never the only status indicator.

### Typography

Native iOS uses:

```css
-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", sans-serif
```

- Sessions uses an iOS-style large title.
- Navigation titles collapse to compact titles where the view structure requires it.
- Body text remains at least 16 CSS pixels unless it is secondary metadata.
- Secondary metadata remains readable and does not fall below 12 CSS pixels.
- User-configured Dynamic Type and WebView text scaling must not clip controls or force horizontal page scrolling.

### Shape, depth, and material

- The canvas is black.
- Grouped content uses continuous surfaces with separators instead of a border around every item.
- Navigation, the tab bar, and the composer may use restrained translucent material and blur.
- Content cards do not stack multiple borders, shadows, and nested rounded rectangles.
- Corner radii distinguish grouped surfaces, controls, and sheets without making every text block a card.
- Pressed states provide immediate visual feedback. Hover is never required.

### Motion

- Navigation, sheet, and pressed-state transitions use 160–220 ms durations.
- Motion communicates hierarchy; decorative scroll animation is excluded.
- `prefers-reduced-motion: reduce` disables nonessential movement.

## Screen designs

### Sessions

The screen contains:

1. Safe-area top spacing.
2. A large Sessions title.
3. Compact top-right Refresh and New Session icon controls.
4. Search.
5. Concise connection/live status when relevant.
6. A grouped session list.
7. The three-item tab bar.

Each session row shows:

- title, wrapping to a bounded second line when necessary;
- shortened directory or useful activity metadata;
- busy/idle/retry state using text plus a semantic indicator;
- a disclosure affordance for opening the conversation;
- a trailing 44-point More control for management actions.

Tapping the row opens the conversation. Tapping More opens a native-style action sheet with Rename, Delete, and Cancel. Delete retains the existing confirmation step. The action sheet provides the discoverability of explicit controls without permanently doubling every row's height. Custom swipe recognition is excluded because it would add fragile gesture handling and an additional accessibility path.

Refresh and New Session remain available while consuming only toolbar-sized space. Both controls have visible loading/disabled states and accessible names. New Session keeps the existing folder selection and validation behavior, presented as an iOS sheet.

### Conversation

The screen contains:

1. A compact navigation bar with a Sessions back control and the session title.
2. Secondary project/path metadata that truncates or wraps without widening the page.
3. Compact AI and Details controls when supported.
4. Todo, collaboration, question, transcript, tool, diff, and error content.
5. A bottom composer above the tab bar and home indicator.

The transcript uses blue user bubbles and quieter assistant grouping. Tool, reasoning, todo, diff, and question content keeps its existing semantic structure but loses unnecessary nested panel chrome. Code and diffs scroll within their own blocks; the page itself never gains horizontal overflow.

The composer:

- stays above the software keyboard and bottom safe area;
- uses a compact circular send/stop control;
- allows queued follow-up prompts exactly as today;
- grows only to a bounded height, then scrolls internally;
- keeps the latest transcript content clear of its measured height.

AI and Session Details continue to use bottom sheets. Sheet headers, handles, close behavior, scroll containment, and backdrop dismissal follow one shared visual contract.

### Settings

Settings uses grouped iOS form rows. The native iOS theme picker is removed because the approved appearance is dark-only. Language, host, port, username, password, connection test, warnings, and native collaboration attachment remain.

Inputs retain appropriate iOS keyboard hints, password-manager metadata, autocapitalization, and autocorrection behavior. Long warnings wrap below their field rather than creating a second column or widening the page.

### Help

Help uses a compact segmented or horizontally scrolling section selector and readable grouped content. Commands and code examples remain horizontally scrollable within their blocks. Decorative emoji markers are replaced with the existing SVG icon set or plain semantic headings.

### Dialogs, sheets, and notices

- Folder selection, collaboration attachment, AI, details, rename, delete, and tool/diff detail use a consistent iOS sheet/dialog vocabulary.
- Primary, cancel, and destructive actions maintain a predictable order.
- Destructive actions use both wording and color.
- Dialogs retain `role="dialog"`, `aria-modal`, labelled titles, focus visibility, backdrop dismissal where safe, and explicit close/cancel controls.
- Errors remain near the operation that produced them and are announced appropriately.

## Touch, wrapping, and safe-area rules

- Every interactive target is at least 44 by 44 CSS pixels.
- Adjacent compact targets have at least 8 CSS pixels of separation or distinct hit regions.
- Icon-only controls have accessible names and tooltips where useful outside iOS.
- Button labels use normal wrapping. Global button rules must not force every action to fill a grid column.
- Long unbroken paths and identifiers use safe wrapping or intentional single-line ellipsis.
- No native iOS screen produces horizontal page scrolling at 320 CSS pixels or wider.
- Top navigation respects `env(safe-area-inset-top)`.
- Tab bar, sheets, and composer respect `env(safe-area-inset-bottom)`.
- The composer remains usable with the software keyboard open.

## Accessibility

- Primary text and controls meet WCAG AA contrast in the approved dark palette.
- Focus indicators remain visible for keyboard and switch-control users.
- Navigation, action sheets, status messages, and dialogs retain semantic labels and roles.
- Selected, busy, offline, destructive, and disabled states are communicated by more than color.
- Reduced motion is honored.
- Touch interactions never depend on hover or an undiscoverable swipe gesture.
- Existing localization remains authoritative; the redesign does not hard-code user-visible English labels into shared components.

## Implementation boundaries

The shared React application remains the single implementation. Native iOS detection already exists through `Capacitor.getPlatform() === "ios"`.

Implementation will:

- add an `ios-native` root class when native iOS is active;
- render the three-item native iOS tab structure and conversation back navigation conditionally;
- conditionally render the compact iOS session-row management affordance and action sheet;
- hide the native iOS theme field and force the approved dark token set;
- add a scoped iOS CSS layer and reuse existing SVG icon components;
- preserve existing non-iOS markup and styling wherever the information architecture differs;
- update observable UI regression contracts for the new native iOS structure.

Implementation will not:

- change bridge or API contracts;
- change session, message, collaboration, streaming, storage, or authentication semantics;
- add a component library, gesture library, CSS framework, or font download;
- redesign web or desktop;
- rely on native Swift view code for ordinary screens.

## Error and state behavior

The redesign preserves all current functional states:

- initial connecting;
- connected and live updates;
- quiet reconnecting;
- offline with Retry and Settings recovery actions;
- empty sessions;
- loading and creating sessions;
- busy, idle, waiting, retry, and ended sessions;
- model/agent unavailable and loading states;
- pending questions and collaboration requests;
- prompt submission, queued follow-up, stop, and transport errors.

Restyling must not erase valid cached sessions or transcript content during reconnects. A control that cannot succeed remains disabled with an understandable state or nearby explanation.

## Verification

Automated checks:

1. Run the existing UI, settings, model, event, configuration, collaboration, storage, and packaging regression checks affected by the shared app.
2. Run the production TypeScript/Vite build.
3. Verify the iOS packaging/sync contract without generating or committing platform build output.
4. Add regression coverage only for new observable native-iOS contracts: iOS root scoping, three top-level tabs, no iOS Detail tab, session action-sheet path, dark-only native settings, and safe-area/wrapping invariants.

Interactive browser smoke checks with Capacitor reporting iOS:

1. At 320-pixel and modern iPhone widths, open Sessions and confirm no horizontal page overflow.
2. Exercise Refresh, New Session, search, session selection, More, rename, delete confirmation, and cancel.
3. Open a conversation, return with the Sessions back control, and confirm the selected row is restored into view.
4. Exercise AI and Details sheets, tool/diff dialogs, todos, questions, notices, and collaboration states available in the fixture/session.
5. Focus and grow the composer, send a prompt, show stop, and confirm content remains above the keyboard/composer clearance.
6. Open Settings and Help, verify dark-only appearance, wrapping, code-block scrolling, focus states, and tab navigation.
7. Check reduced-motion behavior and narrow/rotated viewport widths.

Windows can verify the Capacitor WebView UI contract but cannot build, sign, or run the native IPA. The final device gate remains a Mac/Xcode build followed by a real-iPhone pass covering safe areas, keyboard behavior, Dynamic Type, and touch response.

## Acceptance criteria

The redesign is complete when:

- native iOS opens in the approved dark visual system while web/desktop retain their current UI;
- Sessions, Settings, and Help are the only native iOS top-level tabs;
- selecting a session drills into Conversation and Back returns to Sessions;
- session management is available from a compact accessible action sheet rather than permanent oversized card buttons;
- no tested iPhone-width screen has horizontal page overflow or clipped/widened controls;
- all touch targets, safe areas, keyboard clearance, modal semantics, and reduced-motion rules hold;
- existing application behaviors and regression contracts continue to pass;
- the production build and iOS packaging checks pass;
- the interactive iPhone-viewport smoke flow succeeds.