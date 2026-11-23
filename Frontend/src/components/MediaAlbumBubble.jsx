import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useSelector } from 'react-redux'
import {
  Box, Typography, IconButton, Tooltip, CircularProgress,
} from '@mui/material'
import {
  AccessTime, Check, Download,
  InsertDriveFile, PictureAsPdf, TableChart, Slideshow,
  Description, AudioFile, VideoFile, Archive, TextSnippet,
} from '@mui/icons-material'
import { API_BASE } from '../features/media/upload'
import { downloadFile } from '../utils/fileOpener'
import MessageActionsMenu from './MessageActionsMenu'

/* ─── Tick indicators ─────────────────────────────────────────────────────── */
function Ticks({ status }) {
  const color = 'rgba(255,255,255,0.65)'
  const blue  = '#53bdeb'
  if (status === 'sending')   return <AccessTime sx={{ fontSize: 12, ml: 0.5, color, verticalAlign: 'middle' }} />
  if (status === 'sent')      return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', ml: 0.5, verticalAlign: 'middle' }}>
      <Check sx={{ fontSize: 15, color }} />
    </Box>
  )
  if (status === 'delivered') return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', ml: 0.5, verticalAlign: 'middle', position: 'relative', width: 20, height: 15 }}>
      <Check sx={{ fontSize: 15, color, position: 'absolute', left: 0 }} />
      <Check sx={{ fontSize: 15, color, position: 'absolute', left: 6 }} />
    </Box>
  )
  if (status === 'read')      return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', ml: 0.5, verticalAlign: 'middle', position: 'relative', width: 20, height: 15 }}>
      <Check sx={{ fontSize: 15, color: blue, position: 'absolute', left: 0 }} />
      <Check sx={{ fontSize: 15, color: blue, position: 'absolute', left: 6 }} />
    </Box>
  )
  return null
}

/* ─── File type icon ─────────────────────────────────────────────────────── */
function FileIcon({ fileName, fileType }) {
  const ext = (fileName || '').split('.').pop().toLowerCase()
  const sx = { fontSize: 26, color: '#5c7a74' }
  if (ext === 'pdf')                        return <PictureAsPdf sx={{ ...sx, color: '#e53935' }} />
  if (['xls','xlsx','csv'].includes(ext))   return <TableChart   sx={{ ...sx, color: '#43a047' }} />
  if (['ppt','pptx'].includes(ext))         return <Slideshow    sx={{ ...sx, color: '#fb8c00' }} />
  if (['doc','docx'].includes(ext))         return <Description  sx={{ ...sx, color: '#1e88e5' }} />
  if (ext === 'txt')                        return <TextSnippet  sx={{ ...sx, color: '#757575' }} />
  if (ext === 'zip')                        return <Archive      sx={{ ...sx, color: '#8d6e63' }} />
  if (fileType === 'audio')                 return <AudioFile    sx={{ ...sx, color: '#7b1fa2' }} />
  if (fileType === 'video')                 return <VideoFile    sx={{ ...sx, color: '#00838f' }} />
  return <InsertDriveFile sx={sx} />
}

/* ─── Single tile inside the album grid ──────────────────────────────────── */
function AlbumTile({ message, totalCount, index, onDelete, isAdmin }) {
  const token  = useSelector((s) => s.auth.token)
  const isMine = message.mine

  const [blobUrl,     setBlobUrl]     = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState(null)
  const longPressTimer = useRef(null)

  const isImage = message.fileType === 'image'
  const isVideo = message.fileType === 'video'
  const isAudio = message.fileType === 'audio'
  const isFile  = !isImage && !isVideo && !isAudio

  /* ── Canonical proxy URL ── */
  const resolveUrl = useCallback(() => {
    if (!message.fileUrl) return null
    try {
      const parsed       = new URL(message.fileUrl, window.location.href)
      const backendOrigin = new URL(API_BASE, window.location.href).origin
      if (parsed.origin === backendOrigin && parsed.pathname.includes('/uploads/')) {
        return message.fileUrl
      }
      if (!message.roomId) return message.fileUrl
      const filename = parsed.pathname.split('/').pop()
      return filename ? `${API_BASE}/rooms/${message.roomId}/uploads/${filename}` : message.fileUrl
    } catch { return message.fileUrl }
  }, [message.fileUrl, message.roomId])

  /* ── Auth-fetch blob for images and videos ── */
  useEffect(() => {
    if (!isImage && !isVideo) return
    if (!message.fileUrl || !token) return
    const controller  = new AbortController()
    setLoading(true)
    let objectUrl = null

    const makeHeaders = (url) => {
      try {
        const backendOrigin = new URL(API_BASE, window.location.href).origin
        if (new URL(url, window.location.href).origin === backendOrigin) {
          return { Authorization: `Bearer ${token}` }
        }
      } catch { /* ignore */ }
      return {}
    }

    const fetchUrl = (url) =>
      fetch(url, { headers: makeHeaders(url), signal: controller.signal })

    fetchUrl(message.fileUrl)
      .then((r) => {
        if (r.ok) return r
        const proxy = resolveUrl()
        if (proxy && proxy !== message.fileUrl) return fetchUrl(proxy)
        throw new Error(`HTTP ${r.status}`)
      })
      .then((r) => r.blob())
      .then((blob) => {
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setBlobUrl(objectUrl)
        setLoading(false)
      })
      .catch((e) => { if (e.name !== 'AbortError') setLoading(false) })

    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [isImage, isVideo, message.fileUrl, token, resolveUrl])

  /* ── Download handler ── */
  const handleDownload = useCallback(async (e) => {
    e?.stopPropagation()
    if (downloading) return
    const url = resolveUrl()
    if (!url) return
    setDownloading(true)
    try { await downloadFile(url, message.fileName || url.split('/').pop() || 'download', token) }
    catch { /* ignore */ }
    finally { setDownloading(false) }
  }, [downloading, resolveUrl, message.fileName, token])

  const openMenu = useCallback((e) => {
    e.preventDefault()
    if (message.isDeleted || message.id?.startsWith('optimistic-')) return
    setMenuAnchor(e.currentTarget)
  }, [message.isDeleted, message.id])

  const onTouchStart = useCallback((e) => {
    if (message.isDeleted || message.id?.startsWith('optimistic-')) return
    const target = e.currentTarget
    longPressTimer.current = setTimeout(() => setMenuAnchor(target), 500)
  }, [message.isDeleted, message.id])

  const onTouchEnd = useCallback(() => {
    clearTimeout(longPressTimer.current)
  }, [])

  const closeMenu = () => setMenuAnchor(null)

  useEffect(() => () => clearTimeout(longPressTimer.current), [])

  /* ── Grid sizing ──────────────────────────────────────────────────────────
     1 file  → full width, tall
     2 files → side by side, equal halves
     3 files → first item full-width, next two side by side below
     4+      → 2-column grid, equal tiles
  ── */
  const isFullRow  = totalCount === 1 || (totalCount === 3 && index === 0)
  const tileWidth  = isFullRow ? '100%' : 'calc(50% - 1px)'
  const tileHeight = isFullRow
    ? (totalCount === 1 ? 240 : 170)
    : (totalCount === 2 ? 200 : 150)

  const sharedSx = {
    position: 'relative',
    width: tileWidth,
    flexShrink: 0,
    height: tileHeight,
    overflow: 'hidden',
    bgcolor: '#111',
    '&:hover .dl-btn': { opacity: 1 },
    cursor: message.isDeleted || message.id?.startsWith('optimistic-') ? 'default' : 'context-menu',
  }

  return (
    <Box
      sx={sharedSx}
      onContextMenu={openMenu}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >

      {message.isDeleted ? (
        <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 1 }}>
          <Typography variant="caption" sx={{ color: '#aaa', fontStyle: 'italic', textAlign: 'center' }}>
            This message was deleted
          </Typography>
        </Box>
      ) : null}

      {/* ── Image ── */}
      {!message.isDeleted && isImage && (
        loading ? (
          <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress size={22} sx={{ color: '#ccc' }} />
          </Box>
        ) : blobUrl ? (
          <>
            <Box
              component="img"
              src={blobUrl}
              alt={message.fileName || 'image'}
              loading="lazy"
              onClick={() => window.open(blobUrl, '_blank', 'noopener,noreferrer')}
              sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'zoom-in' }}
            />
            <Tooltip title="Download">
              <IconButton
                className="dl-btn"
                size="small"
                onClick={handleDownload}
                disabled={downloading}
                sx={{
                  position: 'absolute', bottom: 6, right: 6,
                  bgcolor: 'rgba(0,0,0,0.5)', color: '#fff', p: 0.5,
                  opacity: 0, transition: 'opacity 0.15s',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' },
                  '@media (hover: none)': { opacity: 1 },
                }}
              >
                {downloading
                  ? <CircularProgress size={14} sx={{ color: '#fff' }} />
                  : <Download sx={{ fontSize: 16 }} />}
              </IconButton>
            </Tooltip>
          </>
        ) : (
          <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="caption" sx={{ color: '#888' }}>Unavailable</Typography>
          </Box>
        )
      )}

      {/* ── Video ── */}
      {!message.isDeleted && isVideo && (
        loading ? (
          <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress size={22} sx={{ color: '#ccc' }} />
          </Box>
        ) : blobUrl ? (
          /* eslint-disable-next-line jsx-a11y/media-has-caption */
          <video
            src={blobUrl}
            controls
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress size={22} sx={{ color: '#ccc' }} />
          </Box>
        )
      )}

      {/* ── Audio tile ── */}
      {!message.isDeleted && isAudio && (
        <Box sx={{
          width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 0.75, p: 1.5,
          bgcolor: isMine ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
        }}>
          <AudioFile sx={{ fontSize: 32, color: '#7b1fa2' }} />
          <Typography variant="caption" noWrap sx={{ maxWidth: '100%', fontSize: '0.65rem', color: isMine ? '#fff' : 'text.secondary' }}>
            {message.fileName || 'Audio'}
          </Typography>
          <Tooltip title="Download">
            <IconButton size="small" onClick={handleDownload} disabled={downloading}
              sx={{ bgcolor: 'rgba(0,0,0,0.3)', color: '#fff', p: 0.5, '&:hover': { bgcolor: 'rgba(0,0,0,0.5)' } }}>
              {downloading
                ? <CircularProgress size={12} sx={{ color: '#fff' }} />
                : <Download sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {/* ── Generic file tile ── */}
      {!message.isDeleted && isFile && (
        <Box sx={{
          width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 0.75, p: 1.5,
          bgcolor: isMine ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
        }}>
          <FileIcon fileName={message.fileName} fileType={message.fileType} />
          <Typography variant="caption" noWrap sx={{ maxWidth: '100%', fontSize: '0.65rem', color: isMine ? '#fff' : 'text.secondary' }}>
            {message.fileName || 'File'}
          </Typography>
          <Tooltip title="Download">
            <IconButton size="small" onClick={handleDownload} disabled={downloading}
              sx={{ bgcolor: 'rgba(0,0,0,0.3)', color: '#fff', p: 0.5, '&:hover': { bgcolor: 'rgba(0,0,0,0.5)' } }}>
              {downloading
                ? <CircularProgress size={12} sx={{ color: '#fff' }} />
                : <Download sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>
        </Box>
      )}

      <MessageActionsMenu
        anchorEl={menuAnchor}
        onClose={closeMenu}
        message={message}
        isAdmin={isAdmin}
        onDelete={onDelete}
      />
    </Box>
  )
}

/* ─── MediaAlbumBubble ────────────────────────────────────────────────────── */
function MediaAlbumBubble({ groupId, messages, onRetry, onDelete, isAdmin }) {
  if (!messages?.length) return null

  const first  = messages[0]
  const isMine = first.mine
  const count  = messages.length

  // The last message in the group carries the definitive status and time
  const last   = messages[messages.length - 1]
  const failed = isMine && messages.some((m) => m.status === 'failed')

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isMine ? 'flex-end' : 'flex-start',
        mb: 1.5,
        px: 1,
      }}
    >
      {/* Sender name in group chats */}
      {!isMine && first.senderName && (
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, color: '#7e57c2', mb: 0.25, px: 0.5 }}
        >
          {first.senderName}
        </Typography>
      )}

      {/* Bubble */}
      <Box
        sx={{
          maxWidth: '75%',
          borderRadius: isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          overflow: 'hidden',
          bgcolor: isMine ? '#3C4F4A' : '#f5f5f5',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          border: failed ? '1px solid #f5c6cb' : 'none',
        }}
      >
        {/* Grid of tiles */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '2px',
            bgcolor: '#000',
            // Clip the gap colour to the rounded corners of the bubble
            overflow: 'hidden',
          }}
        >
          {messages.map((msg, idx) => (
            <AlbumTile
              key={msg.id || idx}
              message={msg}
              totalCount={count}
              index={idx}
              onDelete={onDelete}
              isAdmin={isAdmin}
            />
          ))}
        </Box>

        {/* Meta row: time + ticks */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            px: 1.25,
            py: 0.4,
            gap: 0.4,
            bgcolor: isMine ? '#3C4F4A' : '#f5f5f5',
          }}
        >
          <Typography
            variant="caption"
            sx={{ fontSize: '0.65rem', color: isMine ? 'rgba(255,255,255,0.75)' : '#757575' }}
          >
            {count > 1 && `${count} files · `}{last.time}
          </Typography>
          {isMine && !failed && <Ticks status={last.status} />}
        </Box>
      </Box>

      {/* Failed state */}
      {failed && (
        <Typography variant="caption" sx={{ color: '#c62828', fontSize: '0.65rem', mt: 0.25 }}>
          Some files failed to send
        </Typography>
      )}
    </Box>
  )
}

export default MediaAlbumBubble
