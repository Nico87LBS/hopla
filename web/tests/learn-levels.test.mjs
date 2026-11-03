import assert from 'node:assert/strict'
import { test } from 'node:test'

import { cardMap, compile } from '../src/utils/learn/engine.js'
import { levelKnown } from '../src/utils/learn/levels.js'

const doc = id => ({
  id,
  nom: id,
  chapitres: [{ id: 'c', nom: 'c' }],
  fiches: [1, 2].map(n => ({
    id: `${id}-${n}`,
    chapitre: 'c',
    question: `q${n}`,
    reponse: `r${n}`,
  })),
})
const player = {
  packs: [
    { id: 'p', name: 'P', children: ['p1', 'p2'] },
    { id: 'p1', name: 'P1', children: ['a'] },
    { id: 'p2', name: 'P2', children: ['b'] },
  ],
  modules: [{ id: 'a' }],
}
const byId = { a: compile(doc('a')) }
const keys = byId.a.chapters[0].sources[0].list().map(item => item.key)

test('a level known at the threshold opens the next', () => {
  const pp = { pack: 'p', openTo: '' }
  assert.equal(levelKnown(player, pp, byId, cardMap([])), false)
  const known = cardMap(keys.map(key => ({ key, box: 4 })))
  assert.equal(levelKnown(player, pp, byId, known), true)
  assert.equal(
    levelKnown(player, { pack: 'p', openTo: 'p2' }, byId, known),
    false,
    'nothing after the last level',
  )
})
