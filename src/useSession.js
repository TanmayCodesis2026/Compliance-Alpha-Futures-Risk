import { useCallback, useEffect, useState } from 'react'
import {
  clearTokens, getToken, msUntilRefresh, onSessionExpired, refreshToken, saveTokenData,
} from './auth.js'

// Owns the signed-in token for the app shell and keeps it alive.
//
// Three things call the refresh logic, which is why it lives here rather than in
// a screen:
//   1. a timer that fires shortly before the stamped expiry (proactive),
//   2. returning to a tab that slept through its expiry,
//   3. authFetch() reacting to a 401 — which broadcasts via onSessionExpired()
//      when it can't recover, dropping us back to Login.
export function useSession() {
  const [idToken, setIdToken] = useState(getToken)

  const signIn = useCallback((data, remember) => {
    const token = saveTokenData(data, { remember })
    setIdToken(token)
    return token
  }, [])

  const signOut = useCallback(() => {
    clearTokens()
    setIdToken('')
  }, [])

  // authFetch() gives up -> drop the token so the shell renders Login.
  useEffect(() => onSessionExpired(() => setIdToken('')), [])

  // Proactive refresh. Re-arms on every token change, so each new token
  // schedules the next hop and the chain continues for as long as the tab lives.
  useEffect(() => {
    if (!idToken) return

    let cancelled = false
    const renew = async () => {
      const fresh = await refreshToken()
      if (cancelled) return
      // '' means unrecoverable; onSessionExpired above handles the 401 path, so
      // clear here too for the "refresh endpoint itself failed" case.
      setIdToken(fresh || '')
      if (!fresh) clearTokens()
    }

    // setTimeout clamps above ~24.8 days (32-bit ms); nothing here comes close,
    // but a 0 delay would busy-loop, so an already-due token renews immediately.
    const timer = setTimeout(renew, msUntilRefresh())
    return () => { cancelled = true; clearTimeout(timer) }
  }, [idToken])

  // A backgrounded tab's timer can fire late (or be throttled entirely), so
  // re-check on focus and top up if the token lapsed while we weren't looking.
  useEffect(() => {
    if (!idToken) return

    const check = async () => {
      if (document.visibilityState !== 'visible' || msUntilRefresh() > 0) return
      const fresh = await refreshToken()
      setIdToken(fresh || '')
      if (!fresh) clearTokens()
    }

    document.addEventListener('visibilitychange', check)
    return () => document.removeEventListener('visibilitychange', check)
  }, [idToken])

  return { idToken, signIn, signOut }
}
