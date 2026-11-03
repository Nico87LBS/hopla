// The ways to answer that hold several labels: pairs to match, labels to put
// in order or to sort into boxes, zones of a picture to touch, and the
// collections to count.

import { Box, Button, Sheet, Stack, Typography } from '@mui/joy'
import PropTypes from 'prop-types'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { HOPLA } from '../../constants/theme'

// onHover styles a pointer passing over; on a touch screen, Safari keeps it
// on what was touched last, which then looks chosen at the next question.
export const onHover = style => ({
  '@media (hover: hover)': { '&:hover': style },
})

// drawingURL is where a drawing of the catalogue lives, kept offline with the
// rest of the app.
export const drawingURL = id => `/drawings/${id}.svg`

export const Drawing = ({ id, size = 120 }) => (
  <Box
    component='img'
    src={drawingURL(id)}
    alt=''
    draggable={false}
    sx={{ display: 'block', height: size, width: size }}
  />
)

Drawing.propTypes = {
  id: PropTypes.string.isRequired,
  size: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
}

const shake = {
  '@keyframes hopla-shake': {
    '0%, 100%': { transform: 'translateX(0)' },
    '25%': { transform: 'translateX(-6px)' },
    '75%': { transform: 'translateX(6px)' },
  },
  animation: 'hopla-shake 0.3s ease-in-out 2',
}

// LabelButton is a word, a drawing or both, to touch.
const LabelButton = ({ color, item, onClick, size = 56, state, ...rest }) => (
  <Button
    variant={state === 'done' ? 'soft' : 'outlined'}
    color='neutral'
    onClick={onClick}
    disabled={state === 'done'}
    sx={{
      borderColor:
        state === 'picked'
          ? color
          : state === 'wrong'
            ? HOPLA.carrot
            : undefined,
      borderRadius: 'lg',
      borderWidth: 2,
      flexDirection: 'column',
      fontSize: 18,
      gap: 0.5,
      minHeight: 56,
      px: 1,
      py: 0.75,
      whiteSpace: 'normal',
      ...(state === 'picked' && { bgcolor: `${color}1f` }),
      ...(state === 'done' && {
        bgcolor: `${HOPLA.greenSoft} !important`,
        color: `${HOPLA.greenText} !important`,
      }),
      ...(state === 'wrong' && shake),
      ...onHover({ borderColor: color }),
    }}
    {...rest}
  >
    {item.image && <Drawing id={item.image} size={size} />}
    {item.text}
  </Button>
)

LabelButton.propTypes = {
  color: PropTypes.string.isRequired,
  item: PropTypes.object.isRequired,
  onClick: PropTypes.func,
  size: PropTypes.number,
  state: PropTypes.string,
}

const sideText = side => side.text || side.image || ''

// MatchPairs: two columns of labels; touch one on each side to pair them. A
// good pair stays coloured, a wrong one shakes. It is right when every
// pair was found without a mistake.
export const MatchPairs = ({ color, item, onAnswer, say }) => {
  const { t } = useTranslation('learn')
  const [picked, setPicked] = useState(null)
  const [matched, setMatched] = useState(() => new Set())
  const [wrong, setWrong] = useState(null)
  const mistakes = useRef([])
  const sides = { left: 0, right: 1 }

  const touch = (side, index) => {
    const own = item.pairs[index][sides[side]]
    if (say && own.text) say(own.text)
    if (!picked || picked.side === side) {
      setPicked({ side, index })
      return
    }
    setPicked(null)
    if (picked.index === index) {
      const next = new Set(matched).add(index)
      setMatched(next)
      if (next.size === item.pairs.length) {
        setTimeout(() => onAnswer(mistakes.current[0] || ''), 350)
      }
      return
    }
    const [l, r] =
      side === 'right' ? [picked.index, index] : [index, picked.index]
    mistakes.current.push(
      `${sideText(item.pairs[l][0])} – ${sideText(item.pairs[r][1])}`,
    )
    setWrong({ left: l, right: r })
    setTimeout(() => setWrong(null), 650)
  }

  const stateOf = (side, index) =>
    matched.has(index)
      ? 'done'
      : wrong?.[side] === index
        ? 'wrong'
        : picked?.side === side && picked.index === index
          ? 'picked'
          : undefined

  return (
    <Stack gap={1} sx={{ width: '100%' }}>
      <Typography
        level='body-sm'
        sx={{ color: 'text.secondary', textAlign: 'center' }}
      >
        {t('play.matchHelp')}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gap: { xs: 1.5, sm: 4 },
          gridTemplateColumns: '1fr 1fr',
        }}
      >
        {['left', 'right'].map(side => (
          <Stack key={side} gap={1}>
            {item[side].map(index => (
              <LabelButton
                key={index}
                color={color}
                item={item.pairs[index][sides[side]]}
                state={stateOf(side, index)}
                onClick={() => touch(side, index)}
              />
            ))}
          </Stack>
        ))}
      </Box>
    </Stack>
  )
}

MatchPairs.propTypes = {
  color: PropTypes.string.isRequired,
  item: PropTypes.object.isRequired,
  onAnswer: PropTypes.func.isRequired,
  say: PropTypes.func,
}

// OrderLabels: the labels, mixed, go up into the boxes in the order they
// are touched; a box touched sends its label back down.
export const OrderLabels = ({ color, item, onAnswer, say }) => {
  const { t } = useTranslation('learn')
  const [placed, setPlaced] = useState([])
  // With the voice on, a first touch says a label and a second one puts it
  // up, as for the other questions.
  const [armed, touch] = useTwoTaps(say, index => {
    setPlaced(now => [...now, index])
  })
  const left = item.mixed.map((text, i) => i).filter(i => !placed.includes(i))
  const full = placed.length === item.mixed.length
  return (
    <Stack gap={2} sx={{ width: '100%' }} alignItems='center'>
      <Stack
        direction='row'
        gap={1}
        flexWrap='wrap'
        justifyContent='center'
        sx={{ width: '100%' }}
      >
        {item.mixed.map((text, slot) => {
          const index = placed[slot]
          return (
            <Sheet
              key={slot}
              variant='outlined'
              onClick={() =>
                index !== undefined &&
                setPlaced(placed.filter((p, i) => i !== slot))
              }
              sx={{
                alignItems: 'center',
                borderColor: index === undefined ? 'divider' : color,
                borderRadius: 'lg',
                borderStyle: index === undefined ? 'dashed' : 'solid',
                borderWidth: 2,
                cursor: index === undefined ? 'default' : 'pointer',
                display: 'flex',
                gap: 0.75,
                minHeight: 52,
                minWidth: 64,
                px: 1.25,
              }}
            >
              <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
                {slot + 1}
              </Typography>
              {index !== undefined && (
                <Typography level='title-md'>{item.mixed[index]}</Typography>
              )}
            </Sheet>
          )
        })}
      </Stack>
      <Stack direction='row' gap={1} flexWrap='wrap' justifyContent='center'>
        {left.map(index => (
          <LabelButton
            key={index}
            color={color}
            item={{ text: item.mixed[index] }}
            state={armed === index ? 'picked' : undefined}
            onClick={() => touch(index, item.mixed[index])}
          />
        ))}
      </Stack>
      <Button
        size='lg'
        disabled={!full}
        onClick={() =>
          onAnswer(placed.map(index => item.mixed[index]).join(' → '))
        }
        className='hopla-print'
        sx={{ bgcolor: color, '&:hover': { bgcolor: color } }}
      >
        {t('play.check')}
      </Button>
    </Stack>
  )
}

OrderLabels.propTypes = {
  color: PropTypes.string.isRequired,
  item: PropTypes.object.isRequired,
  onAnswer: PropTypes.func.isRequired,
  say: PropTypes.func,
}

// useTwoTaps: with the voice on, a first touch says an answer and a second
// one chooses it; otherwise one touch chooses. Quiet, as in a question to
// listen to, the first touch only circles the answer: saying it would give
// it away.
export const useTwoTaps = (say, onAnswer, quiet = false) => {
  const [armed, setArmed] = useState(null)
  const touch = (value, spoken = value) => {
    if (!say || armed === value) {
      setArmed(null)
      onAnswer(value)
      return
    }
    if (!quiet) say(spoken)
    setArmed(value)
  }
  return [armed, touch]
}

// SortBoxes: two or three boxes; the label shown above goes into one.
export const SortBoxes = ({ color, item, onAnswer, say }) => {
  const [armed, touch] = useTwoTaps(say, onAnswer)
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 1.5,
        gridTemplateColumns: `repeat(${item.boxes.length}, 1fr)`,
        width: '100%',
      }}
    >
      {item.boxes.map(box => (
        <Button
          key={box.name}
          variant='outlined'
          color='neutral'
          onClick={() => touch(box.name)}
          sx={{
            borderColor: armed === box.name ? color : undefined,
            borderRadius: 'xl',
            borderWidth: 2,
            flexDirection: 'column',
            fontSize: 18,
            gap: 1,
            minHeight: 120,
            p: 1.5,
            whiteSpace: 'normal',
            ...(armed === box.name && { bgcolor: `${color}1f` }),
            ...onHover({ borderColor: color }),
          }}
        >
          {box.image && <Drawing id={box.image} size={72} />}
          {box.name}
        </Button>
      ))}
    </Box>
  )
}

SortBoxes.propTypes = {
  color: PropTypes.string.isRequired,
  item: PropTypes.object.isRequired,
  onAnswer: PropTypes.func.isRequired,
  say: PropTypes.func,
}

// ── pictures in zones ──

// The pictures are read once and kept: each zone is an element with a
// data-zone attribute, which the game colours and listens to.
const zonePictures = new Map()

const loadZones = id => {
  if (!zonePictures.has(id)) {
    zonePictures.set(
      id,
      fetch(`/drawings/zones/${id}.svg`)
        .then(response => (response.ok ? response.text() : ''))
        .then(text =>
          // Only the drawing: nothing of a file that would run.
          text
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/\son\w+="[^"]*"/gi, ''),
        )
        .catch(() => {
          zonePictures.delete(id)
          return ''
        }),
    )
  }
  return zonePictures.get(id)
}

const zoneSafe = zone => /^[a-z0-9-]+$/.test(zone || '')

// ZonePicture shows a picture in zones. With onTouch, its zones can be
// touched; highlight colours one of them.
export const ZonePicture = ({ color, highlight, id, maxHeight, onTouch }) => {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let live = true
    loadZones(id).then(text => live && setSvg(text))
    return () => {
      live = false
    }
  }, [id])
  // A zone is filled, or a line (a river) coloured, in a bright colour
  // with a dark edge, the other zones paler, so that it is seen at once;
  // the wide invisible edge of a line or a dot (.prise) only makes it
  // easier to touch.
  const zone = `[data-zone="${highlight}"]`
  const lit = zoneSafe(highlight)
    ? {
        [`& [data-zone]:not(${zone})`]: { opacity: 0.45 },
        [`& ${zone}, & ${zone} *:not(.prise)`]: {
          fill: color,
          stroke: HOPLA.ink,
          strokeWidth: '2.5px',
          vectorEffect: 'non-scaling-stroke',
        },
        [`& ${zone} .ligne`]: { stroke: color, strokeWidth: '5px' },
      }
    : {}
  return (
    <Box
      onClick={
        onTouch &&
        (e => {
          const zone = e.target.closest?.('[data-zone]')
          if (zone) onTouch(zone.getAttribute('data-zone'))
        })
      }
      sx={{
        width: '100%',
        '& svg': {
          display: 'block',
          height: 'auto',
          maxHeight: maxHeight || 420,
          mx: 'auto',
          width: '100%',
        },
        ...(onTouch && {
          '& [data-zone]': { cursor: 'pointer' },
          '@media (hover: hover)': {
            '& [data-zone]:hover, & [data-zone]:hover *': {
              fill: `${color}55`,
            },
            '& [data-zone]:hover .ligne': { stroke: color },
          },
        }),
        ...lit,
        '& .ligne, & .prise': { fill: 'none !important' },
      }}
      // The picture comes from the app's own drawings, cleaned above.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

ZonePicture.propTypes = {
  color: PropTypes.string.isRequired,
  highlight: PropTypes.string,
  id: PropTypes.string.isRequired,
  maxHeight: PropTypes.number,
  onTouch: PropTypes.func,
}

// ── collections to count ──

const PIPS = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72],
  ],
  6: [
    [28, 26],
    [72, 26],
    [28, 50],
    [72, 50],
    [28, 74],
    [72, 74],
  ],
}

const Die = ({ n }) => (
  <Box
    component='svg'
    viewBox='0 0 100 100'
    sx={{ display: 'block', height: 140, width: 140 }}
  >
    <rect
      x='6'
      y='6'
      width='88'
      height='88'
      rx='18'
      fill='#fff'
      stroke='#3E2F86'
      strokeWidth='4'
    />
    {(PIPS[n] || []).map(([cx, cy]) => (
      <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r='8' fill='#3E2F86' />
    ))}
  </Box>
)

Die.propTypes = { n: PropTypes.number.isRequired }

// CountPicture draws the collection: tidy rows of five, so a group of five
// is seen at a glance.
export const CountPicture = ({ count }) => {
  if (count.form === 'de') return <Die n={count.n} />
  const rows = []
  for (let i = 0; i < count.n; i += 5) {
    rows.push(Math.min(5, count.n - i))
  }
  const size = count.n > 10 ? 40 : 56
  return (
    <Stack gap={0.75} alignItems='center'>
      {rows.map((length, row) => (
        <Stack key={row} direction='row' gap={0.5}>
          {Array.from({ length }, (_, i) => (
            <Drawing key={i} id={count.object || 'carrot'} size={size} />
          ))}
        </Stack>
      ))}
    </Stack>
  )
}

CountPicture.propTypes = { count: PropTypes.object.isRequired }

// Clock draws a clock face with its two hands: the short one for the
// hours, the long one for the minutes, as at school.
export const Clock = ({ children, clock, size = 180 }) => {
  const { h, m } = clock
  const hand = (turns, length) => {
    const angle = turns * 2 * Math.PI
    return [50 + length * Math.sin(angle), 50 - length * Math.cos(angle)]
  }
  const [hx, hy] = hand(((h % 12) + m / 60) / 12, 22)
  const [mx, my] = hand(m / 60, 34)
  return (
    <Box
      component='svg'
      viewBox='0 0 100 100'
      role='img'
      aria-label='horloge'
      sx={{ display: 'block', height: size, width: size }}
    >
      <circle
        cx='50'
        cy='50'
        r='46'
        fill='#fff'
        stroke='#3E2F86'
        strokeWidth='4'
      />
      {Array.from({ length: 60 }, (_, i) => {
        const [x1, y1] = hand(i / 60, i % 5 ? 41 : 38)
        const [x2, y2] = hand(i / 60, 43)
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke='#3E2F86'
            strokeWidth={i % 5 ? 0.6 : 1.6}
          />
        )
      })}
      {Array.from({ length: 12 }, (_, i) => {
        const [x, y] = hand((i + 1) / 12, 31)
        return (
          <text
            key={i}
            x={x}
            y={y}
            dy='0.35em'
            textAnchor='middle'
            fontSize='9'
            fontWeight='700'
            fill='#3E2F86'
          >
            {i + 1}
          </text>
        )
      })}
      <line
        x1='50'
        y1='50'
        x2={mx}
        y2={my}
        stroke='#3B7DD8'
        strokeWidth='3'
        strokeLinecap='round'
      />
      <line
        x1='50'
        y1='50'
        x2={hx}
        y2={hy}
        stroke='#E5484D'
        strokeWidth='5'
        strokeLinecap='round'
      />
      {children}
      <circle cx='50' cy='50' r='3.5' fill='#3E2F86' />
    </Box>
  )
}

Clock.propTypes = {
  children: PropTypes.node,
  clock: PropTypes.object.isRequired,
  size: PropTypes.number,
}

// Ruler draws a line to measure above a ruler in centimetres.
export const Ruler = ({ ruler }) => {
  const { length, size, start } = ruler
  const step = 18
  const left = 10
  const width = left * 2 + step * (size - 1)
  const x = cm => left + cm * step
  return (
    <Box
      component='svg'
      viewBox={`0 0 ${width} 74`}
      role='img'
      aria-label='règle'
      sx={{ display: 'block', maxWidth: 420, width: '100%' }}
    >
      <line
        x1={x(start)}
        y1='12'
        x2={x(start + length)}
        y2='12'
        stroke='#E5484D'
        strokeWidth='5'
        strokeLinecap='butt'
      />
      <line
        x1={x(start)}
        y1='4'
        x2={x(start)}
        y2='20'
        stroke='#E5484D'
        strokeWidth='1.5'
      />
      <line
        x1={x(start + length)}
        y1='4'
        x2={x(start + length)}
        y2='20'
        stroke='#E5484D'
        strokeWidth='1.5'
      />
      <rect
        x='2'
        y='26'
        width={width - 4}
        height='44'
        rx='4'
        fill='#FFF3C4'
        stroke='#3E2F86'
        strokeWidth='2'
      />
      {Array.from({ length: (size - 1) * 10 + 1 }, (_, i) => {
        const cm = i / 10
        const long = i % 10 === 0
        const half = i % 5 === 0
        return (
          <line
            key={i}
            x1={x(cm)}
            y1='26'
            x2={x(cm)}
            y2={long ? 42 : half ? 37 : 33}
            stroke='#3E2F86'
            strokeWidth={long ? 1.4 : 0.6}
          />
        )
      })}
      {Array.from({ length: size }, (_, cm) => (
        <text
          key={cm}
          x={x(cm)}
          y='58'
          textAnchor='middle'
          fontSize='11'
          fontWeight='700'
          fill='#3E2F86'
        >
          {cm}
        </text>
      ))}
    </Box>
  )
}

Ruler.propTypes = { ruler: PropTypes.object.isRequired }

// LabelView shows a label to sort, word and drawing.
export const LabelView = ({ subject }) => (
  <Stack alignItems='center' gap={0.5}>
    {subject.image && <Drawing id={subject.image} size={96} />}
    {subject.text && (
      <Typography level='h2' className='hopla-words'>
        {subject.text}
      </Typography>
    )}
  </Stack>
)

LabelView.propTypes = { subject: PropTypes.object.isRequired }
