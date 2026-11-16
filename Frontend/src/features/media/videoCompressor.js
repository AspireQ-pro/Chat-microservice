/**
 * videoCompressor.js
 *
 * Client-side video compression using the browser's native MediaRecorder API.
 * No external libraries, no WebAssembly — zero extra bundle weight.
 *
 * How it works
 * ─────────────
 * 1. The video File is decoded by an off-screen <video> element.
 * 2. Each frame is painted onto a <canvas> scaled to the target resolution.
 * 3. The canvas stream is captured and re-encoded by MediaRecorder using the
 *    best available codec (VP9 → VP8 → browser default).
 * 4. The resulting Blob is returned as a new File.
 *
 * This is the same general approach used by browser-based video editors and
 * screen-recording tools. It works in Chrome, Edge, Safari 14.5+, and
 * Firefox without any native plugin or wasm dependency.
 *
 * Compression targets (matches WhatsApp mobile behaviour)
 * ────────────────────────────────────────────────────────
 *   Resolution : max 960 × 960 px (long edge), portrait or landscape
 *   Video rate : 1.2 Mbps   (WhatsApp ≈ 1–1.5 Mbps for 720p)
 *   Audio rate : 128 kbps
 *   Output     : video/webm (Chrome/Firefox) or video/mp4 where supported
 *
 * Fallback behaviour
 * ───────────────────
 *   • If the browser does not support MediaRecorder at the needed quality,
 *     or if the video is already below the size threshold, the original
 *     file is returned unchanged — the upload is never blocked.
 *   • Compression timeout: if encoding takes longer than 3 minutes the
 *     original is returned (guards against very long videos).
 *
 * What is NOT compressed
 * ───────────────────────
 *   • Files already under 5 MB (small enough for chat)
 *   • Videos shorter than 3 seconds (not worth the encode overhead)
 *   • Any format the browser's <video> element cannot decode
 */

const MAX_DIMENSION     = 960           // px — long-edge cap
const VIDEO_BITRATE     = 1_200_000     // 1.2 Mbps
const AUDIO_BITRATE     = 128_000       // 128 kbps
const SMALL_FILE_SKIP   = 5 * 1024 * 1024  // 5 MB
const MIN_DURATION_S    = 3             // seconds
const ENCODE_TIMEOUT_MS = 3 * 60 * 1000 // 3 minutes

const VIDEO_TYPES = new Set([
  'video/mp4', 'video/quicktime', 'video/x-mkvideo', 'video/x-matroska',
  'video/webm', 'video/avi', 'video/x-msvideo', 'video/3gpp', 'video/3gpp2',
  'video/ogg',
])

/**
 * Pick the best supported MediaRecorder MIME type.
 * Returns null if MediaRecorder is unavailable.
 */
function _bestMime() {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=avc1',
    'video/mp4',
  ]
  return candidates.find(t => MediaRecorder.isTypeSupported(t)) ?? null
}

/**
 * Compress a video File before uploading.
 * Always returns a File — compressed if smaller, original otherwise.
 *
 * @param {File}     file
 * @param {function} [onProgress]  (0–100) optional progress callback
 * @returns {Promise<File>}
 */
export async function compressVideo(file, onProgress) {
  // ── Skip conditions ──────────────────────────────────────────────────────
  if (!VIDEO_TYPES.has(file.type) && !file.type.startsWith('video/')) return file
  if (file.size <= SMALL_FILE_SKIP) return file

  const mime = _bestMime()
  if (!mime) return file  // MediaRecorder not supported

  return new Promise((resolve) => {
    // Always resolve with SOMETHING — never reject, never block the upload.
    const fallback = () => resolve(file)
    const timeoutId = setTimeout(fallback, ENCODE_TIMEOUT_MS)

    const cleanup = (resultFile) => {
      clearTimeout(timeoutId)
      video.src = ''
      URL.revokeObjectURL(objectUrl)
      resolve(resultFile)
    }

    // ── Load the video ───────────────────────────────────────────────────
    const objectUrl = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.muted  = true
    video.playsInline = true
    video.preload = 'metadata'

    video.onerror = fallback

    video.onloadedmetadata = () => {
      const { videoWidth, videoHeight, duration } = video

      // Skip very short clips.
      if (!duration || duration < MIN_DURATION_S || !videoWidth || !videoHeight) {
        cleanup(file)
        return
      }

      // ── Calculate target canvas size ────────────────────────────────
      let cw = videoWidth, ch = videoHeight
      if (cw > MAX_DIMENSION || ch > MAX_DIMENSION) {
        if (cw >= ch) { ch = Math.round((ch / cw) * MAX_DIMENSION); cw = MAX_DIMENSION }
        else          { cw = Math.round((cw / ch) * MAX_DIMENSION); ch = MAX_DIMENSION }
      }

      // ── Set up canvas + stream capture ──────────────────────────────
      const canvas = document.createElement('canvas')
      canvas.width  = cw
      canvas.height = ch
      const ctx = canvas.getContext('2d')

      // Capture the canvas stream at the video's native frame rate (capped at 30).
      const fps = Math.min(30, Math.round(1 / (video.duration / 1000)) || 30)
      const canvasStream = canvas.captureStream(fps)

      // Add audio track from the video element if available.
      let recorder
      try {
        if (typeof video.captureStream === 'function') {
          const videoStream = video.captureStream()
          const audioTracks = videoStream.getAudioTracks()
          audioTracks.forEach(t => canvasStream.addTrack(t))
        }

        recorder = new MediaRecorder(canvasStream, {
          mimeType: mime,
          videoBitsPerSecond: VIDEO_BITRATE,
          audioBitsPerSecond: AUDIO_BITRATE,
        })
      } catch (err) {
        console.warn('[videoCompressor] MediaRecorder init failed:', err)
        cleanup(file)
        return
      }

      const chunks = []
      recorder.ondataavailable = e => { if (e.data?.size > 0) chunks.push(e.data) }

      recorder.onstop = () => {
        const outputMime = mime.split(';')[0]  // e.g. 'video/webm'
        const blob = new Blob(chunks, { type: outputMime })

        // Only use compressed version if it is actually smaller.
        if (blob.size >= file.size) { cleanup(file); return }

        const ext     = outputMime.includes('mp4') ? '.mp4' : '.webm'
        const newName = file.name.replace(/\.[^.]+$/, '') + ext
        const result  = new File([blob], newName, { type: outputMime, lastModified: file.lastModified })
        cleanup(result)
      }

      recorder.onerror = () => cleanup(file)

      // ── Drive the encode: play video, draw each frame to canvas ─────
      let lastTime = -1

      const drawFrame = () => {
        if (video.paused || video.ended) return
        if (video.currentTime !== lastTime) {
          ctx.drawImage(video, 0, 0, cw, ch)
          lastTime = video.currentTime
          // Report progress (0–95 %; the final 5 % is the recorder stop).
          if (onProgress) {
            const pct = Math.round((video.currentTime / duration) * 95)
            onProgress(pct)
          }
        }
        requestAnimationFrame(drawFrame)
      }

      video.oncanplay = () => {
        video.src = objectUrl  // ensure src is set before play
        recorder.start(100)    // collect data every 100 ms
        video.play().then(() => {
          requestAnimationFrame(drawFrame)
        }).catch(() => cleanup(file))
      }

      video.onended = () => {
        // Draw the very last frame before stopping.
        ctx.drawImage(video, 0, 0, cw, ch)
        if (recorder.state !== 'inactive') {
          onProgress?.(98)
          recorder.stop()
          // Stop all canvas stream tracks so the recorder truly finishes.
          canvasStream.getTracks().forEach(t => t.stop())
        }
      }

      // Start loading/playing
      video.src = objectUrl
      video.load()
    }

    video.src = objectUrl
  })
}
