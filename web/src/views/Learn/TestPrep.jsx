import {
  AddRounded,
  CloseRounded,
  EditCalendarRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  IconButton,
  Input,
  Sheet,
  Stack,
  Typography,
} from '@mui/joy'
import PropTypes from 'prop-types'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import ModalActions from '../../components/common/ModalActions'
import { HOPLA } from '../../constants/theme'
import { useResponsiveModal } from '../../hooks/useResponsiveModal'
import { useCreateTest, useDeleteTest } from '../../queries/LearnQueries'
import { addDays, testReadiness } from '../../utils/learn/engine'
import { daysBetween } from '../../utils/learn/listing'
import { Progress } from './LearnParts'

// longDay writes a day as « vendredi 7 novembre ».
const longDay = (day, language) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(language, {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  })

// TestCard tells how ready a person is for a test to come, and opens a game
// that prepares it.
const TestCard = ({ byId, cards, onRemove, player, test, to }) => {
  const { i18n, t } = useTranslation('learn')
  const { left, percent } = testReadiness(test, byId, cards)
  const days = daysBetween(player.day, test.day)
  return (
    <Sheet
      variant='outlined'
      sx={{
        background: `linear-gradient(135deg, ${HOPLA.goldSoft}, transparent)`,
        borderColor: HOPLA.gold,
        borderRadius: 'xl',
        mb: 2,
        p: 1.5,
      }}
    >
      <Stack direction='row' alignItems='flex-start' gap={1}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography level='title-md'>{test.name}</Typography>
          <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
            {longDay(test.day, i18n.language)} ·{' '}
            {t('tests.inDays', { count: days })}
          </Typography>
        </Box>
        <IconButton
          size='sm'
          variant='plain'
          color='neutral'
          aria-label={t('tests.remove')}
          title={t('tests.remove')}
          onClick={() => onRemove(test)}
        >
          <CloseRounded />
        </IconButton>
      </Stack>
      <Box sx={{ mt: 1 }}>
        <Progress value={percent} color={HOPLA.green} />
        <Typography level='body-xs' sx={{ color: 'text.secondary', mt: 0.5 }}>
          {t('tests.ready', { percent })}
          {left > 0 && ` · ${t('tests.left', { count: left })}`}
        </Typography>
      </Box>
      <Button component={Link} to={to} fullWidth sx={{ mt: 1.25 }}>
        {t('tests.go')}
      </Button>
    </Sheet>
  )
}

TestCard.propTypes = {
  byId: PropTypes.object.isRequired,
  cards: PropTypes.instanceOf(Map).isRequired,
  onRemove: PropTypes.func.isRequired,
  player: PropTypes.object.isRequired,
  test: PropTypes.object.isRequired,
  to: PropTypes.string.isRequired,
}

// NewTest asks a name, a day and the chapters a test covers.
const NewTest = ({ byId, onClose, player, userId }) => {
  const { t } = useTranslation('learn')
  const { ResponsiveModal } = useResponsiveModal()
  const create = useCreateTest()
  const [name, setName] = useState('')
  const [day, setDay] = useState(addDays(player.day, 7))
  const [chosen, setChosen] = useState([])
  const [error, setError] = useState('')
  const key = (module, chapter) => `${module}\n${chapter}`
  const toggle = id =>
    setChosen(old =>
      old.includes(id) ? old.filter(x => x !== id) : [...old, id],
    )
  const save = async () => {
    try {
      await create.mutateAsync({
        userId,
        name,
        day,
        chapters: chosen.map(id => {
          const [module, chapter] = id.split('\n')
          return { module, chapter }
        }),
      })
      onClose()
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <ResponsiveModal
      open
      onClose={onClose}
      size='md'
      title={t('tests.new')}
      footer={
        <ModalActions
          secondary={{ label: t('manage.cancel'), onClick: onClose }}
          primary={{
            label: t('tests.save'),
            onClick: save,
            loading: create.isPending,
            disabled: !name.trim() || !day || chosen.length === 0,
          }}
        />
      }
    >
      <Stack gap={2}>
        <Box>
          <Typography level='body-xs'>{t('tests.name')}</Typography>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('tests.namePlaceholder')}
            slotProps={{ input: { maxLength: 60 } }}
          />
        </Box>
        <Box>
          <Typography level='body-xs'>{t('tests.day')}</Typography>
          <Input
            type='date'
            value={day}
            onChange={e => setDay(e.target.value)}
            slotProps={{ input: { min: player.day } }}
          />
        </Box>
        <Box>
          <Typography level='body-xs' sx={{ mb: 0.5 }}>
            {t('tests.covers')}
          </Typography>
          <Stack gap={1.25}>
            {player.modules
              .filter(m => byId[m.id])
              .map(m => (
                <Box key={m.id}>
                  <Typography level='title-sm'>{m.name}</Typography>
                  <Stack direction='row' gap={0.75} flexWrap='wrap'>
                    {byId[m.id].chapters.map(chapter => {
                      const id = key(m.id, chapter.id)
                      const on = chosen.includes(id)
                      return (
                        <Chip
                          key={id}
                          variant={on ? 'solid' : 'outlined'}
                          color={on ? 'primary' : 'neutral'}
                          aria-pressed={on}
                          onClick={() => toggle(id)}
                        >
                          {chapter.name}
                        </Chip>
                      )
                    })}
                  </Stack>
                </Box>
              ))}
          </Stack>
        </Box>
        {error && (
          <Typography level='body-sm' color='danger'>
            {error}
          </Typography>
        )}
      </Stack>
    </ResponsiveModal>
  )
}

NewTest.propTypes = {
  byId: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  player: PropTypes.object.isRequired,
  userId: PropTypes.number.isRequired,
}

// TestsSection shows the tests a person prepares, and a button to add one.
// Offline, a test cannot be made or removed.
const TestsSection = ({ byId, cards, player, testPath, userId }) => {
  const { t } = useTranslation('learn')
  const remove = useDeleteTest()
  const [adding, setAdding] = useState(false)
  const tests = player.tests || []
  const canAdd = !player.offline && player.modules.length > 0
  if (!tests.length && !canAdd) return null
  return (
    <>
      {tests.map(test => (
        <TestCard
          key={test.id}
          byId={byId}
          cards={cards}
          player={player}
          test={test}
          to={testPath(test.id)}
          onRemove={x => !player.offline && remove.mutate(x.id)}
        />
      ))}
      {canAdd && (
        <Box sx={{ mb: 2, textAlign: 'right' }}>
          <Button
            size='sm'
            variant='plain'
            startDecorator={
              tests.length ? <AddRounded /> : <EditCalendarRounded />
            }
            onClick={() => setAdding(true)}
          >
            {t('tests.add')}
          </Button>
        </Box>
      )}
      {adding && (
        <NewTest
          byId={byId}
          player={player}
          userId={userId}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  )
}

TestsSection.propTypes = {
  byId: PropTypes.object.isRequired,
  cards: PropTypes.instanceOf(Map).isRequired,
  player: PropTypes.object.isRequired,
  testPath: PropTypes.func.isRequired,
  userId: PropTypes.number.isRequired,
}

export default TestsSection
