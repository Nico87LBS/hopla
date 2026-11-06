import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  faceOf,
  groupCopies,
  keepsTodayMissed,
  liveSlotState,
  nextTimeLater,
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

test('a task with a slot missed today stays among today’s', () => {
  const now = new Date(2026, 9, 23, 12, 30)
  const withSlots = { frequencyMetadata: { slots: [{}] } }
  const missed = { ...withSlots, id: 1, slotsToday: [slot(0, 6, 10, 'open')] }
  const done = { ...withSlots, id: 2, slotsToday: [slot(0, 6, 10, 'done')] }
  const later = {
    ...withSlots,
    id: 3,
    slotsToday: [slot(1, 18, 23, 'upcoming')],
  }
  assert.equal(keepsTodayMissed(missed, now), true)
  assert.equal(keepsTodayMissed(done, now), false)
  assert.equal(keepsTodayMissed(later, now), false)
  assert.equal(keepsTodayMissed({ id: 4 }, now), false)
})

test('a face shows the moment to do, then those waiting, missed, to come', () => {
  const st = state => ({ state })
  assert.deepEqual(
    faceOf([st('missed'), st('open')], true, false).state,
    'todo',
  )
  assert.equal(faceOf([st('open')], false, false).action, null, 'not hers')
  assert.equal(faceOf([st('open')], false, true).action, 'tick')
  assert.equal(
    faceOf([st('done'), st('pending')], true, false).action,
    'approve',
  )
  assert.equal(faceOf([st('done'), st('pending')], false, true).action, null)
  assert.equal(
    faceOf([st('missed'), st('upcoming')], true, false).action,
    'catchup',
  )
  assert.equal(
    faceOf([st('missed'), st('upcoming')], false, true).state,
    'missed',
  )
  assert.equal(
    faceOf([st('done'), st('upcoming')], true, false).state,
    'upcoming',
  )
  assert.equal(faceOf([st('done'), st('other')], true, false).state, 'done')
  assert.equal(faceOf([], true, false).state, 'done')
})

test('a task with every moment of today done stands for its next time', () => {
  const now = new Date(2026, 9, 23, 12, 30)
  const tomorrow = new Date(2026, 9, 24, 7, 0).toISOString()
  const today = new Date(2026, 9, 23, 18, 0).toISOString()
  const done = {
    id: 1,
    nextDueDate: tomorrow,
    slotsToday: [slot(0, 6, 10, 'done')],
  }
  // Done this morning and approved, due tomorrow: the faces wait.
  assert.equal(nextTimeLater([done], null, now), true)
  // Another child still has a moment to do today: the row stays today's.
  const other = {
    id: 2,
    nextDueDate: today,
    slotsToday: [slot(0, 6, 10, 'done'), slot(1, 17, 23, 'upcoming')],
  }
  assert.equal(nextTimeLater([done, other], null, now), false)
  // Waiting for a parent, or missed: still today's.
  const pending = { ...done, slotsToday: [slot(0, 6, 10, 'pending')] }
  assert.equal(nextTimeLater([pending], null, now), false)
  const missed = { ...done, slotsToday: [slot(0, 6, 10, 'open')] }
  assert.equal(nextTimeLater([missed], null, now), false)
})
