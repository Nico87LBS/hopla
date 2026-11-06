// How a parent opens a pack for a person by hand, and how the page of a pack
// lists what it holds. The choices are kept with the person's pack: a level
// open ("force-open:level") or set aside ("level"), a chapter open
// ("chapitre-ouvert:module/chapitre") or closed ("chapitre-ferme:...").

import { DEFAULT_SETTINGS } from './engine.js'

const OPEN = 'chapitre-ouvert:'
const SHUT = 'chapitre-ferme:'

// levelAccessOf is what a parent chose for a level: auto, open or locked.
export const levelAccessOf = (excluded = [], key) => {
  if (excluded.includes(`force-open:${key}`)) return 'open'
  return excluded.includes(key) ? 'locked' : 'auto'
}

// chapterAccessOf is what a parent chose for a chapter, "module/chapitre".
export const chapterAccessOf = (excluded = [], key) => {
  if (excluded.includes(`${OPEN}${key}`)) return 'open'
  return excluded.includes(`${SHUT}${key}`) ? 'locked' : 'auto'
}

// groupAccessOf is the one choice shared by every chapter of a list, or auto
// when they differ.
export const groupAccessOf = (excluded = [], keys) => {
  const modes = new Set(keys.map(key => chapterAccessOf(excluded, key)))
  return modes.size === 1 ? [...modes][0] : 'auto'
}

// packStructure reads the levels of a pack, each with its modules and their
// chapters, from what the test of the pack gives.
export const packStructure = test =>
  (test?.levels || []).map(level => ({
    id: level.id,
    name: level.name,
    modules: (level.modules || []).map(module => ({
      id: module.id,
      name: module.name,
      chapters: module.document?.chapitres || [],
    })),
  }))

// packRows lists what the page of a pack shows, in order: a row for each
// level (when there are several), for each title of a group of chapters, for
// each level written in a chapter of a pack the family wrote, and for each
// chapter. A group is a title only: the name of the module in the catalogue,
// or the one written in the chapter.
export const packRows = structure => {
  const rows = []
  let niveau = null
  structure.forEach(level => {
    if (structure.length > 1)
      rows.push({ kind: 'level', id: level.id, name: level.name })
    level.modules.forEach(module => {
      let group = null
      module.chapters.forEach(chapter => {
        const key = `${module.id}/${chapter.id}`
        if (chapter.niveau && chapter.niveau !== niveau) {
          niveau = chapter.niveau
          rows.push({ kind: 'niveau', name: niveau, keys: [] })
        }
        const title =
          chapter.groupe || (level.modules.length > 1 ? module.name : '')
        if (title && title !== group) {
          group = title
          rows.push({ kind: 'group', name: title, module: module.id })
        }
        rows.push({ kind: 'chapter', key, module: module.id, chapter })
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i].kind === 'niveau') {
            rows[i].keys.push(key)
            break
          }
        }
      })
    })
  })
  return rows
}

// keysOf lists every chapter of a structure, "module/chapitre".
export const keysOf = structure =>
  structure.flatMap(level =>
    level.modules.flatMap(module =>
      module.chapters.map(chapter => `${module.id}/${chapter.id}`),
    ),
  )

// creatorValue is what the writer of a pack set for a setting: the value its
// modules share, else the usual one; null when they differ.
export const creatorValue = (field, modules, defaults, structure) => {
  if (field.name === 'unlockPercent') {
    const values = new Set(
      structure.flatMap(level =>
        level.modules.flatMap(module =>
          module.chapters.map(chapter => chapter.ouvert_apres || 0),
        ),
      ),
    )
    values.delete(0)
    return values.size === 1 ? [...values][0] : null
  }
  if (!field.own) return null
  const values = new Set(
    modules.map(
      m => defaults[m.id]?.[field.own] ?? DEFAULT_SETTINGS[field.own],
    ),
  )
  return values.size === 1 ? [...values][0] : null
}
