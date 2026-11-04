import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  cardMap,
  compile,
  dueReviews,
  moduleToday,
  pickQuestions,
  practiceQuestions,
  reviewQuestions,
  reviewsLeft,
  seededRandom,
} from '../src/utils/learn/engine.js'

// words is a module of n written cards, asked one way only.
const words = (id, n) =>
  compile({
    id,
    chapitres: [{ id: 'c', nom: 'C' }],
    fiches: Array.from({ length: n }, (_, i) => ({
      id: `f${i}`,
      chapitre: 'c',
      type: 'saisie',
      question: `q${i}`,
      reponse: `r${i}`,
    })),
  })

const keysOf = compiled =>
  compiled.chapters[0].sources.flatMap(s => s.list()).map(item => item.key)

const DAY = '2026-11-04'

// seenCards are the cards of the keys, all seen, due on the days given in
// turn.
const seenCards = (keys, dues, module) =>
  keys.map((key, i) => ({
    key,
    box: 2,
    seen: 1,
    due: dues[i % dues.length],
    module,
  }))

test('a module with nothing due and no new question allowed is up to date', () => {
  const compiled = words('mots', 12)
  const cards = cardMap(
    seenCards(keysOf(compiled).slice(0, 8), ['2026-11-05', '2026-11-09']),
  )
  const today = moduleToday(compiled, cards, { day: DAY, newToday: 10 })
  assert.deepEqual(today, {
    due: 0,
    newLeft: 0,
    tomorrow: 4,
    seen: 8,
    upToDate: true,
    why: { kind: 'daily' },
  })
  assert.deepEqual(
    pickQuestions(compiled, cards, { day: DAY, newLeft: 0 }),
    [],
    'no game but practice',
  )
  // The new questions of the day are not all met: it is not up to date.
  const more = moduleToday(compiled, cards, { day: DAY, newToday: 8 })
  assert.equal(more.newLeft, 2)
  assert.ok(!more.upToDate)
})

test('a module with few questions due fills its game with those coming back soonest', () => {
  const compiled = words('mots', 14)
  const keys = keysOf(compiled)
  const cards = cardMap([
    ...seenCards(keys.slice(0, 2), ['2026-11-03']),
    ...seenCards(keys.slice(2, 6), ['2026-11-05']),
    ...seenCards(keys.slice(6, 12), ['2026-11-20']),
  ])
  const questions = pickQuestions(compiled, cards, {
    day: DAY,
    newLeft: 0,
    rng: seededRandom(2),
  })
  const asked = new Set(questions.map(q => q.key))
  assert.equal(questions.length, 10)
  for (const key of keys.slice(0, 6)) assert.ok(asked.has(key), key)
  assert.ok(!asked.has(keys[12]) && !asked.has(keys[13]), 'no new question')
})

test('the new questions of a day stop at what is left of them', () => {
  const compiled = words('mots', 30)
  const questions = pickQuestions(compiled, new Map(), {
    day: DAY,
    newLeft: 4,
    rng: seededRandom(1),
  })
  assert.equal(questions.length, 4)
  assert.equal(
    moduleToday(compiled, new Map(), { day: DAY, newToday: 0 }).newLeft,
    10,
  )
})

test('the day reviews gather what is due in every module, each saying its own', () => {
  const a = words('mots-a', 6)
  const b = words('mots-b', 6)
  const byId = { 'mots-a': a, 'mots-b': b }
  const cards = cardMap([
    ...seenCards(keysOf(a).slice(0, 3), ['2026-11-02'], 'mots-a'),
    ...seenCards(keysOf(b).slice(0, 2), ['2026-11-04'], 'mots-b'),
    ...seenCards(keysOf(b).slice(2, 4), ['2026-11-08'], 'mots-b'),
  ])
  const player = {
    day: DAY,
    modules: [
      { id: 'mots-a', placed: [] },
      { id: 'mots-b', placed: [] },
    ],
    reviews: { most: 50, done: 47 },
  }
  const due = dueReviews(player, byId, cards)
  assert.equal(due.length, 5)
  assert.equal(due[0].module, 'mots-a', 'the latest first')
  assert.equal(reviewsLeft(player), 3)
  const questions = reviewQuestions(due, reviewsLeft(player), seededRandom(1))
  assert.equal(questions.length, 3)
  assert.ok(questions.every(q => q.module === 'mots-a'))
})

test('practice asks only the questions already seen', () => {
  const compiled = words('mots', 20)
  const keys = keysOf(compiled)
  const cards = cardMap(seenCards(keys.slice(0, 6), ['2026-11-10']))
  const questions = practiceQuestions(compiled, cards, { rng: seededRandom(4) })
  assert.equal(questions.length, 6)
  assert.ok(questions.every(q => cards.has(q.key)))
})

test('an up to date module says why: the next chapter is closed, or all is seen', () => {
  const two = compile({
    id: 'deux',
    chapitres: [
      { id: 'a', nom: 'Premier' },
      { id: 'b', nom: 'Second', ouvert_apres: 80 },
    ],
    fiches: ['a', 'b'].flatMap(chapter =>
      Array.from({ length: 4 }, (_, i) => ({
        id: `${chapter}${i}`,
        chapitre: chapter,
        type: 'saisie',
        question: `q${chapter}${i}`,
        reponse: `r${i}`,
      })),
    ),
  })
  const first = two.chapters[0].sources.flatMap(s => s.list())
  const cards = cardMap(
    seenCards(
      first.map(item => item.key),
      ['2026-11-06'],
    ),
  )
  const today = moduleToday(two, cards, { day: DAY })
  assert.ok(today.upToDate)
  assert.equal(today.why.kind, 'chapter')
  assert.equal(today.why.chapter, 'Premier')
  assert.equal(today.why.needed, 80)
  assert.ok(today.why.percent < 80)

  const all = words('tout', 4)
  const seen = cardMap(seenCards(keysOf(all), ['2026-11-06']))
  assert.equal(moduleToday(all, seen, { day: DAY }).why.kind, 'all')
})
