import { PublicRounded } from '@mui/icons-material'
import { Alert, Box, Button, Typography } from '@mui/joy'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useIsParent } from '../../hooks/useIsParent'
import {
  useFamilyTimezone,
  useSetFamilyTimezone,
} from '../../queries/UserQueries'
import { useNotification } from '../../service/NotificationProvider'
import { deviceTimezone, zoneCity } from '../../utils/familyTime'

// A device left on another time zone than the family's, such as a tablet in
// UTC or a phone on holiday, still shows the family's dates. A parent is told
// once per device and zone, and can move the whole family to this device's
// zone, or keep things as they are on this device.

const ignoredKey = (device, family) =>
  `familyTimezoneIgnored:${device}:${family}`

const isIgnored = key => {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

const FamilyTimezoneBanner = () => {
  const { t } = useTranslation('common')
  const isParent = useIsParent()
  const { data } = useFamilyTimezone()
  const setTimezone = useSetFamilyTimezone()
  const { showError, showSuccess } = useNotification()
  const device = deviceTimezone()
  const family = data?.timezone
  const key = ignoredKey(device, family)
  const [hidden, setHidden] = useState(() => isIgnored(key))

  if (!isParent || !family || family === device || hidden || isIgnored(key)) {
    return null
  }

  const ignore = () => {
    try {
      localStorage.setItem(key, '1')
    } catch {
      // Private browsing: it shows again next time.
    }
    setHidden(true)
  }

  const move = () =>
    setTimezone.mutate(device, {
      onSuccess: () =>
        showSuccess({
          title: t('familyTimezone.moved', { city: zoneCity(device) }),
          message: t('familyTimezone.movedMessage'),
        }),
      onError: () => showError({ title: t('familyTimezone.moveFailed') }),
    })

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, pt: 2 }}>
      <Alert
        color='warning'
        variant='soft'
        startDecorator={<PublicRounded />}
        sx={{
          alignItems: { xs: 'flex-start', sm: 'center' },
          borderRadius: 'lg',
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 1.5,
          maxWidth: 1100,
          mx: 'auto',
        }}
        endDecorator={
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Button
              size='sm'
              color='warning'
              loading={setTimezone.isPending}
              onClick={move}
            >
              {t('familyTimezone.move')}
            </Button>
            <Button size='sm' variant='plain' color='neutral' onClick={ignore}>
              {t('familyTimezone.ignore')}
            </Button>
          </Box>
        }
      >
        <Typography level='body-sm' sx={{ color: 'inherit' }}>
          {t('familyTimezone.differs', {
            device: zoneCity(device),
            family: zoneCity(family),
          })}
        </Typography>
      </Alert>
    </Box>
  )
}

export default FamilyTimezoneBanner
