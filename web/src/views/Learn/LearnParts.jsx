import { StarRounded } from '@mui/icons-material'
import { Box, LinearProgress } from '@mui/joy'
import PropTypes from 'prop-types'
import { useMemo } from 'react'

import { HOPLA } from '../../constants/theme'
import { cardMap, compile } from '../../utils/learn/engine'

// useCompiled reads the modules of a player once: their chapters and
// sources, and the person's cards by key.
export const useCompiled = player =>
  useMemo(() => {
    const byId = {}
    for (const module of player?.modules || []) {
      try {
        byId[module.id] = compile(module.document)
      } catch {
        // A module that cannot be read is left out rather than breaking the
        // page.
      }
    }
    return { byId, cards: cardMap(player?.cards) }
  }, [player])

export const Stars = ({ count, size = 28 }) => (
  <Box sx={{ display: 'flex', gap: 0.25 }} aria-label={`${count}/3`}>
    {[1, 2, 3].map(n => (
      <StarRounded
        key={n}
        sx={{
          fontSize: size,
          color: n <= count ? HOPLA.gold : 'neutral.outlinedBorder',
        }}
      />
    ))}
  </Box>
)

Stars.propTypes = { count: PropTypes.number.isRequired, size: PropTypes.number }

export const Progress = ({ color = HOPLA.violet, value }) => (
  <LinearProgress
    determinate
    value={Math.max(0, Math.min(100, value))}
    sx={{
      '--LinearProgress-thickness': '8px',
      '--LinearProgress-radius': '8px',
      color,
      bgcolor: 'background.level2',
    }}
  />
)

Progress.propTypes = {
  value: PropTypes.number.isRequired,
  color: PropTypes.string,
}

// Subject colors, so a child finds her modules at a glance.
const SUBJECT_COLORS = {
  maths: HOPLA.violet,
  francais: HOPLA.carrot,
  anglais: HOPLA.green,
  langues: HOPLA.green,
}

export const subjectColor = (subject, own) =>
  own || SUBJECT_COLORS[subject] || HOPLA.blueberry
