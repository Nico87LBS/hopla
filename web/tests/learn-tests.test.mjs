import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  cardMap,
  compile,
  testQuestions,
  testReadiness,
} from '../src/utils/learn/engine.js'

const words = n =>
  compile({
    id: 'mots',
    chapitres: [
      { id: 'c1', nom: 'Un' },
      { id: 'c2', nom: 'Deux' },
    ],
    fiches: Array.from({ length: n }, (_, i) => ({
      id: `f${i}`,
      chapitre: i < n / 2 ? 'c1' : 'c2',
      type: 'saisie',
      question: `q${i}`,
      reponse: `r${i}`,
    })),
  })

const byId = { mots: words(12) }
const keys = chapter =>
  byId.mots.chapters
    .find(c => c.id === chapter)
    .sources.flatMap(s => s.list())
    .map(i => i.key)

const exam = {
  day: '2026-11-10',
  chapters: [{ module: 'mots', chapter: 'c1' }],
}

// seen is a card answered on 2026-11-04 with a stability of s days.
const seen = (key, s) => ({
  key,
  box: 3,
  seen: 1,
  stability: s,
  lastReview: '2026-11-04',
  due: '2026-11-20',
})

test('a test is as ready as its questions are sure on its day', () => {
  const c1 = keys('c1')
  assert.equal(c1.length, 6)
  assert.deepEqual(testReadiness(exam, byId, new Map()), {
    percent: 0,
    left: 6,
  })
  const cards = cardMap([
    ...c1.slice(0, 3).map(k => seen(k, 200)),
    ...c1.slice(3, 4).map(k => seen(k, 1)),
  ])
  const { left, percent } = testReadiness(exam, byId, cards)
  assert.equal(percent, 50, 'three sure questions out of six')
  assert.equal(left, 3)
})

test('the questions least sure come first, only of the chapters of the test', () => {
  const c1 = keys('c1')
  const cards = cardMap([seen(c1[0], 200), seen(c1[1], 2), seen(c1[2], 30)])
  const questions = testQuestions(exam, byId, cards, 5)
  assert.equal(questions.length, 5)
  assert.ok(questions.every(q => c1.includes(q.key)))
  assert.ok(questions.every(q => q.module === 'mots'))
  const asked = questions.map(q => q.key)
  assert.ok(asked.includes(c1[1]) && asked.includes(c1[2]))
  assert.ok(!keys('c2').some(k => asked.includes(k)))
})
