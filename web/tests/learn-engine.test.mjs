import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
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
  totalLeft,
} from '../src/utils/learn/engine.js'
import { evaluate } from '../src/utils/learn/expression.js'
import { generatorSource, slug } from '../src/utils/learn/generators.js'
import { formatNumber, frenchWords } from '../src/utils/learn/numbers.js'
import { learnParent } from '../src/utils/learn/routes.js'
import { pickVoice } from '../src/utils/learn/speech.js'

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
      const source = generatorSource(gen, doc.id, { firstName: 'Léa' })
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

test('the total cap of the day holds back what a game earns', () => {
  assert.equal(totalLeft({ totalCap: null, earnedToday: 9 }), Infinity)
  assert.equal(totalLeft({ totalCap: 10, earnedToday: 9 }), 1)
  assert.equal(totalLeft({ totalCap: 10, earnedToday: 12 }), 0)
  assert.equal(expectedHops(10, 10, {}, 0, 10, 1), 1)
  assert.equal(expectedHops(10, 10, {}, 0, 10, Infinity), 3)
})

test('a card without traps of its own draws them from its chapter, game after game', () => {
  const compiled = compile(catalogue['anglais-aero-meteo'])
  const chapter = compiled.chapters[0]
  const answers = new Set(chapter.sources[0].list().map(item => item.answer))
  const drawn = new Set()
  for (let seed = 1; seed <= 6; seed++) {
    for (const q of pickQuestions(compiled, new Map(), {
      rng: seededRandom(seed),
    })) {
      assert.equal(q.choices.length, 4)
      assert.ok(q.choices.includes(q.answer))
      assert.equal(new Set(q.choices).size, 4)
      if (q.key === 'en:def:fog') {
        q.choices.forEach(c => assert.ok(answers.has(c), c))
        q.choices.filter(c => c !== q.answer).forEach(c => drawn.add(c))
      }
    }
  }
  assert.ok(drawn.size > 3, `${drawn.size} different traps`)
})

test('the youngest hear a word and pick one drawing among three', () => {
  const compiled = compile(catalogue['anglais-gs'])
  const questions = pickQuestions(compiled, new Map(), {
    rng: seededRandom(3),
  })
  assert.equal(questions.length, 6)
  for (const q of questions) {
    assert.equal(q.mode, 'choice')
    assert.equal(q.lang, 'en')
    assert.equal(q.listen, q.prompt, 'the English word is said')
    assert.equal(q.choices.length, 3)
    assert.ok(q.choices.includes(q.answer))
    q.choices.forEach(c => assert.ok(q.images[c], `${q.key}: ${c}`))
  }
})

test('every drawing a card names is in the app', () => {
  const drawings = new URL('../public/drawings/', import.meta.url)
  const have = new Set(readdirSync(drawings).map(n => n.replace('.svg', '')))
  // Every drawing a card holds, in its labels too; a picture in zones has
  // its own folder.
  const imagesOf = value =>
    Array.isArray(value)
      ? value.flatMap(imagesOf)
      : value && typeof value === 'object'
        ? Object.entries(value).flatMap(([k, v]) =>
            k === 'image' && typeof v === 'string' ? [v] : imagesOf(v),
          )
        : []
  for (const doc of modules) {
    for (const card of doc.fiches || []) {
      if (card.type === 'zones') continue
      for (const image of imagesOf(card)) {
        assert.ok(have.has(image), `${doc.id} ${card.id}: ${image}`)
      }
    }
    for (const gen of doc.generateurs || []) {
      for (const image of gen.objets || []) {
        assert.ok(have.has(image), `${doc.id} ${gen.id}: ${image}`)
      }
    }
  }
})

test('a listening card is heard, read, or written down', () => {
  const compiled = compile(catalogue['anglais-ce2'])
  const items = compiled.chapters.flatMap(c =>
    c.sources.flatMap(source => source.list()),
  )
  const heard = items.find(i => i.key === 'en:mot:cat')
  assert.deepEqual([heard.listen, heard.answer], ['cat', 'chat'])
  assert.equal(heard.images, undefined, 'words, not drawings, in CE2')
  assert.equal(heard.choices.length, 4)
  const read = items.find(i => i.key === 'en:mot:cat:lire')
  assert.equal(read.prompt, 'cat')
  assert.equal(read.listen, undefined, 'read, not heard')
  assert.equal(read.said.listen, 'cat', 'but said once answered')
  const written = items.find(i => i.key === 'en:ecrire:cat:dictee')
  assert.equal(written.mode, 'text')
  assert.equal(written.listen, 'cat')
  assert.equal(checkAnswer(written, 'Cat').correct, true)
  assert.equal(checkAnswer(written, 'kat').correct, true, 'one slip is fine')
  assert.equal(checkAnswer(written, 'dog').correct, false)
})

test('a clearance is heard and its figures typed to read it back', () => {
  const compiled = compile(catalogue['anglais-aero-ecoute'])
  const items = compiled.chapters.flatMap(c =>
    c.sources.flatMap(source => source.list()),
  )
  const readback = items.find(i => i.key === 'en:atc:readback-40:chiffres')
  assert.equal(readback.mode, 'number')
  assert.match(readback.listen, /flight level two four zero/)
  assert.equal(checkAnswer(readback, '2404512').correct, true)
  assert.equal(checkAnswer(readback, '240').correct, false)
})

test('English is said by a British voice of the device when there is one', () => {
  const voices = [
    { lang: 'fr-FR', localService: true },
    { lang: 'en-US', localService: true },
    { lang: 'en-GB', localService: false },
    { lang: 'en_GB', localService: true },
  ]
  assert.equal(pickVoice(voices, 'en'), voices[3])
  assert.equal(pickVoice(voices.slice(0, 3), 'en'), voices[1])
  assert.equal(pickVoice(voices.slice(0, 1), 'en'), null)
})

test('the back arrow of the games goes one page up, never into a game', () => {
  assert.equal(learnParent('/learn/1/play/anglais-aero-meteo'), '/learn/1')
  // Apprendre is a place of the bottom bar: a person's games go back to
  // the choice of the person, and the choice itself has no back arrow.
  assert.equal(learnParent('/learn/1'), '/learn')
  assert.equal(learnParent('/learn'), null)
  assert.equal(learnParent('/manage/learn/maths-ce2-division'), '/manage/learn')
  assert.equal(
    learnParent('/manage/learn/detail/anglais-aero'),
    '/manage/learn/catalogue',
  )
  assert.equal(learnParent('/manage/learn/catalogue'), '/manage')
  assert.equal(learnParent('/manage/learn/voix'), '/manage')
  assert.equal(learnParent('/manage/learn'), '/manage')
  assert.equal(learnParent('/chores'), null)
})

// ── the games of several labels ──

const example = JSON.parse(
  readFileSync(
    new URL('../../docs/exemples/essai-nouveaux-jeux.json', import.meta.url),
    'utf8',
  ),
)

const itemsOf = (doc, chapter) => {
  const compiled = compile(doc)
  return compiled.chapters
    .find(c => c.id === chapter)
    .sources.flatMap(source => source.list() || [])
}

test('every zone asked is drawn in its picture', () => {
  const zonesDir = new URL('../public/drawings/zones/', import.meta.url)
  for (const doc of [example, ...modules]) {
    for (const card of doc.fiches || []) {
      if (card.type !== 'zones') continue
      const svg = readFileSync(new URL(`${card.image}.svg`, zonesDir), 'utf8')
      assert.ok(
        svg.includes(`data-zone="${card.question}"`),
        `${doc.id} ${card.id}: zone ${card.question}`,
      )
    }
  }
})

test('a zone is touched by its id or named among the others', () => {
  const items = itemsOf(example, 'zones')
  const touch = items.find(i => i.key === 'essai-nouveaux-jeux:z-bretagne')
  assert.equal(touch.mode, 'zone')
  assert.equal(touch.prompt, 'Touche : Bretagne')
  assert.ok(checkAnswer(touch, 'bretagne').correct)
  assert.ok(!checkAnswer(touch, 'normandie').correct)
  const name = items.find(
    i => i.key === 'essai-nouveaux-jeux:z-bretagne:nommer',
  )
  assert.equal(name.mode, 'choice')
  assert.equal(name.zone, 'bretagne')
  assert.ok(name.trapPool.includes('Corse'))
  assert.ok(!name.trapPool.includes('la tête'), 'traps of the same picture')
})

test('a zone is named among the zones of its chapter, not a river among cities', () => {
  const doc = modules.find(m => m.id === 'monde-ce2-espace')
  const name = itemsOf(doc, 'fleuves').find(
    i => i.key === 'monde-ce2-espace:fleuve-loire:nommer',
  )
  assert.deepEqual([...name.trapPool].sort(), [
    'la Garonne',
    'la Seine',
    'le Rhin',
    'le Rhône',
  ])
  assert.ok(name.choices.every(c => !['Paris', 'les Alpes'].includes(c)))
})

test('labels to sort are one question each, keyed by their words', () => {
  const items = itemsOf(example, 'classer')
  assert.equal(items.length, 6)
  const bird = items.find(i => i.subject.text === "l'oiseau")
  assert.equal(bird.key, 'essai-nouveaux-jeux:vivant:l-oiseau')
  assert.deepEqual(bird.choices, ['Vivant', 'Non vivant'])
  assert.ok(checkAnswer(bird, 'Vivant').correct)
})

test('pairs are drawn for a game and right only without a mistake', () => {
  const compiled = compile({
    ...example,
    chapitres: [{ id: 'relier', nom: 'Relier' }],
    generateurs: [],
    fiches: example.fiches.filter(f => f.chapitre === 'relier'),
  })
  const [match] = pickQuestions(compiled, new Map(), { rng: seededRandom(3) })
  assert.equal(match.mode, 'match')
  assert.ok(match.pairs.length <= 5 && match.pairs.length >= 3)
  assert.equal(match.left.length, match.pairs.length)
  assert.equal(match.answer.split(', ').length, match.pairs.length)
  assert.ok(checkAnswer(match, '').correct)
  assert.ok(!checkAnswer(match, 'le chat – dog').correct)
})

test('labels to order come mixed and are right in their order', () => {
  const compiled = compile({
    ...example,
    chapitres: [{ id: 'ordre', nom: 'Ordre' }],
    generateurs: [],
    fiches: example.fiches.filter(f => f.chapitre === 'ordre'),
  })
  const questions = pickQuestions(compiled, new Map(), {
    rng: seededRandom(5),
  })
  const days = questions.find(q => q.key === 'essai-nouveaux-jeux:jours')
  assert.notDeepEqual(days.mixed, days.elements)
  assert.deepEqual([...days.mixed].sort(), [...days.elements].sort())
  assert.ok(
    checkAnswer(days, 'lundi → mardi → mercredi → jeudi → vendredi').correct,
  )
  assert.ok(
    !checkAnswer(days, 'mardi → lundi → mercredi → jeudi → vendredi').correct,
  )
})

test('a collection is counted by choosing up to ten, then typed', () => {
  const source = generatorSource(example.generateurs[0], example.id)
  const items = source.list()
  const six = items.find(i => i.key === 'cnt:objets:6')
  assert.equal(six.mode, 'choice')
  assert.equal(six.choices.length, 4)
  assert.ok(six.choices.includes('6'))
  const twelve = items.find(i => i.key === 'cnt:objets:12')
  assert.equal(twelve.mode, 'number')
  assert.ok(!items.some(i => i.key === 'cnt:de:7'), 'a die stops at six')
  assert.equal(source.fromKey('cnt:de:4').answer, '4')
  const [counted] = pickQuestions(
    compile({
      ...example,
      chapitres: [{ id: 'compter', nom: 'Compter' }],
      fiches: [],
    }),
    new Map(),
    { rng: seededRandom(2) },
  )
  assert.ok(example.generateurs[0].objets.includes(counted.count.object))
})

test('a label is named in its key as the server does', () => {
  assert.equal(slug('  Le cheval à bascule !'), 'le-cheval-a-bascule')
  assert.equal(slug('L’été'), 'l-ete')
  assert.equal(slug('Œuf'), 'oeuf')
})

test('the questions about the first name use the player’s own', () => {
  const doc = {
    id: 'essai-prenom',
    nom: 'Prénom',
    chapitres: [{ id: 'p', nom: 'Mon prénom' }],
    generateurs: [{ id: 'g', chapitre: 'p', operation: 'prenom' }],
    fiches: [
      {
        id: 'bonjour',
        chapitre: 'p',
        type: 'choix',
        question: 'Bonjour {prenom} ! Combien font 1 + 1 ?',
        reponse: '2',
        pieges: ['3'],
        image: 'apple',
      },
    ],
  }
  const items = compile(doc, { firstName: 'Léa' }).chapters[0].sources.flatMap(
    s => s.list(),
  )
  const byKey = Object.fromEntries(items.map(i => [i.key, i]))
  assert.equal(byKey['prenom:premiere'].answer, 'L')
  assert.ok(!byKey['prenom:premiere'].trapPool.includes('A'))
  assert.equal(byKey['prenom:reconnaitre'].answer, 'LÉA')
  assert.ok(byKey['prenom:reconnaitre'].choices.includes('LÉO'))
  assert.deepEqual(byKey['prenom:ordre'].elements, ['L', 'É', 'A'])
  assert.equal(byKey['prenom:nombre'].answer, '3')
  assert.equal(
    byKey['essai-prenom:bonjour'].prompt,
    'Bonjour Léa ! Combien font 1 + 1 ?',
  )
  assert.equal(byKey['essai-prenom:bonjour'].image, 'apple')

  const nameless = compile(doc).chapters[0].sources.flatMap(s => s.list())
  assert.ok(!nameless.some(i => i.key.startsWith('prenom:')))
  assert.equal(nameless[0].prompt, 'Bonjour toi ! Combien font 1 + 1 ?')
})

test('a word to read is answered with drawings, its instruction apart', () => {
  const compiled = compile(catalogue['lire-mots'])
  const items = compiled.chapters.flatMap(ch =>
    ch.sources.flatMap(s => s.list() || []),
  )
  const moto = items.find(item => item.prompt === 'la moto')
  assert.equal(moto.instruction, 'Lis le mot, puis touche son dessin.')
  assert.equal(moto.images['la moto'], 'motorbike')
  assert.deepEqual(moto.said, { listen: 'la moto', lang: 'fr' })
  assert.equal(catalogue['lire-mots'].lecture_voix_haute, 'consigne')
  const order = compile(catalogue['lire-syllabes'])
    .chapters.flatMap(ch => ch.sources.flatMap(s => s.list() || []))
    .find(item => item.mode === 'order')
  assert.ok(order.image, 'the drawing of the word to put back together')
})

test('a word heard keeps the look-alike words given as its traps', () => {
  const items = compile(catalogue['lire-sans-dessin']).chapters.flatMap(ch =>
    ch.sources.flatMap(s => s.list() || []),
  )
  const lait = items.find(item => item.listen === 'lait')
  assert.deepEqual([...lait.choices].sort(), ['lait', 'lit', 'loup', 'lune'])
  assert.equal(lait.trapPool, undefined)
})

test('a clock is read among times that are easy to mix up', () => {
  const source = generatorSource(
    {
      id: 'h',
      chapitre: 'c',
      operation: 'heure',
      a: [1, 12],
      formes: ['pile', 'demie'],
    },
    'essai',
  )
  const items = source.list()
  assert.equal(items.length, 24)
  const three = items.find(i => i.key === 'hr:3:0')
  assert.equal(three.answer, '3 h')
  assert.deepEqual(three.clock, { h: 3, m: 0 })
  assert.equal(three.choices.length, 4)
  assert.ok(three.choices.includes('12 h'), 'the long hand read as the hour')
  assert.equal(new Set(three.choices).size, 4)
  assert.equal(source.fromKey('hr:12:30').answer, '12 h 30')
  assert.equal(source.fromKey('hr:12:15'), null)
  assert.ok(items.every(i => i.choices.includes(i.answer)))
})
