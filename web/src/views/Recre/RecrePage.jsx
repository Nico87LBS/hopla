import {
  ArrowBackRounded,
  EmojiEventsRounded,
  ReplayRounded,
  TimerRounded,
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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router-dom'

import { HOPLA } from '../../constants/theme'
import { learnKeys, usePlayer } from '../../queries/LearnQueries'
import { SendRecre } from '../../utils/Fetcher'
import { generateUUID } from '../../utils/UUID'
import LoadingComponent from '../components/Loading'
import { MemberAvatar } from '../Games/GameParts'
import Board from './Board'
import { GAMES } from './games'
import { clock } from './games/common'

// The récré: after a few games of Apprendre played well, a child plays one
// little game. It earns no hop; each game keeps the family's records. A
// reward from the shop also gives time of récré: the child then plays freely
// until that time is spent, the clock running only during the games.

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
  const bank = recre?.bank || 0
  if (!recre?.on && bank <= 0) return <Navigate to={back} replace />
  const records = recre.records || []
  // The récré earned comes first; the time from the shop waits for after.
  const earned = recre.on && recre.since >= recre.every
  const free = !earned && bank > 0
  const ready = earned || free
  const left = Math.max(0, recre.every - recre.since)
  const options = { slow: recre.trainSlow, wrap: recre.trainWrap }

  const finish = async (score, seconds) => {
    const best = bestOf(records, game, userId)
    const shown = { game, score, record: score > 0 && score > best }
    setResult({ ...shown, status: 'sending' })
    try {
      const after = await SendRecre({
        clientId: generateUUID(),
        userId,
        game,
        score,
        ...(free && { free: true, seconds }),
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
        <Board
          game={game}
          seconds={free ? bank : recre.minutes * 60}
          options={options}
          onEnd={finish}
        />
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
          {bank > 0 ? (
            <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
              {t('recre.bankLeft', { time: clock(bank) })}
            </Typography>
          ) : (
            recre.on && (
              <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
                {t('recre.nextIn', { count: recre.every })}
              </Typography>
            )
          )}
          {bank > 0 && (
            <Button size='lg' onClick={() => setResult(null)}>
              {t('recre.playAgain')}
            </Button>
          )}
          <Button
            size='lg'
            variant={bank > 0 ? 'outlined' : 'solid'}
            component={Link}
            to={back}
            replace
          >
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
            {earned && t('recre.pick')}
            {free && t('recre.bankPick')}
            {!ready && t('recre.notYet', { count: left, every: recre.every })}
          </Typography>
        </Box>
        {free && (
          <Typography
            level='title-md'
            startDecorator={<TimerRounded />}
            sx={{ color: HOPLA.green, flexShrink: 0 }}
          >
            {clock(bank)}
          </Typography>
        )}
        {earned && recre.minutes > 0 && (
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
          const Icon = GAMES[name].icon
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
