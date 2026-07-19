import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { loginWithSSOToken } from '@/provider/authSlice'

/**
 * Call once at the app root (App.jsx).
 *
 * 1. If ?token=<jwt> is in the URL, exchange it for a user object via
 *    POST /auth/sso and store the result in Redux (auth.user).
 * 2. Strip the token from the URL immediately so it doesn't linger in
 *    browser history or get accidentally shared.
 * 3. If auth.user is already set, does nothing.
 *
 * Returns { user, loading, error }.
 */
export function useSSOAuth() {
  const dispatch = useDispatch()
  const user     = useSelector((s) => s.auth.user)
  const loading  = useSelector((s) => s.auth.loading)
  const error    = useSelector((s) => s.auth.error)

  useEffect(() => {
    // Already authenticated — nothing to do.
    if (user) return

    const params = new URLSearchParams(window.location.search)
    const token  = params.get('token')

    // DEV bypass: if no token, inject a mock user so the UI is testable
    // without needing the Society app. Remove before production.
    if (!token) {
      if (import.meta.env.DEV) {
        dispatch({ type: 'auth/loginWithSSOToken/fulfilled', payload: {
          id:    import.meta.env.VITE_DEV_USER_ID    || 'dev-user-001',
          name:  import.meta.env.VITE_DEV_USER_NAME  || 'Dev User',
          email: import.meta.env.VITE_DEV_USER_EMAIL || 'dev@example.com',
        }})
      }
      return
    }

    // Remove the token from the URL before doing anything else.
    // replaceState keeps the current history entry — no extra back-stack entry.
    params.delete('token')
    const newSearch = params.toString()
    window.history.replaceState(
      null,
      '',
      window.location.pathname + (newSearch ? `?${newSearch}` : '')
    )

    dispatch(loginWithSSOToken(token))
  }, [dispatch, user])

  return { user, loading, error }
}
