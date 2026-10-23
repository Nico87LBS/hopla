// What the task editor says about a task's schedule, kept free of React so the
// tests can check it.

export const SLOT_FREQUENCY_TYPES = ['daily', 'days_of_the_week']

// The rhythms offered for a repeated task, in the order of the picker.
export const RHYTHMS = [
  'daily',
  'days_of_the_week',
  'weekly',
  'monthly',
  'yearly',
  'interval',
  'day_of_the_month',
  'adaptive',
]

const WEEK_DAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

// The four kinds of schedule: once, repeated, always there or set off from
// outside.
export const scheduleKind = frequencyType =>
  ['once', 'no_repeat'].includes(frequencyType)
    ? 'once'
    : ['trigger', 'always'].includes(frequencyType)
      ? frequencyType
      : 'repeat'

// The frequency type a kind starts on.
export const frequencyTypeForKind = kind => (kind === 'repeat' ? 'daily' : kind)

export const hasSlots = (frequencyType, frequencyMetadata) =>
  SLOT_FREQUENCY_TYPES.includes(frequencyType) &&
  (frequencyMetadata?.slots?.length || 0) > 0

// The next time a task with slots is due after `now`: the first slot still to
// come today, else the first slot of the next day the task is on.
export const nextSlot = (
  frequencyType,
  frequencyMetadata,
  now = new Date(),
) => {
  if (!hasSlots(frequencyType, frequencyMetadata)) return null
  const slots = frequencyMetadata.slots
    .filter(slot => /^\d{2}:\d{2}$/.test(slot.time || ''))
    .sort((a, b) => a.time.localeCompare(b.time))
  if (!slots.length) return null
  const days = frequencyMetadata.days || []
  for (let offset = 0; offset < 8; offset++) {
    const day = new Date(now)
    day.setDate(now.getDate() + offset)
    if (
      frequencyType === 'days_of_the_week' &&
      !days.includes(WEEK_DAYS[day.getDay()])
    )
      continue
    for (const slot of slots) {
      const [hour, minute] = slot.time.split(':').map(Number)
      const at = new Date(day)
      at.setHours(hour, minute, 0, 0)
      if (at > now) return { at, slot }
    }
  }
  return null
}

// Monday first, as the day pills show them.
const weekOrder = day => (WEEK_DAYS.indexOf(day) + 6) % 7

// A list read out loud: "Elena et Anna", "Elena, Anna and Nico".
export const spokenList = (items, language) => {
  const list = items.filter(Boolean)
  if (list.length < 2) return list[0] || ''
  try {
    return new Intl.ListFormat(language, { type: 'conjunction' }).format(list)
  } catch {
    return list.join(', ')
  }
}

// The task in one line, piece by piece: when, for whom, how and for how many
// hops. `t` is the chores translator.
export const describeTask = ({
  dueDate,
  frequency,
  frequencyMetadata,
  frequencyType,
  language,
  mode,
  names,
  points,
  t,
  useCustomTime,
}) => {
  const metadata = frequencyMetadata || {}
  const kind = scheduleKind(frequencyType)
  const time = date => {
    const at = new Date(date)
    return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  }
  let when
  if (kind === 'once') {
    when = dueDate
      ? t('editor.summary.once', {
          date: new Date(dueDate).toLocaleDateString(language, {
            day: 'numeric',
            month: 'long',
          }),
        })
      : t('editor.summary.onceNoDate')
  } else if (kind === 'repeat') {
    when = t(`editor.summary.rhythm.${frequencyType}`, {
      count: Number(frequency) || 1,
      unit: t(`repeat.unit.${metadata.unit || 'days'}`).toLowerCase(),
      days: spokenList(
        [...(metadata.days || [])]
          .sort((a, b) => weekOrder(a) - weekOrder(b))
          .map(day => t(`repeat.days.${day}`).toLowerCase()),
        language,
      ),
    })
    if (hasSlots(frequencyType, metadata)) {
      when = t('editor.summary.withSlots', {
        when,
        slots: spokenList(
          metadata.slots.map(slot => (slot.name || slot.time || '').trim()),
          language,
        ),
      })
    } else if (dueDate && useCustomTime) {
      when = t('editor.summary.atTime', { when, time: time(dueDate) })
    }
  } else {
    when = t(`editor.summary.${kind}`)
  }
  return [
    { kind: 'when', text: when },
    {
      kind: 'who',
      text: names.length
        ? spokenList(names, language)
        : t('editor.summary.anyone'),
    },
    mode && { kind: 'mode', mode, text: t(`taskMode.${mode}`) },
    points > 0 && {
      kind: 'hops',
      text: t('editor.summary.hops', { count: points }),
    },
  ].filter(Boolean)
}
