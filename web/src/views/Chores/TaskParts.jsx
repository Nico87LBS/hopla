import {
  CheckRounded,
  HourglassEmptyRounded,
  OpenInNew,
  RepeatRounded,
  ThumbUpRounded,
} from '@mui/icons-material'
import { Box, Chip, Typography } from '@mui/joy'
import PropTypes from 'prop-types'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { HOPLA } from '../../constants/theme'
import { useLocalization } from '../../contexts/LocalizationContext'
import { usePendingCommands } from '../../hooks/usePendingCommands'
import {
  getDueDateChipColor,
  getDueDateChipText,
  getRecurrentChipText,
} from '../../utils/ChoreCardHelpers.jsx'
import {
  getUrlHostname,
  openExternalUrl,
  splitTextAtFirstHttpUrl,
} from '../../utils/ExternalLinks.js'
import PendingBadge from '../components/PendingBadge'

const RING = 26
// How long the ticked ring shows before the task leaves the list.
const DONE_DELAY_MS = 260

const ringSx = {
  alignItems: 'center',
  borderRadius: '50%',
  boxSizing: 'border-box',
  display: 'flex',
  height: RING,
  justifyContent: 'center',
  transition:
    'background-color 160ms ease, border-color 160ms ease, transform 160ms ease',
  width: RING,
  '& svg': { color: 'inherit', fontSize: 16 },
}

// The round button on the left of a task: tick it to complete, or the timer
// controls when the task is running, or the approval waiting for a parent.
export const TaskRing = ({ canApprove, chore, onAction }) => {
  const { t } = useTranslation('chores')
  const [ticked, setTicked] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  let label
  let ring
  let onClick
  let disabled = false

  if (chore.status === 3) {
    label = canApprove ? t('choreView.approve') : t('taskRow.waitingApproval')
    disabled = !canApprove
    onClick = () => onAction('approve', chore)
    ring = (
      <Box
        sx={{
          ...ringSx,
          bgcolor: HOPLA.goldSoft,
          border: `2px dashed ${HOPLA.gold}`,
          color: HOPLA.goldText,
        }}
      >
        {canApprove ? <ThumbUpRounded /> : <HourglassEmptyRounded />}
      </Box>
    )
  } else {
    label = t('taskRow.complete', { name: chore.name })
    onClick = () => {
      setTicked(true)
      timer.current = setTimeout(() => {
        onAction('complete', chore)
        setTicked(false)
      }, DONE_DELAY_MS)
    }
    ring = (
      <Box
        className='task-ring'
        sx={{
          ...ringSx,
          bgcolor: ticked ? 'primary.solidBg' : 'transparent',
          border: '2px solid',
          borderColor: ticked ? 'primary.solidBg' : 'neutral.outlinedBorder',
          color: ticked ? '#fff' : 'transparent',
          transform: ticked ? 'scale(1.08)' : 'none',
        }}
      >
        <CheckRounded />
      </Box>
    )
  }

  return (
    <Box
      component='button'
      type='button'
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={event => {
        event.stopPropagation()
        if (!disabled && !ticked) onClick()
      }}
      sx={{
        alignItems: 'center',
        background: 'none',
        border: 0,
        borderRadius: '50%',
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex',
        flexShrink: 0,
        height: 44,
        justifyContent: 'center',
        opacity: disabled && chore.status !== 3 ? 0.45 : 1,
        p: 0,
        width: 44,
        WebkitTapHighlightColor: 'transparent',
        '&:hover:not(:disabled) .task-ring': {
          borderColor: 'primary.solidBg',
          color: 'primary.plainColor',
        },
        '&:active:not(:disabled) > div': { transform: 'scale(.9)' },
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.500',
        },
      }}
    >
      {ring}
    </Box>
  )
}

TaskRing.propTypes = {
  canApprove: PropTypes.bool,
  chore: PropTypes.object.isRequired,
  onAction: PropTypes.func.isRequired,
}

export const MetaDot = () => (
  <Box
    component='span'
    aria-hidden='true'
    sx={{ color: 'text.tertiary', mx: 0.25 }}
  >
    ·
  </Box>
)

// The title of a task: a link in it is a chip, and a badge while a command
// waits to be sent.
export const TaskTitle = ({ chore }) => {
  const { data: pendingCmds } = usePendingCommands(chore.id)
  const {
    after: titleAfterUrl,
    before: titleBeforeUrl,
    url: titleUrl,
  } = splitTextAtFirstHttpUrl(chore.name)
  const pending = chore._pending || pendingCmds?.length > 0
  return (
    <>
      {titleBeforeUrl}
      {titleUrl && (
        <Chip
          component='span'
          variant='soft'
          color='primary'
          size='sm'
          startDecorator={<OpenInNew sx={{ fontSize: 12 }} />}
          onClick={event => {
            event.stopPropagation()
            openExternalUrl(titleUrl)
          }}
          sx={{ maxWidth: 140, mx: 0.35, verticalAlign: 'middle' }}
          title={titleUrl}
        >
          {getUrlHostname(titleUrl)}
        </Chip>
      )}
      {titleAfterUrl}
      {pending && (
        <PendingBadge
          commands={pendingCmds}
          size='xs'
          sx={{ ml: 0.75, verticalAlign: 'middle' }}
        />
      )}
    </>
  )
}

TaskTitle.propTypes = { chore: PropTypes.object.isRequired }

// The line under a task without moments: when it is due, how it repeats and
// its labels.
export const TaskDetails = ({ chore, onChipClick }) => {
  const { t } = useTranslation('chores')
  const { timeFormat } = useLocalization()
  const dueColor = chore.nextDueDate
    ? getDueDateChipColor(chore.nextDueDate, chore)
    : null
  const repeats = !['once', 'no_repeat'].includes(chore.frequencyType)
  const labels = chore.labelsV2 || []
  const visibleLabels = labels.slice(0, 2)
  if (!chore.nextDueDate && !repeats && visibleLabels.length === 0) return null
  return (
    <Typography
      component='div'
      level='body-xs'
      sx={{
        alignItems: 'center',
        color: 'text.secondary',
        display: 'flex',
        flexWrap: 'wrap',
        mt: 0.25,
        rowGap: 0.25,
      }}
    >
      {chore.nextDueDate && (
        <Box
          component='span'
          sx={{
            color:
              dueColor === 'danger'
                ? 'danger.plainColor'
                : dueColor === 'warning'
                  ? HOPLA.carrotText
                  : 'text.secondary',
            fontWeight: dueColor === 'danger' ? 600 : 500,
          }}
        >
          {getDueDateChipText(chore.nextDueDate, chore, timeFormat, t)}
        </Box>
      )}
      {repeats && (
        <>
          {chore.nextDueDate && <MetaDot />}
          <Box
            component='span'
            sx={{ alignItems: 'center', display: 'inline-flex', gap: 0.25 }}
          >
            <RepeatRounded sx={{ fontSize: 13 }} />
            {chore.frequencyType === 'trigger'
              ? t('taskEditor.triggeredFromOutside')
              : getRecurrentChipText(chore)}
          </Box>
        </>
      )}
      {visibleLabels.map((label, index) => (
        <Box
          component='span'
          key={label.id}
          sx={{ alignItems: 'center', display: 'inline-flex' }}
        >
          {(index > 0 || chore.nextDueDate || repeats) && <MetaDot />}
          <Box
            component='span'
            role={onChipClick ? 'button' : undefined}
            tabIndex={onChipClick ? 0 : undefined}
            onClick={event => {
              if (!onChipClick) return
              event.stopPropagation()
              onChipClick({ label })
            }}
            onKeyDown={event => {
              if (onChipClick && (event.key === 'Enter' || event.key === ' ')) {
                event.stopPropagation()
                onChipClick({ label })
              }
            }}
            sx={{
              alignItems: 'center',
              display: 'inline-flex',
              gap: 0.5,
            }}
          >
            <Box
              component='span'
              sx={{
                bgcolor: label.color || 'neutral.400',
                borderRadius: '50%',
                height: 8,
                width: 8,
              }}
            />
            {label.name}
          </Box>
        </Box>
      ))}
      {labels.length > visibleLabels.length && (
        <Box component='span' sx={{ ml: 0.5, color: 'text.tertiary' }}>
          +{labels.length - visibleLabels.length}
        </Box>
      )}
    </Typography>
  )
}

TaskDetails.propTypes = {
  chore: PropTypes.object.isRequired,
  onChipClick: PropTypes.func,
}
