import {
  AccessTimeRounded,
  CheckRounded,
  CloseRounded,
  ExpandMoreRounded,
  HourglassEmptyRounded,
  ReplayRounded,
  TollRounded,
} from '@mui/icons-material'
import { Box, Button, Typography } from '@mui/joy'
import { useQueryClient } from '@tanstack/react-query'
import PropTypes from 'prop-types'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import ChronoChip from '../../components/common/ChronoChip'
import DeadlineChip from '../../components/common/DeadlineChip'
import RoutineChip from '../../components/common/RoutineChip'
import TaskMode from '../../components/common/TaskMode'
import { HOPLA, memberColor } from '../../constants/theme'
import { useImpersonateUser } from '../../contexts/ImpersonateUserContext.jsx'
import {
  useFlashes,
  useRoutinesToday,
  useSlotsToday,
} from '../../queries/ChoreQueries'
import { useFamilyMembers, useUserProfile } from '../../queries/UserQueries'
import { useNotification } from '../../service/NotificationProvider'
import { isTogether, taskMemberIds } from '../../utils/Chores.jsx'
import { deadlineOf } from '../../utils/deadline'
import {
  ApproveChore,
  MarkChoreComplete,
  SlotAction,
} from '../../utils/Fetcher'
import { routineStepOf } from '../../utils/routines'
import { taskModeOf } from '../../utils/taskMode'
import { doneCopies, faceOf, hasSlots, todaySlots } from '../../utils/taskSlots'
import { MemberAvatar } from '../Games/GameParts'

const PENDING_APPROVAL = 3
const CELL = 44
const RING = 30

const ringSx = {
  alignItems: 'center',
  borderRadius: '50%',
  boxSizing: 'border-box',
  display: 'flex',
  height: RING,
  justifyContent: 'center',
  width: RING,
  '& svg': { color: 'inherit', fontSize: 16 },
}

const cellButtonSx = {
  alignItems: 'center',
  background: 'none',
  border: 0,
  borderRadius: '50%',
  cursor: 'pointer',
  display: 'flex',
  height: CELL,
  justifySelf: 'center',
  justifyContent: 'center',
  p: 0,
  width: CELL,
  '&:disabled': { cursor: 'default' },
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.500' },
}

const capsuleButtonSx = {
  alignItems: 'center',
  bgcolor: '#fff',
  border: 0,
  borderRadius: 999,
  boxShadow: '0 1px 2px rgba(36,30,78,.12)',
  cursor: 'pointer',
  display: 'flex',
  height: CELL,
  justifyContent: 'center',
  p: 0,
  width: 40,
  '& svg': { color: 'inherit' },
  '&:disabled': { cursor: 'default', opacity: 0.5 },
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.500' },
}

// The person a copy of the task is for.
const performerOf = (chore, performers) => {
  const id = chore.assignedTo ?? chore.assignees?.[0]?.userId
  return performers.find(p => p.userId === id) || { userId: id }
}

// One slot of one child's copy: a ring to tick, or, for a parent, the buttons
// to approve, reject or catch it up.
const SlotCell = ({
  busy,
  canApprove,
  canTick,
  color,
  label,
  onSlot,
  slot,
}) => {
  const { t } = useTranslation('chores')
  const disabled = busy
  if (slot.state === 'done') {
    return (
      <Box
        role='img'
        aria-label={t('slots.cell.done', { label })}
        sx={{ ...cellButtonSx, cursor: 'default' }}
      >
        <Box sx={{ ...ringSx, bgcolor: color, color: '#fff' }}>
          <CheckRounded />
        </Box>
      </Box>
    )
  }
  if (slot.state === 'other') {
    return (
      <Box
        role='img'
        aria-label={t('slots.cell.doneByOther', { label })}
        sx={{ ...cellButtonSx, cursor: 'default', opacity: 0.35 }}
      >
        <Box sx={{ ...ringSx, bgcolor: 'neutral.400', color: '#fff' }}>
          <CheckRounded />
        </Box>
      </Box>
    )
  }
  if (slot.state === 'pending') {
    if (!canApprove) {
      return (
        <Box
          role='img'
          aria-label={t('slots.cell.pending', { label })}
          sx={{ ...cellButtonSx, cursor: 'default' }}
        >
          <Box
            sx={{
              ...ringSx,
              bgcolor: HOPLA.goldSoft,
              border: `2.5px dashed ${HOPLA.gold}`,
              color: HOPLA.goldText,
            }}
          >
            <HourglassEmptyRounded />
          </Box>
        </Box>
      )
    }
    return (
      <Box
        sx={{
          bgcolor: 'background.level1',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 999,
          display: 'inline-flex',
          gap: '3px',
          justifySelf: 'center',
          p: '3px',
        }}
      >
        <Box
          component='button'
          type='button'
          disabled={disabled}
          aria-label={t('slots.cell.approve', { label })}
          title={t('slots.cell.approve', { label })}
          onClick={() => onSlot('approve', slot)}
          sx={{ ...capsuleButtonSx, color: HOPLA.green }}
        >
          <CheckRounded sx={{ fontSize: 20 }} />
        </Box>
        <Box
          component='button'
          type='button'
          disabled={disabled}
          aria-label={t('slots.cell.reject', { label })}
          title={t('slots.cell.reject', { label })}
          onClick={() => onSlot('reject', slot)}
          sx={{ ...capsuleButtonSx, color: HOPLA.red }}
        >
          <CloseRounded sx={{ fontSize: 18 }} />
        </Box>
      </Box>
    )
  }
  if (slot.state === 'missed') {
    if (canApprove) {
      return (
        <Box
          component='button'
          type='button'
          disabled={disabled}
          aria-label={t('slots.cell.catchUp', { label })}
          onClick={() => onSlot('catchup', slot)}
          sx={{
            alignItems: 'center',
            bgcolor: HOPLA.carrotSoft,
            border: 0,
            borderRadius: 999,
            color: HOPLA.carrotText,
            cursor: 'pointer',
            display: 'inline-flex',
            font: '600 12px/1 var(--joy-fontFamily-body)',
            gap: 0.5,
            justifySelf: 'center',
            minHeight: CELL,
            px: 1.25,
            '& svg': { color: 'inherit', fontSize: 15 },
            '&:disabled': { cursor: 'default', opacity: 0.5 },
          }}
        >
          <ReplayRounded />
          {t('slots.catchUp')}
        </Box>
      )
    }
    return (
      <Box
        role='img'
        aria-label={t('slots.cell.missed', { label })}
        sx={{ ...cellButtonSx, cursor: 'default' }}
      >
        <Box
          sx={{
            ...ringSx,
            bgcolor: HOPLA.carrotSoft,
            border: `2.5px solid ${HOPLA.carrot}`,
          }}
        />
      </Box>
    )
  }
  if (slot.state === 'open') {
    return (
      <Box
        component='button'
        type='button'
        disabled={disabled || !canTick}
        aria-label={t('slots.cell.tick', { label })}
        title={t('slots.cell.tick', { label })}
        onClick={() => onSlot('tick', slot)}
        sx={cellButtonSx}
      >
        <Box
          sx={{
            ...ringSx,
            border: `2.5px solid ${color}`,
            boxShadow: `0 0 0 4px ${color}22`,
            color: 'transparent',
            '&:hover': { color },
          }}
        >
          <CheckRounded />
        </Box>
      </Box>
    )
  }
  return (
    <Box
      role='img'
      aria-label={t('slots.cell.upcoming', { label })}
      sx={{ ...cellButtonSx, cursor: 'default' }}
    >
      <Box
        sx={{
          ...ringSx,
          border: '2px dashed',
          borderColor: 'neutral.outlinedBorder',
        }}
      />
    </Box>
  )
}

SlotCell.propTypes = {
  busy: PropTypes.bool,
  canApprove: PropTypes.bool,
  canTick: PropTypes.bool,
  color: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  onSlot: PropTypes.func.isRequired,
  slot: PropTypes.object.isRequired,
}

const FACE = 40

const badgeSx = {
  alignItems: 'center',
  border: '2px solid',
  borderColor: 'background.surface',
  borderRadius: 10,
  bottom: -3,
  boxSizing: 'border-box',
  color: '#fff',
  display: 'flex',
  height: 20,
  justifyContent: 'center',
  minWidth: 20,
  position: 'absolute',
  right: -3,
  '& svg': { color: 'inherit', fontSize: 12 },
}

// The colour of the small dot for a slot of the day.
const DOT_COLOR = {
  done: HOPLA.green,
  other: '#B9B4AA',
  pending: '#8A6F57',
  missed: HOPLA.carrot,
  open: HOPLA.violet,
  upcoming: '#B9B4AA',
}

// One child's copy: their face to tap, the same as on the family board. A
// copy waiting for a parent is faded with a clock, a done one has a check, a
// missed one a turning arrow for the parent to catch it up, one to come later
// is pale. A task of several moments has a dot under the face for each.
export const CopyFace = ({ disabled, dots, label, member, onClick, state }) => {
  const ring =
    state === 'todo' ? HOPLA.violet : state === 'pending' ? '#C9B8A8' : null
  const face = (
    <Box
      sx={{
        borderRadius: '50%',
        boxShadow: ring
          ? `0 0 0 2px var(--joy-palette-background-surface), 0 0 0 4px ${ring}`
          : 'none',
        opacity: state === 'pending' ? 0.55 : state === 'upcoming' ? 0.4 : 1,
      }}
    >
      <MemberAvatar member={member} size={FACE} />
    </Box>
  )
  const badge = ['done', 'pending', 'missed'].includes(state) && (
    <Box
      sx={{
        ...badgeSx,
        bgcolor:
          state === 'done'
            ? HOPLA.green
            : state === 'missed'
              ? HOPLA.carrot
              : '#8A6F57',
      }}
    >
      {state === 'done' ? (
        <CheckRounded />
      ) : state === 'missed' ? (
        <ReplayRounded />
      ) : (
        <AccessTimeRounded />
      )}
    </Box>
  )
  const body = (
    <Box
      sx={{
        alignItems: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        // The face ring takes 4px around it: leave room for the dots below.
        pb: '2px',
      }}
    >
      <Box sx={{ position: 'relative' }}>
        {face}
        {badge}
      </Box>
      {dots?.length > 1 && (
        <Box sx={{ display: 'flex', gap: '5px' }} aria-hidden>
          {dots.map((dot, index) => (
            <Box
              key={index}
              component='span'
              sx={{
                bgcolor: DOT_COLOR[dot] || DOT_COLOR.upcoming,
                borderRadius: '50%',
                height: 8,
                width: 8,
              }}
            />
          ))}
        </Box>
      )}
    </Box>
  )
  if (!onClick) {
    return (
      <Box
        role='img'
        aria-label={label}
        title={member.displayName}
        sx={{ ...cellButtonSx, cursor: 'default', height: 'auto' }}
      >
        {body}
      </Box>
    )
  }
  return (
    <Box
      component='button'
      type='button'
      disabled={disabled}
      aria-label={label}
      title={member.displayName}
      onClick={onClick}
      sx={{
        ...cellButtonSx,
        height: 'auto',
        touchAction: 'manipulation',
        '&:disabled': { cursor: 'default', opacity: 0.5 },
        '&:not(:disabled):active': { transform: 'scale(.92)' },
      }}
    >
      {body}
    </Box>
  )
}

CopyFace.propTypes = {
  disabled: PropTypes.bool,
  dots: PropTypes.array,
  label: PropTypes.string.isRequired,
  member: PropTypes.object.isRequired,
  onClick: PropTypes.func,
  state: PropTypes.oneOf(['todo', 'pending', 'done', 'missed', 'upcoming'])
    .isRequired,
}

// A task done by several children (one copy each), or several times a day, or
// both: one card with a line per child and, for slots, a column per slot.
const TaskGroupRow = ({ chores, onAction, performers = [] }) => {
  const { t } = useTranslation('chores')
  const queryClient = useQueryClient()
  const { data: routines } = useRoutinesToday()
  const { showError } = useNotification()
  const [busy, setBusy] = useState(false)
  const [details, setDetails] = useState(false)
  const first = chores[0]
  const slotted = hasSlots(first)
  const { data: slotsByTask } = useSlotsToday({ enabled: slotted })
  const { data: userProfile } = useUserProfile()
  const { data: familyMembersData } = useFamilyMembers()
  const { impersonatedUser } = useImpersonateUser()
  const actingUserId = impersonatedUser?.userId || userProfile?.id
  const actingMember = familyMembersData?.res?.find(
    member => member.userId === actingUserId,
  )
  const canApprove =
    actingMember?.role === 'admin' ||
    actingMember?.role === 'manager' ||
    chores.some(chore => chore.createdBy === actingUserId)
  const now = new Date()
  const lines = chores.flatMap(chore => {
    const slots = slotted ? todaySlots(chore, slotsByTask, now) : []
    if (!isTogether(chore)) {
      return [{ chore, member: performerOf(chore, performers), slots }]
    }
    // A task for everyone together has a line per member; a slot one of them
    // did is done for the others too. A child who is away has no line.
    const here = taskMemberIds(chore).filter(
      id => !performers.find(p => p.userId === id)?.away,
    )
    return here.map(id => ({
      chore,
      member: performers.find(p => p.userId === id) || { userId: id },
      slots: slots.map(slot =>
        slot.completedBy && slot.completedBy !== id
          ? { ...slot, state: 'other' }
          : slot,
      ),
    }))
  })
  const ahead = slotted ? new Set() : doneCopies(chores, now)
  // The deadline of the first copy still to do.
  const deadlineCopy = chores.find(
    chore =>
      deadlineOf(chore) &&
      !ahead.has(chore.id) &&
      chore.status !== PENDING_APPROVAL,
  )
  // The speed bonus still to win on one of the copies.
  const { data: flashes } = useFlashes()
  const flash =
    flashes?.[
      chores.find(
        chore =>
          flashes?.[chore.id] &&
          !ahead.has(chore.id) &&
          chore.status !== PENDING_APPROVAL,
      )?.id
    ]
  const columns = lines.find(line => line.slots.length)?.slots || []
  const all = lines.flatMap(line => line.slots)
  const doneCount = all.filter(slot => slot.state === 'done').length
  const pendingCount = all.filter(slot => slot.state === 'pending').length
  const missedCount = all.filter(slot => slot.state === 'missed').length
  // The moment to do now, else the next one, and the one after it.
  const upNext = columns.filter(column =>
    lines.some(line =>
      ['open', 'upcoming'].includes(
        line.slots.find(slot => slot.index === column.index)?.state,
      ),
    ),
  )
  const momentLabel = slot =>
    [slot.name, slot.time].filter(Boolean).join(' ') || ''

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['chores'] })
    queryClient.invalidateQueries({ queryKey: ['slots'] })
    queryClient.invalidateQueries({ queryKey: ['games', 'today'] })
  }
  const run = async request => {
    setBusy(true)
    try {
      const response = await request
      if (!response?.ok) {
        const body = await response?.json().catch(() => null)
        showError({ title: t('slots.failed'), message: body?.error || '' })
      }
    } catch {
      showError({ title: t('slots.failed'), message: '' })
    } finally {
      setBusy(false)
      refresh()
    }
  }
  const onSlot = (chore, member) => (action, slot) => {
    if (action === 'tick') {
      // A parent ticks for the child, done at once; a child's own tick may
      // wait for a parent.
      if (canApprove) {
        run(
          SlotAction(chore.id, slot.index, 'catchup', {
            completedBy: member.userId,
          }),
        )
      } else {
        const self = impersonatedUser
          ? { completedBy: impersonatedUser.userId }
          : null
        run(MarkChoreComplete(chore.id, self, null, null))
      }
      return
    }
    run(SlotAction(chore.id, slot.index, action))
  }
  const approveAll = () =>
    run(
      Promise.all(
        lines
          .filter(line => line.slots.some(slot => slot.state === 'pending'))
          .map(line => ApproveChore(line.chore.id)),
      ).then(responses => responses.find(r => !r.ok) || responses[0]),
    )

  // Several slots to approve get a footer with the count and one button.
  const footer = slotted && canApprove && pendingCount > 1
  const mode = taskModeOf(first, chores.length)
  const inRoutine = chores.some(chore => routineStepOf(routines, chore))
  const meta = []
  if (slotted && columns.length > 1 && upNext.length) {
    meta.push(
      upNext.length > 1
        ? t('slots.nextThen', {
            next: momentLabel(upNext[0]),
            then: momentLabel(upNext[1]),
          })
        : momentLabel(upNext[0]),
    )
  } else if (slotted && columns.length === 1 && upNext.length) {
    meta.push(momentLabel(upNext[0]))
  } else if (slotted && doneCount) {
    meta.push(t('slots.summary', { done: doneCount, total: all.length }))
  }
  if (!footer && canApprove && pendingCount)
    meta.push(t('slots.toApprove', { count: pendingCount }))
  if (!footer && canApprove && missedCount)
    meta.push(t('slots.missedCount', { count: missedCount }))

  const hopChip = first.points > 0 && (
    <Box
      component='span'
      sx={{
        alignItems: 'center',
        bgcolor: HOPLA.goldSoft,
        borderRadius: 999,
        color: HOPLA.goldText,
        display: 'inline-flex',
        flexShrink: 0,
        mr: 0.75,
        verticalAlign: 'middle',
        font: '700 12px/18px var(--joy-fontFamily-body)',
        gap: 0.25,
        px: 0.875,
        py: 0.25,
      }}
    >
      <TollRounded sx={{ fontSize: 14 }} />
      {slotted && columns.length > 1
        ? t('slots.hopsPerSlot', { count: first.points })
        : first.points}
    </Box>
  )

  return (
    <Box sx={{ bgcolor: 'background.surface', px: 1.5, py: 1.25 }}>
      <Box sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            level='body-md'
            sx={{ fontWeight: 600, lineHeight: 1.35, overflowWrap: 'anywhere' }}
          >
            {first.name}
          </Typography>
          {(mode ||
            meta.length > 0 ||
            flash ||
            inRoutine ||
            deadlineCopy ||
            (slotted && hopChip)) && (
            <Typography
              level='body-xs'
              sx={{ color: 'text.secondary', mt: 0.25 }}
            >
              {slotted && hopChip}
              <ChronoChip flash={flash} sx={{ mr: 0.75 }} />
              {deadlineCopy && (
                <DeadlineChip chore={deadlineCopy} sx={{ mr: 0.75 }} />
              )}
              <RoutineChip chores={chores} sx={{ mr: 0.75 }} />
              <TaskMode mode={mode} />
              {mode && meta.length > 0 && ' · '}
              {meta.join(' · ')}
            </Typography>
          )}
        </Box>
        {!slotted && hopChip}
        {slotted && columns.length > 0 && (
          <Box sx={{ display: 'flex', flexShrink: 0, gap: 1 }}>
            {lines.map(({ chore, member, slots }) => {
              const label = member.displayName || ''
              const face = faceOf(
                slots,
                canApprove,
                member.userId === actingUserId,
              )
              const slot = face.slot
              const on = slot ? onSlot(chore, member) : null
              return (
                <CopyFace
                  key={`${chore.id}-${member.userId}`}
                  disabled={busy}
                  dots={slots.map(item => item.state)}
                  label={t(`slots.face.${face.state}`, {
                    label: `${label} · ${slot ? momentLabel(slot) : ''}`.trim(),
                  })}
                  member={member}
                  onClick={
                    face.action && slot
                      ? event => {
                          event.stopPropagation()
                          on(face.action, slot)
                        }
                      : undefined
                  }
                  state={face.state}
                />
              )
            })}
          </Box>
        )}
        {slotted && columns.length === 0 && (
          // A day with no moment today (a task for another day): the faces,
          // pale, until the day comes.
          <Box sx={{ display: 'flex', flexShrink: 0, gap: 1 }}>
            {lines.map(({ chore, member }) => (
              <CopyFace
                key={`${chore.id}-${member.userId}`}
                label={member.displayName || ''}
                member={member}
                state='upcoming'
              />
            ))}
          </Box>
        )}
        {!slotted && (
          <Box sx={{ display: 'flex', flexShrink: 0, gap: 1 }}>
            {lines.map(({ chore, member }) => {
              const label = member.displayName || ''
              const key = `${chore.id}-${member.userId}`
              if (ahead.has(chore.id)) {
                return (
                  <CopyFace
                    key={key}
                    label={t('slots.cell.done', { label })}
                    member={member}
                    state='done'
                  />
                )
              }
              const pending = chore.status === 3
              return (
                <CopyFace
                  key={key}
                  disabled={
                    busy ||
                    (!canApprove && (pending || member.userId !== actingUserId))
                  }
                  label={
                    pending
                      ? t('slots.cell.approve', { label })
                      : t('taskRow.complete', {
                          name: `${first.name} · ${label}`,
                        })
                  }
                  member={member}
                  onClick={event => {
                    event.stopPropagation()
                    if (pending) onAction('approve', chore)
                    else
                      onAction('complete', chore, {
                        completedBy: member.userId,
                      })
                  }}
                  state={pending ? 'pending' : 'todo'}
                />
              )
            })}
          </Box>
        )}
      </Box>

      {slotted && (columns.length > 1 || (canApprove && pendingCount > 0)) && (
        <Box
          component='button'
          type='button'
          aria-expanded={details}
          onClick={event => {
            event.stopPropagation()
            setDetails(value => !value)
          }}
          sx={{
            alignItems: 'center',
            background: 'none',
            border: 0,
            color: 'text.secondary',
            cursor: 'pointer',
            display: 'inline-flex',
            font: '600 12px/1 var(--joy-fontFamily-body)',
            gap: 0.25,
            minHeight: 32,
            mt: 0.25,
            p: 0,
            '&:focus-visible': {
              outline: '2px solid',
              outlineColor: 'primary.500',
            },
          }}
        >
          {details ? t('slots.hideDetails') : t('slots.details')}
          <ExpandMoreRounded
            sx={{
              fontSize: 18,
              transform: details ? 'rotate(180deg)' : 'none',
            }}
          />
        </Box>
      )}

      {slotted && columns.length > 0 && details && (
        <Box
          onClick={event => event.stopPropagation()}
          sx={{
            alignItems: 'center',
            columnGap: 0.75,
            display: 'grid',
            gridTemplateColumns: `32px repeat(${columns.length}, minmax(0, 1fr))`,
            mt: 1.25,
            rowGap: 0.75,
          }}
        >
          <span />
          {columns.map(slot => {
            const open = slot.state === 'open'
            return (
              <Box key={slot.index} sx={{ textAlign: 'center' }}>
                <Typography
                  level='body-xs'
                  sx={{
                    color: open ? HOPLA.violet : 'text.secondary',
                    fontWeight: 700,
                  }}
                >
                  {slot.name || slot.time}
                </Typography>
                {slot.name && (
                  <Typography
                    level='body-xs'
                    sx={{
                      color: open ? HOPLA.violet : 'text.tertiary',
                      fontSize: 11,
                    }}
                  >
                    {slot.time}
                  </Typography>
                )}
              </Box>
            )
          })}
          {lines.map(({ chore, member, slots }) => (
            <Box
              key={`${chore.id}-${member.userId}`}
              sx={{ display: 'contents' }}
            >
              <Box title={member.displayName} sx={{ display: 'flex' }}>
                <MemberAvatar member={member} size={30} />
              </Box>
              {columns.map(column => {
                const slot = slots.find(s => s.index === column.index)
                if (!slot) return <span key={column.index} />
                return (
                  <SlotCell
                    key={column.index}
                    busy={busy}
                    canApprove={canApprove}
                    canTick={canApprove || member.userId === actingUserId}
                    color={memberColor(member.userId)}
                    label={`${member.displayName || ''} · ${slot.name || slot.time}`}
                    onSlot={onSlot(chore, member)}
                    slot={slot}
                  />
                )
              })}
            </Box>
          ))}
        </Box>
      )}

      {footer && (
        <Box
          onClick={event => event.stopPropagation()}
          sx={{
            alignItems: 'center',
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            gap: 1,
            mt: 1.25,
            pt: 1,
          }}
        >
          <Typography level='body-xs' sx={{ color: 'text.secondary', flex: 1 }}>
            {[
              t('slots.toApprove', { count: pendingCount }),
              missedCount
                ? t('slots.missedCount', { count: missedCount })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Typography>
          <Button
            size='sm'
            disabled={busy}
            startDecorator={<CheckRounded />}
            onClick={approveAll}
            sx={{ borderRadius: 999, minHeight: CELL }}
          >
            {t('slots.approveAll', { count: pendingCount })}
          </Button>
        </Box>
      )}
    </Box>
  )
}

TaskGroupRow.propTypes = {
  chores: PropTypes.array.isRequired,
  onAction: PropTypes.func.isRequired,
  performers: PropTypes.array,
}

export default TaskGroupRow
