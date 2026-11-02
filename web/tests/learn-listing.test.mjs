import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  isRecent,
  levelsIn,
  matches,
  playFirst,
  shape,
  sortItems,
} from '../src/utils/learn/listing.js'

const groups = [
  {
    name: 'Maths CE2',
    levels: ['CE2'],
    items: [
      { id: 'mult', name: 'Multiplications', played: '2026-10-30', p: 40 },
      { id: 'div', name: 'Divisions', played: null, p: 10 },
    ],
  },
  {
    name: 'Français GS',
    levels: ['GS'],
    items: [{ id: 'lettres', name: 'Les lettres', played: '2026-11-01', p: 5 }],
  },
  {
    name: '',
    levels: [],
    items: [{ id: 'mien', name: 'Mon module', levels: ['CP'] }],
  },
]

const ids = list => list.map(g => g.items.map(i => i.id))

test('the search ignores accents and case, and a pack found keeps its modules', () => {
  assert.ok(matches('francais', 'Français GS'))
  assert.ok(matches('mult ce2', 'Multiplications', 'Maths CE2'))
  assert.deepEqual(ids(shape(groups, { query: 'francais' })), [['lettres']])
  assert.deepEqual(ids(shape(groups, { query: 'divi' })), [['div']])
})

test('levels keep a module of that level or of a pack of that level', () => {
  assert.deepEqual(levelsIn(groups.flatMap(g => [g, ...g.items])), [
    'GS',
    'CP',
    'CE2',
  ])
  assert.deepEqual(ids(shape(groups, { levels: ['CP', 'GS'] })), [
    ['lettres'],
    ['mien'],
  ])
})

test('by level the packs go from GS up, the modules outside any pack last', () => {
  assert.deepEqual(ids(shape(groups)), [['lettres'], ['mult', 'div'], ['mien']])
  assert.deepEqual(ids(shape(groups, { sort: 'name' })), [
    ['lettres'],
    ['div', 'mult'],
    ['mien'],
  ])
})

test('by last game or progress, the highest first and the missing last', () => {
  const value = (item, sort) =>
    sort === 'recent' ? (item.played ?? null) : (item.p ?? null)
  assert.deepEqual(ids(shape(groups, { sort: 'recent', value })), [
    ['lettres'],
    ['mult', 'div'],
    ['mien'],
  ])
  assert.deepEqual(ids(shape(groups, { sort: 'progress', value })), [
    ['mult', 'div'],
    ['lettres'],
    ['mien'],
  ])
})

test('a filter keeps only what passes it', () => {
  assert.deepEqual(
    ids(shape(groups, { test: item => isRecent(item.played, '2026-11-02') })),
    [['lettres'], ['mult']],
  )
  assert.equal(isRecent('2026-10-01', '2026-11-02'), false)
  assert.equal(isRecent('2026-10-20T10:00:00Z', '2026-11-02'), true)
})

test('to play first: questions to review, then not done, the locked last', () => {
  const order = playFirst([
    { name: 'A', review: 0 },
    { name: 'B', review: 3, done: true },
    { name: 'C', review: 2 },
    { name: 'D', review: 9, locked: true },
    { name: 'E', review: 5 },
  ]).map(i => i.name)
  assert.deepEqual(order, ['E', 'C', 'A', 'B', 'D'])
})

test('the catalogue sorts by level keeping its order, or by name', () => {
  const list = [
    { name: 'Zèbre', levels: ['CP'] },
    { name: 'Anglais', levels: ['OACI 6'] },
    { name: 'Lettres', levels: ['GS'] },
    { name: 'Avions', levels: ['CP'] },
  ]
  assert.deepEqual(
    sortItems(list, 'level').map(i => i.name),
    ['Lettres', 'Zèbre', 'Avions', 'Anglais'],
  )
  assert.deepEqual(
    sortItems(list, 'name').map(i => i.name),
    ['Anglais', 'Avions', 'Lettres', 'Zèbre'],
  )
})
