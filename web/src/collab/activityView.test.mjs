import assert from 'node:assert/strict'
import { nextDisclosureOpen, shouldLoadPatchDiff } from './activityView.ts'

assert.equal(nextDisclosureOpen(false, true), true, 'live activity opens')
assert.equal(nextDisclosureOpen(true, false), false, 'completed activity collapses')
assert.equal(nextDisclosureOpen(false, 'toggle'), true, 'a user can reopen completed activity')
assert.equal(nextDisclosureOpen(true, 'toggle'), false, 'a user can close activity')

assert.equal(shouldLoadPatchDiff(false, null), false, 'a hidden patch does not fetch')
assert.equal(shouldLoadPatchDiff(true, null), true, 'a visible unloaded patch fetches')
assert.equal(shouldLoadPatchDiff(true, []), false, 'a loaded patch does not refetch')

console.log('collab activity view contract tests passed')
