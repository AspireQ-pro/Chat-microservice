import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useSelector } from 'react-redux'
import {
  Box, Typography, Button, IconButton, TextField, Tooltip,
  Menu, MenuItem, ListItemIcon, ListItemText, CircularProgress,
} from '@mui/material'
import { API_BASE } from '../features/media/upload'
import {
  Check, AccessTime, Edit, Delete, DeleteOutline, Close, Send,
  Download, InsertDriveFile, PictureAsPdf, TableChart, Slideshow,
  Description, AudioFile, VideoFile, Archive, TextSnippet,
} from '@mui/icons-material'
import { openFile, triggerDownload, resolveMime } from '../utils/fileOpener'

/* ─── Tick indicators ─────────────────────────────────────────────────────── */
function Ticks({ status }) {
  if (!status) return null
  if (status === 'sending') return <AccessTime sx={{ fontSize: 13, ml: 0.5, color: 'rgba(255,255,255,0.6)' }} />
  if (status === 'sent') return (
    <Box sx={{ display: 'inline-flex', ml: 0.5 }}>
      <Check sx={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }} />
    </Box>
  )
  if (status === 'delivered') return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', ml: 0.5, position: 'relative', width: 18, height: 14 }}>
      <Check sx={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', position: 'absolute', left: 0 }} />
      <Check sx={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', position: 'absolute', left: 4 }} />
    </Box>
  )
  if (status === 'read') return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', ml: 0.5, position: 'relative', width: 18, height: 14 }}>
      <Check sx={{ fontSize: 14, color: '#4fc3f7', position: 'absolute', left: 0 }} />
      <Check sx={{ fontSize: 14, color: '#4fc3f7', position: 'absolute', left: 4 }} />
    </Box>
  )
  return null
}

/* ─── File type icon ─────────────────────────────────────────────────────── */
function FileIcon({ fileName, fileType, sx }) {
  const ext = (fileName || '').split('.').pop().toLowerCase()
  const iconSx = { fontSize: 28, ...sx }
  if (fileType === 'image') return null
  if (ext === 'pdf') return <PictureAsPdf sx={{ ...iconSx, color: '#e53935' }} />
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <TableChart sx={{ ...iconSx, color: '#43a047' }} />
  if (['ppt', 'pptx'].includes(ext)) return <Slideshow sx={{ ...iconSx, color: '#fb8c00' }} />
  if (['doc', 'docx'].includes(ext)) return <Description sx={{ ...iconSx, color: '#1e88e5' }} />
  if (ext === 'txt') return <TextSnippet sx={{ ...iconSx, color: '#757575' }} />
  if (ext === 'zip') return <Archive sx={{ ...iconSx, color: '#8d6e63' }} />
  if (fileType === 'audio' || ['mp3', 'ogg', 'wav'].includes(ext)) return <AudioFile sx={{ ...iconSx, color: '#7b1fa2' }} />
  if (fileType === 'video' || ['mp4', 'webm'].includes(ext)) return <VideoFile sx={{ ...iconSx, color: '#00838f' }} />
  return <InsertDriveFile sx={{ ...iconSx, color: '#546e7a' }} />
}

/* ─── Format file size ───────────────────────────────────────────────────── */
function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/* ─── Auth fetch helper ───────────────────────────────────────────────────── */
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

/* ─── Main component ──────────────────────────────────────────────────────── */
function MessageBubble({ message, onRetry, onEdit, onDelete, isAdmin }) {
  const failed = message.mine && message.status === 'failed'
  const token  = useSelector((state) => state.auth.token)

  /* ── Media blob state — images/audio/video need auth so we load as blob: ── */
  const [mediaBlobUrl, setMediaBlobUrl] = useState(null)
  const [mediaLoading, setMediaLoading] = useState(false)
  const [mediaError, setMediaError]     = useState(false)

  const isImage = message.fileType === 'image'
  const isAudio = message.fileType === 'audio'
  const isVideo = message.fileType === 'video'
  const isFile  = Boolean(message.fileUrl) && !isImage && !isAudio && !isVideo

  /* ── Stable backend proxy URL ── */
  const proxyUrl = useCallback(() => {
    if (!message.fileUrl) return null
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
  }, [message.fileUrl, message.roomId])

  /* ── Fetch media blob for inline rendering (images, audio, video) ── */
  const loadMedia = useCallback(() => {
    const needsBlob = isImage || isAudio || isVideo
    if (!needsBlob || !message.fileUrl || !token || message.isDeleted) return undefined

    const controller = new AbortController()
    setMediaLoading(true)
    setMediaError(false)
    let objectUrl = null

    const doFetch = (url) => authFetch(url, token)

    doFetch(message.fileUrl)
      .then((r) => {
        if (!r.ok) {
          const proxy = proxyUrl()
          if (proxy && proxy !== message.fileUrl) {
            return doFetch(proxy).then((r2) => {
              if (!r2.ok) throw new Error(`HTTP ${r2.status}`)
              return r2
            })
          }
          throw new Error(`HTTP ${r.status}`)
        }
        return r
      })
      .then((r) => r.blob())
      .then((blob) => {
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setMediaBlobUrl(objectUrl)
        setMediaLoading(false)
      })
      .catch((e) => {
        if (e.name !== 'AbortError') {
          console.error('[MessageBubble] media fetch error:', e)
          if (!controller.signal.aborted) {
            setMediaError(true)
            setMediaLoading(false)
          }
        }
      })

    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [isImage, isAudio, isVideo, message.fileUrl, token, message.isDeleted, proxyUrl])

  useEffect(() => {
    setMediaBlobUrl(null)
    setMediaError(false)
    const cleanup = loadMedia()
    return cleanup
  }, [loadMedia])

  /* ── Open file: fetch blob with auth → window.open or OS viewer ── */
  const [opening, setOpening] = useState(false)
  const handleOpenFile = useCallback(async (e) => {
    e?.stopPropagation()
    if (opening) return
    const url = proxyUrl()
    if (!url) return
    setOpening(true)
    try {
      const mime = resolveMime(message.mimeType, message.fileName || '')
      await openFile({
        url,
        fileName: message.fileName || url.split('/').pop().split('?')[0],
        mimeType: mime,
        fileType: message.fileType,
        token,
      })
    } catch (err) {
      console.warn('[MessageBubble] openFile error', err)
    } finally {
      setOpening(false)
    }
  }, [opening, proxyUrl, message.mimeType, message.fileName, message.fileType, token])

  /* ── Open image: use already-loaded blob URL, avoids re-fetch ── */
  const handleOpenImage = useCallback((e) => {
    e?.stopPropagation()
    if (mediaBlobUrl) {
      window.open(mediaBlobUrl, '_blank', 'noopener,noreferrer')
    } else {
      handleOpenFile(e)
    }
  }, [mediaBlobUrl, handleOpenFile])

  /* ── Explicit download: fetch blob → <a download> ── */
  const [downloading, setDownloading] = useState(false)
  const handleDownload = useCallback(async (e) => {
    e?.stopPropagation()
    if (downloading) return
    const url = proxyUrl()
    if (!url) return
    setDownloading(true)
    try {
      const res = await authFetch(url, token)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const fileName = message.fileName || url.split('/').pop().split('?')[0] || 'download'
      triggerDownload(blobUrl, fileName)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000)
    } catch (err) {
      console.error('[MessageBubble] download error', err)
    } finally {
      setDownloading(false)
    }
  }, [downloading, proxyUrl, token, message.fileName])

  /* ── context menu ── */
  const [menuAnchor, setMenuAnchor] = useState(null)
  const longPressTimer = useRef(null)

  const openMenu = useCallback((e) => {
    e.preventDefault()
    if (message.isDeleted || message.id?.startsWith('optimistic-')) return
    setMenuAnchor(e.currentTarget)
  }, [message.isDeleted, message.id])

  const closeMenu = () => setMenuAnchor(null)

  const onTouchStart = useCallback((e) => {
    if (message.isDeleted || message.id?.startsWith('optimistic-')) return
    longPressTimer.current = setTimeout(() => {
      setMenuAnchor(e.currentTarget ?? e.target)
    }, 500)
  }, [message.isDeleted, message.id])

  const onTouchEnd = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }, [])

  /* ── inline edit ── */
  const [editing, setEditing]     = useState(false)
  const [editValue, setEditValue] = useState('')
  const editInputRef              = useRef(null)

  const startEdit = () => {
    setEditValue(message.text)
    setEditing(true)
    closeMenu()
    setTimeout(() => editInputRef.current?.focus(), 50)
  }

  const cancelEdit = () => { setEditing(false); setEditValue('') }

  const submitEdit = () => {
    const trimmed = editValue.trim()
    if (!trimmed || trimmed === message.text) { cancelEdit(); return }
    onEdit?.(message.id, trimmed)
    setEditing(false)
    setEditValue('')
  }

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit() }
    if (e.key === 'Escape') cancelEdit()
  }

  /* ── delete ── */
  const handleDeleteForMe       = () => { onDelete?.(message.id, 'me');        closeMenu() }
  const handleDeleteForEveryone = () => { onDelete?.(message.id, 'everyone'); closeMenu() }

  /* ── derived ── */
  const isTextOnly  = !message.fileUrl && message.messageType === 'text'
  const displayName = message.fileName
    || (message.fileUrl ? decodeURIComponent(message.fileUrl.split('/').pop().split('?')[0]) : '')
  const displaySize = formatFileSize(message.fileSize)
  const iconColor   = message.mine ? 'rgba(255,255,255,0.85)' : '#3C4F4A'
  const mutedColor  = message.mine ? 'rgba(255,255,255,0.7)'  : '#757575'

  return (
    <Box
      sx={{
        display: 'flex', flexDirection: 'column',
        alignItems: message.mine ? 'flex-end' : 'flex-start',
        mb: 1.5, px: 1,
      }}
    >
      <Box
        onContextMenu={openMenu}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        sx={{
          maxWidth: '75%',
          px: isImage && !message.isDeleted ? 0.5 : 2,
          py: isImage && !message.isDeleted ? 0.5 : 1,
          borderRadius: message.mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          bgcolor: message.isDeleted
            ? (message.mine ? 'rgba(60,79,74,0.35)' : '#ececec')
            : failed ? '#fdecea'
              : (message.mine ? '#3C4F4A' : '#f5f5f5'),
          color: message.isDeleted
            ? (message.mine ? 'rgba(255,255,255,0.55)' : '#9e9e9e')
            : failed ? '#b71c1c'
              : (message.mine ? '#fff' : 'text.primary'),
          border: failed ? '1px solid #f5c6cb' : 'none',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          overflow: 'hidden',
          cursor: !message.isDeleted && !message.id?.startsWith('optimistic-') ? 'context-menu' : 'default',
          userSelect: 'none',
        }}
      >
        {/* Sender name */}
        {!message.mine && message.senderName && !message.isDeleted && (
          <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: '#7e57c2', mb: 0.25 }}>
            {message.senderName}
          </Typography>
        )}

        {/* ── Deleted ── */}
        {message.isDeleted ? (
          <Typography variant="body2" sx={{ fontStyle: 'italic', fontSize: '0.82rem', lineHeight: 1.5 }}>
            🚫 This message was deleted
          </Typography>

        ) : editing ? (
          /* ── Inline edit ── */
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 160 }}>
            <TextField
              inputRef={editInputRef}
              fullWidth multiline maxRows={6} size="small"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleEditKeyDown}
              variant="standard"
              sx={{
                '& .MuiInput-root': {
                  color: '#fff', fontSize: '0.875rem',
                  '&:before': { borderBottomColor: 'rgba(255,255,255,0.4)' },
                  '&:after':  { borderBottomColor: '#fff' },
                },
                '& .MuiInput-input': { color: '#fff' },
              }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
              <Tooltip title="Cancel (Esc)">
                <IconButton size="small" onClick={cancelEdit} sx={{ color: mutedColor, p: 0.25 }}>
                  <Close sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Save (Enter)">
                <IconButton
                  size="small" onClick={submitEdit}
                  disabled={!editValue.trim() || editValue.trim() === message.text}
                  sx={{ color: editValue.trim() && editValue.trim() !== message.text ? '#fff' : 'rgba(255,255,255,0.3)', p: 0.25 }}
                >
                  <Send sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

        ) : (
          /* ── Normal content ── */
          <>
            {message.text && (
              <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                {message.text}
              </Typography>
            )}

            {/* ── Image ── */}
            {message.fileUrl && isImage && (
              mediaLoading ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                  <CircularProgress size={16} sx={{ color: mutedColor }} />
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>Loading…</Typography>
                </Box>
              ) : mediaError ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>Image unavailable</Typography>
                  <Button size="small" onClick={() => { setMediaError(false); loadMedia() }}
                    sx={{ minWidth: 0, p: 0, fontSize: '0.65rem', textTransform: 'none', color: iconColor }}>
                    Retry
                  </Button>
                </Box>
              ) : mediaBlobUrl ? (
                <Box
                  component="img" src={mediaBlobUrl}
                  alt={displayName || 'Chat attachment'}
                  loading="lazy"
                  onClick={handleOpenImage}
                  sx={{
                    display: 'block', width: '100%', maxWidth: 260,
                    height: 'auto', maxHeight: 260, objectFit: 'cover',
                    borderRadius: 1, mt: message.text ? 1 : 0.25, cursor: 'pointer',
                  }}
                />
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                  <CircularProgress size={16} sx={{ color: mutedColor }} />
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>Loading…</Typography>
                </Box>
              )
            )}

            {/* ── Audio: inline player using blob URL ── */}
            {message.fileUrl && isAudio && (
              mediaLoading ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                  <CircularProgress size={16} sx={{ color: mutedColor }} />
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>Loading audio…</Typography>
                </Box>
              ) : mediaError ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>Audio unavailable</Typography>
                  <Button size="small" onClick={() => { setMediaError(false); loadMedia() }}
                    sx={{ minWidth: 0, p: 0, fontSize: '0.65rem', textTransform: 'none', color: iconColor }}>Retry</Button>
                </Box>
              ) : mediaBlobUrl ? (
                <Box sx={{ mt: message.text ? 1 : 0.25 }}>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <audio controls src={mediaBlobUrl} style={{ maxWidth: '100%', borderRadius: 8 }} />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                    <Typography variant="caption" noWrap sx={{ opacity: 0.8, maxWidth: 180, fontSize: '0.65rem' }}>{displayName}</Typography>
                    {displaySize && <Typography variant="caption" sx={{ opacity: 0.55, fontSize: '0.6rem', flexShrink: 0 }}>{displaySize}</Typography>}
                  </Box>
                </Box>
              ) : null
            )}

            {/* ── Video: inline player using blob URL ── */}
            {message.fileUrl && isVideo && (
              mediaLoading ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                  <CircularProgress size={16} sx={{ color: mutedColor }} />
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>Loading video…</Typography>
                </Box>
              ) : mediaError ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>Video unavailable</Typography>
                  <Button size="small" onClick={() => { setMediaError(false); loadMedia() }}
                    sx={{ minWidth: 0, p: 0, fontSize: '0.65rem', textTransform: 'none', color: iconColor }}>Retry</Button>
                </Box>
              ) : mediaBlobUrl ? (
                <Box sx={{ mt: message.text ? 1 : 0.25 }}>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video controls src={mediaBlobUrl}
                    style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8, display: 'block' }} />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                    <Typography variant="caption" noWrap sx={{ opacity: 0.8, maxWidth: 180, fontSize: '0.65rem' }}>{displayName}</Typography>
                    {displaySize && <Typography variant="caption" sx={{ opacity: 0.55, fontSize: '0.6rem', flexShrink: 0 }}>{displaySize}</Typography>}
                  </Box>
                </Box>
              ) : null
            )}

            {/* ── Document / generic file card ── */}
            {message.fileUrl && isFile && (
              <Box
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.25,
                  mt: message.text ? 1 : 0.25,
                  px: 1, py: 0.75,
                  bgcolor: message.mine ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
                  borderRadius: 2,
                  minWidth: 180, maxWidth: 260,
                }}
              >
                {/* Click the icon/name → open in viewer */}
                <Box
                  onClick={handleOpenFile}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flex: 1, minWidth: 0, cursor: 'pointer' }}
                >
                  {opening
                    ? <CircularProgress size={22} sx={{ color: iconColor, flexShrink: 0 }} />
                    : <FileIcon fileName={displayName} fileType={message.fileType} />
                  }
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="caption" noWrap
                      sx={{ display: 'block', fontWeight: 600, fontSize: '0.78rem', color: message.mine ? '#fff' : 'text.primary' }}
                    >
                      {displayName || 'File'}
                    </Typography>
                    {displaySize && (
                      <Typography variant="caption" sx={{ opacity: 0.6, fontSize: '0.65rem' }}>
                        {displaySize}
                      </Typography>
                    )}
                  </Box>
                </Box>

                {/* Explicit download — separate action */}
                <Tooltip title="Download">
                  <IconButton
                    size="small"
                    onClick={handleDownload}
                    disabled={downloading}
                    sx={{ color: iconColor, p: 0.25, flexShrink: 0, opacity: 0.75, '&:hover': { opacity: 1 } }}
                  >
                    {downloading
                      ? <CircularProgress size={16} sx={{ color: iconColor }} />
                      : <Download sx={{ fontSize: 18 }} />
                    }
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </>
        )}

        {/* ── Meta row ── */}
        {!message.isDeleted && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mt: 0.3, gap: 0.4, opacity: 0.85 }}>
            {message.editedAt && !editing && (
              <Typography variant="caption" sx={{ fontSize: '0.6rem', fontStyle: 'italic', opacity: 0.75 }}>edited</Typography>
            )}
            <Typography variant="caption" sx={{ fontSize: '0.65rem' }}>{message.time}</Typography>
            {message.mine && !failed && <Ticks status={message.status} />}
          </Box>
        )}
        {message.isDeleted && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.3 }}>
            <Typography variant="caption" sx={{ fontSize: '0.65rem', opacity: 0.55 }}>{message.time}</Typography>
          </Box>
        )}
      </Box>

      {/* Failed retry */}
      {failed && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
          <Typography variant="caption" sx={{ color: '#c62828', fontSize: '0.65rem' }}>Not delivered</Typography>
          <Button size="small" onClick={() => onRetry?.(message)}
            sx={{ minWidth: 0, p: 0, fontSize: '0.65rem', textTransform: 'none' }}>
            Retry
          </Button>
        </Box>
      )}

      {/* Context menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'top', horizontal: message.mine ? 'left' : 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: message.mine ? 'right' : 'left' }}
        PaperProps={{
          sx: { borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', minWidth: 160, py: 0.5 },
        }}
      >
        {isTextOnly && message.mine && (
          <MenuItem onClick={startEdit}
            sx={{ gap: 1, py: 1, px: 1.75, borderRadius: '8px', mx: 0.5, '&:hover': { bgcolor: '#f0f5f4' } }}
          >
            <ListItemIcon sx={{ minWidth: 'auto' }}><Edit sx={{ fontSize: 17, color: '#3C4F4A' }} /></ListItemIcon>
            <ListItemText primary="Edit" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500 }} />
          </MenuItem>
        )}
        <MenuItem onClick={handleDeleteForMe}
          sx={{ gap: 1, py: 1, px: 1.75, borderRadius: '8px', mx: 0.5, '&:hover': { bgcolor: '#f5f5f5' } }}
        >
          <ListItemIcon sx={{ minWidth: 'auto' }}><DeleteOutline sx={{ fontSize: 17, color: '#757575' }} /></ListItemIcon>
          <ListItemText primary="Delete for me" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500, color: '#616161' }} />
        </MenuItem>
        {(message.mine || isAdmin) && (
          <MenuItem onClick={handleDeleteForEveryone}
            sx={{ gap: 1, py: 1, px: 1.75, borderRadius: '8px', mx: 0.5, '&:hover': { bgcolor: '#feebee' } }}
          >
            <ListItemIcon sx={{ minWidth: 'auto' }}><Delete sx={{ fontSize: 17, color: '#c62828' }} /></ListItemIcon>
            <ListItemText
              primary="Delete for everyone"
              primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500, color: '#c62828' }}
            />
          </MenuItem>
        )}
      </Menu>
    </Box>
  )
}

export default MessageBubble
