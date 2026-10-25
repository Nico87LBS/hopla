import { LockRounded } from '@mui/icons-material'
import { Box, Chip, Container, Sheet, Stack, Typography } from '@mui/joy'
import moment from 'moment'
import PropTypes from 'prop-types'
import { Fragment, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useParams } from 'react-router-dom'

import { HOPLA } from '../../constants/theme'
import { useIsParent } from '../../hooks/useIsParent'
import { useLearnStats } from '../../queries/LearnQueries'
import {
  cardMap,
  compile,
  itemForKey,
  openChapters,
} from '../../utils/learn/engine'
import LoadingComponent from '../components/Loading'
import { MemberAvatar, surfaceSx } from '../Games/GameParts'
import { useMembers } from '../Manage/ParentPages'
import { Progress, Stars } from './LearnParts'

const HEAD = 32
const STRUGGLES = 8
const RECENT = 8

const daysBefore = (day, days) =>
  moment(day, 'YYYY-MM-DD').subtract(days, 'days').format('YYYY-MM-DD')

// personStats reads what one person did with the module: their chapters,
// their games and the questions they get wrong.
const personStats = (compiled, person, day) => {
  const cards = cardMap(person.cards)
  const chapters = openChapters(
    compiled,
    cards,
    person.unlockPercent ?? undefined,
  )
  const mine = []
  for (const card of cards.values()) {
    const item = itemForKey(compiled.chapters, card.key)
    if (item) mine.push({ card, item })
  }
  const sessions = person.sessions
  const sum = name => sessions.reduce((total, s) => total + s[name], 0)
  const answered = sum('total')
  const weekAgo = daysBefore(day, 7)
  return {
    chapters,
    games: sessions.length,
    week: sessions.filter(s => s.day > weekAgo).length,
    success: answered ? Math.round((sum('correct') * 100) / answered) : null,
    stars: sessions.length ? sum('stars') / sessions.length : null,
    hops: sum('points'),
    minutes: Math.round(sum('durationSec') / 60),
    last: sessions.at(-1)?.playedAt,
    known: mine.filter(({ card }) => card.box >= 4).length,
    seen: mine.length,
    due: mine.filter(({ card }) => card.due && card.due <= day).length,
    struggles: mine
      .filter(({ card }) => card.wrong > 0)
      .sort((a, b) => a.card.box - b.card.box || b.card.wrong - a.card.wrong)
      .slice(0, STRUGGLES),
    recent: sessions.slice(-RECENT).reverse(),
  }
}

const Tile = ({ label, value }) => (
  <Sheet
    variant='soft'
    sx={{ borderRadius: 'lg', minWidth: 96, flex: '1 1 96px', p: 1.25 }}
  >
    <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
      {label}
    </Typography>
    <Typography level='title-lg'>{value}</Typography>
  </Sheet>
)

Tile.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node.isRequired,
}

const ChapterGrid = ({ compiled, members, people }) => {
  const { t } = useTranslation('learn')
  const columns = `minmax(0, 1fr) repeat(${people.length}, minmax(64px, 96px))`
  return (
    <Sheet sx={surfaceSx}>
      <Typography level='title-lg' sx={{ mb: 1.5 }}>
        {t('stats.chapters')}
      </Typography>
      <Box
        sx={{
          alignItems: 'center',
          columnGap: 1.5,
          display: 'grid',
          gridTemplateColumns: columns,
          rowGap: 1.25,
        }}
      >
        <Box />
        {people.map(({ person }) => (
          <Box
            key={person.userId}
            sx={{ display: 'flex', justifyContent: 'center' }}
          >
            <MemberAvatar member={members.get(person.userId)} size={HEAD} />
          </Box>
        ))}
        {compiled.chapters.map((chapter, i) => (
          <Fragment key={chapter.id}>
            <Typography level='body-sm'>{chapter.name}</Typography>
            {people.map(({ person, stats }) => {
              const { open, progress } = stats.chapters[i]
              return (
                <Box key={person.userId}>
                  {open ? (
                    <>
                      <Typography level='body-xs' sx={{ textAlign: 'right' }}>
                        {progress.percent} %
                      </Typography>
                      <Progress value={progress.percent} />
                    </>
                  ) : (
                    <Typography
                      level='body-xs'
                      startDecorator={<LockRounded sx={{ fontSize: 14 }} />}
                      sx={{ color: 'text.tertiary', justifyContent: 'center' }}
                    >
                      {t('stats.closed')}
                    </Typography>
                  )}
                </Box>
              )
            })}
          </Fragment>
        ))}
      </Box>
    </Sheet>
  )
}

ChapterGrid.propTypes = {
  compiled: PropTypes.object.isRequired,
  members: PropTypes.instanceOf(Map).isRequired,
  people: PropTypes.array.isRequired,
}

const PersonCard = ({ member, person, stats }) => {
  const { t } = useTranslation('learn')
  return (
    <Sheet sx={surfaceSx}>
      <Stack direction='row' gap={1.5} alignItems='center' sx={{ mb: 1.5 }}>
        <MemberAvatar member={member} size={40} />
        <Box sx={{ flex: 1 }}>
          <Typography level='title-lg'>{member?.displayName}</Typography>
          <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
            {stats.last
              ? t('stats.lastPlayed', { when: moment(stats.last).fromNow() })
              : t('stats.neverPlayed')}
          </Typography>
        </Box>
        {!person.active && (
          <Chip size='sm' variant='soft'>
            {t('stats.off')}
          </Chip>
        )}
      </Stack>

      <Stack direction='row' gap={1} flexWrap='wrap'>
        <Tile
          label={t('stats.games')}
          value={t('stats.gamesValue', {
            count: stats.games,
            week: stats.week,
          })}
        />
        <Tile
          label={t('stats.success')}
          value={stats.success === null ? '–' : `${stats.success} %`}
        />
        <Tile
          label={t('stats.stars')}
          value={
            stats.stars === null ? (
              '–'
            ) : (
              <Stack direction='row' alignItems='center' gap={0.5}>
                <Stars count={Math.round(stats.stars)} size={18} />
                <Typography level='body-xs'>
                  {stats.stars.toFixed(1)}
                </Typography>
              </Stack>
            )
          }
        />
        <Tile
          label={t('stats.hops')}
          value={t('stats.hopsValue', { count: stats.hops })}
        />
        <Tile
          label={t('stats.time')}
          value={t('stats.minutes', { count: stats.minutes })}
        />
        <Tile
          label={t('stats.known')}
          value={t('stats.knownValue', {
            known: stats.known,
            seen: stats.seen,
          })}
        />
        <Tile label={t('stats.due')} value={stats.due} />
      </Stack>

      <Typography level='title-sm' sx={{ mt: 2, mb: 0.75 }}>
        {t('stats.struggles')}
      </Typography>
      {stats.struggles.length === 0 ? (
        <Typography level='body-sm' sx={{ color: 'text.tertiary' }}>
          {t('stats.noStruggle')}
        </Typography>
      ) : (
        <Stack gap={0.75}>
          {stats.struggles.map(({ card, item }) => (
            <Stack
              key={card.key}
              direction='row'
              gap={1}
              alignItems='baseline'
              sx={{ flexWrap: 'wrap' }}
            >
              <Typography level='body-sm' sx={{ flex: '1 1 200px' }}>
                {item.prompt}{' '}
                {item.mode !== 'flip' && (
                  <Typography
                    component='span'
                    sx={{ color: HOPLA.greenText, fontWeight: 700 }}
                  >
                    → {item.answer}
                  </Typography>
                )}
              </Typography>
              <Typography level='body-xs' sx={{ color: HOPLA.carrotText }}>
                {card.lastAnswer
                  ? t('stats.answered', { answer: card.lastAnswer })
                  : ''}{' '}
                {t('stats.wrongCount', {
                  count: card.wrong,
                  right: card.right,
                })}
              </Typography>
            </Stack>
          ))}
        </Stack>
      )}

      {stats.recent.length > 0 && (
        <>
          <Typography level='title-sm' sx={{ mt: 2, mb: 0.75 }}>
            {t('stats.recent')}
          </Typography>
          <Stack gap={0.5}>
            {stats.recent.map(session => (
              <Stack
                key={session.id}
                direction='row'
                gap={1.5}
                alignItems='center'
              >
                <Typography
                  level='body-xs'
                  sx={{ color: 'text.secondary', width: 96 }}
                >
                  {moment(session.playedAt).format('D MMM, HH:mm')}
                </Typography>
                <Stars count={session.stars} size={14} />
                <Typography level='body-xs' sx={{ flex: 1 }}>
                  {t('stats.score', {
                    correct: session.correct,
                    total: session.total,
                  })}
                </Typography>
                <Typography
                  level='body-xs'
                  sx={{ color: HOPLA.goldText, fontWeight: 700 }}
                >
                  {t('stats.hopsValue', { count: session.points })}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </>
      )}
    </Sheet>
  )
}

PersonCard.propTypes = {
  member: PropTypes.object,
  person: PropTypes.object.isRequired,
  stats: PropTypes.object.isRequired,
}

// /manage/learn/:moduleId: how everyone does with a module, chapter by
// chapter, for the parents.
const LearnStats = () => {
  const { t } = useTranslation('learn')
  const { moduleId } = useParams()
  const isParent = useIsParent()
  const members = useMembers()
  const { data, error, isLoading } = useLearnStats(moduleId)

  const byId = useMemo(
    () => new Map(members.map(m => [m.userId, m])),
    [members],
  )
  const view = useMemo(() => {
    if (!data) return null
    const compiled = compile(data.document)
    return {
      compiled,
      people: data.people.map(person => ({
        person,
        stats: personStats(compiled, person, data.day),
      })),
    }
  }, [data])

  if (isParent === false) return <Navigate to='/manage' replace />
  if (isLoading || isParent === undefined) return <LoadingComponent />

  return (
    <Container
      maxWidth='md'
      sx={{ px: { xs: 2, sm: 3 }, pb: 6, pt: { xs: 1, sm: 3 } }}
    >
      {error && <Typography color='danger'>{error.message}</Typography>}
      {data && view && (
        <Stack gap={2}>
          <Box>
            <Typography level='h3'>{data.module.name}</Typography>
            <Stack direction='row' gap={0.5} sx={{ mt: 0.5 }}>
              {(data.module.levels || []).map(level => (
                <Chip key={level} size='sm' variant='soft'>
                  {level}
                </Chip>
              ))}
            </Stack>
          </Box>
          {view.people.length === 0 ? (
            <Sheet sx={surfaceSx}>
              <Typography level='body-sm'>{t('stats.nobody')}</Typography>
            </Sheet>
          ) : (
            <>
              <ChapterGrid
                compiled={view.compiled}
                members={byId}
                people={view.people}
              />
              {view.people.map(({ person, stats }) => (
                <PersonCard
                  key={person.userId}
                  member={byId.get(person.userId)}
                  person={person}
                  stats={stats}
                />
              ))}
            </>
          )}
        </Stack>
      )}
    </Container>
  )
}

export default LearnStats
