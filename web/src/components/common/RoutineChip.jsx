import { FormatListNumberedRounded } from '@mui/icons-material'
import { Box } from '@mui/joy'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'

import { HOPLA } from '../../constants/theme'
import { useRoutinesToday } from '../../queries/ChoreQueries'
import { routineStepOf } from '../../utils/routines'

// The routine a task is the step to do now of, with how far the child is:
// "Matin · 2/4". The copies of a task for several children, each at their own
// step, show the routine's name only.
const RoutineChip = ({ chores, sx, userId }) => {
  const { t } = useTranslation('chores')
  const { data: routines } = useRoutinesToday()
  const steps = chores
    .map(chore => ({
      chore,
      step: routineStepOf(routines, chore, userId),
    }))
    .filter(({ step }) => Boolean(step))
  if (steps.length === 0) return null
  const nameOnly = chores.length > 1
  const selected =
    steps.find(({ chore, step }) =>
      step.progress.occurrence?.items?.some(
        item => item.choreId === chore.id && item.available,
      ),
    ) || steps[0]
  const { chore: selectedChore, step } = selected
  const { progress, routine } = step
  const selectedChoreId = selectedChore.id
  const occurrence = progress.occurrence
  const routineName = occurrence?.routineName || routine.name
  const occurrenceItem = occurrence?.items?.find(
    item => item.choreId === selectedChoreId && item.available,
  )
  const stepNumber = occurrenceItem
    ? occurrenceItem.position + 1
    : progress.step
  const stepTotal = occurrence ? occurrence.items.length : progress.total
  return (
    <Box
      component='span'
      title={t('routines.stepTitle', {
        name: routineName,
        step: stepNumber,
        total: stepTotal,
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
        {routineName}
      </Box>
      {!nameOnly && (
        <span>
          {t('routines.step', { step: stepNumber, total: stepTotal })}
        </span>
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
