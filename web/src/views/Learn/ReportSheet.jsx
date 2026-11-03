import { RecordVoiceOverRounded } from '@mui/icons-material'
import { Button, Chip, Stack, Textarea, Typography } from '@mui/joy'
import PropTypes from 'prop-types'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import ModalActions from '../../components/common/ModalActions'
import { useIsParent } from '../../hooks/useIsParent'
import { useResponsiveModal } from '../../hooks/useResponsiveModal'
import { sendReport } from '../../queries/LearnQueries'
import { useNotification } from '../../service/NotificationProvider'
import { inPlayPages } from '../../utils/learn/playSession'
import { recentSounds, redoSounds } from '../../utils/learn/serverVoice'
import { generateUUID } from '../../utils/UUID'

export const REASONS = ['pas-claire', 'reponse-fausse', 'faute', 'autre']
const MAX_COMMENT = 500

// RedoSounds lets a parent have the server's voice make the sounds of the
// question again, when one is badly said: the voice draws a little at
// random, and a sound is kept once made.
const RedoSounds = () => {
  const { t } = useTranslation('learn')
  const { showNotification } = useNotification()
  const isParent = useIsParent()
  const [redoing, setRedoing] = useState(false)
  const [redone, setRedone] = useState(false)
  if (!isParent) return null
  const redo = async () => {
    setRedoing(true)
    try {
      await redoSounds()
      setRedone(true)
      showNotification({ type: 'success', message: t('report.redone') })
    } catch (err) {
      showNotification({ type: 'error', message: err.message })
    } finally {
      setRedoing(false)
    }
  }
  return (
    <Stack gap={0.5}>
      <Button
        variant='outlined'
        color='neutral'
        startDecorator={<RecordVoiceOverRounded />}
        loading={redoing}
        disabled={redone}
        onClick={redo}
        sx={{ alignSelf: 'flex-start' }}
      >
        {t('report.redo')}
      </Button>
      <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
        {t('report.redoHelp')}
      </Typography>
    </Stack>
  )
}

// ReportSheet reports the question on screen, with a reason and a comment,
// for the parents to look at. Offline, the report waits like the games.
const ReportSheet = ({ given, item, moduleId, onClose, userId }) => {
  const { t } = useTranslation('learn')
  const { ResponsiveModal } = useResponsiveModal()
  const { showNotification } = useNotification()
  const [reason, setReason] = useState('pas-claire')
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const send = async () => {
    setSending(true)
    try {
      await sendReport({
        clientId: generateUUID(),
        module: moduleId,
        card: item.source,
        key: item.key,
        prompt: item.prompt,
        expected: item.answer,
        given: given || '',
        reason,
        comment: comment.trim(),
        userId,
        reportedAt: new Date().toISOString(),
      })
      showNotification({ type: 'success', message: t('report.thanks') })
      onClose()
    } catch (err) {
      showNotification({ type: 'error', message: err.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <ResponsiveModal
      open
      onClose={onClose}
      size='md'
      title={t('report.title')}
      footer={
        <ModalActions
          secondary={{ label: t('manage.cancel'), onClick: onClose }}
          primary={{ label: t('report.send'), onClick: send, loading: sending }}
        />
      }
    >
      {/* The game listens to the keyboard: what is typed here stays here. */}
      <Stack gap={2} onKeyDown={e => e.stopPropagation()}>
        <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
          « {item.prompt} »
        </Typography>
        <Stack direction='row' gap={1} flexWrap='wrap'>
          {REASONS.map(value => (
            <Chip
              key={value}
              variant={reason === value ? 'solid' : 'outlined'}
              color={reason === value ? 'primary' : 'neutral'}
              aria-pressed={reason === value}
              onClick={() => setReason(value)}
              sx={{ minHeight: 36, px: 1.5 }}
            >
              {t(`report.reasons.${value}`)}
            </Chip>
          ))}
        </Stack>
        <Textarea
          minRows={3}
          maxRows={6}
          value={comment}
          onChange={e => setComment(e.target.value.slice(0, MAX_COMMENT))}
          placeholder={t('report.comment')}
        />
        <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>
          {t('report.help')}
        </Typography>
        {!inPlayPages() && recentSounds().length > 0 && <RedoSounds />}
      </Stack>
    </ResponsiveModal>
  )
}

ReportSheet.propTypes = {
  given: PropTypes.string,
  item: PropTypes.object.isRequired,
  moduleId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  userId: PropTypes.number.isRequired,
}

export default ReportSheet
