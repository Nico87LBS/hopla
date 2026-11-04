// FSRS, the spaced repetition of Anki since 2023, as the server applies it
// (internal/learn/fsrs.go): each card keeps a stability, the days after
// which it is still recalled nine times out of ten, and a difficulty from 1
// to 10. An answer is graded 1 (again), 2 (hard), 3 (good) or 4 (easy). Days
// are whole: a card seen again the same day takes the short-term rule.
//
// The same numbers as ts-fsrs 5.4 (FSRS-6, its default parameters, no fuzz),
// rounded the same way, so that both ends agree; the shared cases are in
// internal/learn/testdata/fsrs.json.

export const W = Object.freeze([
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
  0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658,
  0.1542,
])

export const AGAIN = 1
export const HARD = 2
export const GOOD = 3
export const EASY = 4

const S_MIN = 0.001
const S_MAX = 36500

// round8 rounds as ts-fsrs does, to eight decimals.
const round8 = x => Math.round(x * 1e8) / 1e8
const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi)

const DECAY = -W[20]
const FACTOR = round8(Math.exp(Math.log(0.9) / DECAY) - 1)

// retrievability is the chance to recall a card of stability s after
// elapsed days.
export const retrievability = (elapsed, s) =>
  round8(Math.pow(1 + (FACTOR * elapsed) / s, DECAY))

export const initDifficulty = g => round8(W[4] - Math.exp((g - 1) * W[5]) + 1)

const nextDifficulty = (d, g) => {
  const delta = -W[6] * (g - 3)
  const next = d + round8((delta * (10 - d)) / 9)
  return clamp(round8(W[7] * initDifficulty(EASY) + (1 - W[7]) * next), 1, 10)
}

const recallStability = (d, s, r, g) =>
  round8(
    clamp(
      s *
        (1 +
          Math.exp(W[8]) *
            (11 - d) *
            Math.pow(s, -W[9]) *
            (Math.exp((1 - r) * W[10]) - 1) *
            (g === HARD ? W[15] : 1) *
            (g === EASY ? W[16] : 1)),
      S_MIN,
      S_MAX,
    ),
  )

const forgetStability = (d, s, r) =>
  round8(
    clamp(
      W[11] *
        Math.pow(d, -W[12]) *
        (Math.pow(s + 1, W[13]) - 1) *
        Math.exp((1 - r) * W[14]),
      S_MIN,
      S_MAX,
    ),
  )

const shortTermStability = (s, g) => {
  const sinc = Math.pow(s, -W[19]) * Math.exp(W[17] * (g - 3 + W[18]))
  return round8(clamp(s * (g >= HARD ? Math.max(sinc, 1) : sinc), S_MIN, S_MAX))
}

// nextState is a card's stability and difficulty after a grade, elapsed
// days after its last review; a card never seen has both at 0.
export const nextState = ({ difficulty: d, stability: s }, elapsed, g) => {
  if (!d && !s) {
    return {
      difficulty: clamp(initDifficulty(g), 1, 10),
      stability: Math.max(W[g - 1], 0.1),
    }
  }
  const r = retrievability(elapsed, s)
  let next
  if (elapsed === 0) next = shortTermStability(s, g)
  else if (g === AGAIN) {
    const floor = round8(s / Math.exp(W[17] * W[18]))
    next = clamp(floor, S_MIN, forgetStability(d, s, r))
  } else next = recallStability(d, s, r, g)
  return { difficulty: nextDifficulty(d, g), stability: next }
}

// interval is the days before a card of stability s comes back, for the
// share of cards to recall wanted (0.9 for nine in ten), within maxDays.
export const interval = (s, retention, maxDays) => {
  const modifier = round8((Math.pow(retention, 1 / DECAY) - 1) / FACTOR)
  return Math.min(Math.max(1, Math.round(s * modifier)), maxDays)
}
