import { TimerRounded } from '@mui/icons-material'
import { Box } from '@mui/joy'
import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { HOPLA } from '../../constants/theme'
import { useLocalization } from '../../contexts/LocalizationContext'

// Minutes left before a speed bonus closes, rounded up so "1 min" shows until
// the end. 0 once it is over.
export const chronoMinutesLeft = (flash, now = new Date()) => {
  if (!flash?.endsAt) return 0
  const left = new Date(flash.endsAt).getTime() - now.getTime()
  return left > 0 ? Math.ceil(left / 60000) : 0
}

// Re-renders every 15 seconds while a speed bonus runs, so the minutes left
// count down and the chip goes away when it is over.
export const useChronoNow = flash => {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!flash?.endsAt) return undefined
    const timer = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(timer)
  }, [flash?.endsAt])
  return now
}

// The speed bonus open on a task: extra hops and the minutes left, or the
// time it closes when that is more than an hour away.
const ChronoChip = ({ flash, sx }) => {
  const { t } = useTranslation('chores')
  const { fmt } = useLocalization()
  const now = useChronoNow(flash)
  const left = chronoMinutesLeft(flash, now)
  if (!flash || left <= 0) return null
  const time = fmt.time(flash.endsAt)
  return (
    <Box
      component='span'
      title={t('chrono.title', { points: flash.points, time })}
      sx={theme => ({
        alignItems: 'center',
        bgcolor: HOPLA.violetSoft,
        borderRadius: 999,
        color: HOPLA.violet,
        display: 'inline-flex',
        flexShrink: 0,
        font: '700 12px/18px var(--joy-fontFamily-body)',
        gap: 0.25,
        px: 0.875,
        py: 0.25,
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
        [theme.getColorSchemeSelector('dark')]: {
          bgcolor: 'rgba(143, 132, 255, 0.16)',
          color: '#B9B2FF',
        },
        ...sx,
      })}
    >
      <TimerRounded sx={{ color: 'inherit', fontSize: 14 }} />
      {left <= 60
        ? t('chrono.minutesLeft', { points: flash.points, count: left })
        : t('chrono.until', { points: flash.points, time })}
    </Box>
  )
}

ChronoChip.propTypes = {
  flash: PropTypes.shape({
    endsAt: PropTypes.string,
    liveId: PropTypes.number,
    points: PropTypes.number,
  }),
  sx: PropTypes.object,
}

export default ChronoChip
