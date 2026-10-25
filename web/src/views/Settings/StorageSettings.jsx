import { Button, Card, Typography } from '@mui/joy'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import ConfirmationModal from '../Modals/Inputs/ConfirmationModal'
import SettingsLayout from './SettingsLayout'

const StorageSettings = () => {
  const { t } = useTranslation('settings')
  const Navigate = useNavigate()
  const [confirmModalConfig, setConfirmModalConfig] = useState({})

  const showConfirmation = (
    message,
    title,
    onConfirm,
    confirmText = t('common.confirm'),
    cancelText = t('common.cancel'),
    color = 'primary',
  ) => {
    setConfirmModalConfig({
      isOpen: true,
      message,
      title,
      confirmText,
      cancelText,
      color,
      onClose: isConfirmed => {
        if (isConfirmed) {
          onConfirm()
        }
        setConfirmModalConfig({})
      },
    })
  }

  return (
    <SettingsLayout title={t('storage.title')}>
      <div className='grid gap-4' id='storage'>
        <Card className='p-4' sx={{ maxWidth: 500, mb: 2 }}>
          <Typography level='body-sm' sx={{ mb: 1 }}>
            {t('storage.localDescription')}
          </Typography>
          <Button
            variant='soft'
            color='danger'
            onClick={() => {
              showConfirmation(
                t('storage.clearLocalMessage'),
                t('storage.clearLocalTitle'),
                () => {
                  localStorage.clear()
                  Navigate('/login')
                },
                t('storage.clearAll'),
                t('common.cancel'),
                'danger',
              )
            }}
          >
            {t('storage.clearLocal')}
          </Button>
        </Card>

        {/* Modals */}
        {confirmModalConfig?.isOpen && (
          <ConfirmationModal config={confirmModalConfig} />
        )}
      </div>
    </SettingsLayout>
  )
}

export default StorageSettings
