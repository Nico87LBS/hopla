import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compile } from '../src/utils/learn/engine.js'
import {
  cardDone,
  cardFrom,
  toDocument,
} from '../src/utils/learn/familyPack.js'
import {
  emptyLabels,
  labelProblem,
  labelsFor,
  labelsOf,
} from '../src/utils/learn/labelCards.js'

test('pairs, orders and boxes are written from rows, empty rows aside', () => {
  const labels = emptyLabels()
  labels.paires = [
    [
      { texte: 'chat', image: '' },
      { texte: 'chaton', image: 'cat' },
    ],
    [
      { texte: 'chien', image: '' },
      { texte: 'chiot', image: '' },
    ],
    [
      { texte: '', image: 'cow' },
      { texte: 'veau', image: '' },
    ],
    [
      { texte: '', image: '' },
      { texte: '', image: '' },
    ],
  ]
  const pairs = cardFrom('associer', {
    question: 'Relie chaque animal à son petit.',
    labels,
  })
  assert.deepEqual(pairs.paires, [
    ['chat', { texte: 'chaton', image: 'cat' }],
    ['chien', 'chiot'],
    [{ image: 'cow' }, 'veau'],
  ])
  assert.ok(cardDone(pairs))
  assert.deepEqual(labelsOf(pairs).paires[2][0], { texte: '', image: 'cow' })

  labels.elements = [
    { texte: 'se lever', groupe: '' },
    { texte: 's’habiller', groupe: 'A' },
    { texte: 'déjeuner', groupe: 'A' },
    { texte: 'partir', groupe: 'B' },
  ]
  const order = cardFrom('ordre', { question: 'Le matin', labels })
  assert.deepEqual(order.elements, [
    'se lever',
    's’habiller',
    'déjeuner',
    'partir',
  ])
  assert.deepEqual(order.echangeables, [['s’habiller', 'déjeuner']])
  assert.equal(labelsOf(order).elements[2].groupe, 'A')

  labels.boites = [
    { nom: 'Masculin', image: '', regle: 'on dit « un »' },
    { nom: 'Féminin', image: '', regle: '' },
  ]
  labels.a_classer = [
    { texte: 'chat', image: 'cat', boite: 'Masculin', pourquoi: '' },
    { texte: 'pomme', image: '', boite: 'Féminin', pourquoi: 'une pomme' },
  ]
  const sort = cardFrom(
    'classer',
    { question: 'Range', labels },
    { id: 's', cle: 'x' },
  )
  assert.equal(sort.cle, undefined, 'a card to sort has no shared key')
  assert.deepEqual(sort.boites[0], {
    nom: 'Masculin',
    regle: 'on dit « un »',
  })
  assert.deepEqual(sort.a_classer[1], {
    texte: 'pomme',
    boite: 'Féminin',
    pourquoi: 'une pomme',
  })
  assert.ok(cardDone(sort))

  const doc = toDocument({
    id: 'famille-test',
    version: '1.0.0',
    name: 'Test',
    audience: 'enfant',
    chapters: [{ id: '', nom: 'C', cards: [pairs, order, sort] }],
    rest: {},
  })
  assert.ok(compile(doc), 'the game reads them')
})

test('a card of labels says what it lacks', () => {
  const two = labelsFor('associer', {
    ...emptyLabels(),
    paires: [
      [
        { texte: 'a', image: '' },
        { texte: 'b', image: '' },
      ],
      [
        { texte: 'c', image: '' },
        { texte: 'd', image: '' },
      ],
    ],
  })
  assert.equal(labelProblem({ type: 'associer', ...two }), 'pairsCount')
  assert.equal(
    labelProblem({
      type: 'associer',
      paires: [
        ['a', 'b'],
        ['a', 'c'],
        ['d', ''],
      ],
    }),
    'pairsSides',
  )
  assert.equal(
    labelProblem({ type: 'ordre', elements: ['a', 'b', 'a'] }),
    'elementsTwice',
  )
  assert.equal(
    labelProblem({
      type: 'classer',
      boites: [{ nom: 'X' }, { nom: 'Y' }],
      a_classer: [
        { texte: 'a', boite: 'X' },
        { texte: 'b', boite: '' },
      ],
    }),
    'toSortBox',
  )
  assert.equal(
    labelProblem({ type: 'tracer', reponse: 'anticonstitution' }),
    'tracedLength',
  )
  assert.equal(
    cardDone(cardFrom('tracer', { question: 'Trace', answer: 'a' })),
    true,
  )
})

test('a zone is asked by its id in a picture of the catalogue', () => {
  const card = cardFrom('zones', {
    answer: 'Bretagne',
    zone: { picture: 'carte-france', id: 'bretagne' },
    extras: { sens: ['toucher'], question_toucher: 'Touche la Bretagne' },
  })
  assert.deepEqual(
    {
      image: card.image,
      question: card.question,
      reponse: card.reponse,
      sens: card.sens,
      question_toucher: card.question_toucher,
    },
    {
      image: 'carte-france',
      question: 'bretagne',
      reponse: 'Bretagne',
      sens: ['toucher'],
      question_toucher: 'Touche la Bretagne',
    },
  )
  assert.ok(cardDone(card))
  assert.equal(
    cardDone(cardFrom('zones', { answer: '', zone: { picture: '', id: '' } })),
    false,
  )
})
