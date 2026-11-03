import {
  CheckRounded,
  CloseRounded,
  FactCheckOutlined,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Container,
  IconButton,
  Radio,
  RadioGroup,
  Sheet,
  Stack,
  Typography,
} from '@mui/joy'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import PropTypes from 'prop-types'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { HOPLA } from '../../constants/theme'
import { learnKeys, usePlayer } from '../../queries/LearnQueries'
import { GetPlacementTest, SendPlacement } from '../../utils/Fetcher'
import { chapterQuestions, checkAnswer } from '../../utils/learn/engine'
import {
  answerChapter,
  beginTest,
  currentStep,
  QUESTIONS_BY_CHAPTER,
  testPlan,
  testResult,
} from '../../utils/learn/placement'
import { sayAgain } from '../../utils/learn/saying'
import { loadServerVoices } from '../../utils/learn/serverVoice'
import { canSpeak, speak } from '../../utils/learn/speech'
import { shortLevel } from '../../utils/learn/tree'
import LoadingComponent from '../components/Loading'
import { subjectColor } from './LearnParts'
import {
  Feedback,
  Prompt,
  Question,
  readBack,
  readsBack,
  writingClass,
} from './LearnPlay'
import { hasBlank } from './NewModes'
import { DragToBox } from './PlayModes'

// The placement test of a pack: two questions a chapter, in order, level
// after level, until the first chapter missed. It earns no hops and moves
// no card: what it passed simply opens.

// StartLevels lets the person pick the level the test starts at; the levels
// before count as known.
export const StartLevels = ({ levels, onPick, value }) => {
  const { t } = useTranslation('learn')
  if (levels.length < 2) return null
  return (
    <Stack gap={0.75}>
      <Typography
        id='test-start'
        level='body-sm'
        sx={{ color: 'text.secondary', fontWeight: 600 }}
      >
        {t('test.startAt')}
      </Typography>
      <Box
        role='radiogroup'
        aria-labelledby='test-start'
        sx={{
          display: 'grid',
          gap: 1,
          gridTemplateColumns: `repeat(${Math.min(levels.length, 4)}, minmax(0, 1fr))`,
        }}
      >
        {levels.map((level, i) => (
          <Button
            key={level.id}
            role='radio'
            aria-checked={i === value}
            variant={i === value ? 'soft' : 'outlined'}
            color={i === value ? 'primary' : 'neutral'}
            onClick={() => onPick(i)}
            sx={{
              minHeight: 44,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              ...(i === value && { outline: `2px solid ${HOPLA.violet}` }),
            }}
          >
            {shortLevel(level, levels)}
          </Button>
        ))}
      </Box>
      <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
        {t('test.belowKnown')}
      </Typography>
    </Stack>
  )
}

StartLevels.propTypes = {
  levels: PropTypes.array.isRequired,
  onPick: PropTypes.func.isRequired,
  value: PropTypes.number.isRequired,
}

const Intro = ({ levels, onStart, pack }) => {
  const { t } = useTranslation('learn')
  const [start, setStart] = useState(0)
  return (
    <Sheet
      variant='outlined'
      sx={{ borderRadius: 'xl', display: 'grid', gap: 2, p: 2.5 }}
    >
      <Stack direction='row' gap={1.5} alignItems='center'>
        <FactCheckOutlined sx={{ color: HOPLA.violet, fontSize: 32 }} />
        <Typography level='title-lg'>{pack.name}</Typography>
      </Stack>
      <Typography level='body-md'>{t('test.offer')}</Typography>
      <StartLevels levels={levels} value={start} onPick={setStart} />
      <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
        {t('test.rules')}
      </Typography>
      <Button size='lg' onClick={() => onStart(start)}>
        {t('test.start')}
      </Button>
    </Sheet>
  )
}

Intro.propTypes = {
  levels: PropTypes.array.isRequired,
  onStart: PropTypes.func.isRequired,
  pack: PropTypes.object.isRequired,
}

const LevelBar = ({ plan, state }) => {
  const { t } = useTranslation('learn')
  if (plan.length < 2) return null
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 0.75,
        gridTemplateColumns: `repeat(${plan.length}, minmax(0, 1fr))`,
      }}
    >
      {plan.map((level, i) => {
        const known = i < state.level
        const here = i === state.level
        return (
          <Stack key={level.id} gap={0.5} sx={{ minWidth: 0 }}>
            <Box
              sx={{
                bgcolor: known
                  ? HOPLA.green
                  : here
                    ? HOPLA.violet
                    : 'background.level3',
                borderRadius: 4,
                height: 8,
              }}
            />
            <Typography
              level='body-xs'
              noWrap
              sx={{
                color: here ? HOPLA.blueberry : 'text.secondary',
                fontWeight: 600,
              }}
            >
              {known
                ? t('test.levelDone', { level: shortLevel(level, plan) })
                : shortLevel(level, plan)}
            </Typography>
          </Stack>
        )
      })}
    </Box>
  )
}

LevelBar.propTypes = {
  plan: PropTypes.array.isRequired,
  state: PropTypes.object.isRequired,
}

const Result = ({ busy, keep, name, onDone, onKeep, plan, result }) => {
  const { t } = useTranslation('learn')
  const at = plan.findIndex(level => level.id === result.reached)
  const reached = plan[at]
  const short = shortLevel(reached, plan)
  const below = plan.slice(0, at).map(level => shortLevel(level, plan))
  return (
    <Stack gap={2}>
      <Typography level='h3' sx={{ textAlign: 'center' }}>
        {result.opened.length === 0
          ? t('test.fromStart', { name })
          : plan.length > 1
            ? t('test.startsAt', { name, level: reached.name })
            : t('test.noted', { name })}
      </Typography>
      <Sheet
        variant='outlined'
        sx={{ borderRadius: 'xl', display: 'grid', gap: 1.25, p: 2 }}
      >
        {result.levels.map((level, i) => (
          <Stack
            key={level.id}
            direction='row'
            gap={1.25}
            alignItems='center'
            sx={{ opacity: level.tested ? 1 : 0.6 }}
          >
            <Box
              sx={{
                alignItems: 'center',
                bgcolor:
                  level.tested && level.opened === level.total
                    ? HOPLA.greenSoft
                    : level.tested
                      ? HOPLA.violetSoft
                      : 'background.level2',
                borderRadius: '50%',
                color:
                  level.tested && level.opened === level.total
                    ? HOPLA.greenText
                    : HOPLA.blueberry,
                display: 'flex',
                flexShrink: 0,
                fontWeight: 700,
                height: 28,
                justifyContent: 'center',
                width: 28,
              }}
            >
              {level.tested && level.opened === level.total ? (
                <CheckRounded fontSize='small' />
              ) : level.tested ? (
                level.opened
              ) : (
                '–'
              )}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography level='title-sm'>{plan[i].name}</Typography>
              <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
                {!level.tested
                  ? t('test.notTested')
                  : level.next && i === at
                    ? t('test.openedFrom', {
                        count: level.opened,
                        total: level.total,
                        next: level.next,
                      })
                    : t('test.opened', {
                        count: level.opened,
                        total: level.total,
                      })}
              </Typography>
            </Box>
          </Stack>
        ))}
      </Sheet>
      {at > 0 && (
        <Sheet
          variant='outlined'
          sx={{ borderRadius: 'xl', display: 'grid', gap: 1.25, p: 2 }}
        >
          <Typography id='test-keep' level='title-md'>
            {t('test.keepTitle')}
          </Typography>
          <RadioGroup
            aria-labelledby='test-keep'
            value={keep}
            onChange={e => onKeep(e.target.value)}
            sx={{ gap: 1 }}
          >
            {[
              {
                value: '',
                label: t('test.keepUpTo', { level: short }),
                help: t('test.keepUpToHelp', {
                  levels: [...below, short].join(', '),
                }),
              },
              {
                value: 'only',
                label: t('test.keepOnly', { level: short }),
                help: t('test.keepOnlyHelp', { levels: below.join(', ') }),
              },
            ].map(option => (
              <Sheet
                key={option.value || 'all'}
                variant={keep === option.value ? 'soft' : 'outlined'}
                color={keep === option.value ? 'primary' : 'neutral'}
                sx={{ borderRadius: 'lg', p: 1.5 }}
              >
                <Radio
                  value={option.value}
                  overlay
                  label={
                    <Box component='span' sx={{ display: 'block' }}>
                      <Typography
                        component='span'
                        level='title-sm'
                        sx={{ display: 'block' }}
                      >
                        {option.label}
                      </Typography>
                      <Typography
                        component='span'
                        level='body-xs'
                        sx={{ color: 'text.secondary', display: 'block' }}
                      >
                        {option.help}
                      </Typography>
                    </Box>
                  }
                />
              </Sheet>
            ))}
          </RadioGroup>
          <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
            {t('test.keepLater')}
          </Typography>
        </Sheet>
      )}
      <Typography
        level='body-sm'
        sx={{ color: 'text.secondary', textAlign: 'center' }}
      >
        {t('test.noHops')}
      </Typography>
      <Button size='lg' loading={busy} onClick={onDone}>
        {t('test.go')}
      </Button>
    </Stack>
  )
}

Result.propTypes = {
  busy: PropTypes.bool,
  keep: PropTypes.string.isRequired,
  name: PropTypes.string,
  onDone: PropTypes.func.isRequired,
  onKeep: PropTypes.func.isRequired,
  plan: PropTypes.array.isRequired,
  result: PropTypes.object.isRequired,
}

const PlacementTest = ({ playMode = false }) => {
  const { t } = useTranslation('learn')
  const { packId, userId: param } = useParams()
  const userId = Number(param)
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const back = playMode ? '/play' : `/learn/${userId}`
  const { data: player } = usePlayer(userId)
  const { data: test, error } = useQuery({
    queryKey: ['learn', 'test', userId, packId],
    queryFn: () => GetPlacementTest(userId, packId),
    staleTime: Infinity,
  })
  const plan = useMemo(
    () =>
      test && player ? testPlan(test, { firstName: player.firstName }) : null,
    [test, player],
  )
  const [state, setState] = useState(null)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState([])
  const [feedback, setFeedback] = useState(null)
  const [filled, setFilled] = useState({ key: null, value: null })
  // null keeps what the last test chose.
  const [chosen, setChosen] = useState(null)
  const [sent, setSent] = useState(null)
  const [busy, setBusy] = useState(false)
  const keep = chosen ?? test?.placement?.keep ?? ''

  useEffect(() => {
    loadServerVoices()
  }, [])

  const send = async (result, keepNow) => {
    const saved = await SendPlacement({
      userId,
      pack: packId,
      status: 'done',
      reached: result.reached,
      opened: result.opened,
      keep: keepNow,
    })
    setSent(saved)
    return saved
  }

  // advance goes to a chapter and draws its questions; a chapter with none
  // passes at once. The result counts as soon as the test ends, even if
  // nobody presses on.
  const advance = next => {
    let s = next
    let drawn = []
    for (let guard = 0; guard < 1000; guard++) {
      const step = currentStep(plan, s)
      if (!step) break
      drawn = chapterQuestions(step.chapter, QUESTIONS_BY_CHAPTER)
      if (drawn.length) break
      s = answerChapter(plan, s, true)
    }
    setState(s)
    setQuestions(drawn)
    setAnswers([])
    setFeedback(null)
    if (s.done) send(testResult(plan, s), keep).catch(() => {})
  }

  // The start chosen on the home page skips the introduction.
  const asked = search.get('depart')
  if (plan && !state && asked !== null)
    advance(beginTest(plan, Number(asked) || 0))

  const step = plan && state ? currentStep(plan, state) : null
  const result = plan && state?.done ? testResult(plan, state) : null

  if (error) {
    return (
      <Container maxWidth='sm' sx={{ px: 2, py: 4 }}>
        <Typography color='danger'>{t('test.error')}</Typography>
        <Button component={Link} to={back} sx={{ mt: 2 }}>
          {t('test.back')}
        </Button>
      </Container>
    )
  }
  if (!plan) return <LoadingComponent />

  const done = async () => {
    setBusy(true)
    try {
      if (!sent || (sent.keep || '') !== keep) await send(result, keep)
    } catch {
      // The test stays to do again: nothing opened.
    }
    queryClient.invalidateQueries({ queryKey: learnKeys.player(userId) })
    queryClient.invalidateQueries({ queryKey: learnKeys.modules })
    navigate(back, { replace: true })
  }

  const doc = step?.module.doc
  const color = subjectColor(test.pack.subject, doc?.couleur)
  const personVoice = player.voice || (player.readAloud ? 'tout' : 'rien')
  const voice =
    doc && personVoice !== 'rien' && canSpeak() && doc.lecture_voix_haute
  const tell = voice
    ? (text, options) => speak(text, doc.langue || 'fr', options)
    : undefined
  const sayFor = shown =>
    personVoice === 'consigne' || (voice === 'consigne' && shown?.instruction)
      ? undefined
      : tell
  const item = questions[answers.length]
  const shown = feedback?.item || item
  const blank =
    shown && hasBlank(shown)
      ? {
          fill: feedback
            ? shown.answer
            : filled.key === shown.key
              ? filled.value
              : null,
          state: feedback ? 'right' : null,
          onClear: () => setFilled({ key: null, value: null }),
          onFill: value => setFilled({ key: shown.key, value }),
        }
      : undefined

  const answer = given => {
    const check = checkAnswer(item, given)
    let reading = false
    if (readsBack(doc)) {
      if (item.said) reading = speak(item.said.listen, item.said.lang)
      else if (tell && !sayFor(item) && item.instruction && !item.listen)
        reading = tell(readBack(item))
    }
    const now = [...answers, check.correct]
    setAnswers(now)
    // A card turned over has no answer to show: the test goes on at once.
    if (item.mode === 'flip') next(now)
    else setFeedback({ ...check, given: String(given), item, reading })
  }

  // Once a question is answered: a miss ends the chapter, the last right
  // answer passes it.
  const next = (given = answers) => {
    const missed = given.includes(false)
    if (missed || given.length >= questions.length) {
      advance(answerChapter(plan, state, !missed))
    } else setFeedback(null)
  }

  const level = state && plan[state.level]
  return (
    <Container
      maxWidth='sm'
      sx={{ px: { xs: 2, sm: 3 }, pb: 6, pt: { xs: 1, sm: 2 } }}
    >
      <Stack direction='row' alignItems='center' gap={1} sx={{ mb: 2 }}>
        <IconButton
          component={Link}
          to={back}
          replace
          aria-label={t('test.quit')}
          variant='plain'
        >
          <CloseRounded />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            level='body-xs'
            sx={{ color: 'text.secondary', fontWeight: 600 }}
          >
            {t('test.title', { pack: test.pack.name })}
          </Typography>
          {step && (
            <Typography level='title-md' noWrap>
              {plan.length > 1 ? `${level.name} › ` : ''}
              {step.chapter.name}
            </Typography>
          )}
        </Box>
        <Typography
          level='body-xs'
          sx={{
            bgcolor: 'background.level1',
            borderRadius: 'md',
            fontWeight: 600,
            px: 1,
            py: 0.5,
          }}
        >
          {t('test.withoutHops')}
        </Typography>
      </Stack>

      {!state && (
        <Intro
          pack={test.pack}
          levels={plan}
          onStart={start => advance(beginTest(plan, start))}
        />
      )}

      {result && (
        <Result
          plan={plan}
          result={result}
          name={player.firstName}
          keep={keep}
          onKeep={setChosen}
          onDone={done}
          busy={busy}
        />
      )}

      {step && shown && (
        <Stack gap={2.5}>
          <Stack gap={1}>
            <LevelBar plan={plan} state={state} />
            <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
              {t('test.where', {
                chapter: state.index + 1,
                chapters: level.chapters.length,
                question: Math.min(
                  answers.length + (feedback ? 0 : 1),
                  questions.length,
                ),
                questions: questions.length,
              })}
            </Typography>
          </Stack>
          <DragToBox onDrop={box => !feedback && answer(box)}>
            <Stack gap={3} alignItems='center' className={writingClass(doc)}>
              <Sheet
                variant='outlined'
                sx={{
                  alignItems: 'center',
                  borderColor: color,
                  borderRadius: 'xl',
                  borderWidth: 2,
                  display: 'flex',
                  justifyContent: 'center',
                  minHeight: 120,
                  p: 3,
                  textAlign: 'center',
                  width: '100%',
                }}
              >
                <Prompt
                  blank={blank}
                  item={shown}
                  next={questions[questions.indexOf(shown) + 1]}
                  repeat={sayAgain(
                    questions,
                    answers.map(correct => ({ correct })),
                    questions.indexOf(shown),
                  )}
                  color={color}
                  drag={!feedback && shown.mode === 'sort'}
                  say={sayFor(shown)}
                  tell={tell}
                  tellLang={doc.langue || 'fr'}
                />
              </Sheet>
              {feedback ? (
                <Feedback feedback={feedback} onNext={() => next()} />
              ) : (
                <Stack
                  className='hopla-answers'
                  alignItems='center'
                  sx={{ width: '100%' }}
                >
                  <Question
                    key={item.key}
                    blank={blank}
                    cursive={doc.ecriture === 'cursive'}
                    item={item}
                    onAnswer={answer}
                    color={color}
                    say={sayFor(item)}
                  />
                </Stack>
              )}
            </Stack>
          </DragToBox>
          <Typography
            level='body-xs'
            sx={{ color: 'text.secondary', textAlign: 'center' }}
          >
            {t('test.howItWorks')}
          </Typography>
        </Stack>
      )}
    </Container>
  )
}

PlacementTest.propTypes = { playMode: PropTypes.bool }

export default PlacementTest
