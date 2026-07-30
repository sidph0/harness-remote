import assert from 'node:assert/strict'
import { currentStreamReasoningID, nextDisclosureOpen, shouldLoadPatchDiff } from './activityView.ts'

const stream = (parts) => [{ info: { id: 'collab-stream-100' }, parts }]
const reasoning = (id) => ({ id, type: 'reasoning', text: id })

assert.equal(
  currentStreamReasoningID(stream([reasoning('older'), { id: 'reply', type: 'text', text: 'Done' }])),
  undefined,
  'reasoning followed by text is no longer current',
)
assert.equal(
  currentStreamReasoningID(stream([reasoning('older'), { id: 'tool', type: 'tool', state: { status: 'running' } }])),
  undefined,
  'reasoning followed by a tool is no longer current',
)
assert.equal(
  currentStreamReasoningID(stream([reasoning('older'), reasoning('current')])),
  'current',
  'only the trailing reasoning segment is current',
)
assert.equal(
  currentStreamReasoningID([
    ...stream([reasoning('stream-current')]),
    { info: { id: 'collab-tool-running-later' }, parts: [{ id: 'later-tool', type: 'tool', state: { status: 'running' } }] },
  ]),
  undefined,
  'later event-only tool activity ends prior stream reasoning',
)

assert.equal(nextDisclosureOpen(false, true), true, 'live activity opens')
assert.equal(nextDisclosureOpen(true, false), false, 'completed activity collapses')
assert.equal(nextDisclosureOpen(false, 'toggle'), true, 'a user can reopen completed activity')
assert.equal(nextDisclosureOpen(true, 'toggle'), false, 'a user can close activity')

assert.equal(shouldLoadPatchDiff(false, null), false, 'a hidden patch does not fetch')
assert.equal(shouldLoadPatchDiff(true, null), true, 'a visible unloaded patch fetches')
assert.equal(shouldLoadPatchDiff(true, []), false, 'a loaded patch does not refetch')

console.log('collab activity view contract tests passed')
