import { Button, Card, LinearProgress, Typography } from '@mui/joy'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { GetStorageUsage } from '../../utils/Fetcher'
import ConfirmationModal from '../Modals/Inputs/ConfirmationModal'
import SettingsLayout from './SettingsLayout'

const StorageSettings = () => {
  const { t } = useTranslation('settings')
  const Navigate = useNavigate()
  const [usage, setUsage] = useState({ used: 0, total: 0 })
  const [loading, setLoading] = useState(true)
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

  useEffect(() => {
    GetStorageUsage().then(resp => {
      resp.json().then(data => {
        setUsage(data.res)
        setLoading(false)
      })
    })
  }, [])

  const percent =
    usage.total > 0 ? Math.round((usage.used / usage.total) * 100) : 0
  const usedMB = (usage.used / (1024 * 1024)).toFixed(2)
  const totalMB = (usage.total / (1024 * 1024)).toFixed(2)

  return (
    <SettingsLayout title={t('storage.title')}>
      <div className='grid gap-4 py-4' id='storage'>
        <Card className='p-4' sx={{ maxWidth: 500, mb: 2 }}>
          <Typography level='title-md' sx={{ mb: 1 }}>
            {t('storage.serverTitle')}
          </Typography>
          <Typography level='body-sm' sx={{ mb: 1 }}>
            {t('storage.serverDescription')}
          </Typography>
          {loading ? (
            <>
              <LinearProgress sx={{ mb: 1 }} />
              <Typography level='body-xs'>{t('common.loading')}</Typography>
            </>
          ) : (
            <>
              <LinearProgress determinate value={percent} sx={{ mb: 1 }} />
              <Typography level='body-xs'>
                {t('storage.usage', {
                  used: usedMB,
                  total: totalMB,
                  percent,
                })}
              </Typography>
            </>
          )}
        </Card>

        <Card className='p-4' sx={{ maxWidth: 500, mb: 2 }}>
          <Typography level='title-md' sx={{ mb: 1 }}>
            {t('storage.localTitleBrowser')}
          </Typography>
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
