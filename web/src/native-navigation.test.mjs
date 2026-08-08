import assert from 'node:assert/strict'
import { nativeTabDirection, resolveNativeSwipe } from './nativeNavigation.ts'

const swipe = (view, startX, startY, endX, endY, extra = {}) =>
  resolveNativeSwipe({ view, startX, startY, endX, endY, viewportWidth: 390, ...extra })

assert.deepEqual(swipe('sessions', 320, 200, 220, 205), { view: 'settings', direction: 'forward' })
assert.deepEqual(swipe('settings', 320, 200, 220, 205), { view: 'help', direction: 'forward' })
assert.deepEqual(swipe('settings', 70, 200, 170, 205), { view: 'sessions', direction: 'back' })
assert.equal(swipe('help', 320, 200, 220, 205), null, 'the last tab has no forward destination')
assert.equal(swipe('sessions', 70, 200, 170, 205), null, 'the first tab has no back destination')
assert.equal(swipe('sessions', 300, 200, 260, 202), null, 'short drags are not navigation')
assert.equal(swipe('sessions', 300, 100, 220, 240), null, 'vertical gestures are not navigation')
assert.equal(swipe('sessions', 300, 200, 200, 205, { blocked: true }), null, 'interactive content keeps its gesture')
assert.deepEqual(swipe('detail', 18, 200, 110, 205), { view: 'sessions', direction: 'back' })
assert.equal(swipe('detail', 70, 200, 170, 205), null, 'conversation back swipe starts at the screen edge')
assert.equal(nativeTabDirection('detail', 'sessions'), 'back', 'tapping Sessions from a conversation uses the return motion')
assert.equal(nativeTabDirection('sessions', 'settings'), 'forward')
assert.equal(nativeTabDirection('help', 'settings'), 'back')
