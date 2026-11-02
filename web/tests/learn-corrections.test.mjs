import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { capitalFor, isolated } from '../src/utils/learn/display.js'
import {
  checkAnswer,
  compile,
  pickQuestions,
  seededRandom,
} from '../src/utils/learn/engine.js'
import { orderings, soundsAlike } from '../src/utils/learn/generators.js'

const read = id =>
  JSON.parse(
    readFileSync(
      new URL(`../../internal/learn/catalogue/${id}.json`, import.meta.url),
      'utf8',
    ),
  )

const items = doc =>
  compile(doc).chapters.flatMap(c => c.sources.flatMap(s => s.list()))

test('getting dressed and breakfast may come in either order', () => {
  const reveil = items(read('monde-gs-temps')).find(i => i.source === 'reveil')
  const swapped = [
    'se réveiller',
    'prendre le petit-déjeuner',
    "s'habiller",
    "aller à l'école",
  ].join(' → ')
  assert.equal(checkAnswer(reveil, reveil.answer).correct, true)
  assert.equal(checkAnswer(reveil, swapped).correct, true)
  const wrong = [
    "s'habiller",
    'se réveiller',
    'prendre le petit-déjeuner',
    "aller à l'école",
  ].join(' → ')
  assert.equal(checkAnswer(reveil, wrong).correct, false)
  assert.deepEqual(orderings(['a', 'b', 'c'], [['a', 'c']]).length, 2)
})

test('a word heard is never shown beside one said the same way', () => {
  assert.ok(soundsAlike('et', 'est', 'fr'))
  assert.ok(soundsAlike('le verre', 'le ver', 'fr'))
  assert.ok(soundsAlike('two', 'too', 'en'))
  assert.ok(!soundsAlike('le', 'la', 'fr'))
  const all = items(read('lire-mots-outils'))
  for (const item of all.filter(i => i.listen)) {
    const said = item.listen
    for (const trap of item.trapPool || item.choices) {
      if (trap === item.answer) continue
      assert.ok(!soundsAlike(trap, said, 'fr'), `${said} / ${trap}`)
    }
  }
})

test('a shape seen as a drawing is named without its name written above', () => {
  for (const id of ['maths-gs-formes', 'maths-cp-formes', 'monde-cp-espace']) {
    for (const item of items(read(id)).filter(i =>
      i.key.endsWith(':inverse'),
    )) {
      assert.ok(item.image, item.key)
      assert.ok(!item.prompt.includes(item.answer), item.key)
      assert.ok(!item.choices.includes(item.prompt), item.key)
      // Not said again once answered: the child just heard it.
      assert.equal(item.said, undefined, item.key)
    }
  }
})

test('playing again asks other questions while there are some', () => {
  const doc = read('monde-cp-espace')
  const compiled = compile(doc)
  const first = pickQuestions(compiled, new Map(), { rng: seededRandom(3) })
  const recent = new Set(first.map(q => q.key))
  const again = pickQuestions(compiled, new Map(), {
    rng: seededRandom(4),
    recent,
  })
  const open = compiled.chapters[0].sources.flatMap(s => s.list()).length
  const repeated = again.filter(q => recent.has(q.key)).length
  assert.ok(
    repeated <= Math.max(0, again.length - (open - recent.size)),
    `${repeated} repeated`,
  )
})

test('the answers to a question begin with a capital letter', () => {
  const up = capitalFor({
    prompt: 'Où dort-on ?',
    choices: ['dans la chambre', 'dans la cuisine'],
  })
  assert.equal(up('dans la chambre'), 'Dans la chambre')
  const end = capitalFor({
    prompt: 'Au féminin, « un chat » devient…',
    choices: ['une chatte', 'une chate'],
  })
  assert.equal(end('une chatte'), 'une chatte')
  const blank = capitalFor({
    prompt: 'Il ___ partir ?',
    choices: ['veut', 'veux'],
  })
  assert.equal(blank('veut'), 'veut')
  const sounds = capitalFor({
    prompt: 'Quel son entends-tu ?',
    choices: ['ph', 'f', 'ou'],
  })
  assert.equal(sounds('ph'), 'ph')
})

test('the size of a question depends on what it is, not its length', () => {
  assert.equal(isolated({ prompt: '7 × 8' }), true)
  assert.equal(isolated({ prompt: 'le chat' }), true)
  assert.equal(isolated({ prompt: 'Où dort-on ?' }), false)
  assert.equal(
    isolated({ prompt: 'Sur un plan, une table vue d’en haut ressemble à…' }),
    false,
  )
})
