// Token storage + refresh for the compliance API.
//
// Login (via App) writes the session here; screens read from here. "Remember me"
// picks the backing store: localStorage survives the tab, sessionStorage doesn't.
// Only one store is ever populated so a stale token can't outrank a fresh one.

const REFRESH_URL = 'https://backend.alphacapitalgroup.uk/get/refreshtoken/'
const KEYS = ['idToken', 'refreshToken', 'expiresAt']

// The store holding the current session. localStorage wins because clearTokens()
// guarantees the other one is empty.
function activeStore() {
  return localStorage.getItem('idToken') ? localStorage : sessionStorage
}

export function getToken() {
  return activeStore().getItem('idToken') || ''
}

export function getRefreshToken() {
  return activeStore().getItem('refreshToken') || ''
}

export function isTokenExpired() {
  const expiresAt = activeStore().getItem('expiresAt')
  if (!expiresAt) return true
  return Date.now() >= Number(expiresAt)
}

export function clearTokens() {
  KEYS.forEach((k) => { localStorage.removeItem(k); sessionStorage.removeItem(k) })
}

// Accepts the sign-in / refresh payload in either casing the backend uses.
// `remember` is only passed at sign-in; a refresh keeps whichever store is live.
export function saveTokenData(data, { remember } = {}) {
  const idToken = data?.idToken || data?.id_token || ''
  if (!idToken) return ''

  const target = remember === undefined ? activeStore() : (remember ? localStorage : sessionStorage)
  clearTokens() // drop any copy in the other store

  const expiryValue = data?.expiresIn ?? data?.expires_in
  const expiresAt = expiryValue
    ? Date.now() + Number(expiryValue) * 1000
    : Date.now() + 60 * 60 * 1000

  target.setItem('idToken', idToken)
  target.setItem('refreshToken', data?.refreshToken || data?.refresh_token || '')
  target.setItem('expiresAt', String(expiresAt))
  return idToken
}

// Returns the new token, or '' when the session can't be recovered (caller
// should surface an error / bounce to Login).
export async function refreshToken() {
  const refreshValue = getRefreshToken()
  if (!refreshValue) return ''

  const response = await fetch(REFRESH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${refreshValue}`,
    },
    credentials: 'include',
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    console.error('Token refresh failed', response.status, response.statusText, data)
    return ''
  }
  return saveTokenData(data)
}
