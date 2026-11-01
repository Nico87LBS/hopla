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
    // A baby rabbit peeking out of its pram, with a dummy.
    circle(32, 84, 7, '#4B4458') +
    circle(68, 84, 7, '#4B4458') +
    circle(32, 84, 2.4, '#D9D9E3', false) +
    circle(68, 84, 2.4, '#D9D9E3', false) +
    `<g transform="translate(10 2)">${rabbit({ y: -2, size: 0.6 })}</g>` +
    circle(60, 58.5, 3.4, '#FDE68A') +
    oval(60, 58.5, 5.6, 2.4, '#F59E0B') +
    shape('M12 62 L88 62 C88 74 76 80 50 80 C24 80 12 74 12 62Z', '#60A5FA') +
    shape('M12 62 C12 42 22 30 40 28 L44 62Z', '#3B82F6') +
    line('M18 54 L38 34 M26 60 L42 44', 1.4) +
    line('M88 62 C90 54 94 50 96 50', 2.4) +
    line('M18 68 H82', 1.4),
  grandma:
    shape('M22 92 C22 76 34 70 50 70 C66 70 78 76 78 92Z', '#8E4EC6') +
    shape('M30 72 C40 84 60 84 70 72 C66 90 34 90 30 72Z', '#C4B5FD') +
    rabbit({ y: -2, size: 0.86 }) +
    circle(50, 20, 8, '#E5E7EB') +
    line('M44 18 q6 4 12 0', 1.4) +
    shape(
      'M34 40 C34 30 42 30 44 34 C46 28 54 28 56 34 C58 30 66 30 66 40 C60 36 40 36 34 40Z',
      '#E5E7EB',
    ) +
    circle(42, 49, 5.6, '#fff') +
    circle(58, 49, 5.6, '#fff') +
    eyes(42, 58, 49, 2.2) +
    line('M47.6 49 h4.8', 1.8) +
    [38, 44, 50, 56, 62]
      .map(x => circle(x, 76 + Math.abs(x - 50) * -0.15, 2.2, '#fff'))
      .join(''),
  grandpa:
    shape('M22 92 C22 76 34 70 50 70 C66 70 78 76 78 92Z', '#30A46C') +
    shape('M42 70 L50 82 L58 70Z', '#fff') +
    rabbit({ y: -2, size: 0.86 }) +
    // A flat cap with its peak, the ears poking out of it.
    shape('M30 40 C30 26 70 26 70 40 C60 37 40 37 30 40Z', '#8D5A3B') +
    shape('M30 40 C24 40 20 42 22 44 C30 44 40 42 44 39Z', '#5B3A29') +
    line('M38 32 h24', 1.2) +
    circle(42, 49, 5.6, '#fff') +
    circle(58, 49, 5.6, '#fff') +
    eyes(42, 58, 49, 2.2) +
    line('M47.6 49 h4.8', 1.8) +
    shape(
      'M36 60 C40 55 47 56 50 59 C53 56 60 55 64 60 C58 64 54 64 50 62 C46 64 42 64 36 60Z',
      '#E5E7EB',
    ) +
    line('M80 92 V64 C80 58 88 58 88 64', 3),
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
    // A big smile: lips, teeth and tongue.
    shape(
      'M14 42 C30 34 40 40 50 38 C60 40 70 34 86 42 C82 68 66 80 50 80 C34 80 18 68 14 42Z',
      '#E5484D',
    ) +
    shape(
      'M22 46 C36 50 64 50 78 46 C76 60 66 72 50 72 C34 72 24 60 22 46Z',
      '#7F1D3A',
    ) +
    shape('M22 46 C36 50 64 50 78 46 L76 54 C62 57 38 57 24 54Z', '#fff') +
    line('M36 49 v6 M44 50 v6 M50 50 v6 M56 50 v6 M64 49 v6', 1) +
    shape('M36 70 C38 62 62 62 64 70 C58 74 42 74 36 70Z', '#F472B6') +
    flat('M28 40 C36 38 42 40 46 40 C40 42 34 42 28 42Z', '#fff', 0.5),
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
      'M20 26 C14 54 34 82 70 80 C80 79 86 74 84 70 C76 72 56 70 42 56 C32 46 28 36 28 24Z',
      '#FFD23F',
    ) +
    shape(
      'M28 24 C30 40 38 52 50 60 C62 68 76 70 84 70 C72 76 50 74 36 60 C26 50 22 38 24 24Z',
      '#F5B800',
    ) +
    shape('M20 26 L19 16 L27 15 L28 24Z', '#8D5A3B') +
    shape('M84 70 C88 70 90 72 88 74 C86 76 84 74 84 70Z', '#5B3A29') +
    flat('M24 34 C24 48 30 60 40 68 C32 58 28 46 28 34Z', '#fff', 0.55),
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
      '#fff',
    ) + flat('M70 52 C72 68 64 80 50 82 C62 76 68 66 66 50Z', '#E6E1F0'),
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
    // A football: white with black patches.
    `<clipPath id="ballclip"><circle cx="50" cy="50" r="32"/></clipPath>` +
    circle(50, 50, 32, '#fff') +
    `<g clip-path="url(#ballclip)">` +
    flat('M50 38 L61 46 L57 59 L43 59 L39 46Z', INK) +
    line(
      'M50 38 V22 M61 46 L76 41 M57 59 L66 72 M43 59 L34 72 M39 46 L24 41',
      1.8,
    ) +
    flat('M44 14 L56 14 L60 22 L50 28 L40 22Z', INK) +
    flat('M80 32 L88 40 L86 54 L78 50 L74 40Z', INK) +
    flat('M70 74 L78 66 L84 74 L76 86 L66 82Z', INK) +
    flat('M30 74 L22 66 L16 74 L24 86 L34 82Z', INK) +
    flat('M20 32 L12 40 L14 54 L22 50 L26 40Z', INK) +
    `</g>` +
    circle(50, 50, 32, 'none') +
    flat('M30 34 C34 26 42 22 48 22 C42 26 36 30 32 38Z', '#fff', 0.7),
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

// ── the pictures of the GS packs ──

const WOOD = '#C08457'
const METAL = '#C9CED6'
const LEAF = '#30A46C'

// A rabbit face that shows a feeling, by its brows and mouth.
const feeling = (mouth, brows = '', extra = '') =>
  rabbit({ y: 4 }).replace(
    /<path d="M[\d. ]+ Q[\d. ]+ [\d. ]+" fill="none"[^>]*\/>$/,
    '',
  ) +
  mouth +
  brows +
  extra

// A rabbit and a box, to say where the rabbit is.
const box = (x, y, w = 34, h = 26) =>
  rect(x, y, w, h, 2, '#F6C66B') + line(`M${x} ${y + 8} H${x + w}`, 1.6)
const bunny = (x, y, s = 0.55) =>
  `<g transform="translate(${x} ${y}) scale(${s}) translate(-50 -50)">${rabbit()}</g>`

Object.assign(DRAWINGS, {
  // home
  house:
    rect(26, 46, 48, 36, 2, '#FFE6B3') +
    shape('M20 48 L50 20 L80 48Z', '#E5484D') +
    rect(44, 62, 12, 20, 2, WOOD) +
    rect(30, 54, 10, 10, 1, '#BFE3FF') +
    rect(60, 54, 10, 10, 1, '#BFE3FF') +
    rect(64, 24, 7, 14, 1, '#8D5A3B'),
  bed:
    rect(18, 38, 8, 40, 2, WOOD) +
    rect(74, 52, 8, 26, 2, WOOD) +
    rect(24, 56, 52, 12, 3, '#BFE3FF') +
    oval(34, 52, 9, 5, '#fff') +
    shape('M44 52 H74 V60 H44Z', '#8E4EC6'),
  table:
    rect(18, 40, 64, 8, 2, WOOD) +
    rect(24, 48, 6, 32, 1, WOOD) +
    rect(70, 48, 6, 32, 1, WOOD) +
    oval(50, 36, 10, 3.5, '#fff') +
    rect(44, 26, 12, 10, 3, '#E5484D'),
  chair:
    rect(32, 18, 6, 64, 1, WOOD) +
    rect(32, 24, 34, 6, 1, WOOD) +
    rect(32, 34, 34, 6, 1, WOOD) +
    rect(30, 52, 40, 7, 1, WOOD) +
    rect(62, 52, 6, 30, 1, WOOD),
  door:
    rect(32, 16, 36, 68, 3, WOOD) +
    rect(37, 22, 26, 22, 2, '#D9A06E') +
    rect(37, 50, 26, 26, 2, '#D9A06E') +
    circle(61, 50, 2.8, '#FFD23F'),
  window:
    rect(24, 22, 52, 52, 3, '#BFE3FF') +
    line('M50 22 V74 M24 48 H76', 3) +
    shape('M20 22 C26 34 26 60 20 76 L20 22Z', '#F472B6') +
    shape('M80 22 C74 34 74 60 80 76 L80 22Z', '#F472B6') +
    rect(20, 74, 60, 6, 2, WOOD),
  lamp:
    shape('M34 46 L42 20 H58 L66 46Z', '#FFD23F') +
    rect(47, 46, 6, 26, 1, METAL) +
    oval(50, 78, 18, 5, '#8E4EC6'),
  bathtub:
    shape('M16 46 H84 C84 62 76 72 60 72 H40 C24 72 16 62 16 46Z', '#fff') +
    rect(24, 72, 6, 8, 2, METAL) +
    rect(70, 72, 6, 8, 2, METAL) +
    line('M74 46 V26 C74 20 66 20 66 26', 3) +
    circle(34, 42, 5, '#BFE3FF') +
    circle(44, 40, 4, '#BFE3FF') +
    circle(52, 42, 3.4, '#BFE3FF'),
  // school
  schoolbag:
    rect(26, 30, 48, 50, 8, '#3B82F6') +
    line('M38 30 C38 18 62 18 62 30', 3) +
    shape('M26 46 C40 52 60 52 74 46 V58 H26Z', '#2F6FD6') +
    rect(46, 52, 8, 8, 2, '#FFD23F'),
  pencil:
    shape('M24 76 L30 60 L68 22 L78 32 L40 70Z', '#FFD23F') +
    shape('M24 76 L30 60 L40 70Z', '#F5D3AE') +
    shape('M24 76 L27 68 L32 73Z', INK) +
    shape(
      'M68 22 L72 18 C74 16 78 16 80 18 L82 20 C84 22 84 26 82 28 L78 32Z',
      '#F472B6',
    ),
  scissors:
    circle(32, 70, 9, '#E5484D') +
    circle(52, 76, 9, '#E5484D') +
    circle(32, 70, 4, '#fff', false) +
    circle(52, 76, 4, '#fff', false) +
    shape('M38 63 L74 22 L78 26 L46 68Z', METAL) +
    shape('M46 70 L80 34 L82 40 L52 72Z', METAL) +
    circle(46, 66, 2, INK, false),
  glue:
    rect(36, 34, 28, 46, 6, '#fff') +
    rect(36, 46, 28, 20, 2, '#3B82F6') +
    rect(40, 20, 20, 14, 3, '#E5484D') +
    line('M44 56 H56', 1.6),
  notebook:
    rect(26, 20, 46, 60, 3, '#30A46C') +
    rect(26, 20, 8, 60, 2, '#1F7A4D') +
    rect(40, 32, 26, 12, 2, '#fff') +
    line('M44 38 H62', 1.4),
  paintbrush:
    shape(
      'M28 80 C24 76 26 70 32 66 L40 62 L44 66 L40 74 C36 80 32 82 28 80Z',
      '#E5484D',
    ) +
    rect(41, 52, 10, 12, 2, METAL) +
    shape('M44 54 L72 18 C74 15 80 18 78 22 L50 60Z', WOOD),
  board:
    rect(16, 22, 68, 48, 3, '#2F6B4F') +
    rect(12, 18, 76, 56, 4, 'none') +
    line('M26 36 Q34 30 42 36 T58 36 M26 50 H52', 2.4).replace(INK, '#fff') +
    rect(60, 70, 16, 5, 1, '#fff') +
    line('M30 74 L24 86 M70 74 L76 86', 2.6),
  // feelings
  happy: feeling(shape('M42 60 Q50 70 58 60Z', '#F27B98')),
  sad: feeling(
    line('M43 66 Q50 58 57 66', 2),
    line('M37 42 L45 45 M63 42 L55 45', 1.8),
    shape('M38 54 C36 58 36 61 38 62 C40 61 40 58 38 54Z', '#7CC4FF'),
  ),
  angry: feeling(
    line('M43 67 Q50 61 57 67', 2.2),
    line('M35 41 L46 47 M65 41 L54 47', 3),
    flat('M74 26 l4 -6 l2 7 l5 -3 l-3 7Z', '#E5484D'),
  ),
  scared: feeling(
    oval(50, 63, 4, 6, INK, false),
    line('M38 42 Q41 38 46 41 M62 42 Q59 38 54 41', 1.8),
    line('M74 40 q3 4 0 8 M26 40 q-3 4 0 8', 1.6),
  ),
  surprised: feeling(
    oval(50, 63, 5, 6, '#F27B98'),
    line('M38 39 Q41 35 45 38 M62 39 Q59 35 55 38', 1.8),
  ),
  // shapes
  'shape-circle': circle(50, 50, 26, '#3B82F6'),
  'shape-square': rect(26, 26, 48, 48, 2, '#E5484D'),
  'shape-triangle': shape('M50 22 L78 74 H22Z', '#FFD23F'),
  'shape-rectangle': rect(18, 34, 64, 34, 2, '#30A46C'),
  // where the rabbit is
  'pos-in':
    rect(30, 50, 40, 10, 2, '#B98235') +
    bunny(50, 48, 0.42) +
    rect(30, 58, 40, 24, 2, '#F6C66B'),
  'pos-on': box(33, 58, 34, 24) + bunny(50, 40, 0.42),
  'pos-under':
    rect(22, 24, 56, 8, 2, WOOD) +
    rect(26, 32, 5, 46, 1, WOOD) +
    rect(69, 32, 5, 46, 1, WOOD) +
    bunny(50, 62, 0.42),
  'pos-in-front': box(34, 26, 32, 26) + bunny(50, 62, 0.62),
  'pos-behind': bunny(50, 34, 0.5) + box(24, 46, 52, 36),
  'pos-next-to': box(18, 52, 32, 30) + bunny(68, 62, 0.42),
})

// A little one is its parent drawn smaller, with a bow.
const little = (id, x = 50, y = 56, s = 0.68) =>
  `<g transform="translate(${x} ${y}) scale(${s}) translate(-50 -50)">${DRAWINGS[id]}</g>` +
  shape('M44 22 L50 26 L44 30Z M56 22 L50 26 L56 30Z', '#F472B6') +
  circle(50, 26, 2, '#F472B6')

Object.assign(DRAWINGS, {
  // sky and seasons
  moon:
    shape(
      'M58 18 C40 22 30 40 34 58 C38 76 58 86 74 78 C56 76 44 62 46 44 C47 32 52 24 58 18Z',
      '#FFD23F',
    ) +
    eye(48, 50, 2.2) +
    smile(46, 60, 3),
  star:
    shape(
      'M50 16 L59 38 L82 39 L64 54 L70 78 L50 64 L30 78 L36 54 L18 39 L41 38Z',
      '#FFD23F',
    ) +
    eyes(44, 56, 46, 2.2) +
    smile(50, 54, 3),
  snowman:
    circle(50, 64, 20, '#fff') +
    circle(50, 34, 14, '#fff') +
    rect(38, 14, 24, 8, 2, '#2B2B33') +
    rect(34, 21, 32, 3, 1, '#2B2B33') +
    eyes(45, 55, 32, 1.8) +
    shape('M50 36 L60 39 L50 40Z', '#F97316') +
    shape('M38 46 C44 50 56 50 62 46 L62 52 C56 56 44 56 38 52Z', '#E5484D') +
    circle(50, 62, 2, INK, false) +
    circle(50, 72, 2, INK, false),
  flower:
    line('M50 56 V86', 3) +
    shape('M50 74 C40 66 32 70 30 74 C38 80 46 78 50 74Z', LEAF) +
    [0, 72, 144, 216, 288]
      .map(a => {
        const r = ((a - 90) * Math.PI) / 180
        return circle(
          +(50 + Math.cos(r) * 13).toFixed(1),
          +(38 + Math.sin(r) * 13).toFixed(1),
          9,
          '#F472B6',
        )
      })
      .join('') +
    circle(50, 38, 8, '#FFD23F'),
  leaf:
    shape('M24 76 C22 46 42 22 78 20 C80 56 58 78 24 76Z', '#F97316') +
    line('M24 76 L70 28 M40 60 L38 44 M48 52 L60 54 M56 42 L56 32', 1.8),
  fir:
    rect(45, 70, 10, 14, 1, '#8D5A3B') +
    shape(
      'M50 14 L70 40 H60 L76 58 H62 L80 72 H20 L38 58 H24 L40 40 H30Z',
      LEAF,
    ),
  grass: shape(
    'M20 80 L26 48 L32 80 L38 40 L44 80 L50 34 L56 80 L62 42 L68 80 L74 50 L80 80Z',
    LEAF,
  ),
  barn:
    rect(26, 44, 48, 38, 1, '#E5484D') +
    shape('M20 46 L50 20 L80 46Z', '#B42F34') +
    rect(40, 58, 20, 24, 1, '#fff') +
    line('M40 58 L60 82 M60 58 L40 82', 2) +
    rect(44, 34, 12, 10, 1, '#fff'),
  wave:
    shape(
      'M14 60 C24 50 32 50 40 58 C48 66 56 66 64 58 C72 50 80 50 86 58 V84 H14Z',
      '#3B82F6',
    ) +
    line('M18 70 C26 64 32 64 38 70 M58 72 C64 66 72 66 78 72', 2).replace(
      INK,
      '#fff',
    ) +
    shape('M30 40 C36 34 44 36 46 42 C40 40 34 42 30 46Z', '#BFE3FF'),
  // animals and their little ones
  hen:
    oval(48, 58, 24, 20, '#fff') +
    circle(66, 38, 12, '#fff') +
    shape('M62 26 C62 20 66 20 66 24 C68 18 72 20 70 26Z', '#E5484D') +
    shape('M77 38 L84 41 L77 44Z', '#F97316') +
    shape('M70 48 C70 52 72 54 74 52 C74 50 72 48 70 48Z', '#E5484D') +
    eye(68, 36, 2) +
    shape('M24 52 C18 44 20 38 26 40 C24 46 28 50 30 52Z', '#fff') +
    line('M44 78 V86 M54 78 V86', 2.4),
  chick:
    circle(50, 56, 22, '#FFD23F') +
    eyes(43, 57, 50, 2.4) +
    shape('M46 58 L54 58 L50 64Z', '#F97316') +
    shape('M28 58 C22 54 24 48 30 50Z M72 58 C78 54 76 48 70 50Z', '#FFD23F') +
    shape('M46 34 C46 28 50 28 50 32 C50 28 54 28 54 34Z', '#FFD23F') +
    line('M44 78 V84 M56 78 V84', 2.2),
  calf: little('cow'),
  lamb: little('sheep'),
  foal: little('horse'),
  kitten: little('cat'),
  puppy: little('dog'),
  piglet: little('pig'),
  duckling: little('duck'),
  rat:
    oval(50, 58, 26, 18, '#A0A4AE') +
    circle(30, 40, 9, '#A0A4AE') +
    circle(30, 40, 5, PINK, false) +
    shape('M26 54 L12 60 L26 62Z', '#A0A4AE') +
    eye(22, 52, 2) +
    circle(12, 60, 2.4, '#F27B98', false) +
    line('M76 62 C88 62 90 74 80 78', 2.4),
  fox:
    shape('M28 40 L30 16 L44 30Z M72 40 L70 16 L56 30Z', '#F97316') +
    shape(
      'M24 40 C24 30 76 30 76 40 C76 56 62 72 50 76 C38 72 24 56 24 40Z',
      '#F97316',
    ) +
    shape(
      'M30 50 C38 52 44 60 50 76 C56 60 62 52 70 50 C64 64 56 74 50 76 C44 74 36 64 30 50Z',
      '#fff',
    ) +
    eyes(40, 60, 46, 2.4) +
    oval(50, 70, 3.4, 2.6, INK, false),
  owl:
    oval(50, 54, 26, 30, WOOD) +
    shape('M26 30 L32 20 L40 30Z M74 30 L68 20 L60 30Z', WOOD) +
    circle(40, 44, 10, '#fff') +
    circle(60, 44, 10, '#fff') +
    eyes(40, 60, 44, 3.4) +
    shape('M46 52 L54 52 L50 60Z', '#F97316') +
    oval(50, 70, 14, 10, '#F5D3AE', false) +
    line('M44 68 l2 3 l2 -3 M52 68 l2 3 l2 -3', 1.4),
  hedgehog:
    shape(
      'M20 66 C18 44 34 30 54 30 L58 22 L62 32 L68 26 L70 36 L78 34 L76 44 L84 46 L78 54 C80 62 76 68 70 70 H24Z',
      '#8D5A3B',
    ) +
    shape('M20 66 C24 58 34 56 40 60 C40 66 34 70 24 70Z', '#F5D3AE') +
    eye(28, 60, 2) +
    circle(18, 66, 2.6, INK, false) +
    line('M34 70 V76 M58 70 V76', 2.4),
  whale:
    shape(
      'M14 56 C14 36 36 30 56 34 C70 36 78 46 78 56 C82 50 88 48 90 50 C88 56 86 62 80 64 C76 74 60 78 44 78 C26 78 14 70 14 56Z',
      '#3B82F6',
    ) +
    shape(
      'M18 62 C30 72 56 74 72 66 C66 74 56 78 44 78 C28 78 20 70 18 62Z',
      '#BFE3FF',
    ) +
    eye(30, 50, 2.4) +
    line('M44 30 C42 22 36 20 34 22 M44 30 C46 22 52 20 54 22', 2),
  crab:
    oval(50, 58, 24, 16, '#E5484D') +
    line('M28 62 L16 70 M28 66 L18 76 M72 62 L84 70 M72 66 L82 76', 2.4) +
    line('M36 46 L28 32 M64 46 L72 32', 2.4) +
    shape('M20 30 C20 22 32 20 34 28 L28 32Z', '#E5484D') +
    shape('M80 30 C80 22 68 20 66 28 L72 32Z', '#E5484D') +
    eyes(44, 56, 54, 2.4) +
    smile(50, 62, 4),
  octopus:
    shape('M28 46 C28 26 72 26 72 46 V58 H28Z', '#8E4EC6') +
    [26, 36, 46, 56, 66]
      .map(x =>
        shape(
          `M${x} 56 C${x - 4} 70 ${x + 2} 80 ${x + 8} 82 C${x + 4} 74 ${x + 6} 66 ${x + 10} 56Z`,
          '#8E4EC6',
        ),
      )
      .join('') +
    eyes(42, 58, 44, 2.6) +
    smile(50, 52, 4),
  butterfly:
    shape('M48 46 C36 24 18 26 20 42 C22 52 36 54 48 50Z', '#F472B6') +
    shape('M52 46 C64 24 82 26 80 42 C78 52 64 54 52 50Z', '#F472B6') +
    shape('M48 52 C36 56 26 66 32 74 C38 80 46 68 48 58Z', '#FFD23F') +
    shape('M52 52 C64 56 74 66 68 74 C62 80 54 68 52 58Z', '#FFD23F') +
    oval(50, 54, 3.4, 18, INK, false) +
    line('M48 38 C46 30 42 26 40 24 M52 38 C54 30 58 26 60 24', 1.6),
  snail:
    shape(
      'M14 76 C22 70 30 70 40 70 H80 C84 70 86 66 82 62 L76 60 C78 52 76 46 74 44 L72 60 H18Z',
      '#F5D3AE',
    ) +
    circle(52, 50, 20, '#F97316') +
    line('M52 50 m-4 0 a4 4 0 1 1 8 0 a9 9 0 1 1 -18 0 a14 14 0 1 1 28 0', 2) +
    line('M78 46 L80 34 M74 46 L72 34', 1.8) +
    circle(80, 33, 2.2, INK, false) +
    circle(72, 33, 2.2, INK, false),
  worm:
    shape(
      'M18 68 C22 52 34 50 40 60 C46 70 56 68 60 56 C64 44 78 42 82 52 C84 58 80 62 76 58 C74 52 68 52 66 60 C62 74 46 78 36 68 C30 62 26 66 24 72 C22 76 16 74 18 68Z',
      '#F27B98',
    ) + eye(78, 50, 1.8),
})

Object.assign(DRAWINGS, {
  // food
  honey:
    shape('M30 40 C30 32 70 32 70 40 V74 C70 82 30 82 30 74Z', '#FFB020') +
    rect(28, 28, 44, 10, 3, '#E5484D') +
    rect(36, 50, 28, 14, 3, '#fff') +
    shape('M44 38 C44 44 48 46 48 50 C48 46 52 44 52 38Z', '#FFB020'),
  candy:
    shape('M22 38 L36 46 L36 54 L22 62 C18 56 18 44 22 38Z', '#F472B6') +
    shape('M78 38 L64 46 L64 54 L78 62 C82 56 82 44 78 38Z', '#F472B6') +
    circle(50, 50, 16, '#E5484D') +
    line('M40 42 C46 48 54 52 60 58 M42 56 C46 52 48 50 52 44', 1.6).replace(
      INK,
      '#fff',
    ),
  soda:
    shape('M36 24 H64 L62 80 C62 84 38 84 38 80Z', '#E5484D') +
    oval(50, 24, 14, 4, METAL) +
    rect(38, 44, 24, 16, 2, '#fff') +
    line('M60 24 L66 10', 3),
  salad:
    shape(
      'M22 56 C18 38 34 26 50 28 C66 26 82 38 78 56 C74 72 26 72 22 56Z',
      '#7BCB6A',
    ) +
    line(
      'M50 70 V38 M50 52 L36 42 M50 52 L64 42 M50 62 L38 56 M50 62 L62 56',
      2,
    ),
  leek:
    shape('M42 84 V48 C42 40 58 40 58 48 V84 C58 88 42 88 42 84Z', '#fff') +
    shape(
      'M42 50 C38 34 30 22 24 14 C36 18 46 30 50 44 C54 30 64 18 76 14 C70 22 62 34 58 50Z',
      LEAF,
    ) +
    line('M44 86 l-2 4 M50 86 v4 M56 86 l2 4', 1.4),
  potato:
    shape(
      'M24 50 C22 34 40 26 56 30 C74 32 82 46 76 60 C70 74 46 78 32 70 C26 66 24 58 24 50Z',
      '#D9A06E',
    ) +
    circle(40, 44, 1.8, INK, false) +
    circle(60, 50, 1.8, INK, false) +
    circle(48, 62, 1.8, INK, false),
  peas:
    shape('M16 60 C24 40 60 30 84 40 C70 60 40 70 16 60Z', LEAF) +
    circle(34, 54, 6, '#7BCB6A') +
    circle(48, 50, 6.4, '#7BCB6A') +
    circle(62, 46, 6, '#7BCB6A') +
    line('M84 40 C88 34 90 30 88 26', 2),
  bone: shape(
    'M30 40 C22 34 24 24 32 26 C34 20 44 22 40 32 L64 56 C72 52 80 56 76 64 C82 66 80 76 72 74 C70 80 60 78 62 70 L38 46 C32 50 24 48 30 40Z',
    '#fff',
  ),
  // objects
  spoon:
    oval(36, 34, 12, 16, METAL, true, -40) +
    shape('M44 44 L78 80 C80 82 76 86 74 84 L40 48Z', METAL),
  key:
    circle(32, 40, 14, '#FFD23F') +
    circle(32, 40, 5, '#fff') +
    shape(
      'M44 46 L80 68 L76 74 L70 70 L66 76 L60 72 L64 66 L40 52Z',
      '#FFD23F',
    ),
  bottle:
    shape(
      'M42 18 H58 V28 C58 32 66 34 66 44 V80 C66 84 34 84 34 80 V44 C34 34 42 32 42 28Z',
      '#7CC4FF',
    ) +
    rect(41, 14, 18, 8, 2, '#3B82F6') +
    rect(34, 50, 32, 14, 1, '#fff'),
  bucket:
    shape('M28 40 H72 L66 82 H34Z', '#E5484D') +
    oval(50, 40, 22, 6, '#B42F34') +
    line('M28 40 C28 18 72 18 72 40', 2.4) +
    shape('M66 26 L82 20 L80 28Z', '#FFD23F'),
  cork:
    shape('M36 34 H64 L60 74 H40Z', '#D9A06E') +
    oval(50, 34, 14, 5, '#E8B98A') +
    circle(46, 50, 1.6, INK, false) +
    circle(54, 60, 1.6, INK, false),
  stone:
    shape(
      'M18 64 C16 48 30 36 48 36 C66 34 84 44 82 60 C80 74 60 78 44 76 C28 76 20 72 18 64Z',
      '#A0A4AE',
    ) + flat('M32 50 C38 44 48 44 52 46 C44 46 38 50 34 56Z', '#fff', 0.5),
  coin:
    circle(50, 50, 24, '#FFD23F') +
    circle(50, 50, 17, '#FFE27A') +
    `<text x="50" y="58" text-anchor="middle" font-family="Fredoka, 'Arial Rounded MT Bold', Arial, sans-serif" font-weight="700" font-size="24" fill="${INK}">1</text>`,
  toothbrush:
    shape(
      'M20 72 L64 40 C68 38 70 42 66 44 L24 78 C20 80 18 76 20 72Z',
      '#3B82F6',
    ) +
    rect(62, 22, 18, 14, 2, '#fff') +
    line('M66 22 V18 M71 22 V17 M76 22 V18', 2) +
    rect(62, 34, 18, 6, 1, '#3B82F6'),
  truck:
    rect(16, 36, 42, 32, 3, '#FFD23F') +
    shape('M58 46 H74 L84 58 V68 H58Z', '#3B82F6') +
    rect(62, 50, 10, 8, 1, '#BFE3FF') +
    circle(30, 72, 8, '#2B2B33') +
    circle(72, 72, 8, '#2B2B33') +
    circle(30, 72, 3, METAL, false) +
    circle(72, 72, 3, METAL, false),
  log:
    shape('M24 40 H72 V68 H24Z', WOOD) +
    oval(24, 54, 8, 14, '#E8B98A') +
    line('M24 54 m-3 0 a3 5 0 1 0 6 0 a3 5 0 1 0 -6 0', 1.4) +
    line('M36 48 H60 M40 60 H66', 1.6),
})

// ── the pictures of the reading pack ──

const GREY = '#B8B4C8'

Object.assign(DRAWINGS, {
  // words of simple syllables
  motorbike:
    circle(28, 66, 11, '#2B2B33') +
    circle(74, 66, 11, '#2B2B33') +
    circle(28, 66, 4, METAL, false) +
    circle(74, 66, 4, METAL, false) +
    shape('M34 62 L44 46 H62 L70 60 H52 L46 64Z', '#E5484D') +
    rect(42, 40, 18, 7, 3, '#2B2B33') +
    line('M64 46 L70 34 L78 32 M70 60 L74 66', 3),
  bag:
    line('M38 40 C38 22 62 22 62 40', 3.2) +
    shape('M26 40 H74 L70 80 H30Z', '#8E4EC6') +
    rect(44, 50, 12, 8, 2, '#FFD23F'),
  bowl:
    line('M42 30 C38 24 46 22 42 16 M56 30 C52 24 60 22 56 16', 2) +
    shape('M20 42 H80 C80 62 66 74 50 74 C34 74 20 62 20 42Z', '#3B82F6') +
    oval(50, 42, 30, 5, '#F6C66B') +
    rect(40, 74, 20, 6, 2, '#3B82F6'),
  llama:
    line('M36 84 V70 M46 84 V70 M60 84 V70 M70 84 V70', 3.4) +
    oval(54, 66, 22, 12, CREAM) +
    shape('M30 64 C28 50 30 36 32 30 H44 C44 40 44 54 46 64Z', CREAM) +
    shape('M30 20 L32 10 L36 20Z M40 20 L42 10 L45 20Z', CREAM) +
    oval(38, 28, 11, 9, CREAM) +
    eyes(34, 42, 26, 2) +
    oval(36, 34, 5, 3.4, '#F5D3AE', false) +
    rect(26, 46, 22, 6, 2, '#E5484D'),
  tomato:
    circle(50, 56, 26, '#E5484D') +
    shape('M50 32 L42 26 L48 30 L44 22 L52 30 L58 24 L54 32 L62 30Z', LEAF) +
    oval(40, 46, 5, 3, '#fff', false, -30),
  domino:
    rect(30, 16, 40, 68, 6, '#fff') +
    line('M34 50 H66') +
    circle(42, 28, 3.6, INK, false) +
    circle(58, 40, 3.6, INK, false) +
    circle(42, 62, 3.6, INK, false) +
    circle(58, 62, 3.6, INK, false) +
    circle(42, 74, 3.6, INK, false) +
    circle(58, 74, 3.6, INK, false),
  radish:
    shape('M50 32 C42 18 32 16 30 22 C38 22 44 28 48 34Z', LEAF) +
    shape('M50 32 C58 18 68 16 70 22 C62 22 56 28 52 34Z', LEAF) +
    shape(
      'M50 32 C34 32 30 52 40 62 C44 66 48 72 50 86 C52 72 56 66 60 62 C70 52 66 32 50 32Z',
      '#E0306A',
    ) +
    oval(44, 46, 4, 6, '#fff', false, 20),
  rug:
    shape('M22 40 H78 L86 72 H14Z', '#E5484D') +
    shape('M30 46 H70 L75 66 H25Z', '#FFD23F') +
    shape('M50 49 L60 56 L50 63 L40 56Z', '#3B82F6') +
    line(
      'M16 72 v6 M26 72 v6 M36 72 v6 M46 72 v6 M56 72 v6 M66 72 v6 M76 72 v6 M84 72 v6',
      1.8,
    ),
  turtle:
    oval(82, 58, 9, 8, '#86D19B') +
    eyes(80, 86, 56, 1.8) +
    oval(30, 72, 7, 5, '#86D19B') +
    oval(64, 74, 7, 5, '#86D19B') +
    shape('M18 70 C18 44 34 34 50 34 C66 34 80 44 80 70Z', LEAF) +
    shape('M40 52 L50 46 L60 52 L58 62 H42Z', '#86D19B') +
    line('M40 52 L28 50 M60 52 L72 50 M42 62 L36 70 M58 62 L64 70', 1.6),
  rocket:
    shape('M50 12 C62 22 66 40 64 62 H36 C34 40 38 22 50 12Z', '#fff') +
    shape('M50 12 C56 17 60 22 62 28 H38 C40 22 44 17 50 12Z', '#E5484D') +
    shape('M36 50 L24 66 L36 64Z M64 50 L76 66 L64 64Z', '#E5484D') +
    circle(50, 42, 6, '#BFE3FF') +
    shape('M40 64 H60 C58 76 54 82 50 88 C46 82 42 76 40 64Z', '#F97316') +
    flat('M45 66 H55 C54 74 52 78 50 82 C48 78 46 74 45 66Z', '#FFD23F'),
  sink:
    rect(46, 22, 8, 12, 2, METAL) +
    line('M50 22 V16 H60', 3) +
    shape('M20 40 H80 C80 58 66 66 50 66 C34 66 20 58 20 40Z', '#fff') +
    oval(50, 44, 22, 4, '#BFE3FF', false) +
    rect(44, 66, 12, 18, 2, '#fff'),
  sofa:
    rect(22, 34, 56, 24, 8, '#3B82F6') +
    rect(14, 46, 14, 26, 6, '#3B82F6') +
    rect(72, 46, 14, 26, 6, '#3B82F6') +
    rect(26, 54, 48, 16, 4, '#60A5FA') +
    line('M50 54 V70 M22 72 V80 M78 72 V80', 2.6),
  kiwi:
    oval(38, 52, 20, 24, '#8D5A3B') +
    circle(62, 54, 22, '#86D19B') +
    circle(62, 54, 8, '#F5F0D8', false) +
    line(
      'M62 40 v2 M74 48 h-2 M72 64 l-2 -2 M52 64 l2 -2 M50 48 h2 M70 42 l-2 2 M54 42 l2 2',
      2.4,
    ),
  robot:
    line('M50 18 V26', 2.4) +
    circle(50, 16, 3.6, '#E5484D') +
    rect(32, 26, 36, 26, 6, METAL) +
    circle(42, 38, 5, '#fff') +
    circle(58, 38, 5, '#fff') +
    eyes(42, 58, 38, 2.2) +
    line('M44 46 H56', 2) +
    rect(28, 56, 44, 26, 4, '#60A5FA') +
    circle(50, 68, 5, '#FFD23F'),
  suitcase:
    rect(40, 22, 20, 10, 3, '#8D5A3B') +
    rect(20, 32, 60, 42, 6, '#F97316') +
    line('M34 32 V74 M66 32 V74', 2.4) +
    circle(30, 78, 4, '#2B2B33') +
    circle(70, 78, 4, '#2B2B33'),
  tulip:
    line('M50 46 V86', 3) +
    shape('M50 70 C40 68 32 58 34 50 C42 54 48 60 50 70Z', LEAF) +
    shape('M50 76 C60 74 68 64 66 56 C58 60 52 66 50 76Z', LEAF) +
    shape(
      'M36 22 L42 30 L50 18 L58 30 L64 22 C68 36 62 48 50 48 C38 48 32 36 36 22Z',
      '#E5484D',
    ),
  // words of the sounds to learn
  wolf:
    shape('M28 40 L30 16 L44 30Z M72 40 L70 16 L56 30Z', GREY) +
    shape(
      'M24 42 C24 30 76 30 76 42 C76 58 64 70 50 74 C36 70 24 58 24 42Z',
      GREY,
    ) +
    shape(
      'M38 54 C42 50 58 50 62 54 C60 66 54 72 50 72 C46 72 40 66 38 54Z',
      '#fff',
    ) +
    eyes(40, 60, 44, 2.4) +
    oval(50, 58, 4, 3, INK, false),
  cabbage:
    shape(
      'M50 84 C30 84 14 72 16 54 C10 46 14 34 24 34 C26 24 38 18 48 22 C58 16 72 22 74 32 C86 32 92 46 84 56 C88 72 70 84 50 84Z',
      LEAF,
    ) +
    shape(
      'M50 80 C34 80 24 68 26 54 C26 40 36 32 50 32 C64 32 74 40 74 54 C76 68 66 80 50 80Z',
      '#86D19B',
    ) +
    shape(
      'M50 76 C40 76 34 66 36 56 C38 46 44 42 50 42 C56 42 62 46 64 56 C66 66 60 76 50 76Z',
      '#B5E5C0',
    ) +
    line(
      'M50 44 C46 54 46 66 50 76 M50 58 C56 54 60 52 62 50 M50 66 C44 62 40 60 38 58',
      1.6,
    ) +
    line(
      'M22 50 C30 50 34 56 34 62 M78 50 C70 50 66 56 66 62 M36 30 C42 34 44 38 44 42 M64 30 C58 34 56 38 56 42',
      1.6,
    ),
  soup:
    line('M40 30 C36 24 44 22 40 16 M54 30 C50 24 58 22 54 16', 2) +
    rect(60, 20, 6, 30, 3, METAL) +
    shape('M18 42 H82 C82 62 68 76 50 76 C32 76 18 62 18 42Z', '#fff') +
    oval(50, 42, 32, 6, '#F97316'),
  wheel:
    circle(50, 50, 32, '#2B2B33') +
    circle(50, 50, 20, METAL) +
    circle(50, 50, 5, '#fff') +
    line(
      'M50 30 V45 M50 55 V70 M30 50 H45 M55 50 H70 M36 36 L46 46 M54 54 L64 64 M64 36 L54 46 M46 54 L36 64',
      2,
    ),
  tooth:
    shape(
      'M28 30 C28 18 42 18 50 24 C58 18 72 18 72 30 C72 46 66 52 64 66 C62 80 56 82 54 70 C52 62 48 62 46 70 C44 82 38 80 36 66 C34 52 28 46 28 30Z',
      '#fff',
    ) +
    eyes(42, 58, 38, 2.2) +
    smile(50, 46, 4),
  king:
    rabbit({ ears: false, y: 6 }) +
    shape('M30 36 L32 16 L41 28 L50 12 L59 28 L68 16 L70 36Z', '#FFD23F') +
    circle(50, 22, 2.6, '#E5484D'),
  fire:
    rect(24, 72, 52, 8, 4, WOOD) +
    rect(30, 66, 40, 8, 4, '#8D5A3B') +
    shape(
      'M50 14 C60 30 72 38 70 54 C68 66 58 70 50 70 C42 70 32 66 30 54 C28 40 42 34 40 22 C46 28 48 22 50 14Z',
      '#F97316',
    ) +
    shape(
      'M50 38 C56 46 62 52 60 60 C58 66 54 68 50 68 C46 68 40 66 40 60 C40 52 48 50 50 38Z',
      '#FFD23F',
    ),
  goat:
    shape(
      'M38 28 C34 18 26 14 22 18 C28 20 32 24 34 32Z M62 28 C66 18 74 14 78 18 C72 20 68 24 66 32Z',
      '#C9B79C',
    ) +
    shape(
      'M24 40 C18 38 14 44 20 46 C24 47 28 45 30 42Z M76 40 C82 38 86 44 80 46 C76 47 72 45 70 42Z',
      '#fff',
    ) +
    shape(
      'M32 34 C32 24 68 24 68 34 C68 50 60 64 50 66 C40 64 32 50 32 34Z',
      '#fff',
    ) +
    eyes(42, 58, 40, 2.2) +
    oval(50, 56, 7, 5, '#FFB3C5') +
    shape('M46 64 L50 80 L54 64Z', '#E8E2D6'),
  mushroom:
    rect(40, 50, 20, 32, 8, '#F5F0D8') +
    shape('M16 54 C16 28 34 18 50 18 C66 18 84 28 84 54Z', '#E5484D') +
    circle(34, 38, 4, '#fff', false) +
    circle(52, 28, 4, '#fff', false) +
    circle(66, 42, 4, '#fff', false) +
    circle(46, 46, 3, '#fff', false),
  mountain:
    shape('M8 80 L38 26 L68 80Z', '#8E8AA8') +
    shape('M40 80 L66 38 L92 80Z', '#A9A5C2') +
    shape('M30 40 L38 26 L46 40 L42 44 L38 40 L34 44Z', '#fff') +
    shape('M60 48 L66 38 L72 48 L68 51 L64 48Z', '#fff'),
  spider:
    line('M50 14 V30', 1.4) +
    line(
      'M40 48 L22 36 L16 44 M40 54 L18 54 L14 62 M42 60 L24 70 L22 80 M44 64 L34 78 M60 48 L78 36 L84 44 M60 54 L82 54 L86 62 M58 60 L76 70 L78 80 M56 64 L66 78',
      2.4,
    ) +
    circle(50, 56, 14, '#4B4458') +
    circle(50, 36, 8, '#4B4458') +
    eyes(47, 53, 36, 1.8),
  bee:
    oval(38, 34, 12, 8, '#E6F4FF', true, -30) +
    oval(60, 32, 12, 8, '#E6F4FF', true, 30) +
    oval(50, 56, 26, 18, '#FFD23F') +
    flat('M44 39 C40 46 40 66 44 73 L50 74 C46 66 46 46 50 38Z', INK) +
    flat('M58 40 C54 48 54 64 58 72 L63 70 C60 62 60 50 63 42Z', INK) +
    eyes(70, 70, 52, 2) +
    smile(72, 60, 2.4) +
    shape('M24 56 L16 56 L24 60Z', '#4B4458'),
  seal:
    shape(
      'M14 76 C20 62 36 52 52 50 C56 36 64 28 72 30 C82 32 86 44 80 54 C78 66 70 78 56 80Z',
      GREY,
    ) +
    shape('M40 66 L30 80 L46 76Z', '#8E8AA8') +
    eyes(70, 76, 40, 2) +
    oval(80, 46, 3, 2.4, INK, false) +
    line('M82 50 l8 -2 M82 52 l8 2', 1.2),
  dolphin:
    shape(
      'M14 62 C24 40 50 30 72 38 C80 40 86 46 88 50 L76 50 C74 58 66 66 56 66 L60 76 L48 66 C36 66 24 64 14 62Z',
      '#60A5FA',
    ) +
    shape('M50 34 L56 22 L62 36Z', '#60A5FA') +
    shape('M14 62 L6 54 M14 62 L8 72', '#60A5FA') +
    shape(
      'M20 60 C34 62 50 62 64 56 C58 62 52 64 46 64 C36 66 26 64 20 60Z',
      '#BFE3FF',
    ) +
    eye(68, 44, 2),
  shark:
    shape(
      'M10 58 C24 40 56 34 76 44 C84 48 90 54 90 58 C80 64 60 68 40 66 C30 66 18 64 10 58Z',
      GREY,
    ) +
    shape('M46 40 L52 22 L60 42Z', GREY) +
    shape('M10 58 L4 46 L16 54 M10 58 L4 70 L16 62', GREY) +
    shape('M64 58 L84 58 L80 62 H68Z', '#fff') +
    line('M68 58 l2 3 l2 -3 l2 3 l2 -3 l2 3', 1.2) +
    eye(76, 50, 2),
  guitar:
    rect(46, 10, 8, 40, 2, WOOD) +
    line('M48 12 V58 M52 12 V58', 1) +
    shape(
      'M50 44 C34 40 26 50 30 60 C22 70 30 88 50 86 C70 88 78 70 70 60 C74 50 66 40 50 44Z',
      '#F97316',
    ) +
    circle(50, 62, 6, '#4B4458') +
    rect(42, 74, 16, 4, 1, '#8D5A3B'),
  'ice-cube':
    shape('M30 40 L50 30 L74 38 L74 66 L54 76 L30 68Z', '#BFE3FF') +
    line('M30 40 L54 48 L74 38 M54 48 V76') +
    flat('M36 46 L44 49 L44 58 L36 55Z', '#fff', 0.8),
  giraffe:
    shape('M38 88 C40 76 42 66 42 58 H58 C58 66 60 76 62 88Z', '#FFD23F') +
    circle(46, 70, 3.4, '#C08457', false) +
    circle(55, 80, 3.8, '#C08457', false) +
    circle(52, 64, 2.6, '#C08457', false) +
    line('M43 30 L40 14 M57 30 L60 14', 3.4) +
    circle(40, 13, 3.6, '#8D5A3B') +
    circle(60, 13, 3.6, '#8D5A3B') +
    oval(26, 32, 9, 4.6, '#FFD23F', true, -25) +
    oval(74, 32, 9, 4.6, '#FFD23F', true, 25) +
    oval(50, 40, 19, 18, '#FFD23F') +
    circle(38, 30, 3, '#C08457', false) +
    circle(62, 30, 3, '#C08457', false) +
    circle(50, 25, 2.4, '#C08457', false) +
    oval(50, 52, 13, 9, '#F5D3AE') +
    eyes(42, 58, 38, 2.4) +
    oval(46, 51, 1.6, 2.2, INK, false) +
    oval(54, 51, 1.6, 2.2, INK, false) +
    smile(50, 56, 3),
  cage:
    line('M50 10 V18', 2.4) +
    shape('M24 44 C24 26 76 26 76 44 V80 H24Z', 'none') +
    line('M34 30 V80 M42 27 V80 M50 26 V80 M58 27 V80 M66 30 V80', 1.6) +
    rect(20, 78, 60, 8, 2, '#FFD23F') +
    oval(50, 62, 8, 7, '#FFD23F') +
    eye(52, 60, 1.8) +
    shape('M57 62 L62 63 L57 65Z', '#F97316'),
  panda:
    circle(28, 32, 10, '#2B2B33') +
    circle(72, 32, 10, '#2B2B33') +
    oval(50, 54, 28, 25, '#fff') +
    oval(40, 50, 7, 9, '#2B2B33', false, 20) +
    oval(60, 50, 7, 9, '#2B2B33', false, -20) +
    eyes(41, 59, 50, 2) +
    oval(50, 62, 4, 3, INK, false) +
    smile(50, 68, 3),
  skirt:
    rect(30, 22, 40, 9, 3, '#8E4EC6') +
    circle(50, 26.5, 2.6, '#FFD23F') +
    shape(
      'M30 31 H70 L84 72 C80 78 74 74 70 78 C66 82 60 76 56 80 C52 84 48 84 44 80 C40 76 34 82 30 78 C26 74 20 78 16 72Z',
      '#F472B6',
    ) +
    line('M40 31 L34 78 M50 31 V82 M60 31 L66 78', 1.4) +
    circle(40, 52, 2.2, '#fff', false) +
    circle(58, 46, 2.2, '#fff', false) +
    circle(30, 66, 2.2, '#fff', false) +
    circle(72, 64, 2.2, '#fff', false) +
    circle(50, 66, 2.2, '#fff', false),
  juice:
    line('M58 12 L52 34', 3) +
    shape('M32 26 H68 L62 84 H38Z', '#fff') +
    shape('M34 40 H66 L62 84 H38Z', '#F97316') +
    circle(70, 28, 8, '#F97316') +
    line('M70 22 V34 M64 28 H76', 1.2),
  zebra:
    shape('M36 26 L34 12 L44 22Z M64 26 L66 12 L56 22Z', '#fff') +
    shape(
      'M30 40 C30 22 70 22 70 40 C70 58 62 74 50 76 C38 74 30 58 30 40Z',
      '#fff',
    ) +
    line(
      'M33 36 C40 34 44 38 46 42 M67 36 C60 34 56 38 54 42 M32 46 H40 M68 46 H60 M44 24 V32 M50 22 V30 M56 24 V32',
      3,
    ) +
    oval(50, 64, 14, 11, '#4B4458') +
    eyes(41, 59, 48, 2.2) +
    circle(45, 64, 1.8, '#fff', false) +
    circle(55, 64, 1.8, '#fff', false),
  koala:
    circle(26, 36, 14, GREY) +
    circle(74, 36, 14, GREY) +
    circle(26, 36, 7, '#F5E6EC', false) +
    circle(74, 36, 7, '#F5E6EC', false) +
    oval(50, 54, 26, 24, GREY) +
    eyes(40, 60, 48, 2.2) +
    oval(50, 60, 6, 9, '#2B2B33') +
    smile(50, 72, 3),
  plane:
    shape(
      'M14 50 C14 44 22 42 30 42 H76 C84 42 90 46 90 50 C90 54 84 58 76 58 H30 C22 58 14 56 14 50Z',
      '#fff',
    ) +
    shape('M44 44 L32 20 H42 L60 44Z M44 56 L32 80 H42 L60 56Z', '#3B82F6') +
    shape('M20 44 L14 30 H22 L30 44Z', '#3B82F6') +
    circle(70, 48, 3, '#BFE3FF') +
    circle(60, 48, 3, '#BFE3FF') +
    circle(80, 48, 3, '#BFE3FF'),
  igloo:
    shape('M14 74 C14 46 30 30 50 30 C70 30 86 46 86 74Z', '#fff') +
    line(
      'M18 60 H82 M16 70 H84 M24 48 H76 M34 38 H66 M40 30 V38 M60 30 V38 M30 48 V60 M50 38 V48 M70 48 V60 M40 60 V70',
      1.4,
    ) +
    shape('M40 74 C40 60 60 60 60 74Z', '#3E2F86'),
  bus:
    rect(12, 30, 76, 40, 6, '#FFD23F') +
    rect(18, 36, 14, 12, 2, '#BFE3FF') +
    rect(36, 36, 14, 12, 2, '#BFE3FF') +
    rect(54, 36, 14, 12, 2, '#BFE3FF') +
    rect(72, 36, 10, 22, 2, '#BFE3FF') +
    circle(28, 72, 7, '#2B2B33') +
    circle(70, 72, 7, '#2B2B33') +
    circle(28, 72, 2.6, METAL, false) +
    circle(70, 72, 2.6, METAL, false),
})

// ── CE2: the living world, food, matter, electricity and times past ──

const YELLOW = '#FFD23F'
// A circuit: a battery on the left, a bulb on the right, two wires.
const battery = (x, y) =>
  rect(x, y, 16, 30, 2, '#4B4458') +
  rect(x, y, 16, 12, 2, '#F97316') +
  rect(x + 5, y - 4, 6, 4, 1, METAL) +
  line(`M${x + 8} ${y + 3} V${y + 9} M${x + 5} ${y + 6} H${x + 11}`, 1.4) +
  line(`M${x + 5} ${y + 23} H${x + 11}`, 1.4)
const bulb = (x, y, lit) =>
  (lit
    ? line(
        `M${x - 16} ${y - 8} l-6 -3 M${x + 16} ${y - 8} l6 -3 M${x} ${y - 24} v-6 M${x - 12} ${y - 20} l-4 -5 M${x + 12} ${y - 20} l4 -5`,
        1.8,
      )
    : '') +
  shape(
    `M${x - 10} ${y + 8} C${x - 18} ${y} ${x - 14} ${y - 18} ${x} ${y - 18} C${x + 14} ${y - 18} ${x + 18} ${y} ${x + 10} ${y + 8}Z`,
    lit ? YELLOW : '#F4F1FA',
  ) +
  line(
    `M${x - 4} ${y + 6} L${x - 2} ${y - 4} L${x + 2} ${y - 4} L${x + 4} ${y + 6}`,
    1.2,
  ) +
  rect(x - 9, y + 8, 18, 10, 2, METAL)
const circuit = ({ cut = false, lit = false, open = false, same = false }) => {
  const knob = x => circle(x, 20, 2, INK, false)
  // The top wire: from + through the switch, round to the side of the bulb.
  const top =
    line('M22 36 V20 H36', 1.8) +
    (open ? line('M36 20 L48 10', 2.4) : line('M36 20 H50', 2.4)) +
    knob(36) +
    knob(50) +
    line('M50 20 H90 V60 H81', 1.8)
  // The bottom wire, to the tip of the bulb: from -, or from + again.
  const bottom = same
    ? line('M22 30 H8 V86 H72 V64', 1.8)
    : cut
      ? line('M22 70 V86 H40 M52 86 H72 V64', 1.8) +
        line('M40 86 l3 -4 M52 86 l-3 4', 1.6)
      : line('M22 70 V86 H72 V64', 1.8)
  return battery(14, 40) + bulb(72, 46, lit) + top + bottom
}

Object.assign(DRAWINGS, {
  lizard:
    shape(
      'M16 62 C26 52 40 50 54 52 C66 52 74 46 84 48 C90 50 90 56 84 58 C74 60 66 62 56 64 C44 68 30 70 16 62Z',
      '#7BC96F',
    ) +
    shape('M16 62 C10 66 6 74 12 80 C10 72 14 68 20 66Z', '#7BC96F') +
    line(
      'M40 54 L34 44 L30 44 M40 64 L34 74 L30 74 M62 54 L66 44 L70 44 M60 62 L64 72 L68 72',
      2.4,
    ) +
    eye(80, 51, 1.8),
  crocodile:
    shape(
      'M8 58 C14 48 30 46 44 48 H74 L92 52 C94 56 92 60 88 60 H76 C70 64 60 66 48 66 C30 68 16 66 8 58Z',
      '#4CA36A',
    ) +
    line('M76 56 H92', 1.4) +
    line('M78 56 l2 -3 l2 3 l2 -3 l2 3 l2 -3 l2 3', 1.2) +
    line('M30 48 l3 -4 l3 4 l3 -4 l3 4 l3 -4 l3 4', 1.6) +
    line('M30 66 L26 76 M56 66 L60 76', 3) +
    circle(68, 46, 4, '#4CA36A') +
    eye(68, 45, 1.8),
  bat:
    shape(
      'M50 40 C40 30 26 26 10 32 C16 38 16 44 12 50 C20 46 26 48 30 54 C34 48 42 48 50 54 C58 48 66 48 70 54 C74 48 80 46 88 50 C84 44 84 38 90 32 C74 26 60 30 50 40Z',
      '#6B5B95',
    ) +
    oval(50, 46, 9, 11, '#6B5B95') +
    shape('M43 38 L42 28 L48 35Z M57 38 L58 28 L52 35Z', '#6B5B95') +
    eyes(46, 54, 44, 1.8) +
    line('M47 51 l1.5 2 l1.5 -2 M50 51 l1.5 2 l1.5 -2', 1),
  penguin:
    oval(50, 56, 22, 30, '#2B2B33') +
    oval(50, 62, 15, 22, '#fff', false) +
    oval(50, 34, 11, 9, '#fff', false) +
    eyes(45, 55, 34, 2) +
    shape('M46 40 L54 40 L50 46Z', '#F97316') +
    shape('M28 52 C20 62 22 72 30 74Z M72 52 C80 62 78 72 70 74Z', '#2B2B33') +
    oval(42, 86, 7, 3, '#F97316') +
    oval(58, 86, 7, 3, '#F97316'),
  frogspawn:
    shape('M14 60 C20 46 80 46 86 60 C80 74 20 74 14 60Z', '#BFE3FF', 0.7) +
    [
      [26, 58],
      [36, 54],
      [46, 58],
      [56, 54],
      [66, 58],
      [76, 60],
      [32, 64],
      [42, 66],
      [52, 64],
      [62, 66],
      [72, 66],
    ]
      .map(
        ([x, y]) =>
          circle(x, y, 5, '#E6F4FF') + circle(x, y, 1.8, '#2B2B33', false),
      )
      .join(''),
  tadpole:
    shape(
      'M30 50 C30 38 50 38 54 46 C66 44 80 36 88 42 C80 50 70 52 58 54 C54 62 30 62 30 50Z',
      '#4B4458',
    ) + eye(38, 48, 2),
  caterpillar:
    [20, 32, 44, 56, 68]
      .map((x, i) =>
        circle(x, 58 - (i % 2) * 6, 9, i % 2 ? '#7BC96F' : '#A3D977'),
      )
      .join('') +
    circle(80, 48, 11, '#7BC96F') +
    eyes(76, 84, 46, 1.8) +
    line('M76 38 L72 28 M84 38 L88 28', 1.8) +
    smile(80, 52, 2.6),
  chrysalis:
    line('M50 10 V22 M30 12 H70', 2) +
    shape(
      'M50 22 C64 26 66 48 60 66 C56 78 52 84 50 88 C48 84 44 78 40 66 C34 48 36 26 50 22Z',
      '#C9A86A',
    ) +
    line(
      'M42 40 C48 44 52 44 58 40 M41 54 C48 58 52 58 59 54 M44 68 C48 70 52 70 56 68',
      1.4,
    ),
  pasta:
    shape('M14 56 C14 76 86 76 86 56Z', '#fff') +
    line('M14 56 H86') +
    line(
      'M26 56 C30 44 36 52 40 42 C44 34 50 48 54 40 C58 32 62 46 68 40 C72 36 74 48 76 56',
      3.4,
    ) +
    line('M30 56 C34 46 40 50 46 44 M56 56 C60 46 66 50 70 44', 3) +
    circle(50, 46, 5, '#E5484D'),
  rice:
    shape('M14 56 C14 76 86 76 86 56Z', '#60A5FA') +
    shape('M18 56 C20 38 80 38 82 56Z', '#fff') +
    line(
      'M34 46 l3 1 M44 42 l3 -1 M54 46 l3 1 M64 44 l2 2 M40 52 l3 0 M58 52 l3 -1 M48 50 l2 2',
      1.4,
    ),
  yogurt:
    shape('M30 30 H70 L66 84 H34Z', '#fff') +
    shape('M28 24 H72 V32 H28Z', '#F472B6') +
    shape('M32 46 H68 L66 62 H34Z', '#FFB3C5') +
    circle(50, 54, 4, '#E5484D', false),
  steak:
    shape(
      'M18 54 C18 34 46 30 62 36 C80 42 86 58 74 68 C62 78 30 78 22 68 C19 64 18 60 18 54Z',
      '#C2410C',
    ) +
    shape(
      'M30 52 C34 44 50 42 58 48 C62 54 54 60 44 60 C36 60 30 58 30 52Z',
      '#F5D3AE',
    ) +
    line('M28 64 C40 70 60 70 70 62', 1.4),
  butter:
    shape('M14 64 L34 76 L86 60 L66 50Z', '#fff') +
    shape('M24 52 L38 60 V70 L24 62Z', YELLOW) +
    shape('M24 52 L64 40 L78 48 L38 60Z', '#FFE58F') +
    shape('M38 60 L78 48 V58 L38 70Z', YELLOW),
  kettle:
    shape('M24 80 C20 56 30 40 50 40 C70 40 80 56 76 80Z', '#60A5FA') +
    line('M36 40 C36 26 64 26 64 40', 3) +
    shape('M76 62 L90 50 L92 54 L80 70Z', '#60A5FA') +
    circle(50, 38, 3, '#2B2B33') +
    line('M90 40 C86 34 94 30 90 24 M84 38 C80 32 88 28 84 22', 1.6),
  battery: battery(42, 30) + line('M50 26 V18', 1.6) + line('M50 66 V78', 1.6),
  bulb: bulb(50, 48, true),
  socket:
    rect(22, 22, 56, 56, 10, '#fff') +
    circle(50, 50, 18, '#F4F1FA') +
    circle(42, 50, 3, INK, false) +
    circle(58, 50, 3, INK, false) +
    shape('M76 14 L66 34 H74 L64 56 L84 28 H76 L84 14Z', YELLOW),
  'circuit-closed': circuit({ lit: true }),
  'circuit-open': circuit({ open: true }),
  'circuit-cut': circuit({ cut: true }),
  'circuit-same': circuit({ same: true }),
  mammoth:
    shape(
      'M14 58 C14 34 34 24 56 26 C74 28 84 40 84 54 C84 60 82 64 80 66 V82 H70 V68 H58 V82 H48 V68 H36 V82 H26 V68 C18 66 14 62 14 58Z',
      '#8D5A3B',
    ) +
    shape(
      'M80 48 C90 54 90 70 86 80 C84 82 80 80 82 76 C84 70 82 62 76 58Z',
      '#8D5A3B',
    ) +
    shape('M74 58 C76 70 70 76 60 76 C66 72 68 66 66 60Z', '#FFF8EE') +
    line('M24 40 l-2 6 M32 34 l-2 6 M42 30 l-1 6', 1.4) +
    eye(70, 44, 2),
  castle:
    shape('M14 84 V40 H22 V34 H28 V40 H34 V34 H40 V40 H46 V84Z', METAL) +
    shape('M54 84 V40 H60 V34 H66 V40 H72 V34 H78 V40 H86 V84Z', METAL) +
    shape('M34 84 V52 H66 V84Z', '#D9D6E4') +
    shape('M42 84 V68 C42 60 58 60 58 68 V84Z', '#8D5A3B') +
    line('M30 20 V40', 1.6) +
    shape('M30 20 L44 25 L30 30Z', '#E5484D') +
    rect(26, 52, 6, 10, 3, '#2B2B33') +
    rect(68, 52, 6, 10, 3, '#2B2B33'),
  temple:
    shape('M12 36 L50 16 L88 36Z', '#FFF8EE') +
    rect(14, 36, 72, 7, 1, '#FFF8EE') +
    [22, 38, 54, 70].map(x => rect(x, 43, 8, 34, 1, '#FFF8EE')).join('') +
    rect(10, 77, 80, 7, 1, '#FFF8EE'),
  candle:
    rect(38, 42, 24, 40, 3, '#fff') +
    line('M50 42 V34', 1.6) +
    shape('M50 12 C58 22 58 32 50 34 C42 32 42 22 50 12Z', YELLOW) +
    shape('M50 20 C54 26 54 30 50 32 C46 30 46 26 50 20Z', '#F97316') +
    oval(50, 84, 22, 5, '#F97316'),
  phone:
    rect(32, 14, 36, 72, 7, '#2B2B33') +
    rect(36, 22, 28, 52, 2, '#BFE3FF') +
    circle(50, 80, 2.6, METAL, false) +
    rect(40, 30, 8, 8, 2, '#F97316') +
    rect(52, 30, 8, 8, 2, '#30A46C') +
    rect(40, 44, 8, 8, 2, '#E5484D') +
    rect(52, 44, 8, 8, 2, YELLOW),
  computer:
    rect(18, 20, 64, 44, 4, '#4B4458') +
    rect(23, 25, 54, 34, 2, '#BFE3FF') +
    shape('M42 64 H58 L60 74 H40Z', METAL) +
    rect(28, 74, 44, 6, 2, METAL) +
    rect(30, 32, 20, 4, 1, '#fff') +
    rect(30, 40, 30, 4, 1, '#fff'),
})

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
  home: '#FFF1E6',
  school: '#E8F1FF',
  feeling: '#FFE6EC',
  nature: '#E6F4FF',
  object: '#F4F1FA',
}
const GROUPS = {
  animal:
    'cat dog rabbit bird fish horse cow pig duck mouse sheep frog lion elephant bear snake ' +
    'llama turtle wolf goat spider bee seal dolphin shark giraffe panda zebra koala ' +
    'hen chick calf lamb foal kitten puppy piglet duckling rat fox owl hedgehog whale crab octopus butterfly snail worm ' +
    'lizard crocodile bat penguin frogspawn tadpole caterpillar chrysalis mammoth',
  family: 'mum dad baby grandma grandpa sister brother king',
  body: 'head eye nose mouth ear hand foot tooth',
  food:
    'apple banana orange strawberry pear cherry grapes lemon carrot bread milk cake egg cheese ice-cream ' +
    'honey candy soda salad leek potato peas bone tomato radish kiwi cabbage soup juice ice-cube mushroom ' +
    'pasta rice yogurt steak butter',
  toy: 'ball doll teddy car kite book train bike boat motorbike domino robot guitar plane bus rocket',
  weather: 'sun rain snow wind cloud rainbow',
  clothes: 'hat shoes socks coat t-shirt dress scarf skirt',
  home: 'house bed table chair door window lamp bathtub sink sofa rug',
  school: 'schoolbag pencil scissors glue notebook paintbrush board',
  feeling: 'happy sad angry scared surprised',
  nature:
    'moon star snowman flower leaf fir grass barn wave tulip fire mountain igloo',
  object:
    'spoon key bottle bucket cork stone coin toothbrush truck log bag bowl suitcase wheel cage ' +
    'kettle battery bulb socket circuit-closed circuit-open circuit-cut circuit-same castle temple candle phone computer',
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
