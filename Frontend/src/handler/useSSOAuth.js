import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { setAuth } from '@/provider/authSlice'

function decodeToken(token) {
  try {
    const payload = token.split('.')[1]
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
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

  useEffect(() => {
    const handleSessionRefresh = (event) => {
      const expectedOrigin = import.meta.env.VITE_SOCIETY_ORIGIN
        ? new URL(import.meta.env.VITE_SOCIETY_ORIGIN).origin
        : document.referrer
          ? new URL(document.referrer).origin
          : null
      if (!expectedOrigin || event.origin !== expectedOrigin) return
      if (event.source !== window.parent) return
      if (event.data?.source !== "society-management") return
      if (event.data?.type !== "chat:session-token") return
      if (typeof event.data?.token !== "string") return

      const refreshedUser = decodeToken(event.data.token)
      if (!refreshedUser?.userId || !refreshedUser?.projectId) return
      dispatch(setAuth({
        token: event.data.token,
        user: {
          id: refreshedUser.userId,
          name: refreshedUser.name,
          email: refreshedUser.email,
        },
      }))
    }

    window.addEventListener("message", handleSessionRefresh)
    return () => window.removeEventListener("message", handleSessionRefresh)
  }, [dispatch])

  return { user, token, loading, error }
}
