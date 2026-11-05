import { ContentCopyRounded, KeyRounded } from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Divider,
  IconButton,
  Input,
  Stack,
  Typography,
} from '@mui/joy'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocalization } from '../../contexts/LocalizationContext'
import { useNotification } from '../../service/NotificationProvider'
import {
  CreateRoutineIntegrationToken,
  GetRoutineIntegrationTokens,
  RevokeRoutineIntegrationToken,
} from '../../utils/Fetcher'
import ConfirmationModal from '../Modals/Inputs/ConfirmationModal'
import TextModal from '../Modals/Inputs/TextModal'
import SettingsLayout from './SettingsLayout'

const RoutineIntegrationTokens = () => {
  const { t } = useTranslation('settings')
  const { fmt } = useLocalization()
  const { showError, showSuccess } = useNotification()
  const queryClient = useQueryClient()
  const [nameModalOpen, setNameModalOpen] = useState(false)
  const [newToken, setNewToken] = useState(null)
  const [confirmModalConfig, setConfirmModalConfig] = useState({})
  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ['routineIntegrationTokens'],
    queryFn: GetRoutineIntegrationTokens,
  })

  const handleCreate = async name => {
    try {
      const response = await CreateRoutineIntegrationToken(name)
      if (!response.ok) throw new Error('create failed')
      const data = await response.json()
      setNewToken(data.token)
      setNameModalOpen(false)
      await queryClient.invalidateQueries({
        queryKey: ['routineIntegrationTokens'],
      })
    } catch {
      showError({ title: t('routineIntegrations.createFailed') })
    }
  }

  const revoke = async token => {
    try {
      const response = await RevokeRoutineIntegrationToken(token.id)
      if (!response.ok) throw new Error('revoke failed')
      await queryClient.invalidateQueries({
        queryKey: ['routineIntegrationTokens'],
      })
      showSuccess({ title: t('routineIntegrations.revokedSuccess') })
    } catch {
      showError({ title: t('routineIntegrations.revokeFailed') })
    }
  }

  const confirmRevoke = token => {
    setConfirmModalConfig({
      isOpen: true,
      title: t('routineIntegrations.revokeTitle'),
      message: t('routineIntegrations.revokeMessage', { name: token.name }),
      confirmText: t('common.remove'),
      cancelText: t('common.cancel'),
      color: 'danger',
      onClose: confirmed => {
        setConfirmModalConfig({})
        if (confirmed) revoke(token)
      },
    })
  }

  return (
    <SettingsLayout title={t('routineIntegrations.title')}>
      <Stack id='routine-integrations' gap={2}>
        <Typography level='body-sm' textColor='text.secondary'>
          {t('routineIntegrations.description')}
        </Typography>
        <Divider />
        {newToken && (
          <Alert
            color='warning'
            variant='soft'
            sx={{ alignItems: 'stretch', flexDirection: 'column', gap: 1 }}
          >
            <Typography level='title-sm'>
              {t('routineIntegrations.created')}
            </Typography>
            <Typography level='body-xs'>
              {t('routineIntegrations.secretWarning')}
            </Typography>
            <Input
              value={newToken}
              readOnly
              endDecorator={
                <IconButton
                  aria-label={t('routineIntegrations.copy')}
                  variant='outlined'
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(newToken)
                      showSuccess({ title: t('routineIntegrations.copied') })
                      setNewToken(null)
                    } catch {
                      showError({ title: t('routineIntegrations.copy') })
                    }
                  }}
                >
                  <ContentCopyRounded />
                </IconButton>
              }
            />
          </Alert>
        )}
        {isLoading && (
          <Typography level='body-sm' textColor='text.tertiary'>
            …
          </Typography>
        )}
        {!isLoading && tokens.length === 0 && (
          <Typography level='body-sm' textColor='text.tertiary'>
            {t('routineIntegrations.empty')}
          </Typography>
        )}
        {tokens.map(token => (
          <Card key={token.id} variant='outlined'>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              alignItems={{ sm: 'center' }}
              justifyContent='space-between'
              gap={1}
            >
              <Box sx={{ minWidth: 0 }}>
                <Stack direction='row' alignItems='center' gap={1}>
                  <KeyRounded fontSize='small' />
                  <Typography level='title-sm'>{token.name}</Typography>
                  <Chip
                    size='sm'
                    color={token.revokedAt ? 'neutral' : 'success'}
                    variant='soft'
                  >
                    {token.revokedAt
                      ? t('routineIntegrations.revoked')
                      : t('routineIntegrations.active')}
                  </Chip>
                </Stack>
                <Typography level='body-xs' textColor='text.tertiary'>
                  {t('routineIntegrations.createdAt', {
                    date: fmt.dateTime(token.createdAt),
                  })}
                </Typography>
                <Typography level='body-xs' textColor='text.tertiary'>
                  {token.lastUsedAt
                    ? t('routineIntegrations.lastUsed', {
                        date: fmt.dateTime(token.lastUsedAt),
                      })
                    : t('routineIntegrations.neverUsed')}
                </Typography>
              </Box>
              {!token.revokedAt && (
                <Button
                  size='sm'
                  variant='outlined'
                  color='danger'
                  onClick={() => confirmRevoke(token)}
                >
                  {t('routineIntegrations.revoke')}
                </Button>
              )}
            </Stack>
          </Card>
        ))}
        <Button
          startDecorator={<KeyRounded />}
          sx={{ alignSelf: 'flex-start' }}
          onClick={() => setNameModalOpen(true)}
        >
          {t('routineIntegrations.create')}
        </Button>
        <TextModal
          isOpen={nameModalOpen}
          title={t('routineIntegrations.nameLabel')}
          onClose={() => setNameModalOpen(false)}
          okText={t('routineIntegrations.create')}
          onSave={handleCreate}
        />
        {confirmModalConfig.isOpen && (
          <ConfirmationModal config={confirmModalConfig} />
        )}
      </Stack>
    </SettingsLayout>
  )
}

export default RoutineIntegrationTokens
