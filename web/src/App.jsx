import './styles/safe-area.css'

import { Box, Button, Snackbar, Typography, useColorScheme } from '@mui/joy'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'

import MobileBottomNav from '@/views/components/MobileBottomNav'
import NavBar from '@/views/components/NavBar'
import QuickAddTask from '@/views/components/QuickAddTask'

import PageTransition from './components/animations/PageTransition'
import { ImpersonateUserProvider } from './contexts/ImpersonateUserContext'
import { KeyboardShortcutScopeProvider } from './contexts/KeyboardShortcutScopeContext'
import { NavBarTitleProvider } from './contexts/NavBarTitleContext'
import SSEProvider from './contexts/SSEContext'
import { AuthProvider } from './hooks/useAuth.jsx'
import { useSyncOnReconnect } from './hooks/useSyncOnReconnect'
import { useResource } from './queries/ResourceQueries'
import { useFamilyTimezone } from './queries/UserQueries'
import { GlobalSearchProvider } from './search/GlobalSearchContext'
import { familyTimezone as currentFamilyTimezone } from './utils/familyTime'
import FamilyTimezoneBanner from './views/components/FamilyTimezoneBanner'
import NetworkBanner from './views/components/NetworkBanner'

const add = className => {
  document.getElementById('root').classList.add(className)
}

const remove = className => {
  document.getElementById('root').classList.remove(className)
}

const SERVICE_WORKER_UPDATE_INTERVAL_MS = 60 * 60 * 1000

/**
 * Registers and manages the PWA service worker.
 */
const WebServiceWorkerManager = () => {
  const { t } = useTranslation()
  const [isUpdating, setIsUpdating] = useState(false)
  const [registration, setRegistration] = useState(null)
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registeredServiceWorker) {
      setRegistration(registeredServiceWorker ?? null)
    },
    onRegisterError(error) {
      console.error('Service worker registration failed', error)
    },
  })

  useEffect(() => {
    if (!registration) return undefined

    const checkForUpdate = () => {
      if (
        !navigator.onLine ||
        document.visibilityState !== 'visible' ||
        registration.installing
      ) {
        return
      }

      registration.update().catch(error => {
        console.error('Service worker update check failed', error)
      })
    }

    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') checkForUpdate()
    }

    const intervalId = window.setInterval(
      checkForUpdate,
      SERVICE_WORKER_UPDATE_INTERVAL_MS,
    )
    window.addEventListener('online', checkForUpdate)
    document.addEventListener('visibilitychange', checkWhenVisible)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('online', checkForUpdate)
      document.removeEventListener('visibilitychange', checkWhenVisible)
    }
  }, [registration])

  const applyUpdate = async () => {
    if (isUpdating) return

    setIsUpdating(true)
    try {
      // With registerType: 'prompt', this asks the waiting worker to activate.
      // vite-plugin-pwa reloads the page once the new worker takes control.
      await updateServiceWorker(true)
    } catch (error) {
      console.error('Service worker update failed', error)
      setIsUpdating(false)
    }
  }

  return (
    <Snackbar
      anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      open={needRefresh}
      variant='solid'
    >
      <Typography level='body-md'>{t('newVersionAvailable')}</Typography>
      <Button
        color='secondary'
        loading={isUpdating}
        onClick={applyUpdate}
        size='small'
        sx={{ ml: 2 }}
      >
        {t('refresh')}
      </Button>
    </Snackbar>
  )
}

const AppContent = () => {
  useSyncOnReconnect()
  // Every date follows the family's time zone: the pages are drawn again
  // when it changes.
  const { data: familyTimezone } = useFamilyTimezone()

  return (
    <div>
      <WebServiceWorkerManager />
      <ImpersonateUserProvider>
        <NavBarTitleProvider>
          <Box
            sx={{
              alignItems: 'stretch',
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              // Only force full viewport height on desktop, where the
              // sidebar NavBar needs to span the full column height. On
              // mobile the NavBar isn't a sidebar, so forcing 100dvh here
              // just leaves blank space below short pages once you scroll.
              '@media (min-width: 1024px)': {
                flexDirection: 'row',
                minHeight: '100dvh',
              },
            }}
          >
            <NavBar />
            <Box
              key={familyTimezone?.timezone ?? currentFamilyTimezone()}
              sx={{ flex: 1, minWidth: 0, width: '100%' }}
            >
              <FamilyTimezoneBanner />
              <PageTransition>
                <Outlet />
              </PageTransition>
              <MobileBottomNav />
              <QuickAddTask />
            </Box>
          </Box>
        </NavBarTitleProvider>
      </ImpersonateUserProvider>
    </div>
  )
}

function App() {
  const resource = useResource()
  const { mode, systemMode } = useColorScheme()

  // startOpenReplay()

  const setThemeClass = useCallback(() => {
    const value = JSON.parse(localStorage.getItem('themeMode')) || mode

    if (value === 'system') {
      if (systemMode === 'dark') {
        return add('dark')
      }
      return remove('dark')
    }

    if (value === 'dark') {
      return add('dark')
    }

    return remove('dark')
  }, [mode, systemMode])

  useEffect(() => {
    setThemeClass()
  }, [setThemeClass])

  return (
    <div>
      <NetworkBanner />

      <AuthProvider>
        <SSEProvider>
          <GlobalSearchProvider>
            <KeyboardShortcutScopeProvider>
              <AppContent />
            </KeyboardShortcutScopeProvider>
          </GlobalSearchProvider>
        </SSEProvider>
      </AuthProvider>
    </div>
  )
}

export default App
