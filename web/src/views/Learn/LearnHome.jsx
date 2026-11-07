import {
  AutoAwesomeRounded,
  CheckCircleRounded,
  CheckRounded,
  ChevronRightRounded,
  CloudOffRounded,
  EditRounded,
  ExpandLessRounded,
  ExpandMoreRounded,
  FactCheckOutlined,
  FitnessCenterRounded,
  LockRounded,
  ReplayRounded,
  SchoolRounded,
  SportsEsportsRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Container,
  Divider,
  Sheet,
  Stack,
  Typography,
} from '@mui/joy'
import { useQueryClient } from '@tanstack/react-query'
import PropTypes from 'prop-types'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router-dom'

import { HOPLA } from '../../constants/theme'
import { useIsParent } from '../../hooks/useIsParent'
import {
  learnKeys,
  sendWaitingGames,
  usePlayer,
} from '../../queries/LearnQueries'
import { useFamilyMembers, useUserProfile } from '../../queries/UserQueries'
import { OpenNextLevel } from '../../utils/Fetcher'
import {
  addDays,
  chapterState,
  DEFAULT_SETTINGS,
  dueReviews,
  moduleLocked,
  moduleToday,
  newOrder,
  openChapters,
  REVIEW_BONUS,
  REVIEWS,
  reviewsLeft,
  TESTS,
  totalLeft,
} from '../../utils/learn/engine'
import { levelKnown } from '../../utils/learn/levels'
import { levelsIn, playFirst, shape, toReview } from '../../utils/learn/listing'
import { loadServerVoices } from '../../utils/learn/serverVoice'
import { queuedFor } from '../../utils/learn/store'
import { byRootPack, packTree, rootOf } from '../../utils/learn/tree'
import LoadingComponent from '../components/Loading'
import { MemberAvatar } from '../Games/GameParts'
import { clock } from '../Recre/games/common'
import { LearnIcon, Progress, subjectColor, useCompiled } from './LearnParts'
import ListBar, { useListChoices } from './ListBar'
import TestsSection from './TestPrep'

const pageSx = { px: { xs: 2, sm: 3 }, pb: 6, pt: { xs: 1, sm: 3 } }

const useActiveMembers = () => {
  const { data } = useFamilyMembers()
  return useMemo(
    () => (data?.res || []).filter(m => m.isActive !== false),
    [data?.res],
  )
}

// /learn: a child goes to her own games, a parent picks who plays.
export const LearnChooser = () => {
  const { t } = useTranslation('learn')
  const isParent = useIsParent()
  const { data: me } = useUserProfile()
  const members = useActiveMembers()
  if (isParent === undefined || !me) return <LoadingComponent />
  if (!isParent) return <Navigate to={`/learn/${me.id}`} replace />
  return (
    <Container maxWidth='sm' sx={pageSx}>
      <Typography level='h2' sx={{ mb: 0.5 }}>
        {t('chooser.title')}
      </Typography>
      <Typography level='body-sm' sx={{ color: 'text.secondary', mb: 2.5 }}>
        {t('chooser.subtitle')}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
        }}
      >
        {members.map(member => (
          <Sheet
            key={member.userId}
            component={Link}
            to={`/learn/${member.userId}`}
            variant='outlined'
            sx={{
              alignItems: 'center',
              borderRadius: 'xl',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              p: 2,
              textDecoration: 'none',
              '&:hover': { borderColor: HOPLA.violet },
            }}
          >
            <MemberAvatar member={member} size={64} />
            <Typography level='title-sm'>{member.displayName}</Typography>
          </Sheet>
        ))}
      </Box>
      <Button
        component={Link}
        to='/manage/learn'
        variant='plain'
        sx={{ mt: 3 }}
        endDecorator={<ChevronRightRounded />}
      >
        {t('chooser.manage')}
      </Button>
    </Container>
  )
}

// The look of each chapter state: a round dot, the same as the faces on the
// task lists, with an icon so colour is never the only sign, and the state
// written beside it.
const STATE_LOOK = {
  new: {
    Icon: AutoAwesomeRounded,
    bg: '#fff',
    color: HOPLA.violet,
    border: HOPLA.violet,
    text: HOPLA.blueberry,
  },
  learning: {
    Icon: EditRounded,
    bg: HOPLA.violet,
    color: '#fff',
    text: HOPLA.blueberry,
  },
  known: {
    Icon: CheckRounded,
    bg: HOPLA.green,
    color: '#fff',
    text: HOPLA.greenText,
  },
  review: {
    Icon: ReplayRounded,
    bg: HOPLA.carrot,
    color: '#fff',
    text: HOPLA.carrotText,
  },
  closed: {
    Icon: LockRounded,
    bg: '#EEECE8',
    color: '#6B6680',
    border: '#B9B4AA',
    text: '#6B6680',
  },
  shut: {
    Icon: LockRounded,
    bg: '#5E5A54',
    color: '#fff',
    text: '#5E5A54',
  },
}

const StateDot = ({ size = 28, state }) => {
  const { Icon, bg, border, color } = STATE_LOOK[state]
  return (
    <Box
      aria-hidden
      sx={{
        alignItems: 'center',
        bgcolor: bg,
        border: border ? `2px solid ${border}` : 'none',
        borderRadius: '50%',
        boxSizing: 'border-box',
        color,
        display: 'flex',
        flexShrink: 0,
        height: size,
        justifyContent: 'center',
        width: size,
      }}
    >
      <Icon sx={{ fontSize: size * 0.58 }} />
    </Box>
  )
}

StateDot.propTypes = {
  size: PropTypes.number,
  state: PropTypes.string.isRequired,
}

// StateDots is the row of small dots on the folded chapters bar: one per
// chapter, in order.
const StateDots = ({ states }) => (
  <Box aria-hidden sx={{ display: 'flex', gap: '4px' }}>
    {states.map((state, index) => {
      const { bg, border } = STATE_LOOK[state]
      return (
        <Box
          key={index}
          component='span'
          sx={{
            bgcolor: bg,
            border: border ? `2px solid ${border}` : 'none',
            borderRadius: '50%',
            boxSizing: 'border-box',
            height: 10,
            width: 10,
          }}
        />
      )
    })}
  </Box>
)

StateDots.propTypes = { states: PropTypes.array.isRequired }

const ModuleCard = ({
  cards,
  compiled,
  compiledById,
  day,
  dayFull,
  dueLeft,
  module,
  testTo,
  to,
}) => {
  const { t } = useTranslation('learn')
  const [showChapters, setShowChapters] = useState(false)
  const color = subjectColor(module.subject, module.document?.couleur)
  const locked = moduleLocked(compiled, compiledById, cards)
  // A module with nothing due and no new question left today is up to
  // date: it comes back tomorrow, and meanwhile only lets one practise.
  const today = moduleToday(compiled, cards, {
    day,
    settings: module.settings,
    unlockPercent: module.unlockPercent ?? undefined,
    placed: module.placed,
    forced: module.forced,
    shut: module.shut,
    newToday: module.newToday,
    dueLeft,
  })
  const upToDate = !locked && today.upToDate
  const chapters = openChapters(
    compiled,
    cards,
    module.unlockPercent ?? undefined,
    module.placed,
    module,
  )
  const states = chapters.map(c =>
    chapterState(c, module.unlockPercent ?? undefined),
  )
  // The bar is the chapter being learnt: the one the new questions come
  // from (newOrder), not known yet if one still is not.
  const learning = newOrder(
    chapters.filter(c => c.open).map(c => c.chapter),
  ).map(chapter => chapters.findIndex(c => c.chapter === chapter))
  const current =
    chapters[learning.find(i => states[i] !== 'known') ?? learning[0]]
  const percent = current?.progress.percent ?? 0
  const capped = dayFull || module.earnedToday >= module.dailyCap

  const body = (
    <Stack direction='row' gap={1.5} alignItems='center'>
      <LearnIcon entity={module} color={color} locked={!!locked} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography level='title-md' noWrap>
          {module.name}
        </Typography>
        {locked ? (
          <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
            {t('home.locked', {
              chapter: locked.chapter?.name || locked.module.name,
              needed: locked.needed,
              percent: locked.percent,
            })}
          </Typography>
        ) : (
          <>
            {upToDate && (
              <Typography
                level='body-xs'
                startDecorator={<CheckCircleRounded sx={{ fontSize: 16 }} />}
                sx={{ color: HOPLA.greenText, fontWeight: 700 }}
              >
                {t('home.upToDate')}
              </Typography>
            )}
            {upToDate && today.why && (
              <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
                {t(`upToDate.why.${today.why.kind}`, today.why)}
              </Typography>
            )}
            {upToDate && today.tomorrow > 0 && (
              <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
                {t('home.tomorrow', { count: today.tomorrow })}
              </Typography>
            )}
            <Typography level='body-xs' sx={{ color: 'text.secondary' }} noWrap>
              {current?.chapter.name}
              {!upToDate && today.due > 0 && (
                <Typography
                  component='span'
                  sx={{ color: HOPLA.carrotText, fontWeight: 700 }}
                >
                  {' · '}
                  {t('list.toReview', { count: today.due })}
                </Typography>
              )}
            </Typography>
            <Stack
              direction='row'
              gap={1}
              alignItems='center'
              sx={{ mt: 0.75 }}
            >
              <Box sx={{ flex: 1 }}>
                <Progress value={percent} color={color} />
              </Box>
              <Typography
                level='body-xs'
                sx={{ minWidth: 34, textAlign: 'right' }}
              >
                {percent} %
              </Typography>
            </Stack>
          </>
        )}
      </Box>
      {upToDate && (
        <Button
          size='sm'
          variant='outlined'
          component={Link}
          to={`${to}?mode=entrainement`}
          startDecorator={<FitnessCenterRounded />}
          sx={{ flexShrink: 0 }}
        >
          {t('home.practice')}
        </Button>
      )}
      {!locked && !upToDate && (
        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          <Typography
            level='body-xs'
            sx={{
              color: capped ? 'text.tertiary' : HOPLA.goldText,
              fontWeight: 700,
            }}
          >
            {t('home.hopsToday', {
              earned: module.earnedToday,
              cap: module.dailyCap,
            })}
          </Typography>
          <ChevronRightRounded sx={{ color: 'text.tertiary' }} />
        </Box>
      )}
    </Stack>
  )

  return (
    <Sheet
      variant='outlined'
      sx={{
        borderRadius: 'xl',
        overflow: 'hidden',
        '&:hover': locked ? {} : { borderColor: color },
        ...(upToDate && { bgcolor: 'background.level1' }),
      }}
    >
      <Box
        component={locked || upToDate ? 'div' : Link}
        to={locked || upToDate ? undefined : to}
        sx={{
          display: 'block',
          opacity: locked ? 0.7 : 1,
          p: 1.5,
          textDecoration: 'none',
        }}
      >
        {body}
      </Box>
      {chapters.length > 0 && (
        <>
          <Divider />
          <Button
            fullWidth
            size='sm'
            variant='plain'
            color='neutral'
            aria-expanded={showChapters}
            aria-label={t('home.chaptersSummary', {
              count: chapters.length,
              summary: summary(states, t),
            })}
            onClick={() => setShowChapters(v => !v)}
            startDecorator={<FactCheckOutlined />}
            endDecorator={
              showChapters ? <ExpandLessRounded /> : <ExpandMoreRounded />
            }
            sx={{ borderRadius: 0, justifyContent: 'flex-start' }}
          >
            <Box sx={{ flex: 1, textAlign: 'left' }}>
              {t('home.chapters', { count: chapters.length })}
            </Box>
            <StateDots states={states} />
          </Button>
        </>
      )}
      {showChapters && (
        <ChapterRows
          chapters={chapters}
          module={module}
          states={states}
          testTo={testTo}
        />
      )}
    </Sheet>
  )
}

// summary says in words how many chapters are in each state, for a screen
// reader on the folded bar.
const summary = (states, t) =>
  Object.keys(STATE_LOOK)
    .map(state => [state, states.filter(s => s === state).length])
    .filter(([, count]) => count > 0)
    .map(([state, count]) => t(`home.state.${state}`, { count }))
    .join(', ')

// ChapterRows lists the chapters of a module with where each one stands,
// and the test that opens it.
const ChapterRows = ({ chapters, module, states, testTo }) => {
  const { t } = useTranslation('learn')
  return (
    <Box
      sx={{
        bgcolor: 'background.level1',
        borderTop: '1px solid',
        borderColor: 'divider',
        display: 'grid',
        gap: 1,
        p: 1.25,
      }}
    >
      {chapters.map(({ by, chapter, open, placed, progress }, index) => (
        <Stack
          key={chapter.id}
          direction='row'
          gap={1.25}
          alignItems='center'
          sx={{ opacity: open ? 1 : 0.85 }}
        >
          <StateDot state={states[index]} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography level='body-sm' sx={{ fontWeight: 600 }}>
              {chapter.name}
            </Typography>
            <Typography
              level='body-xs'
              sx={{ color: STATE_LOOK[states[index]].text, fontWeight: 700 }}
            >
              {states[index] === 'shut'
                ? t('home.chapterShut')
                : states[index] === 'closed'
                  ? t('home.chapterClosed')
                  : states[index] === 'review'
                    ? t('home.chapterReview', { count: progress.forgotten })
                    : placed
                      ? t('home.chapterByTest')
                      : states[index] === 'new'
                        ? t('home.chapterNew')
                        : by === 'forced'
                          ? t('home.chapterByParent', {
                              percent: progress.percent,
                            })
                          : states[index] === 'known'
                            ? t('home.chapterKnown', {
                                percent: progress.percent,
                              })
                            : t('home.chapterLearning', {
                                percent: progress.percent,
                              })}
            </Typography>
          </Box>
          {testTo && by !== 'shut' && (
            <Button
              size='sm'
              variant='outlined'
              component={Link}
              to={testTo(
                `chapitre=${encodeURIComponent(`${module.id}/${chapter.id}`)}`,
              )}
              startDecorator={<FactCheckOutlined />}
            >
              {t('test.chapter')}
            </Button>
          )}
        </Stack>
      ))}
    </Box>
  )
}

ChapterRows.propTypes = {
  chapters: PropTypes.array.isRequired,
  module: PropTypes.object.isRequired,
  states: PropTypes.array.isRequired,
  testTo: PropTypes.func,
}

ModuleCard.propTypes = {
  cards: PropTypes.instanceOf(Map).isRequired,
  day: PropTypes.string.isRequired,
  dayFull: PropTypes.bool,
  dueLeft: PropTypes.number,
  compiled: PropTypes.object.isRequired,
  compiledById: PropTypes.object.isRequired,
  module: PropTypes.object.isRequired,
  testTo: PropTypes.func,
  to: PropTypes.string.isRequired,
}

// ReviewsCard gathers the questions due today in every module: a game asks
// them, the latest first, and reviewing everything earns a bonus once a
// day. Once done, it tells what comes tomorrow.
const ReviewsCard = ({ byId, cards, player, to }) => {
  const { t } = useTranslation('learn')
  const due = dueReviews(player, byId, cards)
  const left = reviewsLeft(player)
  const count = Math.min(due.length, left)
  const modules = new Set(due.slice(0, count).map(d => d.module)).size
  const bonus = player.reviews?.bonus ?? REVIEW_BONUS
  if (!count) {
    const tomorrow = dueReviews(
      { ...player, day: addDays(player.day, 1) },
      byId,
      cards,
    ).length
    if (!tomorrow && !player.reviews?.done) return null
    return (
      <Sheet
        variant='outlined'
        sx={{
          alignItems: 'center',
          borderRadius: 'lg',
          display: 'flex',
          gap: 1.5,
          mb: 2,
          p: 1.25,
        }}
      >
        <CheckCircleRounded sx={{ color: HOPLA.green }} />
        <Box sx={{ flex: 1 }}>
          <Typography level='title-sm'>{t('reviews.done')}</Typography>
          <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
            {left === 0 && due.length
              ? t('reviews.most')
              : t('reviews.tomorrow', { count: tomorrow })}
          </Typography>
        </Box>
      </Sheet>
    )
  }
  return (
    <Sheet
      variant='outlined'
      sx={{
        bgcolor: HOPLA.violetSoft,
        borderColor: 'rgba(91, 79, 224, .35)',
        borderRadius: 'xl',
        mb: 2,
        p: 1.5,
      }}
    >
      <Stack direction='row' gap={1.5} alignItems='center'>
        <LearnIcon entity={{ icon: '🔁' }} color={HOPLA.violet} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography level='title-md'>{t('reviews.title')}</Typography>
          <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
            {t('reviews.count', { count })} ·{' '}
            {t('reviews.modules', { count: modules })}
          </Typography>
        </Box>
      </Stack>
      <Button component={Link} to={to} fullWidth sx={{ mt: 1.25 }}>
        {t('reviews.go', {
          count: Math.min(count, DEFAULT_SETTINGS.questions_par_partie),
        })}
      </Button>
      {bonus > 0 && !player.reviews?.bonusPaid && (
        <Typography
          level='body-xs'
          sx={{ color: 'text.secondary', mt: 0.75, textAlign: 'center' }}
        >
          {t('reviews.bonus', { count: bonus })}
        </Typography>
      )}
    </Sheet>
  )
}

ReviewsCard.propTypes = {
  byId: PropTypes.object.isRequired,
  cards: PropTypes.instanceOf(Map).isRequired,
  player: PropTypes.object.isRequired,
  to: PropTypes.string.isRequired,
}

// RecreCard tells how far the next récré is, and opens it once it is
// there, or as soon as time of récré from the shop is waiting; the family's
// records are behind it too.
const RecreCard = ({ recre, to }) => {
  const { t } = useTranslation('learn')
  const earned = recre.on && recre.since >= recre.every
  const ready = earned || recre.bank > 0
  const done = Math.min(recre.since, recre.every)
  return (
    <Sheet
      component={Link}
      to={to}
      variant={ready ? 'solid' : 'outlined'}
      sx={{
        alignItems: 'center',
        bgcolor: ready ? HOPLA.green : undefined,
        borderRadius: 'lg',
        color: ready ? '#fff' : undefined,
        display: 'flex',
        gap: 1.5,
        mb: 2,
        p: 1.25,
        textDecoration: 'none',
      }}
    >
      <SportsEsportsRounded sx={{ color: ready ? '#fff' : HOPLA.green }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography level='title-sm' sx={{ color: 'inherit' }}>
          {earned && t('recre.ready')}
          {!earned &&
            recre.bank > 0 &&
            t('recre.bankReady', { time: clock(recre.bank) })}
          {!ready &&
            t('recre.notYet', {
              count: recre.every - recre.since,
              every: recre.every,
            })}
        </Typography>
        {!ready && (
          <Stack direction='row' gap={0.5} sx={{ mt: 0.75 }}>
            {Array.from({ length: recre.every }, (_, i) => (
              <Box
                key={i}
                sx={{
                  bgcolor: i < done ? HOPLA.green : 'background.level3',
                  borderRadius: 4,
                  flex: 1,
                  height: 6,
                  maxWidth: 40,
                }}
              />
            ))}
          </Stack>
        )}
      </Box>
      <Typography
        level='body-xs'
        endDecorator={<ChevronRightRounded />}
        sx={{ color: ready ? '#fff' : 'text.secondary', flexShrink: 0 }}
      >
        {ready ? t('recre.go') : t('recre.records')}
      </Typography>
    </Sheet>
  )
}

RecreCard.propTypes = {
  recre: PropTypes.object.isRequired,
  to: PropTypes.string.isRequired,
}

// testablePacks are the packs on top of the modules a person plays, each
// with its levels, for their placement test.
const testablePacks = player => {
  const { groups } = packTree(player.packs)
  const playing = new Set(player.modules.map(m => m.id))
  const out = []
  for (const group of groups) {
    const levels = group.levels.map(level => level.pack || group.pack)
    const plays = player.packs.some(
      p =>
        rootOf(player.packs, p.id)?.id === group.pack.id &&
        p.children.some(id => playing.has(id)),
    )
    if (plays) out.push({ pack: group.pack, levels })
  }
  return out
}

// groupByPack puts the modules under their pack, in the pack's order; the
// others come last.
const groupByPack = player => {
  const left = new Map(player.modules.map(m => [m.id, m]))
  const groups = []
  for (const pack of player.packs) {
    const modules = (pack.children || [])
      .map(id => left.get(id))
      .filter(Boolean)
    modules.forEach(m => left.delete(m.id))
    if (modules.length) {
      groups.push({
        id: pack.id,
        name: pack.name,
        levels: pack.levels,
        modules,
      })
    }
  }
  if (left.size) {
    groups.push({ id: '', name: '', levels: [], modules: [...left.values()] })
  }
  return groups
}

// A child with only a few modules finds them without searching.
const BAR_FROM = 6

// LearnModules is the list of a person's modules, with the day's total. The
// family screen shows it too, signed in as nobody: it gets the member and
// where a module opens rather than reading them from the account.
export const LearnModules = ({
  isParent,
  member,
  playPath,
  recrePath,
  testPath,
  userId,
}) => {
  const { t } = useTranslation('learn')
  const queryClient = useQueryClient()
  const { data: player, error, isLoading } = usePlayer(userId)
  const { byId, cards } = useCompiled(player)
  const [query, setQuery] = useState('')
  const [choices, setChoices] = useListChoices(`hopla.learn.list.${userId}`, {
    levels: [],
    sort: 'level',
  })

  // A level known opens the next one, once.
  const opening = useRef(new Set())
  useEffect(() => {
    if (!player || player.offline) return
    for (const packPlayer of player.packPlayers || []) {
      const key = `${packPlayer.pack}:${packPlayer.openTo}`
      if (opening.current.has(key)) continue
      if (!levelKnown(player, packPlayer, byId, cards)) continue
      opening.current.add(key)
      OpenNextLevel({ userId, pack: packPlayer.pack })
        .then(() =>
          queryClient.invalidateQueries({
            queryKey: learnKeys.player(userId),
          }),
        )
        .catch(() => {})
    }
  }, [player, byId, cards, userId, queryClient])

  // The natural voice, if any, is ready before the first question.
  useEffect(() => {
    loadServerVoices()
  }, [])

  useEffect(() => {
    const online = async () => {
      await sendWaitingGames()
      queryClient.invalidateQueries({ queryKey: learnKeys.player(userId) })
    }
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [queryClient, userId])

  if (isLoading) return <LoadingComponent />

  const testPacks = player ? testablePacks(player) : []
  const tested = new Set((player?.placements || []).map(p => p.pack))
  // The test is there anytime, next to the name of its pack.
  const testable = new Set(testPacks.map(({ pack }) => pack.id))

  const waiting = queuedFor(userId)
  const left = totalLeft(player)
  const all = (player ? groupByPack(player) : []).map(group => ({
    ...group,
    items: group.modules.filter(module => byId[module.id]),
  }))
  const count = all.reduce((n, group) => n + group.items.length, 0)
  const withBar = count >= BAR_FROM
  let groups = shape(all, {
    query: withBar ? query : '',
    levels: withBar ? choices.levels : [],
  })
  if (withBar && choices.sort === 'first') {
    const items = groups.flatMap(group =>
      group.items.map(module => ({
        ...module,
        levels: module.levels?.length ? module.levels : group.levels,
        review: toReview(byId[module.id], cards, player.day),
        done: left === 0 || module.earnedToday >= module.dailyCap,
        locked: !!moduleLocked(byId[module.id], byId, cards),
      })),
    )
    groups = items.length
      ? [{ id: 'first', name: '', items: playFirst(items) }]
      : []
  }
  const packOf = id =>
    id && id !== 'first' ? player?.packs?.find(p => p.id === id) : null
  // Each pack shows its levels under its name, as in Gérer.
  const sections =
    choices.sort === 'first' && withBar
      ? groups.map(group => ({
          id: group.id,
          name: group.name,
          levels: [{ group, title: null }],
        }))
      : byRootPack(groups, player?.packs || []).flatMap(section =>
          // A module on its own is a pack like the others: its own title.
          section.id
            ? [section]
            : section.levels.flatMap(({ group }) =>
                group.items.map(module => ({
                  id: module.id,
                  module,
                  name: module.name,
                  levels: [
                    { group: { ...group, items: [module] }, title: null },
                  ],
                })),
              ),
        )

  return (
    <Container maxWidth='sm' sx={pageSx}>
      <Stack direction='row' gap={1.5} alignItems='center' sx={{ mb: 2 }}>
        {member && <MemberAvatar member={member} size={48} />}
        <Box>
          <Typography level='h3'>
            {t('home.title', { name: member?.displayName || '' })}
          </Typography>
          <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
            {t('home.subtitle')}
          </Typography>
        </Box>
      </Stack>

      {Number.isFinite(left) && (
        <Sheet
          variant='outlined'
          sx={{
            alignItems: 'center',
            borderRadius: 'lg',
            display: 'flex',
            gap: 1.5,
            mb: 2,
            p: 1.25,
          }}
        >
          <Typography level='title-sm' sx={{ flexShrink: 0 }}>
            {t('home.totalToday', {
              earned: player.earnedToday,
              cap: player.totalCap,
            })}
          </Typography>
          <Box sx={{ flex: 1 }}>
            <Progress
              value={
                player.totalCap
                  ? (player.earnedToday * 100) / player.totalCap
                  : 100
              }
              color={HOPLA.gold}
            />
          </Box>
          {left === 0 && (
            <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
              {t('home.dayFull')}
            </Typography>
          )}
        </Sheet>
      )}

      {player && count > 0 && (
        <TestsSection
          byId={byId}
          cards={cards}
          player={player}
          testPath={id => `${playPath(TESTS)}?id=${id}`}
          userId={userId}
        />
      )}

      {player && count > 0 && (
        <ReviewsCard
          player={player}
          byId={byId}
          cards={cards}
          to={playPath(REVIEWS)}
        />
      )}

      {((player?.recre?.on && count > 0) || player?.recre?.bank > 0) && (
        <RecreCard recre={player.recre} to={recrePath} />
      )}

      {(player?.offline || waiting > 0) && (
        <Sheet
          variant='soft'
          sx={{
            alignItems: 'center',
            bgcolor: HOPLA.goldSoft,
            borderRadius: 'lg',
            color: HOPLA.goldText,
            display: 'flex',
            gap: 1,
            mb: 2,
            p: 1.25,
          }}
        >
          <CloudOffRounded />
          <Typography level='body-sm' sx={{ color: 'inherit' }}>
            {player?.offline ? t('home.offline') : ''}{' '}
            {waiting > 0 ? t('home.waiting', { count: waiting }) : ''}
          </Typography>
        </Sheet>
      )}

      {error && !player && (
        <Typography color='danger'>{t('home.error')}</Typography>
      )}

      {withBar && (
        <ListBar
          query={query}
          onQuery={setQuery}
          choices={choices}
          onChoices={setChoices}
          count={groups.reduce((n, group) => n + group.items.length, 0)}
          levels={levelsIn(all.flatMap(group => [group, ...group.items]))}
          sorts={['level', 'first'].map(key => ({
            key,
            label: t(`list.sort.${key}`),
          }))}
        />
      )}

      {withBar && count > 0 && groups.length === 0 && (
        <Typography level='body-md' sx={{ color: 'text.secondary' }}>
          {t('list.nothing')}
        </Typography>
      )}

      {player && count === 0 && (
        <Sheet
          variant='outlined'
          sx={{ borderRadius: 'xl', p: 3, textAlign: 'center' }}
        >
          <SchoolRounded sx={{ fontSize: 40, color: HOPLA.violet }} />
          <Typography level='title-md' sx={{ mt: 1 }}>
            {t('home.empty')}
          </Typography>
          <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
            {isParent ? t('home.emptyParent') : t('home.emptyChild')}
          </Typography>
          {isParent && (
            <Button component={Link} to='/manage/learn' sx={{ mt: 2 }}>
              {t('chooser.manage')}
            </Button>
          )}
        </Sheet>
      )}

      <Stack gap={2.5}>
        {sections.map(section => (
          <Sheet
            component='section'
            key={section.id || 'others'}
            variant='soft'
            sx={{ borderRadius: 'xl', p: 1.5 }}
          >
            <Stack direction='row' alignItems='center' gap={1} sx={{ mb: 1.5 }}>
              {(packOf(section.id) || section.module) && (
                <LearnIcon
                  entity={packOf(section.id) || section.module}
                  size={28}
                  tile={false}
                />
              )}
              <Typography level='title-lg' sx={{ flex: 1, minWidth: 0 }}>
                {section.id === 'first'
                  ? t('list.sort.first')
                  : section.name || t('home.others')}
              </Typography>
              {(testable.has(section.id) || section.module) &&
                !player.offline && (
                  <Button
                    component={Link}
                    to={testPath(section.id)}
                    size='sm'
                    variant='plain'
                    startDecorator={<FactCheckOutlined />}
                  >
                    {tested.has(section.id)
                      ? t('test.again')
                      : t('test.button')}
                  </Button>
                )}
            </Stack>
            <Stack gap={1.5}>
              {section.levels.map(({ group, title }) => (
                <Stack key={group.id || 'others'} gap={1}>
                  {title && (
                    <Typography
                      level='title-md'
                      sx={{
                        borderLeft: '4px solid',
                        borderColor: 'primary.solidBg',
                        mt: 0.5,
                        pl: 1,
                      }}
                    >
                      {title}
                    </Typography>
                  )}
                  {group.items.map(module => (
                    <ModuleCard
                      key={module.id}
                      module={module}
                      compiled={byId[module.id]}
                      compiledById={byId}
                      cards={cards}
                      day={player.day}
                      dayFull={left === 0}
                      dueLeft={reviewsLeft(player)}
                      testTo={
                        player.offline
                          ? undefined
                          : scope =>
                              `${testPath(rootOf(player.packs, module.id)?.id || module.id)}?${scope}`
                      }
                      to={playPath(module.id)}
                    />
                  ))}
                </Stack>
              ))}
            </Stack>
          </Sheet>
        ))}
      </Stack>
    </Container>
  )
}

LearnModules.propTypes = {
  isParent: PropTypes.bool,
  member: PropTypes.object,
  playPath: PropTypes.func.isRequired,
  recrePath: PropTypes.string.isRequired,
  testPath: PropTypes.func.isRequired,
  userId: PropTypes.number.isRequired,
}

// /learn/:userId: the modules a person plays.
export const LearnHome = () => {
  const { userId: param } = useParams()
  const userId = Number(param)
  const isParent = useIsParent()
  const { data: me } = useUserProfile()
  const members = useActiveMembers()

  if (me && isParent === false && me.id !== userId) {
    return <Navigate to={`/learn/${me.id}`} replace />
  }
  return (
    <LearnModules
      userId={userId}
      member={members.find(m => m.userId === userId)}
      isParent={!!isParent}
      playPath={moduleId => `/learn/${userId}/play/${moduleId}`}
      recrePath={`/learn/${userId}/recre`}
      testPath={pack => `/learn/${userId}/test/${pack}`}
    />
  )
}
