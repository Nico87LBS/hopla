import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  cardMap,
  compile,
  openChapters,
  pickQuestions,
} from '../src/utils/learn/engine.js'
import {
  answerChapter,
  beginTest,
  currentStep,
  testPlan,
  testResult,
} from '../src/utils/learn/placement.js'

// A pack of four levels of three chapters each, in two modules.
const level = (name, n) => ({
  id: name,
  name,
  modules: [1, 2].map(m => ({
    id: `${name}-m${m}`,
    document: {
      id: `${name}-m${m}`,
      nom: `${name} ${m}`,
      chapitres: Array.from({ length: m === 1 ? 2 : n - 2 }, (_, i) => ({
        id: `c${i + 1}`,
        nom: `${name} ${m}.${i + 1}`,
        ouvert_apres: i ? 80 : 0,
      })),
    },
  })),
})
const plan = testPlan({
  levels: ['GS', 'CP', 'CE1', 'CE2'].map(n => level(n, 3)),
})

// run answers the chapters in turn, from the start level, true for passed.
const run = (start, answers) => {
  let state = beginTest(plan, start)
  for (const passed of answers) {
    assert.ok(currentStep(plan, state), 'a chapter is asked')
    state = answerChapter(plan, state, passed)
  }
  return state
}

test('the test goes level after level and stops at the first chapter missed', () => {
  const state = run(0, [true, true, true, true, false])
  assert.equal(state.done, true)
  assert.equal(currentStep(plan, state), null)
  const result = testResult(plan, state)
  assert.equal(result.reached, 'CP')
  assert.deepEqual(result.opened, [
    'GS-m1/c1',
    'GS-m1/c2',
    'GS-m2/c1',
    'CP-m1/c1',
  ])
  assert.deepEqual(
    result.levels.map(l => [l.id, l.opened, l.total, l.tested]),
    [
      ['GS', 3, 3, true],
      ['CP', 1, 3, true],
      ['CE1', 0, 3, false],
      ['CE2', 0, 3, false],
    ],
  )
  assert.equal(result.levels[1].next, 'CP 1.2', 'the chapter to start at')
})

test('starting higher counts the levels below as known', () => {
  const state = run(2, [true, false])
  const result = testResult(plan, state)
  assert.equal(result.reached, 'CE1')
  assert.equal(result.opened.length, 3 + 3 + 1)
})

test('a start level missed at once goes down a level, until the first', () => {
  // CE1 missed at once: CP is tested, passed whole, so the test ends at CE1.
  let result = testResult(plan, run(2, [false, true, true, true]))
  assert.equal(result.reached, 'CE1')
  assert.equal(result.opened.length, 3 + 3, 'GS known, CP passed, CE1 nothing')

  // CE1 then CP missed at once: GS is tested.
  result = testResult(plan, run(2, [false, false, true, false]))
  assert.equal(result.reached, 'GS')
  assert.deepEqual(result.opened, ['GS-m1/c1'])

  // Down to GS missed at once: nothing opens.
  result = testResult(plan, run(1, [false, false]))
  assert.equal(result.reached, 'GS')
  assert.deepEqual(result.opened, [])
})

test('everything passed reaches the last level', () => {
  const state = run(3, [true, true, true])
  const result = testResult(plan, state)
  assert.equal(result.reached, 'CE2')
  assert.equal(result.opened.length, 12)
})

test('a pack of modules is one level', () => {
  const single = testPlan({ levels: [level('aero', 4)] })
  let state = beginTest(single, 0)
  state = answerChapter(single, state, false)
  const result = testResult(single, state)
  assert.equal(result.reached, 'aero')
  assert.deepEqual(result.opened, [])
})

test('a chapter the test passed opens, and so does the next', () => {
  const doc = JSON.parse(
    readFileSync(
      join(
        import.meta.dirname,
        '../../internal/learn/catalogue/anglais-cp-se-presenter.json',
      ),
      'utf8',
    ),
  )
  const compiled = compile(doc)
  const cards = cardMap([])
  const before = openChapters(compiled, cards).filter(c => c.open)
  assert.equal(before.length, 1)
  const after = openChapters(compiled, cards, undefined, ['greetings', 'me'])
  assert.deepEqual(
    after.map(c => [c.chapter.id, c.open, c.placed]),
    [
      ['greetings', true, true],
      ['me', true, true],
      ['feelings', true, false],
      ['like', false, false],
    ],
  )
  const questions = pickQuestions(compiled, cards, {
    placed: ['greetings', 'me'],
  })
  const chapters = new Set(
    questions.map(
      q =>
        compiled.chapters.find(c => c.sources.some(s => s.fromKey(q.key)))?.id,
    ),
  )
  assert.ok(
    chapters.has('feelings'),
    'new questions come from the chapter to learn',
  )
})
