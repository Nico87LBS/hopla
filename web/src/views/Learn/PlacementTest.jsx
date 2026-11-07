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
  currentStep,
  QUESTIONS_BY_CHAPTER,
  rightNeeded,
  startTest,
  testPlan,
  testResult,
} from '../../utils/learn/placement'
import { sayAgain } from '../../utils/learn/saying'
import { loadServerVoices } from '../../utils/learn/serverVoice'
import { canSpeak, speak } from '../../utils/learn/speech'
import { shortLevel } from '../../utils/learn/tree'
import LoadingComponent from '../components/Loading'
import { LearnIcon, subjectColor } from './LearnParts'
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

// The test of a level, or of one chapter: eight questions a chapter, all the
// chapters of the level, and seven right answers pass one. It earns no hops
// and moves no card: what it passed simply opens.

// StartLevels lets the person pick the level the test starts at; the levels
// before count as known.
const StartLevels = ({ levels, onPick, value }) => {
  const { t } = useTranslation('learn')
  if (levels.length < 2) return null
  return (
    <Stack gap={0.75}>
      <Typography
        id='test-start'
        level='body-sm'
        sx={{ color: 'text.secondary', fontWeight: 600 }}
      >
        {t('test.chooseLevel')}
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
    </Stack>
  )
}

StartLevels.propTypes = {
  levels: PropTypes.array.isRequired,
  onPick: PropTypes.func.isRequired,
  value: PropTypes.number.isRequired,
}

const Intro = ({ first, levels, onStart, pack }) => {
  const { t } = useTranslation('learn')
  const [start, setStart] = useState(first)
  return (
    <Sheet
      variant='outlined'
      sx={{ borderRadius: 'xl', display: 'grid', gap: 2, p: 2.5 }}
    >
      <Stack direction='row' gap={1.5} alignItems='center'>
        <LearnIcon entity={pack} size={44} />
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
  first: PropTypes.number,
  levels: PropTypes.array.isRequired,
  onStart: PropTypes.func.isRequired,
  pack: PropTypes.object.isRequired,
}

// ChaptersBar shows how far the test is: a segment by chapter.
const ChaptersBar = ({ state }) => (
  <Box
    sx={{
      display: 'grid',
      gap: 0.5,
      gridTemplateColumns: `repeat(${state.steps.length}, minmax(0, 1fr))`,
    }}
  >
    {state.steps.map((step, i) => (
      <Box
        key={`${step.module.id}/${step.chapter.id}`}
        sx={{
          bgcolor:
            i < state.index
              ? HOPLA.green
              : i === state.index
                ? HOPLA.violet
                : 'background.level3',
          borderRadius: 4,
          height: 8,
        }}
      />
    ))}
  </Box>
)

ChaptersBar.propTypes = { state: PropTypes.object.isRequired }

const Result = ({ busy, name, onDone, result }) => {
  const { t } = useTranslation('learn')
  const total = result.levels.reduce((n, l) => n + l.total, 0)
  const passed = result.opened.length
  return (
    <Stack gap={2}>
      <Typography level='h3' sx={{ textAlign: 'center' }}>
        {passed === 0
          ? t('test.nonePassed', { name })
          : passed === total
            ? t('test.allPassed', { name })
            : t('test.somePassed', { name })}
      </Typography>
      <Sheet
        variant='outlined'
        sx={{ borderRadius: 'xl', display: 'grid', gap: 1.25, p: 2 }}
      >
        {result.levels.map(level => (
          <Stack key={level.id} gap={0.75}>
            <Typography level='title-sm'>
              {t('test.passedOf', {
                level: level.name,
                count: level.passed,
                total: level.total,
              })}
            </Typography>
            {level.chapters.map(chapter => (
              <Stack
                key={chapter.key}
                direction='row'
                gap={1}
                alignItems='center'
              >
                <Box
                  sx={{
                    alignItems: 'center',
                    bgcolor: chapter.ok ? HOPLA.greenSoft : 'background.level2',
                    borderRadius: '50%',
                    color: chapter.ok ? HOPLA.greenText : 'text.tertiary',
                    display: 'flex',
                    flexShrink: 0,
                    height: 24,
                    justifyContent: 'center',
                    width: 24,
                  }}
                >
                  {chapter.ok ? (
                    <CheckRounded fontSize='small' />
                  ) : (
                    <CloseRounded fontSize='small' />
                  )}
                </Box>
                <Typography level='body-sm' sx={{ flex: 1, minWidth: 0 }}>
                  {chapter.name}
                </Typography>
                <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
                  {chapter.ok
                    ? t('test.chapterOpen')
                    : t('test.chapterToLearn')}
                </Typography>
              </Stack>
            ))}
          </Stack>
        ))}
      </Sheet>
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
  name: PropTypes.string,
  onDone: PropTypes.func.isRequired,
  result: PropTypes.object.isRequired,
}

// firstToTest is the first level with a chapter no test passed yet.
const firstToTest = (plan, placement) => {
  const opened = new Set(placement?.opened || [])
  const at = plan.findIndex(level =>
    level.chapters.some(
      step => !opened.has(`${step.module.id}/${step.chapter.id}`),
    ),
  )
  return Math.max(at, 0)
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
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    loadServerVoices()
  }, [])

  const send = async result => {
    const saved = await SendPlacement({
      userId,
      pack: packId,
      status: 'done',
      reached: result.reached || '',
      opened: result.opened,
      merge: true,
    })
    setSent(true)
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
    if (s.done) send(testResult(plan, s)).catch(() => {})
  }

  // The level or the chapter chosen on the page before skips the
  // introduction.
  const askedChapter = search.get('chapitre')
  const askedModule = search.get('module')
  const askedLevel = search.get('niveau') ?? search.get('depart')
  if (
    plan &&
    !state &&
    (askedChapter !== null || askedModule !== null || askedLevel !== null)
  ) {
    let scope = { level: Number(askedLevel) || 0 }
    if (askedChapter !== null) scope = { chapter: askedChapter }
    else if (askedModule !== null) scope = { module: askedModule }
    advance(startTest(plan, scope))
  }

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
      if (!sent) await send(result)
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

  // Once a question is answered: after the last one, the chapter is passed
  // with enough right answers.
  const next = (given = answers) => {
    if (given.length >= questions.length) {
      const right = given.filter(Boolean).length
      advance(
        answerChapter(plan, state, right >= rightNeeded(questions.length)),
      )
    } else setFeedback(null)
  }

  const level = step && plan[step.level]
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
              {plan.length > 1 && level ? `${level.name} › ` : ''}
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
          first={firstToTest(plan, test.placement)}
          levels={plan}
          onStart={start => advance(startTest(plan, { level: start }))}
        />
      )}

      {result && (
        <Result
          plan={plan}
          result={result}
          name={player.firstName}
          onDone={done}
          busy={busy}
        />
      )}

      {step && shown && (
        <Stack gap={2.5}>
          <Stack gap={1}>
            <ChaptersBar state={state} />
            <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
              {t('test.where', {
                chapter: state.index + 1,
                chapters: state.steps.length,
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
