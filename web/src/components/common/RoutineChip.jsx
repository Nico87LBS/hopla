import { FormatListNumberedRounded, SkipNextRounded } from '@mui/icons-material'
import { Box, IconButton } from '@mui/joy'
import { useQueryClient } from '@tanstack/react-query'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'

import { HOPLA } from '../../constants/theme'
import { useRoutinesToday } from '../../queries/ChoreQueries'
import { useNotification } from '../../service/NotificationProvider'
import { SkipRoutineOccurrenceItem } from '../../utils/Fetcher'
import { routineStepOf } from '../../utils/routines'

// The routine a task is the step to do now of, with how far the child is:
// "Matin · 2/4". The copies of a task for several children, each at their own
// step, show the routine's name only.
const RoutineChip = ({ chores, sx, userId }) => {
  const { t } = useTranslation('chores')
  const queryClient = useQueryClient()
  const { showError } = useNotification()
  const { data: routines } = useRoutinesToday()
  const steps = chores
    .map(chore => routineStepOf(routines, chore, userId))
    .filter(Boolean)
  if (steps.length === 0) return null
  const nameOnly = chores.length > 1
  const stepWithOccurrenceItem = steps.find(({ progress }, index) =>
    progress.occurrence?.items?.some(
      item => item.choreId === chores[index].id && item.available,
    ),
  )
  const stepIndex = stepWithOccurrenceItem
    ? steps.indexOf(stepWithOccurrenceItem)
    : 0
  const { progress, routine } = steps[stepIndex]
  const selectedChoreId = chores[stepIndex]?.id
  const occurrence = progress.occurrence
  const occurrenceItem = occurrence?.items?.find(
    item => item.choreId === selectedChoreId && item.available,
  )
  const stepNumber = occurrenceItem ? occurrenceItem.position + 1 : progress.step
  const stepTotal = occurrence ? occurrence.items.length : progress.total
  const skipStep = async () => {
    const response = await SkipRoutineOccurrenceItem(
      occurrence.id,
      occurrenceItem.id,
    )
    if (!response.ok) {
      showError(t('routines.skipFailed'))
      return
    }
    await queryClient.invalidateQueries({ queryKey: ['games'] })
    await queryClient.invalidateQueries({ queryKey: ['chores'] })
  }
  return (
    <Box
      component='span'
      title={t('routines.stepTitle', {
        name: routine.name,
        step: progress.step,
        total: progress.total,
      })}
      sx={theme => ({
        alignItems: 'center',
        bgcolor: HOPLA.greenSoft,
        borderRadius: 999,
        color: HOPLA.greenText,
        display: 'inline-flex',
        flexShrink: 0,
        font: '700 12px/18px var(--joy-fontFamily-body)',
        gap: 0.375,
        maxWidth: '100%',
        px: 0.875,
        py: 0.25,
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
        [theme.getColorSchemeSelector('dark')]: {
          bgcolor: 'rgba(35, 147, 79, 0.18)',
          color: '#8FD9AA',
        },
        ...sx,
      })}
    >
      <FormatListNumberedRounded sx={{ fontSize: 14 }} />
      <Box
        component='span'
        sx={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}
      >
        {routine.name}
      </Box>
      {!nameOnly && (
        <span>
          {t('routines.step', { step: stepNumber, total: stepTotal })}
        </span>
      )}
      {occurrence?.status === 'active' && occurrenceItem && userId !== undefined && (
        <IconButton
          size='sm'
          variant='plain'
          color='neutral'
          title={t('routines.skip')}
          aria-label={t('routines.skip')}
          onClick={skipStep}
          sx={{ minWidth: 22, minHeight: 22, p: 0 }}
        >
          <SkipNextRounded sx={{ fontSize: 16 }} />
        </IconButton>
      )}
    </Box>
  )
}

RoutineChip.propTypes = {
  chores: PropTypes.arrayOf(PropTypes.object).isRequired,
  sx: PropTypes.object,
  userId: PropTypes.number,
}

export default RoutineChip
