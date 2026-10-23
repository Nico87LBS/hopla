import {
  CheckRounded,
  HourglassEmptyRounded,
  OpenInNew,
  PauseRounded,
  PlayArrowRounded,
  RepeatRounded,
  ThumbUpRounded,
  TollRounded,
} from '@mui/icons-material'
import { Box, Checkbox, Chip, Typography } from '@mui/joy'
import PropTypes from 'prop-types'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { HOPLA } from '../../constants/theme'
import { useImpersonateUser } from '../../contexts/ImpersonateUserContext.jsx'
import { useLocalization } from '../../contexts/LocalizationContext'
import { usePendingCommands } from '../../hooks/usePendingCommands'
import { useCircleMembers, useUserProfile } from '../../queries/UserQueries.jsx'
import {
  getDueDateChipColor,
  getDueDateChipText,
  getRecurrentChipText,
} from '../../utils/ChoreCardHelpers.jsx'
import { notInCompletionWindow } from '../../utils/Chores.jsx'
import { getPriorityColor } from '../../utils/Colors.jsx'
import {
  getUrlHostname,
  openExternalUrl,
  splitTextAtFirstHttpUrl,
} from '../../utils/ExternalLinks.js'
import { ChoreActionMenuTrigger } from '../components/ChoreActionMenu'
import PendingBadge from '../components/PendingBadge'
import { MemberAvatar } from '../Games/GameParts'

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
const TaskRing = ({ canApprove, chore, onAction }) => {
  const { t } = useTranslation('chores')
  const [ticked, setTicked] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const outOfWindow = notInCompletionWindow(chore)
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
  } else if (chore.status === 1 || chore.status === 2) {
    const running = chore.status === 1
    label = running ? t('taskRow.pause') : t('taskRow.resume')
    onClick = () => onAction(running ? 'pause' : 'start', chore)
    ring = (
      <Box
        sx={{
          ...ringSx,
          bgcolor: running ? 'primary.solidBg' : 'transparent',
          border: '2px solid',
          borderColor: 'primary.solidBg',
          color: running ? '#fff' : 'primary.plainColor',
        }}
      >
        {running ? <PauseRounded /> : <PlayArrowRounded />}
      </Box>
    )
  } else {
    label = t('taskRow.complete', { name: chore.name })
    disabled = outOfWindow
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
          borderStyle: outOfWindow ? 'dashed' : 'solid',
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

const MetaDot = () => (
  <Box
    component='span'
    aria-hidden='true'
    sx={{ color: 'text.tertiary', mx: 0.25 }}
  >
    ·
  </Box>
)

// One task in a list: ring, title, a line of details, hops and who does it.
const TaskRow = ({
  chore,
  isMultiSelectMode = false,
  isSelected = false,
  onAction,
  onChipClick,
  onOpenActionMenu,
  onSelectionToggle,
  performers = [],
  showActions = true,
}) => {
  const { t } = useTranslation('chores')
  const { timeFormat } = useLocalization()
  const { data: userProfile } = useUserProfile()
  const { data: circleMembersData } = useCircleMembers()
  const { data: pendingCmds } = usePendingCommands(chore.id)
  const { impersonatedUser } = useImpersonateUser()

  const actingUserId = impersonatedUser?.userId || userProfile?.id
  const actingMember = circleMembersData?.res?.find(
    member => member.userId === actingUserId,
  )
  const canApprove =
    actingMember?.role === 'admin' ||
    actingMember?.role === 'manager' ||
    chore.createdBy === actingUserId

  const assignee = chore.assignedTo
    ? performers.find(p => p.userId === chore.assignedTo)
    : null
  const dueColor = chore.nextDueDate
    ? getDueDateChipColor(chore.nextDueDate, chore)
    : null
  const repeats = !['once', 'no_repeat'].includes(chore.frequencyType)
  const labels = chore.labelsV2 || []
  const visibleLabels = labels.slice(0, 2)
  const {
    after: titleAfterUrl,
    before: titleBeforeUrl,
    url: titleUrl,
  } = splitTextAtFirstHttpUrl(chore.name)
  const pending = chore._pending || pendingCmds?.length > 0

  return (
    <Box
      sx={{
        alignItems: 'center',
        bgcolor: isSelected ? 'primary.softBg' : 'background.surface',
        cursor: 'pointer',
        display: 'flex',
        gap: 0.5,
        minHeight: 64,
        pl: 0.5,
        pr: 0.75,
        position: 'relative',
        py: 0.75,
        transition: 'background-color 150ms ease',
        '&:hover': {
          bgcolor: isSelected ? 'primary.softHoverBg' : 'background.level1',
        },
        ...(chore.priority > 0 && {
          '&::before': {
            bgcolor: getPriorityColor(chore.priority),
            borderRadius: 4,
            bottom: 12,
            content: '""',
            left: 0,
            position: 'absolute',
            top: 12,
            width: 3,
          },
        }),
      }}
    >
      {isMultiSelectMode ? (
        <Box
          sx={{
            alignItems: 'center',
            display: 'flex',
            height: 44,
            justifyContent: 'center',
            width: 44,
          }}
        >
          <Checkbox
            checked={isSelected}
            onChange={onSelectionToggle}
            onClick={event => event.stopPropagation()}
            slotProps={{ checkbox: { sx: { borderRadius: '50%' } } }}
          />
        </Box>
      ) : showActions ? (
        <TaskRing canApprove={canApprove} chore={chore} onAction={onAction} />
      ) : (
        <Box sx={{ width: 8 }} />
      )}

      <Box sx={{ flex: 1, minWidth: 0, py: 0.25 }}>
        <Typography
          level='body-md'
          sx={{
            color: 'text.primary',
            fontWeight: 600,
            lineHeight: 1.35,
            overflowWrap: 'anywhere',
          }}
        >
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
        </Typography>
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
                  if (
                    onChipClick &&
                    (event.key === 'Enter' || event.key === ' ')
                  ) {
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
      </Box>

      {chore.points > 0 && (
        <Box
          component='span'
          title={t('taskRow.hops', { count: chore.points })}
          sx={{
            alignItems: 'center',
            bgcolor: HOPLA.goldSoft,
            borderRadius: 999,
            color: HOPLA.goldText,
            display: 'inline-flex',
            flexShrink: 0,
            font: '700 12px/18px var(--joy-fontFamily-body)',
            gap: 0.25,
            px: 0.875,
            py: 0.25,
          }}
        >
          <TollRounded sx={{ fontSize: 14 }} />
          {chore.points}
        </Box>
      )}
      {assignee && (
        <Box
          sx={{ display: 'flex', flexShrink: 0 }}
          title={assignee.displayName}
        >
          <MemberAvatar member={assignee} size={26} />
        </Box>
      )}
      {showActions && !isMultiSelectMode && onOpenActionMenu && (
        <ChoreActionMenuTrigger
          variant='plain'
          onClick={event => {
            event.stopPropagation()
            onOpenActionMenu(event.currentTarget, chore)
          }}
          sx={{
            color: 'text.tertiary',
            flexShrink: 0,
            height: 36,
            width: 32,
            '&:hover': {
              bgcolor: 'background.level2',
              color: 'text.secondary',
            },
          }}
        />
      )}
    </Box>
  )
}

TaskRow.propTypes = {
  chore: PropTypes.object.isRequired,
  isMultiSelectMode: PropTypes.bool,
  isSelected: PropTypes.bool,
  onAction: PropTypes.func.isRequired,
  onChipClick: PropTypes.func,
  onOpenActionMenu: PropTypes.func,
  onSelectionToggle: PropTypes.func,
  performers: PropTypes.array,
  showActions: PropTypes.bool,
}

export default TaskRow
