import assert from 'node:assert/strict'
import { currentStreamReasoningID, nextDisclosureOpen } from './activityView.ts'

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

assert.equal(nextDisclosureOpen(false, true), true, 'live activity opens')
assert.equal(nextDisclosureOpen(true, false), false, 'completed activity collapses')
assert.equal(nextDisclosureOpen(false, 'toggle'), true, 'a user can reopen completed activity')
assert.equal(nextDisclosureOpen(true, 'toggle'), false, 'a user can close activity')

console.log('collab activity view contract tests passed')
