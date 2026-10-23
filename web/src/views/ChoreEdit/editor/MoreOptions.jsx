import { ExpandLess, ExpandMore } from '@mui/icons-material'
import { Box, Typography } from '@mui/joy'
import PropTypes from 'prop-types'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

const rowButton = {
  width: '100%',
  minHeight: 52,
  border: 0,
  background: 'transparent',
  px: 2,
  display: 'flex',
  alignItems: 'center',
  gap: 1.5,
  textAlign: 'left',
  cursor: 'pointer',
  font: 'inherit',
  color: 'text.primary',
  '&:hover': { bgcolor: 'background.level1' },
  '&:focus-visible': {
    outline: '2px solid',
    outlineColor: 'primary.500',
    outlineOffset: -2,
  },
}

// One rarely used setting: a line with its current value that opens in place.
export const OptionRow = ({
  children,
  icon: Icon,
  open: forceOpen,
  title,
  value,
}) => {
  const [open, setOpen] = useState(Boolean(forceOpen))
  const id = useId()
  useEffect(() => {
    if (forceOpen) setOpen(true)
  }, [forceOpen])
  return (
    <Box sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
      <Box
        component='button'
        type='button'
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(value => !value)}
        sx={rowButton}
      >
        {Icon && <Icon sx={{ fontSize: 20, color: 'text.tertiary' }} />}
        <Typography level='title-sm' sx={{ flex: 1 }}>
          {title}
        </Typography>
        {!open && value && (
          <Typography
            level='body-sm'
            sx={{
              color: 'text.secondary',
              maxWidth: '50%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {value}
          </Typography>
        )}
        {open ? (
          <ExpandLess sx={{ fontSize: 20, color: 'text.tertiary' }} />
        ) : (
          <ExpandMore sx={{ fontSize: 20, color: 'text.tertiary' }} />
        )}
      </Box>
      {open && (
        <Box id={id} sx={{ px: 2, pb: 2, pt: 0.5, minWidth: 0 }}>
          {children}
        </Box>
      )}
    </Box>
  )
}

OptionRow.propTypes = {
  children: PropTypes.node,
  icon: PropTypes.elementType,
  open: PropTypes.bool,
  title: PropTypes.node.isRequired,
  value: PropTypes.node,
}

// "More options": everything rarely needed, folded away under one line.
export default function MoreOptions({ children, footer, open: forceOpen }) {
  const { t } = useTranslation('chores')
  const [open, setOpen] = useState(Boolean(forceOpen))
  const id = useId()
  useEffect(() => {
    if (forceOpen) setOpen(true)
  }, [forceOpen])
  return (
    <Box
      component='section'
      data-editor-section='more'
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '20px',
        bgcolor: open ? 'background.surface' : 'transparent',
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      <Box
        component='button'
        type='button'
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(value => !value)}
        sx={{ ...rowButton, minHeight: 64, py: 1.5 }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography level='title-md'>{t('editor.more.title')}</Typography>
          {!open && (
            <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
              {t('editor.more.hint')}
            </Typography>
          )}
        </Box>
        {open ? (
          <ExpandLess sx={{ color: 'text.tertiary' }} />
        ) : (
          <ExpandMore sx={{ color: 'text.tertiary' }} />
        )}
      </Box>
      {open && (
        <Box id={id}>
          {children}
          {footer && (
            <Box
              sx={{
                borderTop: '1px solid',
                borderColor: 'divider',
                px: 2,
                py: 1.75,
              }}
            >
              {footer}
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}

MoreOptions.propTypes = {
  children: PropTypes.node,
  footer: PropTypes.node,
  open: PropTypes.bool,
}
