import {
  BubbleChartRounded,
  GrassRounded,
  PaletteRounded,
  ShoppingBasketRounded,
  TrainRounded,
} from '@mui/icons-material'

import { HOPLA } from '../../../constants/theme'
import { startBulles } from './bulles'
import { startPanier } from './panier'
import { startSequence } from './sequence'
import { startTerriers } from './terriers'
import { startTrain } from './train'

// The games of the récré, by the name the server knows them by. tall is the
// height of the meadow for a width of 1, icon what stands for it.
export const GAMES = {
  train: {
    start: startTrain,
    color: HOPLA.green,
    tall: 1,
    arrows: true,
    icon: TrainRounded,
  },
  bulles: {
    start: startBulles,
    color: HOPLA.violet,
    tall: 1.35,
    icon: BubbleChartRounded,
  },
  panier: {
    start: startPanier,
    color: HOPLA.carrot,
    tall: 1.3,
    icon: ShoppingBasketRounded,
  },
  terriers: {
    start: startTerriers,
    color: HOPLA.goldText,
    tall: 1,
    icon: GrassRounded,
  },
  sequence: {
    start: startSequence,
    color: HOPLA.blueberry,
    tall: 1,
    icon: PaletteRounded,
  },
}
