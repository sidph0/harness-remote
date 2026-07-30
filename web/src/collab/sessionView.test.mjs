import assert from 'node:assert/strict'
import { collabSessionView, mergeCollabSessionViews } from './sessionView.ts'

const attachment = { id: 'desktop-build', name: 'Desktop build', link: 'secret', readOnly: false }
const initial = collabSessionView(attachment, undefined, undefined, 200)
assert.equal(initial.id, 'collab:desktop-build')
assert.equal(initial.title, 'Desktop build')
assert.equal(initial.directory, 'OMP Collab')
assert.equal(initial.updated, 200)
assert.equal(initial.status, 'connecting')

const updated = collabSessionView(attachment, initial, {
  id: 'host-session', title: 'Older host title', directory: 'C:\\work', updated: 100,
  files: 0, additions: 0, deletions: 0, status: 'idle', external: true
}, 300)
assert.equal(updated.id, 'collab:desktop-build')
assert.equal(updated.title, 'Desktop build')
assert.equal(updated.directory, 'C:\\work')
assert.equal(updated.updated, 200)

const directSession = {
  id: 'direct', title: 'Direct session', directory: '/work', updated: 150,
  files: 0, additions: 0, deletions: 0, status: 'idle'
}
const merged = mergeCollabSessionViews([directSession], [attachment], new Map(), 200)
assert.deepEqual(merged.map((session) => session.id), ['collab:desktop-build', 'direct'])

const ended = { ...initial, status: 'ended', updated: 250 }
const withEnded = mergeCollabSessionViews([directSession], [attachment], new Map([[ended.id, ended]]), 300)
assert.equal(withEnded.find((session) => session.id === ended.id)?.status, 'ended')

const detached = mergeCollabSessionViews([directSession], [], new Map([[ended.id, ended]]), 300)
assert.deepEqual(detached, [directSession])

console.log('collab session view contract tests passed')
