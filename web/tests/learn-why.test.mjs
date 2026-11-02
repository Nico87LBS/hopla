import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { compile } from '../src/utils/learn/engine.js'
import { steps } from '../src/utils/learn/generators.js'

const read = id =>
  JSON.parse(
    readFileSync(
      new URL(`../../internal/learn/catalogue/${id}.json`, import.meta.url),
      'utf8',
    ),
  )

const items = doc =>
  compile(doc).chapters.flatMap(c => c.sources.flatMap(s => s.list()))

test('a calculation got wrong is explained step by step', () => {
  assert.equal(
    steps('multiplication', 7, 9),
    '7 × 9 = 7 × 10 − 7 = 70 − 7 = 63.',
  )
  assert.equal(
    steps('multiplication', 7, 8),
    '7 × 8 = 8 × 5 + 8 × 2 = 40 + 16 = 56.',
  )
  assert.equal(
    steps('addition', 47, 28),
    '47 + 28 = 47 + 20 + 8 = 67 + 8 = 75.',
  )
  assert.equal(
    steps('soustraction', 63, 25),
    '63 − 25 = 63 − 20 − 5 = 43 − 5 = 38.',
  )
})

test('every step explained gives the right result', () => {
  for (let a = 0; a <= 12; a++) {
    for (let b = 0; b <= 12; b++) {
      assert.ok(steps('multiplication', a, b).includes(String(a * b)))
    }
  }
})

test('a label put in the wrong box says what makes each box', () => {
  const seal = items(read('monde-ce2-vivant')).find(
    i => i.subject?.text === 'le phoque',
  )
  assert.equal(seal.answer, 'Mammifère')
  assert.match(seal.rules.Mammifère, /allaite/)
  assert.match(seal.rules.Poisson, /branchies/)
})

test('a wrong answer says why it is wrong', () => {
  const bat = items(read('monde-ce2-vivant')).find(
    i => i.source === 'chauve-souris',
  )
  assert.match(bat.whyNot.oiseau, /plumes/)
  for (const item of items(read('monde-ce2-vivant'))) {
    for (const trap of Object.keys(item.whyNot || {})) {
      assert.notEqual(trap, item.answer, item.key)
    }
  }
})

test('words said the same are heard in a sentence', () => {
  const est = items(read('lire-mots-outils')).find(i => i.answer === 'est')
  assert.equal(est.listen, 'est… il est là')
})
