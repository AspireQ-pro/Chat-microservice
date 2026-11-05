import React, { useEffect, useRef, useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, IconButton, CircularProgress, Tooltip, Chip,
} from '@mui/material'
import {
  Close, Download, OpenInNew, Share,
  PictureAsPdf, TableChart, Slideshow,
  Description, InsertDriveFile, Archive, TextSnippet,
  AudioFile, VideoFile,
} from '@mui/icons-material'
import { openFile, triggerDownload, resolveMime, isBrowserRenderable } from '../utils/fileOpener'
import { canWebShare, isMobileBrowser } from '../utils/platform'

/* ─── File-type utilities ─────────────────────────────────────────────────── */

/**
 * Detect what kind of preview we can render inside the dialog.
 * 'unsupported' means we can't render it here; caller may still open externally.
 */
function getPreviewKind(fileName, fileType) {
  const ext = (fileName || '').split('.').pop().toLowerCase()
  if (fileType === 'image' || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image'
  if (fileType === 'video' || ['mp4', 'webm'].includes(ext)) return 'video'
  if (fileType === 'audio' || ['mp3', 'ogg', 'wav'].includes(ext)) return 'audio'
  if (ext === 'pdf' || fileType === 'pdf') return 'pdf'
  if (['txt', 'csv'].includes(ext)) return 'text'
  return 'unsupported'
}

/**
 * Large icon for the "unsupported" card, colour-coded by type.
 */
function FileTypeIcon({ fileName, fileType, size = 56 }) {
  const ext = (fileName || '').split('.').pop().toLowerCase()
  const sx = { fontSize: size }
  if (ext === 'pdf' || fileType === 'pdf') return <PictureAsPdf sx={{ ...sx, color: '#e53935' }} />
  if (['xls', 'xlsx'].includes(ext)) return <TableChart sx={{ ...sx, color: '#43a047' }} />
  if (['ppt', 'pptx'].includes(ext)) return <Slideshow sx={{ ...sx, color: '#fb8c00' }} />
  if (['doc', 'docx'].includes(ext)) return <Description sx={{ ...sx, color: '#1e88e5' }} />
  if (ext === 'txt') return <TextSnippet sx={{ ...sx, color: '#90a4ae' }} />
  if (ext === 'csv') return <TableChart sx={{ ...sx, color: '#26a69a' }} />
  if (ext === 'zip' || ext === 'rar' || ext === '7z') return <Archive sx={{ ...sx, color: '#8d6e63' }} />
  if (fileType === 'audio' || ['mp3', 'ogg', 'wav'].includes(ext)) return <AudioFile sx={{ ...sx, color: '#7b1fa2' }} />
  if (fileType === 'video' || ['mp4', 'webm'].includes(ext)) return <VideoFile sx={{ ...sx, color: '#00838f' }} />
  return <InsertDriveFile sx={{ ...sx, color: '#546e7a' }} />
}

/** Human-readable file size */
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Uppercase extension badge */
function ExtBadge({ fileName, fileType }) {
  const ext = (fileName || '').split('.').pop().toUpperCase()
  if (!ext || ext === fileName?.toUpperCase()) return null
  return (
    <Chip
      label={ext}
      size="small"
      sx={{
        height: 18, fontSize: '0.6rem', fontWeight: 700,
        bgcolor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 1, px: 0.25,
        '.MuiChip-label': { px: 0.75 },
      }}
    />
  )
}

/* ─── Main dialog ──────────────────────────────────────────────────────────── */

/**
 * FilePreviewDialog
 *
 * Props:
 *  open         – boolean
 *  onClose      – () => void
 *  blobUrl      – object URL (blob:) created by MessageBubble, or null
 *  proxyUrl     – stable backend proxy URL (used for native open-with; never blob:)
 *  fileName     – string
 *  fileType     – 'image'|'video'|'audio'|'pdf'|'file'|undefined
 *  mimeType     – MIME string from server (may be 'application/octet-stream')
 *  fileSize     – number (bytes)
 *  loading      – boolean (still fetching blob)
 *  error        – boolean (fetch failed)
 *  onRetryLoad  – () => void
 *  onDownload   – () => void  (explicit download action)
 *  blob         – Blob object (for Web Share API)
 */
function FilePreviewDialog({
  open,
  onClose,
  blobUrl,
  proxyUrl,
  fileName,
  fileType,
  mimeType,
  fileSize,
  loading,
  error,
  onRetryLoad,
  onDownload,
  blob,
}) {
  const iframeRef = useRef(null)
  const [openWithLoading, setOpenWithLoading] = useState(false)

  const kind = getPreviewKind(fileName, fileType)
  const displayName = fileName || 'File'
  const resolvedMime = resolveMime(mimeType, fileName)
  const canOpenExternally = isBrowserRenderable(resolvedMime, fileName)

  // Whether platform has a share/open-with capability
  const showShareButton = canWebShare() || isMobileBrowser()

  // When the dialog closes, stop any ongoing iframe load
  useEffect(() => {
    if (!open && iframeRef.current) {
      iframeRef.current.src = ''
    }
    if (!open) setOpenWithLoading(false)
  }, [open])

  // ── Open With handler ─────────────────────────────────────────────────────
  const handleOpenWith = async () => {
    setOpenWithLoading(true)
    try {
      // Prefer the stable proxy URL for native bridges; blob URL for Web Share
      const urlToUse = proxyUrl || blobUrl || ''
      const result = await openFile({
        url: urlToUse,
        blob,
        fileName: displayName,
        mimeType: resolvedMime,
        fileType,
      })
      // If no native handler picked it up and the type is renderable, fall
      // through — the iframe/preview content is already displayed.
      if (!result.handled && result.fallback === 'download') {
        onDownload?.()
      }
    } catch (err) {
      console.warn('[FilePreviewDialog] openFile error', err)
    } finally {
      setOpenWithLoading(false)
    }
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  const isTallKind = kind === 'pdf' || kind === 'text' || kind === 'video'

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={kind === 'image' ? 'md' : 'lg'}
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '16px',
          bgcolor: '#161b22',
          color: '#e6edf3',
          height: isTallKind ? '92vh' : 'auto',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <DialogTitle
        component="div"
        sx={{
          display: 'flex', alignItems: 'center', gap: 1,
          py: 1.25, px: 2,
          bgcolor: '#0d1117',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
          minHeight: 52,
        }}
      >
        {/* File info */}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
            <Typography
              noWrap
              sx={{ fontWeight: 600, fontSize: '0.875rem', color: '#e6edf3', lineHeight: 1.3 }}
            >
              {displayName}
            </Typography>
            <ExtBadge fileName={fileName} fileType={fileType} />
          </Box>
          {fileSize > 0 && (
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontSize: '0.7rem', lineHeight: 1 }}>
              {formatBytes(fileSize)}
            </Typography>
          )}
        </Box>

        {/* Action buttons */}
        {/* Open With / Share — mobile and platforms with share capability */}
        {showShareButton && (
          <Tooltip title={isMobileBrowser() ? 'Open With…' : 'Share'}>
            <span>
              <IconButton
                size="small"
                onClick={handleOpenWith}
                disabled={(!blobUrl && !proxyUrl) || openWithLoading}
                sx={{
                  color: '#58a6ff',
                  '&:hover': { bgcolor: 'rgba(88,166,255,0.1)' },
                  '&:disabled': { color: 'rgba(255,255,255,0.2)' },
                }}
              >
                {openWithLoading
                  ? <CircularProgress size={18} sx={{ color: '#58a6ff' }} />
                  : <Share sx={{ fontSize: 19 }} />
                }
              </IconButton>
            </span>
          </Tooltip>
        )}

        {/* Open in new tab — desktop, for renderable types */}
        {canOpenExternally && !isMobileBrowser() && (
          <Tooltip title="Open in new tab">
            <span>
              <IconButton
                size="small"
                onClick={handleOpenWith}
                disabled={(!blobUrl && !proxyUrl) || openWithLoading}
                sx={{
                  color: '#58a6ff',
                  '&:hover': { bgcolor: 'rgba(88,166,255,0.1)' },
                  '&:disabled': { color: 'rgba(255,255,255,0.2)' },
                }}
              >
                <OpenInNew sx={{ fontSize: 19 }} />
              </IconButton>
            </span>
          </Tooltip>
        )}

        {/* Download */}
        <Tooltip title="Download">
          <span>
            <IconButton
              size="small"
              onClick={onDownload}
              disabled={!blobUrl}
              sx={{
                color: '#3fb950',
                '&:hover': { bgcolor: 'rgba(63,185,80,0.1)' },
                '&:disabled': { color: 'rgba(255,255,255,0.2)' },
              }}
            >
              <Download sx={{ fontSize: 19 }} />
            </IconButton>
          </span>
        </Tooltip>

        {/* Close */}
        <IconButton
          size="small"
          onClick={onClose}
          sx={{
            color: 'rgba(255,255,255,0.5)',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.07)' },
            ml: 0.5,
          }}
        >
          <Close sx={{ fontSize: 19 }} />
        </IconButton>
      </DialogTitle>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <DialogContent
        sx={{
          p: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flex: 1,
          minHeight: 0,
          bgcolor: '#161b22',
        }}
      >
        {/* Loading */}
        {loading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 8 }}>
            <CircularProgress sx={{ color: '#58a6ff' }} />
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.45)' }}>
              Loading preview…
            </Typography>
          </Box>
        )}

        {/* Error */}
        {error && !loading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2.5, py: 8, px: 3 }}>
            <FileTypeIcon fileName={fileName} fileType={fileType} size={52} />
            <Typography variant="body1" fontWeight={600} sx={{ color: '#e6edf3', textAlign: 'center' }}>
              Could not load file
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.45)', textAlign: 'center', maxWidth: 300 }}>
              There was a problem fetching this attachment.
            </Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={onRetryLoad}
              sx={{
                color: '#58a6ff', borderColor: '#58a6ff',
                textTransform: 'none', borderRadius: 2,
                '&:hover': { bgcolor: 'rgba(88,166,255,0.08)' },
              }}
            >
              Retry
            </Button>
          </Box>
        )}

        {/* Preview content */}
        {!loading && !error && blobUrl && (
          <>
            {/* Image */}
            {kind === 'image' && (
              <Box
                component="img"
                src={blobUrl}
                alt={displayName}
                sx={{
                  maxWidth: '100%',
                  maxHeight: 'calc(92vh - 130px)',
                  objectFit: 'contain',
                  display: 'block',
                  borderRadius: 1,
                  userSelect: 'none',
                }}
              />
            )}

            {/* PDF */}
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

            {/* Plain text / CSV */}
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

            {/* Video */}
            {kind === 'video' && (
              <Box
                sx={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  p: 2,
                }}
              >
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  controls
                  src={blobUrl}
                  style={{
                    maxWidth: '100%',
                    maxHeight: 'calc(92vh - 160px)',
                    borderRadius: 8,
                    display: 'block',
                    outline: 'none',
                  }}
                />
              </Box>
            )}

            {/* Audio */}
            {kind === 'audio' && (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                  py: 6,
                  px: 4,
                  width: '100%',
                }}
              >
                <AudioFile sx={{ fontSize: 64, color: '#7b1fa2', opacity: 0.85 }} />
                <Typography
                  variant="body2"
                  noWrap
                  sx={{ color: 'rgba(255,255,255,0.7)', maxWidth: 360, textAlign: 'center', fontSize: '0.9rem' }}
                >
                  {displayName}
                </Typography>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio controls src={blobUrl} style={{ width: '100%', maxWidth: 400 }} />
              </Box>
            )}

            {/* Unsupported — no in-browser preview possible */}
            {kind === 'unsupported' && (
              <UnsupportedCard
                fileName={fileName}
                fileType={fileType}
                fileSize={fileSize}
                resolvedMime={resolvedMime}
                blobUrl={blobUrl}
                proxyUrl={proxyUrl}
                blob={blob}
                onDownload={onDownload}
              />
            )}
          </>
        )}

        {/* Blob not yet ready but not loading/error (rare edge case) */}
        {!loading && !error && !blobUrl && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 8 }}>
            <CircularProgress sx={{ color: '#58a6ff' }} />
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.45)' }}>
              Preparing file…
            </Typography>
          </Box>
        )}
      </DialogContent>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      {kind !== 'unsupported' && !loading && !error && blobUrl && (
        <DialogActions
          sx={{
            px: 2, py: 1.25,
            bgcolor: '#0d1117',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            justifyContent: 'flex-end',
            flexShrink: 0,
            gap: 1,
          }}
        >
          {fileSize > 0 && (
            <Typography
              variant="caption"
              sx={{ color: 'rgba(255,255,255,0.35)', mr: 'auto', fontSize: '0.7rem' }}
            >
              {formatBytes(fileSize)}
            </Typography>
          )}

          {/* Open With / Share button in footer for non-mobile */}
          {canOpenExternally && !isMobileBrowser() && (
            <Button
              variant="outlined"
              startIcon={openWithLoading
                ? <CircularProgress size={14} sx={{ color: '#58a6ff' }} />
                : <OpenInNew sx={{ fontSize: '0.95rem !important' }} />
              }
              onClick={handleOpenWith}
              disabled={(!blobUrl && !proxyUrl) || openWithLoading}
              size="small"
              sx={{
                color: '#58a6ff', borderColor: 'rgba(88,166,255,0.4)',
                textTransform: 'none', borderRadius: 2,
                fontWeight: 600, fontSize: '0.82rem', px: 2,
                '&:hover': { bgcolor: 'rgba(88,166,255,0.08)', borderColor: '#58a6ff' },
                '&:disabled': { color: 'rgba(255,255,255,0.2)', borderColor: 'rgba(255,255,255,0.1)' },
              }}
            >
              Open in new tab
            </Button>
          )}

          <Button
            variant="contained"
            startIcon={<Download sx={{ fontSize: '0.95rem !important' }} />}
            onClick={onDownload}
            disabled={!blobUrl}
            size="small"
            sx={{
              bgcolor: '#238636',
              textTransform: 'none', borderRadius: 2,
              fontWeight: 600, fontSize: '0.82rem', px: 2,
              '&:hover': { bgcolor: '#2ea043' },
              '&:disabled': { bgcolor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.2)' },
            }}
          >
            Download
          </Button>
        </DialogActions>
      )}
    </Dialog>
  )
}

/* ─── Unsupported file card ─────────────────────────────────────────────────── */

function UnsupportedCard({ fileName, fileType, fileSize, resolvedMime, blobUrl, proxyUrl, blob, onDownload }) {
  const [openWithLoading, setOpenWithLoading] = useState(false)
  const displayName = fileName || 'File'
  const ext = (fileName || '').split('.').pop().toUpperCase()
  const hasExternalSupport = canWebShare() || isMobileBrowser()

  const handleOpenWith = async () => {
    setOpenWithLoading(true)
    try {
      const urlToUse = proxyUrl || blobUrl || ''
      const result = await openFile({
        url: urlToUse,
        blob,
        fileName: displayName,
        mimeType: resolvedMime,
        fileType,
      })
      if (!result.handled && result.fallback === 'download') {
        onDownload?.()
      }
    } catch (err) {
      console.warn('[FilePreviewDialog] UnsupportedCard openFile error', err)
    } finally {
      setOpenWithLoading(false)
    }
  }

  return (
    <Box
      sx={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 2.5, py: 7, px: 4, width: '100%',
      }}
    >
      <FileTypeIcon fileName={fileName} fileType={fileType} size={64} />

      <Box sx={{ textAlign: 'center' }}>
        <Typography
          variant="body1"
          fontWeight={600}
          noWrap
          sx={{ color: '#e6edf3', maxWidth: 340, fontSize: '0.95rem' }}
        >
          {displayName}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mt: 0.5 }}>
          {ext && ext !== fileName?.toUpperCase() && (
            <Chip
              label={ext}
              size="small"
              sx={{
                height: 18, fontSize: '0.6rem', fontWeight: 700,
                bgcolor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)',
                border: '1px solid rgba(255,255,255,0.15)', borderRadius: 1,
                '.MuiChip-label': { px: 0.75 },
              }}
            />
          )}
          {fileSize > 0 && (
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
              {fileSize < 1024 ? `${fileSize} B`
                : fileSize < 1024 * 1024 ? `${(fileSize / 1024).toFixed(1)} KB`
                : `${(fileSize / (1024 * 1024)).toFixed(1)} MB`}
            </Typography>
          )}
        </Box>
      </Box>

      <Typography
        variant="body2"
        sx={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', maxWidth: 320, fontSize: '0.82rem' }}
      >
        This file type can't be previewed here.
        {hasExternalSupport
          ? ' Use "Open With" to view it in a compatible app.'
          : ' Download it to open it on your device.'}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* Open With — mobile or share-capable platforms */}
        {hasExternalSupport && (
          <Button
            variant="contained"
            startIcon={
              openWithLoading
                ? <CircularProgress size={16} sx={{ color: '#fff' }} />
                : <Share sx={{ fontSize: '1rem !important' }} />
            }
            onClick={handleOpenWith}
            disabled={(!blobUrl && !proxyUrl) || openWithLoading}
            sx={{
              bgcolor: '#1f6feb',
              textTransform: 'none', borderRadius: 2,
              fontWeight: 600, px: 3,
              '&:hover': { bgcolor: '#388bfd' },
              '&:disabled': { bgcolor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.2)' },
            }}
          >
            Open With…
          </Button>
        )}

        {/* Download */}
        <Button
          variant={hasExternalSupport ? 'outlined' : 'contained'}
          startIcon={<Download sx={{ fontSize: '1rem !important' }} />}
          onClick={onDownload}
          disabled={!blobUrl}
          sx={hasExternalSupport ? {
            color: '#3fb950', borderColor: 'rgba(63,185,80,0.4)',
            textTransform: 'none', borderRadius: 2,
            fontWeight: 600, px: 3,
            '&:hover': { bgcolor: 'rgba(63,185,80,0.08)', borderColor: '#3fb950' },
            '&:disabled': { color: 'rgba(255,255,255,0.2)', borderColor: 'rgba(255,255,255,0.1)' },
          } : {
            bgcolor: '#238636',
            textTransform: 'none', borderRadius: 2,
            fontWeight: 600, px: 3,
            '&:hover': { bgcolor: '#2ea043' },
            '&:disabled': { bgcolor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.2)' },
          }}
        >
          Download
        </Button>
      </Box>
    </Box>
  )
}

export default FilePreviewDialog
