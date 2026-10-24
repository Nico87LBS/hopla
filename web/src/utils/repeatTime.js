import moment from 'moment'

import { familyTimezone } from './familyTime.js'

// A repeating task comes back at the time of day of its due date. A due date
// at 23:59 has no time: the task is due any time that day, and so are the
// next ones.

const REPEAT_ON_TYPE = ['interval', 'days_of_the_week', 'day_of_the_month']

export const isAnyTime = date => {
  const m = moment(date)
  return m.hours() === 23 && m.minutes() === 59
}

// The metadata to save: its time follows the due date, or is "any time" when
// there is no due date.
export const withRepeatTime = (frequencyType, metadata, dueDate) => {
  if (!REPEAT_ON_TYPE.includes(frequencyType) || !metadata) return metadata
  const time = dueDate ? moment(dueDate) : moment().endOf('day')
  return {
    ...metadata,
    time: time.format(),
    // The zone the time above is written in, the family's.
    timezone: familyTimezone(),
  }
}
