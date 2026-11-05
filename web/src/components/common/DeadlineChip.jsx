import { HourglassBottomRounded } from '@mui/icons-material'
import { Box } from '@mui/joy'
import moment from 'moment'
import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { HOPLA } from '../../constants/theme'
import { useLocalization } from '../../contexts/LocalizationContext'
import { deadlineOf, deadlineState, shortDuration } from '../../utils/deadline'

// Re-renders every 15 seconds while a task has a deadline, so the time left
// counts down and the chip goes away when it is over.
const useDeadlineNow = at => {
  const [now, setNow] = useState(() => new Date())
  const key = at?.getTime()
  useEffect(() => {
    if (!key) return undefined
    const timer = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(timer)
  }, [key])
  return now
}

// A task's deadline: when it is, until the task is due, then the time left.
const DeadlineChip = ({ chore, sx }) => {
  const { t } = useTranslation('chores')
  const { fmt } = useLocalization()
  const now = useDeadlineNow(deadlineOf(chore))
  const state = deadlineState(chore, now)
  if (!state) return null
  const late = state.phase === 'late'
  const sameDay = moment(state.at).isSame(now, 'day')
  const when = sameDay
    ? fmt.time(state.at)
    : `${moment(state.at).format('ddd D MMM')} ${fmt.time(state.at)}`
  return (
    <Box
      component='span'
      title={t('deadline.title', { when })}
      sx={theme => ({
        alignItems: 'center',
        bgcolor: late ? HOPLA.carrotSoft : 'neutral.softBg',
        borderRadius: 999,
        color: late ? HOPLA.carrotText : 'text.secondary',
        display: 'inline-flex',
        flexShrink: 0,
        font: '700 12px/18px var(--joy-fontFamily-body)',
        gap: 0.25,
        px: 0.875,
        py: 0.25,
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
        [theme.getColorSchemeSelector('dark')]: late
          ? { bgcolor: 'rgba(255, 122, 47, 0.16)', color: '#FFB48A' }
          : {},
        ...sx,
      })}
    >
      <HourglassBottomRounded sx={{ color: 'inherit', fontSize: 14 }} />
      {late
        ? t('deadline.left', { left: shortDuration(state.minutesLeft, t) })
        : t('deadline.before', { when })}
    </Box>
  )
}

DeadlineChip.propTypes = {
  chore: PropTypes.shape({
    deadlineMinutes: PropTypes.number,
    frequencyMetadata: PropTypes.object,
    frequencyType: PropTypes.string,
    nextDueDate: PropTypes.string,
  }),
  sx: PropTypes.object,
}

export default DeadlineChip
