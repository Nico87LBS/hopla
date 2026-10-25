// The game engine, which runs on the device so a game also works offline: it
// reads a module document, tells which chapters are open, picks the
// questions of a game and checks the answers. Moving the cards and counting
// the stars follow the same rules as the server, which has the last word.

import { cardItems, generatorSource } from './generators.js'

export const DEFAULT_SETTINGS = {
  questions_par_partie: 10,
  nouvelles_par_partie: 3,
  seuil: 70,
  hops_par_etoile: 1,
  plafond_jour: 10,
}

// A chapter whose questions are drawn without end counts as known once this
// many of them are known, unless it sets its own objectif.
export const DEFAULT_GOAL = 20
export const MASTERED_BOX = 4
export const BOX_DAYS = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 }
// A game with fewer answers earns no stars.
export const MIN_ANSWERS = 5

export const withDefaults = settings => {
  const out = { ...DEFAULT_SETTINGS }
  for (const [name, value] of Object.entries(settings || {})) {
    if (value) out[name] = value
  }
  return out
}

// mulberry32 is a small seeded random generator, so a game can be replayed in
// the tests.
export const seededRandom = seed => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const shuffle = (list, rng) => {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// cardSource gathers the written cards of a chapter as one listed source.
const cardSource = (chapterId, cards, moduleId) => {
  const items = cards.flatMap(card => cardItems(card, moduleId, cards))
  const byKey = new Map(items.map(item => [item.key, item]))
  return {
    id: `fiches:${chapterId}`,
    chapter: chapterId,
    finite: true,
    list: () => items,
    draw: rng => items[Math.floor(rng() * items.length)] || null,
    fromKey: key => byKey.get(key) || null,
  }
}

// compile reads a module document into its chapters and their sources.
export const compile = doc => {
  const chapters = (doc.chapitres || []).map(c => ({
    id: c.id,
    name: c.nom,
    openAfter: c.ouvert_apres || 0,
    goal: c.objectif || DEFAULT_GOAL,
    sources: [],
  }))
  const byId = new Map(chapters.map(c => [c.id, c]))
  for (const gen of doc.generateurs || []) {
    const source = generatorSource(gen, doc.id)
    if (source && byId.has(gen.chapitre))
      byId.get(gen.chapitre).sources.push(source)
  }
  for (const chapter of chapters) {
    const cards = (doc.fiches || []).filter(
      card => card.chapitre === chapter.id,
    )
    if (cards.length)
      chapter.sources.push(cardSource(chapter.id, cards, doc.id))
  }
  return {
    id: doc.id,
    name: doc.nom,
    doc,
    chapters,
    prerequisites: doc.prerequis || [],
    settings: withDefaults(doc.reglages),
  }
}

// cardMap indexes a person's cards by their key.
export const cardMap = cards =>
  new Map((cards || []).map(card => [card.key, card]))

// itemForKey rebuilds the question of a card, from the chapters given.
export const itemForKey = (chapters, key) => {
  for (const chapter of chapters) {
    for (const source of chapter.sources) {
      const item = source.fromKey(key)
      if (item) return item
    }
  }
  return null
}

const known = card => card && card.box >= MASTERED_BOX

// weight is how far a card got: a question known counts whole, one on its
// way counts in part, so the bar moves from the first game.
const weight = card =>
  card ? Math.min(Math.max(card.box, 0), MASTERED_BOX) / MASTERED_BOX : 0

// chapterProgress tells how well a chapter is known: its questions, each by
// how far it got, over all of them, or over its goal when its questions
// never end.
export const chapterProgress = (chapter, cards) => {
  let mastered = 0
  let score = 0
  let seen = 0
  let total = 0
  for (const source of chapter.sources) {
    if (source.finite) {
      const items = source.list() || []
      total += items.length
      for (const item of items) {
        const card = cards.get(item.key)
        if (card) seen++
        if (known(card)) mastered++
        score += weight(card)
      }
      continue
    }
    const weights = []
    for (const card of cards.values()) {
      if (!source.fromKey(card.key)) continue
      seen++
      if (known(card)) mastered++
      weights.push(weight(card))
    }
    total += chapter.goal
    score += weights
      .sort((a, b) => b - a)
      .slice(0, chapter.goal)
      .reduce((sum, w) => sum + w, 0)
  }
  const percent = total ? Math.floor((score * 100) / total + 1e-9) : 0
  return { mastered, score, seen, total, percent }
}

// openChapters tells, chapter by chapter, how well it is known and whether it
// is open. The first one always is; the next opens when the one before is
// known well enough, by its own threshold or the one a parent set.
export const openChapters = (compiled, cards, unlockPercent) => {
  const out = []
  compiled.chapters.forEach((chapter, i) => {
    const progress = chapterProgress(chapter, cards)
    let open = true
    let needed = 0
    if (i > 0 && chapter.openAfter > 0) {
      const before = out[i - 1]
      needed = unlockPercent ?? chapter.openAfter
      open = before.open && before.progress.percent >= needed
    }
    out.push({ chapter, progress, open, needed })
  })
  return out
}

// moduleProgress is how well the whole module is known.
export const moduleProgress = (compiled, cards) => {
  let score = 0
  let total = 0
  for (const chapter of compiled.chapters) {
    const p = chapterProgress(chapter, cards)
    score += p.score
    total += p.total
  }
  return total ? Math.floor((score * 100) / total + 1e-9) : 0
}

// moduleLocked returns the first prerequisite not met yet, or null. A
// prerequisite on a module the person does not play is left aside.
export const moduleLocked = (compiled, compiledById, cards) => {
  for (const prereq of compiled.prerequisites) {
    const other = compiledById[prereq.module]
    if (!other) continue
    const needed = prereq.pourcent || 80
    const chapter = prereq.chapitre
      ? other.chapters.find(c => c.id === prereq.chapitre)
      : null
    const percent = chapter
      ? chapterProgress(chapter, cards).percent
      : moduleProgress(other, cards)
    if (percent < needed) {
      return { module: other, chapter, percent, needed }
    }
  }
  return null
}

const drawFrom = (chapter, rng) => {
  const sources = chapter.sources
  if (!sources.length) return null
  return sources[Math.floor(rng() * sources.length)].draw(rng)
}

const prepare = (item, rng) =>
  item.mode === 'choice' && !item.keepOrder
    ? { ...item, choices: shuffle(item.choices, rng) }
    : item

// pickQuestions makes a game: the cards due first, then a few new questions
// from the latest open chapter, then any questions of the open chapters.
export const pickQuestions = (compiled, cards, options = {}) => {
  const rng = options.rng || Math.random
  const settings = withDefaults({ ...compiled.settings, ...options.settings })
  const count = settings.questions_par_partie
  const newCount = settings.nouvelles_par_partie
  const day = options.day || '9999-12-31'
  const open = openChapters(compiled, cards, options.unlockPercent)
    .filter(c => c.open)
    .map(c => c.chapter)
  const picked = []
  const keys = new Set()
  const add = item => {
    if (!item || keys.has(item.key) || picked.length >= count) return false
    keys.add(item.key)
    picked.push(item)
    return true
  }

  const due = [...cards.values()]
    .filter(card => card.due && card.due <= day)
    .sort((a, b) => a.due.localeCompare(b.due) || a.box - b.box)
  for (const card of due) {
    if (picked.length >= count) break
    add(itemForKey(open, card.key))
  }

  // New questions, the latest chapter first.
  let added = 0
  for (const chapter of [...open].reverse()) {
    for (const source of chapter.sources) {
      if (added >= newCount) break
      if (source.finite) {
        const fresh = shuffle(
          (source.list() || []).filter(item => !cards.has(item.key)),
          rng,
        )
        for (const item of fresh) {
          if (added >= newCount) break
          if (add(item)) added++
        }
      } else {
        for (let tries = 0; tries < 50 && added < newCount; tries++) {
          const item = source.draw(rng)
          if (item && !cards.has(item.key) && add(item)) added++
        }
      }
    }
  }

  // Then fill, half from the latest chapter.
  for (let tries = 0; tries < count * 30 && picked.length < count; tries++) {
    if (!open.length) break
    const chapter =
      rng() < 0.5
        ? open[open.length - 1]
        : open[Math.floor(rng() * open.length)]
    add(drawFrom(chapter, rng))
  }
  return shuffle(picked, rng).map(item => prepare(item, rng))
}

// ── answers ──

export const normalize = text =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[\s\u00a0\u202f]+/g, ' ')
    .replace(/[.!?]+$/, '')
    .trim()

const lowerTrim = text =>
  String(text ?? '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[\s\u00a0\u202f]+/g, ' ')
    .replace(/[.!?]+$/, '')
    .trim()

// distance is the Levenshtein distance, the number of letters to change.
export const distance = (a, b) => {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const kept = row[j]
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      previous = kept
    }
  }
  return row[b.length]
}

const digits = text => String(text ?? '').replace(/[\s\u00a0\u202f]/g, '')

// checkAnswer tells whether an answer is right. A written card the player
// turned over is graded by herself: given is then 'oui', 'presque' or 'non'.
export const checkAnswer = (item, given) => {
  switch (item.mode) {
    case 'flip':
      return { correct: given === 'oui', almost: given === 'presque' }
    case 'choice':
      return { correct: given === item.answer, almost: false }
    case 'text': {
      const accepted = item.accepted?.length ? item.accepted : [item.answer]
      const tolerance = item.tolerance || 'accents'
      if (tolerance === 'exacte') {
        return {
          correct: accepted.some(a => lowerTrim(a) === lowerTrim(given)),
          almost: false,
        }
      }
      const answer = normalize(given)
      if (accepted.some(a => normalize(a) === answer)) {
        return { correct: true, almost: false }
      }
      if (tolerance === 'une_faute') {
        const close = accepted.some(a => distance(normalize(a), answer) <= 1)
        return { correct: close, almost: false, typo: close }
      }
      return { correct: false, almost: false }
    }
    default:
      return {
        correct: digits(given) !== '' && digits(given) === digits(item.answer),
        almost: false,
      }
  }
}

// ── the same rules as the server ──

export const addDays = (day, days) => {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

// review moves a card after an answer: up one box when right, back to the
// first when wrong; « presque » keeps it where it is.
export const review = (card, answer, day) => {
  const next = {
    box: 0,
    seen: 0,
    right: 0,
    wrong: 0,
    ...card,
    key: card.key || answer.key,
  }
  next.seen++
  if (answer.correct) {
    next.right++
    next.box = Math.min(5, Math.max(next.box, 0) + 1)
  } else if (answer.almost) {
    next.box = Math.max(next.box, 1)
  } else {
    next.wrong++
    next.box = 1
    next.lastAnswer = String(answer.given ?? '')
      .trim()
      .slice(0, 120)
  }
  next.due = addDays(day, BOX_DAYS[next.box])
  return next
}

export const stars = (correct, total, threshold) => {
  if (!total) return 0
  const percent = Math.floor((correct * 100) / total)
  if (correct === total) return 3
  if (percent >= 90) return 2
  if (percent >= threshold) return 1
  return 0
}

// totalLeft is what a player can still earn today, all modules together;
// Infinity without a total cap.
export const totalLeft = player =>
  player?.totalCap === null || player?.totalCap === undefined
    ? Infinity
    : Math.max(0, player.totalCap - (player.earnedToday || 0))

// expectedHops is what a game should earn, before the server confirms it:
// its stars within the module's cap of the day and what is left of the
// total.
export const expectedHops = (
  correct,
  total,
  settings,
  earnedToday,
  dailyCap,
  left = Infinity,
) => {
  if (total < MIN_ANSWERS) return 0
  const s = withDefaults(settings)
  const won = stars(correct, total, s.seuil) * s.hops_par_etoile
  return Math.max(0, Math.min(won, dailyCap - earnedToday, left))
}
