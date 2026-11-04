// Writes the list of the drawings a card may show, from public/drawings,
// into src/utils/learn/drawings.js. Run it after adding a drawing.
//
//   node scripts/drawing-list.mjs

import { readdirSync, writeFileSync } from 'node:fs'

const folder = new URL('../public/drawings/', import.meta.url)
const names = readdirSync(folder)
  .filter(name => name.endsWith('.svg'))
  .map(name => name.slice(0, -4))
  .sort()

const body = names.map(name => `  '${name}',`).join('\n')
writeFileSync(
  new URL('../src/utils/learn/drawings.js', import.meta.url),
  `// The drawings of the catalogue, kept in public/drawings, that a card may
// show. A test checks the list against the folder; after adding a drawing:
// node scripts/drawing-list.mjs

export const DRAWINGS = [
${body}
]
`,
)
