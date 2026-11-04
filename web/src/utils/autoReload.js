// Quand une nouvelle version de l'interface est prête, la page se recharge
// toute seule, mais seulement à un moment où personne ne perd rien : jamais
// pendant un jeu, dans un éditeur, avec une fenêtre ouverte ou une saisie en
// cours.

// Les pages où l'on joue : un rechargement couperait la partie.
const GAME_PATHS = [
  /^\/play\/[^/]+\/.+/, // /play/:userId/:moduleId, /test/:packId, /recre
  /^\/learn\/[^/]+\/(play|test|recre)(\/|$)/,
]

// Les pages où l'on remplit un formulaire.
const EDITOR_PATHS = [
  /^\/chores\/create\/?$/,
  /^\/chores\/[^/]+\/edit\/?$/,
  /^\/manage\/learn\/editeur\//,
]

const matches = (patterns, pathname) =>
  patterns.some(pattern => pattern.test(pathname || ''))

export const isGamePath = pathname => matches(GAME_PATHS, pathname)

export const isBusyPath = pathname =>
  isGamePath(pathname) || matches(EDITOR_PATHS, pathname)

const isEditable = element => {
  if (!element) return false
  if (element.isContentEditable) return true
  const tag = (element.tagName || '').toLowerCase()
  if (tag === 'textarea' || tag === 'select') return true
  if (tag !== 'input') return false
  const type = (element.type || 'text').toLowerCase()
  return !['button', 'checkbox', 'radio', 'range', 'reset', 'submit'].includes(
    type,
  )
}

// Une fenêtre, un tiroir ou un menu ouvert, ou un champ où l'on écrit.
export const isPageBusy = doc => {
  if (!doc) return false
  if (doc.querySelector('[role="dialog"], [role="alertdialog"]')) return true
  return isEditable(doc.activeElement)
}

// reason : 'navigation' quand on vient d'arriver sur une page (rien n'y a
// encore été saisi), 'visible' quand on revient sur l'onglet ou l'appli,
// 'hidden' quand la page est en arrière-plan.
export const canReloadNow = ({ doc, pathname, reason }) => {
  if (reason === 'navigation') return !isGamePath(pathname)
  return !isBusyPath(pathname) && !isPageBusy(doc)
}
