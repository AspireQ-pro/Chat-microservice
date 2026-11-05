/**
 * fileOpener.js
 *
 * Platform-aware "Open With" / share logic for chat attachments.
 *
 * Priority order:
 *  1. Android native bridge  — invokes the Android app-chooser intent
 *  2. iOS native bridge      — triggers the iOS share / open-in sheet
 *  3. Web Share API          — works on iOS Safari 15+, Android Chrome, some desktops
 *  4. Inline open            — window.open(url, '_blank') for previewable types
 *  5. Download fallback      — <a download> for formats the browser cannot open
 *
 * Nothing here auto-downloads — download must be an explicit user action.
 */

import { hasAndroidBridge, hasIOSBridge, canWebShare } from './platform'

// MIME types that most browsers can render inline.
const BROWSER_RENDERABLE = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'video/mp4', 'video/webm',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm',
  'text/plain', 'text/csv', 'text/html',
])

// Extension → MIME for files whose MIME may arrive as octet-stream.
const EXT_MIME = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  mp4: 'video/mp4', webm: 'video/webm',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav',
  txt: 'text/plain', csv: 'text/csv',
}

/**
 * Resolve a reliable MIME type from the server-reported type and filename.
 * Falls back to 'application/octet-stream'.
 */
export function resolveMime(mimeType, fileName) {
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType
  const ext = (fileName || '').split('.').pop().toLowerCase()
  return EXT_MIME[ext] || 'application/octet-stream'
}

/**
 * Returns true if the browser is likely able to display this MIME inline.
 */
export function isBrowserRenderable(mimeType, fileName) {
  const mime = resolveMime(mimeType, fileName)
  if (BROWSER_RENDERABLE.has(mime)) return true
  // Also accept image/* and audio/* and video/* generically
  return /^(image|video|audio)\//.test(mime)
}

/**
 * Open a file using the most appropriate strategy for the current platform.
 *
 * @param {object} opts
 * @param {string}  opts.url        - Authenticated URL to the file (blob: or https:)
 * @param {Blob}   [opts.blob]      - Already-fetched blob (used for Web Share API)
 * @param {string}  opts.fileName   - Original filename (e.g. "report.pdf")
 * @param {string}  opts.mimeType   - MIME type reported by the server
 * @param {string}  opts.fileType   - Simplified type string ('image'|'video'|'audio'|'pdf'|'file')
 * @returns {Promise<{ handled: boolean, fallback?: 'download'|'share'|'inline' }>}
 */
export async function openFile({ url, blob, fileName, mimeType, fileType }) {
  const mime = resolveMime(mimeType, fileName)

  // ── 1. Android native bridge ──────────────────────────────────────────────
  if (hasAndroidBridge()) {
    try {
      // The bridge receives a backend-proxied HTTPS URL (not blob:) because
      // Android intents need a URL the system can re-fetch; blob: URLs are
      // scoped to the WebView and not accessible to external apps.
      const httpUrl = url.startsWith('blob:') ? null : url
      if (httpUrl) {
        window.AndroidBridge.openFile(httpUrl, mime, fileName || 'file')
        return { handled: true }
      }
    } catch (err) {
      console.warn('[fileOpener] AndroidBridge.openFile failed', err)
    }
  }

  // ── 2. iOS native bridge ──────────────────────────────────────────────────
  if (hasIOSBridge()) {
    try {
      const httpUrl = url.startsWith('blob:') ? null : url
      if (httpUrl) {
        window.webkit.messageHandlers.chatBridge.postMessage({
          type: 'openFile',
          url: httpUrl,
          mimeType: mime,
          fileName: fileName || 'file',
        })
        return { handled: true }
      }
    } catch (err) {
      console.warn('[fileOpener] iOS bridge.openFile failed', err)
    }
  }

  // ── 3. Web Share API (mobile + some desktop) ──────────────────────────────
  if (canWebShare() && blob) {
    try {
      const shareFile = new File([blob], fileName || 'file', { type: mime })
      if (navigator.canShare({ files: [shareFile] })) {
        await navigator.share({
          files: [shareFile],
          title: fileName || 'File',
        })
        return { handled: true }
      }
    } catch (err) {
      // AbortError = user dismissed — that's fine, not an error
      if (err?.name !== 'AbortError') {
        console.warn('[fileOpener] Web Share API failed', err)
      } else {
        return { handled: true } // user dismissed voluntarily
      }
    }
  }

  // ── 4. Inline open in browser tab ─────────────────────────────────────────
  if (isBrowserRenderable(mime, fileName)) {
    // Open the blob URL (or direct URL) in a new tab so the browser renders it.
    // We prefer the blob URL here because it's already auth'd; for browsers that
    // block popups we return 'inline' so the caller can show a preview instead.
    const openTarget = url
    const newTab = window.open(openTarget, '_blank', 'noopener,noreferrer')
    if (newTab) {
      return { handled: true }
    }
    // Popup blocked — fall through to preview UI
  }

  // ── 5. No native handling available — signal caller to show preview/download ─
  return { handled: false, fallback: isBrowserRenderable(mime, fileName) ? 'inline' : 'download' }
}

/**
 * Trigger a browser download for the given blob URL.
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
