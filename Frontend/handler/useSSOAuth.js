import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { loginWithSSOToken } from '@pages/Dashboard/Chat/provider/authSlice'

/**
 * Call this hook once at the top of the Chat app (e.g. in App.jsx or a root
 * layout component).
 *
 * Behaviour:
 *  1. If ?token=<jwt> is present in the URL, exchange it for a user object
 *     via POST /auth/sso and store the result in Redux (auth.user).
 *  2. Strip the token from the URL immediately so it doesn't linger in
 *     browser history or get copied in sharing.
 *  3. If auth.user is already set (e.g. on re-render), does nothing.
 *
 * Returns { user, loading, error } from the auth slice.
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

    if (!token) return

    // Remove the token from the URL before doing anything else.
    // replaceState keeps the current history entry; no extra entry is added.
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
