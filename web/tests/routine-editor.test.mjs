import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  addSteps,
  chainDependencies,
  draftFromRoutine,
  draftOrderMode,
  loopingPrerequisites,
  moveStepTo,
  orderModeOf,
  previewSteps,
  removeStepAt,
  setPrerequisites,
  withOrder,
} from '../src/utils/routines.js'

const draft = (choreIds, extra = {}) => ({
  name: 'Matin',
  bonus: 5,
  validityMinutes: 720,
  choreIds,
  slotIds: choreIds.map(() => ''),
  optionalStepIds: [],
  dependencies: chainDependencies(choreIds.length),
  ...extra,
})

test('the order of a routine is told from its dependencies', () => {
  assert.equal(orderModeOf(chainDependencies(3), 3), 'sequence')
  assert.equal(orderModeOf([], 3), 'free')
  assert.equal(orderModeOf([{ stepId: 3, dependsOnStepId: 1 }], 3), 'custom')
  assert.equal(orderModeOf([], 1), 'sequence')
})

test('choosing an order sets the dependencies', () => {
  const base = draft([10, 11, 12])
  assert.deepEqual(withOrder(base, 'free').dependencies, [])
  assert.deepEqual(
    withOrder(withOrder(base, 'free'), 'sequence').dependencies,
    chainDependencies(3),
  )
  assert.deepEqual(withOrder(base, 'custom').dependencies, chainDependencies(3))
  assert.deepEqual(
    withOrder(withOrder(base, 'free'), 'custom').dependencies,
    [],
  )
})

test('choosing the custom order keeps it chosen', () => {
  const fromSequence = withOrder(draft([10, 11, 12]), 'custom')
  assert.equal(draftOrderMode(fromSequence), 'custom')
  const fromFree = withOrder(withOrder(draft([10, 11, 12]), 'free'), 'custom')
  assert.equal(draftOrderMode(fromFree), 'custom')
  assert.equal(draftOrderMode(withOrder(fromFree, 'sequence')), 'sequence')
  // Changing a step keeps the custom order, even back to a chain.
  const opened = setPrerequisites(fromSequence, 2, [])
  assert.equal(draftOrderMode(opened), 'custom')
  assert.equal(draftOrderMode(setPrerequisites(opened, 2, [1])), 'custom')
  // Moving a step in a custom order keeps each step's own prerequisites.
  const moved = moveStepTo(opened, 2, 0)
  assert.equal(draftOrderMode(moved), 'custom')
  assert.deepEqual(moved.dependencies, [{ stepId: 1, dependsOnStepId: 3 }])
})

test('moving a step in a sequence keeps the sequence', () => {
  const moved = moveStepTo(draft([10, 11, 12], { optionalStepIds: [3] }), 2, 0)
  assert.deepEqual(moved.choreIds, [12, 10, 11])
  assert.deepEqual(moved.dependencies, chainDependencies(3))
  assert.deepEqual(moved.optionalStepIds, [1], 'optional goes with its step')
})

test('moving a step in a custom order keeps who waits for whom', () => {
  const custom = draft([10, 11, 12], {
    dependencies: [{ stepId: 3, dependsOnStepId: 1 }],
  })
  // step 1 goes to the end: it is now step 3, and 12 (now step 2) waits for it
  const moved = moveStepTo(custom, 0, 2)
  assert.deepEqual(moved.choreIds, [11, 12, 10])
  assert.deepEqual(moved.dependencies, [{ stepId: 2, dependsOnStepId: 3 }])
})

test('slots follow their step', () => {
  const base = draft([10, 11], { slotIds: ['a', ''] })
  assert.deepEqual(moveStepTo(base, 0, 1).slotIds, ['', 'a'])
  assert.deepEqual(removeStepAt(base, 0).slotIds, [''])
})

test('removing a step drops its links and moves the others up', () => {
  const custom = draft([10, 11, 12, 13], {
    optionalStepIds: [2, 4],
    dependencies: [
      { stepId: 3, dependsOnStepId: 2 },
      { stepId: 4, dependsOnStepId: 3 },
    ],
  })
  const removed = removeStepAt(custom, 1)
  assert.deepEqual(removed.choreIds, [10, 12, 13])
  assert.deepEqual(removed.optionalStepIds, [3])
  assert.deepEqual(removed.dependencies, [{ stepId: 3, dependsOnStepId: 2 }])
})

test('added steps follow in a sequence, open at once otherwise', () => {
  const sequence = addSteps(draft([10, 11]), [{ choreId: 12, slotId: 's' }])
  assert.deepEqual(sequence.dependencies, chainDependencies(3))
  assert.deepEqual(sequence.slotIds, ['', '', 's'])
  const free = addSteps(withOrder(draft([10, 11]), 'free'), [{ choreId: 12 }])
  assert.deepEqual(free.dependencies, [])
  assert.equal(
    addSteps(draft([]), [{ choreId: 1 }, { choreId: 2 }]).choreIds.length,
    2,
  )
  const full = draft(Array.from({ length: 12 }, (_, i) => i + 1))
  assert.equal(addSteps(full, [{ choreId: 99 }]).choreIds.length, 12)
})

test('prerequisites are set per step and never loop', () => {
  const free = withOrder(draft([10, 11, 12]), 'free')
  const set = setPrerequisites(free, 3, [1, 2, 3])
  assert.deepEqual(set.dependencies, [
    { stepId: 3, dependsOnStepId: 1 },
    { stepId: 3, dependsOnStepId: 2 },
  ])
  assert.deepEqual(
    [...loopingPrerequisites(chainDependencies(3), 1)].sort(),
    [2, 3],
    'steps after step 1 cannot be its prerequisite',
  )
  assert.equal(loopingPrerequisites(chainDependencies(3), 3).size, 0)
})

test('the preview says what is open first', () => {
  const steps = previewSteps(draft([10, 11, 12], { optionalStepIds: [2] }))
  assert.deepEqual(
    steps.map(step => step.open),
    [true, false, true],
  )
  assert.deepEqual(steps[1].waitsFor, [1])
  assert.equal(steps[1].optional, true)
})

test('a routine from the server is edited without its deleted tasks', () => {
  const routine = {
    id: 7,
    name: 'Soir',
    bonus: 3,
    choreIds: [10, 11, 12],
    slotIds: ['', 'x', ''],
    optionalChoreIds: [12],
    dependencies: chainDependencies(3),
  }
  const edited = draftFromRoutine(routine, new Set([10, 12]))
  assert.deepEqual(edited.choreIds, [10, 12])
  assert.deepEqual(edited.optionalStepIds, [2])
  assert.deepEqual(edited.dependencies, chainDependencies(2))
  assert.equal(edited.validityMinutes, 720)
})
