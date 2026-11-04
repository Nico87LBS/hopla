import { LockRounded, StarRounded } from '@mui/icons-material'
import { Box, LinearProgress } from '@mui/joy'
import PropTypes from 'prop-types'
import { useMemo } from 'react'

import { HOPLA } from '../../constants/theme'
import { cardMap, compile } from '../../utils/learn/engine'
import { iconFile, iconOf } from '../../utils/learn/icons'

// useCompiled reads the modules of a player once: their chapters and
// sources, and the person's cards by key.
export const useCompiled = player =>
  useMemo(() => {
    const byId = {}
    for (const module of player?.modules || []) {
      try {
        byId[module.id] = compile(module.document, {
          firstName: player.firstName,
        })
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

// LearnIcon is the drawing of a module or pack, on a pale tile of its
// subject's colour. Without tile it is just the drawing, for a title.
export const LearnIcon = ({
  color,
  entity,
  locked = false,
  size = 46,
  subject,
  tile = true,
}) => {
  const file = iconFile(iconOf(entity, subject))
  const own = color || subjectColor(subject || entity?.subject)
  const img = (
    <Box
      component='img'
      src={file}
      alt=''
      draggable={false}
      sx={{
        filter: locked ? 'grayscale(1)' : 'none',
        height: tile ? Math.round(size * 0.65) : size,
        opacity: locked ? 0.5 : 1,
        width: tile ? Math.round(size * 0.65) : size,
      }}
    />
  )
  if (!tile) return img
  return (
    <Box
      sx={{
        alignItems: 'center',
        bgcolor: `${own}1F`,
        border: '2px solid',
        borderColor: `${own}40`,
        borderRadius: `${Math.round(size * 0.3)}px`,
        boxSizing: 'border-box',
        display: 'flex',
        flexShrink: 0,
        height: size,
        justifyContent: 'center',
        position: 'relative',
        width: size,
      }}
    >
      {img}
      {locked && (
        <LockRounded
          sx={{
            bgcolor: 'background.surface',
            borderRadius: '50%',
            bottom: -4,
            color: 'text.tertiary',
            fontSize: 16,
            p: '1px',
            position: 'absolute',
            right: -4,
          }}
        />
      )}
    </Box>
  )
}

LearnIcon.propTypes = {
  color: PropTypes.string,
  entity: PropTypes.object,
  locked: PropTypes.bool,
  size: PropTypes.number,
  subject: PropTypes.string,
  tile: PropTypes.bool,
}
