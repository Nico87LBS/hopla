import { AddRounded } from '@mui/icons-material'
import { Box, Sheet, Typography } from '@mui/joy'
import useMediaQuery from '@mui/material/useMediaQuery'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'

import { HOPLA } from '../../constants/theme'
import { MAIN_DESTINATIONS, useNavigationBadges } from './mainNavigation'
import { openQuickAdd } from './navigationEvents'

const HIDDEN_ROUTES = [
  '/signup',
  '/login',
  '/auth',
  '/forgot-password',
  '/password/update',
  '/welcome',
  '/onboarding',
  '/get-started',
  '/ready',
  '/family/join',
  '/landing',
  '/privacy',
  '/terms',
  '/search',
]

const BAR_HEIGHT = 64

const isTaskDetailRoute = pathname =>
  /^\/chores\/(create|[^/]+\/(?:edit|timer))$/.test(pathname)

const NavItem = ({ active, badge, icon, label, to }) => (
  <Box
    component={Link}
    to={to}
    aria-current={active ? 'page' : undefined}
    sx={{
      alignItems: 'center',
      color: active ? 'primary.plainColor' : 'text.tertiary',
      display: 'flex',
      flex: 1,
      flexDirection: 'column',
      gap: 0.5,
      justifyContent: 'center',
      minHeight: BAR_HEIGHT,
      minWidth: 0,
      position: 'relative',
      textDecoration: 'none',
      WebkitTapHighlightColor: 'transparent',
      '& svg': { fontSize: 24 },
      '&:active svg': { transform: 'scale(.92)' },
    }}
  >
    <Box sx={{ position: 'relative', display: 'flex' }}>
      {icon}
      {badge > 0 && (
        <Box
          component='span'
          sx={{
            bgcolor: HOPLA.carrot,
            border: '2px solid',
            borderColor: 'background.surface',
            borderRadius: 999,
            color: HOPLA.ink,
            font: '700 10px/14px var(--joy-fontFamily-body)',
            minWidth: 18,
            position: 'absolute',
            px: 0.5,
            right: -12,
            textAlign: 'center',
            top: -6,
          }}
        >
          {badge}
        </Box>
      )}
    </Box>
    <Typography
      level='body-xs'
      sx={{
        color: 'inherit',
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        lineHeight: 1,
      }}
    >
      {label}
    </Typography>
  </Box>
)

NavItem.propTypes = {
  active: PropTypes.bool.isRequired,
  badge: PropTypes.number,
  icon: PropTypes.node.isRequired,
  label: PropTypes.string.isRequired,
  to: PropTypes.string.isRequired,
}

// Phone and tablet: the four destinations, with the new-task button between
// Famille and Boutique so it is always in the same place.
const MobileBottomNav = () => {
  const { t } = useTranslation('common')
  const isDesktop = useMediaQuery('(min-width:1024px)')
  const location = useLocation()
  const badges = useNavigationBadges()
  const pathname = location.pathname

  const hidden =
    isDesktop ||
    HIDDEN_ROUTES.some(route => pathname.startsWith(route)) ||
    isTaskDetailRoute(pathname)
  if (hidden) return null

  const items = MAIN_DESTINATIONS.map(item => (
    <NavItem
      key={item.id}
      active={item.isActive(pathname)}
      badge={badges[item.id]}
      icon={item.icon}
      label={t(item.labelKey)}
      to={item.to}
    />
  ))

  return (
    <>
      <Sheet
        component='nav'
        aria-label={t('navigation.primaryNavigation')}
        variant='plain'
        sx={{
          alignItems: 'stretch',
          bgcolor: 'background.surface',
          borderTop: '1px solid',
          borderColor: 'divider',
          bottom: 0,
          display: 'flex',
          height: `calc(${BAR_HEIGHT}px + var(--safe-area-inset-bottom, 0px))`,
          insetInline: 0,
          pb: 'var(--safe-area-inset-bottom, 0px)',
          position: 'fixed',
          zIndex: 'var(--joy-zIndex-popup)',
        }}
      >
        {items.slice(0, 2)}
        <Box
          sx={{
            alignItems: 'center',
            display: 'flex',
            flex: 1,
            justifyContent: 'center',
          }}
        >
          <Box
            component='button'
            type='button'
            onClick={openQuickAdd}
            aria-label={t('navigation.newTask')}
            sx={{
              alignItems: 'center',
              bgcolor: 'primary.solidBg',
              border: 0,
              borderRadius: '16px',
              boxShadow: '0 6px 16px rgba(91, 79, 224, .35)',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              height: 48,
              justifyContent: 'center',
              width: 48,
              WebkitTapHighlightColor: 'transparent',
              '&:active': { transform: 'scale(.94)' },
              '& svg': { color: '#fff', fontSize: 28 },
            }}
          >
            <AddRounded />
          </Box>
        </Box>
        {items.slice(2)}
      </Sheet>
      <Box
        aria-hidden='true'
        sx={{
          height: `calc(${BAR_HEIGHT}px + var(--safe-area-inset-bottom, 0px))`,
        }}
      />
    </>
  )
}

export default MobileBottomNav
