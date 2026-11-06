import {
  CheckCircleRounded,
  FormatListNumberedRounded,
} from '@mui/icons-material'
import { Box, LinearProgress, Sheet, Stack, Typography } from '@mui/joy'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'

import { HOPLA } from '../../constants/theme'
import {
  nextStepName,
  routineEndsAt,
  routineStepOf,
} from '../../utils/routines'
import { MemberAvatar } from '../Games/GameParts'
import ChoreListView from './ChoreListView.jsx'

// A routine under way, above the list: where each child stands, then the
// steps to do now, the same rows as the list (they leave the list meanwhile).

const ChildProgress = ({ member, next, progress }) => {
  const { t } = useTranslation('chores')
  // The steps behind the current one count as done, even when one of them is
  // no longer due today.
  const behind = Math.max(progress.done, (progress.step || 1) - 1)
  const share = progress.finished
    ? 100
    : progress.total
      ? (behind * 100) / progress.total
      : 0
  return (
    <Box sx={{ alignItems: 'center', display: 'flex', gap: 1.25 }}>
      <Box sx={{ opacity: progress.finished ? 0.6 : 1 }}>
        <MemberAvatar member={member} size={36} />
      </Box>
      <Stack sx={{ flex: 1, gap: 0.5, minWidth: 0 }}>
        <Box sx={{ alignItems: 'baseline', display: 'flex', gap: 1 }}>
          <Typography level='title-sm' noWrap sx={{ flex: 1 }}>
            {member?.displayName}
          </Typography>
          {progress.finished ? (
            <Typography
              level='body-xs'
              startDecorator={<CheckCircleRounded sx={{ fontSize: 16 }} />}
              sx={{ color: HOPLA.greenText, fontWeight: 700 }}
            >
              {t('routineBlock.finished')}
            </Typography>
          ) : (
            <Typography
              level='body-xs'
              sx={{ color: 'text.secondary', fontWeight: 700 }}
            >
              {t('routineBlock.at', {
                step: progress.step || progress.done + 1,
                total: progress.total,
              })}
            </Typography>
          )}
        </Box>
        <LinearProgress
          determinate
          value={share}
          thickness={8}
          sx={{ bgcolor: 'background.level1', color: HOPLA.green }}
        />
        {!progress.finished && next && (
          <Typography level='body-xs' noWrap sx={{ color: 'text.tertiary' }}>
            {t('routineBlock.next', { name: next })}
          </Typography>
        )}
      </Stack>
    </Box>
  )
}

ChildProgress.propTypes = {
  member: PropTypes.object,
  next: PropTypes.string,
  progress: PropTypes.object.isRequired,
}

const RoutineBlock = ({ allChores, chores, listProps, members, routine }) => {
  const { i18n, t } = useTranslation('chores')
  const endsAt = routineEndsAt(routine)
  const steps = chores.filter(chore => routineStepOf([routine], chore))
  const memberOf = userId => members.find(member => member.userId === userId)
  // Filtered out of the list (another child, a label): the block goes too.
  if (steps.length === 0) return null
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
      <Stack sx={{ gap: 1.25 }}>
        {routine.members.map(progress => (
          <ChildProgress
            key={progress.userId}
            member={memberOf(progress.userId)}
            next={nextStepName(routine, progress, allChores)}
            progress={progress}
          />
        ))}
      </Stack>
      <ChoreListView chores={steps} {...listProps} />
    </Sheet>
  )
}

RoutineBlock.propTypes = {
  allChores: PropTypes.array.isRequired,
  chores: PropTypes.array.isRequired,
  listProps: PropTypes.object.isRequired,
  members: PropTypes.array.isRequired,
  routine: PropTypes.object.isRequired,
}

export default RoutineBlock
