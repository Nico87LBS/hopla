// learnParent is the page above a page of the games: the back arrow goes
// there rather than back in the history, which may be a finished game.
export const learnParent = path => {
  if (/^\/learn\/[^/]+\/play\/[^/]+$/.test(path))
    return path.replace(/\/play\/[^/]+$/, '')
  if (/^\/manage\/learn\/[^/]+$/.test(path)) return '/manage/learn'
  if (/^\/(learn(\/[^/]+)?|manage\/learn)$/.test(path)) return '/manage'
  return null
}
