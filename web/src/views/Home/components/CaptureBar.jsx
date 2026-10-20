import { Add } from '@mui/icons-material'
import { Box, IconButton, Sheet, Typography } from '@mui/joy'
import useMediaQuery from '@mui/material/useMediaQuery'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'

import { useScrollDirection } from '../../../hooks/useScrollDirection'
import { getSafeBottom } from '../../../utils/SafeAreaUtils'

/**
 * Home answers "what's next" and "I just thought of something" with the same
 * screen, so capture is pinned rather than scrolled to.
 */
const CaptureBar = ({ onCapture }) => {
  const { t } = useTranslation('common')
  const isMobile = useMediaQuery('(max-width:768px)')
  const hidden = useScrollDirection({ enabled: isMobile })

  return (
    <Box
      sx={{
        bottom: getSafeBottom(12, 4),
        display: 'flex',
        insetInlineEnd: 0,
        insetInlineStart: 'var(--app-navigation-width, 0px)',
        justifyContent: 'center',
        opacity: hidden ? 0 : 1,
        pointerEvents: 'none',
        position: 'fixed',
        px: 2,
        transform: hidden ? 'translateY(150px)' : 'translateY(0)',
        transition: 'transform 220ms ease, opacity 220ms ease',
        zIndex: 100,
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        '@media (max-width: 768px)': {
          bottom: getSafeBottom(68, 4),
        },
      }}
    >
      <Sheet
        variant='outlined'
        sx={{
          alignItems: 'center',
          borderRadius: '999px',
          boxShadow: 'lg',
          display: 'flex',
          gap: 0.5,
          // Matches the Container maxWidth='sm' content column (600 minus the
          // 2-unit gutters) so the bar lines up with the cards above it.
          maxWidth: 568,
          pointerEvents: hidden ? 'none' : 'auto',
          pl: 2,
          pr: 0.75,
          py: 0.75,
          width: '100%',
        }}
      >
        <Box
          component='button'
          type='button'
          onClick={onCapture}
          sx={{
            background: 'transparent',
            border: 'none',
            cursor: 'text',
            flex: 1,
            font: 'inherit',
            minWidth: 0,
            p: 0,
            textAlign: 'start',
          }}
        >
          <Typography level='body-md' textColor='text.tertiary' noWrap>
            {t('home.capture.placeholder')}
          </Typography>
        </Box>

        <IconButton
          variant='solid'
          color='primary'
          size='sm'
          onClick={onCapture}
          aria-label={t('home.capture.add')}
          sx={{ borderRadius: '50%' }}
        >
          <Add sx={{ fontSize: 20 }} />
        </IconButton>
      </Sheet>
    </Box>
  )
}

CaptureBar.propTypes = {
  onCapture: PropTypes.func.isRequired,
}

export default CaptureBar
