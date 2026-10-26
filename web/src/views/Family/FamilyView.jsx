import {
  ChevronRightRounded,
  HomeRounded,
  LocalFireDepartmentRounded,
  LuggageRounded,
  StarRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  Container,
  IconButton,
  LinearProgress,
  Modal,
  ModalClose,
  ModalDialog,
  Sheet,
  Stack,
  Tab,
  TabList,
  Tabs,
  Typography,
} from '@mui/joy'
import PropTypes from 'prop-types'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'

import { HOPLA } from '../../constants/theme'
import { useIsParent } from '../../hooks/useIsParent'
import { useCircleMembers, useSetMemberAway } from '../../queries/UserQueries'
import { TodayCard, useGamesToday, useGamesWeek } from '../Games/DailyGames'
import { MemberAvatar, memberShape } from '../Games/GameParts'
import { AdjustCard, HistoryCard, usePointsPresets } from '../Games/PointsCards'
import {
  ChallengesCard,
  QuestsCard,
  RankIcon,
  starsLabel,
} from '../Games/Progression'
import { useRedemptions } from '../Rewards/RewardQueries'
import ShopView from '../Shop/ShopView'
import PointsJournal from './PointsJournal'

// The grey of a child who is away, on the web and on the family card alike.
const AWAY_GREY = '#8E8A99'

// Home or away: parents switch it, everyone sees it. Away, the child's tasks,
// streak and quests wait for her.
const PresenceButton = ({ away, onToggle }) => {
  const { t } = useTranslation('common')
  if (!onToggle && !away) return null
  const label = away ? t('family.away') : t('family.home')
  return (
    <Button
      size='sm'
      variant={away ? 'solid' : 'soft'}
      color='neutral'
      disabled={!onToggle}
      onClick={onToggle}
      startDecorator={
        away ? (
          <LuggageRounded sx={{ fontSize: 16 }} />
        ) : (
          <HomeRounded sx={{ fontSize: 16 }} />
        )
      }
      title={
        onToggle
          ? away
            ? t('family.markHome')
            : t('family.markAway')
          : undefined
      }
      sx={{
        borderRadius: 999,
        minHeight: 30,
        mt: 1,
        ...(away && {
          bgcolor: AWAY_GREY,
          '&:hover': { bgcolor: '#76727F' },
          '&.Mui-disabled': { bgcolor: AWAY_GREY, color: '#fff' },
        }),
      }}
    >
      {label}
    </Button>
  )
}

PresenceButton.propTypes = {
  away: PropTypes.bool,
  onToggle: PropTypes.func,
}

// The hops' symbol, the gold star of the family screen.
const HopsStar = ({ size }) => (
  <StarRounded aria-hidden sx={{ color: HOPLA.gold, fontSize: size }} />
)

HopsStar.propTypes = { size: PropTypes.number.isRequired }

// What a child did since Monday: tasks and games, and the hops earned from
// each source.
const WeekStats = ({ week }) => {
  const { t } = useTranslation('common')
  const sources = [
    ['fromTasks', week.taskPoints],
    ['fromGames', week.gamePoints],
    ['fromBonus', week.bonusPoints],
  ]
  return (
    <Box
      sx={{ borderTop: '1px solid', borderColor: 'divider', mt: 1.5, pt: 1.25 }}
    >
      <Box
        sx={{
          alignItems: 'center',
          display: 'flex',
          gap: 0.75,
          justifyContent: 'center',
        }}
      >
        <Typography
          level='body-xs'
          sx={{ color: 'text.tertiary', fontWeight: 600 }}
        >
          {t('family.week.title')}
        </Typography>
        {week.daysAway > 0 && (
          <Box
            component='span'
            title={t('family.week.away', { count: week.daysAway })}
            aria-label={t('family.week.away', { count: week.daysAway })}
            sx={{
              alignItems: 'center',
              bgcolor: 'background.level2',
              borderRadius: 999,
              color: 'text.secondary',
              display: 'inline-flex',
              font: '600 11px/16px var(--joy-fontFamily-body)',
              gap: 0.25,
              px: 0.75,
            }}
          >
            <LuggageRounded aria-hidden sx={{ fontSize: 12 }} />
            {week.daysAway}
          </Box>
        )}
      </Box>
      <Typography level='body-sm' sx={{ mt: 0.25 }} noWrap>
        {t('family.week.tasks', { count: week.tasks })} ·{' '}
        {t('family.week.games', { count: week.games })}
      </Typography>
      <Box
        aria-label={t('family.week.label', {
          bonus: week.bonusPoints,
          games: week.gamePoints,
          tasks: week.taskPoints,
        })}
        role='group'
        sx={{
          display: 'grid',
          gap: 0.5,
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          mt: 0.75,
        }}
      >
        {sources.map(([key, value]) => (
          <Box
            key={key}
            aria-hidden
            sx={{ bgcolor: 'background.level1', borderRadius: 'md', py: 0.5 }}
          >
            <Typography
              startDecorator={<HopsStar size={12} />}
              sx={{
                color: value < 0 ? 'danger.plainColor' : 'text.primary',
                font: '700 15px/18px var(--joy-fontFamily-display)',
                justifyContent: 'center',
                '--Typography-gap': '2px',
              }}
            >
              {value}
            </Typography>
            <Typography level='body-xs' sx={{ color: 'text.tertiary' }} noWrap>
              {t(`family.week.${key}`)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

WeekStats.propTypes = {
  week: PropTypes.shape({
    bonusPoints: PropTypes.number,
    daysAway: PropTypes.number,
    gamePoints: PropTypes.number,
    games: PropTypes.number,
    taskPoints: PropTypes.number,
    tasks: PropTypes.number,
  }).isRequired,
}

const percent = (value, target) =>
  target > 0 ? Math.max(0, Math.min(100, (value / target) * 100)) : 100

// One child at a glance: hops to spend, rank and the way to the next one,
// streak. The leader of the family gets a gold frame.
const MemberCard = ({
  leader,
  member,
  onAdjust,
  onToggleAway,
  progress,
  streak,
  week,
}) => {
  const { t } = useTranslation('common')
  const available = (member.points || 0) - (member.pointsRedeemed || 0)
  const target = progress?.next ? progress.next.minPoints : progress?.starAt
  const value =
    progress && target
      ? percent(
          progress.points - progress.rank.minPoints,
          target - progress.rank.minPoints,
        )
      : 100

  return (
    <Sheet
      sx={{
        bgcolor: leader ? '#FFFCF2' : 'background.surface',
        border: '1px solid',
        borderColor: leader ? '#F2D98A' : 'divider',
        borderRadius: 'lg',
        position: 'relative',
        px: 1.5,
        pb: 1.75,
        pt: 2,
        textAlign: 'center',
        [`[data-joy-color-scheme="dark"] &`]: leader
          ? {
              bgcolor: 'rgba(245, 180, 0, .08)',
              borderColor: 'rgba(245, 180, 0, .4)',
            }
          : {},
      }}
    >
      {onAdjust && (
        <IconButton
          variant='outlined'
          color='neutral'
          onClick={onAdjust}
          aria-label={t('family.adjustFor', { name: member.displayName })}
          sx={{
            borderRadius: '50%',
            minHeight: 40,
            minWidth: 40,
            position: 'absolute',
            right: 6,
            top: 6,
          }}
        >
          <Typography
            component='span'
            sx={{ fontWeight: 700, color: 'inherit' }}
          >
            ±
          </Typography>
        </IconButton>
      )}
      <Box sx={{ mx: 'auto', position: 'relative', width: 64 }}>
        <Box
          sx={{
            borderRadius: '50%',
            boxShadow: leader ? `0 0 0 3px ${HOPLA.gold}` : 'none',
            display: 'flex',
            height: 64,
            width: 64,
            ...(member.away && { filter: 'grayscale(1)', opacity: 0.45 }),
          }}
        >
          <MemberAvatar member={member} size={64} />
        </Box>
        {member.away && (
          <Box
            component='span'
            sx={{
              alignItems: 'center',
              bgcolor: AWAY_GREY,
              border: '2px solid',
              borderColor: 'background.surface',
              borderRadius: '50%',
              color: '#fff',
              display: 'flex',
              height: 24,
              justifyContent: 'center',
              left: -6,
              position: 'absolute',
              top: -4,
              width: 24,
            }}
          >
            <LuggageRounded sx={{ fontSize: 14 }} />
          </Box>
        )}
        <Box
          component='span'
          sx={{
            bgcolor: HOPLA.goldSoft,
            border: '2px solid',
            borderColor: 'background.surface',
            borderRadius: 999,
            alignItems: 'center',
            bottom: -4,
            color: HOPLA.goldText,
            display: 'inline-flex',
            gap: 0.25,
            font: '700 12px/16px var(--joy-fontFamily-body)',
            position: 'absolute',
            px: 0.875,
            py: 0.25,
            right: -18,
            whiteSpace: 'nowrap',
          }}
          aria-label={t('family.hops', { count: available })}
          title={t('family.hops', { count: available })}
        >
          <HopsStar size={12} />
          {available}
        </Box>
      </Box>
      <Typography level='title-md' sx={{ mt: 1.25 }} noWrap>
        {member.displayName}
        {streak?.current > 0 && (
          <Typography
            component='span'
            level='body-sm'
            startDecorator={
              <LocalFireDepartmentRounded sx={{ fontSize: 16 }} />
            }
            sx={{
              color: streak.doneToday ? HOPLA.carrotText : 'text.tertiary',
              display: 'inline-flex',
              ml: 0.75,
            }}
          >
            {t('family.days', { count: streak.current })}
          </Typography>
        )}
      </Typography>
      <PresenceButton away={Boolean(member.away)} onToggle={onToggleAway} />
      {progress && (
        <>
          <Box
            sx={{
              alignItems: 'center',
              display: 'flex',
              gap: 0.75,
              justifyContent: 'center',
              mt: 1,
            }}
          >
            <RankIcon rank={progress.rank} size={26} />
            <Typography
              level='body-sm'
              sx={{ color: 'primary.plainColor', fontWeight: 600 }}
              noWrap
            >
              {starsLabel(progress.stars)} {progress.rank.name}
            </Typography>
          </Box>
          <LinearProgress
            determinate
            value={value}
            thickness={8}
            sx={{ mt: 1.25 }}
            aria-label={t('family.toNextRank')}
          />
          <Box
            sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.75 }}
          >
            <Typography
              sx={{
                color: leader ? HOPLA.goldText : 'primary.plainColor',
                '[data-joy-color-scheme="dark"] &': {
                  color: leader ? HOPLA.gold : 'primary.plainColor',
                },
                font: '700 20px/24px var(--joy-fontFamily-display)',
              }}
            >
              {progress.earned}
            </Typography>
            <Typography
              level='body-xs'
              aria-label={t('family.earned')}
              startDecorator={<HopsStar size={13} />}
              sx={{ alignSelf: 'flex-end', color: 'text.tertiary' }}
            >
              {t('family.earnedShort')}
            </Typography>
          </Box>
        </>
      )}
      {week && <WeekStats week={week} />}
    </Sheet>
  )
}

MemberCard.propTypes = {
  leader: PropTypes.bool,
  member: memberShape.isRequired,
  onAdjust: PropTypes.func,
  onToggleAway: PropTypes.func,
  progress: PropTypes.object,
  streak: PropTypes.object,
  week: PropTypes.object,
}

const AdjustSheet = ({ member, members, onClose }) => {
  const { t } = useTranslation('common')
  const { data: presets = [] } = usePointsPresets()
  return (
    <Modal open={Boolean(member)} onClose={onClose}>
      <ModalDialog
        layout='center'
        sx={{ maxWidth: 520, width: 'calc(100% - 32px)' }}
      >
        <ModalClose />
        {member && (
          <>
            <Box
              sx={{ alignItems: 'center', display: 'flex', gap: 1.25, pr: 4 }}
            >
              <MemberAvatar member={member} size={36} />
              <Typography level='title-lg'>
                {t('family.adjustFor', { name: member.displayName })}
              </Typography>
            </Box>
            <AdjustCard
              bare
              initialUserId={member.userId}
              members={members}
              presets={presets}
            />
          </>
        )}
      </ModalDialog>
    </Modal>
  )
}

AdjustSheet.propTypes = {
  member: memberShape,
  members: PropTypes.arrayOf(memberShape).isRequired,
  onClose: PropTypes.func.isRequired,
}

const FAMILY_TABS = ['progress', 'missions', 'shop', 'journal']

// Where everyone stands: what you look at, never what you set up.
const FamilyView = () => {
  const { t } = useTranslation('common')
  const isParent = useIsParent()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = FAMILY_TABS.includes(searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'progress'
  const { data: pending = [] } = useRedemptions('pending')
  const [adjusting, setAdjusting] = useState(null)
  const { data: membersData } = useCircleMembers()
  const { data: today } = useGamesToday()
  const { data: week } = useGamesWeek()
  const setAway = useSetMemberAway()

  const members = useMemo(
    () => (membersData?.res || []).filter(m => m.isActive !== false),
    [membersData?.res],
  )
  const progressById = new Map((today?.members || []).map(p => [p.userId, p]))
  const streakById = new Map((today?.streaks || []).map(s => [s.userId, s]))
  const weekById = new Map((week?.members || []).map(w => [w.userId, w]))
  // The cards are for the children; parents show up when the family puts
  // them on the podium, or when it has no children.
  const isChild = m => m.role !== 'admin' && m.role !== 'manager'
  const tracked = members.filter(m => progressById.has(m.userId))
  const players = (
    today?.parentsOnPodium || !tracked.some(isChild)
      ? tracked
      : tracked.filter(isChild)
  ).sort(
    (a, b) =>
      (progressById.get(b.userId)?.earned || 0) -
      (progressById.get(a.userId)?.earned || 0),
  )
  const shown = players.length > 0 ? players : members
  const leaderId =
    players.length > 1 &&
    progressById.get(players[0].userId).earned >
      progressById.get(players[1].userId).earned
      ? players[0].userId
      : null

  const setTab = value =>
    setSearchParams(
      previous => {
        const next = new URLSearchParams(previous)
        if (value === 'progress') next.delete('tab')
        else next.set('tab', value)
        return next
      },
      { replace: true },
    )

  return (
    <Container
      maxWidth='md'
      sx={{ px: { xs: 2, sm: 3 }, pb: 6, pt: { xs: 1, sm: 3 } }}
    >
      <Box sx={{ alignItems: 'center', display: 'flex', gap: 1.5, mb: 2 }}>
        <Typography
          level='h2'
          sx={{ display: { xs: 'none', lg: 'block' }, flex: 1 }}
        >
          {t('navigation.family')}
        </Typography>
        <Tabs
          value={tab}
          onChange={(event, value) => setTab(value)}
          size='sm'
          sx={{
            bgcolor: 'background.level1',
            borderRadius: 'lg',
            ml: { xs: 0, lg: 'auto' },
            p: 0.375,
            width: { xs: '100%', lg: 'auto' },
          }}
        >
          <TabList disableUnderline sx={{ gap: 0.25 }}>
            {FAMILY_TABS.map(value => (
              <Tab
                key={value}
                value={value}
                disableIndicator
                sx={{
                  borderRadius: 'md',
                  flex: 1,
                  fontWeight: 600,
                  minHeight: 36,
                  px: 2,
                  '&.Mui-selected': {
                    bgcolor: 'background.surface',
                    boxShadow: 'sm',
                  },
                }}
              >
                {t(`family.tabs.${value}`)}
                {value === 'shop' && isParent && pending.length > 0 && (
                  <Chip
                    size='sm'
                    variant='solid'
                    color='warning'
                    sx={{ ml: 0.75 }}
                  >
                    {pending.length}
                  </Chip>
                )}
              </Tab>
            ))}
          </TabList>
        </Tabs>
      </Box>

      {tab === 'shop' && <ShopView />}
      {tab === 'journal' && (
        <Stack gap={3}>
          <PointsJournal />
          <HistoryCard members={members} />
        </Stack>
      )}
      {tab === 'missions' && (
        <Stack gap={2}>
          <TodayCard members={members} today={today} />
          <QuestsCard members={members} today={today} />
          <ChallengesCard isParent={false} members={members} today={today} />
          {isParent && (
            <Button
              component={Link}
              to='/manage/missions'
              variant='plain'
              endDecorator={<ChevronRightRounded />}
              sx={{ alignSelf: 'center' }}
            >
              {t('family.manageHint')}
            </Button>
          )}
        </Stack>
      )}
      {tab === 'progress' && (
        <Stack gap={2}>
          <Box
            sx={{
              display: 'grid',
              gap: 1.25,
              gridTemplateColumns: {
                xs: 'repeat(2, minmax(0, 1fr))',
                sm: 'repeat(3, minmax(0, 1fr))',
              },
            }}
          >
            {shown.map(member => (
              <MemberCard
                key={member.userId}
                leader={member.userId === leaderId}
                member={member}
                progress={progressById.get(member.userId)}
                streak={streakById.get(member.userId)}
                week={weekById.get(member.userId)}
                onAdjust={isParent ? () => setAdjusting(member) : undefined}
                onToggleAway={
                  isParent
                    ? () =>
                        setAway.mutate({
                          memberId: member.userId,
                          away: !member.away,
                        })
                    : undefined
                }
              />
            ))}
          </Box>
        </Stack>
      )}

      <AdjustSheet
        member={adjusting}
        members={members}
        onClose={() => setAdjusting(null)}
      />
    </Container>
  )
}

export default FamilyView
