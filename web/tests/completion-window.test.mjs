import assert from 'node:assert/strict'
import test from 'node:test'

import {
  readCompletionWindow,
  tooEarly,
} from '../src/utils/completionWindow.js'

const due = '2026-11-06T10:00:00Z'

test('without a window a task can be done any time', () => {
  assert.equal(
    tooEarly({ nextDueDate: due }, new Date('2026-11-01T00:00:00Z')),
    false,
  )
  assert.equal(
    tooEarly(
      { nextDueDate: due, completionWindow: null },
      new Date('2026-11-01T00:00:00Z'),
    ),
    false,
  )
  assert.equal(
    tooEarly(
      { nextDueDate: due, completionWindow: -1 },
      new Date('2026-11-01T00:00:00Z'),
    ),
    false,
  )
})

test('a window of 0 means only once the due date is reached', () => {
  const chore = { nextDueDate: due, completionWindow: 0 }
  assert.equal(tooEarly(chore, new Date('2026-11-06T09:59:00Z')), true)
  assert.equal(tooEarly(chore, new Date('2026-11-06T10:00:00Z')), false)
})

test('a window of 2 hours opens 2 hours before', () => {
  const chore = { nextDueDate: due, completionWindow: 2 }
  assert.equal(tooEarly(chore, new Date('2026-11-06T07:59:00Z')), true)
  assert.equal(tooEarly(chore, new Date('2026-11-06T08:00:00Z')), false)
})

test('the editor keeps a window of 0 when it reloads', () => {
  assert.equal(readCompletionWindow(0), 0)
  assert.equal(readCompletionWindow(5), 5)
  assert.equal(readCompletionWindow(null), -1)
  assert.equal(readCompletionWindow(undefined), -1)
  assert.equal(readCompletionWindow(-1), -1)
})
