import { PublicRounded } from '@mui/icons-material'
import {
  Autocomplete,
  Box,
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Sheet,
  Typography,
} from '@mui/joy'
import PropTypes from 'prop-types'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useIsParent } from '../../hooks/useIsParent'
import {
  useFamilyTimezone,
  useSetFamilyTimezone,
} from '../../queries/UserQueries'
import { useNotification } from '../../service/NotificationProvider'
import { deviceTimezone, zoneCity, zoneLabel } from '../../utils/familyTime'

const zones = () =>
  typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : [deviceTimezone()]

// The family's time zone: every date follows it, whatever the device's. It is
// the server's at home, and a parent can move the family on holiday.
const FamilyTimezoneCard = ({ sx }) => {
  const { t } = useTranslation('settings')
  const isParent = useIsParent()
  const { data } = useFamilyTimezone()
  const setTimezone = useSetFamilyTimezone()
  const { showError, showSuccess } = useNotification()
  const [choice, setChoice] = useState(null)

  if (!data) return null
  const selected = choice ?? data.timezone
  const options = Array.from(new Set([data.server, ...zones()]))

  const save = zone =>
    setTimezone.mutate(zone, {
      onSuccess: () => {
        setChoice(null)
        showSuccess({
          title: t('familySettings.timezone.saved', { city: zoneCity(zone) }),
          message: t('familySettings.timezone.savedMessage'),
        })
      },
      onError: () => showError({ title: t('familySettings.timezone.failed') }),
    })

  return (
    <Sheet
      sx={{
        bgcolor: 'background.surface',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 'xl',
        p: { xs: 2, sm: 2.5 },
        ...sx,
      }}
    >
      <Box sx={{ alignItems: 'center', display: 'flex', gap: 1.5, mb: 2 }}>
        <Box
          sx={{
            bgcolor: 'primary.softBg',
            borderRadius: '50%',
            color: 'primary.plainColor',
            display: 'grid',
            flex: '0 0 auto',
            height: 44,
            placeItems: 'center',
            width: 44,
          }}
        >
          <PublicRounded />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography level='title-lg' sx={{ fontWeight: 650 }}>
            {t('familySettings.timezone.title')}
          </Typography>
          <Typography level='body-sm' textColor='text.secondary'>
            {data.custom
              ? t('familySettings.timezone.away', {
                  city: zoneCity(data.timezone),
                  home: zoneCity(data.server),
                })
              : t('familySettings.timezone.home', {
                  city: zoneCity(data.timezone),
                })}
          </Typography>
        </Box>
      </Box>

      <FormControl>
        <FormLabel>{t('familySettings.timezone.label')}</FormLabel>
        <Autocomplete
          disabled={!isParent}
          disableClearable
          options={options}
          value={selected}
          getOptionLabel={zone =>
            zone === data.server
              ? t('familySettings.timezone.serverOption', {
                  zone: zoneLabel(zone),
                })
              : zoneLabel(zone)
          }
          onChange={(_, zone) => zone && setChoice(zone)}
          filterOptions={(list, { inputValue }) => {
            const terms = inputValue.toLowerCase().split(/\s+/).filter(Boolean)
            return list.filter(zone => {
              const name = zone.toLowerCase()
              return terms.every(term => name.replace(/_/g, ' ').includes(term))
            })
          }}
        />
        <FormHelperText>
          {isParent
            ? t('familySettings.timezone.help')
            : t('familySettings.timezone.parentsOnly')}
        </FormHelperText>
      </FormControl>

      {isParent && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
          <Button
            disabled={selected === data.timezone}
            loading={setTimezone.isPending && selected !== data.server}
            onClick={() => save(selected)}
          >
            {t('familySettings.timezone.save')}
          </Button>
          {data.custom && (
            <Button
              variant='soft'
              loading={setTimezone.isPending && selected === data.server}
              onClick={() => save(data.server)}
            >
              {t('familySettings.timezone.backHome', {
                city: zoneCity(data.server),
              })}
            </Button>
          )}
        </Box>
      )}
    </Sheet>
  )
}

export default FamilyTimezoneCard

FamilyTimezoneCard.propTypes = {
  sx: PropTypes.object,
}
