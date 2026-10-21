import { Box } from '@mui/joy'
import { useTranslation } from 'react-i18next'

import { useResponsiveModal } from '../../../hooks/useResponsiveModal'
import RichTextEditor from '../../components/RichTextEditor'

function NoteViewerModal({ config }) {
  const { t } = useTranslation('common')
  const { ResponsiveModal } = useResponsiveModal()

  return (
    <ResponsiveModal
      open={config?.isOpen}
      onClose={config?.onClose}
      size='lg'
      fullWidth={true}
      unmountDelay={250}
      title={config?.title || t('note')}
    >
      <Box sx={{ overflowY: 'auto', maxHeight: '60vh' }}>
        <RichTextEditor value={config?.content || ''} isEditable={false} />
      </Box>
    </ResponsiveModal>
  )
}

export default NoteViewerModal
