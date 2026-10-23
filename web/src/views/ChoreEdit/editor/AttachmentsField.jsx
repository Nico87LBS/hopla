import { AttachFile, Delete, UploadFile } from '@mui/icons-material'
import { Box, Button, IconButton, Typography } from '@mui/joy'
import PropTypes from 'prop-types'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useNotification } from '../../../service/NotificationProvider'
import {
  DeleteChoreAttachment,
  DeleteDraftAttachment,
  UploadChoreAttachment,
} from '../../../utils/Fetcher'
import { resolvePhotoURL } from '../../../utils/Helpers'
import { getImageSrc, removeCachedImage } from '../../../utils/ImageCache'

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']

// The files of a task: added, opened and removed in place. A new task keeps
// them as a server-side draft until it is saved.
export default function AttachmentsField({
  attachments,
  choreId,
  draftId,
  onAttachmentsChange,
  onViewImage,
}) {
  const { t } = useTranslation('chores')
  const { showError } = useNotification()
  const [uploading, setUploading] = useState(false)

  const upload = async e => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const response = choreId
        ? await UploadChoreAttachment(file, 'chore_attachment', {
            entityId: choreId,
          })
        : await UploadChoreAttachment(file, 'chore_attachment_draft', {
            draftId,
          })
      if (!response.ok) {
        showError({
          title: t('taskEditor.uploadFailed'),
          message: t('taskEditor.uploadFailedMessage'),
        })
        return
      }
      const data = await response.json()
      onAttachmentsChange(prev => [
        ...prev,
        {
          file_path: data.path,
          file_name: data.file_name,
          size_bytes: data.size_bytes,
          sign: data.sign,
        },
      ])
    } catch {
      showError({
        title: t('taskEditor.uploadFailed'),
        message: t('taskEditor.uploadFailedMessage'),
      })
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const open = async att => {
    const url = await getImageSrc(
      att.file_path,
      att.sign ? resolvePhotoURL(att.sign) : null,
      { choreId, kind: 'attachment' },
    ).catch(() => resolvePhotoURL(att.sign || att.file_path))
    const ext = (att.file_name || '').split('.').pop().toLowerCase()
    if (IMAGE_EXTENSIONS.includes(ext)) {
      onViewImage({ url, fileName: att.file_name })
    } else {
      const a = document.createElement('a')
      a.href = url
      a.download = att.file_name || 'attachment'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  }

  const remove = (att, idx) => {
    // Draft uploads live server-side too: delete them there so they are not
    // promoted onto the task on save.
    const request = choreId
      ? DeleteChoreAttachment(choreId, att.file_path).then(() =>
          removeCachedImage(att.file_path),
        )
      : DeleteDraftAttachment(att.file_path)
    request
      .then(() =>
        onAttachmentsChange(prev =>
          choreId
            ? prev.filter(a => a.file_path !== att.file_path)
            : prev.filter((_, i) => i !== idx),
        ),
      )
      .catch(() =>
        showError({
          title: t('taskEditor.deleteFailed'),
          message: t('taskEditor.deleteFailedMessage'),
        }),
      )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {attachments.map((att, idx) => (
        <Box
          key={att.file_path || idx}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            pl: 1,
            borderRadius: '12px',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box
            component='button'
            type='button'
            onClick={() => open(att)}
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              border: 0,
              background: 'transparent',
              cursor: 'pointer',
              font: 'inherit',
              color: 'text.primary',
              textAlign: 'left',
            }}
          >
            <AttachFile sx={{ fontSize: 18, color: 'text.tertiary' }} />
            <Typography
              level='body-sm'
              sx={{ flex: 1, wordBreak: 'break-all' }}
            >
              {att.file_name}
            </Typography>
            {att.size_bytes && (
              <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
                {(att.size_bytes / 1024).toFixed(1)}
                {t('taskEditor.kb')}
              </Typography>
            )}
          </Box>
          <IconButton
            variant='plain'
            color='danger'
            aria-label={t('editor.more.removeFile', { name: att.file_name })}
            onClick={() => remove(att, idx)}
          >
            <Delete sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      ))}
      <Button
        component='label'
        variant='outlined'
        color='neutral'
        startDecorator={uploading ? null : <UploadFile />}
        loading={uploading}
        sx={{ alignSelf: 'flex-start' }}
      >
        {t('editor.more.addFile')}
        <input type='file' hidden onChange={upload} />
      </Button>
    </Box>
  )
}

AttachmentsField.propTypes = {
  attachments: PropTypes.array.isRequired,
  choreId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  draftId: PropTypes.string,
  onAttachmentsChange: PropTypes.func.isRequired,
  onViewImage: PropTypes.func.isRequired,
}
