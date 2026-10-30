import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { URL } from 'node:url'

import {
  describeTask,
  frequencyTypeForKind,
  nextSlot,
  scheduleKind,
} from '../src/views/ChoreEdit/editor/schedule.js'

// A translator over the real locale files that fails on a missing key, with
// i18next's plurals and {{placeholders}}, the family's words for what it
// earns (hops here) given to every text as the app does.
const translator = language => {
  const hops = JSON.parse(
    readFileSync(
      new URL(`../public/locales/${language}/common.json`, import.meta.url),
    ),
  ).currency.hops
  const defaults = { unit: hops.one, units: hops.other }
  const bundles = Object.fromEntries(
    ['chores'].map(ns => [
      ns,
      JSON.parse(
        readFileSync(
          new URL(`../public/locales/${language}/${ns}.json`, import.meta.url),
        ),
      ),
    ]),
  )
  const plural = new Intl.PluralRules(language)
  return (key, options = {}) => {
    const path = key.split('.')
    const lookup = keys =>
      keys.reduce((node, part) => node?.[part], bundles.chores)
    let value = lookup(path)
    if (value === undefined && 'count' in options) {
      const last = path.at(-1)
      value = lookup([
        ...path.slice(0, -1),
        `${last}_${plural.select(options.count)}`,
      ])
    }
    assert.equal(typeof value, 'string', `missing ${language} key ${key}`)
    return value.replace(
      /{{(\w+)}}/g,
      (_, name) => options[name] ?? defaults[name],
    )
  }
}

test('the four kinds of schedule map to and from frequency types', () => {
  assert.equal(scheduleKind('once'), 'once')
  assert.equal(scheduleKind('no_repeat'), 'once')
  assert.equal(scheduleKind('trigger'), 'trigger')
  assert.equal(scheduleKind('always'), 'always')
  for (const type of ['daily', 'weekly', 'interval', 'days_of_the_week'])
    assert.equal(scheduleKind(type), 'repeat')
  assert.equal(frequencyTypeForKind('repeat'), 'daily')
  assert.equal(frequencyTypeForKind('once'), 'once')
  assert.equal(frequencyTypeForKind('trigger'), 'trigger')
})

const slots = [
  { name: 'Matin', time: '07:30' },
  { name: 'Soir', time: '20:00' },
]

test('the next slot is the next one today, else the first of the next day', () => {
  const metadata = { slots }
  const noon = new Date(2026, 9, 23, 12, 0)
  assert.equal(nextSlot('daily', metadata, noon).slot.name, 'Soir')
  const night = new Date(2026, 9, 23, 21, 0)
  const next = nextSlot('daily', metadata, night)
  assert.equal(next.slot.name, 'Matin')
  assert.equal(next.at.getDate(), 24)
  assert.equal(nextSlot('weekly', metadata, noon), null)
})

test('the next slot skips the days the task is off', () => {
  // 2026-10-23 is a Friday: the next Monday is the 26th.
  const metadata = { days: ['monday'], slots }
  const next = nextSlot('days_of_the_week', metadata, new Date(2026, 9, 23, 12))
  assert.equal(next.at.getDate(), 26)
  assert.equal(next.slot.name, 'Matin')
})

for (const language of ['fr', 'en']) {
  test(`the summary line reads well (${language})`, () => {
    const t = translator(language)
    const parts = describeTask({
      dueDate: null,
      frequency: 1,
      frequencyMetadata: { slots },
      frequencyType: 'daily',
      language,
      mode: 'first',
      names: ['Elena', 'Anna'],
      points: 5,
      t,
      useCustomTime: false,
    })
    assert.deepEqual(
      parts.map(part => part.kind),
      ['when', 'who', 'mode', 'hops'],
    )
    const text = parts.map(part => part.text).join(' · ')
    if (language === 'fr')
      assert.equal(
        text,
        'Chaque jour, Matin et Soir · Elena et Anna · Premier arrivé · 5 hops',
      )
    for (const [frequencyType, metadata, frequency] of [
      ['once', {}, 1],
      ['interval', { unit: 'weeks' }, 2],
      ['days_of_the_week', { days: ['monday', 'friday'] }, 1],
      ['always', {}, 1],
      ['trigger', {}, 1],
      ['adaptive', {}, 1],
    ])
      describeTask({
        dueDate: '2026-10-24T18:00:00',
        frequency,
        frequencyMetadata: metadata,
        frequencyType,
        language,
        mode: null,
        names: [],
        points: -1,
        t,
        useCustomTime: true,
      })
  })
}
