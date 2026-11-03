import { CloseRounded } from '@mui/icons-material'
import {
  Box,
  Button,
  IconButton,
  Modal,
  ModalDialog,
  Sheet,
  Stack,
  Typography,
} from '@mui/joy'
import PropTypes from 'prop-types'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { surfaceSx } from '../Games/GameParts'
import Board from './Board'
import { GAMES } from './games'

// RecreTrialCard lets a parent try the little games of the récré: nothing is
// kept, neither the score nor the récré of the person. The game follows that
// person's settings, as le train des lapereaux being slower.
const RecreTrialCard = ({ person, recre }) => {
  const { t } = useTranslation('learn')
  const [game, setGame] = useState(null)
  const [score, setScore] = useState(null)
  // A new key starts the same game again.
  const [round, setRound] = useState(0)
  if (!recre) return null
  const options = { slow: recre.trainSlow, wrap: recre.trainWrap }

  const open = name => {
    setScore(null)
    setRound(n => n + 1)
    setGame(name)
  }

  return (
    <Sheet sx={{ ...surfaceSx }}>
      <Typography level='title-md'>{t('recre.trial.title')}</Typography>
      <Typography level='body-xs' sx={{ color: 'text.secondary', mb: 1.5 }}>
        {t('recre.trial.help', { name: person.displayName })}
      </Typography>
      <Stack direction='row' gap={1} flexWrap='wrap'>
        {Object.keys(GAMES).map(name => {
          const Icon = GAMES[name].icon
          const color = GAMES[name].color
          return (
            <Button
              key={name}
              size='sm'
              variant='soft'
              startDecorator={<Icon sx={{ color }} />}
              onClick={() => open(name)}
            >
              {t(`recre.game.${name}`)}
            </Button>
          )
        })}
      </Stack>
      <Modal open={Boolean(game)} onClose={() => setGame(null)}>
        <ModalDialog
          layout='fullscreen'
          aria-label={game ? t(`recre.game.${game}`) : undefined}
          sx={{ overflowY: 'auto' }}
        >
          {game && (
            <Box sx={{ maxWidth: 600, mx: 'auto', width: '100%' }}>
              {score === null ? (
                <Board
                  key={round}
                  game={game}
                  options={options}
                  onEnd={value => setScore(value)}
                />
              ) : (
                <Stack gap={2} alignItems='center' sx={{ pt: 4 }}>
                  <Typography level='h3'>{t(`recre.game.${game}`)}</Typography>
                  <Typography level='body-lg'>
                    {t('recre.score', { count: score })}
                  </Typography>
                  <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
                    {t('recre.trial.notKept')}
                  </Typography>
                  <Button size='lg' onClick={() => open(game)}>
                    {t('recre.playAgain')}
                  </Button>
                  <Button
                    size='lg'
                    variant='outlined'
                    startDecorator={<CloseRounded />}
                    onClick={() => setGame(null)}
                  >
                    {t('recre.trial.close')}
                  </Button>
                </Stack>
              )}
            </Box>
          )}
        </ModalDialog>
      </Modal>
    </Sheet>
  )
}

RecreTrialCard.propTypes = {
  person: PropTypes.object.isRequired,
  recre: PropTypes.object,
}

export default RecreTrialCard
