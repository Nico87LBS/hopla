import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  deadlineApplies,
  deadlineOf,
  deadlineState,
  shortDuration,
} from '../src/utils/deadline.js'

const task = {
  frequencyType: 'once',
  nextDueDate: '2026-11-07T10:00:00Z',
  deadlineMinutes: 120,
}

test('a deadline only goes with a dated task without slots', () => {
  assert.equal(deadlineApplies('once', {}), true)
  assert.equal(deadlineApplies('days_of_the_week', { days: ['monday'] }), true)
  for (const type of ['always', 'trigger', 'adaptive']) {
    assert.equal(deadlineApplies(type, {}), false, type)
  }
  assert.equal(
    deadlineApplies('daily', { slots: [{ name: 'Soir', time: '18:00' }] }),
    false,
  )
  assert.equal(deadlineOf({ ...task, nextDueDate: null }), null)
  assert.equal(deadlineOf({ ...task, deadlineMinutes: null }), null)
  assert.equal(deadlineOf(task).toISOString(), '2026-11-07T12:00:00.000Z')
})

test('the deadline shows before the due time, then the time left', () => {
  const before = deadlineState(task, new Date('2026-11-07T09:00:00Z'))
  assert.equal(before.phase, 'before')
  const late = deadlineState(task, new Date('2026-11-07T11:14:30Z'))
  assert.deepEqual(
    { phase: late.phase, minutesLeft: late.minutesLeft },
    { phase: 'late', minutesLeft: 46 },
  )
  assert.equal(deadlineState(task, new Date('2026-11-07T12:00:00Z')), null)
})

test('a length of time is said shortly', () => {
  const t = (key, values) => `${key}:${JSON.stringify(values)}`
  assert.equal(shortDuration(45, t), 'deadline.minutes:{"count":45}')
  assert.equal(shortDuration(120, t), 'deadline.hours:{"count":2}')
  assert.equal(
    shortDuration(135, t),
    'deadline.hoursMinutes:{"hours":2,"minutes":"15"}',
  )
  assert.equal(shortDuration(3 * 24 * 60, t), 'deadline.days:{"count":3}')
  assert.equal(
    shortDuration(26 * 60, t),
    'deadline.daysHours:{"count":1,"hours":2}',
  )
})
