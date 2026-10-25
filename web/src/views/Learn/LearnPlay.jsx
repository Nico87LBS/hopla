import {
  BackspaceOutlined,
  CheckRounded,
  CloseRounded,
  CloudOffRounded,
  ReplayRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Container,
  IconButton,
  Input,
  Sheet,
  Stack,
  Typography,
} from '@mui/joy'
import { useQueryClient } from '@tanstack/react-query'
import PropTypes from 'prop-types'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router-dom'

import { HOPLA } from '../../constants/theme'
import { learnKeys, usePlayer } from '../../queries/LearnQueries'
import { SendLearnGame } from '../../utils/Fetcher'
import {
  checkAnswer,
  expectedHops,
  MIN_ANSWERS,
  moduleLocked,
  pickQuestions,
  stars,
  totalLeft,
} from '../../utils/learn/engine'
import { applyResult, playLocally, queueGame } from '../../utils/learn/store'
import { generateUUID } from '../../utils/UUID'
import LoadingComponent from '../components/Loading'
import { Stars, subjectColor, useCompiled } from './LearnParts'

// ── the ways to answer ──

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok']

const NumberPad = ({ color, onAnswer, unit }) => {
  const [value, setValue] = useState('')
  const press = useCallback(
    key => {
      if (key === 'back') setValue(v => v.slice(0, -1))
      else if (key === 'ok') {
        if (value !== '') onAnswer(value)
      } else setValue(v => (v.length < 9 ? v + key : v))
    },
    [onAnswer, value],
  )
  useEffect(() => {
    const onKey = e => {
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') press('back')
      else if (e.key === 'Enter') press('ok')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [press])

  return (
    <Stack gap={1.5} alignItems='center'>
      <Sheet
        variant='outlined'
        sx={{
          alignItems: 'baseline',
          borderColor: color,
          borderRadius: 'lg',
          borderWidth: 2,
          display: 'flex',
          gap: 1,
          justifyContent: 'center',
          minHeight: 64,
          minWidth: 180,
          px: 2,
          py: 1,
        }}
      >
        <Typography level='h2' sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {value || ' '}
        </Typography>
        {unit && (
          <Typography level='title-md' sx={{ color: 'text.secondary' }}>
            {unit}
          </Typography>
        )}
      </Sheet>
      <Box
        sx={{
          display: 'grid',
          gap: 1,
          gridTemplateColumns: 'repeat(3, 72px)',
        }}
      >
        {KEYS.map(key => (
          <Button
            key={key}
            variant={key === 'ok' ? 'solid' : 'soft'}
            color='neutral'
            onClick={() => press(key)}
            disabled={key === 'ok' && value === ''}
            sx={{
              fontSize: 24,
              height: 60,
              ...(key === 'ok' && {
                bgcolor: color,
                color: '#fff',
                '&:hover': { bgcolor: color },
              }),
            }}
            aria-label={key}
          >
            {key === 'back' ? (
              <BackspaceOutlined />
            ) : key === 'ok' ? (
              <CheckRounded />
            ) : (
              key
            )}
          </Button>
        ))}
      </Box>
    </Stack>
  )
}

NumberPad.propTypes = {
  color: PropTypes.string.isRequired,
  onAnswer: PropTypes.func.isRequired,
  unit: PropTypes.string,
}

const Choices = ({ color, item, onAnswer }) => (
  <Box
    sx={{
      display: 'grid',
      gap: 1.25,
      gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
      width: '100%',
    }}
  >
    {item.choices.map(choice => (
      <Button
        key={choice}
        variant='outlined'
        color='neutral'
        onClick={() => onAnswer(choice)}
        sx={{
          borderRadius: 'lg',
          borderWidth: 2,
          fontSize: 18,
          justifyContent: 'center',
          minHeight: 56,
          whiteSpace: 'normal',
          '&:hover': { borderColor: color },
        }}
      >
        {choice}
      </Button>
    ))}
  </Box>
)

Choices.propTypes = {
  color: PropTypes.string.isRequired,
  item: PropTypes.object.isRequired,
  onAnswer: PropTypes.func.isRequired,
}

const TextAnswer = ({ color, onAnswer }) => {
  const { t } = useTranslation('learn')
  const [value, setValue] = useState('')
  const send = () => value.trim() && onAnswer(value)
  return (
    <Stack gap={1.5} sx={{ width: '100%', maxWidth: 420 }}>
      <Input
        autoFocus
        size='lg'
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && send()}
        placeholder={t('play.typeHere')}
        slotProps={{
          input: {
            autoCapitalize: 'off',
            autoCorrect: 'off',
            spellCheck: false,
          },
        }}
      />
      <Button
        size='lg'
        onClick={send}
        disabled={!value.trim()}
        sx={{ bgcolor: color, '&:hover': { bgcolor: color } }}
      >
        {t('play.check')}
      </Button>
    </Stack>
  )
}

TextAnswer.propTypes = {
  color: PropTypes.string.isRequired,
  onAnswer: PropTypes.func.isRequired,
}

// FlipCard shows the answer of an open question; the player says herself
// whether she knew it.
const FlipCard = ({ color, item, onAnswer }) => {
  const { t } = useTranslation('learn')
  const [turned, setTurned] = useState(false)
  if (!turned) {
    return (
      <Button
        size='lg'
        onClick={() => setTurned(true)}
        sx={{ bgcolor: color, '&:hover': { bgcolor: color } }}
      >
        {t('play.turn')}
      </Button>
    )
  }
  return (
    <Stack gap={2} sx={{ width: '100%', maxWidth: 480 }}>
      <Sheet variant='soft' sx={{ borderRadius: 'lg', p: 2 }}>
        <Typography level='body-lg'>{item.answer}</Typography>
      </Sheet>
      <Stack direction='row' gap={1} justifyContent='center' flexWrap='wrap'>
        <Button color='success' onClick={() => onAnswer('oui')}>
          {t('play.knew')}
        </Button>
        <Button
          color='warning'
          variant='soft'
          onClick={() => onAnswer('presque')}
        >
          {t('play.almost')}
        </Button>
        <Button color='neutral' variant='soft' onClick={() => onAnswer('non')}>
          {t('play.notYet')}
        </Button>
      </Stack>
    </Stack>
  )
}

FlipCard.propTypes = {
  color: PropTypes.string.isRequired,
  item: PropTypes.object.isRequired,
  onAnswer: PropTypes.func.isRequired,
}

// ── a question ──

const Feedback = ({ feedback, onNext }) => {
  const { t } = useTranslation('learn')
  const { correct, item, typo } = feedback
  // Enter goes on, but only a new press: the one that sent the answer is
  // still down when this shows.
  useEffect(() => {
    let armed = false
    const down = e => {
      if (e.key === 'Enter') {
        e.preventDefault()
        armed = true
      }
    }
    const up = e => {
      if (e.key === 'Enter' && armed) {
        armed = false
        onNext()
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [onNext])
  return (
    <Sheet
      sx={{
        bgcolor: correct ? HOPLA.greenSoft : HOPLA.carrotSoft,
        borderRadius: 'lg',
        color: correct ? HOPLA.greenText : HOPLA.carrotText,
        p: 2,
        textAlign: 'center',
        width: '100%',
      }}
    >
      <Typography level='title-lg' sx={{ color: 'inherit' }}>
        {correct ? t('play.right') : t('play.wrong')}
      </Typography>
      {(!correct || typo) && (
        <Typography level='body-md' sx={{ color: 'inherit', mt: 0.5 }}>
          {t('play.answerWas', {
            answer: `${item.answer}${item.unit ? ` ${item.unit}` : ''}`,
          })}
        </Typography>
      )}
      {item.explanation && (
        <Typography level='body-sm' sx={{ color: 'inherit', mt: 0.5 }}>
          {item.explanation}
        </Typography>
      )}
      <Button
        onClick={onNext}
        sx={{ mt: 1.5 }}
        color={correct ? 'success' : 'warning'}
      >
        {t('play.next')}
      </Button>
    </Sheet>
  )
}

Feedback.propTypes = {
  feedback: PropTypes.object.isRequired,
  onNext: PropTypes.func.isRequired,
}

const Question = ({ color, item, onAnswer }) => {
  switch (item.mode) {
    case 'choice':
      return <Choices item={item} onAnswer={onAnswer} color={color} />
    case 'text':
      return <TextAnswer onAnswer={onAnswer} color={color} />
    case 'flip':
      return <FlipCard item={item} onAnswer={onAnswer} color={color} />
    default:
      return <NumberPad onAnswer={onAnswer} color={color} unit={item.unit} />
  }
}

Question.propTypes = {
  color: PropTypes.string.isRequired,
  item: PropTypes.object.isRequired,
  onAnswer: PropTypes.func.isRequired,
}

// ── the end of a game ──

const EndScreen = ({ back, color, end, onReplay }) => {
  const { t } = useTranslation('learn')
  const { capped, correct, hops, mistakes, stars: won, status, total } = end
  return (
    <Stack gap={2} alignItems='center' sx={{ textAlign: 'center', pt: 2 }}>
      <Stars count={won} size={56} />
      <Typography level='h2'>{t(`end.title${won}`)}</Typography>
      <Typography level='body-lg'>
        {t('end.score', { correct, total })}
      </Typography>
      <Sheet
        sx={{
          bgcolor: HOPLA.goldSoft,
          borderRadius: 'xl',
          color: HOPLA.goldText,
          px: 2.5,
          py: 1,
        }}
      >
        <Typography level='title-lg' sx={{ color: 'inherit' }}>
          {total < MIN_ANSWERS
            ? t('end.tooShort')
            : capped && hops === 0
              ? t('end.capped')
              : hops === 0
                ? t('end.noHops')
                : t('end.hops', { count: hops })}
        </Typography>
      </Sheet>
      {status === 'waiting' && (
        <Typography
          level='body-sm'
          startDecorator={<CloudOffRounded />}
          sx={{ color: 'text.secondary' }}
        >
          {t('end.waiting')}
        </Typography>
      )}
      {status === 'refused' && (
        <Typography level='body-sm' color='danger'>
          {t('end.refused')}
        </Typography>
      )}
      {mistakes.length > 0 && (
        <Sheet
          variant='outlined'
          sx={{ borderRadius: 'lg', p: 2, width: '100%', textAlign: 'left' }}
        >
          <Typography level='title-sm' sx={{ mb: 1 }}>
            {t('end.review')}
          </Typography>
          <Stack gap={0.75}>
            {mistakes.map(item => (
              <Typography key={item.key} level='body-sm'>
                {item.prompt}{' '}
                <Typography
                  component='span'
                  sx={{ color: HOPLA.greenText, fontWeight: 700 }}
                >
                  {item.mode === 'flip'
                    ? ''
                    : `→ ${item.answer}${item.unit ? ` ${item.unit}` : ''}`}
                </Typography>
              </Typography>
            ))}
          </Stack>
        </Sheet>
      )}
      <Stack direction='row' gap={1}>
        <Button
          size='lg'
          startDecorator={<ReplayRounded />}
          onClick={onReplay}
          sx={{ bgcolor: color, '&:hover': { bgcolor: color } }}
        >
          {t('end.replay')}
        </Button>
        <Button
          size='lg'
          variant='soft'
          color='neutral'
          component={Link}
          to={back}
          replace
        >
          {t('end.back')}
        </Button>
      </Stack>
    </Stack>
  )
}

EndScreen.propTypes = {
  back: PropTypes.string.isRequired,
  color: PropTypes.string.isRequired,
  end: PropTypes.object.isRequired,
  onReplay: PropTypes.func.isRequired,
}

// sendGame sends a game, or keeps it for later when the server is out of
// reach. It tells what the server said.
const sendGame = async (game, userId) => {
  try {
    const result = await SendLearnGame(game)
    applyResult(userId, game, result)
    return { status: 'sent', result }
  } catch (err) {
    if (err?.status >= 400 && err.status < 500 && err.status !== 401) {
      return { status: 'refused' }
    }
    queueGame(game)
    return { status: 'waiting' }
  }
}

// /learn/:userId/play/:moduleId: one game, question after question.
const LearnPlay = () => {
  const { t } = useTranslation('learn')
  const { moduleId, userId: param } = useParams()
  const userId = Number(param)
  const queryClient = useQueryClient()
  const { data: player, isLoading } = usePlayer(userId)
  const { byId, cards } = useCompiled(player)
  const module = player?.modules.find(m => m.id === moduleId)
  const compiled = byId[moduleId]

  const [game, setGame] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [end, setEnd] = useState(null)

  const start = useCallback(() => {
    if (!compiled || !module) return
    setFeedback(null)
    setEnd(null)
    setGame({
      clientId: generateUUID(),
      startedAt: Date.now(),
      questions: pickQuestions(compiled, cards, {
        day: player.day,
        settings: module.settings,
        unlockPercent: module.unlockPercent ?? undefined,
      }),
      answers: [],
    })
    // Only a new game picks new questions, not a card moved by this one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compiled, module?.id])

  useEffect(() => {
    if (!game && compiled && module) start()
  }, [game, compiled, module, start])

  const back = `/learn/${userId}`
  if (isLoading || (!game && compiled)) return <LoadingComponent />
  if (!module || !compiled || moduleLocked(compiled, byId, cards)) {
    return <Navigate to={back} replace />
  }

  const color = subjectColor(module.subject, module.document?.couleur)
  const index = game.answers.length
  const item = game.questions[index]

  const finish = async answers => {
    const correct = answers.filter(a => a.correct).length
    const total = answers.length
    const settings = module.settings
    const hops = expectedHops(
      correct,
      total,
      settings,
      module.earnedToday,
      module.dailyCap,
      totalLeft(player),
    )
    const wouldEarn =
      stars(correct, total, settings.seuil) * settings.hops_par_etoile
    const sent = {
      clientId: game.clientId,
      userId,
      module: module.id,
      playedAt: new Date().toISOString(),
      durationSec: Math.round((Date.now() - game.startedAt) / 1000),
      answers,
    }
    playLocally(player, sent, hops)
    const mistakes = game.questions.filter(
      (q, i) => answers[i] && !answers[i].correct,
    )
    const shown = {
      correct,
      total,
      stars: stars(correct, total, settings.seuil),
      hops,
      capped: total >= MIN_ANSWERS && wouldEarn > hops,
      mistakes,
      status: 'sending',
    }
    setEnd(shown)
    const { result, status } = await sendGame(sent, userId)
    setEnd({
      ...shown,
      status,
      ...(result && {
        hops: result.session.points,
        stars: result.session.stars,
        capped: result.capped,
      }),
    })
    queryClient.invalidateQueries({ queryKey: learnKeys.player(userId) })
  }

  const answer = given => {
    const check = checkAnswer(item, given)
    const answers = [
      ...game.answers,
      {
        key: item.key,
        correct: check.correct,
        almost: check.almost,
        given: check.correct ? '' : String(given),
      },
    ]
    setGame({ ...game, answers })
    if (item.mode === 'flip') {
      if (answers.length === game.questions.length) finish(answers)
      return
    }
    setFeedback({ ...check, item })
  }

  const next = () => {
    setFeedback(null)
    if (game.answers.length === game.questions.length) finish(game.answers)
  }

  return (
    <Container
      maxWidth='sm'
      sx={{ px: { xs: 2, sm: 3 }, pb: 6, pt: { xs: 1, sm: 2 } }}
    >
      <Stack gap={1} sx={{ mb: 2 }}>
        <Stack direction='row' alignItems='center' gap={1}>
          <IconButton
            component={Link}
            to={back}
            replace
            aria-label={t('play.quit')}
            variant='plain'
          >
            <CloseRounded />
          </IconButton>
          <Typography level='title-lg' sx={{ flex: 1, minWidth: 0 }} noWrap>
            {module.name}
          </Typography>
        </Stack>
        <Stack direction='row' alignItems='center' gap={1.25}>
          <Stack direction='row' gap='2px' sx={{ flex: 1, height: 8 }}>
            {game.questions.map((q, i) => {
              const given = game.answers[i]
              return (
                <Box
                  key={q.key}
                  sx={{
                    bgcolor: given
                      ? given.correct
                        ? HOPLA.green
                        : given.almost
                          ? HOPLA.gold
                          : HOPLA.carrot
                      : i === index
                        ? color
                        : 'background.level3',
                    borderRadius: 4,
                    flex: 1,
                  }}
                />
              )
            })}
          </Stack>
          <Typography
            level='body-sm'
            sx={{ fontWeight: 600, minWidth: 44, textAlign: 'right' }}
          >
            {t('play.progress', {
              current: Math.min(index + 1, game.questions.length),
              total: game.questions.length,
            })}
          </Typography>
        </Stack>
      </Stack>

      {end ? (
        <EndScreen end={end} onReplay={start} back={back} color={color} />
      ) : (
        (item || feedback) && (
          <Stack gap={3} alignItems='center'>
            <Sheet
              variant='outlined'
              sx={{
                borderRadius: 'xl',
                borderColor: color,
                borderWidth: 2,
                minHeight: 120,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                p: 3,
                textAlign: 'center',
                width: '100%',
              }}
            >
              <Typography
                level={
                  (feedback?.item || item).prompt.length > 40 ? 'h4' : 'h1'
                }
                sx={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {(feedback?.item || item).prompt}
              </Typography>
            </Sheet>
            {feedback ? (
              <Feedback feedback={feedback} onNext={next} />
            ) : (
              <Question
                key={item.key}
                item={item}
                onAnswer={answer}
                color={color}
              />
            )}
          </Stack>
        )
      )}
    </Container>
  )
}

export default LearnPlay
