import {
  AddRounded,
  ArrowBack,
  Logout,
  SearchRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  IconButton,
  List,
  ListItemButton,
  ListItemDecorator,
  Sheet,
  Typography,
} from '@mui/joy'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'

import HoplaWordmark from '../../components/HoplaWordmark'
import UserProfileAvatar from '../../components/UserProfileAvatar'
import { useNavBarTitleContext } from '../../contexts/NavBarTitleContext'
import { useScrollDirection } from '../../hooks/useScrollDirection'
import { useResource } from '../../queries/ResourceQueries'
import { useGlobalSearch } from '../../search/GlobalSearchContext'
import { apiClient } from '../../utils/ApiClient'
import { learnParent } from '../../utils/learn/routes'
import { MAIN_DESTINATIONS, useNavigationBadges } from './mainNavigation'
import NavBarLink from './NavBarLink'
import NavBarResourceSwitcher from './NavBarResourceSwitcher'
import { openQuickAdd } from './navigationEvents'
import SyncStatusIndicator from './SyncStatusIndicator'

const NAV_WIDTH = 248
const version = import.meta.env.VITE_APP_VERSION
const NAVBAR_TITLE_KEYS = {
  '/activities': 'navigation.activities',
  '/archived': 'navigation.archived',
  '/chores': 'navigation.today',
  '/family': 'navigation.family',
  '/filters': 'navigation.filters',
  '/labels': 'navigation.labels',
  '/learn': 'navigation.learn',
  '/manage': 'navigation.manage',
  '/manage/points': 'manage.items.points.title',
  '/manage/games': 'manage.items.games.title',
  '/manage/ranks': 'manage.items.ranks.title',
  '/manage/reset': 'manage.items.reset.title',
  '/manage/learn': 'manage.items.learn.title',
  '/projects': 'navigation.projects',
  '/settings': 'navigation.settings',
  '/shop': 'navigation.shop',
}
// The four destinations have no back button: the bottom bar takes you there.
const ROOT_PAGES = ['/', '/chores', '/my/chores', '/family', '/shop', '/manage']
const SHELL_FREE_PAGES = [
  '/signup',
  '/login',
  '/auth/oauth2',
  '/forgot-password',
  '/password/update',
  '/login/settings',
  '/welcome',
  '/onboarding',
  '/get-started',
  '/ready',
  '/circle/join',
]

const NavBar = () => {
  const { t } = useTranslation('common')
  const { data: resource } = useResource()
  const { navBarConfig } = useNavBarTitleContext()
  const { openSearch } = useGlobalSearch()
  const badges = useNavigationBadges()
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = useMediaQuery('(max-width:768px)')
  const isDesktop = useMediaQuery('(min-width:1024px)')
  const headerHidden = useScrollDirection({ enabled: !isDesktop })
  const normalizedPath =
    location.pathname.length > 1
      ? location.pathname.replace(/\/$/, '')
      : location.pathname
  const navbarTitleKey = NAVBAR_TITLE_KEYS[normalizedPath]
  const supportsDynamicNavBar =
    normalizedPath === '/chores' || /^\/labels\/[^/]+$/.test(normalizedPath)
  const dynamicNavBarConfig = supportsDynamicNavBar ? navBarConfig : null
  const navbarTitle =
    dynamicNavBarConfig?.title || (navbarTitleKey ? t(navbarTitleKey) : null)
  const showBack = !ROOT_PAGES.includes(normalizedPath)

  // Keep page content and overlays clear of the sidebar.
  useEffect(() => {
    const style = document.documentElement.style
    style.setProperty(
      '--app-navigation-width',
      isDesktop ? `${NAV_WIDTH}px` : '0px',
    )
    style.setProperty(
      '--app-navigation-offset',
      isDesktop ? `${NAV_WIDTH}px` : '0px',
    )
    return () => {
      style.removeProperty('--app-navigation-width')
      style.removeProperty('--app-navigation-offset')
    }
  }, [isDesktop])

  const goBack = () => {
    const parent = learnParent(normalizedPath)
    if (parent) navigate(parent)
    else if (window.history.state?.idx > 0) navigate(-1)
    else navigate(normalizedPath === '/search' ? '/chores' : '/manage')
  }

  if (SHELL_FREE_PAGES.includes(location.pathname)) {
    return (
      <Box aria-hidden='true' sx={{ pt: 'var(--safe-area-inset-top, 0px)' }} />
    )
  }
  if (isMobile && location.pathname === '/search') return null

  if (isDesktop) {
    return (
      <>
        <Box aria-hidden='true' sx={{ flexShrink: 0, width: NAV_WIDTH }} />
        <Sheet
          component='aside'
          variant='plain'
          sx={{
            bgcolor: 'background.body',
            borderInlineEnd: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            height: '100dvh',
            insetInlineStart: 0,
            overflow: 'hidden',
            position: 'fixed',
            pt: 'var(--safe-area-inset-top, 0px)',
            top: 0,
            width: NAV_WIDTH,
            zIndex: 'var(--joy-zIndex-popup)',
          }}
        >
          <Box sx={{ px: 2.5, pt: 2.75, pb: 2 }}>
            <HoplaWordmark height={30} />
          </Box>
          <Box sx={{ display: 'grid', gap: 1, px: 1.5 }}>
            <Button
              startDecorator={<AddRounded />}
              onClick={openQuickAdd}
              sx={{ justifyContent: 'flex-start' }}
            >
              {t('navigation.newTask')}
            </Button>
            <Button
              variant='outlined'
              color='neutral'
              startDecorator={<SearchRounded />}
              endDecorator={
                <Typography
                  level='body-xs'
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 'sm',
                    px: 0.75,
                  }}
                >
                  /
                </Typography>
              }
              onClick={() => openSearch()}
              sx={{
                bgcolor: 'background.surface',
                color: 'text.tertiary',
                fontWeight: 500,
                justifyContent: 'flex-start',
                '& .MuiButton-endDecorator': { ml: 'auto' },
              }}
            >
              {t('navigation.search')}
            </Button>
          </Box>
          <List
            aria-label={t('navigation.primaryNavigation')}
            size='md'
            sx={{ flex: 1, gap: 0.5, minHeight: 0, px: 1.5, py: 2 }}
          >
            {MAIN_DESTINATIONS.map(item => (
              <NavBarLink
                key={item.id}
                link={{
                  active: item.isActive(normalizedPath),
                  badge: badges[item.id],
                  icon: item.icon,
                  label: t(item.labelKey),
                  to: item.to,
                }}
              />
            ))}
          </List>
          <Box
            sx={{
              borderTop: '1px solid',
              borderColor: 'divider',
              p: 1.5,
              pb: 'calc(var(--safe-area-inset-bottom, 0px) + 12px)',
            }}
          >
            <Box sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <UserProfileAvatar showDetails />
              </Box>
              <SyncStatusIndicator />
            </Box>
            <List size='sm' sx={{ p: 0, mt: 0.5 }}>
              <ListItemButton
                onClick={() => apiClient.handleLogout()}
                sx={{ borderRadius: 'md', minHeight: 40 }}
              >
                <ListItemDecorator>
                  <Logout />
                </ListItemDecorator>
                <Typography level='body-sm'>{t('logout')}</Typography>
              </ListItemButton>
            </List>
            <Typography
              level='body-xs'
              onClick={() => window.location.reload()}
              sx={{ color: 'text.tertiary', cursor: 'pointer', px: 1, pt: 0.5 }}
            >
              {resource?.api_version && resource.api_version !== version
                ? t('versionInfoServer', {
                    version,
                    serverVersion: resource.api_version,
                  })
                : t('versionInfo', { version })}
            </Typography>
          </Box>
        </Sheet>
      </>
    )
  }

  return (
    <Sheet
      component='header'
      variant='plain'
      sx={{
        alignItems: 'center',
        backdropFilter: 'blur(16px)',
        bgcolor:
          'color-mix(in srgb, var(--joy-palette-background-body) 90%, transparent)',
        display: 'flex',
        gap: 0.5,
        minHeight: 60,
        position: 'sticky',
        pt: 'var(--safe-area-inset-top, 0px)',
        px: { xs: 1, sm: 2 },
        top: 0,
        transform: headerHidden ? 'translateY(-100%)' : 'translateY(0)',
        transition: 'transform 220ms ease',
        zIndex: 'var(--joy-zIndex-popup)',
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      {showBack ? (
        <IconButton
          variant='plain'
          onClick={goBack}
          aria-label={t('back')}
          sx={{ borderRadius: 'md' }}
        >
          <ArrowBack className='rtl-flip' />
        </IconButton>
      ) : (
        <Box sx={{ width: 4 }} />
      )}
      {dynamicNavBarConfig?.selector ? (
        <NavBarResourceSwitcher
          selector={dynamicNavBarConfig.selector}
          title={navbarTitle}
        />
      ) : (
        <Typography
          component='h1'
          level={showBack ? 'title-lg' : 'h3'}
          sx={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {navbarTitle}
        </Typography>
      )}
      <IconButton
        variant='plain'
        aria-label={t('navigation.search')}
        onClick={() => openSearch()}
        sx={{ borderRadius: '50%' }}
      >
        <SearchRounded />
      </IconButton>
      <SyncStatusIndicator />
      <UserProfileAvatar />
    </Sheet>
  )
}

export default NavBar
