/**
 * fileOpener.js
 *
 * Platform-aware open / share logic for chat attachments.
 *
 * Priority order:
 *  1. Android native bridge  — app-chooser intent (all file types)
 *  2. iOS native bridge      — share / open-in sheet (all file types)
 *  3. Web Share API          — iOS Safari 15+, Android Chrome, some desktops (all file types)
 *  4. Blob URL open          — fetch with auth → blob: URL → window.open
 *                              • Browser-renderable types: renders inline (PDF, images, video, audio, text)
 *                              • Everything else: browser hands off to OS default app (docx, xlsx, zip…)
 *
 * Nothing here auto-downloads — download is always an explicit user action via triggerDownload().
 */

import { hasAndroidBridge, hasIOSBridge, canWebShare } from './platform'

const API =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
    ? import.meta.env.VITE_API_URL
    : (typeof import.meta !== 'undefined' && import.meta.env?.DEV ? 'http://localhost:5000' : '')
const API_ORIGIN = API ? new URL(API, window.location.href).origin : window.location.origin

// MIMEs the browser can render inline (shown in the browser tab itself).
const BROWSER_RENDERABLE = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'video/mp4', 'video/webm',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm',
  'text/plain', 'text/csv', 'text/html',
])

// Extension → MIME fallback when server sends application/octet-stream.
const EXT_MIME = {
  // Documents
  pdf:  'application/pdf',
  doc:  'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls:  'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt:  'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt:  'text/plain',
  csv:  'text/csv',
  // Images
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  // Video
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo',
  // Audio
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', flac: 'audio/flac',
  // Archives
  zip: 'application/zip', rar: 'application/x-rar-compressed',
  '7z': 'application/x-7z-compressed', tar: 'application/x-tar',
  gz:  'application/gzip',
}

/**
 * Resolve a reliable MIME from server-reported type + filename extension.
 */
export function resolveMime(mimeType, fileName) {
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType
  const ext = (fileName || '').split('.').pop().toLowerCase()
  return EXT_MIME[ext] || 'application/octet-stream'
}

/**
 * True if the browser can render this MIME directly in a tab.
 */
export function isBrowserRenderable(mimeType, fileName) {
  const mime = resolveMime(mimeType, fileName)
  if (BROWSER_RENDERABLE.has(mime)) return true
  return /^(image|video|audio)\//.test(mime)
}

/**
 * Fetch with JWT auth header when the URL points to our own backend.
 * S3 presigned URLs carry auth in query params — skip the header for those.
 */
function authFetch(url, token) {
  let headers = {}
  try {
    if (token && new URL(url, window.location.href).origin === API_ORIGIN) {
      headers = { Authorization: `Bearer ${token}` }
    }
  } catch {
    if (token) headers = { Authorization: `Bearer ${token}` }
  }
  return fetch(url, { headers })
}

/**
 * Open a file using the best available strategy for this platform.
 * Works for ALL file types — browser-renderable ones open inline,
 * everything else is handed to the OS default application.
 *
 * @param {object}      opts
 * @param {string}      opts.url       - Backend proxy URL (https:)
 * @param {string}      opts.fileName  - Original filename e.g. "report.xlsx"
 * @param {string}      opts.mimeType  - MIME type from the server
 * @param {string}      opts.fileType  - Simplified type ('image'|'video'|'audio'|'pdf'|'file')
 * @param {string|null} [opts.token]   - JWT bearer token for auth-protected URLs
 * @returns {Promise<{ handled: boolean }>}
 */
export async function openFile({ url, fileName, mimeType, fileType, token = null }) {
  const mime = resolveMime(mimeType, fileName)

  // ── 1. Android native bridge — hands URL to the OS app-chooser ───────────
  if (hasAndroidBridge()) {
    try {
      window.AndroidBridge.openFile(url, mime, fileName || 'file')
      return { handled: true }
    } catch (err) {
      console.warn('[fileOpener] AndroidBridge.openFile failed', err)
    }
  }

  // ── 2. iOS native bridge — triggers the iOS share / open-in sheet ─────────
  if (hasIOSBridge()) {
    try {
      window.webkit.messageHandlers.chatBridge.postMessage({
        type: 'openFile',
        url,
        mimeType: mime,
        fileName: fileName || 'file',
      })
      return { handled: true }
    } catch (err) {
      console.warn('[fileOpener] iOS bridge.openFile failed', err)
    }
  }

  // ── 3. Web Share API — works on mobile browsers and some desktop browsers ─
  //    Fetches the blob first (needed for auth), then shares via the OS sheet.
  //    This covers ALL file types including docx, xlsx, zip, etc.
  if (canWebShare()) {
    try {
      const res = await authFetch(url, token)
      if (res.ok) {
        const blob = await res.blob()
        const shareFile = new File([blob], fileName || 'file', { type: mime })
        if (navigator.canShare({ files: [shareFile] })) {
          await navigator.share({ files: [shareFile], title: fileName || 'File' })
          return { handled: true }
        }
      }
    } catch (err) {
      if (err?.name === 'AbortError') return { handled: true } // user dismissed — that's fine
      console.warn('[fileOpener] Web Share API failed', err)
      // fall through to blob open
    }
  }

  // ── 4. Fetch blob → window.open in a new tab ──────────────────────────────
  //    For browser-renderable types: renders inline in the tab.
  //    For everything else (docx, xlsx, zip, …): the browser triggers the OS
  //    "open with" dialog or downloads via the system handler — the user gets
  //    to choose their app. This is the WhatsApp-style behaviour on desktop.
  try {
    const res = await authFetch(url, token)
    if (res.ok) {
      const blob = await res.blob()
      // Use the resolved MIME so the browser/OS knows what type it is
      const typedBlob = new Blob([blob], { type: mime })
      const blobUrl = URL.createObjectURL(typedBlob)
      const newTab = window.open(blobUrl, '_blank', 'noopener,noreferrer')
      // Revoke after a generous delay so the tab has time to read the data
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
      if (newTab) return { handled: true }
      // Popup blocked — revoke immediately and signal failure
      URL.revokeObjectURL(blobUrl)
    }
  } catch (err) {
    console.warn('[fileOpener] blob open failed', err)
  }

  return { handled: false }
}

/**
 * Trigger an explicit browser download.
 *
 * @param {string} blobUrl  - object URL (blob:)
 * @param {string} fileName - desired save-as filename
 */
export function triggerDownload(blobUrl, fileName) {
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = fileName || 'download'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
