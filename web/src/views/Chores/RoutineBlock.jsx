import { FormatListNumberedRounded } from '@mui/icons-material'
import { Box, LinearProgress, Sheet, Stack, Typography } from '@mui/joy'
import { useQueryClient } from '@tanstack/react-query'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { HOPLA } from '../../constants/theme'
import { useImpersonateUser } from '../../contexts/ImpersonateUserContext.jsx'
import { useFamilyMembers, useUserProfile } from '../../queries/UserQueries'
import {
  nextStepName,
  routineEndsAt,
  routineStepOf,
} from '../../utils/routines'
import { CopyFace } from './TaskGroupRow'

// A routine under way, above the list: one line per child with the step to do
// now and their face on the right to tick it, as on the family board. A child
// with several steps open at once has a line per step under their name.

const PENDING_APPROVAL = 3

const StepLine = ({ canApprove, chore, disabled, member, onAction }) => {
  const { t } = useTranslation('chores')
  const navigate = useNavigate()
  const pending = chore.status === PENDING_APPROVAL
  return (
    <Box sx={{ alignItems: 'center', display: 'flex', gap: 1.25 }}>
      <Typography
        component='button'
        level='title-sm'
        type='button'
        onClick={() => navigate(`/chores/${chore.id}`)}
        sx={{
          background: 'none',
          border: 0,
          cursor: 'pointer',
          flex: 1,
          minWidth: 0,
          p: 0,
          textAlign: 'start',
        }}
      >
        {chore.name}
      </Typography>
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
    </Box>
  )
}

StepLine.propTypes = {
  canApprove: PropTypes.bool,
  chore: PropTypes.object.isRequired,
  disabled: PropTypes.bool,
  member: PropTypes.object.isRequired,
  onAction: PropTypes.func.isRequired,
}

const ChildLine = ({
  actingUserId,
  canApprove,
  member,
  next,
  onAction,
  openSteps,
  progress,
}) => {
  const { t } = useTranslation('chores')
  // The steps behind the current one count as done, even when one of them is
  // no longer due today.
  const behind = Math.max(progress.done, (progress.step || 1) - 1)
  const share = progress.finished
    ? 100
    : progress.total
      ? (behind * 100) / progress.total
      : 0
  const several = openSteps.length > 1
  const count = progress.finished
    ? t('routineBlock.finished')
    : t('routineBlock.at', {
        step: progress.step || progress.done + 1,
        total: progress.total,
      })
  const bar = (
    <LinearProgress
      determinate
      value={share}
      thickness={6}
      sx={{ bgcolor: 'background.level1', color: HOPLA.green }}
    />
  )
  const stepLine = chore => (
    <StepLine
      key={chore.id}
      canApprove={canApprove}
      chore={chore}
      disabled={member.userId !== actingUserId && !canApprove}
      member={member}
      onAction={onAction}
    />
  )
  const head = (
    <Box sx={{ alignItems: 'baseline', display: 'flex', gap: 1 }}>
      <Typography level='title-md' noWrap sx={{ flex: 1, fontWeight: 800 }}>
        {member.displayName}
      </Typography>
      <Typography
        level='body-xs'
        sx={{
          color: progress.finished ? HOPLA.greenText : 'text.secondary',
          fontWeight: 700,
        }}
      >
        {count}
      </Typography>
    </Box>
  )
  if (several) {
    return (
      <Stack sx={{ gap: 0.75 }}>
        {head}
        {bar}
        <Stack sx={{ gap: 2, py: 0.75 }}>{openSteps.map(stepLine)}</Stack>
      </Stack>
    )
  }
  const only = openSteps[0]
  return (
    <Box sx={{ alignItems: 'center', display: 'flex', gap: 1.25 }}>
      <Stack sx={{ flex: 1, gap: 0.5, minWidth: 0 }}>
        {head}
        {only ? (
          <Typography level='title-sm' noWrap>
            {only.name}
          </Typography>
        ) : (
          !progress.finished && (
            <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
              {t('routineBlock.waiting')}
            </Typography>
          )
        )}
        {bar}
        {!progress.finished && next && only && (
          <Typography level='body-xs' noWrap sx={{ color: 'text.tertiary' }}>
            {t('routineBlock.next', { name: next })}
          </Typography>
        )}
      </Stack>
      {!only && <Box sx={{ flexShrink: 0, width: 40 }} />}
      {only && (
        <CopyFace
          disabled={member.userId !== actingUserId && !canApprove}
          label={
            only.status === PENDING_APPROVAL
              ? t('slots.cell.approve', { label: only.name })
              : t('taskRow.complete', { name: only.name })
          }
          member={member}
          onClick={event => {
            event.stopPropagation()
            if (only.status === PENDING_APPROVAL) onAction('approve', only)
            else onAction('complete', only, { completedBy: member.userId })
          }}
          state={only.status === PENDING_APPROVAL ? 'pending' : 'todo'}
        />
      )}
    </Box>
  )
}

ChildLine.propTypes = {
  actingUserId: PropTypes.number,
  canApprove: PropTypes.bool,
  member: PropTypes.object.isRequired,
  next: PropTypes.string,
  onAction: PropTypes.func.isRequired,
  openSteps: PropTypes.array.isRequired,
  progress: PropTypes.object.isRequired,
}

const RoutineBlock = ({
  allChores,
  chores,
  onAction: onChoreAction,
  routine,
}) => {
  const { i18n, t } = useTranslation('chores')
  const queryClient = useQueryClient()
  // Ticking a step moves the child on: the routines are read again once the
  // task is saved.
  const onAction = (...args) => {
    const refresh = () =>
      queryClient.invalidateQueries({ queryKey: ['games', 'today'] })
    Promise.resolve(onChoreAction(...args)).finally(refresh)
    setTimeout(refresh, 1500)
  }
  const { data: userProfile } = useUserProfile()
  const { data: membersData } = useFamilyMembers()
  const { impersonatedUser } = useImpersonateUser()
  const members = membersData?.res || []
  const actingUserId = impersonatedUser?.userId || userProfile?.id
  const acting = members.find(member => member.userId === actingUserId)
  const canApprove = acting?.role === 'admin' || acting?.role === 'manager'
  const endsAt = routineEndsAt(routine)
  const openStepsOf = userId =>
    chores.filter(chore => routineStepOf([routine], chore, userId))
  // Filtered out of the list (another child, a label): the block goes too.
  if (!chores.some(chore => routineStepOf([routine], chore))) return null
  return (
    <Sheet
      aria-label={t('routineBlock.label', { name: routine.name })}
      component='section'
      sx={theme => ({
        background: `linear-gradient(${HOPLA.greenSoft}, transparent 140px)`,
        border: '2px solid',
        borderColor: HOPLA.green,
        borderRadius: 'xl',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        mb: 2,
        mt: 0.5,
        p: 1.5,
        [theme.getColorSchemeSelector('dark')]: {
          background: `linear-gradient(rgba(35, 147, 79, 0.18), transparent 140px)`,
        },
      })}
    >
      <Box
        sx={theme => ({
          alignItems: 'center',
          color: HOPLA.greenText,
          display: 'flex',
          gap: 0.75,
          [theme.getColorSchemeSelector('dark')]: { color: '#8FD9AA' },
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
        {endsAt && (
          <Typography
            level='body-xs'
            sx={{ color: 'inherit', fontWeight: 700, whiteSpace: 'nowrap' }}
          >
            {t('routineBlock.until', {
              time: new Intl.DateTimeFormat(i18n.language, {
                hour: 'numeric',
                minute: '2-digit',
              }).format(endsAt),
            })}
          </Typography>
        )}
      </Box>
      <Stack sx={{ gap: 1.5 }}>
        {routine.members.map(progress => {
          const member = members.find(m => m.userId === progress.userId)
          if (!member) return null
          return (
            <ChildLine
              key={progress.userId}
              actingUserId={actingUserId}
              canApprove={canApprove}
              member={member}
              next={nextStepName(routine, progress, allChores)}
              onAction={onAction}
              openSteps={openStepsOf(progress.userId)}
              progress={progress}
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
