import { HOPLA } from '../../../constants/theme'
import { startBulles } from './bulles'
import { startPanier } from './panier'
import { startSequence } from './sequence'
import { startTerriers } from './terriers'
import { startTrain } from './train'

// The games of the récré, by the name the server knows them by. tall is the
// height of the meadow for a width of 1.
export const GAMES = {
  train: { start: startTrain, color: HOPLA.green, tall: 1, arrows: true },
  bulles: { start: startBulles, color: HOPLA.violet, tall: 1.35 },
  panier: { start: startPanier, color: HOPLA.carrot, tall: 1.3 },
  terriers: { start: startTerriers, color: HOPLA.goldText, tall: 1 },
  sequence: { start: startSequence, color: HOPLA.blueberry, tall: 1 },
}
