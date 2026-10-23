import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  groupCopies,
  liveSlotState,
  pullCopiesTogether,
  todaySlots,
} from '../src/utils/taskSlots.js'

const at = hour => new Date(2026, 9, 23, hour, 0, 0).toISOString()
const slot = (index, opens, closes, state) => ({
  index,
  at: at(opens + 1),
  opensAt: at(opens),
  closesAt: at(closes),
  state,
})

test('the state of a slot follows the time between two refreshes', () => {
  const now = new Date(2026, 9, 23, 12, 30)
  assert.equal(liveSlotState(slot(0, 6, 10, 'open'), now), 'missed')
  assert.equal(liveSlotState(slot(1, 10, 18, 'upcoming'), now), 'open')
  assert.equal(liveSlotState(slot(2, 18, 23, 'upcoming'), now), 'upcoming')
  assert.equal(liveSlotState(slot(0, 6, 10, 'pending'), now), 'pending')
  assert.equal(liveSlotState(slot(0, 6, 10, 'done'), now), 'done')
})

test('todaySlots prefers the slots query and drops another day', () => {
  const now = new Date(2026, 9, 23, 12, 30)
  const chore = { id: 7, slotsToday: [slot(0, 6, 10, 'done')] }
  assert.deepEqual(
    todaySlots(chore, { 7: [slot(0, 6, 10, 'open')] }, now).map(s => s.state),
    ['missed'],
  )
  assert.deepEqual(
    todaySlots(chore, null, now).map(s => s.state),
    ['done'],
  )
  const tomorrow = new Date(2026, 9, 25, 9, 0)
  assert.deepEqual(todaySlots(chore, null, tomorrow), [])
})

test('groupCopies keeps one group per task name, in order', () => {
  const groups = groupCopies([
    { id: 1, name: 'Dents', assignedTo: 1 },
    { id: 2, name: 'Mettre la table', assignedTo: 1 },
    { id: 3, name: ' dents ', assignedTo: 2 },
    { id: 4, name: 'Dents', assignedTo: 2 },
  ])
  assert.deepEqual(
    groups.map(g => g.chores.map(c => c.id)),
    [[1, 3], [2], [4]],
  )
})

test('pullCopiesTogether brings later copies to the first section', () => {
  const sections = pullCopiesTogether([
    { name: 'late', content: [{ id: 1, name: 'Dents' }] },
    {
      name: 'today',
      content: [
        { id: 2, name: 'Table' },
        { id: 3, name: 'Dents' },
      ],
    },
  ])
  assert.deepEqual(
    sections.map(s => s.content.map(c => c.id)),
    [[1, 3], [2]],
  )
})
