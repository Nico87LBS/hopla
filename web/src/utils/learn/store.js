// What a device keeps to let a person play offline: the last player the
// server sent, moved by the games played since, and the games still to send.
// The server counts each game once by its clientId, so a game sent twice
// does no harm.

import { familyDay } from '../familyTime'
import { review } from './engine'

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
    player.modules = player.modules.map(m => ({
      ...m,
      earnedToday: 0,
      playedToday: 0,
    }))
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
// player, before the server answers.
export const playLocally = (player, game, hops) => {
  const day = player.day || today()
  const byKey = new Map((player.cards || []).map(card => [card.key, card]))
  const moved = game.answers.map(answer =>
    review(
      {
        ...(byKey.get(answer.key) || { key: answer.key }),
        module: game.module,
      },
      answer,
      day,
    ),
  )
  const next = {
    ...player,
    cards: mergeCards(player.cards, moved),
    modules: player.modules.map(m =>
      m.id === game.module
        ? {
            ...m,
            earnedToday: m.earnedToday + hops,
            playedToday: m.playedToday + 1,
          }
        : m,
    ),
  }
  savePlayer(next)
  return next
}

// applyResult takes the server's word on a game.
export const applyResult = (userId, game, result) => {
  const player = read(PLAYER_KEY(userId))
  if (!player) return
  savePlayer({
    ...player,
    cards: mergeCards(player.cards, result.cards || []),
    modules: player.modules.map(m =>
      m.id === game.module && player.day === result.session?.day
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
