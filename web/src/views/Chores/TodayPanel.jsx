import {
  BoltRounded,
  CelebrationRounded,
  TimerRounded,
} from '@mui/icons-material'
import { Box, LinearProgress, Sheet, Stack, Typography } from '@mui/joy'
import { useMediaQuery } from '@mui/material'
import moment from 'moment'
import PropTypes from 'prop-types'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { HOPLA } from '../../constants/theme'
import { useFlashes } from '../../queries/ChoreQueries'
import { useFamilyMembers } from '../../queries/UserQueries'
import { isTaskFor } from '../../utils/Chores.jsx'
import { dayTotals, membersOfDay } from '../../utils/todayPanel'
import { useGamesToday } from '../Games/DailyGames'
import { AwayPill, MemberAvatar } from '../Games/GameParts'

// The side of Aujourd'hui on a wide screen: where each child stands today,
// the games of the day and the week ahead, as on the family tablet.

const cardSx = {
  bgcolor: 'background.surface',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 'xl',
  display: 'flex',
  flexDirection: 'column',
  gap: 1.5,
  p: 2,
}

const Pill = ({ children, tone }) => (
  <Box
    component='span'
    sx={theme => ({
      bgcolor: tone.bg,
      borderRadius: 999,
      color: tone.fg,
      font: '700 12px/18px var(--joy-fontFamily-body)',
      px: 1,
      whiteSpace: 'nowrap',
      [theme.getColorSchemeSelector('dark')]: tone.dark,
    })}
  >
    {children}
  </Box>
)

Pill.propTypes = {
  children: PropTypes.node.isRequired,
  tone: PropTypes.object.isRequired,
}

const GOLD = {
  bg: HOPLA.goldSoft,
  fg: HOPLA.goldText,
  dark: { bgcolor: 'rgba(245, 180, 0, 0.16)', color: '#FFD666' },
}
const GREEN = {
  bg: HOPLA.greenSoft,
  fg: HOPLA.greenText,
  dark: { bgcolor: 'rgba(35, 147, 79, 0.18)', color: '#8FD9AA' },
}

const KidRow = ({ member, routine, tally }) => {
  const { t } = useTranslation('chores')
  const share = tally.total ? (tally.done * 100) / tally.total : 0
  return (
    <Box sx={{ alignItems: 'center', display: 'flex', gap: 1.5 }}>
      <MemberAvatar member={member} size={44} />
      <Stack sx={{ flex: 1, gap: 0.625, minWidth: 0 }}>
        <Box sx={{ alignItems: 'baseline', display: 'flex', gap: 1 }}>
          <Typography level='title-sm' noWrap sx={{ flex: 1 }}>
            {member.displayName}
          </Typography>
          {member.away ? (
            <AwayPill days='' label={t('todayPanel.away')} />
          ) : (
            <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
              {t('todayPanel.doneOf', { done: tally.done, total: tally.total })}
            </Typography>
          )}
        </Box>
        <LinearProgress
          determinate
          value={share}
          thickness={8}
          sx={{ color: HOPLA.green, bgcolor: 'background.level1' }}
        />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          <Pill tone={GOLD}>
            {t('todayPanel.earned', { count: tally.earned })}
          </Pill>
          {routine && (
            <Pill tone={GREEN}>
              {routine.finished
                ? t('todayPanel.routineDone', { name: routine.name })
                : `${routine.name} ${t('routines.step', {
                    step: routine.step,
                    total: routine.total,
                  })}`}
            </Pill>
          )}
        </Box>
      </Stack>
    </Box>
  )
}

KidRow.propTypes = {
  member: PropTypes.object.isRequired,
  routine: PropTypes.object,
  tally: PropTypes.object.isRequired,
}

const GameLine = ({ color, icon, text, value }) => (
  <Box sx={{ alignItems: 'center', display: 'flex', gap: 1.25 }}>
    <Box
      sx={{
        alignItems: 'center',
        bgcolor: `${color}1F`,
        borderRadius: '10px',
        color,
        display: 'flex',
        flexShrink: 0,
        height: 32,
        justifyContent: 'center',
        width: 32,
      }}
    >
      {icon}
    </Box>
    <Typography level='body-sm' sx={{ flex: 1, minWidth: 0 }}>
      {text}
    </Typography>
    {value && (
      <Typography level='title-sm' sx={{ color, flexShrink: 0 }}>
        {value}
      </Typography>
    )}
  </Box>
)

GameLine.propTypes = {
  color: PropTypes.string.isRequired,
  icon: PropTypes.node.isRequired,
  text: PropTypes.node.isRequired,
  value: PropTypes.node,
}

// The next seven days, today first, with how many tasks each one holds.
const DayStrip = ({ days }) => {
  const { i18n } = useTranslation()
  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' })
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 0.5,
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
      }}
    >
      {days.map((day, index) => (
        <Stack
          key={day.date.toISOString()}
          sx={{
            alignItems: 'center',
            bgcolor: index === 0 ? HOPLA.violet : 'background.level1',
            borderRadius: 'md',
            color: index === 0 ? '#fff' : 'text.primary',
            gap: 0.125,
            py: 1,
          }}
        >
          <Typography level='body-xs' sx={{ color: 'inherit' }}>
            {weekday.format(day.date)}
          </Typography>
          <Typography level='title-sm' sx={{ color: 'inherit' }}>
            {day.date.getDate()}
          </Typography>
          <Typography
            level='body-xs'
            sx={{ color: 'inherit', fontWeight: 700, opacity: 0.85 }}
          >
            {day.count}
          </Typography>
        </Stack>
      ))}
    </Box>
  )
}

DayStrip.propTypes = { days: PropTypes.arrayOf(PropTypes.object).isRequired }

const TodayPanel = ({ chores }) => {
  const { i18n, t } = useTranslation('chores')
  const isLargeScreen = useMediaQuery(theme => theme.breakpoints.up('lg'))
  const { data: today } = useGamesToday()
  const { data: membersData } = useFamilyMembers()
  const { data: flashes } = useFlashes()

  const now = moment()
  const endOfToday = now.clone().endOf('day').toDate()
  const members = membersOfDay(membersData?.res)
  const names = useMemo(
    () => new Map(chores.map(chore => [chore.id, chore.name])),
    [chores],
  )
  if (!isLargeScreen) return null

  const routineOf = userId =>
    (today?.routines || [])
      .map(routine => {
        const progress = routine.members?.find(p => p.userId === userId)
        return progress && { ...progress, name: routine.name }
      })
      .find(Boolean)
  const tallyOf = member => {
    const doneToday =
      today?.members?.find(m => m.userId === member.userId)?.today || {}
    const pending = chores.filter(
      chore =>
        chore.nextDueDate &&
        new Date(chore.nextDueDate) <= endOfToday &&
        isTaskFor(chore, member.userId),
    ).length
    const done = doneToday.done || 0
    return { done, total: done + pending, earned: doneToday.earned || 0 }
  }
  const running = Object.entries(flashes || {})
    .filter(([, flash]) => new Date(flash.endsAt) > new Date())
    .map(([choreId, flash]) => ({ ...flash, name: names.get(Number(choreId)) }))
    .filter(flash => flash.name)
  const week = dayTotals(chores, now)
  const date = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  }).format(now.toDate())

  return (
    <Stack
      component='aside'
      aria-label={t('todayPanel.label')}
      sx={{
        flexShrink: 0,
        gap: 1.75,
        pr: 3,
        pt: 3,
        width: 360,
      }}
    >
      <Typography
        level='body-sm'
        sx={{
          color: 'text.secondary',
          fontWeight: 600,
          pt: 1,
          '&::first-letter': { textTransform: 'uppercase' },
        }}
      >
        {date}
      </Typography>
      {members.length > 0 && (
        <Sheet sx={cardSx}>
          <Typography level='title-md'>{t('todayPanel.kids')}</Typography>
          {members.map(member => (
            <KidRow
              key={member.userId}
              member={member}
              routine={routineOf(member.userId)}
              tally={tallyOf(member)}
            />
          ))}
        </Sheet>
      )}
      <Sheet sx={cardSx}>
        <Typography level='title-md'>{t('todayPanel.games')}</Typography>
        {today?.surprise && (
          <GameLine
            color={HOPLA.carrotText}
            icon={<CelebrationRounded sx={{ fontSize: 18 }} />}
            text={t('todayPanel.surprise', { name: today.surprise.name })}
            value={`+${today.surprise.points}`}
          />
        )}
        {running.map(flash => (
          <GameLine
            key={flash.id ?? flash.name}
            color={HOPLA.violet}
            icon={<TimerRounded sx={{ fontSize: 18 }} />}
            text={t('todayPanel.chrono', { name: flash.name })}
            value={t('chrono.minutesLeft', {
              points: flash.points,
              count: Math.max(
                1,
                Math.ceil((new Date(flash.endsAt) - new Date()) / 60000),
              ),
            })}
          />
        ))}
        {today?.period && (
          <GameLine
            color={HOPLA.carrotText}
            icon={<BoltRounded sx={{ fontSize: 18 }} />}
            text={t('todayPanel.period', { name: today.period.name })}
            value={`×${today.period.multiplier}`}
          />
        )}
        {!today?.surprise && running.length === 0 && !today?.period && (
          <Typography level='body-sm' sx={{ color: 'text.tertiary' }}>
            {t('todayPanel.noGames')}
          </Typography>
        )}
      </Sheet>
      <Sheet sx={cardSx}>
        <Typography level='title-md'>{t('todayPanel.week')}</Typography>
        <DayStrip days={week} />
        <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
          {t('todayPanel.weekHelp')}
        </Typography>
      </Sheet>
    </Stack>
  )
}

TodayPanel.propTypes = {
  chores: PropTypes.arrayOf(PropTypes.object).isRequired,
}

export default TodayPanel
