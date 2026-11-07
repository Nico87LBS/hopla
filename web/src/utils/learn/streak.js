import { BOOST_PERCENT, MIN_ANSWERS } from './engine.js'

// How many games in a row a person played well in a module, kept on this
// device: it speeds the next game up and offers the test of the next level.
const key = (userId, moduleId) => `hopla.learn.streak.${userId}.${moduleId}`

export const streakOf = (userId, moduleId) => {
  try {
    return Number(localStorage.getItem(key(userId, moduleId))) || 0
  } catch {
    return 0
  }
}

// recordGame counts a game in the streak: well played, one more; else back
// to nothing. A game too short to judge changes nothing.
export const recordGame = (userId, moduleId, correct, total) => {
  if (total < MIN_ANSWERS) return streakOf(userId, moduleId)
  const next =
    (correct * 100) / total >= BOOST_PERCENT
      ? streakOf(userId, moduleId) + 1
      : 0
  try {
    localStorage.setItem(key(userId, moduleId), String(next))
  } catch {
    // Nothing is kept: the next game starts as usual.
  }
  return next
}
