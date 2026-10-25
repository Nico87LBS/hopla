import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'

import {
  cardMap,
  checkAnswer,
  compile,
  expectedHops,
  moduleLocked,
  openChapters,
  pickQuestions,
  review,
  seededRandom,
  stars,
} from '../src/utils/learn/engine.js'
import { evaluate } from '../src/utils/learn/expression.js'
import { generatorSource } from '../src/utils/learn/generators.js'
import { formatNumber, frenchWords } from '../src/utils/learn/numbers.js'

const dir = new URL('../../internal/learn/catalogue/', import.meta.url)
const catalogue = Object.fromEntries(
  readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .map(name => {
      const doc = JSON.parse(readFileSync(new URL(name, dir), 'utf8'))
      return [doc.id, doc]
    }),
)
const modules = Object.values(catalogue).filter(doc => !doc.modules?.length)

test('every generator of the catalogue draws questions it can rebuild', () => {
  const rng = seededRandom(7)
  for (const doc of modules) {
    for (const gen of doc.generateurs || []) {
      const source = generatorSource(gen, doc.id)
      assert.ok(source, `${doc.id} ${gen.id}: opération ${gen.operation}`)
      for (let i = 0; i < 20; i++) {
        const item = source.draw(rng)
        assert.ok(item, `${doc.id} ${gen.id} draws a question`)
        assert.ok(
          item.prompt && !/\{\w+\}/.test(item.prompt),
          `${doc.id} ${gen.id}: ${item.prompt}`,
        )
        assert.notEqual(item.answer, '', `${doc.id} ${gen.id} has an answer`)
        if (item.mode === 'number') {
          assert.match(
            item.answer,
            /^\d+$/,
            `${doc.id} ${gen.id}: ${item.prompt}`,
          )
        }
        if (item.mode === 'choice') {
          assert.ok(item.choices.includes(item.answer), `${doc.id} ${gen.id}`)
        }
        const again = source.fromKey(item.key)
        assert.ok(again, `${doc.id} ${gen.id} rebuilds ${item.key}`)
        assert.equal(again.answer, item.answer)
        assert.equal(again.prompt, item.prompt)
      }
    }
  }
})

test('every module of the catalogue makes a full game', () => {
  for (const doc of modules) {
    const compiled = compile(doc)
    const questions = pickQuestions(compiled, new Map(), {
      rng: seededRandom(1),
    })
    assert.ok(questions.length >= 5, `${doc.id}: ${questions.length} questions`)
    assert.equal(new Set(questions.map(q => q.key)).size, questions.length)
  }
})

test('the multiplication tables open one after another', () => {
  const compiled = compile(catalogue['maths-ce2-multiplication'])
  let chapters = openChapters(compiled, new Map())
  assert.deepEqual(
    chapters.filter(c => c.open).map(c => c.chapter.id),
    ['tables-2-5'],
  )
  const questions = pickQuestions(compiled, new Map(), { rng: seededRandom(3) })
  assert.ok(questions.every(q => q.chapter === 'tables-2-5'))

  const first = compiled.chapters[0].sources[0].list()
  const known = first
    .slice(0, Math.ceil(first.length * 0.8))
    .map(item => ({ key: item.key, box: 4, due: '2026-11-01' }))
  chapters = openChapters(compiled, cardMap(known))
  assert.equal(chapters[0].progress.percent, 80)
  assert.ok(chapters[1].open, 'tables de 6 et 7 open at 80 %')
  assert.ok(!chapters[2].open)
  assert.ok(
    !openChapters(compiled, cardMap(known), 90)[1].open,
    'a parent may ask for more',
  )
})

test('division waits for the tables of 2 to 5', () => {
  const compiledById = {
    'maths-ce2-multiplication': compile(catalogue['maths-ce2-multiplication']),
    'maths-ce2-division': compile(catalogue['maths-ce2-division']),
  }
  const locked = moduleLocked(
    compiledById['maths-ce2-division'],
    compiledById,
    new Map(),
  )
  assert.equal(locked.needed, 80)
  assert.equal(locked.chapter.id, 'tables-2-5')
  delete compiledById['maths-ce2-multiplication']
  assert.equal(
    moduleLocked(
      compile(catalogue['maths-ce2-division']),
      compiledById,
      new Map(),
    ),
    null,
  )
})

test('the cards due come back first, as the same question', () => {
  const compiled = compile(catalogue['maths-ce2-multiplication'])
  const cards = cardMap([
    { key: 'mul:3x7', box: 2, due: '2026-10-20' },
    { key: 'mul:4x?=36', box: 1, due: '2026-10-24' },
    { key: 'mul:5x5', box: 3, due: '2026-12-01' },
  ])
  const questions = pickQuestions(compiled, cards, {
    day: '2026-10-24',
    rng: seededRandom(5),
  })
  const keys = questions.map(q => q.key)
  assert.ok(keys.includes('mul:3x7'))
  assert.ok(keys.includes('mul:4x?=36'))
  const hole = questions.find(q => q.key === 'mul:4x?=36')
  assert.equal(hole.answer, '9')
  assert.equal(hole.prompt, '4 × ? = 36')
})

test('answers are checked kindly but surely', () => {
  assert.ok(checkAnswer({ mode: 'number', answer: '1250' }, '1 250').correct)
  assert.ok(!checkAnswer({ mode: 'number', answer: '1250' }, '125').correct)
  assert.ok(!checkAnswer({ mode: 'number', answer: '0' }, '').correct)
  const text = {
    mode: 'text',
    answer: 'quadrilatère',
    accepted: ['quadrilatère', 'un quadrilatère'],
    tolerance: 'accents',
  }
  assert.ok(checkAnswer(text, 'Quadrilatere').correct)
  assert.ok(checkAnswer(text, ' un quadrilatère ').correct)
  assert.ok(!checkAnswer(text, 'quadrilatre').correct)
  assert.ok(
    checkAnswer({ ...text, tolerance: 'une_faute' }, 'quadrilatre').correct,
  )
  assert.ok(
    !checkAnswer({ ...text, tolerance: 'exacte' }, 'quadrilatere').correct,
  )
  assert.deepEqual(checkAnswer({ mode: 'flip' }, 'presque'), {
    correct: false,
    almost: true,
  })
  assert.ok(checkAnswer({ mode: 'choice', answer: '<' }, '<').correct)
})

test('cards climb the boxes like on the server', () => {
  let card = review({ key: 'mul:7x8' }, { correct: true }, '2026-10-24')
  assert.equal(card.box, 1)
  assert.equal(card.due, '2026-10-25')
  for (let i = 0; i < 5; i++)
    card = review(card, { correct: true }, '2026-10-24')
  assert.equal(card.box, 5)
  assert.equal(card.due, '2026-11-09')
  card = review(card, { almost: true }, '2026-10-24')
  assert.equal(card.box, 5)
  card = review(card, { given: '54' }, '2026-10-24')
  assert.equal(card.box, 1)
  assert.equal(card.lastAnswer, '54')
  assert.equal(stars(10, 10, 70), 3)
  assert.equal(stars(9, 10, 70), 2)
  assert.equal(stars(7, 10, 70), 1)
  assert.equal(stars(6, 10, 70), 0)
  assert.equal(expectedHops(10, 10, {}, 9, 10), 1)
  assert.equal(expectedHops(4, 4, {}, 0, 10), 0)
})

test('numbers are written as at school', () => {
  assert.equal(frenchWords(2304), 'deux mille trois cent quatre')
  assert.equal(frenchWords(80), 'quatre-vingts')
  assert.equal(frenchWords(71), 'soixante et onze')
  assert.equal(frenchWords(200), 'deux cents')
  assert.equal(frenchWords(280000), 'deux cent quatre-vingt mille')
  assert.equal(frenchWords(21), 'vingt et un')
  assert.equal(frenchWords(97), 'quatre-vingt-dix-sept')
  assert.equal(formatNumber(3452), '3\u202f452')
  assert.equal(formatNumber(999), '999')
})

test('formulas are computed without running code', () => {
  assert.equal(evaluate('k*q+r', { k: 6, q: 7, r: 2 }), 44)
  assert.equal(evaluate('(a-b)*2', { a: 9, b: 4 }), 10)
  assert.equal(evaluate('r<k && q>1', { r: 2, k: 6, q: 3 }), 1)
  assert.equal(evaluate('-a+10', { a: 3 }), 7)
  assert.throws(() => evaluate('a+', { a: 1 }))
  assert.throws(() => evaluate('alert(1)', {}))
  assert.throws(() => evaluate('z*2', {}))
})

test('the progress moves from the first game, a known question counting whole', () => {
  const compiled = compile(catalogue['maths-ce2-multiplication'])
  const items = compiled.chapters[0].sources[0].list()
  const once = items.map(item => ({ key: item.key, box: 1, due: '2026-11-01' }))
  const chapters = openChapters(compiled, cardMap(once))
  assert.equal(chapters[0].progress.percent, 25)
  assert.equal(chapters[0].progress.mastered, 0)
  assert.ok(!chapters[1].open)

  // A chapter with no end counts its best cards, up to its goal.
  const big = compiled.chapters.find(c => c.id === 'trois-chiffres')
  const drawn = Array.from({ length: 30 }, (_, i) => ({
    key: `mul:${101 + i}x2`,
    box: 4,
  }))
  assert.equal(openChapters(compiled, cardMap(drawn))[5].chapter, big)
  assert.equal(openChapters(compiled, cardMap(drawn))[5].progress.percent, 100)
})
