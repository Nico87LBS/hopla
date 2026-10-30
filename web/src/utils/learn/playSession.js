import { apiClient } from '../ApiClient'

// A family screen opens a child's games without signing in: a link good
// once (/play/<code>) is traded for a play session that can only play. The
// session lives in this tab only, and only the /play pages use it.

const KEY = 'hoplaPlay'
export const PLAY_HEADER = 'X-Hopla-Play'

export const inPlayPages = () =>
  typeof window !== 'undefined' && window.location.pathname.startsWith('/play')

export const playSession = () => {
  try {
    const session = JSON.parse(sessionStorage.getItem(KEY))
    return session && new Date(session.expiresAt) > new Date() ? session : null
  } catch {
    return null
  }
}

const keep = session => {
  try {
    if (session) sessionStorage.setItem(KEY, JSON.stringify(session))
    else sessionStorage.removeItem(KEY)
  } catch {
    // Without storage, the games still work until the page reloads.
  }
}

const url = async path => {
  await apiClient.init()
  return `${apiClient.getApiURL()}${path}`
}

// playFetch calls a play route with the session, never the sign-in.
export const playFetch = async (path, options = {}) =>
  fetch(await url(`/learn/play${path}`), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      [PLAY_HEADER]: playSession()?.token || '',
    },
  })

// startPlay trades the link for a session and keeps it.
export const startPlay = async code => {
  const resp = await fetch(await url('/learn/play/start'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  const body = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    const err = new Error(body.error || `Error ${resp.status}`)
    err.status = resp.status
    throw err
  }
  keep(body.res)
  return body.res
}

export const endPlay = async () => {
  if (!playSession()) return
  await playFetch('/session', { method: 'DELETE' }).catch(() => {})
  keep(null)
}
