import i18n from 'i18next'
import moment from 'moment'

const allMonths = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
/**
 * Get the text to display for a chore's due date
 * @param {string|null} nextDueDate - The next due date of the chore
 * @param {Object} chore - The chore object (needed for nextDueDate null check)
 * @returns {string} The formatted due date text
 */
export const getDueDateChipText = (
  nextDueDate,
  chore,
  timeFormat = 'h:mm A',
) => {
  if (chore?.nextDueDate === null || nextDueDate === null)
    return i18n.t('chores:dueChip.noDueDate')

  const dueDate = moment(nextDueDate)
  const diff = moment(nextDueDate).diff(moment(), 'hours')

  const calendarFormat = {
    sameDay: `[${i18n.t('chores:dueChip.today')}] ${timeFormat}`,
    nextDay: `[${i18n.t('chores:dueChip.tomorrow')}] ${timeFormat}`,
    nextWeek: `dddd ${timeFormat}`,
    lastDay: `[${i18n.t('chores:dueChip.yesterday')}] ${timeFormat}`,
    lastWeek: `dddd ${timeFormat}`,
    sameElse: `MMM D ${timeFormat}`,
  }

  // if time is 23:59:59, treat as end-of-day (date only, no specific time)
  if (
    dueDate.hours() === 23 &&
    dueDate.minutes() === 59 &&
    dueDate.seconds() === 59
  ) {
    if (diff < 0) {
      // For overdue dates, show calendar format for recent dates (Today/Yesterday);
      // beyond that, use a calendar-day count ("2 days") instead of a weekday name,
      // since a weekday alone doesn't convey how overdue the chore is
      const absDiff = Math.abs(diff)
      if (absDiff <= 24) {
        return moment(nextDueDate).calendar(null, calendarFormat).split(' ')[0]
      }
      if (absDiff <= 48) {
        const daysAgo = moment()
          .startOf('day')
          .diff(dueDate.clone().startOf('day'), 'days')
        return i18n.t('chores:dueChip.days', { count: daysAgo })
      }
      return dueDate.fromNow()
    }
    // if due in next 48 hours, show calendar format without time (e.g., "Tomorrow")
    if (diff < 48 && diff > 0) {
      return moment(nextDueDate).calendar(null, calendarFormat).split(' ')[0]
    }
    // if due date is after 48 hours, show it in format: Due in 3 days
    return dueDate.fromNow()
  }

  // if due in next 48 hours, we should show it in this format: Tomorrow 11:00
  if (diff < 48 && diff > 0) {
    return moment(nextDueDate).calendar(null, calendarFormat)
  }
  return moment(nextDueDate).fromNow()
}

/**
 * Get the color to use for a chore's due date chip
 * @param {string|null} nextDueDate - The next due date of the chore
 * @param {Object} chore - The chore object (needed for nextDueDate null check)
 * @returns {string} The color name for the chip
 */
export const getDueDateChipColor = (nextDueDate, chore) => {
  if (chore?.nextDueDate === null || nextDueDate === null) return 'neutral'

  const diff = moment(nextDueDate).diff(moment(), 'hours')

  if (diff < 48 && diff > 0) {
    return 'warning'
  }
  if (diff < 0) {
    return 'danger'
  }

  return 'neutral'
}

export const getRecurrentChipText = chore => {
  // if chore.frequencyMetadata is type string then parse it otherwise assigned to the metadata:
  const metadata =
    typeof chore.frequencyMetadata === 'string'
      ? JSON.parse(chore.frequencyMetadata)
      : chore.frequencyMetadata

  // Day and month names are stored in English ('monday', 'january'), so they
  // are turned into indexes before moment formats them in the current locale.
  const allDays = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ]
  const dayIndex = d => allDays.indexOf(String(d).toLowerCase())
  const monthIndex = m =>
    allMonths.findIndex(
      month => month.toLowerCase() === String(m).toLowerCase(),
    )
  const shortDay = index => moment().day(index).format('ddd')
  const shortMonth = index => moment().month(index).format('MMM')
  const ordinal = n =>
    i18n.t(
      `chores:recurrence.ordinal.${new Intl.PluralRules(i18n.language, { type: 'ordinal' }).select(n)}`,
      { n },
    )
  const simple = [
    'once',
    'always',
    'trigger',
    'daily',
    'adaptive',
    'weekly',
    'monthly',
    'yearly',
  ]
  if (simple.includes(chore.frequencyType)) {
    return i18n.t(`chores:recurrence.${chore.frequencyType}`)
  } else if (chore.frequencyType === 'days_of_the_week') {
    const days = metadata.days.map(dayIndex).filter(index => index >= 0)
    if (days.length > 4) {
      const notSelected = allDays
        .map((_, index) => index)
        .filter(index => !days.includes(index))
      return i18n.t('chores:recurrence.dailyExcept', {
        days: notSelected.map(shortDay).join(', '),
      })
    }
    return days.map(shortDay).join(', ')
  } else if (chore.frequencyType === 'day_of_the_month') {
    const months = (metadata?.months ? metadata.months : allMonths)
      .map(monthIndex)
      .filter(index => index >= 0)
    if (months.length > 6) {
      const notSelected = allMonths
        .map((_, index) => index)
        .filter(index => !months.includes(index))
      const result = i18n.t('chores:recurrence.monthlyOn', {
        day: ordinal(chore.frequency),
      })
      if (notSelected.length === 0) return result
      return i18n.t('chores:recurrence.except', {
        base: result,
        months: notSelected.map(shortMonth).join(', '),
      })
    }
    return i18n.t('chores:recurrence.dayOfMonths', {
      day: ordinal(chore.frequency),
      months: [...months]
        .sort((a, b) => a - b)
        .map(shortMonth)
        .join(', '),
    })
  } else if (chore.frequencyType === 'interval') {
    return i18n.t('chores:recurrence.every', {
      count: chore.frequency,
      unit: i18n.t(`chores:repeat.unit.${metadata.unit}`).toLowerCase(),
    })
  } else {
    return chore.frequencyType
  }
}
