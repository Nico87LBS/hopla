// A task can have a deadline, some minutes after its due time. Before it is
// due, the task shows when the deadline is; once late, how long is left. Past
// the deadline the server writes it missed and moves it on.

// Whether a task of this frequency can have a deadline, a delay after its due
// time past which this turn is missed. Every rhythm with moments has the end
// of its moments instead ("jusqu'à"); only an interval in hours has none.
export const deadlineApplies = (frequencyType, frequencyMetadata) =>
  frequencyType === 'interval' && frequencyMetadata?.unit === 'hours'

// When the task's current passage is missed, or null.
export const deadlineOf = chore => {
  if (
    !chore?.nextDueDate ||
    !(chore.deadlineMinutes > 0) ||
    !deadlineApplies(chore.frequencyType, chore.frequencyMetadata)
  ) {
    return null
  }
  return new Date(
    new Date(chore.nextDueDate).getTime() + chore.deadlineMinutes * 60000,
  )
}

// Where the task stands against its deadline at now: 'before' its due time,
// 'late' with the minutes left, or null without one or once it is over.
export const deadlineState = (chore, now = new Date()) => {
  const at = deadlineOf(chore)
  if (!at || now >= at) return null
  if (now < new Date(chore.nextDueDate)) return { phase: 'before', at }
  return {
    phase: 'late',
    at,
    minutesLeft: Math.ceil((at.getTime() - now.getTime()) / 60000),
  }
}

// A length of time, said shortly: "45 min", "2 h 15", "3 jours".
export const shortDuration = (minutes, t) => {
  if (minutes < 60) return t('deadline.minutes', { count: minutes })
  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return rest
      ? t('deadline.hoursMinutes', {
          hours,
          minutes: String(rest).padStart(2, '0'),
        })
      : t('deadline.hours', { count: hours })
  }
  const days = Math.floor(minutes / (24 * 60))
  const hours = Math.floor((minutes % (24 * 60)) / 60)
  return hours
    ? t('deadline.daysHours', { count: days, hours })
    : t('deadline.days', { count: days })
}
