import {
  ArrowBackRounded,
  ArrowDownwardRounded,
  ArrowForwardRounded,
  ArrowUpwardRounded,
  BubbleChartRounded,
  CloseRounded,
  EmojiEventsRounded,
  GrassRounded,
  PaletteRounded,
  ReplayRounded,
  ShoppingBasketRounded,
  TimerRounded,
  TrainRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Container,
  IconButton,
  Sheet,
  Stack,
  Typography,
} from '@mui/joy'
import { useQueryClient } from '@tanstack/react-query'
import PropTypes from 'prop-types'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router-dom'

import { HOPLA } from '../../constants/theme'
import { learnKeys, usePlayer } from '../../queries/LearnQueries'
import { SendRecre } from '../../utils/Fetcher'
import { generateUUID } from '../../utils/UUID'
import LoadingComponent from '../components/Loading'
import { MemberAvatar } from '../Games/GameParts'
import { GAMES } from './games'

// The récré: after a few games of Apprendre played well, a child plays one
// little game. It earns no hop; each game keeps the family's records.

const ICONS = {
  train: TrainRounded,
  bulles: BubbleChartRounded,
  panier: ShoppingBasketRounded,
  terriers: GrassRounded,
  sequence: PaletteRounded,
}

const pageSx = { px: { xs: 2, sm: 3 }, pb: 6, pt: { xs: 1, sm: 2 } }

const bestOf = (records, game, userId) =>
  records.find(r => r.game === game && r.userId === userId)?.score ?? 0

// Records shows the best score of each person at one game, best first.
export const Records = ({ game, records, userId }) => {
  const { t } = useTranslation('learn')
  const rows = records
    .filter(r => r.game === game && r.score > 0)
    .sort((a, b) => b.score - a.score)
  if (!rows.length) {
    return (
      <Typography level='body-sm' sx={{ color: 'text.tertiary' }}>
        {t('recre.noRecord')}
      </Typography>
    )
  }
  return (
    <Stack gap={0.75}>
      {rows.map((row, i) => (
        <Stack
          key={row.userId}
          direction='row'
          alignItems='center'
          gap={1}
          sx={{
            bgcolor: row.userId === userId ? HOPLA.goldSoft : 'transparent',
            borderRadius: 'md',
            px: 1,
            py: 0.5,
          }}
        >
          <Typography
            level='title-sm'
            sx={{
              color: i === 0 ? HOPLA.goldText : 'text.tertiary',
              width: 20,
            }}
          >
            {i + 1}
          </Typography>
          <MemberAvatar
            member={{
              displayName: row.displayName,
              image: row.image,
              userId: row.userId,
            }}
            size={28}
          />
          <Typography level='body-sm' sx={{ flex: 1, minWidth: 0 }} noWrap>
            {row.displayName}
          </Typography>
          <Typography level='title-sm'>{row.score}</Typography>
        </Stack>
      ))}
    </Stack>
  )
}

Records.propTypes = {
  game: PropTypes.string.isRequired,
  records: PropTypes.array.isRequired,
  userId: PropTypes.number,
}

const Arrows = ({ onPress }) => {
  const { t } = useTranslation('learn')
  const button = (dir, Icon) => (
    <IconButton
      size='lg'
      variant='soft'
      aria-label={t(`recre.arrow.${dir}`)}
      onPointerDown={event => {
        event.preventDefault()
        onPress(dir)
      }}
      sx={{ borderRadius: '50%', height: 64, width: 64 }}
    >
      <Icon />
    </IconButton>
  )
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 1,
        gridTemplateAreas: '". up ." "left . right" ". down ."',
        justifyContent: 'center',
        mt: 1.5,
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <Box sx={{ gridArea: 'up' }}>{button('up', ArrowUpwardRounded)}</Box>
      <Box sx={{ gridArea: 'left' }}>{button('left', ArrowBackRounded)}</Box>
      <Box sx={{ gridArea: 'right' }}>
        {button('right', ArrowForwardRounded)}
      </Box>
      <Box sx={{ gridArea: 'down' }}>
        {button('down', ArrowDownwardRounded)}
      </Box>
    </Box>
  )
}

Arrows.propTypes = { onPress: PropTypes.func.isRequired }

const clock = seconds =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

// Board runs one game on a canvas until it ends, the time runs out or the
// child quits; it tells the score once.
const Board = ({ game, minutes, onEnd }) => {
  const { t } = useTranslation('learn')
  const canvas = useRef(null)
  const handle = useRef(null)
  const score = useRef(0)
  const ended = useRef(false)
  const [shown, setShown] = useState(0)
  const [hint, setHint] = useState('')
  const [left, setLeft] = useState(minutes * 60)
  const meta = GAMES[game]

  const end = useRef(null)
  useEffect(() => {
    end.current = () => {
      if (ended.current) return
      ended.current = true
      handle.current?.stop()
      onEnd(score.current)
    }
  })

  // Leaving the page ends the game: the récré is played. React may unmount
  // and mount again at once, so the end waits a moment.
  const leaving = useRef(0)
  useEffect(() => {
    clearTimeout(leaving.current)
    ended.current = false
    handle.current = meta.start(canvas.current, {
      onScore: value => {
        score.current = value
        setShown(value)
      },
      onHint: setHint,
      onEnd: value => {
        score.current = value
        // The game may end within its own frame: let it draw it first.
        setTimeout(() => end.current(), 600)
      },
    })
    return () => {
      handle.current?.stop()
      leaving.current = setTimeout(() => end.current(), 0)
    }
  }, [meta])

  useEffect(() => {
    if (!minutes) return undefined
    const started = Date.now()
    const id = setInterval(() => {
      const rest = Math.max(0, minutes * 60 - (Date.now() - started) / 1000)
      setLeft(Math.ceil(rest))
      if (rest <= 0) {
        clearInterval(id)
        end.current()
      }
    }, 250)
    return () => clearInterval(id)
  }, [minutes])

  return (
    <Box sx={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
      <Stack direction='row' alignItems='center' gap={1} sx={{ mb: 1 }}>
        <IconButton
          variant='plain'
          aria-label={t('recre.stop')}
          onClick={() => end.current()}
        >
          <CloseRounded />
        </IconButton>
        <Typography level='title-lg' sx={{ flex: 1 }}>
          {t(`recre.game.${game}`)}
        </Typography>
        {minutes > 0 && (
          <Typography
            level='title-md'
            startDecorator={<TimerRounded />}
            sx={{ color: left <= 10 ? HOPLA.carrotText : 'text.secondary' }}
          >
            {clock(left)}
          </Typography>
        )}
        <Typography level='title-lg' sx={{ minWidth: 56, textAlign: 'right' }}>
          {shown}
        </Typography>
      </Stack>
      <Box
        component='canvas'
        ref={canvas}
        tabIndex={0}
        aria-label={t(`recre.help.${game}`)}
        sx={{
          aspectRatio: `1 / ${meta.tall}`,
          borderRadius: 'xl',
          boxShadow: 'sm',
          display: 'block',
          maxHeight: '68vh',
          mx: 'auto',
          outline: 'none',
          touchAction: 'none',
          width: '100%',
        }}
      />
      <Typography
        level='body-sm'
        sx={{ color: 'text.secondary', mt: 1, textAlign: 'center' }}
      >
        {hint ? t(`recre.hint.${hint}`) : t(`recre.help.${game}`)}
      </Typography>
      {meta.arrows && <Arrows onPress={dir => handle.current?.input?.(dir)} />}
    </Box>
  )
}

Board.propTypes = {
  game: PropTypes.string.isRequired,
  minutes: PropTypes.number,
  onEnd: PropTypes.func.isRequired,
}

// /learn/:userId/recre and, on the family screen, /play/:userId/recre.
const RecrePage = ({ playMode = false }) => {
  const { t } = useTranslation('learn')
  const { userId: param } = useParams()
  const userId = Number(param)
  const queryClient = useQueryClient()
  const { data: player, isLoading } = usePlayer(userId)
  const [game, setGame] = useState(null)
  const [result, setResult] = useState(null)
  const back = playMode ? '/play' : `/learn/${userId}`

  if (isLoading) return <LoadingComponent />
  const recre = player?.recre
  if (!recre?.on) return <Navigate to={back} replace />
  const records = recre.records || []
  const ready = recre.since >= recre.every
  const left = Math.max(0, recre.every - recre.since)

  const finish = async score => {
    const best = bestOf(records, game, userId)
    const shown = { game, score, record: score > 0 && score > best }
    setResult({ ...shown, status: 'sending' })
    try {
      const after = await SendRecre({
        clientId: generateUUID(),
        userId,
        game,
        score,
      })
      setResult({ ...shown, status: 'sent', records: after.records })
      queryClient.setQueryData(learnKeys.player(userId), kept =>
        kept ? { ...kept, recre: after } : kept,
      )
    } catch {
      setResult({ ...shown, status: 'failed' })
    }
    setGame(null)
    queryClient.invalidateQueries({ queryKey: learnKeys.player(userId) })
  }

  if (game) {
    return (
      <Container maxWidth='sm' sx={pageSx}>
        <Board game={game} minutes={recre.minutes} onEnd={finish} />
      </Container>
    )
  }

  if (result) {
    return (
      <Container maxWidth='sm' sx={pageSx}>
        <Stack
          gap={2}
          alignItems='center'
          sx={{ pt: 2, textAlign: 'center', userSelect: 'none' }}
        >
          <EmojiEventsRounded
            sx={{
              color: result.record ? HOPLA.gold : HOPLA.violet,
              fontSize: 64,
            }}
          />
          <Typography level='h2'>
            {result.record ? t('recre.newRecord') : t('recre.wellPlayed')}
          </Typography>
          <Typography level='body-lg'>
            {t('recre.score', { count: result.score })}
          </Typography>
          {result.status === 'failed' && (
            <Typography level='body-sm' color='danger'>
              {t('recre.notSaved')}
            </Typography>
          )}
          <Sheet
            variant='outlined'
            sx={{ borderRadius: 'lg', p: 2, textAlign: 'left', width: '100%' }}
          >
            <Typography level='title-sm' sx={{ mb: 1 }}>
              {t('recre.recordsOf', {
                game: t(`recre.game.${result.game}`),
              })}
            </Typography>
            <Records
              game={result.game}
              records={result.records || records}
              userId={userId}
            />
          </Sheet>
          <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
            {t('recre.nextIn', { count: recre.every })}
          </Typography>
          <Button size='lg' component={Link} to={back} replace>
            {t('recre.backToLearn')}
          </Button>
        </Stack>
      </Container>
    )
  }

  return (
    <Container maxWidth='sm' sx={pageSx}>
      <Stack direction='row' alignItems='center' gap={1} sx={{ mb: 2 }}>
        <IconButton
          component={Link}
          to={back}
          replace
          variant='plain'
          aria-label={t('recre.back')}
        >
          <ArrowBackRounded />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography level='h3'>{t('recre.title')}</Typography>
          <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
            {ready
              ? t('recre.pick')
              : t('recre.notYet', { count: left, every: recre.every })}
          </Typography>
        </Box>
        {recre.minutes > 0 && (
          <Typography
            level='body-sm'
            startDecorator={<TimerRounded />}
            sx={{ color: 'text.secondary' }}
          >
            {t('recre.minutes', { count: recre.minutes })}
          </Typography>
        )}
      </Stack>
      <Stack gap={1.5}>
        {recre.games.map(name => {
          const Icon = ICONS[name]
          const color = GAMES[name].color
          return (
            <Sheet
              key={name}
              variant='outlined'
              sx={{ borderRadius: 'xl', p: 1.5 }}
            >
              <Stack direction='row' alignItems='center' gap={1.5}>
                <Box
                  sx={{
                    alignItems: 'center',
                    bgcolor: color,
                    borderRadius: '14px',
                    color: '#fff',
                    '--Icon-color': '#fff',
                    display: 'flex',
                    flexShrink: 0,
                    height: 48,
                    justifyContent: 'center',
                    width: 48,
                  }}
                >
                  <Icon />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography level='title-md'>
                    {t(`recre.game.${name}`)}
                  </Typography>
                  <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
                    {t(`recre.about.${name}`)}
                  </Typography>
                </Box>
                <Button
                  disabled={!ready}
                  onClick={() => setGame(name)}
                  sx={{ bgcolor: color, '&:hover': { bgcolor: color } }}
                >
                  {t('recre.play')}
                </Button>
              </Stack>
              <Box sx={{ mt: 1 }}>
                <Records game={name} records={records} userId={userId} />
              </Box>
            </Sheet>
          )
        })}
      </Stack>
    </Container>
  )
}

RecrePage.propTypes = { playMode: PropTypes.bool }

export default RecrePage
