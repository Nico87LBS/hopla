import {
  ArrowBackRounded,
  ArrowDownwardRounded,
  ArrowForwardRounded,
  ArrowUpwardRounded,
  CloseRounded,
  TimerRounded,
} from '@mui/icons-material'
import { Box, IconButton, Stack, Typography } from '@mui/joy'
import PropTypes from 'prop-types'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { HOPLA } from '../../constants/theme'
import { GAMES } from './games'
import { clock } from './games/common'

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

// Board runs one game on a canvas until it ends, the time runs out or the
// child quits; it tells the score once, with how many seconds it took.
// seconds is the time the game may take (0 for no limit); options go to the
// game.
const Board = ({ game, onEnd, options, seconds = 0 }) => {
  const { t } = useTranslation('learn')
  const canvas = useRef(null)
  const handle = useRef(null)
  const score = useRef(0)
  const ended = useRef(false)
  const [shown, setShown] = useState(0)
  const [hint, setHint] = useState('')
  const [left, setLeft] = useState(seconds)
  const startedAt = useRef(0)
  const meta = GAMES[game]
  const settings = useRef(options)

  const end = useRef(null)
  useEffect(() => {
    end.current = () => {
      if (ended.current) return
      ended.current = true
      handle.current?.stop()
      onEnd(
        score.current,
        Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)),
      )
    }
  })

  // Leaving the page ends the game: the récré is played. React may unmount
  // and mount again at once, so the end waits a moment.
  const leaving = useRef(0)
  useEffect(() => {
    clearTimeout(leaving.current)
    ended.current = false
    startedAt.current = Date.now()
    handle.current = meta.start(canvas.current, {
      options: settings.current,
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
    if (!seconds) return undefined
    const started = Date.now()
    const id = setInterval(() => {
      const rest = Math.max(0, seconds - (Date.now() - started) / 1000)
      setLeft(Math.ceil(rest))
      if (rest <= 0) {
        clearInterval(id)
        end.current()
      }
    }, 250)
    return () => clearInterval(id)
  }, [seconds])

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
        {seconds > 0 && (
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
  onEnd: PropTypes.func.isRequired,
  options: PropTypes.object,
  seconds: PropTypes.number,
}

export default Board
