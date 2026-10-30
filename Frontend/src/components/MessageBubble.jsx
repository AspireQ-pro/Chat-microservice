import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useSelector } from 'react-redux'
import { Box, Typography, Button, IconButton, TextField, Tooltip, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material'
import { API_BASE } from '../features/media/upload'
import { Check, AccessTime, Edit, Delete, DeleteOutline, Close, Send } from '@mui/icons-material'

/* ─── Tick indicators ─────────────────────────────────────────────────────── */
function Ticks({ status }) {
  if (!status) return null

  if (status === 'sending') {
    return <AccessTime sx={{ fontSize: 13, ml: 0.5, color: 'rgba(255,255,255,0.6)' }} />
  }
  if (status === 'sent') {
    return (
      <Box sx={{ display: 'inline-flex', ml: 0.5 }}>
        <Check sx={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }} />
      </Box>
    )
  }
  if (status === 'delivered') {
    return (
      <Box sx={{ display: 'inline-flex', alignItems: 'center', ml: 0.5, position: 'relative', width: 18, height: 14 }}>
        <Check sx={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', position: 'absolute', left: 0 }} />
        <Check sx={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', position: 'absolute', left: 4 }} />
      </Box>
    )
  }
  if (status === 'read') {
    return (
      <Box sx={{ display: 'inline-flex', alignItems: 'center', ml: 0.5, position: 'relative', width: 18, height: 14 }}>
        <Check sx={{ fontSize: 14, color: '#4fc3f7', position: 'absolute', left: 0 }} />
        <Check sx={{ fontSize: 14, color: '#4fc3f7', position: 'absolute', left: 4 }} />
      </Box>
    )
  }
  return null
}

/* ─── Main component ──────────────────────────────────────────────────────── */
function MessageBubble({ message, onRetry, onEdit, onDelete, isAdmin }) {
  const failed    = message.mine && message.status === 'failed'
  const token     = useSelector((state) => state.auth.token)

  /* ── attachment loading ── */
  const [attachmentUrl, setAttachmentUrl] = useState(null)
  useEffect(() => {
    if (!message.fileUrl || !token || message.isDeleted) {
      setAttachmentUrl(null)
      return undefined
    }
    const controller = new AbortController()
    let objectUrl = null
    setAttachmentUrl(null)
    let headers = {}
    try {
      // S3 presigned URLs authenticate through their query signature. Send the
      // Chat JWT only when the URL is a legacy/backend media endpoint.
      if (new URL(message.fileUrl, window.location.href).origin === new URL(API_BASE, window.location.href).origin) {
        headers = { Authorization: `Bearer ${token}` }
      }
    } catch {
      headers = { Authorization: `Bearer ${token}` }
    }
    fetch(message.fileUrl, { headers, signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error(); return r.blob() })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        if (!controller.signal.aborted) setAttachmentUrl(objectUrl)
      })
      .catch((e) => { if (e.name !== 'AbortError') console.error(e) })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [message.fileUrl, token, message.isDeleted])

  /* ── context menu ── */
  const [menuAnchor, setMenuAnchor] = useState(null)
  const longPressTimer = useRef(null)

  const openMenu = useCallback((e) => {
    e.preventDefault()
    // Any non-deleted, persisted message can be acted on (delete for me
    // applies to others' messages too).
    if (message.isDeleted || message.id?.startsWith('optimistic-')) return
    setMenuAnchor(e.currentTarget)
  }, [message.isDeleted, message.id])

  const closeMenu = () => setMenuAnchor(null)

  // Long-press for touch devices
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
    // Focus input on next tick
    setTimeout(() => editInputRef.current?.focus(), 50)
  }

  const cancelEdit = () => {
    setEditing(false)
    setEditValue('')
  }

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
  const handleDeleteForMe = () => {
    onDelete?.(message.id, 'me')
    closeMenu()
  }
  const handleDeleteForEveryone = () => {
    onDelete?.(message.id, 'everyone')
    closeMenu()
  }

  /* ─── render ─────────────────────────────────────────────────────────── */
  const isTextOnly = !message.fileUrl && message.messageType === 'text'

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
          px: message.fileType === 'image' && !message.isDeleted ? 0.5 : 2,
          py: message.fileType === 'image' && !message.isDeleted ? 0.5 : 1,
          borderRadius: message.mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          bgcolor: message.isDeleted
            ? (message.mine ? 'rgba(60,79,74,0.35)' : '#ececec')
            : failed
              ? '#fdecea'
              : (message.mine ? '#3C4F4A' : '#f5f5f5'),
          color: message.isDeleted
            ? (message.mine ? 'rgba(255,255,255,0.55)' : '#9e9e9e')
            : failed
              ? '#b71c1c'
              : (message.mine ? '#fff' : 'text.primary'),
          border: failed ? '1px solid #f5c6cb' : 'none',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          overflow: 'hidden',
          cursor: !message.isDeleted && !message.id?.startsWith('optimistic-') ? 'context-menu' : 'default',
          userSelect: 'none',
        }}
      >
        {/* Sender name — group messages from others */}
        {!message.mine && message.senderName && !message.isDeleted && (
          <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: '#7e57c2', mb: 0.25 }}>
            {message.senderName}
          </Typography>
        )}

        {/* ── Deleted placeholder ── */}
        {message.isDeleted ? (
          <Typography
            variant="body2"
            sx={{ fontStyle: 'italic', fontSize: '0.82rem', lineHeight: 1.5 }}
          >
            🚫 This message was deleted
          </Typography>
        ) : editing ? (
          /* ── Inline edit input ── */
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 160 }}>
            <TextField
              inputRef={editInputRef}
              fullWidth
              multiline
              maxRows={6}
              size="small"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleEditKeyDown}
              variant="standard"
              sx={{
                '& .MuiInput-root': {
                  color: '#fff',
                  fontSize: '0.875rem',
                  '&:before': { borderBottomColor: 'rgba(255,255,255,0.4)' },
                  '&:after':  { borderBottomColor: '#fff' },
                },
                '& .MuiInput-input': { color: '#fff' },
              }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
              <Tooltip title="Cancel (Esc)">
                <IconButton size="small" onClick={cancelEdit} sx={{ color: 'rgba(255,255,255,0.7)', p: 0.25 }}>
                  <Close sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Save (Enter)">
                <IconButton
                  size="small"
                  onClick={submitEdit}
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
            {message.fileUrl && message.fileType === 'image' && (
              attachmentUrl ? (
                <Box
                  component="img"
                  src={attachmentUrl}
                  alt="Chat attachment"
                  loading="lazy"
                  sx={{
                    display: 'block', width: '100%', maxWidth: 260,
                    height: 'auto', maxHeight: 260, objectFit: 'cover',
                    borderRadius: 1, mt: message.text ? 1 : 0.25,
                  }}
                />
              ) : (
                <Typography variant="caption">Loading image…</Typography>
              )
            )}
            {message.fileUrl && message.fileType !== 'image' && attachmentUrl && (
              <Button
                component="a" href={attachmentUrl} target="_blank" rel="noopener noreferrer"
                size="small"
                sx={{ color: message.mine ? '#fff' : '#3C4F4A', textTransform: 'none', px: 0, minWidth: 0 }}
              >
                📎 Open PDF
              </Button>
            )}
          </>
        )}

        {/* ── Meta row: time + edited label + ticks ── */}
        {!message.isDeleted && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mt: 0.3, gap: 0.4, opacity: 0.85 }}>
            {message.editedAt && !editing && (
              <Typography variant="caption" sx={{ fontSize: '0.6rem', fontStyle: 'italic', opacity: 0.75 }}>
                edited
              </Typography>
            )}
            <Typography variant="caption" sx={{ fontSize: '0.65rem' }}>
              {message.time}
            </Typography>
            {message.mine && !failed && <Ticks status={message.status} />}
          </Box>
        )}
        {message.isDeleted && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.3 }}>
            <Typography variant="caption" sx={{ fontSize: '0.65rem', opacity: 0.55 }}>{message.time}</Typography>
          </Box>
        )}
      </Box>

      {/* Failed retry row */}
      {failed && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
          <Typography variant="caption" sx={{ color: '#c62828', fontSize: '0.65rem' }}>Not delivered</Typography>
          <Button size="small" onClick={() => onRetry?.(message)} sx={{ minWidth: 0, p: 0, fontSize: '0.65rem', textTransform: 'none' }}>
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
          sx: {
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            minWidth: 160,
            py: 0.5,
          },
        }}
      >
        {/* Edit — only for own text messages */}
        {isTextOnly && message.mine && (
          <MenuItem
            onClick={startEdit}
            sx={{ gap: 1, py: 1, px: 1.75, borderRadius: '8px', mx: 0.5, '&:hover': { bgcolor: '#f0f5f4' } }}
          >
            <ListItemIcon sx={{ minWidth: 'auto' }}>
              <Edit sx={{ fontSize: 17, color: '#3C4F4A' }} />
            </ListItemIcon>
            <ListItemText
              primary="Edit"
              primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500 }}
            />
          </MenuItem>
        )}
        {/* Delete for me — available for any message */}
        <MenuItem
          onClick={handleDeleteForMe}
          sx={{ gap: 1, py: 1, px: 1.75, borderRadius: '8px', mx: 0.5, '&:hover': { bgcolor: '#f5f5f5' } }}
        >
          <ListItemIcon sx={{ minWidth: 'auto' }}>
            <DeleteOutline sx={{ fontSize: 17, color: '#757575' }} />
          </ListItemIcon>
          <ListItemText
            primary="Delete for me"
            primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500, color: '#616161' }}
          />
        </MenuItem>
        {/* Delete for everyone — own messages or admin */}
        {(message.mine || isAdmin) && (
          <MenuItem
            onClick={handleDeleteForEveryone}
            sx={{ gap: 1, py: 1, px: 1.75, borderRadius: '8px', mx: 0.5, '&:hover': { bgcolor: '#feebee' } }}
          >
            <ListItemIcon sx={{ minWidth: 'auto' }}>
              <Delete sx={{ fontSize: 17, color: '#c62828' }} />
            </ListItemIcon>
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
