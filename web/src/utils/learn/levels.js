import { moduleProgress } from './engine.js'
import { packTree } from './tree.js'

// DEFAULT_LEVEL_PERCENT is how well each module of a level must be known to
// open the next level, when no parent set an opening threshold.
export const DEFAULT_LEVEL_PERCENT = 80

// levelKnown tells whether the highest level a person has open in a pack is
// known well enough to open the next: each module of it they play, known
// at its opening threshold, as a chapter known opens the next.
export const levelKnown = (player, packPlayer, byId, cards) => {
  const { groups } = packTree(player.packs || [])
  const group = groups.find(g => g.pack.id === packPlayer.pack)
  if (!group || group.levels.length < 2) return false
  const at = Math.max(
    0,
    group.levels.findIndex(l => l.pack?.id === packPlayer.openTo),
  )
  if (at + 1 >= group.levels.length) return false
  const level = group.levels[at].pack
  const played = (player.modules || []).filter(
    m => level.children.includes(m.id) && byId[m.id],
  )
  if (!played.length) return false
  return played.every(
    m =>
      moduleProgress(byId[m.id], cards) >=
      (m.unlockPercent ?? DEFAULT_LEVEL_PERCENT),
  )
}
