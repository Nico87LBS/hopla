import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  copiesOf,
  copyUpdate,
  perMemberChores,
  splitIntoCopies,
} from '../src/utils/taskCopies.js'

test('copiesOf finds the other tasks with the same name', () => {
  const chores = [
    { id: 1, name: 'Faire son lit' },
    { id: 2, name: ' faire  son LIT ' },
    { id: 3, name: 'Mettre la table' },
    { id: 4, name: 'Faire son lit', isActive: false },
  ]
  assert.deepEqual(
    copiesOf(chores[0], chores).map(c => c.id),
    [2, 4],
  )
  assert.deepEqual(copiesOf(chores[2], chores), [])
  assert.deepEqual(copiesOf({}, chores), [])
})

test('perMemberChores makes one copy for each member', () => {
  const chore = {
    name: 'Faire son lit',
    points: 1,
    assignees: [{ userId: 2 }, { userId: 3 }],
    assignedTo: 2,
    assignStrategy: 'random',
    draftId: 'draft',
  }
  const copies = perMemberChores(chore, chore.assignees)
  assert.equal(copies.length, 2)
  assert.deepEqual(
    copies.map(c => [c.assignees, c.assignedTo, c.assignStrategy]),
    [
      [[{ userId: 2 }], 2, 'keep_last_assigned'],
      [[{ userId: 3 }], 3, 'keep_last_assigned'],
    ],
  )
  assert.deepEqual(
    copies.map(c => c.draftId),
    ['draft', undefined],
  )
  assert.ok(copies.every(c => c.name === 'Faire son lit' && c.points === 1))
})

test('copyUpdate carries the shared settings and keeps the copy its own', () => {
  const copy = {
    id: 9,
    name: 'Faire son lit',
    points: 1,
    assignees: [{ userId: 3 }],
    assignedTo: 3,
    assignStrategy: 'keep_last_assigned',
    nextDueDate: '2026-10-22T06:00:00Z',
    isActive: true,
    subTasks: [{ id: 5, name: 'Oreiller' }],
  }
  const saved = {
    id: 8,
    name: 'Faire son lit',
    points: 2,
    requireApproval: true,
    frequencyType: 'daily',
    frequency: 1,
    labelsV2: [{ id: 1 }],
    assignees: [{ userId: 2 }],
    assignedTo: 2,
    nextDueDate: '2026-10-23T06:00:00Z',
    subTasks: [],
  }
  const update = copyUpdate(copy, saved)
  assert.equal(update.id, 9)
  assert.equal(update.points, 2)
  assert.equal(update.requireApproval, true)
  assert.deepEqual(update.labelsV2, [{ id: 1 }])
  assert.deepEqual(update.assignees, [{ userId: 3 }])
  assert.equal(update.assignedTo, 3)
  assert.equal(update.nextDueDate, '2026-10-22T06:00:00Z')
  assert.equal('subTasks' in update, false, 'sub-tasks are left as they are')
})

test('copyUpdate gives the copies a due date the edit changed', () => {
  const copy = { id: 9, nextDueDate: '2026-10-22T06:00:00Z', assignees: [] }
  const saved = { id: 8, dueDate: '2026-10-25T06:00:00.000Z' }
  assert.equal(
    copyUpdate(copy, saved, '2026-10-23T06:00:00Z').dueDate,
    '2026-10-25T06:00:00.000Z',
  )
  assert.equal(
    copyUpdate(copy, saved, '2026-10-25T06:00:00Z').nextDueDate,
    '2026-10-22T06:00:00Z',
    'same date, written another way: each copy keeps its own',
  )
  assert.equal(
    copyUpdate(copy, { id: 8, dueDate: null }, '2026-10-23T06:00:00Z').dueDate,
    null,
    'a removed due date is removed on the copies too',
  )
  assert.equal(copyUpdate(copy, saved).dueDate, '2026-10-22T06:00:00Z')
})

test('splitIntoCopies keeps the task with the current assignee', () => {
  const chore = { id: 7, name: 'Dents', assignees: [], draftId: 'd' }
  const { update, creates } = splitIntoCopies(
    chore,
    [{ userId: 1 }, { userId: 2 }, { userId: 3 }],
    2,
  )
  assert.equal(update.id, 7)
  assert.equal(update.assignedTo, 2)
  assert.deepEqual(update.assignees, [{ userId: 2 }])
  assert.deepEqual(
    creates.map(copy => [copy.id, copy.assignedTo, copy.draftId]),
    [
      [undefined, 1, undefined],
      [undefined, 3, undefined],
    ],
  )
})
