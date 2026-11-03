import {
  CloudDownloadRounded,
  DownloadRounded,
  RestoreRounded,
  SaveRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Input,
  List,
  ListItem,
  ListItemContent,
  Sheet,
  Stack,
  Typography,
} from '@mui/joy'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import AppModal from '../../components/common/AppModal'
import ModalActions from '../../components/common/ModalActions'
import { useIsParent } from '../../hooks/useIsParent'
import { useNotification } from '../../service/NotificationProvider'
import { apiClient } from '../../utils/ApiClient'
import {
  DownloadFamilyBackup,
  GetFamilyBackups,
  RestoreFamilyBackup,
} from '../../utils/Fetcher'
import { saveFile } from '../../utils/saveFile'

const sheetSx = {
  bgcolor: 'background.surface',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 'xl',
  p: { xs: 2, sm: 2.5 },
}

const iconSx = {
  bgcolor: 'primary.softBg',
  borderRadius: '50%',
  color: 'primary.plainColor',
  display: 'grid',
  flex: '0 0 auto',
  height: 44,
  placeItems: 'center',
  width: 44,
}

const size = (bytes, t) =>
  bytes >= 1024 * 1024
    ? t('familySettings.backup.sizeMb', {
        size: (bytes / 1024 / 1024).toFixed(1),
      })
    : t('familySettings.backup.sizeKb', {
        size: Math.max(1, Math.round(bytes / 1024)),
      })

// BackupCard keeps the whole family in a file: a parent downloads one,
// picks one of the nightly ones kept by the server, or puts one back.
const BackupCard = () => {
  const { i18n, t } = useTranslation('settings')
  const isParent = useIsParent()
  const { showError, showSuccess } = useNotification()
  const [busy, setBusy] = useState(null)
  const [file, setFile] = useState(null)
  const [typed, setTyped] = useState('')
  const picker = useRef(null)
  const { data } = useQuery({
    queryKey: ['familyBackups'],
    queryFn: GetFamilyBackups,
    enabled: isParent,
  })

  if (!isParent) return null
  const word = t('familySettings.backup.confirmWord')

  const download = async name => {
    setBusy(name || 'now')
    try {
      const { blob, fileName } = await DownloadFamilyBackup(name)
      await saveFile(fileName, blob, 'application/zip')
    } catch {
      showError({ title: t('familySettings.backup.downloadFailed') })
    } finally {
      setBusy(null)
    }
  }

  const closeRestore = () => {
    setFile(null)
    setTyped('')
  }

  const restore = async () => {
    setBusy('restore')
    try {
      const res = await RestoreFamilyBackup(file)
      closeRestore()
      showSuccess({
        title: t('familySettings.backup.restored', { name: res.familyName }),
        message: t('familySettings.backup.restoredMessage'),
      })
      setTimeout(() => apiClient.handleLogout(), 2500)
    } catch (err) {
      showError({
        title: t('familySettings.backup.restoreFailed'),
        message: err.message,
      })
    } finally {
      setBusy(null)
    }
  }

  const day = value =>
    new Date(`${value}T12:00:00`).toLocaleDateString(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })

  return (
    <Sheet sx={sheetSx}>
      <Box sx={{ alignItems: 'center', display: 'flex', gap: 1.5, mb: 1.5 }}>
        <Box sx={iconSx}>
          <SaveRounded />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography level='title-lg' sx={{ fontWeight: 650 }}>
            {t('familySettings.backup.title')}
          </Typography>
          <Typography level='body-sm' textColor='text.secondary'>
            {t('familySettings.backup.help')}
          </Typography>
        </Box>
      </Box>

      <Stack direction='row' gap={1} flexWrap='wrap' sx={{ mb: 2 }}>
        <Button
          startDecorator={<CloudDownloadRounded />}
          loading={busy === 'now'}
          onClick={() => download(null)}
        >
          {t('familySettings.backup.download')}
        </Button>
        <Button
          variant='outlined'
          color='danger'
          startDecorator={<RestoreRounded />}
          onClick={() => picker.current?.click()}
        >
          {t('familySettings.backup.restore')}
        </Button>
        <input
          ref={picker}
          type='file'
          accept='.hopla-famille,application/zip'
          hidden
          onChange={event => {
            setFile(event.target.files?.[0] || null)
            event.target.value = ''
          }}
        />
      </Stack>

      <Typography level='title-sm' sx={{ mb: 0.5 }}>
        {t('familySettings.backup.nightlyTitle')}
      </Typography>
      <Typography level='body-sm' textColor='text.secondary'>
        {data?.nightly === false
          ? t('familySettings.backup.nightlyOff')
          : t('familySettings.backup.nightlyHelp', { count: data?.keep ?? 14 })}
      </Typography>
      {data?.backups?.length > 0 && (
        <List size='sm' sx={{ '--ListItem-paddingX': 0, mt: 1 }}>
          {data.backups.map(backup => (
            <ListItem
              key={backup.name}
              endAction={
                <IconButton
                  aria-label={t('familySettings.backup.downloadOne', {
                    day: day(backup.day),
                  })}
                  disabled={busy !== null}
                  onClick={() => download(backup.name)}
                >
                  {busy === backup.name ? (
                    <CircularProgress size='sm' />
                  ) : (
                    <DownloadRounded />
                  )}
                </IconButton>
              }
            >
              <ListItemContent>
                <Typography
                  level='body-md'
                  sx={{ textTransform: 'capitalize' }}
                >
                  {day(backup.day)}
                </Typography>
                <Typography level='body-xs' textColor='text.tertiary'>
                  {size(backup.size, t)}
                </Typography>
              </ListItemContent>
            </ListItem>
          ))}
        </List>
      )}

      <AppModal
        open={Boolean(file)}
        onClose={busy === 'restore' ? undefined : closeRestore}
        size='sm'
        title={t('familySettings.backup.confirmTitle')}
        footer={
          <ModalActions
            secondary={{
              label: t('familySettings.backup.cancel'),
              onClick: closeRestore,
              disabled: busy === 'restore',
            }}
            primary={{
              label: t('familySettings.backup.confirm'),
              color: 'danger',
              loading: busy === 'restore',
              disabled: typed.trim().toUpperCase() !== word.toUpperCase(),
              onClick: restore,
            }}
          />
        }
      >
        <Stack gap={1.5}>
          <Typography level='body-md'>
            {t('familySettings.backup.confirmText', { file: file?.name })}
          </Typography>
          <Typography level='body-sm' textColor='text.secondary'>
            {t('familySettings.backup.confirmPrompt', { word })}
          </Typography>
          <Input
            autoFocus
            value={typed}
            placeholder={word}
            onChange={event => setTyped(event.target.value)}
          />
        </Stack>
      </AppModal>
    </Sheet>
  )
}

export default BackupCard
