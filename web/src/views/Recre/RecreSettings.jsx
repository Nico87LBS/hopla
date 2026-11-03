import {
  Box,
  Checkbox,
  Option,
  Select,
  Sheet,
  Stack,
  Switch,
  Typography,
} from '@mui/joy'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'

import { useSetRecre } from '../../queries/LearnQueries'
import { useNotification } from '../../service/NotificationProvider'
import { surfaceSx } from '../Games/GameParts'
import { GAMES } from './games'
import { clock } from './games/common'

const EVERY = [1, 2, 3, 4, 5, 6, 8, 10]
const MINUTES = [0, 1, 2, 3, 5]
const ALL = Object.keys(GAMES)

// RecreSettingsCard sets one person's récré: on or off, after how many games
// played well, with or without a timer, which little games, and how easy le
// train des lapereaux is.
const RecreSettingsCard = ({ person, recre }) => {
  const { t } = useTranslation('learn')
  const setRecre = useSetRecre()
  const { showError } = useNotification()
  if (!recre) return null
  const games = recre.games || ALL

  const change = async patch => {
    try {
      await setRecre.mutateAsync({ userId: person.userId, ...patch })
    } catch (err) {
      showError({ title: t('recre.settings.failed'), message: err.message })
    }
  }

  const toggle = game => {
    const next = games.includes(game)
      ? games.filter(g => g !== game)
      : ALL.filter(g => g === game || games.includes(g))
    if (next.length) change({ games: next })
  }

  return (
    <Sheet sx={{ ...surfaceSx }}>
      <Stack direction='row' alignItems='flex-start' gap={1}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography level='title-md'>{t('recre.settings.title')}</Typography>
          <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
            {t('recre.settings.help')}
          </Typography>
        </Box>
        <Switch
          checked={recre.on}
          disabled={setRecre.isPending}
          onChange={event => change({ on: event.target.checked })}
          slotProps={{
            input: {
              'aria-label': t('recre.settings.onFor', {
                name: person.displayName,
              }),
            },
          }}
        />
      </Stack>
      {recre.on && (
        <Stack gap={1.5} sx={{ mt: 1.5 }}>
          <Stack direction='row' gap={1.5} flexWrap='wrap'>
            <Box>
              <Typography level='body-xs' sx={{ mb: 0.5 }}>
                {t('recre.settings.every')}
              </Typography>
              <Select
                size='sm'
                value={recre.every}
                disabled={setRecre.isPending}
                onChange={(_, every) =>
                  every && every !== recre.every && change({ every })
                }
              >
                {EVERY.map(n => (
                  <Option key={n} value={n}>
                    {t('recre.settings.everyValue', { count: n })}
                  </Option>
                ))}
              </Select>
            </Box>
            <Box>
              <Typography level='body-xs' sx={{ mb: 0.5 }}>
                {t('recre.settings.timer')}
              </Typography>
              <Select
                size='sm'
                value={recre.minutes}
                disabled={setRecre.isPending}
                onChange={(_, minutes) =>
                  minutes !== null &&
                  minutes !== recre.minutes &&
                  change({ minutes })
                }
              >
                {MINUTES.map(n => (
                  <Option key={n} value={n}>
                    {n === 0
                      ? t('recre.settings.noTimer')
                      : t('recre.minutes', { count: n })}
                  </Option>
                ))}
              </Select>
            </Box>
          </Stack>
          <Box>
            <Typography level='body-xs' sx={{ mb: 0.5 }}>
              {t('recre.settings.games')}
            </Typography>
            <Stack direction='row' gap={1.5} flexWrap='wrap'>
              {ALL.map(game => (
                <Checkbox
                  key={game}
                  size='sm'
                  label={t(`recre.game.${game}`)}
                  checked={games.includes(game)}
                  disabled={
                    setRecre.isPending ||
                    (games.length === 1 && games.includes(game))
                  }
                  onChange={() => toggle(game)}
                />
              ))}
            </Stack>
          </Box>
          {games.includes('train') && (
            <Box>
              <Typography level='body-xs' sx={{ mb: 0.5 }}>
                {t('recre.game.train')}
              </Typography>
              <Stack direction='row' gap={1.5} flexWrap='wrap'>
                {['trainSlow', 'trainWrap'].map(key => (
                  <Checkbox
                    key={key}
                    size='sm'
                    label={t(`recre.settings.${key}`)}
                    checked={recre[key]}
                    disabled={setRecre.isPending}
                    onChange={event => change({ [key]: event.target.checked })}
                  />
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      )}
      {recre.bank > 0 && (
        <Typography level='body-xs' sx={{ color: 'text.secondary', mt: 1.5 }}>
          {t('recre.settings.bank', { time: clock(recre.bank) })}
        </Typography>
      )}
    </Sheet>
  )
}

RecreSettingsCard.propTypes = {
  person: PropTypes.object.isRequired,
  recre: PropTypes.object,
}

export default RecreSettingsCard
