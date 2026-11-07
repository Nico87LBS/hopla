// A pack the family writes in the editor, without a file: one module of
// chapters and simple cards (to type, to choose, dictation, card to turn).
// The editor reads and writes the module document (hopla-module/1), which
// the server checks on import like any other.

import {
  extrasOf,
  LISTENING,
  listensFor,
  optionsFor,
  toleranceOf,
  typed,
} from './cardOptions.js'
import { slug } from './generators.js'
import { labelProblem, labelsFor } from './labelCards.js'

// The tags carry who a pack is for: "Adulte" and "Tout âge" set the audience
// the game reads; any other tags leave it to children.
const AUDIENCE_TAGS = { adulte: 'adulte', 'tout âge': 'tous', tous: 'tous' }
export const audienceOf = tags => {
  for (const tag of tags || []) {
    const audience = AUDIENCE_TAGS[String(tag).trim().toLowerCase()]
    if (audience) return audience
  }
  return 'enfant'
}
const withAudience = (tags, audience) =>
  audience !== 'enfant' && audienceOf(tags) === 'enfant'
    ? [...tags, audience === 'adulte' ? 'Adulte' : 'Tout âge']
    : tags

export const FORMAT = 'hopla-module/1'

// The kinds of cards the editor writes; any other card of a module is kept
// as it is and only shown.
export const KINDS = [
  'saisie',
  'choix',
  'dictee',
  'retourner',
  'associer',
  'ordre',
  'classer',
  'tracer',
  'zones',
]

// The kinds made of labels, a letter to trace or a zone of a picture.
export const LABEL_KINDS = ['associer', 'ordre', 'classer', 'tracer', 'zones']

export const DICTATION_HINT = 'Écoute le mot et écris-le.'

const MAX_ID = 60

// OPEN_AFTER is how well a chapter must be known, in percent, for the next
// one to open, unless the family chose otherwise; 0 opens it from the start.
export const OPEN_AFTER = 80

export const OPEN_AFTER_CHOICES = [0, 50, 60, 70, 80, 90, 100]

// openAfterOf tells when a chapter of the editor opens: the first one always
// is open; the next ones by their own threshold, or OPEN_AFTER when they have
// none (a pack saved before the editor wrote it).
export const openAfterOf = (chapter, index) =>
  index === 0
    ? 0
    : Number.isInteger(chapter.ouvert_apres)
      ? chapter.ouvert_apres
      : OPEN_AFTER

const clean = text => String(text ?? '').trim()

const list = values => (values || []).map(clean).filter(Boolean)

// kindOf tells how the editor shows a card: one of KINDS, or "autre".
export const kindOf = card => {
  if (card.type === 'ecoute') {
    const senses = card.sens || []
    return senses.every(sense => LISTENING.includes(sense)) ? 'dictee' : 'autre'
  }
  return KINDS.includes(card.type) ? card.type : 'autre'
}

// editable tells whether a module document can be opened in the editor: a
// module of cards, not a pack nor a module of generated questions.
export const editable = doc =>
  !!doc &&
  doc.format === FORMAT &&
  !doc.modules?.length &&
  !doc.generateurs?.length

// unique gives base, or base-2, base-3… if it is taken.
const unique = (base, taken) => {
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  taken.add(id)
  return id
}

// moduleIdFor names a new pack after its name, apart from the catalogue's
// modules and those already installed.
export const moduleIdFor = (name, taken) => {
  const base = `famille-${slug(name).slice(0, MAX_ID) || 'paquet'}`
  return unique(base, new Set(taken))
}

// nextVersion raises the last number of a version, so the saved pack
// replaces the one installed.
export const nextVersion = version => {
  const parts = String(version || '').split('.')
  const last = Number(parts[parts.length - 1])
  if (parts.length < 2 || !Number.isInteger(last)) return '1.0.0'
  parts[parts.length - 1] = String(last + 1)
  return parts.join('.')
}

// fromDocument reads a module document into what the editor shows. What the
// editor does not show is kept in rest and written back as it was.
export const fromDocument = doc => {
  const {
    chapitres = [],
    fiches = [],
    format: _format,
    icone = '',
    id,
    matiere = '',
    niveaux = [],
    nom = '',
    public: audience = 'enfant',
    version = '1.0.0',
    ...rest
  } = doc
  return {
    id,
    version,
    name: nom,
    audience,
    tags: withAudience(niveaux, audience),
    subject: matiere,
    icon: icone,
    chapters: chapitres.map(chapter => ({
      ...chapter,
      cards: fiches.filter(card => card.chapitre === chapter.id),
    })),
    rest,
  }
}

// newChapter is a chapter added in the editor, opened once the one before is
// known at OPEN_AFTER.
export const newChapter = () => ({
  id: '',
  nom: '',
  ouvert_apres: OPEN_AFTER,
  cards: [],
})

// newPack is the editor's start for a pack written from nothing.
export const newPack = name => ({
  id: '',
  version: '1.0.0',
  name: name || '',
  audience: 'enfant',
  tags: [],
  subject: '',
  icon: '',
  chapters: [newChapter()],
  rest: {},
})

// The fields the editor writes; any other field of the card it replaces,
// such as its id or a field Hopla does not know, is kept.
const WRITTEN = [
  'type',
  'question',
  'reponse',
  'sens',
  'tolerance',
  'consigne',
  'explication',
  'image',
  'pieges',
  'pourquoi',
  'autres_reponses',
  'question_inverse',
  'question_toucher',
  'paires',
  'elements',
  'echangeables',
  'boites',
  'a_classer',
]

const TYPES = {
  dictee: 'ecoute',
  choix: 'choix',
  retourner: 'retourner',
  associer: 'associer',
  ordre: 'ordre',
  classer: 'classer',
  tracer: 'tracer',
  zones: 'zones',
}

// cardFrom writes a card of one of KINDS from the editor's fields. Without
// extras (a pasted list), the explanation and the instruction of the card
// it replaces are kept.
export const cardFrom = (
  kind,
  { answer, extras, labels, oneTypo, others, question, tolerance, traps, zone },
  base = {},
) => {
  const keep = Object.fromEntries(
    Object.entries(base).filter(([name]) => !WRITTEN.includes(name)),
  )
  const type = TYPES[kind] || 'saisie'
  const given = extras || {
    ...extrasOf({}),
    consigne: base.consigne || '',
    explication: base.explication || '',
    sens: type === 'ecoute' ? ['dictee'] : [],
  }
  // The instruction of a dictation is no instruction for another kind.
  const wanted =
    type !== 'ecoute' && clean(given.consigne) === DICTATION_HINT
      ? { ...given, consigne: '' }
      : given
  const q = clean(question)
  const wrong = list(traps)
  const options = optionsFor(type, wanted, wrong)
  const card = { ...keep, type, question: q }
  switch (type) {
    case 'associer':
    case 'ordre':
      Object.assign(card, labelsFor(type, labels || {}), options)
      break
    // A card to sort has no shared key: each label has its own.
    case 'classer':
      delete card.cle
      Object.assign(card, labelsFor(type, labels || {}), options)
      break
    case 'tracer':
      Object.assign(card, { reponse: clean(answer), ...options })
      break
    // A zone is asked by its id in the picture, and answered by its name.
    case 'zones':
      Object.assign(card, {
        image: clean(zone?.picture),
        question: clean(zone?.id),
        reponse: clean(answer),
        ...options,
      })
      break
    case 'ecoute': {
      // A dictation is answered by the word itself; heard and picked, or
      // typed as figures, it has its own answer, with its traps.
      const own = listensFor(options.sens)
      Object.assign(card, {
        reponse: own ? clean(answer) : q,
        ...(own && wrong.length && { pieges: wrong }),
        ...options,
        consigne: options.consigne || (own ? undefined : DICTATION_HINT),
        tolerance: tolerance || (oneTypo === false ? 'exacte' : 'une_faute'),
      })
      break
    }
    case 'choix':
      Object.assign(card, {
        reponse: clean(answer),
        ...(wrong.length && { pieges: wrong }),
        ...options,
      })
      break
    case 'retourner':
      Object.assign(card, { reponse: clean(answer), ...options })
      break
    default: {
      const checked = tolerance || (oneTypo ? 'une_faute' : 'accents')
      Object.assign(card, {
        reponse: clean(answer),
        ...options,
        ...(checked !== 'accents' && { tolerance: checked }),
      })
    }
  }
  // Other answers or spellings, such as « cette » for « cet ».
  if (typed(type, card.sens) && list(others).length) {
    card.autres_reponses = list(others)
  }
  return Object.fromEntries(
    Object.entries(card).filter(([, value]) => value !== undefined),
  )
}

// fieldsOf reads a card back into the editor's fields.
export const fieldsOf = card => {
  const listening = card.type === 'ecoute'
  return {
    question: card.question || '',
    // A dictation's answer is its word; only a word heard and picked has
    // one of its own.
    answer: listening && !listensFor(card.sens) ? '' : card.reponse || '',
    traps: card.pieges || [],
    others: card.autres_reponses || [],
    tolerance: toleranceOf(card),
    oneTypo: toleranceOf(card) === 'une_faute',
    extras: extrasOf(card),
  }
}

// cardDone tells whether a card has what it needs to be played.
export const cardDone = card => {
  if (!clean(card.question)) return false
  if (LABEL_KINDS.includes(card.type)) return !labelProblem(card)
  return (
    (card.type === 'ecoute' && !listensFor(card.sens)) || !!clean(card.reponse)
  )
}

const same = text => slug(text)

// readList turns pasted lines into cards. As words, each line is a word to
// write, maybe followed by the other spellings accepted (« cet ; cette »);
// as questions, each line is « question ; answer » (or separated by
// a tab, as copied from a spreadsheet), the next columns being the wrong
// answers of a card to choose or the other answers of a card to type.
// Lines already among cards, or twice in the list, are left out.
export const readList = (text, { as, kind, oneTypo }, cards = []) => {
  const seen = new Set(cards.map(card => same(card.question)))
  const out = []
  let skipped = 0
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    let card
    const cells = (line.includes('\t') ? line.split('\t') : line.split(';'))
      .map(clean)
      .filter(Boolean)
    if (as === 'words') {
      const [word, ...others] = cells
      if (!word) {
        skipped++
        continue
      }
      card = cardFrom('dictee', { question: word, others, oneTypo })
    } else {
      if (cells.length < 2) {
        skipped++
        continue
      }
      const [question, answer, ...more] = cells
      card = cardFrom(kind, {
        question,
        answer,
        traps: kind === 'choix' ? more : [],
        others: kind === 'saisie' ? more : [],
        oneTypo,
      })
    }
    const key = same(card.question)
    if (!key || seen.has(key)) {
      skipped++
      continue
    }
    seen.add(key)
    out.push(card)
  }
  return { cards: out, skipped }
}

// toDocument writes the editor's pack as a module document, ids given to the
// chapters and cards that have none.
export const toDocument = pack => {
  const chapterIds = new Set(pack.chapters.map(c => c.id).filter(Boolean))
  const cardIds = new Set(
    pack.chapters.flatMap(c => c.cards.map(card => card.id)).filter(Boolean),
  )
  const chapitres = []
  const fiches = []
  pack.chapters.forEach((chapter, index) => {
    const { cards, ...fields } = chapter
    const nom =
      clean(fields.nom) ||
      (pack.chapters.length === 1 && clean(pack.name)) ||
      `Chapitre ${index + 1}`
    const id =
      fields.id ||
      unique(slug(nom).slice(0, MAX_ID) || `chapitre-${index + 1}`, chapterIds)
    const { groupe, niveau, ...others } = fields
    chapitres.push({
      ...others,
      id,
      nom,
      ...(clean(niveau) && { niveau: clean(niveau) }),
      ...(clean(groupe) && { groupe: clean(groupe) }),
      ...(index > 0 && { ouvert_apres: openAfterOf(chapter, index) }),
    })
    for (const card of cards) {
      fiches.push({
        ...card,
        id:
          card.id ||
          unique(slug(card.question).slice(0, MAX_ID) || 'fiche', cardIds),
        chapitre: id,
      })
    }
  })
  const dictation = fiches.some(card => card.type === 'ecoute')
  return {
    format: FORMAT,
    id: pack.id,
    version: pack.version,
    nom: clean(pack.name),
    public: audienceOf(pack.tags),
    niveaux: [
      ...new Set(
        (pack.tags || []).map(tag => clean(tag).slice(0, 30)).filter(Boolean),
      ),
    ].slice(0, 8),
    ...(pack.subject && { matiere: pack.subject }),
    ...(pack.icon && { icone: pack.icon }),
    langue: 'fr',
    ...(dictation && { langue_apprise: 'fr' }),
    ...(audienceOf(pack.tags) === 'enfant' && { lecture_voix_haute: true }),
    ...pack.rest,
    chapitres,
    fiches,
  }
}
