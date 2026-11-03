import {
  CalendarMonth,
  ContentCopy,
  DeleteOutline,
  Refresh,
} from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Card,
  CircularProgress,
  Divider,
  IconButton,
  Input,
  Option,
  Select,
  Stack,
  Typography,
} from '@mui/joy'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocalization } from '../../contexts/LocalizationContext'
import { useIsParent } from '../../hooks/useIsParent'
import { useFamilyMembers, useUserProfile } from '../../queries/UserQueries'
import { useNotification } from '../../service/NotificationProvider'
import {
  CreateCalendarURL,
  GetCalendarURL,
  RevokeCalendarURL,
  RotateCalendarURL,
} from '../../utils/Fetcher'
import ConfirmationModal from '../Modals/Inputs/ConfirmationModal'
import SettingsLayout from './SettingsLayout'

const REMINDERS = [0, 5, 10, 15, 30, 60]

// feedQuery is what the address asks for: whose tasks and a reminder. A
// parent can follow one member or the whole family with the same address.
const feedQuery = ({ reminder, who }) => {
  const query = new URLSearchParams()
  if (who !== 'moi') query.set('qui', who)
  if (reminder > 0) query.set('rappel', String(reminder))
  const text = query.toString()
  return text ? `?${text}` : ''
}

const CalendarSettings = () => {
  const { t } = useTranslation('settings')
  const { fmt } = useLocalization()
  const { showNotification } = useNotification()
  const [calendar, setCalendar] = useState(null)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [confirmModalConfig, setConfirmModalConfig] = useState({})
  const [who, setWho] = useState('moi')
  const [reminder, setReminder] = useState(0)
  const isParent = useIsParent()
  const { data: me } = useUserProfile()
  const { data: membersData } = useFamilyMembers()
  const others = (membersData?.res || []).filter(
    m => m.isActive !== false && m.userId !== me?.id,
  )
  const feedURL = calendar?.url
    ? `${calendar.url}${feedQuery({ reminder, who })}`
    : ''

  const loadCalendar = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const response = await GetCalendarURL()
      if (response?.status === 404) {
        setCalendar(null)
      } else if (response?.ok) {
        setCalendar(await response.json())
      } else {
        setLoadError(true)
      }
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCalendar()
  }, [loadCalendar])

  const runAction = async (name, request, successMessage) => {
    setAction(name)
    try {
      const response = await request()
      if (!response?.ok) throw new Error('Calendar request failed')
      if (response.status === 204) {
        setCalendar(null)
      } else {
        setCalendar(await response.json())
      }
      showNotification({ type: 'success', message: successMessage })
    } catch {
      showNotification({
        type: 'error',
        title: t('calendar.errorTitle'),
        message: t('calendar.actionFailed'),
      })
    } finally {
      setAction(null)
    }
  }

  const copyURL = async () => {
    try {
      await navigator.clipboard.writeText(feedURL)
      showNotification({
        type: 'success',
        message: t('calendar.copied'),
      })
    } catch {
      showNotification({
        type: 'error',
        message: t('calendar.copyFailed'),
      })
    }
  }

  const showConfirmation = ({
    color,
    confirmText,
    message,
    onConfirm,
    title,
  }) =>
    setConfirmModalConfig({
      isOpen: true,
      message,
      title,
      confirmText,
      cancelText: t('common.cancel'),
      color,
      onClose: confirmed => {
        setConfirmModalConfig({})
        if (confirmed) onConfirm()
      },
    })

  // webcal:// hands the URL straight to the OS calendar app, but Apple's
  // Calendar resolves webcal to https and never falls back to http. Rewriting a
  // plain-http instance URL (local dev, self-hosted without TLS) would hand the
  // user a link that fails to connect, so only https URLs get the webcal form.
  const subscribeURL = feedURL.startsWith('https://')
    ? feedURL.replace(/^https:\/\//, 'webcal://')
    : feedURL

  return (
    <SettingsLayout title={t('calendar.title')}>
      <Stack spacing={3} sx={{ maxWidth: 720, pb: 4 }}>
        <Typography level='body-md'>{t('calendar.description')}</Typography>

        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 3 }}>
            <CircularProgress size='sm' />
            <Typography level='body-sm'>{t('common.loading')}</Typography>
          </Box>
        ) : loadError ? (
          <Alert
            color='danger'
            variant='soft'
            endDecorator={
              <Button
                size='sm'
                variant='soft'
                color='danger'
                onClick={loadCalendar}
              >
                {t('common.refresh')}
              </Button>
            }
          >
            {t('calendar.loadFailed')}
          </Alert>
        ) : calendar ? (
          <>
            <Card variant='outlined'>
              <Stack spacing={2}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <CalendarMonth color='primary' />
                  <Box sx={{ flex: 1 }}>
                    <Typography level='title-md'>
                      {t('calendar.activeTitle')}
                    </Typography>
                    <Typography level='body-sm' color='success'>
                      {t('calendar.activeStatus')}
                    </Typography>
                  </Box>
                </Box>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <Box sx={{ flex: 1 }}>
                    <Typography level='body-sm' sx={{ mb: 0.5 }}>
                      {t('calendar.who')}
                    </Typography>
                    <Select
                      value={who}
                      onChange={(_, value) => value && setWho(value)}
                      slotProps={{
                        button: { 'aria-label': t('calendar.who') },
                      }}
                    >
                      <Option value='moi'>{t('calendar.whoMe')}</Option>
                      {isParent &&
                        others.map(member => (
                          <Option
                            key={member.userId}
                            value={String(member.userId)}
                          >
                            {member.displayName}
                          </Option>
                        ))}
                      {isParent && (
                        <Option value='famille'>
                          {t('calendar.whoFamily')}
                        </Option>
                      )}
                    </Select>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography level='body-sm' sx={{ mb: 0.5 }}>
                      {t('calendar.reminder')}
                    </Typography>
                    <Select
                      value={reminder}
                      onChange={(_, value) =>
                        value !== null && setReminder(value)
                      }
                      slotProps={{
                        button: { 'aria-label': t('calendar.reminder') },
                      }}
                    >
                      {REMINDERS.map(minutes => (
                        <Option key={minutes} value={minutes}>
                          {minutes === 0
                            ? t('calendar.noReminder')
                            : t('calendar.reminderBefore', { count: minutes })}
                        </Option>
                      ))}
                    </Select>
                  </Box>
                </Stack>
                <Typography level='body-xs' color='neutral'>
                  {t('calendar.contents')}
                </Typography>

                <Input
                  value={feedURL}
                  readOnly
                  aria-label={t('calendar.urlLabel')}
                  endDecorator={
                    <IconButton
                      variant='plain'
                      color='primary'
                      aria-label={t('calendar.copy')}
                      onClick={copyURL}
                    >
                      <ContentCopy />
                    </IconButton>
                  }
                />

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button
                    component='a'
                    href={subscribeURL}
                    startDecorator={<CalendarMonth />}
                  >
                    {t('calendar.subscribe')}
                  </Button>
                  <Button
                    variant='outlined'
                    startDecorator={<ContentCopy />}
                    onClick={copyURL}
                  >
                    {t('calendar.copy')}
                  </Button>
                </Stack>

                <Divider />
                <Stack spacing={0.5}>
                  {calendar.createdAt && (
                    <Typography level='body-xs' color='neutral'>
                      {t('calendar.createdAt', {
                        date: fmt.dateTime(calendar.createdAt),
                      })}
                    </Typography>
                  )}
                  <Typography level='body-xs' color='neutral'>
                    {calendar.lastUsedAt
                      ? t('calendar.lastUsedAt', {
                          date: fmt.dateTime(calendar.lastUsedAt),
                        })
                      : t('calendar.neverUsed')}
                  </Typography>
                </Stack>
              </Stack>
            </Card>

            <Card variant='soft' color='warning'>
              <Typography level='title-sm'>
                {t('calendar.keepPrivateTitle')}
              </Typography>
              <Typography level='body-sm'>
                {t('calendar.keepPrivateDescription')}
              </Typography>
            </Card>

            <Box>
              <Typography level='title-md' sx={{ mb: 1 }}>
                {t('calendar.manageTitle')}
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button
                  variant='outlined'
                  startDecorator={<Refresh />}
                  loading={action === 'rotate'}
                  disabled={Boolean(action)}
                  onClick={() =>
                    showConfirmation({
                      title: t('calendar.rotateTitle'),
                      message: t('calendar.rotateMessage'),
                      confirmText: t('calendar.rotate'),
                      color: 'warning',
                      onConfirm: () =>
                        runAction(
                          'rotate',
                          RotateCalendarURL,
                          t('calendar.rotated'),
                        ),
                    })
                  }
                >
                  {t('calendar.rotate')}
                </Button>
                <Button
                  variant='outlined'
                  color='danger'
                  startDecorator={<DeleteOutline />}
                  loading={action === 'revoke'}
                  disabled={Boolean(action)}
                  onClick={() =>
                    showConfirmation({
                      title: t('calendar.revokeTitle'),
                      message: t('calendar.revokeMessage'),
                      confirmText: t('calendar.revoke'),
                      color: 'danger',
                      onConfirm: () =>
                        runAction(
                          'revoke',
                          RevokeCalendarURL,
                          t('calendar.revoked'),
                        ),
                    })
                  }
                >
                  {t('calendar.revoke')}
                </Button>
              </Stack>
            </Box>
          </>
        ) : (
          <Card variant='outlined'>
            <Stack spacing={2} alignItems='flex-start'>
              <CalendarMonth sx={{ fontSize: 36 }} color='primary' />
              <Typography level='title-lg'>
                {t('calendar.inactiveTitle')}
              </Typography>
              <Typography level='body-sm'>
                {t('calendar.inactiveDescription')}
              </Typography>
              <Button
                loading={action === 'create'}
                disabled={Boolean(action)}
                onClick={() => {
                  runAction(
                    'create',
                    CreateCalendarURL,
                    t('calendar.generated'),
                  )
                }}
              >
                {t('calendar.generate')}
              </Button>
            </Stack>
          </Card>
        )}

        <Card variant='soft'>
          <Typography level='title-md' sx={{ mb: 1 }}>
            {t('calendar.howToTitle')}
          </Typography>
          <Typography level='body-sm'>
            {t('calendar.howToDescription')}
          </Typography>
        </Card>
      </Stack>

      {confirmModalConfig.isOpen && (
        <ConfirmationModal config={confirmModalConfig} />
      )}
    </SettingsLayout>
  )
}

export default CalendarSettings
