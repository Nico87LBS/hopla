import { RestartAltRounded } from '@mui/icons-material'
import {
  Button,
  Checkbox,
  Option,
  Select,
  Sheet,
  Stack,
  Typography,
} from '@mui/joy'
import { useQueryClient } from '@tanstack/react-query'
import PropTypes from 'prop-types'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useNotification } from '../../service/NotificationProvider'
import { ResetPoints } from '../../utils/Fetcher'
import ConfirmationModal from '../Modals/Inputs/ConfirmationModal'
import { memberShape, surfaceSx } from './GameParts'

const EVERYONE = 'all'

// Sets one member, or everyone, back to zero points and the first rank, such
// as once a year or after testing.
const ResetCard = ({ members }) => {
  const { t } = useTranslation('games')
  const { showNotification } = useNotification()
  const queryClient = useQueryClient()
  const [target, setTarget] = useState(EVERYONE)
  const [clearHistory, setClearHistory] = useState(false)
  const [clearTaskHistory, setClearTaskHistory] = useState(false)
  const [clearGames, setClearGames] = useState(false)
  const [confirm, setConfirm] = useState({})

  const member = members.find(m => m.userId === target)
  const who = member ? member.displayName : t('reset.everyone')

  const reset = async () => {
    const resp = await ResetPoints({
      userId: member ? member.userId : null,
      clearHistory,
      clearTaskHistory,
      clearGames,
    })
    if (!resp.ok) {
      showNotification({ type: 'error', message: t('reset.failed') })
      return
    }
    queryClient.invalidateQueries({ queryKey: ['pointsHistory'] })
    queryClient.invalidateQueries({ queryKey: ['allCircleMembers'] })
    queryClient.invalidateQueries({ queryKey: ['circleMembers'] })
    queryClient.invalidateQueries({ queryKey: ['games'] })
    if (clearTaskHistory) {
      queryClient.invalidateQueries({ queryKey: ['chores'] })
      queryClient.invalidateQueries({ queryKey: ['choresHistory'] })
      queryClient.invalidateQueries({ queryKey: ['choreHistory'] })
    }
    if (clearGames) queryClient.invalidateQueries({ queryKey: ['learn'] })
    showNotification({ type: 'success', message: t('reset.done', { who }) })
    setClearHistory(false)
    setClearTaskHistory(false)
    setClearGames(false)
  }

  const ask = () =>
    setConfirm({
      isOpen: true,
      title: t('reset.confirmTitle'),
      message: [
        t(clearHistory ? 'reset.confirmClear' : 'reset.confirmKeep', { who }),
        clearTaskHistory ? t('reset.confirmTasks') : '',
        clearGames ? t('reset.confirmGames') : '',
      ]
        .filter(Boolean)
        .join(' '),
      confirmText: t('reset.button'),
      cancelText: t('presets.cancel'),
      color: 'danger',
      onClose: async confirmed => {
        setConfirm({})
        if (confirmed) await reset()
      },
    })

  return (
    <Sheet sx={surfaceSx}>
      <Typography level='title-lg' sx={{ mb: 0.5 }}>
        {t('reset.title')}
      </Typography>
      <Typography level='body-sm' sx={{ color: 'text.secondary', mb: 1.5 }}>
        {t('reset.subtitle')}
      </Typography>
      <Stack gap={1.25}>
        <Select
          size='sm'
          value={target}
          onChange={(event, value) => setTarget(value)}
          sx={{ maxWidth: 260 }}
        >
          <Option value={EVERYONE}>{t('reset.everyone')}</Option>
          {members.map(m => (
            <Option key={m.userId} value={m.userId}>
              {m.displayName}
            </Option>
          ))}
        </Select>
        <Checkbox
          size='sm'
          checked={clearHistory}
          onChange={event => setClearHistory(event.target.checked)}
          label={t('reset.clearHistory')}
        />
        <Checkbox
          size='sm'
          checked={clearTaskHistory}
          onChange={event => setClearTaskHistory(event.target.checked)}
          label={t('reset.clearTaskHistory')}
        />
        <Checkbox
          size='sm'
          checked={clearGames}
          onChange={event => setClearGames(event.target.checked)}
          label={t('reset.clearGames')}
        />
        <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
          {t('reset.help')}
        </Typography>
        <Button
          size='sm'
          color='danger'
          variant='soft'
          startDecorator={<RestartAltRounded />}
          onClick={ask}
          sx={{ alignSelf: 'flex-start' }}
        >
          {t('reset.button')}
        </Button>
      </Stack>
      {confirm.isOpen && <ConfirmationModal config={confirm} />}
    </Sheet>
  )
}

ResetCard.propTypes = {
  members: PropTypes.arrayOf(memberShape).isRequired,
}

export default ResetCard
