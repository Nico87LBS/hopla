// The game engine, which runs on the device so a game also works offline: it
// reads a module document, tells which chapters are open, picks the
// questions of a game and checks the answers. Moving the cards and counting
// the stars follow the same rules as the server, which has the last word.

import {
  AGAIN,
  EASY,
  GOOD,
  HARD,
  initDifficulty,
  interval,
  nextState,
  retrievability,
} from './fsrs.js'
import { cardItems, generatorSource, withName } from './generators.js'

export const DEFAULT_SETTINGS = {
  questions_par_partie: 10,
  nouvelles_par_partie: 3,
  seuil: 70,
  hops_par_etoile: 1,
  plafond_jour: 10,
  memorisation: 90,
  intervalle_max: 365,
  nouvelles_par_jour: 10,
}

// REVIEWS is the game of the day's reviews, the questions due in all the
// modules a person plays; no module takes this id. A person reviews at
// most REVIEW_MAX questions due in a day, and earns REVIEW_BONUS hops once
// a day for reviewing everything, unless a parent set otherwise.
export const REVIEWS = 'revisions'
export const REVIEW_MAX = 50
export const REVIEW_BONUS = 2
// TESTS is the game that prepares a test: questions of the chapters it
// covers, from several modules, that move no card.
export const TESTS = 'controle'
// A question is ready for a test when it is still recalled this often on the
// day of the test.
export const READY = 0.9

// A chapter whose questions are drawn without end counts as known once this
// many of them are known, unless it sets its own objectif.
export const DEFAULT_GOAL = 20
export const MASTERED_BOX = 4
// A question forgotten this many times is tough (ToughForgot on the server).
export const TOUGH_FORGOT = 5
export const isTough = card => (card?.forgot || 0) >= TOUGH_FORGOT
// BOX_DAYS is the shortest wait of each box: a card's box tells how far it
// got (boxOf), and is the stability of a card from before FSRS.
export const BOX_DAYS = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 }

export const boxOf = days => {
  let box = 1
  for (let b = 2; b <= 5; b++) if (days >= BOX_DAYS[b]) box = b
  return box
}
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
const cardSource = (chapterId, cards, doc) => {
  const lang = doc.langue_apprise || doc.langue
  const items = cards.flatMap(card => cardItems(card, doc.id, cards, lang))
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
// context.firstName is the player's first name, for the questions about it
// and the cards that write {prenom}.
export const compile = (doc, context = {}) => {
  const chapters = (doc.chapitres || []).map(c => ({
    id: c.id,
    name: c.nom,
    openAfter: c.ouvert_apres || 0,
    goal: c.objectif || DEFAULT_GOAL,
    sources: [],
  }))
  const byId = new Map(chapters.map(c => [c.id, c]))
  for (const gen of doc.generateurs || []) {
    const source = generatorSource(gen, doc.id, context)
    if (source && byId.has(gen.chapitre))
      byId.get(gen.chapitre).sources.push(source)
  }
  for (const chapter of chapters) {
    const cards = withName(
      (doc.fiches || []).filter(card => card.chapitre === chapter.id),
      context.firstName,
    )
    if (cards.length) chapter.sources.push(cardSource(chapter.id, cards, doc))
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
// A question is forgotten when it was known once (it lapsed) and a wrong
// answer sent it back below the known boxes since.
const forgot = card => !!card && card.lapses > 0 && card.box < MASTERED_BOX

// weight is how far a card got: a question known counts whole, one on its
// way counts in part, so the bar moves from the first game.
const weight = card =>
  card ? Math.min(Math.max(card.box, 0), MASTERED_BOX) / MASTERED_BOX : 0

// chapterProgress tells how well a chapter is known: its questions, each by
// how far it got, over all of them, or over its goal when its questions
// never end.
export const chapterProgress = (chapter, cards) => {
  let forgotten = 0
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
        if (forgot(card)) forgotten++
        score += weight(card)
      }
      continue
    }
    const weights = []
    for (const card of cards.values()) {
      if (!source.fromKey(card.key)) continue
      seen++
      if (known(card)) mastered++
      if (forgot(card)) forgotten++
      weights.push(weight(card))
    }
    total += chapter.goal
    score += weights
      .sort((a, b) => b - a)
      .slice(0, chapter.goal)
      .reduce((sum, w) => sum + w, 0)
  }
  const percent = total ? Math.floor((score * 100) / total + 1e-9) : 0
  return { forgotten, mastered, score, seen, total, percent }
}

// openChapters tells, chapter by chapter, how well it is known and whether it
// is open. The first one always is; the next opens when the one before is
// known well enough, by its own threshold or the one a parent set. A chapter
// a test passed (placed, its ids) is open, and so is the next. A parent can
// also open a chapter by hand (manual.forced), which opens only it, or close
// it (manual.shut), which wins over everything else.
export const openChapters = (
  compiled,
  cards,
  unlockPercent,
  placed = [],
  manual = {},
) => {
  const passed = new Set(placed)
  const forced = new Set(manual.forced || [])
  const shut = new Set(manual.shut || [])
  const out = []
  compiled.chapters.forEach((chapter, i) => {
    const progress = chapterProgress(chapter, cards)
    const byTest = passed.has(chapter.id)
    let open = true
    let needed = 0
    if (i > 0 && chapter.openAfter > 0 && !byTest) {
      const before = out[i - 1]
      needed = unlockPercent ?? chapter.openAfter
      open = before.placed || (before.open && before.progress.percent >= needed)
    }
    const byHand = forced.has(chapter.id)
    if (byHand) open = true
    if (shut.has(chapter.id)) open = false
    out.push({
      chapter,
      progress,
      open,
      needed,
      placed: byTest && !shut.has(chapter.id),
      by: shut.has(chapter.id) ? 'shut' : byHand ? 'forced' : null,
    })
  })
  return out
}

// CHAPTER_STATES lists the states of a chapter, from the one shown first.
// shut: closed by a parent; closed: not open yet; review: open with
// questions forgotten; known: the threshold is reached or a test passed;
// learning: begun; new: open, nothing seen.
export const DEFAULT_THRESHOLD = 80
export const chapterState = (entry, unlockPercent) => {
  if (entry.by === 'shut') return 'shut'
  if (!entry.open) return 'closed'
  if (entry.progress.forgotten > 0) return 'review'
  if (
    entry.placed ||
    entry.progress.percent >= (unlockPercent ?? DEFAULT_THRESHOLD)
  )
    return 'known'
  return entry.progress.seen > 0 ? 'learning' : 'new'
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

// prepare shapes a question for one game: its choices shuffled, the pairs
// shown drawn, the labels to order mixed, the object counted picked.
const prepare = (item, rng) => {
  if (item.count) {
    const { objects } = item.count
    item = {
      ...item,
      count: {
        ...item.count,
        object: objects[Math.floor(rng() * objects.length)],
      },
    }
  }
  if (item.mode === 'match') {
    const pairs = shuffle(item.pairs, rng).slice(0, item.shown)
    const text = side => side.text || side.image || ''
    return {
      ...item,
      pairs,
      answer: pairs.map(([l, r]) => `${text(l)} – ${text(r)}`).join(', '),
      left: shuffle(
        pairs.map((p, i) => i),
        rng,
      ),
      right: shuffle(
        pairs.map((p, i) => i),
        rng,
      ),
    }
  }
  if (item.mode === 'order') {
    let mixed = shuffle(item.elements, rng)
    for (let i = 0; i < 10 && mixed.join('|') === item.elements.join('|'); i++)
      mixed = shuffle(item.elements, rng)
    return { ...item, mixed }
  }
  if (item.mode !== 'choice' || item.keepOrder) return item
  const choices = item.trapPool?.length
    ? [
        item.answer,
        ...shuffle(item.trapPool, rng).slice(0, item.trapCount ?? 3),
      ]
    : item.choices
  return { ...item, choices: shuffle(choices, rng) }
}

// siblingOf names the piece of knowledge a question asks about: the two ways
// of a card (« chat » → « cat » and « cat » → « chat »), or 7 × 8 and
// 7 × ? = 56, are siblings, and one would give the other away.
export const siblingOf = item => item.sibling || item.key

// picker gathers the questions of a game, one per key and, while it can, one
// per sibling. Once a game cannot be filled otherwise, a sibling may come
// in, as far as possible from its twin.
const picker = count => {
  const picked = []
  const keys = new Set()
  const siblings = new Set()
  const add = (item, allowSibling = false) => {
    if (!item || keys.has(item.key) || picked.length >= count) return false
    const sibling = siblingOf(item)
    if (siblings.has(sibling) && !allowSibling) return false
    keys.add(item.key)
    siblings.add(sibling)
    picked.push(item)
    return true
  }
  return { add, picked }
}

// apart shuffles the questions of a game, then moves a question away from
// its sibling when they follow each other.
export const apart = (items, rng) => {
  const out = shuffle(items, rng)
  const twin = (k, item) =>
    k >= 0 && k < out.length && siblingOf(out[k]) === siblingOf(item)
  for (let i = 1; i < out.length; i++) {
    if (!twin(i - 1, out[i])) continue
    for (let j = 0; j < out.length; j++) {
      if (Math.abs(j - i) < 2) continue
      const here = out[j]
      const moved = out[i]
      const fitsHere = !twin(i - 1, here) && !twin(i + 1, here)
      const fitsThere =
        (j - 1 === i || !twin(j - 1, moved)) &&
        (j + 1 === i || !twin(j + 1, moved))
      if (fitsHere && fitsThere) {
        out[i] = here
        out[j] = moved
        break
      }
    }
  }
  return out
}

// A card is kept once its question was answered; isDue tells whether it is
// to be seen again on day.
const answered = card => !!card?.due
export const isDue = (card, day) => answered(card) && card.due <= day

const openOf = (compiled, cards, options = {}) =>
  openChapters(compiled, cards, options.unlockPercent, options.placed, options)
    .filter(c => c.open)
    .map(c => c.chapter)

// freshIn counts the new questions the chapters still have: Infinity when a
// source draws them without end.
const freshIn = (chapters, cards) => {
  let count = 0
  for (const chapter of chapters) {
    for (const source of chapter.sources) {
      if (!source.finite) return Infinity
      count += (source.list() || []).filter(item => !cards.has(item.key)).length
    }
  }
  return count
}

// moduleToday tells what a module has for a person on a day: the questions
// due (within dueLeft, what is left of the day's reviews), the new ones
// still allowed (within nouvelles_par_jour, newToday met already), and the
// questions due tomorrow. A module with neither is up to date: it comes
// back tomorrow, and only lets the person practise.
export const moduleToday = (compiled, cards, options = {}) => {
  const settings = withDefaults({ ...compiled.settings, ...options.settings })
  const day = options.day
  const open = openOf(compiled, cards, options)
  const next = addDays(day, 1)
  let due = 0
  let tomorrow = 0
  let seen = 0
  for (const card of cards.values()) {
    if (!answered(card) || !itemForKey(open, card.key)) continue
    seen++
    if (isDue(card, day)) due++
    else if (card.due === next) tomorrow++
  }
  due = Math.min(due, options.dueLeft ?? Infinity)
  const newLeft = Math.max(
    0,
    Math.min(
      settings.nouvelles_par_jour - (options.newToday || 0),
      freshIn(open, cards),
    ),
  )
  const upToDate = due === 0 && newLeft === 0
  return {
    due,
    newLeft,
    tomorrow,
    seen,
    upToDate,
    why: upToDate ? whyUpToDate(compiled, cards, open, options) : null,
  }
}

// whyUpToDate tells why a module with nothing to ask is up to date: the
// day's new questions are done ('daily'), the next chapter is still closed
// as the chapter being learnt is not known well enough ('chapter', with it
// and the percents), or the whole module has been seen ('all').
const whyUpToDate = (compiled, cards, open, options) => {
  if (freshIn(open, cards) > 0) return { kind: 'daily' }
  const chapters = openChapters(
    compiled,
    cards,
    options.unlockPercent,
    options.placed,
    options,
  )
  const closed = chapters.findIndex(c => !c.open)
  if (closed < 1) return { kind: 'all' }
  const before = chapters[closed - 1]
  return {
    kind: 'chapter',
    chapter: before.chapter.name,
    percent: before.progress.percent,
    needed: chapters[closed].needed,
  }
}

// newOrder tells in which order the open chapters give their new questions.
// A chapter that opens once the one before is known well enough comes
// first, the latest of them before the others: the person moves on. The
// chapters open from the start together, with no threshold between them,
// come in the order of the list, as they are shown.
export const newOrder = chapters => {
  const steps = []
  for (const chapter of chapters) {
    if (!steps.length || chapter.openAfter > 0) steps.push([])
    steps[steps.length - 1].push(chapter)
  }
  return steps.reverse().flat()
}

// pickQuestions makes a game: the cards due first (within options.dueLeft),
// then a few new questions from the latest open chapter (within
// options.newLeft, what the day still allows). A game with neither is not
// played: the module is up to date, and pickQuestions gives none. Otherwise
// the game is filled with the questions that come back soonest, reviewed
// ahead, then, in a module just begun, with more new ones. Two siblings
// never come in the same game, unless there are too few questions to fill
// it.
export const pickQuestions = (compiled, cards, options = {}) => {
  const rng = options.rng || Math.random
  const settings = withDefaults({ ...compiled.settings, ...options.settings })
  const count = settings.questions_par_partie
  const day = options.day || '9999-12-31'
  let newLeft = options.newLeft ?? Infinity
  const dueLeft = options.dueLeft ?? Infinity
  const open = openOf(compiled, cards, options)
  const { add, picked } = picker(count)

  const due = [...cards.values()]
    .filter(card => isDue(card, day))
    .sort((a, b) => a.due.localeCompare(b.due) || a.box - b.box)
  let reviewed = 0
  for (const card of due) {
    if (picked.length >= count || reviewed >= dueLeft) break
    if (add(itemForKey(open, card.key))) reviewed++
  }

  // New questions, the latest chapter first (newOrder); those the last game
  // asked last, so that playing again asks others.
  const recent = options.recent || new Set()
  const order = newOrder(open)
  const addNew = (limit, sibling = false) => {
    let added = 0
    for (const chapter of order) {
      for (const source of chapter.sources) {
        if (added >= limit) break
        if (source.finite) {
          const fresh = shuffle(
            (source.list() || []).filter(item => !cards.has(item.key)),
            rng,
          )
          for (const item of [
            ...fresh.filter(i => !recent.has(i.key)),
            ...fresh.filter(i => recent.has(i.key)),
          ]) {
            if (added >= limit) break
            if (add(item, sibling)) added++
          }
        } else {
          const tries = 50 + limit * 30
          for (let i = 0; i < tries && added < limit; i++) {
            const item = source.draw(rng)
            if (!item || cards.has(item.key)) continue
            if (i < tries / 2 && recent.has(item.key)) continue
            if (add(item, sibling)) added++
          }
        }
      }
    }
    newLeft -= added
  }
  addNew(Math.min(settings.nouvelles_par_partie, newLeft))
  if (!picked.length) return []

  // Then the questions that come back soonest, first those the last game
  // did not ask, so that playing again asks others; then new ones; last,
  // siblings.
  const ahead = [...cards.values()]
    .filter(card => answered(card) && card.due > day)
    .sort((a, b) => a.due.localeCompare(b.due) || a.box - b.box)
  for (const card of ahead) {
    if (!recent.has(card.key)) add(itemForKey(open, card.key))
  }
  for (const card of ahead) add(itemForKey(open, card.key))
  addNew(Math.min(count - picked.length, newLeft))
  for (const card of ahead) add(itemForKey(open, card.key), true)
  addNew(Math.min(count - picked.length, newLeft), true)
  return apart(picked, rng).map(item => prepare(item, rng))
}

// practiceQuestions makes a game of practice in a module up to date: the
// questions already seen, at random. It earns nothing and moves no card.
export const practiceQuestions = (compiled, cards, options = {}) => {
  const rng = options.rng || Math.random
  const settings = withDefaults({ ...compiled.settings, ...options.settings })
  const open = openOf(compiled, cards, options)
  const seen = shuffle(
    [...cards.values()]
      .filter(answered)
      .map(card => itemForKey(open, card.key))
      .filter(Boolean),
    rng,
  )
  const { add, picked } = picker(settings.questions_par_partie)
  for (const item of seen) add(item)
  for (const item of seen) add(item, true)
  return apart(picked, rng).map(item => prepare(item, rng))
}

// reviewsLeft is what is left of a person's reviews of the day.
export const reviewsLeft = player =>
  Math.max(
    0,
    (player?.reviews?.most || REVIEW_MAX) - (player?.reviews?.done || 0),
  )

// dueReviews lists the questions due in all the modules a person plays and
// can open, the latest first: each from the module that last asked it, or
// another that asks it too.
export const dueReviews = (player, compiledById, cards) => {
  const day = player.day
  const modules = (player.modules || []).filter(
    m =>
      compiledById[m.id] &&
      !moduleLocked(compiledById[m.id], compiledById, cards),
  )
  const opens = new Map()
  const openFor = m => {
    if (!opens.has(m.id))
      opens.set(
        m.id,
        openOf(compiledById[m.id], cards, {
          unlockPercent: m.unlockPercent ?? undefined,
          placed: m.placed,
          forced: m.forced,
          shut: m.shut,
        }),
      )
    return opens.get(m.id)
  }
  const out = []
  const due = [...cards.values()]
    .filter(card => isDue(card, day))
    .sort((a, b) => a.due.localeCompare(b.due) || a.box - b.box)
  for (const card of due) {
    const own = modules.find(m => m.id === card.module)
    for (const m of own ? [own, ...modules.filter(o => o !== own)] : modules) {
      const item = itemForKey(openFor(m), card.key)
      if (item) {
        out.push({ card, module: m.id, item })
        break
      }
    }
  }
  return out
}

// reviewQuestions makes a game of the day's reviews from dueReviews: each
// question says the module that asks it.
export const reviewQuestions = (due, count, rng = Math.random) => {
  const { add, picked } = picker(count)
  const items = due.map(d => ({ ...d.item, module: d.module }))
  for (const item of items) add(item)
  for (const item of items) add(item, true)
  return apart(picked, rng).map(item => prepare(item, rng))
}

// recallOn is the chance a card is still recalled on a day: 0 for a question
// never answered.
const recallOn = (card, day) => {
  if (!card?.due) return 0
  const stability =
    card.stability || BOX_DAYS[Math.min(5, Math.max(card.box, 1))]
  return retrievability(elapsedDays(card, day), stability)
}

// testItems lists the questions of the chapters a test covers, each with its
// module, and the share of them to count: a chapter whose questions never end
// counts its goal. Questions never seen come last.
const testItems = (test, byId, cards) => {
  const out = []
  let total = 0
  for (const { chapter, module } of test.chapters || []) {
    const found = byId[module]?.chapters.find(c => c.id === chapter)
    if (!found) continue
    for (const source of found.sources) {
      if (source.finite) {
        for (const item of source.list() || []) out.push({ item, module })
        total += (source.list() || []).length
        continue
      }
      for (const card of cards.values()) {
        const item = source.fromKey(card.key)
        if (item && card.due) out.push({ item, module })
      }
      total += found.goal
    }
  }
  return { items: out, total }
}

// testReadiness tells how ready a person is for a test: the share of its
// questions still recalled READY of the time on its day, and how many are
// not.
export const testReadiness = (test, byId, cards) => {
  const { items, total } = testItems(test, byId, cards)
  const ready = items.filter(
    ({ item }) => recallOn(cards.get(item.key), test.day) >= READY,
  ).length
  const left = Math.max(0, total - ready)
  return { percent: total ? Math.floor((ready * 100) / total) : 0, left }
}

// testQuestions makes a game that prepares a test: the questions of its
// chapters least likely to be recalled on its day first, even when they are
// not due yet, then those never seen. Each says its module.
export const testQuestions = (test, byId, cards, count, rng = Math.random) => {
  const { items } = testItems(test, byId, cards)
  const chance = ({ item }) => recallOn(cards.get(item.key), test.day)
  const seen = items
    .filter(i => chance(i) > 0)
    .sort((a, b) => chance(a) - chance(b))
  const fresh = shuffle(
    items.filter(i => chance(i) === 0),
    rng,
  )
  const { add, picked } = picker(count)
  const ordered = [...seen, ...fresh].map(({ item, module }) => ({
    ...item,
    module,
  }))
  for (const item of ordered) add(item)
  for (const item of ordered) add(item, true)
  return apart(picked, rng).map(item => prepare(item, rng))
}

// again shapes the questions missed in a game to be asked once more at its
// end: in another order, their choices mixed again.
export const again = (items, rng = Math.random) =>
  apart(items, rng).map(item => prepare(item, rng))

// chapterQuestions draws a few different questions of one chapter, shaped
// for a game, such as for a placement test.
export const chapterQuestions = (chapter, count, rng = Math.random) => {
  const { add, picked } = picker(count)
  for (const sibling of [false, true]) {
    for (let tries = 0; tries < count * 30 && picked.length < count; tries++) {
      add(drawFrom(chapter, rng), sibling)
    }
  }
  return picked.map(item => prepare(item, rng))
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
    // A tracing is graded by the device the same way: right, almost or not.
    case 'trace':
    case 'flip':
      return { correct: given === 'oui', almost: given === 'presque' }
    case 'setclock':
      return { correct: given === item.answer, almost: false }
    case 'choice':
    case 'sort':
      return { correct: given === item.answer, almost: false }
    // A zone touched is given by its id; its name is what is shown.
    case 'zone':
      return { correct: given === item.zone, almost: false }
    // Pairs are given as the mistakes made, none when all were matched
    // straight away.
    case 'match':
      return { correct: given === '', almost: false }
    // Some labels may swap, such as getting dressed and having breakfast.
    case 'order':
      return {
        correct: (item.accepted || [item.answer]).includes(given),
        almost: false,
      }
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

const daysBetween = (from, to) => {
  const at = day => {
    const [y, m, d] = day.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.max(0, Math.round((at(to) - at(from)) / 86400000))
}

// elapsedDays is the days since a card's last review, 0 for a new card.
const elapsedDays = (card, day) => {
  let last = card.lastReview
  if (!last && card.due && card.box > 0)
    last = addDays(card.due, -BOX_DAYS[card.box])
  return last ? daysBetween(last, day) : 0
}

// gradeOf is the FSRS grade of an answer: again when wrong, hard for
// « presque », good when right, unless the answer says hard or easy.
export const gradeOf = answer => {
  if (answer.correct) {
    return answer.grade === HARD || answer.grade === EASY ? answer.grade : GOOD
  }
  return answer.almost ? HARD : AGAIN
}

const round8 = x => Math.round(x * 1e8) / 1e8

// review moves a card after an answer, by FSRS (fsrs.js): its stability and
// difficulty, then the day it comes back and its box. A card forgotten comes
// back the next day; a card from before FSRS starts from its box. settings
// are the module's, for the share to recall and the longest wait.
export const review = (card, answer, day, settings) => {
  const s = withDefaults(settings)
  const next = {
    box: 0,
    seen: 0,
    right: 0,
    wrong: 0,
    stability: 0,
    difficulty: 0,
    lapses: 0,
    forgot: 0,
    ...card,
    key: card.key || answer.key,
  }
  const grade = gradeOf(answer)
  const elapsed = elapsedDays(next, day)
  if (!next.stability && next.seen > 0) {
    const box = Math.min(5, Math.max(next.box, 1))
    next.stability = BOX_DAYS[box]
    next.difficulty = Math.min(
      10,
      Math.max(1, round8(initDifficulty(GOOD) + (6 * next.wrong) / next.seen)),
    )
  }
  if (grade === AGAIN && next.box >= MASTERED_BOX) next.lapses++
  if (grade === AGAIN && next.seen > 0) next.forgot++
  Object.assign(next, nextState(next, elapsed, grade))
  next.seen++
  if (answer.correct) next.right++
  else if (grade === AGAIN) {
    next.wrong++
    next.lastAnswer = String(answer.given ?? '')
      .trim()
      .slice(0, 120)
  }
  const days =
    grade === AGAIN
      ? 1
      : interval(next.stability, s.memorisation / 100, s.intervalle_max)
  next.due = addDays(day, days)
  next.lastReview = day
  next.box = boxOf(days)
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
