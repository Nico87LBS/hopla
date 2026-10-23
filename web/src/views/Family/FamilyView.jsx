import {
  ChevronRightRounded,
  LocalFireDepartmentRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
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
import { useCircleMembers } from '../../queries/UserQueries'
import { TodayCard, useGamesToday } from '../Games/DailyGames'
import { MemberAvatar, memberShape } from '../Games/GameParts'
import { AdjustCard, HistoryCard, usePointsPresets } from '../Games/PointsCards'
import {
  ChallengesCard,
  QuestsCard,
  RankIcon,
  starsLabel,
} from '../Games/Progression'
import PointsJournal from './PointsJournal'

const percent = (value, target) =>
  target > 0 ? Math.max(0, Math.min(100, (value / target) * 100)) : 100

// One child at a glance: hops to spend, rank and the way to the next one,
// streak. The leader of the family gets a gold frame.
const MemberCard = ({ leader, member, onAdjust, progress, streak }) => {
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
          }}
        >
          <MemberAvatar member={member} size={64} />
        </Box>
        <Box
          component='span'
          sx={{
            bgcolor: HOPLA.goldSoft,
            border: '2px solid',
            borderColor: 'background.surface',
            borderRadius: 999,
            bottom: -4,
            color: HOPLA.goldText,
            font: '700 12px/16px var(--joy-fontFamily-body)',
            position: 'absolute',
            px: 0.875,
            py: 0.25,
            right: -18,
            whiteSpace: 'nowrap',
          }}
        >
          {t('family.hops', { count: available })}
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
              sx={{ alignSelf: 'flex-end', color: 'text.tertiary' }}
            >
              {t('family.earned')}
            </Typography>
          </Box>
        </>
      )}
    </Sheet>
  )
}

MemberCard.propTypes = {
  leader: PropTypes.bool,
  member: memberShape.isRequired,
  onAdjust: PropTypes.func,
  progress: PropTypes.object,
  streak: PropTypes.object,
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

// Where everyone stands: what you look at, never what you set up.
const FamilyView = () => {
  const { t } = useTranslation('common')
  const isParent = useIsParent()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'journal' ? 'journal' : 'progress'
  const [adjusting, setAdjusting] = useState(null)
  const { data: membersData } = useCircleMembers()
  const { data: today } = useGamesToday()

  const members = useMemo(
    () => (membersData?.res || []).filter(m => m.isActive !== false),
    [membersData?.res],
  )
  const progressById = new Map((today?.members || []).map(p => [p.userId, p]))
  const streakById = new Map((today?.streaks || []).map(s => [s.userId, s]))
  // The cards are for the children; parents only show up in a family
  // without children.
  const isChild = m => m.role !== 'admin' && m.role !== 'manager'
  const tracked = members.filter(m => progressById.has(m.userId))
  const players = (
    tracked.some(isChild) ? tracked.filter(isChild) : tracked
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
        if (value === 'journal') next.set('tab', 'journal')
        else next.delete('tab')
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
            {['progress', 'journal'].map(value => (
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
              </Tab>
            ))}
          </TabList>
        </Tabs>
      </Box>

      {tab === 'journal' ? (
        <Stack gap={3}>
          <PointsJournal />
          <HistoryCard members={members} />
        </Stack>
      ) : (
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
                onAdjust={isParent ? () => setAdjusting(member) : undefined}
              />
            ))}
          </Box>
          <TodayCard members={members} today={today} />
          <QuestsCard members={members} today={today} />
          <ChallengesCard isParent={false} members={members} today={today} />
          {isParent && (
            <Button
              component={Link}
              to='/manage'
              variant='plain'
              endDecorator={<ChevronRightRounded />}
              sx={{ alignSelf: 'center' }}
            >
              {t('family.manageHint')}
            </Button>
          )}
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
