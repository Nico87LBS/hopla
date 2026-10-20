import { Box } from '@mui/joy'
import imageCompression from 'browser-image-compression'
import PropTypes from 'prop-types'
import { useState } from 'react'
import Cropper from 'react-easy-crop'
import { useTranslation } from 'react-i18next'

import { useNotification } from '../../service/NotificationProvider'
import { apiClient } from '../../utils/ApiClient'
import { getCroppedImg } from '../../utils/imageCropUtils'
import AppModal from './AppModal'
import ModalActions from './ModalActions'

// Crops a chosen image to a round 160px avatar, compresses it and uploads it
// to uploadPath. Used for the user's own photo and for child accounts.
const PhotoCropModal = ({ image, onClose, onUploaded, uploadPath }) => {
  const { t } = useTranslation('settings')
  const { showError } = useNotification()
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [isUploading, setIsUploading] = useState(false)

  const close = () => {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    onClose()
  }

  const handleCropSave = async () => {
    if (!croppedAreaPixels) return
    setIsUploading(true)
    try {
      const croppedBlob = await getCroppedImg(
        image,
        croppedAreaPixels,
        160,
        160,
        'image/jpeg',
      )
      const compressedFile = await imageCompression(croppedBlob, {
        maxSizeMB: 0.02,
        maxWidthOrHeight: 160,
        useWebWorker: true,
        fileType: 'image/jpeg',
        initialQuality: 0.8,
      })

      const formData = new FormData()
      formData.append('file', compressedFile, 'profile.jpg')
      const response = await apiClient.upload(uploadPath, formData)
      if (!response.ok) throw new Error('Upload failed')
      await response.json()
      await onUploaded()
      close()
    } catch (error) {
      showError({
        title: t('profile.uploadFailed'),
        message: t('profile.uploadFailedMessage'),
      })
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <AppModal
      open={Boolean(image)}
      onClose={close}
      title={t('profile.editPhoto')}
      size='sm'
      closeOnBackdrop={!isUploading}
      closeOnEscape={!isUploading}
      footer={
        <ModalActions
          secondary={{
            label: t('profile.cancel'),
            disabled: isUploading,
            onClick: close,
          }}
          primary={{
            label: t('profile.save'),
            loading: isUploading,
            disabled: !croppedAreaPixels,
            onClick: handleCropSave,
          }}
        />
      }
    >
      <Box
        sx={{
          aspectRatio: '1',
          bgcolor: 'background.level2',
          borderRadius: 'lg',
          maxWidth: 360,
          mx: 'auto',
          overflow: 'hidden',
          position: 'relative',
          width: '100%',
        }}
      >
        <Cropper
          image={image}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape='round'
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(croppedArea, pixels) => setCroppedAreaPixels(pixels)}
        />
      </Box>
    </AppModal>
  )
}

PhotoCropModal.propTypes = {
  image: PropTypes.string,
  uploadPath: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onUploaded: PropTypes.func.isRequired,
}

export default PhotoCropModal
