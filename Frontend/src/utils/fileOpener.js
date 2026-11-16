/**
 * fileOpener.js
 *
 * Platform-aware open / share / download logic for chat attachments.
 *
 * Strategy by platform:
 *
 *  Native app (Android/iOS bridge)
 *    → Pass the URL directly to the OS — the app handles it natively.
 *
 *  Mobile browser (iOS Safari, Android Chrome) — no bridge
 *    → Try Web Share API with the file blob (opens the OS share/open sheet).
 *    → If Web Share isn't available or can't share this file type,
 *      fall back to <a download> — reliable on all mobile browsers.
 *    → Never use window.open() on mobile: it fires inside an async chain
 *      (after await fetch), so the browser treats it as a popup and blocks it.
 *
 *  Desktop browser
 *    → Try Web Share API (supported on some desktops like macOS Safari/Chrome).
 *    → Otherwise fetch the blob with auth and call window.open(blob:) in a
 *      new tab. For browser-renderable types this renders inline; for
 *      everything else the browser hands it to the OS default app.
 *
 * Download is always an explicit action — nothing auto-downloads.
 */

import { hasAndroidBridge, hasIOSBridge, canWebShare, isMobileBrowser } from './platform'

const API =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
    ? import.meta.env.VITE_API_URL
    : (typeof import.meta !== 'undefined' && import.meta.env?.DEV ? 'http://localhost:5000' : '')
const API_ORIGIN = API ? new URL(API, window.location.href).origin : window.location.origin

// MIMEs the browser can render inline in a new tab.
const BROWSER_RENDERABLE = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'video/mp4', 'video/webm',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm',
  'text/plain', 'text/csv', 'text/html',
])

// Extension → MIME for files the server reports as application/octet-stream.
const EXT_MIME = {
  pdf:  'application/pdf',
  doc:  'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls:  'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt:  'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt:  'text/plain',
  csv:  'text/csv',
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', flac: 'audio/flac',
  zip: 'application/zip', rar: 'application/x-rar-compressed',
  '7z': 'application/x-7z-compressed', tar: 'application/x-tar', gz: 'application/gzip',
}

export function resolveMime(mimeType, fileName) {
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType
  const ext = (fileName || '').split('.').pop().toLowerCase()
  return EXT_MIME[ext] || 'application/octet-stream'
}

export function isBrowserRenderable(mimeType, fileName) {
  const mime = resolveMime(mimeType, fileName)
  if (BROWSER_RENDERABLE.has(mime)) return true
  return /^(image|video|audio)\//.test(mime)
}

/** Fetch with JWT only for same-origin backend URLs. */
async function authFetch(url, token) {
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
 * Fetch the file blob once, then try Web Share.
 * Returns the blob so callers can reuse it for download fallback.
 * @returns {{ blob: Blob|null, shared: boolean }}
 */
async function tryWebShare(url, token, fileName, mime) {
  try {
    const res = await authFetch(url, token)
    if (!res.ok) return { blob: null, shared: false }
    const blob = await res.blob()
    const shareFile = new File([blob], fileName || 'file', { type: mime })
    if (navigator.canShare({ files: [shareFile] })) {
      await navigator.share({ files: [shareFile], title: fileName || 'File' })
      return { blob, shared: true }
    }
    return { blob, shared: false }
  } catch (err) {
    if (err?.name === 'AbortError') return { blob: null, shared: true } // dismissed = handled
    console.warn('[fileOpener] Web Share failed', err)
    return { blob: null, shared: false }
  }
}

/**
 * Synchronously trigger a download from a blob.
 * Works on all mobile browsers because the anchor click is not inside an async chain.
 */
function blobToDownload(blob, mime, fileName) {
  const typedBlob = new Blob([blob], { type: mime })
  const blobUrl = URL.createObjectURL(typedBlob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = fileName || 'file'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000)
}

/**
 * Open a file. Strategy varies by platform — see module comment at the top.
 *
 * @param {object}      opts
 * @param {string}      opts.url       - Backend proxy URL
 * @param {string}      opts.fileName  - Original filename e.g. "report.xlsx"
 * @param {string}      opts.mimeType  - MIME type from the server
 * @param {string}      opts.fileType  - Simplified type ('image'|'video'|'audio'|'pdf'|'file')
 * @param {string|null} [opts.token]   - JWT bearer token
 * @returns {Promise<{ handled: boolean }>}
 */
export async function openFile({ url, fileName, mimeType, fileType, token = null }) {
  const mime = resolveMime(mimeType, fileName)
  const mobile = isMobileBrowser()

  // ── 1. Android native bridge ──────────────────────────────────────────────
  if (hasAndroidBridge()) {
    try {
      window.AndroidBridge.openFile(url, mime, fileName || 'file')
      return { handled: true }
    } catch (err) {
      console.warn('[fileOpener] AndroidBridge.openFile failed', err)
    }
  }

  // ── 2. iOS native bridge ──────────────────────────────────────────────────
  if (hasIOSBridge()) {
    try {
      window.webkit.messageHandlers.chatBridge.postMessage({
        type: 'openFile', url, mimeType: mime, fileName: fileName || 'file',
      })
      return { handled: true }
    } catch (err) {
      console.warn('[fileOpener] iOS bridge.openFile failed', err)
    }
  }

  // ── 3. Web Share API ──────────────────────────────────────────────────────
  //    Tried on both mobile and desktop when available.
  //    On mobile this opens the OS "Open With" / share sheet — the user picks their app.
  if (canWebShare()) {
    const { blob, shared } = await tryWebShare(url, token, fileName, mime)
    if (shared) return { handled: true }

    // Web Share didn't fire but we already have the blob — use it.
    if (blob && mobile) {
      // On mobile: window.open is unreliable inside async chains, so download instead.
      // The user can then open from their downloads in the correct app.
      blobToDownload(blob, mime, fileName)
      return { handled: true }
    }

    // On desktop with blob: fall through to window.open below, reusing the blob.
    if (blob) {
      const typedBlob = new Blob([blob], { type: mime })
      const blobUrl = URL.createObjectURL(typedBlob)
      const tab = window.open(blobUrl, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
      if (tab) return { handled: true }
      URL.revokeObjectURL(blobUrl)
    }
  }

  // ── 4. Mobile browser without Web Share API ───────────────────────────────
  //    Fetch the blob and trigger a download. This is the most reliable
  //    fallback on mobile — the file lands in the Downloads folder and
  //    the user opens it from there with their preferred app.
  if (mobile) {
    try {
      const res = await authFetch(url, token)
      if (res.ok) {
        const blob = await res.blob()
        blobToDownload(blob, mime, fileName)
        return { handled: true }
      }
    } catch (err) {
      console.warn('[fileOpener] mobile download fallback failed', err)
    }
    return { handled: false }
  }

  // ── 5. Desktop — fetch blob → window.open ────────────────────────────────
  //    Renderable types open inline; others trigger the OS default handler.
  try {
    const res = await authFetch(url, token)
    if (res.ok) {
      const blob = await res.blob()
      const typedBlob = new Blob([blob], { type: mime })
      const blobUrl = URL.createObjectURL(typedBlob)
      const tab = window.open(blobUrl, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
      if (tab) return { handled: true }
      URL.revokeObjectURL(blobUrl)
    }
  } catch (err) {
    console.warn('[fileOpener] desktop blob open failed', err)
  }

  return { handled: false }
}

/**
 * Explicit download triggered by the Download button.
 * Fetches the blob with auth and fires <a download>.
 *
 * @param {string}      url
 * @param {string}      fileName
 * @param {string|null} token
 */
export async function downloadFile(url, fileName, token = null) {
  const res = await authFetch(url, token)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  blobToDownload(blob, blob.type || 'application/octet-stream', fileName)
}

/**
 * Trigger a browser download from an already-created blob URL.
 * Kept for callers that already have a blob URL.
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
