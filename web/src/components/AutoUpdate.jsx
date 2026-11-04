import PropTypes from 'prop-types'
import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

import { canReloadNow } from '../utils/autoReload'

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000

/**
 * Installe la nouvelle version de l'interface sans rien demander : le
 * service worker la télécharge, puis la page se recharge au premier moment
 * où personne ne perd rien (voir utils/autoReload).
 */
const AutoUpdate = ({ router }) => {
  const [registration, setRegistration] = useState(null)
  const applying = useRef(false)
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

  // Cherche une nouvelle version toutes les 5 minutes, au retour sur
  // l'onglet et au retour du réseau.
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
      UPDATE_CHECK_INTERVAL_MS,
    )
    window.addEventListener('online', checkForUpdate)
    document.addEventListener('visibilitychange', checkWhenVisible)
    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('online', checkForUpdate)
      document.removeEventListener('visibilitychange', checkWhenVisible)
    }
  }, [registration])

  // Une version attend : on recharge au prochain changement de page, au
  // retour sur l'onglet ou quand la page passe en arrière-plan.
  useEffect(() => {
    if (!needRefresh) return undefined

    const reload = (reason, pathname) => {
      if (applying.current) return
      if (!canReloadNow({ doc: document, pathname, reason })) return
      applying.current = true
      // Active le nouveau service worker ; vite-plugin-pwa recharge la page
      // dès qu'il prend la main.
      updateServiceWorker(true).catch(error => {
        console.error('Service worker update failed', error)
        applying.current = false
      })
    }

    if (document.visibilityState === 'hidden') {
      reload('hidden', window.location.pathname)
    }

    let lastLocation = router.state.location
    const unsubscribe = router.subscribe(state => {
      if (state.navigation.state !== 'idle') return
      if (state.location === lastLocation) return
      lastLocation = state.location
      reload('navigation', state.location.pathname)
    })
    const onVisibilityChange = () => {
      reload(
        document.visibilityState === 'visible' ? 'visible' : 'hidden',
        window.location.pathname,
      )
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [needRefresh, router, updateServiceWorker])

  return null
}

AutoUpdate.propTypes = {
  router: PropTypes.shape({
    state: PropTypes.object.isRequired,
    subscribe: PropTypes.func.isRequired,
  }).isRequired,
}

export default AutoUpdate
