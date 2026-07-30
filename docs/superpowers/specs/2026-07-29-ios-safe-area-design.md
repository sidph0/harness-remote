# Native iOS safe-area design

## Goal

Keep the native iOS interface edge-to-edge and black while ensuring every screen begins below the status bar, notch, or Dynamic Island on all supported iPhones and orientations.

## Root cause

The native shell already applies `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` in `web/src/styles.css`. The document viewport in `web/index.html` omits `viewport-fit=cover`, so the full-screen Capacitor WebView does not expose the usable WebKit safe-area insets to that CSS. The screenshot confirms the resulting zero top inset: the Settings heading starts underneath the Dynamic Island.

WebKit's documented full-screen pattern is the combination of:

1. `viewport-fit=cover` on the viewport metadata;
2. `env(safe-area-inset-*)` padding on important content.

## Design

Add `viewport-fit=cover` to the existing viewport metadata without removing `interactive-widget=resizes-content`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content" />
```

Apply every device-reported inset to content that becomes edge-to-edge:

```css
.app-shell.ios-native {
  padding: calc(env(safe-area-inset-top) + 0.5rem) env(safe-area-inset-right) calc(64px + env(safe-area-inset-bottom)) env(safe-area-inset-left);
}

.ios-native .bottom-nav {
  padding: 0.25rem calc(0.5rem + env(safe-area-inset-right)) env(safe-area-inset-bottom) calc(0.5rem + env(safe-area-inset-left));
}
```

This leaves the black root background behind the system areas while dynamically moving headings below the status bar and interactive content away from a landscape notch or rounded corner. The additional `0.5rem` remains ordinary visual spacing after the system-controlled inset.

Landscape and future iPhone geometry remain system-controlled; there are no per-model media queries, fixed notch heights, user-agent checks, or Status Bar plugin dependency.

## Scope

Modify only:

- `web/index.html`
- `web/src/styles.css`
- `web/src/ui-regression.test.mjs`

Do not change headings, panel spacing, Capacitor configuration, native status-bar appearance, or Android/browser layouts.

## Regression contract

The UI regression reads `web/index.html` and verifies:

- the viewport retains `width=device-width` and `initial-scale=1.0`;
- `interactive-widget=resizes-content` remains present for keyboard handling;
- `viewport-fit=cover` is present;
- the native shell consumes all four safe-area environment variables;
- fixed bottom navigation consumes the left, right, and bottom safe-area environment variables.

The regression must fail before the metadata change and pass after it.

## Verification

- Run the focused UI regression and production build.
- Run the complete existing web regression suite.
- Inspect the built `dist/index.html` to confirm Vite preserves `viewport-fit=cover`.
- Browser-check that non-iOS layouts and native spacing with a zero browser inset remain unchanged.
- Rebuild and sync the iOS project with `npm run build` and `npm run cap:sync:ios`.
- Final device proof requires installing the rebuilt IPA: verify portrait and landscape on the iPhone 17 Pro Max and one other notched or Dynamic Island iPhone when available.
