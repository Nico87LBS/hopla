import { Box, Typography } from '@mui/joy'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTranslation } from 'react-i18next'

import SettingsLayout from './SettingsLayout'
import SidepanelSettings from './SidepanelSettings'

const LayoutSettings = () => {
  const { t } = useTranslation('settings')
  // Same breakpoint Sidepanel itself checks before rendering.
  const hasSidepanel = useMediaQuery(theme => theme.breakpoints.up('lg'))

  return (
    <SettingsLayout title={t('layout.title')}>
      <div className='grid gap-4'>
        {/* The sidepanel only renders from
            `lg` up, so it is configurable exactly where it exists. */}
        {hasSidepanel && (
          <Box>
            <Typography level='title-md' sx={{ fontWeight: 600 }}>
              {t('layout.sidepanel.title')}
            </Typography>
            <SidepanelSettings />
          </Box>
        )}
      </div>
    </SettingsLayout>
  )
}

export default LayoutSettings
