import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  again,
  apart,
  chapterQuestions,
  compile,
  pickQuestions,
  seededRandom,
  siblingOf,
} from '../src/utils/learn/engine.js'

const catalogue = join(import.meta.dirname, '../../internal/learn/catalogue')

const read = id =>
  JSON.parse(readFileSync(join(catalogue, `${id}.json`), 'utf8'))

const tablesChapter = compiled =>
  compiled.chapters.find(c => c.id === 'tables-2-5-10')

const siblingsOf = questions => questions.map(siblingOf)

test('the two ways of a card are siblings, and so are 7 × 8 and 7 × ? = 56', () => {
  const meteo = compile(read('anglais-aero-meteo'))
  const items = meteo.chapters[0].sources.flatMap(s => s.list())
  const overcast = items.filter(i => i.source === 'overcast')
  assert.equal(overcast.length, 2)
  assert.notEqual(overcast[0].key, overcast[1].key)
  assert.equal(siblingOf(overcast[0]), siblingOf(overcast[1]))

  const tables = compile(read('maths-ce1-multiplication'))
  const all = tablesChapter(tables).sources.flatMap(s => s.list())
  const normal = all.find(i => i.key === 'mul:5x7')
  const hole = all.find(i => i.key === 'mul:5x?=35')
  assert.ok(normal && hole)
  assert.equal(siblingOf(normal), siblingOf(hole))
})

test('a game never asks both ways of a card when it has enough others', () => {
  const meteo = compile(read('anglais-aero-meteo'))
  for (let seed = 1; seed <= 30; seed++) {
    const questions = pickQuestions(meteo, new Map(), {
      rng: seededRandom(seed),
      settings: { questions_par_partie: 10 },
    })
    assert.equal(questions.length, 10)
    const siblings = siblingsOf(questions)
    assert.equal(new Set(siblings).size, siblings.length, `seed ${seed}`)
  }
})

test('a small chapter fills its game with siblings, never side by side', () => {
  const doc = {
    id: 'petit',
    chapitres: [{ id: 'c', nom: 'C' }],
    fiches: [1, 2, 3, 4].map(n => ({
      id: `f${n}`,
      chapitre: 'c',
      type: 'saisie',
      question: `q${n}`,
      reponse: `r${n}`,
      sens: ['direct', 'inverse'],
    })),
  }
  const compiled = compile(doc)
  for (let seed = 1; seed <= 30; seed++) {
    const questions = pickQuestions(compiled, new Map(), {
      rng: seededRandom(seed),
      settings: { questions_par_partie: 8 },
    })
    assert.equal(questions.length, 8)
    const siblings = siblingsOf(questions)
    for (let i = 1; i < siblings.length; i++) {
      assert.notEqual(siblings[i], siblings[i - 1], `seed ${seed}`)
    }
  }
})

test('a placement test asks two different facts of a chapter', () => {
  const tables = compile(read('maths-ce1-multiplication'))
  for (let seed = 1; seed <= 30; seed++) {
    const questions = chapterQuestions(
      tablesChapter(tables),
      2,
      seededRandom(seed),
    )
    assert.equal(questions.length, 2)
    assert.notEqual(siblingOf(questions[0]), siblingOf(questions[1]))
  }
})

test('the missed questions come back in another order, their choices mixed', () => {
  const meteo = compile(read('anglais-aero-meteo'))
  const missed = pickQuestions(meteo, new Map(), {
    rng: seededRandom(4),
    settings: { questions_par_partie: 6 },
  })
  const asked = again(missed, seededRandom(9))
  assert.deepEqual(asked.map(q => q.key).sort(), missed.map(q => q.key).sort())
  for (const question of asked.filter(q => q.mode === 'choice')) {
    assert.ok(question.choices.includes(question.answer))
  }
})

test('apart keeps every question', () => {
  const items = ['a', 'a', 'b', 'b', 'c', 'c'].map((s, i) => ({
    key: `${s}${i}`,
    sibling: s,
  }))
  for (let seed = 1; seed <= 20; seed++) {
    const out = apart(items, seededRandom(seed))
    assert.deepEqual(out.map(i => i.key).sort(), items.map(i => i.key).sort())
    for (let i = 1; i < out.length; i++) {
      assert.notEqual(out[i].sibling, out[i - 1].sibling, `seed ${seed}`)
    }
  }
})
