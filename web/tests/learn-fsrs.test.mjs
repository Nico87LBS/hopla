import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { interval, nextState } from '../src/utils/learn/fsrs.js'

// The cases come from ts-fsrs 5.4 (FSRS-6, default parameters, short-term
// on, no fuzz); the server checks the same file.
const { cases } = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '../../internal/learn/testdata/fsrs.json'),
    'utf8',
  ),
)

test('FSRS gives the numbers of the reference, like the server', () => {
  assert.ok(cases.length > 0)
  for (const [i, c] of cases.entries()) {
    let state = { stability: 0, difficulty: 0 }
    for (const [j, step] of c.steps.entries()) {
      state = nextState(state, step.elapsed, step.grade)
      const where = `case ${i} step ${j}`
      assert.ok(Math.abs(state.stability - step.stability) < 1e-6, where)
      assert.ok(Math.abs(state.difficulty - step.difficulty) < 1e-6, where)
      assert.equal(
        interval(state.stability, c.retention, c.maxInterval),
        step.interval,
        where,
      )
    }
  }
})

test('a question forgotten five times is tough', async () => {
  const { isTough, review, TOUGH_FORGOT } =
    await import('../src/utils/learn/engine.js')
  let card = review({ key: 'k' }, { key: 'k', correct: false }, '2026-11-01')
  assert.equal(card.forgot, 0, 'a first miss is not yet a lapse')
  for (let i = 1; i <= TOUGH_FORGOT; i++) {
    assert.ok(!isTough(card), `${card.forgot} forgotten`)
    card = review(card, { key: 'k', correct: false }, `2026-11-0${i + 1}`)
  }
  assert.equal(card.forgot, TOUGH_FORGOT)
  assert.ok(isTough(card))
  card = review(card, { key: 'k', correct: true }, '2026-11-09')
  assert.equal(card.forgot, TOUGH_FORGOT, 'a right answer keeps the count')
})
