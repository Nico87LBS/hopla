// Writes the list of the drawings a card may show, from public/drawings,
// and the zones of each picture in zones, from public/drawings/zones, into
// src/utils/learn/drawings.js. Run it after adding a drawing.
//
//   node scripts/drawing-list.mjs

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const folder = new URL('../public/drawings/', import.meta.url)
const svgs = dir =>
  readdirSync(dir)
    .filter(name => name.endsWith('.svg'))
    .map(name => name.slice(0, -4))
    .sort()

const names = svgs(folder)
const zonesFolder = new URL('zones/', folder)
const zones = svgs(zonesFolder).map(picture => {
  const svg = readFileSync(new URL(`${picture}.svg`, zonesFolder), 'utf8')
  const found = [...svg.matchAll(/data-zone="([^"]+)" data-nom="([^"]+)"/g)]
  const seen = new Set()
  const list = found
    .filter(([, zone]) => !seen.has(zone) && seen.add(zone))
    .map(([, zone, nom]) => `    ['${zone}', ${JSON.stringify(nom)}],`)
  return `  '${picture}': [\n${list.join('\n')}\n  ],`
})

writeFileSync(
  new URL('../src/utils/learn/drawings.js', import.meta.url),
  `// The drawings of the catalogue, kept in public/drawings, that a card may
// show, and the zones of each picture in zones (public/drawings/zones), as
// [id, name]. A test checks the lists against the folders; after adding a
// drawing: node scripts/drawing-list.mjs

export const DRAWINGS = [
${names.map(name => `  '${name}',`).join('\n')}
]

export const ZONE_PICTURES = {
${zones.join('\n')}
}
`,
)
