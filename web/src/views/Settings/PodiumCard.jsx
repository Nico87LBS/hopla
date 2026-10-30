import { EmojiEventsRounded } from '@mui/icons-material'
import { Box, Sheet, Switch, Typography } from '@mui/joy'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useNotification } from '../../service/NotificationProvider'
import { SaveParentsOnPodium } from '../../utils/Fetcher'
import { useGamesToday } from '../Games/DailyGames'

// Whether the parents stand on the podium with the children, on the web and
// on the family card alike. Without children, they always do.
const PodiumCard = () => {
  const { t } = useTranslation('settings')
  const { data: today } = useGamesToday()
  const queryClient = useQueryClient()
  const { showError } = useNotification()
  const [saving, setSaving] = useState(false)

  if (!today) return null
  const toggle = async on => {
    setSaving(true)
    const resp = await SaveParentsOnPodium(on).catch(() => null)
    setSaving(false)
    if (!resp?.ok) {
      showError({ title: t('familySettings.podium.failed') })
      return
    }
    queryClient.setQueryData(['games', 'today'], old =>
      old ? { ...old, parentsOnPodium: on } : old,
    )
    queryClient.invalidateQueries({ queryKey: ['games', 'today'] })
  }

  return (
    <Sheet
      sx={{
        alignItems: 'center',
        bgcolor: 'background.surface',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 'xl',
        display: 'flex',
        gap: 1.5,
        p: { xs: 2, sm: 2.5 },
      }}
    >
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
        <EmojiEventsRounded />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          component='label'
          htmlFor='parents-on-podium'
          level='title-lg'
          sx={{ fontWeight: 650 }}
        >
          {t('familySettings.podium.title')}
        </Typography>
        <Typography level='body-sm' textColor='text.secondary'>
          {t('familySettings.podium.help')}
        </Typography>
      </Box>
      <Switch
        checked={Boolean(today.parentsOnPodium)}
        disabled={saving}
        onChange={event => toggle(event.target.checked)}
        slotProps={{ input: { id: 'parents-on-podium' } }}
      />
    </Sheet>
  )
}

export default PodiumCard
