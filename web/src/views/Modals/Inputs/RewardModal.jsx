import {
  Box,
  FormControl,
  Input,
  Option,
  Select,
  Switch,
  Textarea,
  Typography,
} from '@mui/joy'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ModalActions from '../../../components/common/ModalActions'
import { useResponsiveModal } from '../../../hooks/useResponsiveModal.js'
import { useNotification } from '../../../service/NotificationProvider.jsx'
import { CreateReward, UpdateReward } from '../../../utils/Fetcher'

function RewardModal({ isOpen, onClose, reward }) {
  const { t } = useTranslation('rewards')
  const { ResponsiveModal } = useResponsiveModal()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [pointsCost, setPointsCost] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [quotaCount, setQuotaCount] = useState('')
  const [quotaPeriod, setQuotaPeriod] = useState('week')
  const [error, setError] = useState('')
  const queryClient = useQueryClient()
  const { showError } = useNotification()

  useEffect(() => {
    if (reward) {
      setName(reward.name)
      setDescription(reward.description || '')
      setPointsCost(String(reward.pointsCost))
      setIsActive(reward.isActive)
      setQuotaCount(reward.quotaCount ? String(reward.quotaCount) : '')
      setQuotaPeriod(reward.quotaPeriod || 'week')
    } else {
      setName('')
      setDescription('')
      setPointsCost('')
      setIsActive(true)
      setQuotaCount('')
      setQuotaPeriod('week')
    }
    setError('')
  }, [reward])

  const validate = () => {
    if (!name.trim()) {
      setError(t('modal.errorEmptyName'))
      return false
    }
    const cost = Number(pointsCost)
    if (!Number.isFinite(cost) || cost <= 0) {
      setError(t('modal.errorInvalidCost'))
      return false
    }
    const quota = Number(quotaCount || 0)
    if (!Number.isInteger(quota) || quota < 0) {
      setError(t('modal.errorInvalidQuota'))
      return false
    }
    return true
  }

  const handleSave = () => {
    if (!validate()) return

    const payload = {
      name,
      description,
      pointsCost: Number(pointsCost),
      isActive,
      quotaCount: Number(quotaCount || 0),
      quotaPeriod: Number(quotaCount || 0) > 0 ? quotaPeriod : '',
    }

    const save = reward?.id
      ? UpdateReward(reward.id, payload)
      : CreateReward(payload)

    save
      .then(res => {
        if (res?.error) {
          setError(res.error)
        } else {
          queryClient.invalidateQueries('rewards')
          onClose()
        }
      })
      .catch(() => {
        showError({
          title: t('modal.saveFailedTitle'),
          message: t('modal.saveFailedMessage'),
        })
      })
  }

  return (
    <ResponsiveModal
      open={isOpen}
      onClose={onClose}
      size='lg'
      fullWidth={true}
      title={reward ? t('modal.editTitle') : t('modal.addTitle')}
      footer={
        <ModalActions
          secondary={{ label: t('common:cancel'), onClick: onClose }}
          primary={{
            label: reward ? t('modal.saveChanges') : t('modal.addReward'),
            onClick: handleSave,
          }}
        />
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <FormControl>
          <Typography gutterBottom level='body-sm' alignSelf='start'>
            {t('modal.name')}
          </Typography>
          <Input
            fullWidth
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </FormControl>

        <FormControl>
          <Typography gutterBottom level='body-sm' alignSelf='start'>
            {t('modal.description')}
          </Typography>
          <Textarea
            minRows={2}
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </FormControl>

        <FormControl>
          <Typography gutterBottom level='body-sm' alignSelf='start'>
            {t('modal.pointsCost')}
          </Typography>
          <Input
            fullWidth
            type='number'
            slotProps={{ input: { min: 1 } }}
            value={pointsCost}
            onChange={e => setPointsCost(e.target.value)}
          />
        </FormControl>

        <FormControl>
          <Typography gutterBottom level='body-sm' alignSelf='start'>
            {t('modal.quota')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Input
              type='number'
              placeholder={t('modal.quotaNone')}
              slotProps={{ input: { min: 0, 'aria-label': t('modal.quota') } }}
              value={quotaCount}
              onChange={e => setQuotaCount(e.target.value)}
              sx={{ flex: 1 }}
            />
            <Select
              value={quotaPeriod}
              disabled={!Number(quotaCount)}
              onChange={(_, value) => value && setQuotaPeriod(value)}
              aria-label={t('modal.quotaPeriod')}
              sx={{ minWidth: 140 }}
            >
              <Option value='day'>{t('modal.perDay')}</Option>
              <Option value='week'>{t('modal.perWeek')}</Option>
              <Option value='month'>{t('modal.perMonth')}</Option>
            </Select>
          </Box>
          <Typography
            level='body-xs'
            textColor='text.tertiary'
            sx={{ mt: 0.5 }}
          >
            {t('modal.quotaHelp')}
          </Typography>
        </FormControl>

        <FormControl
          orientation='horizontal'
          sx={{ justifyContent: 'space-between' }}
        >
          <Typography level='body-sm'>{t('modal.active')}</Typography>
          <Switch
            checked={isActive}
            onChange={e => setIsActive(e.target.checked)}
          />
        </FormControl>

        {error && (
          <Typography color='warning' level='body-sm'>
            {error}
          </Typography>
        )}
      </Box>
    </ResponsiveModal>
  )
}

export default RewardModal
