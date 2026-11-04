import {
  ChevronRightRounded,
  CloudOffRounded,
  FactCheckOutlined,
  SchoolRounded,
  SportsEsportsRounded,
} from '@mui/icons-material'
import { Box, Button, Container, Sheet, Stack, Typography } from '@mui/joy'
import { useQueryClient } from '@tanstack/react-query'
import PropTypes from 'prop-types'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'

import { HOPLA } from '../../constants/theme'
import { useIsParent } from '../../hooks/useIsParent'
import {
  learnKeys,
  sendWaitingGames,
  usePlayer,
} from '../../queries/LearnQueries'
import { useFamilyMembers, useUserProfile } from '../../queries/UserQueries'
import { OpenNextLevel, SendPlacement } from '../../utils/Fetcher'
import { moduleLocked, openChapters, totalLeft } from '../../utils/learn/engine'
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
import { StartLevels } from './PlacementTest'

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

const ModuleCard = ({ cards, compiled, compiledById, dayFull, module, to }) => {
  const { t } = useTranslation('learn')
  const color = subjectColor(module.subject, module.document?.couleur)
  const locked = moduleLocked(compiled, compiledById, cards)
  const chapters = openChapters(
    compiled,
    cards,
    module.unlockPercent ?? undefined,
    module.placed,
  )
  const current = [...chapters].reverse().find(c => c.open)
  // The bar is the chapter being learnt, the one that opens the next.
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
            <Typography level='body-xs' sx={{ color: 'text.secondary' }} noWrap>
              {current?.chapter.name}
              {module.review > 0 && (
                <Typography
                  component='span'
                  sx={{ color: HOPLA.carrotText, fontWeight: 700 }}
                >
                  {' · '}
                  {t('list.toReview', { count: module.review })}
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
      {!locked && (
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
      component={locked ? 'div' : Link}
      to={locked ? undefined : to}
      sx={{
        borderRadius: 'xl',
        display: 'block',
        opacity: locked ? 0.7 : 1,
        p: 1.5,
        textDecoration: 'none',
        '&:hover': locked ? {} : { borderColor: color },
      }}
    >
      {body}
    </Sheet>
  )
}

ModuleCard.propTypes = {
  cards: PropTypes.instanceOf(Map).isRequired,
  dayFull: PropTypes.bool,
  compiled: PropTypes.object.isRequired,
  compiledById: PropTypes.object.isRequired,
  module: PropTypes.object.isRequired,
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

// TestOffer proposes the placement test of a pack never tested: it opens at
// once what the person knows, from the level they choose.
const TestOffer = ({ levels, onSkip, pack, to }) => {
  const { t } = useTranslation('learn')
  const navigate = useNavigate()
  const [start, setStart] = useState(0)
  const [skipping, setSkipping] = useState(false)
  return (
    <Sheet
      variant='outlined'
      sx={{ borderRadius: 'xl', display: 'grid', gap: 1.75, mb: 2, p: 2 }}
    >
      <Stack direction='row' gap={1.5} alignItems='center'>
        <LearnIcon entity={pack} size={44} />
        <Box sx={{ minWidth: 0 }}>
          <Typography
            level='body-xs'
            sx={{ color: 'text.secondary', fontWeight: 600 }}
          >
            {t('test.newPack')}
          </Typography>
          <Typography level='title-lg'>{pack.name}</Typography>
        </Box>
      </Stack>
      <Typography level='body-md'>{t('test.offer')}</Typography>
      <StartLevels levels={levels} value={start} onPick={setStart} />
      <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
        {t('test.rules')}
      </Typography>
      <Button size='lg' onClick={() => navigate(`${to}?depart=${start}`)}>
        {t('test.start')}
      </Button>
      <Button
        variant='plain'
        loading={skipping}
        onClick={async () => {
          setSkipping(true)
          await onSkip().catch(() => {})
          setSkipping(false)
        }}
      >
        {t('test.skip')}
      </Button>
    </Sheet>
  )
}

TestOffer.propTypes = {
  levels: PropTypes.array.isRequired,
  onSkip: PropTypes.func.isRequired,
  pack: PropTypes.object.isRequired,
  to: PropTypes.string.isRequired,
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
  // One pack never tested at a time is offered its test, so the modules
  // stay in sight; the others have theirs at the top of their group.
  const offers = player?.offline
    ? []
    : testPacks.filter(({ pack }) => !tested.has(pack.id)).slice(0, 1)
  // The test is there anytime, next to the name of its pack.
  const testable = new Set(testPacks.map(({ pack }) => pack.id))
  const skip = async pack => {
    await SendPlacement({ userId, pack, status: 'skipped' })
    queryClient.invalidateQueries({ queryKey: learnKeys.player(userId) })
  }

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
      : byRootPack(groups, player?.packs || [])

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

      {((player?.recre?.on && count > 0) || player?.recre?.bank > 0) && (
        <RecreCard recre={player.recre} to={recrePath} />
      )}

      {offers.map(({ levels, pack }) => (
        <TestOffer
          key={pack.id}
          pack={pack}
          levels={levels}
          to={testPath(pack.id)}
          onSkip={() => skip(pack.id)}
        />
      ))}

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
          <Box component='section' key={section.id || 'others'}>
            <Stack
              direction='row'
              alignItems='center'
              gap={1}
              sx={{ mb: 1, px: 0.5 }}
            >
              {packOf(section.id) && (
                <LearnIcon entity={packOf(section.id)} size={20} tile={false} />
              )}
              <Typography
                level='body-xs'
                sx={{
                  color: 'text.tertiary',
                  flex: 1,
                  fontWeight: 700,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                }}
              >
                {section.id === 'first'
                  ? t('list.sort.first')
                  : section.name || t('home.others')}
              </Typography>
              {testable.has(section.id) && !player.offline && (
                <Button
                  component={Link}
                  to={testPath(section.id)}
                  size='sm'
                  variant='plain'
                  startDecorator={<FactCheckOutlined />}
                >
                  {tested.has(section.id) ? t('test.again') : t('test.button')}
                </Button>
              )}
            </Stack>
            <Stack gap={1.5}>
              {section.levels.map(({ group, title }) => (
                <Stack key={group.id || 'others'} gap={1}>
                  {title && (
                    <Typography
                      level='title-sm'
                      sx={{ color: 'text.secondary', px: 0.5 }}
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
                      dayFull={left === 0}
                      to={playPath(module.id)}
                    />
                  ))}
                </Stack>
              ))}
            </Stack>
          </Box>
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
