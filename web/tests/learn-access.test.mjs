import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  chapterAccessOf,
  creatorValue,
  groupAccessOf,
  keysOf,
  levelAccessOf,
  packRows,
  packStructure,
} from '../src/utils/learn/access.js'

const chapter = (id, extra = {}) => ({ id, nom: id, ...extra })

test('what a parent chose for a level and a chapter is read back', () => {
  const kept = [
    'force-open:ce2',
    'cp',
    'chapitre-ouvert:mul/a',
    'chapitre-ferme:mul/b',
  ]
  assert.equal(levelAccessOf(kept, 'ce2'), 'open')
  assert.equal(levelAccessOf(kept, 'cp'), 'locked')
  assert.equal(levelAccessOf(kept, 'ce1'), 'auto')
  assert.equal(chapterAccessOf(kept, 'mul/a'), 'open')
  assert.equal(chapterAccessOf(kept, 'mul/b'), 'locked')
  assert.equal(chapterAccessOf(kept, 'mul/c'), 'auto')
  assert.equal(chapterAccessOf(undefined, 'mul/c'), 'auto')
  assert.equal(groupAccessOf(kept, ['mul/a']), 'open')
  assert.equal(groupAccessOf(kept, ['mul/a', 'mul/b']), 'auto')
})

test('a pack of the catalogue lists its levels, its modules as titles and its chapters', () => {
  const structure = packStructure({
    levels: [
      {
        id: 'ce2',
        name: 'Maths CE2',
        modules: [
          {
            id: 'mul',
            name: 'Multiplication',
            document: { chapitres: [chapter('a'), chapter('b')] },
          },
          {
            id: 'div',
            name: 'Division',
            document: { chapitres: [chapter('c')] },
          },
        ],
      },
      { id: 'cm1', name: 'Maths CM1', modules: [] },
    ],
  })
  assert.deepEqual(
    packRows(structure).map(row => [row.kind, row.name || row.key]),
    [
      ['level', 'Maths CE2'],
      ['group', 'Multiplication'],
      ['chapter', 'mul/a'],
      ['chapter', 'mul/b'],
      ['group', 'Division'],
      ['chapter', 'div/c'],
      ['level', 'Maths CM1'],
    ],
  )
  assert.deepEqual(keysOf(structure), ['mul/a', 'mul/b', 'div/c'])
})

test('a level of one module shows its chapters without a title', () => {
  const structure = packStructure({
    levels: [
      {
        id: 'famille-dictee',
        name: 'Dictée',
        modules: [
          {
            id: 'famille-dictee-dictee',
            name: 'Dictée',
            document: { chapitres: [chapter('a'), chapter('b')] },
          },
        ],
      },
    ],
  })
  assert.deepEqual(
    packRows(structure).map(row => [row.kind, row.name || row.key]),
    [
      ['chapter', 'famille-dictee-dictee/a'],
      ['chapter', 'famille-dictee-dictee/b'],
    ],
  )
})

test('the creator value of a setting is the one the modules share', () => {
  const modules = [{ id: 'a' }, { id: 'b' }]
  const field = { name: 'questions', own: 'questions_par_partie' }
  assert.equal(
    creatorValue(field, modules, { a: { questions_par_partie: 8 } }, []),
    null,
    'one module says 8, the other the usual 10',
  )
  assert.equal(
    creatorValue(
      field,
      modules,
      { a: { questions_par_partie: 8 }, b: { questions_par_partie: 8 } },
      [],
    ),
    8,
  )
  const structure = [
    {
      modules: [
        { chapters: [chapter('a'), chapter('b', { ouvert_apres: 80 })] },
      ],
    },
  ]
  assert.equal(
    creatorValue({ name: 'unlockPercent' }, modules, {}, structure),
    80,
  )
})
