import assert from 'node:assert/strict'
import { ActivityDisclosure } from './ActivityDisclosure.tsx'
import { nextDisclosureOpen } from './activityView.ts'

const child = { type: 'pre', props: { children: 'retained output' } }
let open = nextDisclosureOpen(false, true)
const toggle = () => { open = nextDisclosureOpen(open, 'toggle') }
const render = () => ActivityDisclosure({
  id: 'activity-details-tool-1',
  open,
  onToggle: toggle,
  summaryClassName: 'message-tool-summary',
  detailsClassName: 'message-tool-details',
  summary: 'Run tool',
  children: child,
})

let tree = render()
let [button, details] = tree.props.children
assert.equal(button.type, 'button')
assert.equal(button.props.type, 'button')
assert.equal(button.props['aria-expanded'], true)
assert.equal(button.props['aria-controls'], 'activity-details-tool-1')
assert.equal(details.props.id, 'activity-details-tool-1')
assert.equal(details.props.hidden, false)
assert.equal(details.props.children, child, 'open details retain inline child content')

open = nextDisclosureOpen(open, false)
tree = render()
;[button, details] = tree.props.children
assert.equal(button.props['aria-expanded'], false, 'completion collapses the disclosure')
assert.equal(details.props.hidden, true)
assert.equal(details.props.children, child, 'collapsed details retain inline child content')

button.props.onClick()
tree = render()
;[button, details] = tree.props.children
assert.equal(button.props['aria-expanded'], true, 'the rendered handler reopens completed activity')
assert.equal(details.props.hidden, false)

button.props.onClick()
tree = render()
;[button, details] = tree.props.children
assert.equal(button.props['aria-expanded'], false, 'the rendered handler closes activity')
assert.equal(details.props.hidden, true)

console.log('collab activity disclosure contract tests passed')
