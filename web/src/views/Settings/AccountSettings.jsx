import { DeleteOutlineRounded, LockOutlined } from '@mui/icons-material'
import { Box, Button, Sheet, Typography } from '@mui/joy'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useUserProfile } from '../../queries/UserQueries'
import { useNotification } from '../../service/NotificationProvider'
import { UpdatePassword } from '../../utils/Fetcher'
import LoadingComponent from '../components/Loading'
import PassowrdChangeModal from '../Modals/Inputs/PasswordChangeModal'
import UserDeletionModal from '../Modals/Inputs/UserDeletionModal'
import SettingsLayout from './SettingsLayout'

const surfaceSx = {
  bgcolor: 'background.surface',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 'xl',
}

const AccountSettings = () => {
  const { t } = useTranslation('settings')
  const { data: userProfile } = useUserProfile()
  const { showNotification } = useNotification()

  const [changePasswordModal, setChangePasswordModal] = useState(false)
  const [userDeletionModal, setUserDeletionModal] = useState(false)

  if (!userProfile) return <LoadingComponent />

  const handlePasswordChange = async password => {
    setChangePasswordModal(false)
    if (!password) return

    const response = await UpdatePassword(password)
    showNotification({
      type: response.ok ? 'success' : 'error',
      message: response.ok
        ? t('accountSettings.passwordChanged')
        : t('accountSettings.passwordChangeFailed'),
    })
  }

  return (
    <SettingsLayout title={t('accountSettings.title')}>
      <Box sx={{ maxWidth: 720, pb: 4 }}>
        <Typography
          level='body-md'
          textColor='text.secondary'
          sx={{ maxWidth: 600, mb: 3, mt: -1, textWrap: 'pretty' }}
        >
          {t('accountSettings.description')}
        </Typography>

        <Box component='section' sx={{ mt: 3.5 }}>
          <Typography
            level='title-md'
            sx={{ fontWeight: 650, letterSpacing: '-0.01em', mb: 1.25 }}
          >
            {t('accountSettings.password')}
          </Typography>
          <Sheet
            sx={{
              ...surfaceSx,
              alignItems: { xs: 'flex-start', sm: 'center' },
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 1.5,
              justifyContent: 'space-between',
              p: 2,
            }}
          >
            <Box sx={{ alignItems: 'center', display: 'flex', gap: 1.5 }}>
              <Box
                sx={{
                  bgcolor: 'background.level2',
                  borderRadius: '50%',
                  color: 'text.secondary',
                  display: 'grid',
                  flex: '0 0 auto',
                  height: 42,
                  placeItems: 'center',
                  width: 42,
                }}
              >
                <LockOutlined />
              </Box>
              <Typography level='body-md'>••••••••••••</Typography>
            </Box>
            <Button
              variant='soft'
              startDecorator={<LockOutlined />}
              onClick={() => setChangePasswordModal(true)}
              sx={{ width: { xs: '100%', sm: 'auto' } }}
            >
              {t('accountSettings.changePassword')}
            </Button>
          </Sheet>
        </Box>

        <Box component='section' sx={{ mt: 4 }}>
          <Sheet
            variant='outlined'
            color='danger'
            sx={{
              borderRadius: 'xl',
              p: { xs: 2, sm: 2.5 },
            }}
          >
            <Box
              sx={{
                alignItems: { xs: 'stretch', sm: 'center' },
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                gap: 2,
                justifyContent: 'space-between',
              }}
            >
              <Box>
                <Typography
                  level='title-md'
                  textColor='danger.plainColor'
                  sx={{ fontWeight: 650, mb: 0.5 }}
                >
                  {t('accountSettings.dangerZone')}
                </Typography>
                <Typography
                  level='body-sm'
                  textColor='text.secondary'
                  sx={{ maxWidth: 480, textWrap: 'pretty' }}
                >
                  {t('accountSettings.dangerZoneDescription')}
                </Typography>
              </Box>
              <Button
                variant='outlined'
                color='danger'
                startDecorator={<DeleteOutlineRounded />}
                onClick={() => setUserDeletionModal(true)}
                sx={{ flexShrink: 0 }}
              >
                {t('accountSettings.deleteAccount')}
              </Button>
            </Box>
          </Sheet>
        </Box>
      </Box>

      {changePasswordModal && (
        <PassowrdChangeModal
          isOpen={changePasswordModal}
          onClose={handlePasswordChange}
        />
      )}

      <UserDeletionModal
        isOpen={userDeletionModal}
        onClose={success => {
          setUserDeletionModal(false)
          if (success) {
            showNotification({
              type: 'success',
              message: t('accountSettings.accountDeleted'),
            })
          }
        }}
        userProfile={userProfile}
      />
    </SettingsLayout>
  )
}

export default AccountSettings
