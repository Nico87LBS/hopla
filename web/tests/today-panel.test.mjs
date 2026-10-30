import assert from 'node:assert/strict'
import { test } from 'node:test'

import moment from 'moment'

import { dayTotals, membersOfDay } from '../src/utils/todayPanel.js'

test('the panel shows the children, or everyone without children', () => {
  const nico = { userId: 1, role: 'admin' }
  const elena = { userId: 2, role: 'member' }
  const gone = { userId: 3, role: 'member', isActive: false }
  assert.deepEqual(membersOfDay([nico, elena, gone]), [elena])
  assert.deepEqual(membersOfDay([nico]), [nico])
  assert.deepEqual(membersOfDay(undefined), [])
})

test('tasks count on their day, late ones today', () => {
  const now = moment('2026-10-30T10:00:00')
  const at = text => ({ nextDueDate: moment(text).toISOString() })
  const days = dayTotals(
    [
      at('2026-10-28T08:00:00'),
      at('2026-10-30T19:00:00'),
      at('2026-10-31T08:00:00'),
      at('2026-11-06T08:00:00'),
      at('2026-11-12T08:00:00'),
      { nextDueDate: null },
    ],
    now,
  )
  assert.deepEqual(
    days.map(d => d.count),
    [2, 1, 0, 0, 0, 0, 0],
  )
  assert.equal(days[0].date.getDate(), 30)
  assert.equal(days[6].date.getDate(), 5)
})
