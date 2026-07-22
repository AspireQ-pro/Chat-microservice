import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { setAuth } from '@/provider/authSlice'

function decodeToken(token) {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(atob(payload))
  } catch {
    return null
  }
}

export function useSSOAuth() {
  const dispatch = useDispatch()
  const user = useSelector((s) => s.auth.user)
  const token = useSelector((s) => s.auth.token)
  const loading = useSelector((s) => s.auth.loading)
  const error = useSelector((s) => s.auth.error)

  useEffect(() => {
    if (user && token) return

    const params = new URLSearchParams(window.location.search)
    const tokenFromUrl = params.get('token')

    if (!tokenFromUrl) {
      if (import.meta.env.DEV || import.meta.env.VITE_ALLOW_DEV_LOGIN === 'true') {
        dispatch(setAuth({
          token: 'dev-mock-token',
          user: {
            id: import.meta.env.VITE_DEV_USER_ID || 'dev-user-001',
            name: import.meta.env.VITE_DEV_USER_NAME || 'Dev User',
            email: import.meta.env.VITE_DEV_USER_EMAIL || 'dev@example.com',
          },
        }))
      }
      return
    }

    params.delete('token')
    const newSearch = params.toString()
    window.history.replaceState(
      null, '',
      window.location.pathname + (newSearch ? `?${newSearch}` : '')
    )

    const decoded = decodeToken(tokenFromUrl)
    dispatch(setAuth({
      token: tokenFromUrl,
      user: {
        id: decoded?.userId,
        name: decoded?.name,
        email: decoded?.email,
      },
    }))
  }, [dispatch, user, token])

  return { user, token, loading, error }
}
