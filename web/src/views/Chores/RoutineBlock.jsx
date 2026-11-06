import { FormatListNumberedRounded } from '@mui/icons-material'
import { Box, LinearProgress, Sheet, Stack, Typography } from '@mui/joy'
import { useQueryClient } from '@tanstack/react-query'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { HOPLA } from '../../constants/theme'
import { useImpersonateUser } from '../../contexts/ImpersonateUserContext.jsx'
import { useSlotsToday } from '../../queries/ChoreQueries'
import { useFamilyMembers, useUserProfile } from '../../queries/UserQueries'
import { useNotification } from '../../service/NotificationProvider'
import { MarkChoreComplete, SlotAction } from '../../utils/Fetcher'
import {
  firstStepName,
  missedSteps,
  nextStepName,
  routineEndsAt,
  routineItemOf,
  routineStepOf,
  stepMoment,
} from '../../utils/routines'
import { todaySlots } from '../../utils/taskSlots'
import { CopyFace } from './TaskGroupRow'

// A routine under way, above the list: one line per child with the step to do
// now and their face on the right to tick it, as on the family board. A child
// with several steps open at once has a line per step under their name.
//
// A step about a moment of a task shows that moment only, orange once its
// time is past. A step whose moment closed, or that was left when the routine
// ended, is missed: it stays greyed with a turning arrow on the face, for a
// parent to catch it up until midnight. A routine with hours shows, in the
// hour before it opens, as coming; once over, its block turns orange while
// steps are left to catch up.

const PENDING_APPROVAL = 3

const TONES = {
  neutral: { bg: 'background.level1', color: 'text.secondary' },
  late: { bg: HOPLA.carrotSoft, color: HOPLA.carrotText },
  missed: { bg: HOPLA.redSoft, color: HOPLA.red },
}

const MomentPill = ({ missed, moment }) => {
  const { t } = useTranslation('chores')
  if (!moment && !missed) return null
  const tone = missed ? 'missed' : moment.tone
  const name = moment ? moment.slot.name || moment.slot.time : ''
  const text =
    tone === 'missed'
      ? name
        ? t('routineBlock.momentMissed', { name })
        : t('routineBlock.missed')
      : tone === 'late'
        ? t('routineBlock.momentLate', { name })
        : name
  return (
    <Typography
      component='span'
      level='body-xs'
      noWrap
      sx={{
        bgcolor: TONES[tone].bg,
        borderRadius: 999,
        color: TONES[tone].color,
        flexShrink: 0,
        fontWeight: 700,
        px: 0.875,
        py: 0.125,
      }}
    >
      {text}
    </Typography>
  )
}

MomentPill.propTypes = {
  missed: PropTypes.bool,
  moment: PropTypes.object,
}

const StepName = ({ children, chore, muted }) => {
  const navigate = useNavigate()
  return (
    <Box
      sx={{
        alignItems: 'center',
        display: 'flex',
        flex: 1,
        gap: 0.75,
        minWidth: 0,
      }}
    >
      <Typography
        component='button'
        level='title-sm'
        noWrap
        type='button'
        onClick={() => navigate(`/chores/${chore.id}`)}
        sx={{
          background: 'none',
          border: 0,
          color: muted ? 'text.tertiary' : undefined,
          cursor: 'pointer',
          minWidth: 0,
          p: 0,
          textAlign: 'start',
        }}
      >
        {chore.name}
      </Typography>
      {children}
    </Box>
  )
}

StepName.propTypes = {
  children: PropTypes.node,
  chore: PropTypes.object.isRequired,
  muted: PropTypes.bool,
}

// The face to tick a step to do now, or to approve it once ticked.
const StepFace = ({ canApprove, chore, disabled, member, onAction }) => {
  const { t } = useTranslation('chores')
  const pending = chore.status === PENDING_APPROVAL
  return (
    <CopyFace
      disabled={disabled || (pending && !canApprove)}
      label={
        pending
          ? t('slots.cell.approve', { label: chore.name })
          : t('taskRow.complete', { name: chore.name })
      }
      member={member}
      onClick={event => {
        event.stopPropagation()
        if (pending) onAction('approve', chore)
        else onAction('complete', chore, { completedBy: member.userId })
      }}
      state={pending ? 'pending' : 'todo'}
    />
  )
}

StepFace.propTypes = {
  canApprove: PropTypes.bool,
  chore: PropTypes.object.isRequired,
  disabled: PropTypes.bool,
  member: PropTypes.object.isRequired,
  onAction: PropTypes.func.isRequired,
}

const StepLine = ({
  canApprove,
  chore,
  disabled,
  member,
  moment,
  onAction,
}) => (
  <Box sx={{ alignItems: 'center', display: 'flex', gap: 1.25 }}>
    <StepName chore={chore}>
      <MomentPill moment={moment} />
    </StepName>
    <StepFace
      canApprove={canApprove}
      chore={chore}
      disabled={disabled}
      member={member}
      onAction={onAction}
    />
  </Box>
)

StepLine.propTypes = {
  canApprove: PropTypes.bool,
  chore: PropTypes.object.isRequired,
  disabled: PropTypes.bool,
  member: PropTypes.object.isRequired,
  moment: PropTypes.object,
  onAction: PropTypes.func.isRequired,
}

// A missed step: greyed, with a turning arrow on the face that only a parent
// can touch, until midnight.
const MissedLine = ({ canApprove, chore, member, moment, onCatchUp }) => {
  const { t } = useTranslation('chores')
  return (
    <Box sx={{ alignItems: 'center', display: 'flex', gap: 1.25 }}>
      <StepName chore={chore} muted>
        <MomentPill missed moment={moment} />
      </StepName>
      <CopyFace
        disabled={!canApprove}
        label={t('slots.face.missed', { label: chore.name })}
        member={member}
        onClick={event => {
          event.stopPropagation()
          onCatchUp(chore, moment?.slot, member)
        }}
        state='missed'
      />
    </Box>
  )
}

MissedLine.propTypes = {
  canApprove: PropTypes.bool,
  chore: PropTypes.object.isRequired,
  member: PropTypes.object.isRequired,
  moment: PropTypes.object,
  onCatchUp: PropTypes.func.isRequired,
}

const ChildLine = ({
  actingUserId,
  allChores,
  canApprove,
  member,
  next,
  onAction,
  onCatchUp,
  openSteps,
  progress,
  slotsOf,
  window,
}) => {
  const { t } = useTranslation('chores')
  const coming = window === 'upcoming'
  const over = window === 'over'
  // The steps behind the current one count as done, even when one of them is
  // no longer due today.
  const behind = Math.max(progress.done, (progress.step || 1) - 1)
  const share = progress.finished
    ? 100
    : progress.total
      ? ((over ? progress.done : behind) * 100) / progress.total
      : 0
  const missed = missedSteps(progress)
    .map(item => ({
      item,
      chore: allChores.find(chore => chore.id === item.choreId),
    }))
    .filter(entry => entry.chore)
  const momentOf = (chore, item) => stepMoment(item, slotsOf(chore))
  const count = progress.finished
    ? t('routineBlock.finished')
    : coming
      ? t('routineBlock.steps', { count: progress.total })
      : over
        ? t('routineBlock.missedCount', { count: missed.length })
        : t('routineBlock.at', {
            step: progress.step || progress.done + 1,
            total: progress.total,
          })
  const bar = !coming && (
    <LinearProgress
      determinate
      value={share}
      thickness={6}
      sx={{
        bgcolor: 'background.level1',
        color: over ? HOPLA.carrot : HOPLA.green,
      }}
    />
  )
  const stepLine = chore => (
    <StepLine
      key={chore.id}
      canApprove={canApprove}
      chore={chore}
      disabled={member.userId !== actingUserId && !canApprove}
      member={member}
      moment={momentOf(chore, routineItemOf(progress, chore.id))}
      onAction={onAction}
    />
  )
  const missedLines = missed.map(({ chore, item }) => (
    <MissedLine
      key={`missed-${item.id}`}
      canApprove={canApprove}
      chore={chore}
      member={member}
      moment={momentOf(chore, item)}
      onCatchUp={onCatchUp}
    />
  ))
  const head = (
    <Box sx={{ alignItems: 'baseline', display: 'flex', gap: 1 }}>
      <Typography level='title-md' noWrap sx={{ flex: 1, fontWeight: 800 }}>
        {member.displayName}
      </Typography>
      <Typography
        level='body-xs'
        sx={{
          color: progress.finished
            ? HOPLA.greenText
            : over
              ? HOPLA.carrotText
              : 'text.secondary',
          fontWeight: 700,
        }}
      >
        {count}
      </Typography>
    </Box>
  )
  if (coming) {
    return (
      <Stack sx={{ gap: 0.5 }}>
        {head}
        {next && (
          <Typography level='body-xs' noWrap sx={{ color: 'text.tertiary' }}>
            {t('routineBlock.first', { name: next })}
          </Typography>
        )}
      </Stack>
    )
  }
  const only = openSteps.length === 1 && !missed.length ? openSteps[0] : null
  if (!only) {
    return (
      <Stack sx={{ gap: 0.75 }}>
        {head}
        {bar}
        {!openSteps.length && !missed.length && !progress.finished && (
          <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
            {t('routineBlock.waiting')}
          </Typography>
        )}
        {(openSteps.length > 0 || missed.length > 0) && (
          <Stack sx={{ gap: 2, py: 0.75 }}>
            {openSteps.map(stepLine)}
            {missedLines}
          </Stack>
        )}
      </Stack>
    )
  }
  return (
    <Box sx={{ alignItems: 'center', display: 'flex', gap: 1.25 }}>
      <Stack sx={{ flex: 1, gap: 0.5, minWidth: 0 }}>
        {head}
        <Box sx={{ alignItems: 'center', display: 'flex', gap: 0.75 }}>
          <Typography level='title-sm' noWrap>
            {only.name}
          </Typography>
          <MomentPill
            moment={momentOf(only, routineItemOf(progress, only.id))}
          />
        </Box>
        {bar}
        {!progress.finished && next && (
          <Typography level='body-xs' noWrap sx={{ color: 'text.tertiary' }}>
            {t('routineBlock.next', { name: next })}
          </Typography>
        )}
      </Stack>
      <StepFace
        canApprove={canApprove}
        chore={only}
        disabled={member.userId !== actingUserId && !canApprove}
        member={member}
        onAction={onAction}
      />
    </Box>
  )
}

ChildLine.propTypes = {
  actingUserId: PropTypes.number,
  allChores: PropTypes.array.isRequired,
  canApprove: PropTypes.bool,
  member: PropTypes.object.isRequired,
  next: PropTypes.string,
  onAction: PropTypes.func.isRequired,
  onCatchUp: PropTypes.func.isRequired,
  openSteps: PropTypes.array.isRequired,
  progress: PropTypes.object.isRequired,
  slotsOf: PropTypes.func.isRequired,
  window: PropTypes.string,
}

const RoutineBlock = ({
  allChores,
  chores,
  onAction: onChoreAction,
  routine,
}) => {
  const { i18n, t } = useTranslation('chores')
  const queryClient = useQueryClient()
  const { showError } = useNotification()
  const { data: slotsByTask } = useSlotsToday()
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['games', 'today'] })
    queryClient.invalidateQueries({ queryKey: ['chores'] })
  }
  // Ticking a step moves the child on: the routines are read again once the
  // task is saved.
  const onAction = (...args) => {
    Promise.resolve(onChoreAction(...args)).finally(refresh)
    setTimeout(refresh, 1500)
  }
  // A parent catches a missed step up for the child: its moment, or the
  // task itself when the step is the whole task.
  const onCatchUp = async (chore, slot, member) => {
    try {
      const response = slot
        ? await SlotAction(chore.id, slot.index, 'catchup', {
            completedBy: member.userId,
          })
        : await MarkChoreComplete(
            chore.id,
            { completedBy: member.userId },
            null,
            null,
          )
      if (!response?.ok) {
        const body = await response?.json().catch(() => null)
        showError({ title: t('slots.failed'), message: body?.error || '' })
      }
    } catch {
      showError({ title: t('slots.failed'), message: '' })
    } finally {
      refresh()
    }
  }
  const { data: userProfile } = useUserProfile()
  const { data: membersData } = useFamilyMembers()
  const { impersonatedUser } = useImpersonateUser()
  const members = membersData?.res || []
  const actingUserId = impersonatedUser?.userId || userProfile?.id
  const acting = members.find(member => member.userId === actingUserId)
  const canApprove = acting?.role === 'admin' || acting?.role === 'manager'
  const window = routine.window || ''
  const coming = window === 'upcoming'
  const over =
    window === 'over' && routine.members.some(progress => !progress.finished)
  const endsAt = routineEndsAt(routine)
  const slotsOf = chore => todaySlots(chore, slotsByTask)
  const openStepsOf = userId =>
    chores.filter(chore => routineStepOf([routine], chore, userId))
  // Filtered out of the list (another child, a label): the block goes too.
  const visible =
    chores.some(chore => routineStepOf([routine], chore)) ||
    routine.members.some(progress =>
      (progress.missed || []).some(id =>
        allChores.some(chore => chore.id === id),
      ),
    ) ||
    coming
  if (!visible) return null
  const clock = date =>
    new Intl.DateTimeFormat(i18n.language, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date)
  const color = coming
    ? 'text.secondary'
    : over
      ? HOPLA.carrotText
      : HOPLA.greenText
  const headRight = coming
    ? routine.opensAt &&
      t('routineBlock.startsAt', { time: clock(new Date(routine.opensAt)) })
    : over
      ? endsAt && t('routineBlock.endedAt', { time: clock(endsAt) })
      : endsAt && t('routineBlock.until', { time: clock(endsAt) })
  return (
    <Sheet
      aria-label={t(
        coming ? 'routineBlock.labelComing' : 'routineBlock.label',
        {
          name: routine.name,
        },
      )}
      component='section'
      sx={theme => ({
        background: coming
          ? 'var(--joy-palette-background-level1)'
          : `linear-gradient(${over ? HOPLA.carrotSoft : HOPLA.greenSoft}, transparent 140px)`,
        border: '2px',
        borderColor: coming
          ? 'neutral.outlinedBorder'
          : over
            ? HOPLA.carrot
            : HOPLA.green,
        borderStyle: coming ? 'dashed' : 'solid',
        borderRadius: 'xl',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        mb: 2,
        mt: 0.5,
        p: 1.5,
        [theme.getColorSchemeSelector('dark')]: {
          background: coming
            ? 'transparent'
            : over
              ? 'linear-gradient(rgba(255, 122, 47, 0.16), transparent 140px)'
              : 'linear-gradient(rgba(35, 147, 79, 0.18), transparent 140px)',
        },
      })}
    >
      <Box
        sx={theme => ({
          alignItems: 'center',
          color,
          display: 'flex',
          gap: 0.75,
          [theme.getColorSchemeSelector('dark')]: {
            color: coming ? undefined : over ? '#FFB48A' : '#8FD9AA',
          },
        })}
      >
        <FormatListNumberedRounded sx={{ fontSize: 20 }} />
        <Typography
          level='title-md'
          noWrap
          sx={{ color: 'inherit', flex: 1, fontWeight: 800 }}
        >
          {routine.name}
        </Typography>
        {headRight && (
          <Typography
            level='body-xs'
            sx={{ color: 'inherit', fontWeight: 700, whiteSpace: 'nowrap' }}
          >
            {headRight}
          </Typography>
        )}
      </Box>
      <Stack sx={{ gap: 1.5 }}>
        {routine.members.map(progress => {
          const member = members.find(m => m.userId === progress.userId)
          if (!member) return null
          if (coming && !progress.total) return null
          return (
            <ChildLine
              key={progress.userId}
              actingUserId={actingUserId}
              allChores={allChores}
              canApprove={canApprove}
              member={member}
              next={
                coming
                  ? firstStepName(routine, allChores)
                  : nextStepName(routine, progress, allChores)
              }
              onAction={onAction}
              onCatchUp={onCatchUp}
              openSteps={openStepsOf(progress.userId)}
              progress={progress}
              slotsOf={slotsOf}
              window={over ? 'over' : coming ? 'upcoming' : ''}
            />
          )
        })}
      </Stack>
    </Sheet>
  )
}

RoutineBlock.propTypes = {
  allChores: PropTypes.array.isRequired,
  chores: PropTypes.array.isRequired,
  onAction: PropTypes.func.isRequired,
  routine: PropTypes.object.isRequired,
}

export default RoutineBlock
