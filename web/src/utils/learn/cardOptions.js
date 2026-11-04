// The options of a written card beyond its question and answer: the
// instruction, the explanation, the drawing, the ways it is asked, how its
// spelling is checked and why each wrong answer is wrong. Both editors, the
// family's packs and the corrections of the catalogue, write them the same
// way, so nothing has to be written in the file by hand.

// How a typed answer is checked: accents and capitals left aside, one letter
// wrong allowed too, or accents counted.
export const TOLERANCES = ['accents', 'une_faute', 'exacte']

// toleranceOf is how a card is checked, a dictation allowing a small mistake
// unless it says otherwise.
export const toleranceOf = card =>
  card.tolerance || (card.type === 'ecoute' ? 'une_faute' : 'accents')

// The ways a written card is asked: question to answer, both ways, or only
// answer to question.
export const WAYS = ['direct', 'both', 'inverse']

export const wayOf = senses => {
  const list = senses || []
  const direct = !list.length || list.includes('direct')
  const inverse = list.includes('inverse')
  if (direct && inverse) return 'both'
  return inverse ? 'inverse' : 'direct'
}

// sensesOfWay writes a way as the card's senses; asked only as written, a
// card needs none.
export const sensesOfWay = way =>
  way === 'both'
    ? ['direct', 'inverse']
    : way === 'inverse'
      ? ['inverse']
      : undefined

// The ways a listening card is asked: write the word heard, pick its meaning
// once heard or read, pick the word from its meaning, type the figures of a
// message heard.
export const LISTENING = ['dictee', 'direct', 'lire', 'inverse', 'chiffres']

// listensFor tells whether a listening card asks for more than the word
// itself, so it needs an answer of its own (its meaning, the figures).
export const listensFor = senses =>
  (senses || []).some(sense => sense !== 'dictee')

// The ways a zone of a picture is asked: touched from its name, or named.
export const ZONE_WAYS = ['toucher', 'nommer']

// The options each type of card may hold.
export const OPTIONS = {
  saisie: ['consigne', 'explication', 'image', 'way'],
  choix: ['consigne', 'explication', 'image', 'way', 'pourquoi'],
  retourner: ['consigne', 'explication', 'image', 'way'],
  ecoute: ['consigne', 'explication', 'image', 'listening', 'question_inverse'],
  zones: ['consigne', 'explication', 'zoneWays', 'question_toucher'],
  ordre: ['consigne', 'explication', 'image'],
  associer: ['consigne', 'explication'],
  classer: ['consigne', 'explication'],
  tracer: ['consigne', 'explication'],
}

// typed tells whether the spelling of a card's answer is checked.
export const typed = (type, senses) =>
  type === 'saisie' || (type === 'ecoute' && (senses || []).includes('dictee'))

// extrasOf reads a card's options into the editors' fields.
export const extrasOf = card => ({
  consigne: card.consigne || '',
  explication: card.explication || '',
  image: card.image || '',
  // Without senses a listening card is heard and picked; a zone is both
  // touched and named; any other card asked as written.
  sens: card.sens?.length
    ? card.sens
    : card.type === 'ecoute'
      ? ['direct']
      : [],
  pourquoi: card.pourquoi || {},
  question_inverse: card.question_inverse || '',
  question_toucher: card.question_toucher || '',
})

const text = value => String(value ?? '').trim()

// whyOf keeps the reasons of the wrong answers still proposed.
export const whyOf = (pourquoi, traps) => {
  const out = {}
  for (const trap of traps || []) {
    const why = text(pourquoi?.[trap])
    if (why) out[trap] = why
  }
  return Object.keys(out).length ? out : undefined
}

// optionsFor writes the options of a card of a type from the editors'
// fields, each as the module would hold it: undefined when left empty.
// traps are the wrong answers the card proposes, for their reasons.
export const optionsFor = (type, extras, traps) => {
  const allowed = OPTIONS[type] || []
  const has = name => allowed.includes(name)
  const out = {}
  const put = (name, value) => {
    out[name] = value === '' ? undefined : value
  }
  if (has('consigne')) put('consigne', text(extras.consigne))
  if (has('explication')) put('explication', text(extras.explication))
  if (has('image')) put('image', text(extras.image))
  if (has('way')) put('sens', sensesOfWay(wayOf(extras.sens)))
  if (has('listening')) {
    const senses = LISTENING.filter(s => (extras.sens || []).includes(s))
    // Heard and picked is how a listening card is asked by default.
    const only = senses.length === 1 && senses[0] === 'direct'
    put('sens', only ? undefined : senses.length ? senses : ['dictee'])
  }
  if (has('zoneWays')) {
    const senses = ZONE_WAYS.filter(s => (extras.sens || []).includes(s))
    put('sens', senses.length && senses.length < 2 ? senses : undefined)
  }
  if (has('pourquoi')) put('pourquoi', whyOf(extras.pourquoi, traps))
  if (has('question_inverse')) {
    const shown = text(extras.image) && (extras.sens || []).includes('inverse')
    put('question_inverse', shown ? text(extras.question_inverse) : undefined)
  }
  if (has('question_toucher'))
    put('question_toucher', text(extras.question_toucher))
  return out
}

// hasOptions tells whether a card holds options, to show them unfolded.
export const hasOptions = extras =>
  !!(
    extras.consigne ||
    extras.explication ||
    extras.image ||
    Object.keys(extras.pourquoi || {}).length ||
    extras.question_inverse ||
    extras.question_toucher ||
    (extras.sens || []).some(s => s === 'inverse' || s === 'lire')
  )
