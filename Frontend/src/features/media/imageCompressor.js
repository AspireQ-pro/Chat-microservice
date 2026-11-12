/**
 * imageCompressor.js
 *
 * Client-side image compression using the browser's native Canvas API.
 * No external libraries — zero extra bundle weight.
 *
 * Matches WhatsApp's compression behaviour:
 *   • Max 1600 × 1600 px (WhatsApp caps at ~1600 on the long edge)
 *   • JPEG quality 0.75 (WhatsApp typical quality level)
 *   • PNG with transparency stays PNG; everything else becomes JPEG
 *   • Files already under 100 KB are skipped (already small enough)
 *   • If the compressed output is larger than the original, original wins
 *
 * Supported input types:  JPEG, PNG, WebP
 * Skipped (returned as-is): GIF (animation), HEIC/AVIF (canvas can't decode),
 *                            any file already below the threshold
 */

const MAX_DIMENSION       = 1600   // px — WhatsApp long-edge cap
const JPEG_QUALITY        = 0.75   // 0–1  — WhatsApp-equivalent quality
const SMALL_FILE_SKIP     = 100 * 1024  // 100 KB — not worth compressing

const COMPRESSIBLE = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

/**
 * Compress an image File before uploading.
 * Always returns a File — the compressed one if smaller, the original otherwise.
 *
 * @param {File} file
 * @returns {Promise<File>}
 */
export async function compressImage(file) {
  if (!COMPRESSIBLE.has(file.type)) return file
  if (file.size <= SMALL_FILE_SKIP)  return file

  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap

    // Scale down so the longest edge is ≤ MAX_DIMENSION.
    let w = width, h = height
    if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
      if (w >= h) { h = Math.round((h / w) * MAX_DIMENSION); w = MAX_DIMENSION }
      else        { w = Math.round((w / h) * MAX_DIMENSION); h = MAX_DIMENSION }
    }

    // Draw onto OffscreenCanvas (supported everywhere modern) or a regular canvas.
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h })

    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    // PNG files with any transparent pixel stay PNG; all others → JPEG.
    const outputMime = (file.type === 'image/png' && _hasAlpha(ctx, w, h))
      ? 'image/png'
      : 'image/jpeg'

    const blob = typeof OffscreenCanvas !== 'undefined'
      ? await canvas.convertToBlob({ type: outputMime, quality: JPEG_QUALITY })
      : await new Promise(res => canvas.toBlob(res, outputMime, JPEG_QUALITY))

    if (!blob || blob.size >= file.size) return file   // compression made it bigger

    const ext     = outputMime === 'image/jpeg' ? '.jpg' : '.png'
    const newName = file.name.replace(/\.[^.]+$/, '') + ext
    return new File([blob], newName, { type: outputMime, lastModified: file.lastModified })
  } catch (err) {
    console.warn('[imageCompressor] skipped:', err)
    return file  // never block the upload
  }
}

/** Sample the alpha channel at 100 points across the image. */
function _hasAlpha(ctx, w, h) {
  try {
    const sx = Math.max(1, Math.floor(w / 10))
    const sy = Math.max(1, Math.floor(h / 10))
    for (let y = 0; y < h; y += sy)
      for (let x = 0; x < w; x += sx)
        if (ctx.getImageData(x, y, 1, 1).data[3] < 255) return true
  } catch { /* cross-origin taint — assume opaque */ }
  return false
}
