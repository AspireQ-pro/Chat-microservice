import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog, IconButton, Box, CircularProgress, Typography,
} from '@mui/material'
import { Close, ArrowBackIosNew, ArrowForwardIos, Download } from '@mui/icons-material'
import { API_BASE } from '../features/media/upload'

/* Auth fetch — only attaches the JWT when the URL is the chat backend.
   Same logic as MessageBubble so carousel media loads behind auth. */
function authFetch(url, token) {
  let headers = {}
  try {
    const backendOrigin = new URL(API_BASE, window.location.href).origin
    if (token && new URL(url, window.location.href).origin === backendOrigin) {
      headers = { Authorization: `Bearer ${token}` }
    }
  } catch { /* ignore */ }
  return fetch(url, { headers })
}

/* Stable backend proxy URL for a message's attachment (mirrors MessageBubble).
   Falls back to the stored fileUrl when it can't be parsed. */
function resolveProxyUrl(message) {
  if (!message?.fileUrl) return null
  try {
    const parsed = new URL(message.fileUrl, window.location.href)
    const backendOrigin = new URL(API_BASE, window.location.href).origin
    if (parsed.origin === backendOrigin && parsed.pathname.includes('/uploads/')) {
      return message.fileUrl
    }
    if (!message.roomId) return message.fileUrl
    const filename = parsed.pathname.split('/').pop()
    if (!filename) return message.fileUrl
    return `${API_BASE}/rooms/${message.roomId}/uploads/${filename}`
  } catch {
    return message.fileUrl
  }
}

/* Fetch a media message as a blob and return an object URL. Tries the stored
   fileUrl first, then falls back to the canonical proxy URL (handles legacy
   records where fileUrl differs from the proxy path). Works for images and
   videos alike. */
async function fetchMediaBlob(message, token) {
  const tryUrl = async (url) => {
    const r = await authFetch(url, token)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.blob()
  }
  try {
    return await tryUrl(message.fileUrl)
  } catch {
    const proxy = resolveProxyUrl(message)
    if (proxy && proxy !== message.fileUrl) return tryUrl(proxy)
    throw new Error('Media unavailable')
  }
}

/* ───────────────────────────────────────────────────────────────────────────
   ImageLightbox — an in-app carousel for chat media (images and videos).

   Instead of opening media in a new browser tab (window.open), the chat shows
   this full-screen viewer. It walks through every image and video in the
   current room with prev/next arrows, keyboard (←/→/Esc), and touch swipe.
   Each item is fetched with the same auth the inline previews use; videos
   play with native controls inside the viewer.

   Props:
     open    boolean — whether the viewer is showing
     images  array   — the room's media messages (fileType image|video)
     index   number  — starting index in `images`
     onClose func    — close handler
     token   string  — chat JWT (for auth-fetching media)
─────────────────────────────────────────────────────────────────────────── */
export default function ImageLightbox({ open, images, index, onClose, token }) {
  const [current, setCurrent] = useState(index ?? 0)
  const [blobUrl, setBlobUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  /* Sync the displayed item when the viewer is opened on a new one. */
  useEffect(() => {
    if (open) setCurrent(index ?? 0)
  }, [open, index])

  const currentId = images?.[current]?.id

  /* Load the current item's blob with auth. Re-fetch only when the actual
     item (its id) changes, not when the surrounding array reference does —
     so an unrelated Redux update won't trigger a redundant fetch. */
  useEffect(() => {
    if (!open) return
    const message = images?.[current]
    if (!message) return
    let cancelled = false
    let objUrl = null
    setLoading(true)
    setError(false)
    setBlobUrl(null)
    fetchMediaBlob(message, token)
      .then((blob) => {
        if (cancelled) return
        objUrl = URL.createObjectURL(blob)
        setBlobUrl(objUrl)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError(true)
        setLoading(false)
      })
    return () => {
      cancelled = true
      if (objUrl) URL.revokeObjectURL(objUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentId, token])

  const goPrev = useCallback(() => {
    setCurrent((c) => (c - 1 + images.length) % images.length)
  }, [images.length])
  const goNext = useCallback(() => {
    setCurrent((c) => (c + 1) % images.length)
  }, [images.length])

  /* Keyboard navigation (desktop). */
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, goPrev, goNext, onClose])

  /* Touch swipe navigation (mobile). */
  const touchStartX = useRef(null)
  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
  }
  const onTouchEnd = (e) => {
    if (touchStartX.current == null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 50) {
      if (dx > 0) goPrev()
      else goNext()
    }
    touchStartX.current = null
  }

  if (!open || !images?.length) return null

  const message = images[current]
  const isVideo = message?.fileType === 'video'
  const fileName = message?.fileName
    || (message?.fileUrl ? decodeURIComponent(message.fileUrl.split('/').pop().split('?')[0]) : '')
    || 'media'

  const handleDownload = () => {
    if (!blobUrl) return
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = fileName || 'media'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      PaperProps={{ sx: { bgcolor: '#000', p: 0, overflow: 'hidden' } }}
    >
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Media — image or video */}
        {loading ? (
          <CircularProgress sx={{ color: '#fff' }} />
        ) : error ? (
          <Typography sx={{ color: 'rgba(255,255,255,0.7)' }}>
            {isVideo ? 'Video unavailable' : 'Image unavailable'}
          </Typography>
        ) : blobUrl ? (
          isVideo ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={blobUrl}
              controls
              autoPlay
              playsInline
              style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }}
            />
          ) : (
            <Box
              component="img"
              src={blobUrl}
              alt={fileName}
              sx={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          )
        ) : null}

        {/* Top bar: counter + download + close */}
        <Box
          sx={{
            position: 'absolute', top: 0, left: 0, right: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            p: 1, color: '#fff',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.45), transparent)',
          }}
        >
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.9)' }}>
            {current + 1} / {images.length}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <IconButton onClick={handleDownload} disabled={!blobUrl} sx={{ color: '#fff' }} aria-label="Download">
              <Download />
            </IconButton>
            <IconButton onClick={onClose} sx={{ color: '#fff' }} aria-label="Close">
              <Close />
            </IconButton>
          </Box>
        </Box>

        {/* Prev / next arrows — hidden when there's only one item */}
        {images.length > 1 && (
          <>
            <IconButton
              onClick={goPrev}
              aria-label="Previous"
              sx={{
                position: 'absolute', top: '50%', left: 8, transform: 'translateY(-50%)',
                color: '#fff', bgcolor: 'rgba(0,0,0,0.3)',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.5)' },
              }}
            >
              <ArrowBackIosNew />
            </IconButton>
            <IconButton
              onClick={goNext}
              aria-label="Next"
              sx={{
                position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)',
                color: '#fff', bgcolor: 'rgba(0,0,0,0.3)',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.5)' },
              }}
            >
              <ArrowForwardIos />
            </IconButton>
          </>
        )}

        {/* Caption */}
        {fileName && fileName !== 'media' && (
          <Box
            sx={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              p: 1.5, color: '#fff', textAlign: 'center',
              background: 'linear-gradient(to top, rgba(0,0,0,0.45), transparent)',
            }}
          >
            <Typography variant="caption" noWrap sx={{ display: 'block' }}>
              {fileName}
            </Typography>
          </Box>
        )}
      </Box>
    </Dialog>
  )
}
