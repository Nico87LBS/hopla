import {
  CheckRounded,
  CloseRounded,
  HourglassEmptyRounded,
  ReplayRounded,
  TollRounded,
} from '@mui/icons-material'
import { Box, Button, Typography } from '@mui/joy'
import { useQueryClient } from '@tanstack/react-query'
import PropTypes from 'prop-types'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { HOPLA, memberColor } from '../../constants/theme'
import { useImpersonateUser } from '../../contexts/ImpersonateUserContext.jsx'
import { useSlotsToday } from '../../queries/ChoreQueries'
import { useCircleMembers, useUserProfile } from '../../queries/UserQueries'
import { useNotification } from '../../service/NotificationProvider'
import {
  ApproveChore,
  MarkChoreComplete,
  SlotAction,
} from '../../utils/Fetcher'
import { hasSlots, todaySlots } from '../../utils/taskSlots'
import { MemberAvatar } from '../Games/GameParts'

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

// A task done by several children (one copy each), or several times a day, or
// both: one card with a line per child and, for slots, a column per slot.
const TaskGroupRow = ({ chores, onAction, performers = [] }) => {
  const { t } = useTranslation('chores')
  const queryClient = useQueryClient()
  const { showError } = useNotification()
  const [busy, setBusy] = useState(false)
  const first = chores[0]
  const slotted = hasSlots(first)
  const { data: slotsByTask } = useSlotsToday({ enabled: slotted })
  const { data: userProfile } = useUserProfile()
  const { data: circleMembersData } = useCircleMembers()
  const { impersonatedUser } = useImpersonateUser()
  const actingUserId = impersonatedUser?.userId || userProfile?.id
  const actingMember = circleMembersData?.res?.find(
    member => member.userId === actingUserId,
  )
  const canApprove =
    actingMember?.role === 'admin' ||
    actingMember?.role === 'manager' ||
    chores.some(chore => chore.createdBy === actingUserId)
  const now = new Date()
  const lines = chores.map(chore => ({
    chore,
    member: performerOf(chore, performers),
    slots: slotted ? todaySlots(chore, slotsByTask, now) : [],
  }))
  const columns = lines.find(line => line.slots.length)?.slots || []
  const all = lines.flatMap(line => line.slots)
  const doneCount = all.filter(slot => slot.state === 'done').length
  const pendingCount = all.filter(slot => slot.state === 'pending').length
  const missedCount = all.filter(slot => slot.state === 'missed').length

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
  const meta = []
  if (slotted)
    meta.push(t('slots.summary', { done: doneCount, total: all.length }))
  if (chores.length > 1) meta.push(t('slots.copies'))
  if (!footer && canApprove && pendingCount)
    meta.push(t('slots.toApprove', { count: pendingCount }))
  if (!footer && canApprove && missedCount)
    meta.push(t('slots.missedCount', { count: missedCount }))

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
          {meta.length > 0 && (
            <Typography
              level='body-xs'
              sx={{ color: 'text.secondary', mt: 0.25 }}
            >
              {meta.join(' · ')}
            </Typography>
          )}
        </Box>
        {first.points > 0 && (
          <Box
            component='span'
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
            {slotted
              ? t('slots.hopsPerSlot', { count: first.points })
              : first.points}
          </Box>
        )}
        {!slotted && (
          <Box sx={{ display: 'flex', flexShrink: 0 }}>
            {lines.map(({ chore, member }) => {
              const color = memberColor(member.userId)
              const pending = chore.status === 3
              const label = member.displayName || ''
              return (
                <Box
                  key={chore.id}
                  component='button'
                  type='button'
                  disabled={
                    busy ||
                    (!canApprove && (pending || member.userId !== actingUserId))
                  }
                  aria-label={
                    pending
                      ? t('slots.cell.approve', { label })
                      : t('taskRow.complete', {
                          name: `${first.name} · ${label}`,
                        })
                  }
                  title={label}
                  onClick={event => {
                    event.stopPropagation()
                    if (pending) onAction('approve', chore)
                    else
                      onAction('complete', chore, {
                        completedBy: member.userId,
                      })
                  }}
                  sx={cellButtonSx}
                >
                  <Box
                    sx={{
                      ...ringSx,
                      bgcolor: pending ? HOPLA.goldSoft : 'transparent',
                      border: pending
                        ? `2.5px dashed ${HOPLA.gold}`
                        : `2.5px solid ${color}`,
                      color: pending ? HOPLA.goldText : color,
                      font: '700 13px/1 var(--joy-fontFamily-body)',
                    }}
                  >
                    {pending ? <HourglassEmptyRounded /> : label.charAt(0)}
                  </Box>
                </Box>
              )
            })}
          </Box>
        )}
      </Box>

      {slotted && columns.length > 0 && (
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
            <Box key={chore.id} sx={{ display: 'contents' }}>
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
