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
  currentStep,
  PASS_PERCENT,
  QUESTIONS_BY_CHAPTER,
  rightNeeded,
  startTest,
  stepsOf,
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

// run answers the chapters of a scope in turn, true for passed.
const run = (scope, answers) => {
  let state = startTest(plan, scope)
  for (const passed of answers) {
    assert.ok(currentStep(plan, state), 'a chapter is asked')
    state = answerChapter(plan, state, passed)
  }
  return state
}

test('a chapter asks 8 questions and 7 right answers pass it', () => {
  assert.equal(QUESTIONS_BY_CHAPTER, 8)
  assert.equal(PASS_PERCENT, 80)
  assert.equal(rightNeeded(8), 7)
  assert.equal(rightNeeded(5), 4)
  assert.equal(rightNeeded(10), 8)
  assert.equal(rightNeeded(8, 100), 8)
})

test('the test of a level asks all its chapters, whatever the misses', () => {
  const steps = stepsOf(plan, { level: 1 })
  assert.deepEqual(
    steps.map(s => `${s.module.id}/${s.chapter.id}`),
    ['CP-m1/c1', 'CP-m1/c2', 'CP-m2/c1'],
  )
  const state = run({ level: 1 }, [true, false, true])
  assert.equal(state.done, true)
  assert.equal(currentStep(plan, state), null)
  const result = testResult(plan, state)
  assert.equal(result.reached, 'CP')
  assert.deepEqual(result.opened, ['CP-m1/c1', 'CP-m2/c1'])
  assert.deepEqual(
    result.levels.map(l => [l.id, l.passed, l.total]),
    [['CP', 2, 3]],
  )
  assert.deepEqual(
    result.levels[0].chapters.map(c => c.ok),
    [true, false, true],
  )
})

test('the test of one chapter asks only that chapter', () => {
  const state = startTest(plan, { chapter: 'CE1-m2/c1' })
  assert.equal(state.steps.length, 1)
  assert.equal(state.steps[0].level, 2)
  const done = answerChapter(plan, state, true)
  assert.equal(done.done, true)
  const result = testResult(plan, done)
  assert.equal(result.reached, 'CE1')
  assert.deepEqual(result.opened, ['CE1-m2/c1'])
})

test('nothing passed reaches no level and opens nothing', () => {
  const result = testResult(plan, run({ level: 3 }, [false, false, false]))
  assert.equal(result.reached, null)
  assert.deepEqual(result.opened, [])
})

test('a pack of modules is one level', () => {
  const single = testPlan({ levels: [level('aero', 4)] })
  assert.equal(stepsOf(single).length, 4)
  let state = startTest(single)
  state = answerChapter(single, state, true)
  assert.equal(testResult(single, state).reached, 'aero')
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

test('a parent opens a chapter by hand, which opens only it', () => {
  const doc = JSON.parse(
    readFileSync(
      join(
        import.meta.dirname,
        '../../internal/learn/catalogue/maths-ce2-multiplication.json',
      ),
      'utf8',
    ),
  )
  const compiled = compile(doc)
  const cards = cardMap([])
  const auto = openChapters(compiled, cards)
  assert.deepEqual(
    auto.map(c => c.open),
    [true, false, false, false, false, false],
  )
  const hand = openChapters(compiled, cards, undefined, [], {
    forced: ['tables-6-7', 'tables-8-9'],
  })
  assert.deepEqual(
    hand.map(c => [c.chapter.id, c.open, c.by]),
    [
      ['tables-2-5', true, null],
      ['tables-6-7', true, 'forced'],
      ['tables-8-9', true, 'forced'],
      ['dizaines', false, null],
      ['deux-chiffres', false, null],
      ['trois-chiffres', false, null],
    ],
  )
})

test('a parent closes a chapter, whatever a test or the progression say', () => {
  const doc = JSON.parse(
    readFileSync(
      join(
        import.meta.dirname,
        '../../internal/learn/catalogue/maths-ce2-multiplication.json',
      ),
      'utf8',
    ),
  )
  const compiled = compile(doc)
  const cards = cardMap([])
  const shut = openChapters(compiled, cards, undefined, ['tables-6-7'], {
    shut: ['tables-6-7'],
  })
  assert.equal(shut[1].open, false)
  assert.equal(shut[1].by, 'shut')
  assert.equal(shut[1].placed, false)
  assert.equal(shut[2].open, false, 'the next one stays behind it')
  const both = openChapters(compiled, cards, undefined, [], {
    forced: ['tables-6-7'],
    shut: ['tables-6-7'],
  })
  assert.equal(both[1].open, false, 'closed wins')
})
