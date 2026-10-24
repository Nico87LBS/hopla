// A task done several times a day has slots (morning, noon, evening). The
// server sends today's slots with their state; between two refreshes the
// state that only depends on the time (upcoming, open, missed) is worked out
// again here, so a slot opens on time without a reload.

import moment from 'moment'

import { sameName } from './taskCopies.js'

export const hasSlots = chore => chore?.frequencyMetadata?.slots?.length > 0

const TIMED = ['upcoming', 'open', 'missed']

// Days are the family's.
const sameDay = (a, b) => moment(a).isSame(b, 'day')

export const liveSlotState = (slot, now = new Date()) => {
  if (!TIMED.includes(slot.state)) return slot.state
  if (now < new Date(slot.opensAt)) return 'upcoming'
  if (now < new Date(slot.closesAt)) return 'open'
  return 'missed'
}

// todaySlots returns the task's slots of today, from the slots query when it
// has them, else from the task itself, with their state as of now. Slots of
// another day (the page left open overnight) are dropped until the next
// refresh brings today's.
export const todaySlots = (chore, slotsByTask, now = new Date()) => {
  const slots = slotsByTask?.[chore.id] ?? chore.slotsToday ?? []
  return slots
    .filter(slot => sameDay(new Date(slot.at), now))
    .map(slot => ({ ...slot, state: liveSlotState(slot, now) }))
}

const assigneeOf = chore => chore.assignedTo ?? chore.assignees?.[0]?.userId

// groupCopies puts each member's copy of a task (same name) together, at the
// place of the first one: [{ key, chores }]. Two tasks of the same name for
// the same member are not copies and stay apart.
export const groupCopies = chores => {
  const groups = []
  const byKey = new Map()
  for (const chore of chores) {
    const key = sameName(chore.name)
    let group = byKey.get(key)
    if (group?.chores.some(other => assigneeOf(other) === assigneeOf(chore))) {
      groups.push({ key: `${key}#${chore.id}`, chores: [chore] })
      continue
    }
    if (!group) {
      group = { key, chores: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.chores.push(chore)
  }
  return groups
}

// pullCopiesTogether moves the copies of a task found in later sections next
// to the first one, so a task done by each child shows once even when one
// child is ahead of the other.
export const pullCopiesTogether = sections => {
  const home = new Map()
  sections.forEach((section, index) => {
    for (const chore of section.content) {
      const key = sameName(chore.name)
      if (!home.has(key)) home.set(key, index)
    }
  })
  return sections.map((section, index) => {
    const content = []
    for (const chore of section.content) {
      if (home.get(sameName(chore.name)) === index) content.push(chore)
    }
    for (let later = index + 1; later < sections.length; later++) {
      for (const chore of sections[later].content) {
        if (home.get(sameName(chore.name)) === index) content.push(chore)
      }
    }
    return { ...section, content }
  })
}

const endOfDay = date => moment(date).endOf('day').toDate()

// doneCopies returns the ids of the copies already done for now: once a
// child's copy is done (and approved), the server moves it to its next due
// date, while the other child's copy is still due today. The row keeps both
// together, so the one ahead shows as done instead of to do again.
export const doneCopies = (chores, now = new Date()) => {
  const dues = chores
    .filter(chore => chore.nextDueDate)
    .map(chore => new Date(chore.nextDueDate))
  if (dues.length < 2) return new Set()
  const earliest = new Date(Math.min(...dues))
  const limit = endOfDay(earliest > now ? earliest : now)
  return new Set(
    chores
      .filter(chore => chore.nextDueDate && new Date(chore.nextDueDate) > limit)
      .map(chore => chore.id),
  )
}
