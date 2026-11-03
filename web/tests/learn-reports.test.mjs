import assert from 'node:assert/strict'
import { test } from 'node:test'

import { groupReports } from '../src/utils/learn/reports.js'

test('les signalements sont rangés par module puis par question', () => {
  const written = { id: 'action-1', question: 'Avec ses jambes, on peut ___' }
  const groups = groupReports([
    {
      id: 1,
      module: 'lire',
      moduleName: 'Mots sans dessin',
      card: 'action-1',
      written,
      prompt: 'a',
    },
    {
      id: 2,
      module: 'calc',
      moduleName: 'Calcul',
      card: 'add',
      key: 'add:2+3',
      prompt: '2 + 3',
      expected: '5',
    },
    {
      id: 3,
      module: 'lire',
      moduleName: 'Mots sans dessin',
      card: 'action-1',
      written,
      prompt: 'b',
    },
    {
      id: 4,
      module: 'calc',
      moduleName: 'Calcul',
      card: 'add',
      key: 'add:4+1',
      prompt: '4 + 1',
      expected: '5',
    },
  ])
  assert.deepEqual(
    groups.map(g => g.name),
    ['Calcul', 'Mots sans dessin'],
  )
  const [calc, lire] = groups
  // Questions made by the game stay apart, one per question asked.
  assert.equal(calc.questions.length, 2)
  assert.equal(calc.questions[0].card, null)
  assert.equal(calc.questions[0].expected, '5')
  // A written card gathers all its reports.
  assert.equal(lire.questions.length, 1)
  assert.equal(lire.questions[0].card, written)
  assert.deepEqual(
    lire.questions[0].reports.map(r => r.id),
    [1, 3],
  )
})

test('aucun signalement, aucun module', () => {
  assert.deepEqual(groupReports(undefined), [])
  assert.deepEqual(groupReports([]), [])
})
