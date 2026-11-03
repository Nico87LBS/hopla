import assert from 'node:assert/strict'
import { test } from 'node:test'

import { byRootPack } from '../src/utils/learn/tree.js'

const packs = [
  {
    id: 'anglais-ecole',
    name: 'Anglais à l’école',
    children: ['anglais-gs', 'anglais-cp'],
  },
  { id: 'anglais-gs', name: 'Anglais GS', children: ['gs-1'] },
  { id: 'anglais-cp', name: 'Anglais CP', children: ['cp-1'] },
  { id: 'maths-ecole', name: 'Maths à l’école', children: ['maths-gs'] },
  { id: 'maths-gs', name: 'Maths GS', children: ['m-1'] },
  { id: 'aero', name: 'Anglais aéro', children: ['radio'] },
]
const group = (id, name) => ({ id, name, items: [{ id: `${id}-x` }] })

test('the levels of a pack come under its name, single-level packs alone', () => {
  const sections = byRootPack(
    [
      group('anglais-gs', 'Anglais GS'),
      group('maths-gs', 'Maths GS'),
      group('anglais-cp', 'Anglais CP'),
      group('aero', 'Anglais aéro'),
      group('', ''),
    ],
    packs,
  )
  assert.deepEqual(
    sections.map(s => [s.id, s.levels.map(l => l.title)]),
    [
      ['anglais-ecole', ['Anglais GS', 'Anglais CP']],
      ['maths-ecole', ['Maths GS']],
      ['aero', [null]],
      ['', [null]],
    ],
  )
})
