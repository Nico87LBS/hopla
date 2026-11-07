import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checkAnswer, compile } from '../src/utils/learn/engine.js'
import {
  cardDone,
  cardFrom,
  editable,
  fieldsOf,
  fromDocument,
  kindOf,
  moduleIdFor,
  newChapter,
  newPack,
  nextVersion,
  readList,
  toDocument,
} from '../src/utils/learn/familyPack.js'
import { cardItems } from '../src/utils/learn/generators.js'

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
  pack.tags = ['CE1', ' CE1 ', 'Anglais']
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
  assert.deepEqual(doc.niveaux, ['CE1', 'Anglais'])
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
  assert.equal(kindOf({ type: 'associer' }), 'associer')
  assert.equal(kindOf({ type: 'calcul' }), 'autre')
  assert.equal(kindOf({ type: 'choix', image: 'cat' }), 'choix')
  assert.equal(kindOf({ type: 'ecoute', sens: ['lire', 'dictee'] }), 'dictee')
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

test('the chapters after the first open at 80 %, unless the family chose otherwise', () => {
  const doc = toDocument(
    fromDocument({
      format: 'hopla-module/1',
      id: 'famille-y',
      version: '1.0.0',
      nom: 'Y',
      chapitres: [
        { id: 'a', nom: 'A' },
        { id: 'b', nom: 'B' },
        { id: 'c', nom: 'C', ouvert_apres: 0 },
      ],
      fiches: [],
    }),
  )
  assert.deepEqual(
    doc.chapitres.map(c => c.ouvert_apres),
    [undefined, 80, 0],
  )
  const pack = newPack('Z')
  pack.chapters.push(newChapter())
  assert.equal(toDocument(pack).chapitres[1].ouvert_apres, 80)
})

test('a dictation accepts the other spellings heard the same way', () => {
  const { cards, skipped } = readList(
    'cet ; cette\nchaussette\n ; \ngrenouille\tgrenouilles',
    { as: 'words', oneTypo: false },
  )
  assert.equal(skipped, 1)
  assert.deepEqual(
    cards.map(c => [c.question, c.autres_reponses]),
    [
      ['cet', ['cette']],
      ['chaussette', undefined],
      ['grenouille', ['grenouilles']],
    ],
  )
  assert.equal(kindOf(cards[0]), 'dictee')
  assert.deepEqual(fieldsOf(cards[0]).others, ['cette'])

  // The game takes « cette » as right when it says « cet », even without
  // the small mistake allowed.
  const item = cardItems(
    { ...cards[0], id: 'cet', chapitre: 'c' },
    'famille-dictee',
    [],
    'fr',
  )[0]
  assert.equal(checkAnswer(item, 'Cette').correct, true)
  assert.equal(checkAnswer(item, 'ces').correct, false)

  // Written again in the editor, the spellings stay.
  const again = cardFrom(
    'dictee',
    { ...fieldsOf(cards[0]), others: ['cette', ''] },
    cards[0],
  )
  assert.deepEqual(again.autres_reponses, ['cette'])
  assert.equal(
    cardFrom('dictee', { question: 'cet', others: [] }).autres_reponses,
    undefined,
  )
})

test('the editor writes every option of a card, and reads them back', () => {
  const card = cardFrom(
    'choix',
    {
      question: 'Le ___ dort.',
      answer: 'chat',
      traps: ['chats', 'chate'],
      extras: {
        consigne: 'Complète la phrase.',
        explication: 'un seul chat',
        image: 'cat',
        sens: ['direct', 'inverse'],
        pourquoi: { chats: 'il n’y en a qu’un', chate: '', autre: 'parti' },
      },
    },
    { id: 'f', chapitre: 'c', cle: 'fr:chat', paires: [['a', 'b']] },
  )
  assert.deepEqual(card, {
    id: 'f',
    chapitre: 'c',
    cle: 'fr:chat',
    type: 'choix',
    question: 'Le ___ dort.',
    reponse: 'chat',
    pieges: ['chats', 'chate'],
    consigne: 'Complète la phrase.',
    explication: 'un seul chat',
    image: 'cat',
    sens: ['direct', 'inverse'],
    pourquoi: { chats: 'il n’y en a qu’un' },
  })
  const back = fieldsOf(card)
  assert.equal(back.extras.image, 'cat')
  assert.deepEqual(back.extras.pourquoi, { chats: 'il n’y en a qu’un' })

  // Asked only one way, a card needs no senses; accents counted are kept.
  const typedCard = cardFrom('saisie', {
    question: 'été',
    answer: 'summer',
    tolerance: 'exacte',
    extras: { ...back.extras, sens: ['direct'], pourquoi: {} },
  })
  assert.equal(typedCard.sens, undefined)
  assert.equal(typedCard.tolerance, 'exacte')
  assert.equal(typedCard.pourquoi, undefined)

  // A word heard and picked among drawings has its own answer and traps;
  // named from its drawing, it says what to ask.
  const heard = cardFrom('dictee', {
    question: 'apple',
    answer: 'la pomme',
    traps: ['la poire'],
    extras: {
      sens: ['direct', 'inverse'],
      image: 'apple',
      question_inverse: 'Comment dit-on en anglais ?',
    },
  })
  assert.equal(heard.reponse, 'la pomme')
  assert.deepEqual(heard.pieges, ['la poire'])
  assert.deepEqual(heard.sens, ['direct', 'inverse'])
  assert.equal(heard.consigne, undefined)
  assert.equal(heard.question_inverse, 'Comment dit-on en anglais ?')
  assert.equal(heard.autres_reponses, undefined)
  assert.ok(cardDone(heard))
  assert.equal(cardDone({ ...heard, reponse: '' }), false)
  assert.equal(fieldsOf(heard).answer, 'la pomme')
  assert.equal(fieldsOf(cardFrom('dictee', { question: 'cet' })).answer, '')

  // The instruction of a dictation does not follow it to another kind.
  const dictation = cardFrom('dictee', { question: 'cet' })
  const moved = cardFrom('saisie', { ...fieldsOf(dictation), answer: 'x' })
  assert.equal(moved.consigne, undefined)
})

test('the drawings offered are those of the app', async () => {
  const { readdirSync } = await import('node:fs')
  const { DRAWINGS } = await import('../src/utils/learn/drawings.js')
  const folder = new URL('../public/drawings/', import.meta.url)
  const have = readdirSync(folder)
    .filter(name => name.endsWith('.svg'))
    .map(name => name.slice(0, -4))
    .sort()
  assert.deepEqual(
    DRAWINGS,
    have,
    'run the list again: node scripts/drawing-list.mjs',
  )
})

test('the zones offered are those of the pictures', async () => {
  const { readdirSync, readFileSync } = await import('node:fs')
  const { ZONE_PICTURES } = await import('../src/utils/learn/drawings.js')
  const folder = new URL('../public/drawings/zones/', import.meta.url)
  const pictures = readdirSync(folder)
    .filter(name => name.endsWith('.svg'))
    .map(name => name.slice(0, -4))
    .sort()
  assert.deepEqual(Object.keys(ZONE_PICTURES).sort(), pictures)
  for (const picture of pictures) {
    const svg = readFileSync(new URL(`${picture}.svg`, folder), 'utf8')
    for (const [zone] of ZONE_PICTURES[picture]) {
      assert.ok(svg.includes(`data-zone="${zone}"`), `${picture} ${zone}`)
    }
  }
})

test('a pack of the family keeps the level and the group of its chapters', () => {
  const pack = newPack('Dictées')
  pack.chapters = [
    {
      ...newChapter(),
      nom: 'Semaine 1',
      niveau: ' Automne ',
      groupe: 'Mots en -ette',
      cards: [],
    },
    {
      ...newChapter(),
      nom: 'Semaine 2',
      niveau: 'Automne',
      groupe: '',
      cards: [],
    },
  ]
  const doc = toDocument(pack)
  assert.equal(doc.chapitres[0].niveau, 'Automne')
  assert.equal(doc.chapitres[0].groupe, 'Mots en -ette')
  assert.equal(doc.chapitres[1].niveau, 'Automne')
  assert.equal(
    'groupe' in doc.chapitres[1],
    false,
    'an empty group is left out',
  )
  const back = fromDocument(doc)
  assert.equal(back.chapters[0].niveau, 'Automne')
  assert.equal(toDocument(back).chapitres[0].groupe, 'Mots en -ette')
})

test('the tags say who a pack is for', () => {
  const pack = newPack('Vocabulaire pilote')
  pack.id = 'famille-pilote'
  assert.equal(toDocument(pack).public, 'enfant')
  pack.tags = ['Adulte', 'Anglais']
  const doc = toDocument(pack)
  assert.equal(doc.public, 'adulte')
  assert.equal(doc.lecture_voix_haute, undefined)
  // Reading a pack written before the tags brings its audience back.
  assert.deepEqual(fromDocument({ ...doc, niveaux: ['Anglais'] }).tags, [
    'Anglais',
    'Adulte',
  ])
})
