import {
  Box, Typography, IconButton, Tooltip, CircularProgress,
} from '@mui/material'
import {
  AccessTime, Check, Download,
  InsertDriveFile, PictureAsPdf, TableChart, Slideshow,
  Description, AudioFile, VideoFile, Archive, TextSnippet,
} from '@mui/icons-material'
import MessageActionsMenu from './MessageActionsMenu'
import {
  useMediaAlbumBubbleLogic,
  useMediaAlbumTileLogic,
} from '../handler/componentLogic'

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
  const {
    isMine,
    isImage,
    isVideo,
    isAudio,
    isFile,
    blobUrl,
    loading,
    downloading,
    menuAnchor,
    handleDownload,
    openMenu,
    onTouchStart,
    onTouchEnd,
    closeMenu,
    sharedSx,
    handleOpenImage,
  } = useMediaAlbumTileLogic({ message, totalCount, index })

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
              onClick={handleOpenImage}
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
  const { first, isMine, count, last, failed } = useMediaAlbumBubbleLogic(messages)
  if (!first) return null

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
