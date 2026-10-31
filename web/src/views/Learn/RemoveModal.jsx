import { Checkbox, Typography } from '@mui/joy'
import PropTypes from 'prop-types'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import ConfirmationModal from '../Modals/Inputs/ConfirmationModal'

// RemoveModal asks before removing a module or a pack, with a box to also
// forget what everyone learned there and the games they played. onClose
// gets whether to remove, then whether to forget.
const RemoveModal = ({ name, onClose }) => {
  const { t } = useTranslation('learn')
  const [forget, setForget] = useState(false)
  return (
    <ConfirmationModal
      config={{
        isOpen: true,
        title: t('manage.removeTitle', { name }),
        message: t('manage.removeMessage'),
        confirmText: t('manage.remove'),
        cancelText: t('manage.cancel'),
        color: 'danger',
        content: (
          <>
            <Checkbox
              sx={{ mt: 2 }}
              color='danger'
              checked={forget}
              onChange={e => setForget(e.target.checked)}
              label={t('manage.removeForget')}
            />
            <Typography
              level='body-sm'
              sx={{ color: 'text.tertiary', mt: 0.5, pl: 4 }}
            >
              {forget
                ? t('manage.removeForgetOn')
                : t('manage.removeForgetOff')}
            </Typography>
          </>
        ),
        onClose: ok => onClose(ok, forget),
      }}
    />
  )
}

RemoveModal.propTypes = {
  name: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
}

export default RemoveModal
