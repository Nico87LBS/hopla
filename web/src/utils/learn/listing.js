// Searching, filtering and sorting the lists of modules: a person's games,
// the modules a parent turns on for someone, and the catalogue.

import { itemForKey } from './engine.js'

// The school levels, in the order of the years; any other level comes after
// them, in the order of its name.
export const LEVEL_ORDER = ['GS', 'CP', 'CE1', 'CE2', 'CM1', 'CM2']

// RECENT_DAYS is how long a module counts as played lately, or as new.
export const RECENT_DAYS = 14

const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' })

export const byName = (a, b) => collator.compare(a || '', b || '')

const levelRank = level => {
  const i = LEVEL_ORDER.indexOf(level)
  return i < 0 ? LEVEL_ORDER.length : i
}

export const byLevel = (a, b) => levelRank(a) - levelRank(b) || byName(a, b)

// levelsIn gathers the levels of entries, in order.
export const levelsIn = entries =>
  [...new Set(entries.flatMap(entry => entry.levels || []))].sort(byLevel)

// firstLevel is the lowest level of an entry, to sort by level.
const firstLevel = levels => [...(levels || [])].sort(byLevel)[0]

const compareLevels = (a, b) => {
  const x = firstLevel(a)
  const y = firstLevel(b)
  if (x === y) return 0
  if (x === undefined) return 1
  if (y === undefined) return -1
  return byLevel(x, y)
}

// fold puts text in lower case without its accents, for searching.
export const fold = text =>
  String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

// matches tells whether every word searched is in one of the texts.
export const matches = (query, ...texts) => {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = texts.map(fold).join(' ')
  return words.every(word => hay.includes(word))
}

// daysBetween counts the days from one day (YYYY-MM-DD) to another.
export const daysBetween = (from, to) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86400000)

export const isRecent = (day, today) =>
  !!day && !!today && daysBetween(day.slice(0, 10), today) <= RECENT_DAYS

// shape keeps the groups of a list, each with the items that pass, and sorts
// them. A group is { name, levels, items }; an item is { name, levels } with
// anything else the test and the sort need. Searching a group's name keeps
// all its items; a level kept keeps an item of that level, or of a group of
// that level when the item has none.
export const shape = (
  groups,
  { levels = [], query = '', sort = 'level', test = () => true, value } = {},
) => {
  const wanted = new Set(levels)
  const kept = []
  for (const group of groups) {
    const groupFound = matches(query, group.name)
    const items = group.items.filter(item => {
      if (!groupFound && !matches(query, item.name)) return false
      const own = item.levels?.length ? item.levels : group.levels || []
      if (wanted.size && !own.some(level => wanted.has(level))) return false
      return test(item, group)
    })
    if (items.length) kept.push({ ...group, items })
  }
  return sortGroups(kept, sort, value)
}

// sortGroups orders the groups and their items. By level, the groups go from
// the lowest level and their items keep the order of their pack; by name,
// both go by name; by a value (the last game, the progress), the items go
// from the highest and a group goes by its highest item.
export const sortGroups = (groups, sort, value) => {
  const list = [...groups]
  if (sort === 'name') {
    return list
      .map(group => ({ ...group, items: [...group.items].sort(itemsByName) }))
      .sort(groupsByName)
  }
  if (sort !== 'level' && value) {
    const of = item => value(item, sort)
    const best = group => group.items.reduce((m, i) => max(m, of(i)), null)
    return list
      .map(group => ({
        ...group,
        items: [...group.items].sort(
          (a, b) => compareValues(of(a), of(b)) || itemsByName(a, b),
        ),
      }))
      .sort((a, b) => compareValues(best(a), best(b)) || groupsByName(a, b))
  }
  return list.sort(
    (a, b) => lastGroup(a) - lastGroup(b) || compareLevels(a.levels, b.levels),
  )
}

const itemsByName = (a, b) => byName(a.name, b.name)
// The modules outside any pack, which have no name, come last.
const lastGroup = group => (group.name ? 0 : 1)
const groupsByName = (a, b) =>
  lastGroup(a) - lastGroup(b) || byName(a.name, b.name)

const max = (a, b) => (a === null || compareValues(a, b) > 0 ? b : a)

// compareValues puts the highest first and the missing ones last; a value
// is a number or a day.
const compareValues = (a, b) => {
  const none = v => v === null || v === undefined
  if (none(a) && none(b)) return 0
  if (none(a)) return 1
  if (none(b)) return -1
  if (typeof a === 'string') return b.localeCompare(a)
  return b - a
}

// sortItems orders a list without groups: by name, or by level keeping the
// list's own order within a level.
export const sortItems = (items, sort) =>
  [...items].sort(
    sort === 'name' ? itemsByName : (a, b) => compareLevels(a.levels, b.levels),
  )

// toReview counts the questions of a module waiting to be seen again, on the
// day given.
export const toReview = (compiled, cards, day) => {
  if (!compiled) return 0
  let count = 0
  for (const card of cards.values()) {
    if (
      card.due &&
      card.due <= day &&
      itemForKey(compiled.chapters, card.key)
    ) {
      count++
    }
  }
  return count
}

// playFirst orders a person's modules for "what to play first": those with
// questions to see again first, the most first, then those not done for the
// day, the locked ones last. An item is { name, levels, review, done,
// locked }.
export const playFirst = items =>
  [...items].sort(
    (a, b) =>
      Number(!!a.locked) - Number(!!b.locked) ||
      Number(!!a.done) - Number(!!b.done) ||
      b.review - a.review ||
      compareLevels(a.levels, b.levels) ||
      itemsByName(a, b),
  )
