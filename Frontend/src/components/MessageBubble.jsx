import {
  Box, Typography, Button, IconButton, TextField, Tooltip,
  CircularProgress,
} from '@mui/material'
import {
  Check, AccessTime, Close, Send,
  Download, InsertDriveFile, PictureAsPdf, TableChart, Slideshow,
  Description, AudioFile, VideoFile, Archive, TextSnippet,
} from '@mui/icons-material'
import MessageActionsMenu from './MessageActionsMenu'
import { useMessageBubbleLogic } from '../handler/componentLogic'

/* ─── Tick indicators ─────────────────────────────────────────────────────── */
function Ticks({ status }) {
  if (!status) return null
  if (status === 'sending') return <AccessTime sx={{ fontSize: 12, ml: 0.5, color: 'rgba(255,255,255,0.55)', verticalAlign: 'middle' }} />
  if (status === 'sent') return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', ml: 0.5, verticalAlign: 'middle' }}>
      <Check sx={{ fontSize: 15, color: 'rgba(255,255,255,0.7)' }} />
    </Box>
  )
  if (status === 'delivered') return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', ml: 0.5, verticalAlign: 'middle', position: 'relative', width: 20, height: 15 }}>
      <Check sx={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', position: 'absolute', left: 0 }} />
      <Check sx={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', position: 'absolute', left: 6 }} />
    </Box>
  )
  if (status === 'read') return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', ml: 0.5, verticalAlign: 'middle', position: 'relative', width: 20, height: 15 }}>
      <Check sx={{ fontSize: 15, color: '#53bdeb', position: 'absolute', left: 0 }} />
      <Check sx={{ fontSize: 15, color: '#53bdeb', position: 'absolute', left: 6 }} />
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

/* ─── Main component ──────────────────────────────────────────────────────── */
function MessageBubble({ message, onRetry, onEdit, onDelete, isAdmin }) {
  const {
    failed,
    isImage,
    isAudio,
    isVideo,
    isFile,
    mediaBlobUrl,
    mediaLoading,
    mediaError,
    retryMedia,
    opening,
    handleOpenFile,
    handleOpenImage,
    downloading,
    handleDownload,
    menuAnchor,
    openMenu,
    closeMenu,
    onTouchStart,
    onTouchEnd,
    editing,
    editValue,
    editInputRef,
    startEdit,
    cancelEdit,
    submitEdit,
    handleEditChange,
    handleEditKeyDown,
    handleRetry,
    isTextOnly,
    displayName,
    displaySize,
    iconColor,
    mutedColor,
  } = useMessageBubbleLogic({ message, onRetry, onEdit })

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
        {/* Sender name in group chats — shown on both normal and deleted messages */}
        {!message.mine && message.senderName && (
          <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: '#7e57c2', mb: 0.25 }}>
            {message.senderName}
          </Typography>
        )}

        {/* ── Deleted placeholder ── */}
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
              onChange={handleEditChange}
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

            {/* ── Image ──────────────────────────────────────────────────────
                Blob is loaded with auth and rendered inline as a thumbnail.
                Clicking the image opens it in a new browser tab (native viewer).
                A download button is overlaid in the bottom-right corner. ── */}
            {message.fileUrl && isImage && (
              mediaLoading ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                  <CircularProgress size={16} sx={{ color: mutedColor }} />
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>Loading…</Typography>
                </Box>
              ) : mediaError ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>Image unavailable</Typography>
                  <Button size="small" onClick={retryMedia}
                    sx={{ minWidth: 0, p: 0, fontSize: '0.65rem', textTransform: 'none', color: iconColor }}>
                    Retry
                  </Button>
                </Box>
              ) : mediaBlobUrl ? (
                <Box
                  sx={{
                    position: 'relative', display: 'inline-block',
                    mt: message.text ? 1 : 0.25,
                    '&:hover .img-download-btn': { opacity: 1 },
                  }}
                >
                  <Box
                    component="img" src={mediaBlobUrl}
                    alt={displayName || 'Chat attachment'}
                    loading="lazy"
                    onClick={handleOpenImage}
                    sx={{
                      display: 'block', width: '100%', maxWidth: 260,
                      height: 'auto', maxHeight: 260, objectFit: 'cover',
                      borderRadius: 1, cursor: 'pointer',
                    }}
                  />
                  {/* Download button — overlaid on hover (or always visible on touch) */}
                  <Tooltip title="Download image">
                    <IconButton
                      className="img-download-btn"
                      size="small"
                      onClick={handleDownload}
                      disabled={downloading}
                      sx={{
                        position: 'absolute', bottom: 6, right: 6,
                        bgcolor: 'rgba(0,0,0,0.45)', color: '#fff',
                        p: 0.5, opacity: 0,
                        transition: 'opacity 0.15s',
                        '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
                        // Always show on touch devices
                        '@media (hover: none)': { opacity: 1 },
                      }}
                    >
                      {downloading
                        ? <CircularProgress size={14} sx={{ color: '#fff' }} />
                        : <Download sx={{ fontSize: 16 }} />
                      }
                    </IconButton>
                  </Tooltip>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                  <CircularProgress size={16} sx={{ color: mutedColor }} />
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>Loading…</Typography>
                </Box>
              )
            )}

            {/* ── Audio ──────────────────────────────────────────────────────
                Inline <audio controls> player using an auth-fetched blob URL.
                No click-to-open — the player is the interaction. ── */}
            {message.fileUrl && isAudio && (
              mediaLoading ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                  <CircularProgress size={16} sx={{ color: mutedColor }} />
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>Loading audio…</Typography>
                </Box>
              ) : mediaError ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>Audio unavailable</Typography>
                  <Button size="small" onClick={retryMedia}
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

            {/* ── Video ──────────────────────────────────────────────────────
                Inline <video controls> player using an auth-fetched blob URL.
                No click-to-open — the player is the interaction. ── */}
            {message.fileUrl && isVideo && (
              mediaLoading ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                  <CircularProgress size={16} sx={{ color: mutedColor }} />
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>Loading video…</Typography>
                </Box>
              ) : mediaError ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>Video unavailable</Typography>
                  <Button size="small" onClick={retryMedia}
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

            {/* ── Document / generic file card ───────────────────────────────
                Clicking the icon or filename runs openFile() directly —
                no dialog or modal in between.
                openFile() waterfall:
                  • Android bridge  → OS app chooser
                  • iOS bridge      → open-in / share sheet
                  • Web Share API   → mobile OS share sheet
                  • Blob → new tab  → browser viewer (PDF, text…) or OS handler
                Download is a separate explicit button. ── */}
            {message.fileUrl && isFile && (
              <Box
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.25,
                  mt: message.text ? 1 : 0.25,
                  px: 1, py: 0.75,
                  bgcolor: message.mine ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
                  borderRadius: 2,
                  minWidth: 0, maxWidth: 260,
                }}
              >
                {/* Click icon or filename → openFile() waterfall (no dialog) */}
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

                {/* Explicit download — always a separate action */}
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

        {/* ── Meta row (time + delivery ticks) ── */}
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

      {/* Failed — show error + retry link */}
      {failed && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
          <Typography variant="caption" sx={{ color: '#c62828', fontSize: '0.65rem' }}>Not delivered</Typography>
          <Button size="small" onClick={handleRetry}
            sx={{ minWidth: 0, p: 0, fontSize: '0.65rem', textTransform: 'none' }}>
            Retry
          </Button>
        </Box>
      )}

      <MessageActionsMenu
        anchorEl={menuAnchor}
        onClose={closeMenu}
        message={message}
        isAdmin={isAdmin}
        onDelete={onDelete}
        canEdit={isTextOnly && message.mine}
        onEdit={startEdit}
        canDownload={(isImage || isFile) && Boolean(message.fileUrl)}
        downloadLabel={isImage ? 'Save image' : 'Download'}
        onDownload={handleDownload}
      />
    </Box>
  )
}

export default MessageBubble
