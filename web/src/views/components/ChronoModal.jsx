import { Box, Typography } from '@mui/joy'
import { useQueryClient } from '@tanstack/react-query'
import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import AppModal from '../../components/common/AppModal'
import {
  chronoMinutesLeft,
  useChronoNow,
} from '../../components/common/ChronoChip'
import ModalActions from '../../components/common/ModalActions'
import { HOPLA } from '../../constants/theme'
import { useFlashes } from '../../queries/ChoreQueries'
import { useNotification } from '../../service/NotificationProvider'
import { LaunchFlash, StopFlash } from '../../utils/Fetcher'

const HOPS = [2, 5, 10, 20]
const MINUTES = [5, 10, 15, 30]

const Choice = ({ label, onClick, selected }) => (
  <Box
    component='button'
    type='button'
    aria-pressed={selected}
    onClick={onClick}
    sx={{
      flex: 1,
      minHeight: 40,
      border: '1px solid',
      borderColor: selected ? HOPLA.violet : 'divider',
      borderRadius: '10px',
      bgcolor: selected ? HOPLA.violetSoft : 'background.surface',
      color: selected ? HOPLA.violet : 'text.secondary',
      cursor: 'pointer',
      font: 'inherit',
      fontSize: 14,
      fontWeight: 600,
      '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.500' },
    }}
  >
    {label}
  </Box>
)

Choice.propTypes = {
  label: PropTypes.node.isRequired,
  onClick: PropTypes.func.isRequired,
  selected: PropTypes.bool,
}

// A parent starts a speed bonus on a task now: extra hops for whoever does it
// (or a copy of it) in the next minutes, once per child. A running one can be
// stopped.
const ChronoModal = ({ chore, onClose, open }) => {
  const { t } = useTranslation('chores')
  const queryClient = useQueryClient()
  const { showError } = useNotification()
  const [points, setPoints] = useState(5)
  const [minutes, setMinutes] = useState(15)
  const [busy, setBusy] = useState(false)
  const { data: flashes } = useFlashes()
  const flash = flashes?.[chore?.id]
  const live = flash?.liveId ? flash : null
  const now = useChronoNow(live)
  const left = chronoMinutesLeft(live, now)
  useEffect(() => {
    if (open) {
      setPoints(5)
      setMinutes(15)
    }
  }, [open])

  const run = async (request, failed) => {
    setBusy(true)
    try {
      const response = await request()
      if (!response?.ok) {
        const body = await response?.json().catch(() => null)
        showError({ title: failed, message: body?.error || '' })
        return
      }
      queryClient.invalidateQueries({ queryKey: ['flashes'] })
      onClose()
    } catch {
      showError({ title: failed, message: '' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={t('chrono.launch')}
      size='sm'
      footer={
        <ModalActions
          tertiary={
            live && left > 0
              ? {
                  label: t('chrono.stop'),
                  color: 'danger',
                  disabled: busy,
                  onClick: () =>
                    run(() => StopFlash(live.liveId), t('chrono.stopFailed')),
                }
              : undefined
          }
          secondary={{
            label: t('common:cancel'),
            disabled: busy,
            onClick: onClose,
          }}
          primary={{
            label: t('chrono.start'),
            loading: busy,
            onClick: () =>
              run(
                () => LaunchFlash(chore.id, points, minutes),
                t('chrono.failed'),
              ),
          }}
        />
      }
    >
      <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
        {t('chrono.launchHelp', { name: chore?.name || '' })}
      </Typography>
      {live && left > 0 && (
        <Typography level='body-sm' sx={{ fontWeight: 600, mt: 1 }}>
          {t('chrono.running', { points: live.points, count: left })}{' '}
          {t('chrono.replace')}
        </Typography>
      )}
      <Typography level='title-sm' sx={{ mt: 2, mb: 0.75 }}>
        {t('chrono.points')}
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.75 }}>
        {HOPS.map(value => (
          <Choice
            key={value}
            label={`+${value}`}
            selected={value === points}
            onClick={() => setPoints(value)}
          />
        ))}
      </Box>
      <Typography level='title-sm' sx={{ mt: 2, mb: 0.75 }}>
        {t('chrono.minutes')}
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.75 }}>
        {MINUTES.map(value => (
          <Choice
            key={value}
            label={t('chrono.minutesValue', { count: value })}
            selected={value === minutes}
            onClick={() => setMinutes(value)}
          />
        ))}
      </Box>
    </AppModal>
  )
}

ChronoModal.propTypes = {
  chore: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  open: PropTypes.bool,
}

export default ChronoModal
