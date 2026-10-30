// Draws the pictures of the learning games, in the style of the Hopla
// rabbits: soft colours, round shapes and a violet outline. Each lands in
// public/drawings/<id>.svg, kept offline with the app.
//
//   node scripts/drawings.mjs

import { mkdirSync, writeFileSync } from 'node:fs'

const INK = '#3E2F86'
const CREAM = '#FFF8EE'
const PINK = '#FFB3C5'
const W = 2.2

const out = new URL('../public/drawings/', import.meta.url)

// ── pieces ──

const line = (d, width = W) =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`
const shape = (d, fill) =>
  `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round" stroke-linecap="round"/>`
const flat = (d, fill, opacity = 1) =>
  `<path d="${d}" fill="${fill}"${opacity < 1 ? ` opacity="${opacity}"` : ''}/>`
const circle = (cx, cy, r, fill, outline = true) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${outline ? ` stroke="${INK}" stroke-width="${W}"` : ''}/>`
const oval = (cx, cy, rx, ry, fill, outline = true, turn = 0) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${outline ? ` stroke="${INK}" stroke-width="${W}"` : ''}${turn ? ` transform="rotate(${turn} ${cx} ${cy})"` : ''}/>`
const rect = (x, y, w, h, r, fill) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`

// eyes are two dots with a glint, the look of every Hopla creature.
const eyes = (x1, x2, y, r = 2.6) =>
  [x1, x2]
    .map(
      x =>
        `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 1.2}" fill="${INK}"/><circle cx="${x + r * 0.35}" cy="${y - r * 0.45}" r="${r * 0.38}" fill="#fff"/>`,
    )
    .join('')
const eye = (x, y, r = 2.6) =>
  eyes(x, x, y, r).slice(0, eyes(x, x, y, r).length / 2)
const cheeks = (x1, x2, y, r = 3.4) =>
  oval(x1, y, r, r * 0.6, PINK, false) + oval(x2, y, r, r * 0.6, PINK, false)
const smile = (cx, cy, w = 4) =>
  line(`M${cx - w} ${cy} Q${cx} ${cy + w * 0.9} ${cx + w} ${cy}`, 1.8)

// A rabbit head, the family's face, with what makes each one.
const rabbit = ({ ears = true, fur = CREAM, size = 1, y = 0 } = {}) => {
  const s = size
  const at = (x, yy) => `${50 + (x - 50) * s} ${y + 50 + (yy - 50) * s}`
  const earsSvg = ears
    ? shape(
        `M${at(38, 40)} C${at(30, 26)} ${at(30, 10)} ${at(37, 9)} C${at(44, 9)} ${at(46, 26)} ${at(45, 38)}Z`,
        fur,
      ) +
      flat(
        `M${at(39, 34)} C${at(35, 25)} ${at(35, 15)} ${at(37.5, 14)} C${at(41, 15)} ${at(42, 26)} ${at(42, 34)}Z`,
        PINK,
      ) +
      shape(
        `M${at(55, 38)} C${at(56, 26)} ${at(58, 9)} ${at(65, 9)} C${at(72, 10)} ${at(70, 26)} ${at(62, 40)}Z`,
        fur,
      ) +
      flat(
        `M${at(58, 34)} C${at(58, 26)} ${at(60, 15)} ${at(63, 14)} C${at(66, 15)} ${at(65, 25)} ${at(61, 34)}Z`,
        PINK,
      )
    : ''
  const [hx, hy] = at(50, 54).split(' ').map(Number)
  return (
    earsSvg +
    oval(hx, hy, 22 * s, 19 * s, fur) +
    eyes(50 - 8 * s, 50 + 8 * s, hy - 2 * s, 2.6 * s) +
    cheeks(50 - 13 * s, 50 + 13 * s, hy + 5 * s, 3.4 * s) +
    flat(
      `M${50 - 2.4 * s} ${hy + 3 * s} Q50 ${hy + 2 * s} ${50 + 2.4 * s} ${hy + 3 * s} Q50 ${hy + 6 * s} ${50 - 2.4 * s} ${hy + 3 * s}Z`,
      '#F27B98',
    ) +
    smile(50, hy + 7 * s, 3.2 * s)
  )
}

// ── the pictures ──

const COLOURS = {
  red: '#E5484D',
  blue: '#3B82F6',
  green: '#30A46C',
  yellow: '#FFD23F',
  orange: '#F97316',
  pink: '#F472B6',
  purple: '#8E4EC6',
  black: '#2B2B33',
  white: '#FFFFFF',
  brown: '#8D5A3B',
}

const splash = fill =>
  shape(
    'M50 18 C58 18 60 26 66 26 C74 25 80 30 78 38 C76 45 84 48 82 56 C80 64 72 64 70 70 C68 78 60 84 52 80 C45 77 40 84 32 80 C24 76 26 68 22 63 C16 57 18 48 24 45 C29 42 24 33 30 28 C36 23 42 18 50 18Z',
    fill,
  ) +
  shape(
    'M80 72 C84 72 86 75 85 78 C84 81 80 81 79 78 C78 75 78 72 80 72Z',
    fill,
  ) +
  shape(
    'M18 30 C21 29 23 31 22 34 C21 36 18 36 17 34 C16 32 16 30 18 30Z',
    fill,
  ) +
  flat('M40 34 C44 30 52 30 54 34 C50 33 44 34 40 38Z', '#fff', 0.5)

// A number is its digit over as many counters, as on a ten frame.
const number = n => {
  const counters = []
  for (let i = 0; i < n; i++) {
    const row = i < 5 ? 0 : 1
    const inRow = row ? n - 5 : Math.min(n, 5)
    const col = i % 5
    counters.push(
      circle(50 + (col - (inRow - 1) / 2) * 12, 68 + row * 12, 4.6, '#F97316'),
    )
  }
  return (
    `<text x="50" y="52" text-anchor="middle" font-family="Fredoka, 'Arial Rounded MT Bold', Arial, sans-serif" font-weight="700" font-size="40" fill="${INK}">${n}</text>` +
    counters.join('')
  )
}

const DRAWINGS = {
  // animals
  cat:
    shape('M28 40 L30 18 L46 32Z', '#F6B26B') +
    shape('M72 40 L70 18 L54 32Z', '#F6B26B') +
    flat('M33 33 L33 25 L41 31Z', PINK) +
    flat('M67 33 L67 25 L59 31Z', PINK) +
    oval(50, 52, 26, 22, '#F6B26B') +
    line('M44 33 l2 6 M50 31 v7 M56 33 l-2 6', 1.6) +
    eyes(41, 59, 50) +
    cheeks(34, 66, 58) +
    flat('M47 56 h6 l-3 3.5Z', '#F27B98') +
    line('M50 59.5 q-3 3 -6 1 M50 59.5 q3 3 6 1', 1.6) +
    line('M30 56 h-10 M31 61 l-9 3 M70 56 h10 M69 61 l9 3', 1.4),
  dog:
    oval(50, 52, 24, 22, '#E2B57C') +
    shape('M28 38 C18 40 16 58 22 66 C27 70 31 62 31 52Z', '#8D5A3B') +
    shape('M72 38 C82 40 84 58 78 66 C73 70 69 62 69 52Z', '#8D5A3B') +
    oval(50, 62, 12, 9, CREAM) +
    eyes(41, 59, 47) +
    oval(50, 57, 4.6, 3.4, INK, false) +
    line('M50 60.5 v3 M50 63.5 q-4 3 -7 0 M50 63.5 q4 3 7 0', 1.6) +
    shape('M47 66 q3 7 6 0Z', '#F27B98'),
  rabbit: rabbit({ y: 6 }),
  bird:
    oval(48, 54, 24, 20, '#60A5FA') +
    shape('M40 56 C48 50 60 52 62 62 C54 66 44 64 40 56Z', '#3B82F6') +
    shape('M71 48 L82 51 L71 55Z', '#FBBF24') +
    eye(62, 46, 2.4) +
    line('M44 74 v8 l-3 2 M44 82 l3 2 M54 74 v8 l-3 2 M54 82 l3 2', 1.8) +
    line('M26 44 q-6 -6 -2 -12 M30 40 q-2 -8 4 -10', 1.8),
  fish:
    shape(
      'M24 50 C32 34 58 30 72 44 C76 48 76 52 72 56 C58 70 32 66 24 50Z',
      '#FB923C',
    ) +
    shape('M72 50 L88 38 C86 46 86 54 88 62Z', '#F97316') +
    shape('M44 38 C48 30 56 30 60 36Z', '#F97316') +
    line('M52 42 q4 8 0 16 M44 44 q3 6 0 12', 1.6) +
    eye(32, 48, 2.6) +
    smile(30, 55, 2.6) +
    circle(16, 40, 2.4, '#BFE3FF') +
    circle(12, 32, 1.6, '#BFE3FF'),
  horse:
    shape('M36 26 L40 14 L46 24Z', '#B9764A') +
    shape('M64 26 L60 14 L54 24Z', '#B9764A') +
    shape('M34 30 C34 22 66 22 66 30 L64 66 C64 78 36 78 36 66Z', '#B9764A') +
    shape(
      'M42 20 C46 16 54 16 58 20 C56 26 52 30 50 36 C48 30 44 26 42 20Z',
      '#5B3A29',
    ) +
    oval(50, 68, 13, 9, '#E8C3A0') +
    eyes(42, 58, 42) +
    oval(45, 68, 1.8, 2.4, INK, false) +
    oval(55, 68, 1.8, 2.4, INK, false) +
    smile(50, 73, 3),
  cow:
    shape('M30 34 C22 30 14 34 16 38 C20 40 26 40 30 40Z', '#fff') +
    shape('M70 34 C78 30 86 34 84 38 C80 40 74 40 70 40Z', '#fff') +
    shape('M36 28 C34 22 36 16 40 16 C40 20 40 24 42 27Z', '#F5E6C8') +
    shape('M64 28 C66 22 64 16 60 16 C60 20 60 24 58 27Z', '#F5E6C8') +
    oval(50, 48, 22, 22, '#fff') +
    flat('M32 38 C36 32 44 34 42 42 C38 46 32 44 32 38Z', INK) +
    flat('M60 30 C66 30 70 36 66 40 C62 40 58 36 60 30Z', INK) +
    eyes(42, 58, 46) +
    oval(50, 66, 16, 11, '#FFB3C5') +
    oval(44, 65, 2, 3, '#E0607E', false) +
    oval(56, 65, 2, 3, '#E0607E', false) +
    smile(50, 71, 3),
  pig:
    shape('M30 34 L28 20 L42 28Z', '#F9A8C0') +
    shape('M70 34 L72 20 L58 28Z', '#F9A8C0') +
    oval(50, 52, 26, 23, '#FBC4D4') +
    eyes(40, 60, 46) +
    oval(50, 60, 10, 7, '#F9A8C0') +
    oval(46, 60, 1.8, 2.8, '#C2416A', false) +
    oval(54, 60, 1.8, 2.8, '#C2416A', false) +
    smile(50, 70, 3.4) +
    cheeks(32, 68, 58),
  duck:
    shape(
      'M26 60 C26 48 40 44 52 50 C56 40 52 26 62 22 C72 20 78 30 74 38 C72 44 68 46 68 52 C78 54 82 62 76 70 C66 80 34 80 26 60Z',
      '#FFD23F',
    ) +
    shape('M74 32 L88 34 L76 40Z', '#F97316') +
    eye(66, 30, 2.4) +
    line('M40 60 q8 6 18 2', 1.8) +
    shape('M44 78 l-4 8 h10Z M58 78 l-2 8 h10Z', '#F97316'),
  mouse:
    circle(30, 34, 13, '#C9C9D6') +
    circle(70, 34, 13, '#C9C9D6') +
    circle(30, 34, 7, PINK, false) +
    circle(70, 34, 7, PINK, false) +
    shape(
      'M28 50 C28 36 72 36 72 50 C72 62 60 74 50 76 C40 74 28 62 28 50Z',
      '#D9D9E3',
    ) +
    eyes(42, 58, 50) +
    circle(50, 66, 3.2, '#F27B98') +
    line('M44 66 h-16 M45 70 l-14 4 M56 66 h16 M55 70 l14 4', 1.3),
  sheep:
    line('M38 64 v16 M48 66 v16 M60 66 v16 M70 62 v16', 3.4) +
    shape(
      'M36 40 C32 32 40 26 48 30 C52 22 64 22 66 30 C74 26 82 32 80 40 C88 42 88 54 80 56 C84 64 76 70 68 66 C64 74 52 74 48 68 C42 74 32 70 34 62 C26 60 26 48 34 46 C32 44 33 42 36 40Z',
      '#fff',
    ) +
    oval(30, 48, 10, 12, '#4B4458') +
    circle(26, 46, 1.6, '#fff', false) +
    circle(33, 46, 1.6, '#fff', false) +
    shape('M22 40 C16 38 14 44 18 46Z', '#4B4458') +
    shape('M38 40 C44 38 46 44 42 46Z', '#4B4458'),
  frog:
    circle(34, 34, 11, '#4ADE80') +
    circle(66, 34, 11, '#4ADE80') +
    oval(50, 56, 30, 22, '#4ADE80') +
    circle(34, 34, 6, '#fff', false) +
    circle(66, 34, 6, '#fff', false) +
    eyes(34, 66, 35, 3) +
    line('M30 58 Q50 76 70 58', 2.2) +
    cheeks(30, 70, 62) +
    oval(46, 52, 1.2, 1.2, INK, false) +
    oval(54, 52, 1.2, 1.2, INK, false),
  lion:
    shape(
      'M50 14 C56 20 62 14 66 22 C74 20 76 30 82 34 C80 42 86 48 80 56 C84 64 76 70 74 76 C66 78 64 86 56 84 C50 88 44 84 40 86 C34 82 28 82 26 76 C18 72 20 64 16 58 C14 50 20 46 18 38 C22 32 24 24 32 24 C36 16 44 18 50 14Z',
      '#F59E0B',
    ) +
    oval(50, 52, 22, 21, '#FCD34D') +
    circle(34, 36, 5, '#FCD34D') +
    circle(66, 36, 5, '#FCD34D') +
    eyes(42, 58, 48) +
    flat('M46 56 h8 l-4 4Z', '#8D5A3B') +
    line('M50 60 q-4 4 -8 1 M50 60 q4 4 8 1', 1.6) +
    cheeks(34, 66, 58),
  elephant:
    shape('M30 34 C14 28 8 52 18 62 C24 68 32 60 34 54Z', '#A7AABE') +
    shape('M70 34 C86 28 92 52 82 62 C76 68 68 60 66 54Z', '#A7AABE') +
    flat('M28 40 C20 38 16 50 22 56 C26 58 30 54 31 50Z', PINK, 0.7) +
    flat('M72 40 C80 38 84 50 78 56 C74 58 70 54 69 50Z', PINK, 0.7) +
    oval(50, 46, 20, 18, '#BFC2D4') +
    shape(
      'M44 54 C44 66 42 76 46 84 C48 88 54 86 54 82 C54 76 56 66 56 54Z',
      '#BFC2D4',
    ) +
    line('M47 70 h6 M47 76 h6', 1.4) +
    eyes(42, 58, 44) +
    cheeks(36, 64, 52),
  bear:
    circle(30, 30, 10, '#A0673F') +
    circle(70, 30, 10, '#A0673F') +
    circle(30, 30, 5, '#D9A47A', false) +
    circle(70, 30, 5, '#D9A47A', false) +
    oval(50, 52, 26, 24, '#A0673F') +
    oval(50, 62, 12, 9, '#E2B892') +
    eyes(40, 60, 46) +
    oval(50, 58, 4.4, 3.2, INK, false) +
    line('M50 61 v3 M50 64 q-4 3 -7 0 M50 64 q4 3 7 0', 1.6),
  snake:
    shape(
      'M20 76 C10 66 22 56 36 60 C52 64 62 58 56 48 C50 38 32 44 30 34 C28 22 44 16 60 18 C72 20 80 26 76 32 C70 28 60 26 50 28 C42 30 42 34 50 36 C66 40 78 50 70 64 C62 78 40 72 30 72 C26 72 26 76 30 78Z',
      '#4ADE80',
    ) +
    eye(70, 25, 2) +
    line('M78 30 l6 2 l2 -2 M84 32 l2 2', 1.4) +
    line('M28 62 l4 4 M44 63 l3 4 M58 50 l-4 3 M38 36 l4 -3', 1.4),

  // family: rabbits, each with what tells them apart
  mum:
    shape('M24 92 C24 76 34 70 50 70 C66 70 76 76 76 92Z', '#F472B6') +
    rabbit({ y: -6, size: 0.9 }) +
    shape('M33 28 l-6 -5 v10Z M33 28 l6 -5 v10Z', '#E5484D') +
    circle(33, 28, 2.4, '#E5484D') +
    line('M40 72 Q50 80 60 72', 1.6) +
    circle(50, 79, 2.6, '#FFD23F'),
  dad:
    shape('M24 92 C24 76 34 70 50 70 C66 70 76 76 76 92Z', '#3B82F6') +
    shape('M50 72 l-4 4 l4 14 l4 -14Z', '#E5484D') +
    rabbit({ y: -6, size: 0.9 }) +
    shape(
      'M38 56 C42 52 48 54 50 56 C52 54 58 52 62 56 C58 58 54 58 50 57 C46 58 42 58 38 56Z',
      '#8D5A3B',
    ),
  baby:
    shape('M22 92 C22 72 36 66 50 66 C64 66 78 72 78 92Z', '#BFE3FF') +
    line('M36 74 q14 8 28 0', 1.6) +
    rabbit({ y: 4, size: 0.72 }) +
    circle(50, 60, 4.2, '#FDE68A') +
    rect(46, 57.5, 8, 3, 1.5, '#F59E0B') +
    line('M50 28 q-3 -4 0 -6', 1.6),
  grandma:
    shape('M24 92 C24 76 34 70 50 70 C66 70 76 76 76 92Z', '#8E4EC6') +
    rabbit({ y: -6, size: 0.9 }) +
    circle(50, 32, 7, '#D4D4DE') +
    circle(42, 44, 5.4, 'none') +
    circle(58, 44, 5.4, 'none') +
    line('M47.4 44 h5.2', 1.8) +
    line('M40 74 l10 6 l10 -6', 1.6),
  grandpa:
    shape('M24 92 C24 76 34 70 50 70 C66 70 76 76 76 92Z', '#30A46C') +
    rabbit({ y: -6, size: 0.9, ears: true }) +
    shape('M28 34 C30 22 70 22 72 34 C66 32 34 32 28 34Z', '#6B7280') +
    circle(42, 44, 5.4, 'none') +
    circle(58, 44, 5.4, 'none') +
    line('M47.4 44 h5.2', 1.8) +
    shape(
      'M38 56 C42 52 48 54 50 56 C52 54 58 52 62 56 C58 60 54 60 50 58 C46 60 42 60 38 56Z',
      '#E5E7EB',
    ),
  sister:
    shape('M30 92 L36 74 C40 70 60 70 64 74 L70 92Z', '#FB923C') +
    rabbit({ y: 2, size: 0.78 }) +
    shape('M26 50 C18 52 18 62 24 64 C28 60 28 56 30 54Z', '#C08457') +
    shape('M74 50 C82 52 82 62 76 64 C72 60 72 56 70 54Z', '#C08457') +
    circle(29, 51, 2.6, '#E5484D') +
    circle(71, 51, 2.6, '#E5484D'),
  brother:
    shape('M30 92 L34 74 C40 70 60 70 66 74 L70 92Z', '#30A46C') +
    rabbit({ y: 2, size: 0.78, ears: true }) +
    shape('M33 40 C34 30 66 30 67 40Z', '#3B82F6') +
    shape('M60 38 C68 37 76 38 78 41 C72 42 66 41 60 40Z', '#3B82F6'),

  // body
  head:
    shape(
      'M28 44 C28 22 72 22 72 44 C74 66 64 80 50 80 C36 80 26 66 28 44Z',
      '#F8D5B8',
    ) +
    shape(
      'M28 44 C26 24 40 16 52 18 C64 18 76 26 72 44 C66 36 58 30 50 32 C42 30 34 36 28 44Z',
      '#8D5A3B',
    ) +
    eyes(41, 59, 52) +
    cheeks(35, 65, 62) +
    smile(50, 66, 5),
  eye:
    shape('M14 50 C26 30 74 30 86 50 C74 70 26 70 14 50Z', '#fff') +
    circle(50, 50, 13, '#3B82F6') +
    circle(50, 50, 6.4, INK, false) +
    circle(54, 46, 2.6, '#fff', false) +
    line('M24 38 l-4 -6 M36 32 l-2 -7 M50 30 v-7 M64 32 l2 -7 M76 38 l4 -6', 2),
  nose:
    shape(
      'M50 16 C48 30 42 42 34 52 C26 60 26 72 36 74 C40 75 44 72 46 70 C48 72 52 72 54 70 C56 72 60 75 64 74 C74 72 74 60 66 52 C58 42 52 30 50 16Z',
      '#F8D5B8',
    ) +
    oval(40, 66, 4, 2.6, '#B86B4B', false, -20) +
    oval(60, 66, 4, 2.6, '#B86B4B', false, 20) +
    flat('M50 24 C50 34 48 44 46 50 C50 46 52 36 50 24Z', '#fff', 0.7),
  mouth:
    shape(
      'M18 46 C28 40 40 42 50 46 C60 42 72 40 82 46 C74 64 26 64 18 46Z',
      '#E5484D',
    ) +
    shape('M24 48 C40 52 60 52 76 48 C70 56 30 56 24 48Z', '#fff') +
    line('M18 46 C40 50 60 50 82 46', 1.6),
  ear:
    shape(
      'M38 22 C58 12 78 28 72 50 C68 64 58 64 56 74 C54 84 44 88 38 80 C34 74 40 70 40 64 C40 52 26 34 38 22Z',
      '#F8D5B8',
    ) +
    line(
      'M44 30 C58 26 66 38 62 48 C58 56 50 52 52 44 C54 38 48 36 46 40',
      1.8,
    ),
  hand: shape(
    'M34 86 C30 72 26 64 22 56 C20 50 26 48 30 52 L36 60 L34 30 C34 24 42 24 42 30 L43 48 L44 20 C44 14 52 14 52 20 L52 48 L54 24 C54 18 62 18 62 24 L61 50 L64 34 C64 28 72 28 71 34 L68 64 C66 76 62 84 60 86Z',
    '#F8D5B8',
  ),
  foot:
    shape(
      'M34 40 C34 30 44 26 54 28 C66 30 70 40 68 54 C66 66 66 76 58 84 C50 90 38 88 36 78 C34 70 40 64 38 56 C36 50 34 46 34 40Z',
      '#F8D5B8',
    ) +
    oval(36, 24, 6, 7, '#F8D5B8') +
    oval(47, 18, 4.4, 5.4, '#F8D5B8') +
    oval(56, 18, 3.8, 4.6, '#F8D5B8') +
    oval(64, 22, 3.4, 4, '#F8D5B8') +
    oval(70, 28, 3, 3.6, '#F8D5B8'),

  // food
  apple:
    shape(
      'M50 32 C40 22 20 26 20 50 C20 72 36 86 50 80 C64 86 80 72 80 50 C80 26 60 22 50 32Z',
      '#E5484D',
    ) +
    line('M50 32 C50 24 52 18 56 14', 2.6) +
    shape('M54 22 C60 14 70 14 74 18 C68 24 60 26 54 22Z', '#30A46C') +
    flat('M30 44 C30 36 36 32 40 34 C36 38 34 42 34 48Z', '#fff', 0.55),
  banana:
    shape(
      'M22 30 C20 56 38 78 66 78 C76 78 82 74 82 70 C70 72 50 68 38 52 C32 44 30 36 30 28Z',
      '#FFD23F',
    ) +
    shape('M22 30 L22 22 L30 22 L30 28Z', '#8D5A3B') +
    line('M34 40 C38 56 50 66 68 72', 1.4),
  orange:
    circle(50, 54, 28, '#F97316') +
    shape('M50 26 C54 18 64 16 70 20 C64 26 56 28 50 26Z', '#30A46C') +
    line('M50 26 v-6', 2.4) +
    circle(40, 44, 1, '#C2410C', false) +
    circle(60, 60, 1, '#C2410C', false) +
    circle(46, 66, 1, '#C2410C', false) +
    circle(62, 44, 1, '#C2410C', false) +
    flat('M32 48 C32 40 38 34 44 34 C38 40 36 44 36 52Z', '#fff', 0.45),
  strawberry:
    shape(
      'M50 86 C34 76 22 60 24 44 C26 32 40 30 50 34 C60 30 74 32 76 44 C78 60 66 76 50 86Z',
      '#E5484D',
    ) +
    shape(
      'M50 34 L38 26 L46 32 L40 20 L50 30 L60 20 L54 32 L62 26Z',
      '#30A46C',
    ) +
    [
      [40, 46],
      [52, 44],
      [62, 48],
      [44, 58],
      [56, 58],
      [50, 70],
      [36, 54],
      [64, 60],
    ]
      .map(([x, y]) => oval(x, y, 1.2, 2, '#FFE08A', false))
      .join(''),
  pear:
    shape(
      'M50 22 C44 22 42 30 42 38 C42 46 26 52 26 66 C26 80 40 86 50 86 C60 86 74 80 74 66 C74 52 58 46 58 38 C58 30 56 22 50 22Z',
      '#A3D65C',
    ) +
    line('M50 22 C50 18 52 14 54 12', 2.6) +
    shape('M54 18 C58 12 66 12 68 16 C64 20 58 20 54 18Z', '#30A46C') +
    flat('M34 64 C34 56 38 52 42 52 C40 56 38 60 38 68Z', '#fff', 0.5),
  cherry:
    line('M38 62 C40 44 50 28 62 18 M66 58 C64 44 62 30 62 18', 2.4) +
    shape('M62 18 C68 12 78 14 80 18 C74 22 66 22 62 18Z', '#30A46C') +
    circle(36, 68, 14, '#C81E4A') +
    circle(66, 64, 14, '#E5484D') +
    flat('M28 64 C28 58 32 56 34 58 C32 60 31 62 31 66Z', '#fff', 0.6) +
    flat('M58 60 C58 54 62 52 64 54 C62 56 61 58 61 62Z', '#fff', 0.6),
  grapes:
    line('M50 22 v-8', 2.6) +
    shape('M50 20 C56 12 66 12 70 16 C64 22 56 22 50 20Z', '#30A46C') +
    [
      [38, 32],
      [50, 30],
      [62, 32],
      [32, 44],
      [44, 44],
      [56, 44],
      [68, 44],
      [38, 56],
      [50, 56],
      [62, 56],
      [44, 68],
      [56, 68],
      [50, 79],
    ]
      .map(([x, y]) => circle(x, y, 7.4, '#8E4EC6'))
      .join(''),
  lemon:
    shape(
      'M18 52 C18 50 22 48 24 46 C30 32 70 32 76 46 C78 48 82 50 82 52 C82 54 78 56 76 58 C70 72 30 72 24 58 C22 56 18 54 18 52Z',
      '#FFE14D',
    ) +
    shape('M50 33 C54 26 62 24 66 26 C62 32 56 34 50 33Z', '#30A46C') +
    flat('M32 48 C34 42 40 40 44 40 C40 44 36 46 34 52Z', '#fff', 0.55),
  carrot:
    shape(
      'M44 34 C54 32 62 38 62 46 C60 60 46 76 30 86 C26 88 24 86 26 82 C32 66 36 48 44 34Z',
      '#F97316',
    ) +
    line('M40 50 l6 2 M36 62 l6 2 M48 44 l5 1', 1.6) +
    shape('M52 34 C50 24 52 16 56 12 C58 20 58 26 56 34Z', '#30A46C') +
    shape('M56 36 C62 28 70 24 76 24 C72 32 66 36 58 38Z', '#30A46C') +
    shape('M48 34 C42 26 36 22 30 22 C34 30 40 34 48 36Z', '#30A46C'),
  bread:
    shape(
      'M14 58 C14 44 26 36 50 36 C74 36 86 44 86 58 C86 66 80 70 72 70 L28 70 C20 70 14 66 14 58Z',
      '#E2A65C',
    ) + line('M34 46 l8 10 M48 44 l8 10 M62 46 l8 10', 2),
  milk:
    shape(
      'M36 34 L64 34 L64 82 C64 86 62 88 58 88 L42 88 C38 88 36 86 36 82Z',
      '#fff',
    ) +
    shape('M36 34 L42 22 L58 22 L64 34Z', '#BFE3FF') +
    rect(40, 14, 20, 8, 2, '#3B82F6') +
    shape('M36 50 C44 46 56 54 64 50 L64 66 C56 70 44 62 36 66Z', '#BFE3FF') +
    oval(50, 58, 5, 4, '#fff', false) +
    flat('M47 56 a1 1 0 1 0 0.1 0Z', INK),
  cake:
    rect(22, 54, 56, 28, 6, '#F9A8C0') +
    shape(
      'M22 60 C30 66 36 58 42 64 C48 70 54 58 60 64 C66 70 72 60 78 64 L78 58 C78 52 74 50 70 50 L30 50 C26 50 22 52 22 58Z',
      '#fff',
    ) +
    rect(46, 30, 8, 20, 2, '#60A5FA') +
    shape('M50 18 C56 24 54 30 50 30 C46 30 44 24 50 18Z', '#FFD23F') +
    circle(34, 72, 2.4, '#E5484D') +
    circle(50, 74, 2.4, '#E5484D') +
    circle(66, 72, 2.4, '#E5484D'),
  egg:
    shape(
      'M50 16 C66 16 76 42 76 58 C76 74 64 84 50 84 C36 84 24 74 24 58 C24 42 34 16 50 16Z',
      '#FFF3D6',
    ) + flat('M36 40 C38 30 44 24 48 24 C44 30 40 36 40 46Z', '#fff', 0.9),
  cheese:
    shape('M14 60 L74 28 C82 32 86 40 86 48 L86 74 L14 74Z', '#FFD23F') +
    line('M14 60 L86 48', 1.6) +
    oval(36, 64, 5, 4, '#F5B800') +
    oval(64, 60, 4, 3, '#F5B800') +
    oval(54, 68, 3, 2.4, '#F5B800') +
    oval(74, 40, 3, 4, '#F5B800'),
  'ice-cream':
    shape('M34 46 L50 88 L66 46Z', '#E2A65C') +
    line('M40 52 l20 14 M38 62 l14 -12 M46 74 l12 -10 M58 56 l-14 18', 1.4) +
    circle(42, 40, 12, '#F9A8C0') +
    circle(58, 40, 12, '#FFF3D6') +
    circle(50, 26, 12, '#8D5A3B') +
    circle(50, 12, 4, '#E5484D'),

  // toys
  ball:
    circle(50, 50, 32, '#fff') +
    shape(
      'M50 18 C66 30 66 70 50 82 C60 82 82 70 82 50 C82 30 62 18 50 18Z',
      '#E5484D',
    ) +
    shape(
      'M50 18 C34 30 34 70 50 82 C40 82 18 70 18 50 C18 30 38 18 50 18Z',
      '#3B82F6',
    ) +
    shape('M18 50 C30 44 70 44 82 50 C70 56 30 56 18 50Z', '#FFD23F'),
  doll:
    shape('M32 88 L38 62 L62 62 L68 88Z', '#F472B6') +
    circle(50, 42, 18, '#F8D5B8') +
    shape(
      'M32 44 C28 24 72 24 68 44 C64 32 58 28 50 28 C42 28 36 32 32 44Z',
      '#FFD23F',
    ) +
    shape(
      'M32 44 C28 52 26 62 30 66 C34 60 34 52 34 46Z M68 44 C72 52 74 62 70 66 C66 60 66 52 66 46Z',
      '#FFD23F',
    ) +
    eyes(44, 56, 44, 2.2) +
    cheeks(38, 62, 50, 2.8) +
    smile(50, 52, 3),
  teddy:
    oval(50, 70, 20, 18, '#C08457') +
    circle(32, 22, 8, '#C08457') +
    circle(68, 22, 8, '#C08457') +
    circle(50, 38, 18, '#C08457') +
    oval(50, 44, 8, 6, '#F5D3AE') +
    eyes(44, 56, 34, 2.2) +
    oval(50, 42, 3, 2.2, INK, false) +
    shape('M42 56 L50 60 L42 64Z M58 56 L50 60 L58 64Z', '#E5484D') +
    circle(30, 66, 7, '#C08457') +
    circle(70, 66, 7, '#C08457') +
    oval(50, 74, 8, 7, '#F5D3AE', false) +
    line('M46 72 l8 4 M54 72 l-8 4', 1.2),
  car:
    shape(
      'M14 64 L14 52 C14 48 18 46 22 46 L30 46 L38 34 C40 32 42 30 46 30 L62 30 C66 30 68 32 70 34 L78 46 C84 46 86 50 86 54 L86 64Z',
      '#E5484D',
    ) +
    shape(
      'M40 46 L46 36 L56 36 L56 46Z M60 46 L60 36 L66 36 L72 46Z',
      '#BFE3FF',
    ) +
    circle(30, 66, 9, '#4B4458') +
    circle(70, 66, 9, '#4B4458') +
    circle(30, 66, 3.4, '#D9D9E3', false) +
    circle(70, 66, 3.4, '#D9D9E3', false) +
    circle(82, 54, 2.4, '#FFD23F', false),
  kite:
    shape('M50 12 L72 40 L50 66 L28 40Z', '#F472B6') +
    shape('M50 12 L72 40 L50 40Z M28 40 L50 40 L50 66Z', '#60A5FA') +
    line('M50 12 v54 M28 40 h44', 1.4) +
    line('M50 66 C46 74 58 78 52 86 C48 90 56 92 58 92', 1.8) +
    shape('M50 74 l-5 -3 v6Z M50 74 l5 -3 v6Z', '#FFD23F') +
    shape('M55 86 l-5 -3 v6Z M55 86 l5 -3 v6Z', '#30A46C'),
  book:
    shape('M14 30 C24 26 40 26 50 32 L50 80 C40 74 24 74 14 78Z', '#fff') +
    shape('M86 30 C76 26 60 26 50 32 L50 80 C60 74 76 74 86 78Z', '#fff') +
    shape(
      'M10 34 L14 34 L14 78 C24 74 40 74 50 80 C60 74 76 74 86 78 L86 34 L90 34 L90 84 L10 84Z',
      '#3B82F6',
    ) +
    line(
      'M22 40 h20 M22 48 h20 M22 56 h16 M58 40 h20 M58 48 h20 M58 56 h14',
      1.6,
    ),
  train:
    rect(20, 40, 44, 32, 4, '#E5484D') +
    rect(48, 22, 22, 30, 3, '#3B82F6') +
    rect(53, 27, 12, 10, 2, '#BFE3FF') +
    rect(26, 26, 8, 14, 1, '#4B4458') +
    shape('M22 26 C22 20 38 20 38 26Z', '#4B4458') +
    rect(64, 52, 16, 20, 3, '#3B82F6') +
    circle(30, 76, 7, '#4B4458') +
    circle(52, 76, 7, '#4B4458') +
    circle(72, 76, 5, '#4B4458') +
    circle(16, 16, 4, '#E5E7EB') +
    circle(24, 12, 3, '#E5E7EB'),
  bike:
    circle(28, 64, 15, 'none') +
    circle(72, 64, 15, 'none') +
    circle(28, 64, 2.4, INK, false) +
    circle(72, 64, 2.4, INK, false) +
    line(
      'M28 64 L42 40 L66 40 L72 64 M42 40 L50 64 L66 40 M50 64 L28 64',
      3.2,
    ) +
    line('M38 34 h10 M64 30 l2 10 M60 30 h8', 3.2) +
    shape('M36 30 C36 28 48 28 48 30 C48 34 36 34 36 30Z', '#E5484D'),
  boat:
    shape('M14 62 L86 62 L76 80 L24 80Z', '#E5484D') +
    line('M50 62 V14', 2.4) +
    shape('M52 16 L78 56 L52 56Z', '#fff') +
    shape('M48 24 L26 56 L48 56Z', '#FFD23F') +
    line(
      'M10 86 q6 -4 12 0 q6 4 12 0 q6 -4 12 0 q6 4 12 0 q6 -4 12 0 q6 4 12 0 q6 -4 12 0',
      2,
    ),

  // weather
  sun:
    line(
      [0, 45, 90, 135, 180, 225, 270, 315]
        .map(a => {
          const r = (a * Math.PI) / 180
          const p = d =>
            (50 + Math.cos(r) * d).toFixed(1) +
            ' ' +
            (50 + Math.sin(r) * d).toFixed(1)
          return `M${p(28)} L${p(40)}`
        })
        .join(' '),
      3.4,
    ) +
    circle(50, 50, 20, '#FFD23F') +
    eyes(43, 57, 47, 2.2) +
    cheeks(39, 61, 54, 2.8) +
    smile(50, 55, 4),
  rain:
    shape(
      'M26 54 C16 54 14 40 24 38 C24 26 40 22 46 30 C52 20 70 22 70 34 C82 32 86 48 76 52 C76 54 74 56 70 56 L30 56 C28 56 26 55 26 54Z',
      '#DCE3F0',
    ) +
    [
      [32, 66],
      [48, 70],
      [64, 66],
      [40, 82],
      [58, 84],
    ]
      .map(([x, y]) =>
        shape(
          `M${x} ${y - 7} C${x + 4} ${y - 1} ${x + 4} ${y + 3} ${x} ${y + 3} C${x - 4} ${y + 3} ${x - 4} ${y - 1} ${x} ${y - 7}Z`,
          '#60A5FA',
        ),
      )
      .join(''),
  snow:
    line(
      [0, 60, 120]
        .map(a => {
          const r = (a * Math.PI) / 180
          const x = Math.cos(r) * 32
          const y = Math.sin(r) * 32
          return `M${(50 - x).toFixed(1)} ${(50 - y).toFixed(1)} L${(50 + x).toFixed(1)} ${(50 + y).toFixed(1)}`
        })
        .join(' '),
      4,
    ).replace(INK, '#3B82F6') +
    line(
      [0, 60, 120, 180, 240, 300]
        .map(a => {
          const r = (a * Math.PI) / 180
          const bx = 50 + Math.cos(r) * 22
          const by = 50 + Math.sin(r) * 22
          const l = r + 0.9
          const rr = r - 0.9
          return `M${(bx + Math.cos(l) * 8).toFixed(1)} ${(by + Math.sin(l) * 8).toFixed(1)} L${bx.toFixed(1)} ${by.toFixed(1)} L${(bx + Math.cos(rr) * 8).toFixed(1)} ${(by + Math.sin(rr) * 8).toFixed(1)}`
        })
        .join(' '),
      3,
    ).replace(INK, '#3B82F6') +
    circle(50, 50, 6, '#fff'),
  wind:
    line('M14 38 H58 C68 38 70 26 62 24 C56 22 52 28 56 32', 3.4) +
    line('M14 52 H74 C84 52 86 66 78 68 C72 70 68 64 72 60', 3.4) +
    line('M22 66 H50 C58 66 60 76 54 78', 3.4) +
    shape('M76 26 C82 18 90 20 90 24 C88 32 80 32 76 26Z', '#30A46C'),
  cloud:
    shape(
      'M24 66 C12 66 10 50 22 46 C20 32 38 26 46 34 C52 22 72 24 74 38 C88 36 92 56 80 62 C80 64 78 66 74 66Z',
      '#fff',
    ) +
    eyes(42, 58, 52, 2.2) +
    cheeks(36, 64, 58, 2.8) +
    smile(50, 58, 3.4),
  rainbow:
    ['#E5484D', '#F97316', '#FFD23F', '#30A46C', '#3B82F6', '#8E4EC6']
      .map((c, i) => {
        const r = 38 - i * 5
        return `<path d="M${50 - r} 72 A${r} ${r} 0 0 1 ${50 + r} 72" fill="none" stroke="${c}" stroke-width="5.2"/>`
      })
      .join('') +
    shape('M8 74 C8 64 22 62 26 68 C30 62 40 66 38 74Z', '#fff') +
    shape('M62 74 C60 66 70 62 74 68 C78 62 92 64 92 74Z', '#fff'),

  // clothes
  hat:
    oval(50, 66, 38, 10, '#FFD23F') +
    shape(
      'M28 64 C28 40 36 30 50 30 C64 30 72 40 72 64 C60 68 40 68 28 64Z',
      '#FFD23F',
    ) +
    shape('M29 56 C42 60 58 60 71 56 L72 64 C58 68 42 68 28 64Z', '#E5484D'),
  shoes:
    shape(
      'M10 66 L10 46 C10 42 14 40 18 42 C22 44 28 44 32 42 L36 52 C44 56 50 58 50 64 L50 70 L10 70Z',
      '#3B82F6',
    ) +
    shape(
      'M50 66 L50 46 C50 42 54 40 58 42 C62 44 68 44 72 42 L76 52 C84 56 90 58 90 64 L90 70 L50 70Z',
      '#3B82F6',
    ) +
    line('M10 64 h40 M50 64 h40', 1.8) +
    line('M20 48 l6 0 M22 54 l6 0 M60 48 l6 0 M62 54 l6 0', 1.6),
  socks:
    shape(
      'M22 16 L42 16 L42 56 C42 62 46 66 50 70 C54 76 50 84 42 84 C34 84 26 78 22 70Z',
      '#F472B6',
    ) +
    shape('M22 16 L42 16 L42 24 L22 24Z', '#fff') +
    line('M22 36 h20 M22 46 h20', 3) +
    shape(
      'M58 16 L78 16 L78 56 C78 62 82 66 86 70 C90 76 86 84 78 84 C70 84 62 78 58 70Z',
      '#60A5FA',
    ) +
    shape('M58 16 L78 16 L78 24 L58 24Z', '#fff') +
    line('M58 36 h20 M58 46 h20', 3),
  coat:
    shape(
      'M38 18 L28 22 L16 44 L18 72 L28 72 L28 86 L72 86 L72 72 L82 72 L84 44 L72 22 L62 18 C58 24 42 24 38 18Z',
      '#8D5A3B',
    ) +
    line('M50 24 V86', 1.8) +
    shape('M38 18 L50 36 L46 22Z M62 18 L50 36 L54 22Z', '#C08457') +
    circle(56, 48, 2.6, '#FFD23F') +
    circle(56, 62, 2.6, '#FFD23F') +
    circle(56, 76, 2.6, '#FFD23F'),
  't-shirt':
    shape(
      'M38 20 L14 32 L22 50 L30 46 L30 82 L70 82 L70 46 L78 50 L86 32 L62 20 C58 28 42 28 38 20Z',
      '#30A46C',
    ) +
    circle(50, 56, 9, '#FFD23F') +
    line('M38 20 C42 28 58 28 62 20', 1.8),
  dress:
    shape(
      'M40 14 L40 34 L22 84 L78 84 L60 34 L60 14 L54 14 C54 22 46 22 46 14Z',
      '#F472B6',
    ) +
    shape('M40 34 L60 34 L60 40 L40 40Z', '#8E4EC6') +
    circle(36, 66, 2.6, '#fff', false) +
    circle(50, 58, 2.6, '#fff', false) +
    circle(62, 72, 2.6, '#fff', false) +
    circle(48, 76, 2.6, '#fff', false),
  scarf:
    shape('M24 30 C36 22 64 22 76 30 L76 42 C64 34 36 34 24 42Z', '#E5484D') +
    shape('M58 38 L70 38 L74 82 L60 82Z', '#E5484D') +
    line(
      'M28 34 v4 M40 30 v6 M52 30 v6 M64 30 v6 M72 34 v4 M60 52 h12 M61 64 h12',
      2,
    ) +
    line('M60 82 v6 M65 82 v6 M70 82 v6 M74 82 v6', 1.8),
}

for (const [name, colour] of Object.entries(COLOURS)) {
  DRAWINGS[`colour-${name}`] = splash(colour)
}
for (let n = 1; n <= 10; n++) DRAWINGS[`number-${n}`] = number(n)

// Each family of pictures sits on its own soft colour.
const BACKGROUNDS = {
  colour: '#F4F1FA',
  number: '#FFF3E0',
  animal: '#E8F6EC',
  family: '#FFE6EC',
  body: '#FFF1E6',
  food: '#FFF8DC',
  toy: '#E8F1FF',
  weather: '#E6F4FF',
  clothes: '#F3E8FF',
}
const GROUPS = {
  animal:
    'cat dog rabbit bird fish horse cow pig duck mouse sheep frog lion elephant bear snake',
  family: 'mum dad baby grandma grandpa sister brother',
  body: 'head eye nose mouth ear hand foot',
  food: 'apple banana orange strawberry pear cherry grapes lemon carrot bread milk cake egg cheese ice-cream',
  toy: 'ball doll teddy car kite book train bike boat',
  weather: 'sun rain snow wind cloud rainbow',
  clothes: 'hat shoes socks coat t-shirt dress scarf',
}
const groupOf = id => {
  const prefix = id.split('-')[0]
  if (prefix === 'colour' || prefix === 'number') return prefix
  return Object.keys(GROUPS).find(g => GROUPS[g].split(' ').includes(id))
}

mkdirSync(out, { recursive: true })
for (const [id, body] of Object.entries(DRAWINGS)) {
  const background = BACKGROUNDS[groupOf(id)] || '#F4F1FA'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="256" height="256"><circle cx="50" cy="50" r="49" fill="${background}"/>${body}</svg>\n`
  writeFileSync(new URL(`${id}.svg`, out), svg)
}
console.log(`${Object.keys(DRAWINGS).length} drawings`)
