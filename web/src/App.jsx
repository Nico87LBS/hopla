import './styles/safe-area.css'

import { Box, useColorScheme } from '@mui/joy'
import { useCallback, useEffect } from 'react'
import { Outlet } from 'react-router-dom'

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
import { useFamilyCurrency, useFamilyTimezone } from './queries/UserQueries'
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

const AppContent = () => {
  useSyncOnReconnect()
  // Every date follows the family's time zone: the pages are drawn again
  // when it changes.
  const { data: familyTimezone } = useFamilyTimezone()
  // Every text names what the family earns.
  useFamilyCurrency()

  return (
    <div>
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
