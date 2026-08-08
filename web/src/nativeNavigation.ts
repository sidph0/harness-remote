export type NativeView = "sessions" | "settings" | "help" | "detail"
export type NativeSwipeResult = { view: Exclude<NativeView, "detail">; direction: "forward" | "back" }

type NativeSwipeInput = {
  view: NativeView
  startX: number
  startY: number
  endX: number
  endY: number
  viewportWidth: number
  blocked?: boolean
}

const TABS: Exclude<NativeView, "detail">[] = ["sessions", "settings", "help"]

export function nativeTabDirection(view: NativeView, target: Exclude<NativeView, "detail">): "forward" | "back" {
  if (view === "detail" && target === "sessions") return "back"
  const current = view === "detail" ? "sessions" : view
  return TABS.indexOf(target) >= TABS.indexOf(current) ? "forward" : "back"
}

export function resolveNativeSwipe(input: NativeSwipeInput): NativeSwipeResult | null {
  if (input.blocked) return null
  const deltaX = input.endX - input.startX
  const deltaY = input.endY - input.startY
  if (Math.abs(deltaX) < 56 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return null

  if (input.view === "detail") {
    const edge = Math.min(32, input.viewportWidth * 0.1)
    return deltaX > 0 && input.startX <= edge ? { view: "sessions", direction: "back" } : null
  }

  const index = TABS.indexOf(input.view)
  const nextIndex = index + (deltaX < 0 ? 1 : -1)
  if (nextIndex < 0 || nextIndex >= TABS.length) return null
  return { view: TABS[nextIndex], direction: deltaX < 0 ? "forward" : "back" }
}
