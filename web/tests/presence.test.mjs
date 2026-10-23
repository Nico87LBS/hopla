import assert from 'node:assert/strict'
import { test } from 'node:test'

import { awayMemberIds, waitsForAbsent } from '../src/utils/presence.js'

test('a task waits while the child it is for is away', () => {
  const away = awayMemberIds([
    { userId: 2, away: true },
    { userId: 3, away: false },
    { userId: 1 },
  ])
  assert.deepEqual([...away], [2])
  assert.equal(waitsForAbsent({ assignedTo: 2 }, away), true)
  assert.equal(waitsForAbsent({ assignedTo: 3 }, away), false)
  assert.equal(waitsForAbsent({ assignedTo: null }, away), false)
  assert.equal(waitsForAbsent({ assignedTo: 2 }, new Set()), false)
})

test('a first-come task waits only when every child is away', () => {
  const task = {
    assignStrategy: 'together',
    assignedTo: null,
    assignees: [{ userId: 2 }, { userId: 3 }],
  }
  assert.equal(waitsForAbsent(task, new Set([2])), false)
  assert.equal(waitsForAbsent(task, new Set([2, 3])), true)
  assert.equal(
    waitsForAbsent({ ...task, assignees: [] }, new Set([2, 3])),
    false,
  )
})
