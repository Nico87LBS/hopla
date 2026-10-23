import {
  Box,
  Checkbox,
  FormControl,
  FormHelperText,
  Typography,
} from '@mui/joy'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTranslation } from 'react-i18next'

import {
  setSinglePageTaskEditor,
  useSinglePageTaskEditor,
} from '../../utils/TaskEditorPreferences'
import SettingsLayout from './SettingsLayout'
import SidepanelSettings from './SidepanelSettings'

const LayoutSettings = () => {
  const { t } = useTranslation('settings')
  const singlePageTaskEditor = useSinglePageTaskEditor()
  // Same breakpoint Sidepanel itself checks before rendering.
  const hasSidepanel = useMediaQuery(theme => theme.breakpoints.up('lg'))

  return (
    <SettingsLayout title={t('layout.title')}>
      <div className='grid gap-4'>
        <Box>
          <Typography level='title-md' sx={{ fontWeight: 600, mb: 2 }}>
            {t('layout.taskEditor.title')}
          </Typography>
          <FormControl>
            <Checkbox
              checked={singlePageTaskEditor}
              onChange={event => setSinglePageTaskEditor(event.target.checked)}
              variant='soft'
              label={t('layout.taskEditor.singlePage')}
            />
            <FormHelperText>
              {t('layout.taskEditor.singlePageHelp')}
            </FormHelperText>
          </FormControl>
        </Box>

        {/* The sidepanel only renders from
            `lg` up, so it is configurable exactly where it exists. */}
        {hasSidepanel && (
          <Box
            sx={{
              mt: 2,
              pt: 3,
              borderTop: '1px solid var(--joy-palette-divider)',
            }}
          >
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
