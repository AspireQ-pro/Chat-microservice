/**
 * Platform / environment detection for the Chat Microservice.
 *
 * The app can run inside:
 *  – a plain desktop browser tab
 *  – a mobile browser (iOS Safari, Android Chrome)
 *  – an Android WebView (host app injects a JS bridge)
 *  – an iOS WKWebView (host app can inject a message handler)
 *  – a same-origin or cross-origin iframe inside another web app
 *
 * None of this is fully reliable from JavaScript alone — user agents can be
 * spoofed and bridges may not be present — but these checks are good enough for
 * deciding which "open with" strategy to attempt first.
 */

const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''

// ── Android ──────────────────────────────────────────────────────────────────
/**
 * True when running inside an Android WebView that has had a JS bridge
 * injected by the host application.  The bridge must expose at minimum:
 *   window.AndroidBridge.openFile(url, mimeType, fileName)
 */
export const hasAndroidBridge = () =>
  typeof window !== 'undefined' &&
  typeof window.AndroidBridge?.openFile === 'function'

/**
 * True when the browser or WebView reports itself as running on Android.
 */
export const isAndroid = () => /android/i.test(ua)

// ── iOS ───────────────────────────────────────────────────────────────────────
/**
 * True when running inside an iOS WKWebView that has the message handler
 * the host app registered under the name "chatBridge".
 *   window.webkit.messageHandlers.chatBridge.postMessage({ ... })
 */
export const hasIOSBridge = () =>
  typeof window !== 'undefined' &&
  typeof window.webkit?.messageHandlers?.chatBridge?.postMessage === 'function'

/**
 * True when the browser / WebView reports itself as running on iOS.
 */
export const isIOS = () =>
  /iphone|ipad|ipod/i.test(ua) ||
  // iPad OS 13+ reports as Macintosh, check for touch
  (typeof navigator !== 'undefined' &&
    /macintosh/i.test(ua) &&
    navigator.maxTouchPoints > 1)

// ── Web Share API ─────────────────────────────────────────────────────────────
/**
 * True when the browser supports the Web Share API (shares blobs/files).
 * Available on iOS Safari 15+, Android Chrome 89+, and some desktop browsers.
 */
export const canWebShare = () =>
  typeof navigator !== 'undefined' &&
  typeof navigator.share === 'function' &&
  typeof navigator.canShare === 'function'

// ── iframe / embedded ────────────────────────────────────────────────────────
/**
 * True when the page is running inside an iframe.
 */
export const isEmbedded = () =>
  typeof window !== 'undefined' && window.self !== window.top

// ── Mobile browser (no bridge) ───────────────────────────────────────────────
/**
 * True for any mobile browser — both iOS Safari and Android Chrome.
 */
export const isMobileBrowser = () => isAndroid() || isIOS()

// ── Convenience export ───────────────────────────────────────────────────────
export const platform = {
  hasAndroidBridge,
  hasIOSBridge,
  isAndroid,
  isIOS,
  canWebShare,
  isEmbedded,
  isMobileBrowser,
}

export default platform
