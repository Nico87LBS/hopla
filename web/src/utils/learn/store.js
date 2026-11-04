// What a device keeps to let a person play offline: the last player the
// server sent, moved by the games played since, and the games still to send.
// The server counts each game once by its clientId, so a game sent twice
// does no harm.

import { familyDay } from '../familyTime'
import { isDue, review, REVIEWS } from './engine'

const PLAYER_KEY = userId => `hopla.learn.player.${userId}`
const QUEUE_KEY = 'hopla.learn.queue'

const read = key => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private browsing or a full storage: the game still goes to the server
    // when it can.
  }
}

export const today = () => familyDay(new Date())

// loadPlayer returns the player kept on this device, its day turned to today
// so the day's hops start again.
export const loadPlayer = userId => {
  const player = read(PLAYER_KEY(userId))
  if (!player) return null
  if (player.day !== today()) {
    player.day = today()
    player.earnedToday = 0
    player.modules = player.modules.map(m => ({
      ...m,
      earnedToday: 0,
      playedToday: 0,
      newToday: 0,
    }))
    player.reviews = {
      ...player.reviews,
      bonusPaid: false,
      done: 0,
      earnedToday: 0,
    }
  }
  return player
}

export const savePlayer = player => write(PLAYER_KEY(player.userId), player)

export const queuedGames = () => read(QUEUE_KEY) || []

export const queuedFor = userId =>
  queuedGames().filter(game => game.userId === userId).length

const setQueue = games => write(QUEUE_KEY, games)

// mergeCards puts cards over the player's, by key.
const mergeCards = (cards, newer) => {
  const byKey = new Map((cards || []).map(card => [card.key, card]))
  for (const card of newer) byKey.set(card.key, card)
  return [...byKey.values()]
}

// playLocally moves the cards a game asked and counts its hops on the kept
// player, before the server answers: the day's new questions and reviews
// too. In the day's reviews (REVIEWS), each answer says its module; bonus
// is the part of the hops paid for reviewing everything.
export const playLocally = (player, game, hops, bonus = 0) => {
  const day = player.day || today()
  const byKey = new Map((player.cards || []).map(card => [card.key, card]))
  const settingsOf = id => player.modules?.find(m => m.id === id)?.settings
  const fresh = {}
  let reviewed = 0
  const counted = new Set()
  const moved = game.answers.map(answer => {
    const module = answer.module || game.module
    const before = byKey.get(answer.key)
    if (!counted.has(answer.key)) {
      counted.add(answer.key)
      if (!before) fresh[module] = (fresh[module] || 0) + 1
      else if (isDue(before, day)) reviewed++
    }
    const card = review(
      { ...(before || { key: answer.key }), module },
      answer,
      day,
      settingsOf(module),
    )
    // The same question twice in a game moves its card twice.
    byKey.set(card.key, card)
    return card
  })
  const reviews = player.reviews || {}
  const next = {
    ...player,
    earnedToday: (player.earnedToday || 0) + hops,
    cards: mergeCards(player.cards, moved),
    reviews: {
      ...reviews,
      done: (reviews.done || 0) + reviewed,
      ...(game.module === REVIEWS && {
        earnedToday: (reviews.earnedToday || 0) + hops - bonus,
        bonusPaid: reviews.bonusPaid || bonus > 0,
      }),
    },
    modules: player.modules.map(m => ({
      ...m,
      newToday: (m.newToday || 0) + (fresh[m.id] || 0),
      ...(m.id === game.module && {
        earnedToday: m.earnedToday + hops,
        playedToday: m.playedToday + 1,
      }),
    })),
  }
  savePlayer(next)
  return next
}

// applyResult takes the server's word on a game.
export const applyResult = (userId, game, result) => {
  const player = read(PLAYER_KEY(userId))
  if (!player) return
  const sameDay = player.day === result.session?.day
  const reviews = game.module === REVIEWS && sameDay
  savePlayer({
    ...player,
    ...(sameDay && { earnedToday: result.totalEarned }),
    ...(reviews && {
      reviews: {
        ...player.reviews,
        earnedToday: result.earnedToday,
        bonusPaid: player.reviews?.bonusPaid || result.session.bonus > 0,
      },
    }),
    cards: mergeCards(player.cards, result.cards || []),
    modules: player.modules.map(m =>
      m.id === game.module && sameDay
        ? { ...m, earnedToday: result.earnedToday }
        : m,
    ),
  })
}

export const queueGame = game => setQueue([...queuedGames(), game])

// flushQueue sends the games waiting, oldest first. A game the server refuses
// is dropped, as it would be refused again; when the server cannot be
// reached the rest wait for next time. Two calls at once share one run.
let flushing = null

export const flushQueue = send => {
  if (!flushing) {
    flushing = sendQueue(send).finally(() => {
      flushing = null
    })
  }
  return flushing
}

const sendQueue = async send => {
  const results = []
  const tried = new Set()
  for (let game = queuedGames()[0]; game; game = queuedGames()[0]) {
    // A storage that cannot be written would give the same game back.
    if (tried.has(game.clientId)) break
    tried.add(game.clientId)
    try {
      const result = await send(game)
      applyResult(game.userId, game, result)
      results.push({ game, result })
    } catch (err) {
      const refused =
        err?.status >= 400 && err.status < 500 && err.status !== 401
      if (!refused) break
    }
    setQueue(queuedGames().filter(g => g.clientId !== game.clientId))
  }
  return results
}

// ── reports ──

const REPORTS_KEY = 'hopla.learn.reports'

export const queuedReports = () => read(REPORTS_KEY) || []

export const queueReport = report =>
  write(REPORTS_KEY, [...queuedReports(), report])

// flushReports sends the reports kept while offline, like the games: one the
// server refuses is dropped, the rest wait when it cannot be reached.
export const flushReports = async send => {
  for (const report of queuedReports()) {
    try {
      await send(report)
    } catch (err) {
      const refused =
        err?.status >= 400 && err.status < 500 && err.status !== 401
      if (!refused) return
    }
    write(
      REPORTS_KEY,
      queuedReports().filter(r => r.clientId !== report.clientId),
    )
  }
}
