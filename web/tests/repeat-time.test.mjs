import assert from 'node:assert/strict'
import { test } from 'node:test'

import moment from 'moment'

import { isAnyTime, withRepeatTime } from '../src/utils/repeatTime.js'

test('a due date without a time keeps the next ones without a time', () => {
  const metadata = withRepeatTime(
    'days_of_the_week',
    { days: ['monday'], time: '2026-10-23T18:00:00+02:00' },
    '2026-10-26T23:59:59',
  )
  assert.equal(moment(metadata.time).format('HH:mm'), '23:59')
  assert.ok(isAnyTime(metadata.time))
  assert.deepEqual(metadata.days, ['monday'])
})

test('a due date with a time sets the time of the next ones', () => {
  const metadata = withRepeatTime(
    'interval',
    { unit: 'days', time: '2026-10-23T18:00:00+02:00' },
    '2026-10-26T07:30:00',
  )
  assert.equal(moment(metadata.time).format('HH:mm'), '07:30')
  assert.ok(!isAnyTime(metadata.time))
})

test('no due date means any time, other types are left alone', () => {
  assert.ok(isAnyTime(withRepeatTime('day_of_the_month', {}, null).time))
  const metadata = { time: 'x' }
  assert.equal(withRepeatTime('daily', metadata, null), metadata)
  assert.equal(withRepeatTime('interval', null, null), null)
})
