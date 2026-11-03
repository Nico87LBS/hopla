// The ways to answer by moving something: the hands of a clock to set, a
// letter to trace with a finger, and a word to slide into a sentence.

import { CheckRounded, ReplayRounded } from '@mui/icons-material'
import { Box, Button, Stack, Typography } from '@mui/joy'
import PropTypes from 'prop-types'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { HOPLA } from '../../constants/theme'
import { Clock, onHover } from './PlayModes'

// ── setting a clock ──

export const clockAnswer = (h, m) => (m ? `${h} h ${m}` : `${h} h`)

// SetClock: the child drags the hands to the time asked. The long hand stops
// every five minutes, the short one on the hour, drawn where it really is
// (halfway to the next hour at half past).
export const SetClock = ({ color, onAnswer }) => {
  const { t } = useTranslation('learn')
  const box = useRef(null)
  const [time, setTime] = useState({ h: 12, m: 0 })
  const [moved, setMoved] = useState(false)
  const dragging = useRef(null)

  const turnsAt = event => {
    const rect = box.current.getBoundingClientRect()
    const x = event.clientX - rect.left - rect.width / 2
    const y = event.clientY - rect.top - rect.height / 2
    return {
      r: Math.hypot(x, y) / (rect.width / 2),
      turns: (Math.atan2(x, -y) / (2 * Math.PI) + 1) % 1,
    }
  }

  const move = (event, hand) => {
    const { turns } = turnsAt(event)
    setMoved(true)
    setTime(now => {
      if (hand === 'm') {
        const m = (Math.round(turns * 12) % 12) * 5
        return { ...now, m }
      }
      // The short hand read back to its hour, as the minutes push it on.
      const h = ((Math.round(turns * 12 - now.m / 60) % 12) + 12) % 12 || 12
      return { ...now, h }
    })
  }

  const down = event => {
    const { r, turns } = turnsAt(event)
    // The hand nearest to the finger moves; near the centre, the short one.
    const mTurns = time.m / 60
    const hTurns = ((time.h % 12) + time.m / 60) / 12
    const gap = a => Math.min(Math.abs(turns - a), 1 - Math.abs(turns - a))
    const close = Math.abs(gap(mTurns) - gap(hTurns)) < 0.04
    if (close) dragging.current = r > 0.5 ? 'm' : 'h'
    else dragging.current = gap(mTurns) < gap(hTurns) ? 'm' : 'h'
    event.currentTarget.setPointerCapture?.(event.pointerId)
    move(event, dragging.current)
  }

  return (
    <Stack alignItems='center' gap={1.5}>
      <Box
        ref={box}
        onPointerDown={down}
        onPointerMove={event =>
          dragging.current && move(event, dragging.current)
        }
        onPointerUp={() => (dragging.current = null)}
        onPointerCancel={() => (dragging.current = null)}
        role='slider'
        aria-label={t('play.setClock')}
        aria-valuetext={clockAnswer(time.h, time.m)}
        sx={{ cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}
      >
        <Clock clock={time} size={240} />
      </Box>
      <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
        {t('play.setClockHelp')}
      </Typography>
      <Button
        size='lg'
        disabled={!moved}
        startDecorator={<CheckRounded />}
        onClick={() => onAnswer(clockAnswer(time.h, time.m))}
        sx={{ bgcolor: color, '&:hover': { bgcolor: color } }}
      >
        {t('play.check')}
      </Button>
    </Stack>
  )
}

SetClock.propTypes = {
  color: PropTypes.string.isRequired,
  onAnswer: PropTypes.func.isRequired,
}

// ── tracing ──

const TRACE_SIZE = 280
const CELL = 4
const PEN = 22

const fontOf = cursive =>
  cursive ? '"Playwrite FR Moderne", cursive' : 'Fredoka, sans-serif'

// glyphMask draws the letters on a hidden canvas and keeps, cell by cell,
// where they have ink.
const glyphMask = (text, font, size) => {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const fontSize = fitFont(ctx, text, font, size)
  ctx.font = `600 ${fontSize}px ${font}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, size / 2, size / 2)
  const data = ctx.getImageData(0, 0, size, size).data
  const cells = new Set()
  for (let y = 0; y < size; y += CELL)
    for (let x = 0; x < size; x += CELL)
      if (data[(y * size + x) * 4 + 3] > 100)
        cells.add(`${x / CELL},${y / CELL}`)
  return { cells, fontSize }
}

// fitFont is the biggest size that keeps the letters inside the square.
const fitFont = (ctx, text, font, size) => {
  let fontSize = size * 0.78
  ctx.font = `600 ${fontSize}px ${font}`
  const width = ctx.measureText(text).width
  if (width > size * 0.86) fontSize *= (size * 0.86) / width
  return Math.floor(fontSize)
}

// scoreTrace compares the cells inked by the finger with those of the
// letters: how much of the letters is covered, and how much of the tracing
// stays near them.
export const scoreTrace = (glyph, traced) => {
  if (!glyph.size || !traced.size) return { covered: 0, inside: 0 }
  let covered = 0
  for (const cell of glyph) if (traced.has(cell)) covered++
  const reach = Math.ceil(PEN / CELL)
  let inside = 0
  for (const cell of traced) {
    const [x, y] = cell.split(',').map(Number)
    let near = false
    for (let dy = -reach; dy <= reach && !near; dy++)
      for (let dx = -reach; dx <= reach && !near; dx++)
        if (glyph.has(`${x + dx},${y + dy}`)) near = true
    if (near) inside++
  }
  return { covered: covered / glyph.size, inside: inside / traced.size }
}

// traceGrade turns a score into the answer of the card: right, almost or
// not yet.
export const traceGrade = ({ covered, inside }) =>
  covered >= 0.72 && inside >= 0.8
    ? 'oui'
    : covered >= 0.5 && inside >= 0.65
      ? 'presque'
      : 'non'

// TraceGlyph: the letters to trace are drawn pale, the finger draws over
// them; « J'ai fini » grades how much of them it covered without going
// astray. The order of the strokes is not checked.
export const TraceGlyph = ({ color, cursive, item, onAnswer }) => {
  const { t } = useTranslation('learn')
  const canvas = useRef(null)
  const glyph = useRef(null)
  const traced = useRef(new Set())
  const last = useRef(null)
  const [ready, setReady] = useState(false)
  const [inked, setInked] = useState(false)
  const font = fontOf(cursive)

  const paintGuide = () => {
    const ctx = canvas.current.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, TRACE_SIZE, TRACE_SIZE)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, TRACE_SIZE, TRACE_SIZE)
    // School lines, to place the letters.
    ctx.strokeStyle = HOPLA.violetSoft
    ctx.lineWidth = 1
    for (const y of [0.3, 0.5, 0.7]) {
      ctx.beginPath()
      ctx.moveTo(0, TRACE_SIZE * y)
      ctx.lineTo(TRACE_SIZE, TRACE_SIZE * y)
      ctx.stroke()
    }
    ctx.font = `600 ${glyph.current.fontSize}px ${font}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#E4E0FA'
    ctx.fillText(item.answer, TRACE_SIZE / 2, TRACE_SIZE / 2)
    ctx.setLineDash([4, 5])
    ctx.strokeStyle = '#B7AEF3'
    ctx.lineWidth = 1.5
    ctx.strokeText(item.answer, TRACE_SIZE / 2, TRACE_SIZE / 2)
    ctx.setLineDash([])
  }

  useEffect(() => {
    let alive = true
    const start = async () => {
      // The cursive comes from a font the page may not have loaded yet.
      await document.fonts?.load(`600 100px ${font}`).catch(() => {})
      if (!alive) return
      const dpr = window.devicePixelRatio || 1
      canvas.current.width = TRACE_SIZE * dpr
      canvas.current.height = TRACE_SIZE * dpr
      glyph.current = glyphMask(item.answer, font, TRACE_SIZE)
      traced.current = new Set()
      paintGuide()
      setInked(false)
      setReady(true)
    }
    start()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.key, font])

  const at = event => {
    const rect = canvas.current.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * TRACE_SIZE) / rect.width,
      y: ((event.clientY - rect.top) * TRACE_SIZE) / rect.height,
    }
  }

  const ink = (from, to) => {
    const ctx = canvas.current.getContext('2d')
    ctx.strokeStyle = color
    ctx.lineWidth = PEN * 0.7
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    // The cells under the pen, along the segment.
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / CELL),
    )
    const r = Math.floor(PEN / 2 / CELL)
    for (let i = 0; i <= steps; i++) {
      const x = Math.floor((from.x + ((to.x - from.x) * i) / steps) / CELL)
      const y = Math.floor((from.y + ((to.y - from.y) * i) / steps) / CELL)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (dx * dx + dy * dy <= r * r)
            traced.current.add(`${x + dx},${y + dy}`)
    }
    setInked(true)
  }

  const clear = () => {
    traced.current = new Set()
    paintGuide()
    setInked(false)
  }

  return (
    <Stack alignItems='center' gap={1.5}>
      <Box
        component='canvas'
        ref={canvas}
        aria-label={item.prompt}
        onPointerDown={event => {
          if (!ready) return
          event.currentTarget.setPointerCapture?.(event.pointerId)
          last.current = at(event)
          ink(last.current, last.current)
        }}
        onPointerMove={event => {
          if (!last.current) return
          const point = at(event)
          ink(last.current, point)
          last.current = point
        }}
        onPointerUp={() => (last.current = null)}
        onPointerCancel={() => (last.current = null)}
        sx={{
          border: '2px solid',
          borderColor: color,
          borderRadius: 'xl',
          display: 'block',
          height: TRACE_SIZE,
          maxWidth: '100%',
          touchAction: 'none',
          width: TRACE_SIZE,
        }}
      />
      <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
        {t('play.traceHelp')}
      </Typography>
      <Stack direction='row' gap={1}>
        <Button
          variant='soft'
          color='neutral'
          startDecorator={<ReplayRounded />}
          disabled={!inked}
          onClick={clear}
        >
          {t('play.traceAgain')}
        </Button>
        <Button
          size='lg'
          disabled={!inked}
          startDecorator={<CheckRounded />}
          onClick={() =>
            onAnswer(
              traceGrade(scoreTrace(glyph.current.cells, traced.current)),
            )
          }
          sx={{ bgcolor: color, '&:hover': { bgcolor: color } }}
        >
          {t('play.traceDone')}
        </Button>
      </Stack>
    </Stack>
  )
}

TraceGlyph.propTypes = {
  color: PropTypes.string.isRequired,
  cursive: PropTypes.bool,
  item: PropTypes.object.isRequired,
  onAnswer: PropTypes.func.isRequired,
}

// ── a word to slide into a sentence ──

export const BLANK = /_{3,}/

// hasBlank tells a question with one blank to fill, played by sliding the
// word into it rather than picking it below.
export const hasBlank = item =>
  item.mode === 'choice' &&
  !item.image &&
  !item.zones &&
  typeof item.prompt === 'string' &&
  item.prompt.split(BLANK).length === 2

// BlankSentence shows the sentence with its blank, empty, holding the word
// slid in, or, once answered, the right word.
export const BlankSentence = ({ color, fill, onClear, sentence, state }) => {
  const [before, after] = sentence.split(BLANK)
  return (
    <Typography level='h4' className='hopla-words' sx={{ lineHeight: 2 }}>
      {before}
      <Box
        component='span'
        data-hopla-blank
        onClick={fill && !state ? onClear : undefined}
        sx={{
          border: '2px dashed',
          borderColor:
            state === 'right'
              ? HOPLA.green
              : fill
                ? color
                : 'neutral.outlinedBorder',
          borderRadius: 'md',
          borderStyle: fill ? 'solid' : 'dashed',
          bgcolor:
            state === 'right'
              ? HOPLA.greenSoft
              : fill
                ? `${color}14`
                : 'transparent',
          color: state === 'right' ? HOPLA.greenText : 'inherit',
          cursor: fill && !state ? 'pointer' : 'default',
          display: 'inline-block',
          fontWeight: fill ? 700 : 400,
          minWidth: '3.5em',
          mx: 0.5,
          px: 1,
          textAlign: 'center',
        }}
      >
        {fill || ' '}
      </Box>
      {after}
    </Typography>
  )
}

BlankSentence.propTypes = {
  color: PropTypes.string.isRequired,
  fill: PropTypes.string,
  onClear: PropTypes.func,
  sentence: PropTypes.string.isRequired,
  state: PropTypes.string,
}

// BlankLabels: the words to slide into the blank, by dragging one onto it or
// touching it; the word in place can be taken back before checking.
export const BlankLabels = ({ color, fill, item, onAnswer, onFill }) => {
  const { t } = useTranslation('learn')
  const [drag, setDrag] = useState(null)

  const drop = event => {
    const target = document
      .elementsFromPoint(event.clientX, event.clientY)
      .find(el => el.hasAttribute?.('data-hopla-blank'))
    return Boolean(target)
  }

  return (
    <Stack alignItems='center' gap={2} sx={{ width: '100%' }}>
      <Stack direction='row' gap={1} flexWrap='wrap' justifyContent='center'>
        {item.choices.map(choice => {
          const placed = fill === choice
          return (
            <Button
              key={choice}
              variant='outlined'
              color='neutral'
              onPointerDown={event => {
                event.currentTarget.setPointerCapture?.(event.pointerId)
                setDrag({
                  choice,
                  x: event.clientX,
                  y: event.clientY,
                  dx: 0,
                  dy: 0,
                })
              }}
              onPointerMove={event =>
                drag?.choice === choice &&
                setDrag({
                  ...drag,
                  dx: event.clientX - drag.x,
                  dy: event.clientY - drag.y,
                })
              }
              onPointerUp={event => {
                const moved = drag && Math.hypot(drag.dx, drag.dy) > 12
                setDrag(null)
                // A word dropped on the blank, or touched, goes in.
                if (!moved || drop(event))
                  onFill(placed && !moved ? null : choice)
              }}
              onPointerCancel={() => setDrag(null)}
              sx={{
                borderColor: placed ? color : undefined,
                borderRadius: 'lg',
                borderWidth: 2,
                fontSize: 20,
                minHeight: 56,
                minWidth: 72,
                opacity: placed ? 0.45 : 1,
                position: 'relative',
                touchAction: 'none',
                zIndex: drag?.choice === choice ? 2 : 'auto',
                ...(drag?.choice === choice && {
                  boxShadow: 'md',
                  transform: `translate(${drag.dx}px, ${drag.dy}px)`,
                }),
                ...onHover({ borderColor: color }),
              }}
            >
              {choice}
            </Button>
          )
        })}
      </Stack>
      <Button
        size='lg'
        disabled={!fill}
        startDecorator={<CheckRounded />}
        onClick={() => onAnswer(fill)}
        sx={{ bgcolor: color, '&:hover': { bgcolor: color } }}
      >
        {t('play.check')}
      </Button>
    </Stack>
  )
}

BlankLabels.propTypes = {
  color: PropTypes.string.isRequired,
  fill: PropTypes.string,
  item: PropTypes.object.isRequired,
  onAnswer: PropTypes.func.isRequired,
  onFill: PropTypes.func.isRequired,
}
