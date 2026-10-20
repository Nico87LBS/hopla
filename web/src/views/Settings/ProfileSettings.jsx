import {
  AccessTimeRounded,
  AddAPhotoRounded,
  PersonOutlineRounded,
} from '@mui/icons-material'
import {
  Autocomplete,
  Avatar,
  Box,
  Button,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Sheet,
  Typography,
} from '@mui/joy'
import { useQueryClient } from '@tanstack/react-query'
import PropTypes from 'prop-types'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import PhotoCropModal from '../../components/common/PhotoCropModal'
import { useUserProfile } from '../../queries/UserQueries'
import { useNotification } from '../../service/NotificationProvider'
import { UpdateUserDetails } from '../../utils/Fetcher'
import { resolvePhotoURL } from '../../utils/Helpers'
import LoadingComponent from '../components/Loading'
import SettingsLayout from './SettingsLayout'

const surfaceSx = {
  bgcolor: 'background.surface',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 'xl',
}

const getTimezones = () => {
  if (typeof Intl.supportedValuesOf === 'function') {
    return Intl.supportedValuesOf('timeZone')
  }
  return [Intl.DateTimeFormat().resolvedOptions().timeZone]
}

const ProfileContent = ({ refetchUserProfile, userProfile }) => {
  const { t } = useTranslation('settings')
  const queryClient = useQueryClient()
  const { showError, showSuccess } = useNotification()
  const [displayName, setDisplayName] = useState(userProfile.displayName || '')
  const [timezone, setTimezone] = useState(
    userProfile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  )
  const [isSaving, setIsSaving] = useState(false)
  const fileInputRef = useRef()
  const [selectedFile, setSelectedFile] = useState(null)

  const timezones = getTimezones()

  const closeCropper = () => {
    if (selectedFile) URL.revokeObjectURL(selectedFile)
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handlePhotoChange = event => {
    const file = event.target.files[0]
    if (!file) return
    setSelectedFile(URL.createObjectURL(file))
  }

  const handlePhotoUploaded = async () => {
    await refetchUserProfile()
    showSuccess({
      title: t('profile.photoUpdated'),
      message: t('profile.photoUpdatedMessage'),
    })
  }

  const handleSave = async () => {
    if (!displayName.trim() || !timezone) return
    setIsSaving(true)
    try {
      const response = await UpdateUserDetails({
        displayName: displayName.trim(),
        timezone,
      })
      if (!response.ok) throw new Error('Failed to update profile')

      await queryClient.invalidateQueries({ queryKey: ['userProfile'] })
      showSuccess({
        title: t('profile.profileUpdated'),
        message: t('profile.profileUpdatedMessage'),
      })
    } catch (error) {
      showError({
        title: t('profile.updateFailed'),
        message: t('profile.updateFailedMessage'),
      })
    } finally {
      setIsSaving(false)
    }
  }

  const hasChanges =
    displayName.trim() !== (userProfile.displayName || '') ||
    timezone !==
      (userProfile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone)
  const initials = (displayName || userProfile.displayName || '?')
    .charAt(0)
    .toUpperCase()

  return (
    <SettingsLayout title={t('profile.title')}>
      <Box id='profile' sx={{ maxWidth: 680, pb: 4 }}>
        <Typography
          level='body-md'
          textColor='text.secondary'
          sx={{ maxWidth: 560, mb: 3, mt: -1, textWrap: 'pretty' }}
        >
          {t('profile.description')}
        </Typography>

        <Sheet
          sx={{
            ...surfaceSx,
            alignItems: 'center',
            display: 'flex',
            gap: { xs: 2, sm: 2.5 },
            mb: 2,
            p: { xs: 2, sm: 2.5 },
          }}
        >
          <Box sx={{ flex: '0 0 auto', position: 'relative' }}>
            <Avatar
              src={resolvePhotoURL(userProfile.image)}
              sx={{
                bgcolor: 'primary.softBg',
                color: 'primary.softColor',
                fontSize: '1.75rem',
                fontWeight: 650,
                height: { xs: 76, sm: 88 },
                width: { xs: 76, sm: 88 },
              }}
            >
              {initials}
            </Avatar>
            <IconButton
              size='sm'
              variant='solid'
              color='primary'
              aria-label={t('profile.changePhoto')}
              onClick={() => fileInputRef.current?.click()}
              sx={{
                border: '3px solid',
                borderColor: 'background.surface',
                borderRadius: '50%',
                bottom: -3,
                position: 'absolute',
                right: -3,
              }}
            >
              <AddAPhotoRounded sx={{ fontSize: 17 }} />
            </IconButton>
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography level='title-lg' noWrap>
              {displayName || userProfile.displayName}
            </Typography>
            <Typography
              level='body-sm'
              textColor='text.secondary'
              noWrap
              sx={{ mb: 1.25 }}
            >
              {userProfile.username || userProfile.email}
            </Typography>
            <Button
              size='sm'
              variant='soft'
              startDecorator={<AddAPhotoRounded />}
              onClick={() => fileInputRef.current?.click()}
            >
              {t('profile.changePhoto')}
            </Button>
            <input
              ref={fileInputRef}
              type='file'
              accept='image/*'
              hidden
              onChange={handlePhotoChange}
            />
          </Box>
        </Sheet>

        <Sheet sx={{ ...surfaceSx, overflow: 'hidden', p: { xs: 2, sm: 2.5 } }}>
          <Box sx={{ display: 'grid', gap: 2.25, minWidth: 0 }}>
            <FormControl required sx={{ minWidth: 0 }}>
              <FormLabel>{t('profile.displayName')}</FormLabel>
              <Input
                size='lg'
                value={displayName}
                onChange={event => setDisplayName(event.target.value)}
                placeholder={t('profile.displayNamePlaceholder')}
                startDecorator={<PersonOutlineRounded />}
                sx={{ width: '100%' }}
              />
            </FormControl>

            <FormControl required sx={{ minWidth: 0 }}>
              <FormLabel>{t('profile.timezone')}</FormLabel>
              <Autocomplete
                size='lg'
                sx={{ width: '100%' }}
                value={timezone}
                onChange={(event, newValue) => setTimezone(newValue)}
                options={timezones}
                getOptionLabel={tz => {
                  if (!tz) return ''
                  const formattedTimezone = tz.replace(/_/g, ' ')
                  const currentTime = new Date().toLocaleString(undefined, {
                    timeZone: tz,
                    timeStyle: 'short',
                  })
                  return `${formattedTimezone} (${currentTime})`
                }}
                filterOptions={(options, { inputValue }) => {
                  if (!inputValue) return options
                  const searchTerms = inputValue.toLowerCase().split(/\s+/)
                  return options.filter(tz => {
                    const timezoneLower = tz.toLowerCase()
                    const timezoneParts = timezoneLower.split(/[/_]/)
                    return searchTerms.every(
                      term =>
                        timezoneLower.includes(term) ||
                        timezoneParts.some(part => part.includes(term)),
                    )
                  })
                }}
                placeholder={t('profile.timezonePlaceholder')}
                startDecorator={<AccessTimeRounded />}
              />
            </FormControl>

            <Box
              sx={{
                display: 'flex',
                justifyContent: { xs: 'stretch', sm: 'flex-end' },
                mt: 0.5,
              }}
            >
              <Button
                size='lg'
                loading={isSaving}
                disabled={!hasChanges || !displayName.trim() || !timezone}
                onClick={handleSave}
                sx={{ minWidth: 120, width: { xs: '100%', sm: 'auto' } }}
              >
                {t('profile.save')}
              </Button>
            </Box>
          </Box>
        </Sheet>
      </Box>

      <PhotoCropModal
        image={selectedFile}
        uploadPath='/users/profile_photo'
        onClose={closeCropper}
        onUploaded={handlePhotoUploaded}
      />
    </SettingsLayout>
  )
}

ProfileContent.propTypes = {
  userProfile: PropTypes.object.isRequired,
  refetchUserProfile: PropTypes.func.isRequired,
}

const ProfileSettings = () => {
  const { data: userProfile, refetch: refetchUserProfile } = useUserProfile()
  if (!userProfile) return <LoadingComponent />

  return (
    <ProfileContent
      userProfile={userProfile}
      refetchUserProfile={refetchUserProfile}
    />
  )
}

export default ProfileSettings
