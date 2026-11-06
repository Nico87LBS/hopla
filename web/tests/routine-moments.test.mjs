import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  activeRoutines,
  missedSteps,
  nextStepName,
  routineHoursError,
  stepMoment,
  waitsInRoutine,
} from '../src/utils/routines.js'

const now = new Date(2026, 10, 6, 7, 40)
const tonight = new Date(2026, 10, 6, 23, 59, 59)
const at = (h, m) => new Date(2026, 10, 6, h, m).toISOString()
const slots = [
  {
    index: 0,
    slotId: 'matin',
    name: 'Matin',
    time: '07:30',
    at: at(7, 30),
    state: 'open',
  },
  {
    index: 1,
    slotId: 'soir',
    name: 'Soir',
    time: '20:00',
    at: at(20, 0),
    state: 'upcoming',
  },
]

test('a step shows only its moment, orange once its time is past', () => {
  const item = { choreId: 2, slotId: 'matin' }
  assert.equal(
    stepMoment(item, slots, new Date(2026, 10, 6, 7, 10)).tone,
    'neutral',
  )
  assert.equal(stepMoment(item, slots, now).tone, 'late')
  assert.equal(stepMoment(item, slots, now).slot.slotId, 'matin')
  const missed = [{ ...slots[0], state: 'missed' }, slots[1]]
  assert.equal(stepMoment(item, missed, now).tone, 'missed')
  assert.equal(stepMoment({ ...item, missed: true }, slots, now).tone, 'missed')
  assert.equal(
    stepMoment(item, [], now),
    null,
    'a task without moments has no pill',
  )
})

test('a missed step keeps the routine in its block and is not the next one', () => {
  const progress = {
    userId: 2,
    current: 4,
    available: [4],
    missed: [2],
    finished: false,
    occurrence: {
      items: [
        {
          id: 1,
          choreId: 2,
          slotId: 'matin',
          position: 0,
          status: 'pending',
          missed: true,
          choreName: 'Dents',
        },
        {
          id: 2,
          choreId: 4,
          position: 1,
          status: 'pending',
          choreName: 'Cartable',
        },
        {
          id: 3,
          choreId: 5,
          position: 2,
          status: 'pending',
          choreName: 'Chaussures',
        },
      ],
    },
  }
  assert.deepEqual(
    missedSteps(progress).map(item => item.choreId),
    [2],
  )
  assert.equal(nextStepName({}, progress, []), 'Chaussures')
  const over = { ...progress, current: null, available: [] }
  assert.equal(
    activeRoutines([{ id: 1, members: [over] }]).length,
    1,
    'still shown to catch up',
  )
  assert.equal(
    activeRoutines([{ id: 1, members: [{ ...over, missed: [] }] }]).length,
    0,
  )
})

test('a routine with hours shows in the hour before it opens', () => {
  const coming = {
    id: 1,
    window: 'upcoming',
    members: [{ userId: 2, total: 3, available: [] }],
  }
  assert.equal(activeRoutines([coming]).length, 1)
  assert.equal(activeRoutines([{ ...coming, window: 'closed' }]).length, 0)
})

test("a task's other moments come back to the list once the routine's is missed", () => {
  const chore = { id: 2, name: 'Dents', assignedTo: 2, nextDueDate: at(20, 0) }
  const routines = [
    {
      id: 1,
      taskIds: [2],
      members: [
        {
          userId: 2,
          current: 4,
          available: [4],
          occurrence: {
            items: [{ choreId: 2, slotId: 'matin', missed: true }],
          },
        },
      ],
    },
  ]
  const missed = () => [{ ...slots[0], state: 'missed' }, slots[1]]
  assert.equal(waitsInRoutine(routines, chore, tonight, missed), false)
  assert.equal(
    waitsInRoutine(routines, chore, tonight, () => slots),
    true,
  )
  assert.equal(
    waitsInRoutine(routines, chore, tonight),
    true,
    'without moments known, as before',
  )
})

test('routine hours are both or none, the end after the start', () => {
  assert.equal(routineHoursError({ startsAt: '', endsAt: '' }), '')
  assert.equal(routineHoursError({ startsAt: '07:00', endsAt: '' }), 'one')
  assert.equal(
    routineHoursError({ startsAt: '08:00', endsAt: '07:30' }),
    'order',
  )
  assert.equal(routineHoursError({ startsAt: '07:00', endsAt: '08:30' }), '')
})

test('une routine sans rien à cocher se réduit, couleur selon son état', async () => {
  const { settledRoutine } = await import('../src/utils/routines.js')
  // Un enfant a fini : verte.
  assert.deepEqual(
    settledRoutine([{ finished: true, missed: 0, states: [] }]),
    {
      tone: 'green',
      pending: 0,
      missed: 0,
    },
  )
  // Étapes à valider par un parent : orange.
  assert.deepEqual(
    settledRoutine([
      { finished: false, missed: 0, states: ['pending', 'pending'] },
    ]),
    { tone: 'orange', pending: 2, missed: 0 },
  )
  // Étape manquée : rouge, même avec une étape à valider.
  assert.equal(
    settledRoutine([{ finished: false, missed: 1, states: ['pending'] }]).tone,
    'red',
  )
  // Une étape à cocher, ou une étape qui attend la précédente : pas réduite.
  assert.equal(
    settledRoutine([{ finished: false, missed: 0, states: ['todo'] }]),
    null,
  )
  assert.equal(
    settledRoutine([{ finished: false, missed: 0, states: [] }]),
    null,
  )
  // Un enfant a encore à faire : pas réduite.
  assert.equal(
    settledRoutine([
      { finished: true, missed: 0, states: [] },
      { finished: false, missed: 0, states: ['open'] },
    ]),
    null,
  )
  assert.equal(settledRoutine([]), null)
})
