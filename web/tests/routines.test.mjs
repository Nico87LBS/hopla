import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  moveStep,
  routineStepOf,
  routineTasks,
  waitsInRoutine,
  withoutWaitingSteps,
} from '../src/utils/routines.js'

const tonight = new Date(2026, 9, 30, 23, 59, 59)
const today = new Date(2026, 9, 30, 8).toISOString()
const later = new Date(2026, 10, 2, 8).toISOString()
const task = (id, name, assignedTo, nextDueDate = today) => ({
  id,
  name,
  assignedTo,
  nextDueDate,
  isActive: true,
})

const dress = task(1, 'Habillage', 2)
const teeth = task(2, 'Dents', 2)
const teethAnna = task(3, 'dents ', 3)
const bag = task(4, 'Cartable', 2, later)
const dishes = task(5, 'Vaisselle', 2)
const routines = [
  {
    id: 9,
    name: 'Matin',
    choreIds: [1, 2, 4],
    taskIds: [1, 2, 3, 4],
    members: [
      { userId: 2, current: 1, step: 1, done: 0, total: 2 },
      { userId: 3, current: 3, step: 1, done: 0, total: 1 },
    ],
  },
]

test('only the step to do now of a routine shows today', () => {
  assert.deepEqual(
    withoutWaitingSteps(
      [dress, teeth, teethAnna, bag, dishes],
      routines,
      tonight,
    ).map(c => c.id),
    [1, 3, 4, 5],
  )
  assert.equal(waitsInRoutine(routines, teeth, tonight), true)
  assert.equal(waitsInRoutine(routines, bag, tonight), false, 'due later')
  assert.equal(waitsInRoutine([], teeth, tonight), false)
})

test('the step to do now carries the child progress', () => {
  const step = routineStepOf(routines, dress)
  assert.equal(step.routine.name, 'Matin')
  assert.equal(step.progress.total, 2)
  assert.equal(routineStepOf(routines, dress, 3), null, 'not Anna’s')
  assert.equal(routineStepOf(routines, dishes), null)
})

test('a routine offers each task once, minus those of other routines', () => {
  const chores = [dress, teeth, teethAnna, bag, dishes]
  assert.deepEqual(
    routineTasks(chores, routines).map(c => c.id),
    [5],
  )
  assert.deepEqual(
    routineTasks(chores, routines, 9).map(c => c.name),
    ['Cartable', 'Dents', 'Habillage', 'Vaisselle'],
  )
})

test('steps move up and down within the list', () => {
  assert.deepEqual(moveStep([1, 2, 3], 1, -1), [2, 1, 3])
  assert.deepEqual(moveStep([1, 2, 3], 2, 1), [1, 2, 3])
})

test('a task can belong to different routines through different stable slots', () => {
  const multi = {
    ...task(6, 'Dents', 2),
    frequencyMetadata: {
      slots: [
        { id: 'morning', name: 'Matin', time: '07:00' },
        { id: 'evening', name: 'Soir', time: '19:00' },
      ],
    },
  }
  const slotRoutines = [
    { id: 10, choreIds: [6], slotIds: ['morning'] },
  ]
  const offered = routineTasks([multi], slotRoutines)
  assert.deepEqual(
    offered[0].routineAvailableSlots.map(slot => slot.id),
    ['evening'],
  )
  assert.equal(offered[0].routineCanUseAllSlots, false)
  assert.equal(
    routineTasks([multi], slotRoutines, 10)[0].routineCanUseAllSlots,
    true,
    'editing the routine releases its own slot',
  )
})
