import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compile } from '../src/utils/learn/engine.js'
import {
  cardFrom,
  editable,
  fieldsOf,
  fromDocument,
  kindOf,
  moduleIdFor,
  newPack,
  nextVersion,
  readList,
  toDocument,
} from '../src/utils/learn/familyPack.js'

test('a pasted list of words gives dictation cards, without the doubles', () => {
  const { cards, skipped } = readList(
    'grenouille\n\n  chaussette \nGrenouille\n',
    { as: 'words', oneTypo: true },
    [],
  )
  assert.equal(cards.length, 2)
  assert.equal(skipped, 1)
  assert.deepEqual(cards[1], {
    type: 'ecoute',
    question: 'chaussette',
    reponse: 'chaussette',
    sens: ['dictee'],
    tolerance: 'une_faute',
    consigne: 'Écoute le mot et écris-le.',
  })
  assert.equal(kindOf(cards[0]), 'dictee')
  const again = readList('chaussette\npapillon', { as: 'words' }, cards)
  assert.deepEqual(
    again.cards.map(c => c.question),
    ['papillon'],
    'a word already in the chapter is left out',
  )
})

test('a pasted table gives questions, the next columns as wrong answers', () => {
  const { cards, skipped } = readList(
    'Capitale de la France\tParis\tLyon\tMarseille\nPluriel de cheval ; chevaux\nsans réponse',
    { as: 'questions', kind: 'choix' },
  )
  assert.equal(skipped, 1)
  assert.deepEqual(cards[0].pieges, ['Lyon', 'Marseille'])
  assert.equal(cards[1].reponse, 'chevaux')
  assert.equal(cards[1].pieges, undefined)
  const typed = readList('le chat ; the cat ; cat', {
    as: 'questions',
    kind: 'saisie',
    oneTypo: true,
  }).cards[0]
  assert.deepEqual(typed.autres_reponses, ['cat'])
  assert.equal(typed.tolerance, 'une_faute')
})

test('the editor writes a module the game reads, and reads it back', () => {
  const pack = newPack('Dictée semaine 45')
  pack.id = moduleIdFor(pack.name, ['famille-dictee-semaine-45'])
  assert.equal(pack.id, 'famille-dictee-semaine-45-2')
  pack.level = 'CE1'
  pack.chapters[0].cards = [
    ...readList('grenouille\nchaussette', { as: 'words', oneTypo: true }).cards,
    cardFrom('choix', {
      question: 'un ou une montagne ?',
      answer: 'une',
      traps: ['un'],
    }),
    cardFrom('retourner', {
      question: 'Récite la poésie',
      answer: 'Le corbeau…',
    }),
  ]
  pack.chapters.push({
    id: '',
    nom: 'Grenouille',
    cards: [cardFrom('saisie', { question: 'grenouille', answer: 'frog' })],
  })
  const doc = toDocument(pack)
  assert.equal(doc.format, 'hopla-module/1')
  assert.deepEqual(doc.niveaux, ['CE1'])
  assert.equal(doc.langue_apprise, 'fr')
  assert.equal(doc.lecture_voix_haute, true)
  assert.deepEqual(
    doc.chapitres.map(c => c.id),
    ['chapitre-1', 'grenouille'],
  )
  const ids = doc.fiches.map(c => c.id)
  assert.equal(new Set(ids).size, ids.length, 'every card has its own id')
  assert.deepEqual(ids.slice(0, 2), ['grenouille', 'chaussette'])
  assert.equal(ids[4], 'grenouille-2')
  assert.ok(compile(doc), 'the game reads it')

  assert.ok(editable(doc))
  const back = fromDocument(doc)
  assert.equal(back.chapters[1].cards[0].chapitre, 'grenouille')
  const again = toDocument({ ...back, version: nextVersion(back.version) })
  assert.equal(again.version, '1.0.1')
  assert.deepEqual(
    again.fiches.map(c => c.id),
    ids,
    'ids stay, so what is known stays',
  )
})

test('a card keeps its id when it changes kind, and what the editor does not write stays', () => {
  const card = {
    id: 'f1',
    chapitre: 'c',
    type: 'saisie',
    question: 'q',
    reponse: 'r',
    explication: 'parce que',
  }
  const fields = fieldsOf(card)
  const changed = cardFrom('choix', { ...fields, traps: ['x'] }, card)
  assert.equal(changed.id, 'f1')
  assert.equal(changed.explication, 'parce que')
  assert.equal(kindOf({ type: 'associer' }), 'autre')
  assert.equal(kindOf({ type: 'choix', image: 'cat' }), 'autre')
  assert.equal(editable({ format: 'hopla-module/1', modules: ['a'] }), false)
  assert.equal(editable({ format: 'hopla-module/1', generateurs: [{}] }), false)
  const doc = toDocument(
    fromDocument({
      format: 'hopla-module/1',
      id: 'famille-x',
      version: '2',
      nom: 'X',
      public: 'adulte',
      reglages: { questions_par_partie: 5 },
      chapitres: [{ id: 'c', nom: 'C', ouvert_apres: 50 }],
      fiches: [
        card,
        {
          id: 'a',
          chapitre: 'c',
          type: 'ordre',
          question: 'o',
          elements: ['1', '2', '3'],
        },
      ],
    }),
  )
  assert.deepEqual(doc.reglages, { questions_par_partie: 5 })
  assert.equal(doc.chapitres[0].ouvert_apres, 50)
  assert.equal(doc.fiches[1].type, 'ordre')
  assert.equal(doc.lecture_voix_haute, undefined)
  assert.equal(nextVersion('2'), '1.0.0')
  assert.equal(nextVersion('1.2.9'), '1.2.10')
})
