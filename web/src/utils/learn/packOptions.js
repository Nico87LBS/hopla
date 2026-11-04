// The settings of a whole pack written in the family's editor: what the
// file holds beside its chapters and cards, so nothing has to be written in
// it by hand. The editor keeps them in the pack's rest.

import { DEFAULT_SETTINGS } from './engine.js'

// The settings of a game, with the bounds the server checks. The family's
// and each person's settings, in Gérer › Apprendre, come before them.
export const GAME_SETTINGS = [
  ['questions_par_partie', 1, 40],
  ['nouvelles_par_partie', 0, 40],
  ['seuil', 0, 100],
  ['hops_par_etoile', 0, 20],
  ['plafond_jour', 0, 200],
  ['memorisation', 70, 97],
  ['intervalle_max', 7, 3650],
  ['nouvelles_par_jour', 1, 200],
]

export const defaultOf = name => DEFAULT_SETTINGS[name]

// The languages a pack may be written in or teach, said by the device.
export const LANGUAGES = ['fr', 'en', 'es', 'de', 'it']

// What the device says aloud: everything, only the instructions (to learn
// to read), or nothing.
export const READ_ALOUD = ['tout', 'consigne', 'rien']

export const readAloudOf = (rest, audience) => {
  const value = rest.lecture_voix_haute
  if (value === true) return 'tout'
  if (value === 'consigne') return 'consigne'
  if (value === false) return 'rien'
  return audience === 'enfant' ? 'tout' : 'rien'
}

export const readAloudValue = choice =>
  choice === 'tout' ? true : choice === 'consigne' ? 'consigne' : false

// Whether the answer is said again once given: as the subject decides
// (languages and reading), always, or never.
export const READ_BACK = ['auto', 'oui', 'non']

export const readBackOf = rest =>
  rest.relire_reponse === true
    ? 'oui'
    : rest.relire_reponse === false
      ? 'non'
      : 'auto'

// How the words are written.
export const WRITINGS = ['imprimerie', 'cursive', 'cursive_question']

// The colours a pack may take instead of its subject's.
export const COLORS = [
  '#5B4FE0',
  '#FF7A2F',
  '#23934F',
  '#3E2F86',
  '#F5B400',
  '#C93F68',
  '#1F8FB5',
]

// withRest gives the rest with a field set, or left out when empty, so the
// file only holds what was chosen.
export const withRest = (rest, name, value) => {
  const next = { ...rest }
  const empty =
    value === undefined ||
    value === '' ||
    value === null ||
    (Array.isArray(value) && !value.length) ||
    (typeof value === 'object' &&
      !Array.isArray(value) &&
      !Object.keys(value).length)
  if (empty) delete next[name]
  else next[name] = value
  return next
}

// withGameSetting sets one setting of a game, brought within its bounds
// once typed (bounded); empty, the pack takes the usual value.
export const withGameSetting = (rest, name, text, bounded = true) => {
  const [, min, max] = GAME_SETTINGS.find(([n]) => n === name)
  const settings = { ...(rest.reglages || {}) }
  const number = Number.parseInt(text, 10)
  if (String(text ?? '').trim() === '' || Number.isNaN(number))
    delete settings[name]
  else settings[name] = bounded ? Math.min(max, Math.max(min, number)) : number
  return withRest(rest, 'reglages', settings)
}

// cleanPrereqs keeps the prerequisites that name a module, each with its
// chapter only when one is chosen.
export const cleanPrereqs = rows =>
  rows
    .filter(row => row.module)
    .map(row => ({
      module: row.module,
      ...(row.chapitre && { chapitre: row.chapitre }),
      pourcent: Math.min(100, Math.max(0, Number(row.pourcent) || 80)),
    }))
