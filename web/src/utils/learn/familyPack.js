// A pack the family writes in the editor, without a file: one module of
// chapters and simple cards (to type, to choose, dictation, card to turn).
// The editor reads and writes the module document (hopla-module/1), which
// the server checks on import like any other.

import { slug } from './generators.js'

export const FORMAT = 'hopla-module/1'

// The kinds of cards the editor writes; any other card of a module is kept
// as it is and only shown.
export const KINDS = ['saisie', 'choix', 'dictee', 'retourner']

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
    return senses.length === 1 && senses[0] === 'dictee' ? 'dictee' : 'autre'
  }
  if (card.image) return 'autre'
  return ['saisie', 'choix', 'retourner'].includes(card.type)
    ? card.type
    : 'autre'
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
    level: niveaux[0] || '',
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
  level: '',
  subject: '',
  icon: '',
  chapters: [newChapter()],
  rest: {},
})

// cardFrom writes a card of one of KINDS from the editor's fields. The id,
// the explanation and the instruction of the card it replaces are kept.
export const cardFrom = (
  kind,
  { answer, oneTypo, others, question, traps },
  base = {},
) => {
  const keep = {
    ...(base.id && { id: base.id }),
    ...(base.explication && { explication: base.explication }),
  }
  const q = clean(question)
  switch (kind) {
    case 'dictee':
      return {
        ...keep,
        type: 'ecoute',
        question: q,
        reponse: q,
        sens: ['dictee'],
        tolerance: oneTypo ? 'une_faute' : 'exacte',
        consigne: base.consigne || DICTATION_HINT,
        // Other spellings heard the same way, such as « cet » for « cette ».
        ...(list(others).length && { autres_reponses: list(others) }),
      }
    case 'choix':
      return {
        ...keep,
        type: 'choix',
        question: q,
        reponse: clean(answer),
        ...(list(traps).length && { pieges: list(traps) }),
      }
    case 'retourner':
      return { ...keep, type: 'retourner', question: q, reponse: clean(answer) }
    default:
      return {
        ...keep,
        type: 'saisie',
        question: q,
        reponse: clean(answer),
        ...(list(others).length && { autres_reponses: list(others) }),
        ...(oneTypo && { tolerance: 'une_faute' }),
      }
  }
}

// fieldsOf reads a card back into the editor's fields.
export const fieldsOf = card => ({
  question: card.question || '',
  answer: card.reponse || '',
  traps: card.pieges || [],
  others: card.autres_reponses || [],
  oneTypo:
    card.type === 'ecoute'
      ? card.tolerance !== 'exacte'
      : card.tolerance === 'une_faute',
})

// cardDone tells whether a card has what it needs to be played.
export const cardDone = card =>
  !!clean(card.question) && (card.type === 'ecoute' || !!clean(card.reponse))

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
    chapitres.push({
      ...fields,
      id,
      nom,
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
    public: pack.audience,
    niveaux: pack.level ? [pack.level] : [],
    ...(pack.subject && { matiere: pack.subject }),
    ...(pack.icon && { icone: pack.icon }),
    langue: 'fr',
    ...(dictation && { langue_apprise: 'fr' }),
    ...(pack.audience === 'enfant' && { lecture_voix_haute: true }),
    ...pack.rest,
    chapitres,
    fiches,
  }
}
