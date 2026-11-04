import React, { useEffect, useRef } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, IconButton, CircularProgress, Tooltip,
} from '@mui/material'
import {
  Close, Download, PictureAsPdf, TableChart, Slideshow,
  Description, InsertDriveFile, Archive, TextSnippet,
} from '@mui/icons-material'

/* ─── Which file types can be previewed in-browser ─────────────────────────── */
function getPreviewKind(fileName, fileType) {
  const ext = (fileName || '').split('.').pop().toLowerCase()
  if (fileType === 'image' || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image'
  if (fileType === 'video' || ['mp4', 'webm'].includes(ext)) return 'video'
  if (fileType === 'audio' || ['mp3', 'ogg', 'wav'].includes(ext)) return 'audio'
  if (ext === 'pdf') return 'pdf'
  if (['txt', 'csv'].includes(ext)) return 'text'
  return 'unsupported'
}

function UnsupportedIcon({ fileName, fileType, sx }) {
  const ext = (fileName || '').split('.').pop().toLowerCase()
  const props = { sx: { fontSize: 48, ...sx } }
  if (ext === 'pdf') return <PictureAsPdf {...props} sx={{ ...props.sx, color: '#e53935' }} />
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <TableChart {...props} sx={{ ...props.sx, color: '#43a047' }} />
  if (['ppt', 'pptx'].includes(ext)) return <Slideshow {...props} sx={{ ...props.sx, color: '#fb8c00' }} />
  if (['doc', 'docx'].includes(ext)) return <Description {...props} sx={{ ...props.sx, color: '#1e88e5' }} />
  if (ext === 'txt') return <TextSnippet {...props} sx={{ ...props.sx, color: '#757575' }} />
  if (ext === 'zip') return <Archive {...props} sx={{ ...props.sx, color: '#8d6e63' }} />
  return <InsertDriveFile {...props} sx={{ ...props.sx, color: '#546e7a' }} />
}

/* ─── Main dialog ────────────────────────────────────────────────────────────── */
function FilePreviewDialog({
  open,
  onClose,
  blobUrl,        // object URL created by MessageBubble (already fetched & auth'd)
  fileName,
  fileType,
  fileSize,
  loading,        // still fetching
  error,          // fetch failed
  onRetryLoad,
  onDownload,
}) {
  const iframeRef = useRef(null)
  const kind = getPreviewKind(fileName, fileType)

  // Revoke nothing here — blob URL lifecycle is managed by MessageBubble
  useEffect(() => {
    if (!open && iframeRef.current) {
      iframeRef.current.src = ''
    }
  }, [open])

  const displayName = fileName || 'File'

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={kind === 'image' ? 'md' : 'lg'}
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '16px',
          bgcolor: '#1a1a1a',
          color: '#fff',
          height: kind === 'pdf' || kind === 'text' || kind === 'video' ? '90vh' : 'auto',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* ── Header ── */}
      <DialogTitle
        sx={{
          display: 'flex', alignItems: 'center', gap: 1,
          py: 1.25, px: 2,
          bgcolor: '#111',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}
      >
        <Typography
          noWrap
          sx={{ flex: 1, fontWeight: 600, fontSize: '0.9rem', color: '#e0e0e0' }}
        >
          {displayName}
        </Typography>

        <Tooltip title="Download">
          <span>
            <IconButton
              size="small"
              onClick={onDownload}
              disabled={!blobUrl}
              sx={{ color: '#90caf9', '&:hover': { bgcolor: 'rgba(144,202,249,0.1)' }, '&:disabled': { color: 'rgba(255,255,255,0.2)' } }}
            >
              <Download sx={{ fontSize: 20 }} />
            </IconButton>
          </span>
        </Tooltip>

        <IconButton
          size="small"
          onClick={onClose}
          sx={{ color: 'rgba(255,255,255,0.6)', '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' }, ml: 0.5 }}
        >
          <Close sx={{ fontSize: 20 }} />
        </IconButton>
      </DialogTitle>

      {/* ── Body ── */}
      <DialogContent
        sx={{
          p: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flex: 1,
          minHeight: 0,
          bgcolor: '#1a1a1a',
        }}
      >
        {loading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 6 }}>
            <CircularProgress sx={{ color: '#90caf9' }} />
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>Loading preview…</Typography>
          </Box>
        )}

        {error && !loading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 6 }}>
            <Typography variant="body2" sx={{ color: '#ef9a9a' }}>Could not load the file.</Typography>
            <Button
              size="small" variant="outlined"
              onClick={onRetryLoad}
              sx={{ color: '#90caf9', borderColor: '#90caf9', textTransform: 'none', borderRadius: 2 }}
            >
              Retry
            </Button>
          </Box>
        )}

        {!loading && !error && blobUrl && (
          <>
            {/* ── Image ── */}
            {kind === 'image' && (
              <Box
                component="img"
                src={blobUrl}
                alt={displayName}
                sx={{
                  maxWidth: '100%',
                  maxHeight: 'calc(90vh - 120px)',
                  objectFit: 'contain',
                  display: 'block',
                  borderRadius: 1,
                }}
              />
            )}

            {/* ── PDF ── */}
            {kind === 'pdf' && (
              <Box
                ref={iframeRef}
                component="iframe"
                src={blobUrl}
                title={displayName}
                sx={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  display: 'block',
                  bgcolor: '#fff',
                }}
              />
            )}

            {/* ── Plain text / CSV ── */}
            {kind === 'text' && (
              <Box
                component="iframe"
                src={blobUrl}
                title={displayName}
                sx={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  display: 'block',
                  bgcolor: '#fff',
                }}
              />
            )}

            {/* ── Video ── */}
            {kind === 'video' && (
              <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center', p: 2 }}>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  controls
                  src={blobUrl}
                  style={{ maxWidth: '100%', maxHeight: 'calc(90vh - 160px)', borderRadius: 8, display: 'block' }}
                />
              </Box>
            )}

            {/* ── Audio ── */}
            {kind === 'audio' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, py: 5, px: 4 }}>
                <Typography variant="body2" noWrap sx={{ color: 'rgba(255,255,255,0.7)', maxWidth: 320 }}>
                  {displayName}
                </Typography>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio controls src={blobUrl} style={{ width: '100%', maxWidth: 380 }} />
              </Box>
            )}

            {/* ── Unsupported ── */}
            {kind === 'unsupported' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2.5, py: 6, px: 4 }}>
                <UnsupportedIcon fileName={fileName} fileType={fileType} />
                <Typography variant="body1" fontWeight={600} sx={{ color: '#e0e0e0', textAlign: 'center' }}>
                  Preview not available
                </Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', maxWidth: 320 }}>
                  This file type can't be previewed in the browser. Download it to open it on your device.
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<Download />}
                  onClick={onDownload}
                  disabled={!blobUrl}
                  sx={{
                    mt: 1,
                    bgcolor: '#2D4A44', textTransform: 'none', borderRadius: 2,
                    fontWeight: 600, px: 3,
                    '&:hover': { bgcolor: '#213832' },
                  }}
                >
                  Download {displayName}
                </Button>
              </Box>
            )}
          </>
        )}
      </DialogContent>

      {/* ── Footer: Download button (always visible except unsupported which has it inline) ── */}
      {kind !== 'unsupported' && !loading && !error && blobUrl && (
        <DialogActions
          sx={{
            px: 2, py: 1.25,
            bgcolor: '#111',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            justifyContent: 'flex-end',
            flexShrink: 0,
          }}
        >
          {fileSize > 0 && (
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', mr: 'auto', fontSize: '0.72rem' }}>
              {fileSize < 1024 ? `${fileSize} B`
                : fileSize < 1024 * 1024 ? `${(fileSize / 1024).toFixed(1)} KB`
                : `${(fileSize / (1024 * 1024)).toFixed(1)} MB`}
            </Typography>
          )}
          <Button
            variant="contained"
            startIcon={<Download sx={{ fontSize: '1rem !important' }} />}
            onClick={onDownload}
            size="small"
            sx={{
              bgcolor: '#2D4A44', textTransform: 'none', borderRadius: 2,
              fontWeight: 600, fontSize: '0.82rem', px: 2,
              '&:hover': { bgcolor: '#213832' },
            }}
          >
            Download
          </Button>
        </DialogActions>
      )}
    </Dialog>
  )
}

export default FilePreviewDialog
