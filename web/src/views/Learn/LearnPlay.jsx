import {
  BackspaceOutlined,
  CheckRounded,
  CloseRounded,
  CloudOffRounded,
  OutlinedFlagRounded,
  ReplayRounded,
  SportsEsportsRounded,
  VolumeUpRounded,
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
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router-dom'

import { HOPLA } from '../../constants/theme'
import { learnKeys, usePlayer } from '../../queries/LearnQueries'
import { SendLearnGame } from '../../utils/Fetcher'
import { capitalFor, isolated } from '../../utils/learn/display'
import {
  again,
  checkAnswer,
  expectedHops,
  MIN_ANSWERS,
  moduleLocked,
  pickQuestions,
  stars,
  totalLeft,
} from '../../utils/learn/engine'
import { consigneOf, partsOf, sayAgain, spoken } from '../../utils/learn/saying'
import { loadServerVoices, newQuestion } from '../../utils/learn/serverVoice'
import {
  canSpeak,
  prepareSpeech,
  speak,
  stopSpeaking,
  whenSilent,
} from '../../utils/learn/speech'
import { applyResult, playLocally, queueGame } from '../../utils/learn/store'
import { generateUUID } from '../../utils/UUID'
import LoadingComponent from '../components/Loading'
import { Stars, subjectColor, useCompiled } from './LearnParts'
import {
  BlankLabels,
  BlankSentence,
  hasBlank,
  SetClock,
  TraceGlyph,
} from './NewModes'
import {
  Clock,
  CountPicture,
  Draggable,
  DragToBox,
  Drawing,
  LabelView,
  MatchPairs,
  onHover,
  OrderLabels,
  Ruler,
  SortBoxes,
  useTwoTaps,
  ZonePicture,
} from './PlayModes'
import ReportSheet from './ReportSheet'

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

const Choices = ({ color, item, onAnswer, say }) => {
  // In a question to listen to, saying the answers would give them away:
  // the first touch only circles one.
  const [armed, touch] = useTwoTaps(say, onAnswer, !!item.listen)
  const asShown = capitalFor(item)
  const armedSx = choice =>
    armed === choice && { borderColor: color, bgcolor: `${color}1f` }
  // Drawings, for those who cannot read yet: big pictures, two by two
  // when there are four of them, so that none leaves a phone's screen.
  if (item.images) {
    const columns = item.choices.length === 4 ? 2 : item.choices.length
    return (
      <Box
        sx={{
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          width: '100%',
          maxWidth: columns === 2 ? 320 : undefined,
          mx: 'auto',
        }}
      >
        {item.choices.map(choice => (
          <Button
            key={choice}
            variant='outlined'
            color='neutral'
            aria-label={choice}
            onClick={() => touch(choice)}
            sx={{
              aspectRatio: '1',
              borderRadius: 'xl',
              borderWidth: 2,
              p: 1,
              ...armedSx(choice),
              ...onHover({ borderColor: color }),
            }}
          >
            {item.images[choice] ? (
              <Box sx={{ width: '100%', maxWidth: 110, aspectRatio: '1' }}>
                <Drawing id={item.images[choice]} size='100%' />
              </Box>
            ) : (
              choice
            )}
          </Button>
        ))}
      </Box>
    )
  }
  return (
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
          onClick={() => touch(choice)}
          sx={{
            borderRadius: 'lg',
            borderWidth: 2,
            fontSize: 18,
            justifyContent: 'center',
            minHeight: 56,
            whiteSpace: 'normal',
            ...armedSx(choice),
            ...onHover({ borderColor: color }),
          }}
        >
          {asShown(choice)}
        </Button>
      ))}
    </Box>
  )
}

Choices.propTypes = {
  color: PropTypes.string.isRequired,
  item: PropTypes.object.isRequired,
  onAnswer: PropTypes.func.isRequired,
  say: PropTypes.func,
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
        className='hopla-print'
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

export const Feedback = ({ feedback, onNext }) => {
  const { t } = useTranslation('learn')
  const { correct, given, item, typo } = feedback
  // The words said again once answered are heard to the end: « Next »
  // waits for them, a few seconds at most.
  const [ready, setReady] = useState(!feedback.reading)
  useEffect(
    () => (feedback.reading ? whenSilent(() => setReady(true)) : undefined),
    [feedback],
  )
  const readyRef = useRef(ready)
  useEffect(() => {
    readyRef.current = ready
  }, [ready])
  // When wrong: why the answer given is not right, the rules of the boxes
  // concerned, and the steps of a calculation.
  const helps = correct
    ? []
    : [
        item.whyNot?.[given] &&
          t('play.whyNot', { given, why: item.whyNot[given] }),
        ...(item.mode === 'sort'
          ? [given, item.answer]
              .filter(box => item.rules?.[box])
              .map(box => t('play.boxRule', { box, rule: item.rules[box] }))
          : []),
        item.whenWrong,
      ].filter(Boolean)
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
        if (readyRef.current) onNext()
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
      {!correct && item.mode === 'trace' && (
        <Typography level='body-md' sx={{ color: 'inherit', mt: 0.5 }}>
          {feedback.almost ? t('play.traceAlmost') : t('play.traceMore')}
        </Typography>
      )}
      {item.mode === 'setclock' && !correct && (
        <Stack alignItems='center' sx={{ mt: 1 }}>
          <Clock clock={item.target} size={140} />
        </Stack>
      )}
      {(!correct || typo) && item.mode !== 'trace' && (
        <Typography level='body-md' sx={{ color: 'inherit', mt: 0.5 }}>
          {t('play.answerWas', {
            answer: `${item.mode === 'choice' ? capitalFor(item)(item.answer) : item.answer}${item.unit ? ` ${item.unit}` : ''}`,
          })}
        </Typography>
      )}
      {item.mode === 'zone' && (
        <Box sx={{ mt: 1 }}>
          <ZonePicture
            id={item.zones}
            highlight={item.zone}
            color={HOPLA.green}
            maxHeight={180}
          />
        </Box>
      )}
      {item.listen && item.mode !== 'text' && (
        <Typography level='body-md' sx={{ color: 'inherit', mt: 0.5 }}>
          {t('play.heard', { word: item.listen })}
        </Typography>
      )}
      {helps.map(help => (
        <Typography
          key={help}
          level='body-sm'
          sx={{ color: 'inherit', mt: 0.5 }}
        >
          {help}
        </Typography>
      ))}
      {item.explanation && (
        <Typography level='body-sm' sx={{ color: 'inherit', mt: 0.5 }}>
          {item.explanation}
        </Typography>
      )}
      <Button
        onClick={onNext}
        disabled={!ready}
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

// writingClass shows the words of a module written in cursive: all of them,
// or only those of the question, to read them in cursive and answer in print.
export const writingClass = doc =>
  ({
    cursive: 'hopla-cursive',
    cursive_question: 'hopla-cursive-question',
  })[doc?.ecriture]

// readsBack tells whether a module says the answer again once given: by
// itself in the languages and the modules that teach reading, where hearing
// the word teaches its sound, not in the others, where it only repeats what
// was just heard. relire_reponse in the module decides otherwise.
export const readsBack = doc =>
  typeof doc?.relire_reponse === 'boolean'
    ? doc.relire_reponse
    : ['anglais', 'langues'].includes(doc?.matiere) ||
      doc?.lecture_voix_haute === 'consigne'

// readBack is what is said once a question of a reading module is answered:
// the words the child had to read, so that they hear them.
export const readBack = item => {
  if (item.subject?.text) return item.subject.text
  if (item.word) return item.word
  if (item.mode === 'order') return item.answer.split(' → ').join(' ')
  if (item.prompt === item.instruction) return item.answer
  // A hint in brackets at the end, « (aller, futur) », is not read back.
  const prompt = item.prompt.replace(/\s*\([^)]*\)\s*$/, '')
  return prompt.includes('___') ? prompt.replace('___', item.answer) : prompt
}

// Prompt is what a question asks: words to read, a drawing, a collection to
// count, a picture in zones, or words said aloud, said again with the
// speaker button. Without a voice on the device, the words are shown
// instead. Read aloud, the question is said as it opens. In a module that
// teaches reading, tell says only the instruction, written above it.
export const Prompt = ({
  blank,
  color,
  drag = false,
  item,
  next,
  repeat = true,
  say,
  tell,
  tellLang,
}) => {
  const { t } = useTranslation('learn')
  const voice = item.listen && canSpeak()
  const instruction = item.instruction !== item.prompt && item.instruction
  const telling = !say && tell && item.instruction
  useEffect(() => {
    newQuestion()
    if (voice) {
      // The instruction, a short silence, then the word to listen to.
      speak(
        partsOf(
          { ...item, instruction: telling && item.instruction },
          repeat,
          tellLang,
        ),
        item.lang,
      )
    } else if (say) {
      const parts = partsOf(item, repeat, tellLang)
      if (parts.length) say(parts)
    } else if (telling && repeat) tell(item.instruction)
    // The next question is made ready while this one is played.
    if (next && (say || tell)) {
      prepareSpeech(
        next.listen
          ? partsOf(
              { ...next, instruction: !say && next.instruction },
              true,
              tellLang,
            )
          : say
            ? spoken(next)
            : [next.instruction],
        tellLang,
      )
    }
    return stopSpeaking
    // Said once, as the question opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice, item.key, item.listen, item.lang])
  const said = instruction && (
    <Typography
      level='body-md'
      textColor='text.secondary'
      className='hopla-print'
    >
      {instruction}
    </Typography>
  )
  if (voice) {
    return (
      <Stack alignItems='center' gap={1.5}>
        {said}
        <IconButton
          variant='solid'
          aria-label={t('play.listen')}
          title={t('play.listen')}
          onClick={() => speak(item.listen, item.lang)}
          sx={{
            bgcolor: color,
            borderRadius: '50%',
            height: 96,
            width: 96,
            '&:hover': { bgcolor: color },
          }}
        >
          <VolumeUpRounded sx={{ fontSize: 56 }} />
        </IconButton>
      </Stack>
    )
  }
  return (
    <Stack alignItems='center' gap={1} sx={{ width: '100%' }}>
      {(say || telling) && (
        <IconButton
          variant='soft'
          aria-label={t('play.readAgain')}
          title={t('play.readAgain')}
          onClick={() => (say ? say(spoken(item)) : tell(item.instruction))}
          sx={{ alignSelf: 'flex-end', borderRadius: '50%', mb: -1 }}
        >
          <VolumeUpRounded />
        </IconButton>
      )}
      {said}
      {item.image && <Drawing id={item.image} />}
      {item.count && <CountPicture count={item.count} />}
      {item.clock && <Clock clock={item.clock} />}
      {item.ruler && <Ruler ruler={item.ruler} />}
      {item.zones && item.mode === 'choice' && (
        <ZonePicture
          id={item.zones}
          highlight={item.zone}
          color={HOPLA.carrot}
          maxHeight={300}
        />
      )}
      {blank ? (
        <BlankSentence
          sentence={item.prompt}
          color={color}
          fill={blank.fill}
          state={blank.state}
          onClear={blank.onClear}
        />
      ) : (
        <Typography
          // An instruction stays in print; the words to read follow the module.
          className={
            item.prompt === item.instruction ? 'hopla-print' : 'hopla-words'
          }
          // Two sizes, by what is asked and never by its length: a word or a
          // calculation alone, big; a sentence, the same for all.
          level={isolated(item) ? 'h1' : 'h4'}
          sx={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {item.prompt}
        </Typography>
      )}
      {item.word && (
        // The word whose sounds are asked, apart and big.
        <Typography
          className='hopla-words'
          level='h1'
          sx={{ color, fontSize: { xs: 44, sm: 56 }, lineHeight: 1.1 }}
        >
          {item.word}
        </Typography>
      )}
      {item.subject &&
        (drag ? (
          // To sort, the label can also be carried into its box.
          <Draggable id='subject' data={{ subject: true }}>
            <LabelView subject={item.subject} />
          </Draggable>
        ) : (
          <LabelView subject={item.subject} />
        ))}
    </Stack>
  )
}

Prompt.propTypes = {
  blank: PropTypes.object,
  color: PropTypes.string.isRequired,
  drag: PropTypes.bool,
  item: PropTypes.object.isRequired,
  next: PropTypes.object,
  repeat: PropTypes.bool,
  say: PropTypes.func,
  tell: PropTypes.func,
  tellLang: PropTypes.string,
}

export const Question = ({ blank, color, cursive, item, onAnswer, say }) => {
  switch (item.mode) {
    case 'choice':
      if (blank) {
        return (
          <BlankLabels
            item={item}
            color={color}
            fill={blank.fill}
            onFill={blank.onFill}
            onAnswer={onAnswer}
          />
        )
      }
      return <Choices item={item} onAnswer={onAnswer} color={color} say={say} />
    case 'setclock':
      return <SetClock onAnswer={onAnswer} color={color} />
    case 'trace':
      return (
        <TraceGlyph
          item={item}
          cursive={cursive}
          onAnswer={onAnswer}
          color={color}
        />
      )
    case 'sort':
      return (
        <SortBoxes item={item} onAnswer={onAnswer} color={color} say={say} />
      )
    case 'match':
      return (
        <MatchPairs item={item} onAnswer={onAnswer} color={color} say={say} />
      )
    case 'order':
      return (
        <OrderLabels item={item} onAnswer={onAnswer} color={color} say={say} />
      )
    case 'zone':
      return <ZonePicture id={item.zones} onTouch={onAnswer} color={color} />
    case 'text':
      return <TextAnswer onAnswer={onAnswer} color={color} />
    case 'flip':
      return <FlipCard item={item} onAnswer={onAnswer} color={color} />
    default:
      return <NumberPad onAnswer={onAnswer} color={color} unit={item.unit} />
  }
}

Question.propTypes = {
  blank: PropTypes.object,
  color: PropTypes.string.isRequired,
  cursive: PropTypes.bool,
  item: PropTypes.object.isRequired,
  onAnswer: PropTypes.func.isRequired,
  say: PropTypes.func,
}

// ── the end of a game ──

// RECRE_MIN_STARS is what a game needs to count for the récré, as on the
// server.
const RECRE_MIN_STARS = 2

const EndScreen = ({
  back,
  color,
  end,
  onReplay,
  recre,
  recrePath,
  retried,
}) => {
  const { t } = useTranslation('learn')
  const { capped, correct, hops, mistakes, stars: won, status, total } = end
  return (
    <Stack gap={2} alignItems='center' sx={{ textAlign: 'center', pt: 2 }}>
      <Stars count={won} size={56} />
      <Typography level='h2'>{t(`end.title${won}`)}</Typography>
      <Typography level='body-lg'>
        {t('end.score', { correct, total })}
      </Typography>
      {retried && (
        <Typography level='body-md' sx={{ color: 'text.secondary', mt: -1 }}>
          {t('end.retried', retried)}
        </Typography>
      )}
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
                {item.subject?.text || item.prompt}{' '}
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
      {recre?.on && recre.since >= recre.every && (
        <Button
          size='lg'
          component={Link}
          to={recrePath}
          replace
          startDecorator={<SportsEsportsRounded />}
          sx={{ bgcolor: HOPLA.green, '&:hover': { bgcolor: HOPLA.greenText } }}
        >
          {t('recre.ready')}
        </Button>
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
  recre: PropTypes.object,
  recrePath: PropTypes.string.isRequired,
  retried: PropTypes.shape({
    right: PropTypes.number,
    total: PropTypes.number,
  }),
}

// RetryStart tells that the questions missed come back once, before the end
// of the game.
const RetryStart = ({ color, count, onStart }) => {
  const { t } = useTranslation('learn')
  return (
    <Stack gap={2} alignItems='center' sx={{ textAlign: 'center', pt: 2 }}>
      <ReplayRounded sx={{ color, fontSize: 56 }} />
      <Typography level='h2'>{t('retry.title')}</Typography>
      <Typography level='body-lg'>{t('retry.text', { count })}</Typography>
      <Button
        size='lg'
        onClick={onStart}
        sx={{ bgcolor: color, '&:hover': { bgcolor: color } }}
      >
        {t('retry.go')}
      </Button>
    </Stack>
  )
}

RetryStart.propTypes = {
  color: PropTypes.string.isRequired,
  count: PropTypes.number.isRequired,
  onStart: PropTypes.func.isRequired,
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

// /learn/:userId/play/:moduleId: one game, question after question. On the
// family screen (playMode), it goes back to the play pages.
const LearnPlay = ({ playMode = false }) => {
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
  const [reporting, setReporting] = useState(false)
  // The word slid into the blank of a sentence, for the question it was
  // slid in.
  const [filled, setFilled] = useState({ key: null, value: null })
  // The questions of the game just played: playing again asks others first.
  const lastKeys = useRef(new Set())
  useEffect(() => {
    loadServerVoices()
  }, [])

  const start = useCallback(
    recent => {
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
          placed: module.placed,
          recent,
        }),
        answers: [],
        // play, then, when questions were missed, retryStart and retry:
        // they come back once. Only the first answers count.
        phase: 'play',
      })
      // Only a new game picks new questions, not a card moved by this one.
    },
    [compiled, module?.id],
  )

  useEffect(() => {
    if (!game && compiled && module) start()
  }, [game, compiled, module, start])

  const back = playMode ? '/play' : `/learn/${userId}`
  if (isLoading || (!game && compiled)) return <LoadingComponent />
  if (!module || !compiled || moduleLocked(compiled, byId, cards)) {
    return <Navigate to={back} replace />
  }

  const color = subjectColor(module.subject, module.document?.couleur)
  // Read aloud, in the modules made to be read aloud, as a parent chose for
  // this person: everything, only the instructions, or nothing.
  const doc = compiled.doc
  const personVoice = player.voice || (player.readAloud ? 'tout' : 'rien')
  const voice = personVoice !== 'rien' && canSpeak() && doc.lecture_voix_haute
  const tell = voice
    ? (text, options) => speak(text, doc.langue || 'fr', options)
    : undefined
  // In a module that teaches reading, a question with an instruction has
  // only it said: its words and its choices would give the answer away.
  // A person who reads alone may hear only the instructions everywhere.
  const sayFor = shown =>
    personVoice === 'consigne' || (voice === 'consigne' && shown?.instruction)
      ? undefined
      : tell
  const index = game.answers.length
  const item = game.questions[index]
  const say = sayFor(item)
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
    // The cards moved by this game count at once, even before the server
    // answers, so that playing again starts from them.
    const played = playLocally(player, sent, hops)
    lastKeys.current = new Set(game.questions.map(q => q.key))
    // A game played well brings the récré one game nearer at once.
    const recre = played.recre &&
      stars(correct, total, settings.seuil) >= RECRE_MIN_STARS && {
        ...played.recre,
        since: played.recre.since + 1,
      }
    queryClient.setQueryData(learnKeys.player(userId), kept =>
      kept
        ? { ...played, ...(recre && { recre }), offline: kept.offline }
        : kept,
    )
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
    // Once answered, the words are said again where hearing them teaches
    // something: an English word, a word the child had to read.
    let reading = false
    if (readsBack(doc)) {
      if (item.said) reading = speak(item.said.listen, item.said.lang)
      else if (tell && !say && item.instruction && !item.listen)
        reading = tell(readBack(item))
    }
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
      if (answers.length === game.questions.length) roundOver(answers)
      return
    }
    setFeedback({ ...check, given: String(given), item, reading })
  }

  // roundOver ends the game at its last answer: the first answers are sent,
  // then the questions missed come back once.
  const roundOver = answers => {
    if (game.phase !== 'play') {
      setGame(now => ({ ...now, answers, phase: 'done' }))
      return
    }
    finish(answers)
    const missed = game.questions.filter((q, i) => !answers[i]?.correct)
    if (missed.length) {
      setGame(now => ({
        ...now,
        phase: 'retryStart',
        questions: again(missed),
        answers: [],
      }))
    }
  }

  const next = () => {
    setFeedback(null)
    if (game.answers.length === game.questions.length) roundOver(game.answers)
  }

  const retrying = game.phase === 'retryStart' || game.phase === 'retry'
  const retried = game.phase === 'done' && {
    right: game.answers.filter(a => a.correct).length,
    total: game.answers.length,
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
          {(!end || game.phase === 'retry') && (feedback?.item || item) && (
            <IconButton
              variant='plain'
              color='neutral'
              aria-label={t('report.title')}
              title={t('report.title')}
              onClick={() => setReporting(true)}
            >
              <OutlinedFlagRounded />
            </IconButton>
          )}
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
                        ? // A neutral dark, never mistaken for an answer:
                          // some modules are orange, like the wrong ones.
                          'text.secondary'
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

      {game.phase === 'retryStart' ? (
        <RetryStart
          color={color}
          count={game.questions.length}
          onStart={() => setGame(now => ({ ...now, phase: 'retry' }))}
        />
      ) : end && !retrying ? (
        <EndScreen
          end={end}
          retried={retried || undefined}
          onReplay={() => start(lastKeys.current)}
          back={back}
          recre={player.recre}
          recrePath={
            playMode ? `/play/${userId}/recre` : `/learn/${userId}/recre`
          }
          color={color}
        />
      ) : (
        (item || feedback) && (
          <DragToBox onDrop={box => !feedback && answer(box)}>
            <Stack gap={3} alignItems='center' className={writingClass(doc)}>
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
                <Prompt
                  blank={blank}
                  item={shown}
                  next={game.questions[game.questions.indexOf(shown) + 1]}
                  repeat={sayAgain(
                    game.questions,
                    game.answers,
                    game.questions.indexOf(shown),
                  )}
                  color={color}
                  drag={!feedback && shown.mode === 'sort'}
                  say={sayFor(shown)}
                  tell={tell}
                  tellLang={doc.langue || 'fr'}
                />
              </Sheet>
              {feedback ? (
                <Feedback feedback={feedback} onNext={next} />
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
                    say={say}
                  />
                </Stack>
              )}
            </Stack>
          </DragToBox>
        )
      )}
      {reporting && (feedback?.item || item) && (
        <ReportSheet
          item={feedback?.item || item}
          given={feedback ? game.answers.at(-1)?.given : ''}
          moduleId={moduleId}
          userId={userId}
          onClose={() => setReporting(false)}
        />
      )}
    </Container>
  )
}

LearnPlay.propTypes = { playMode: PropTypes.bool }

export default LearnPlay
