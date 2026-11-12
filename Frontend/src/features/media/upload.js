import { compressImage } from './imageCompressor'
import { compressVideo } from './videoCompressor'

const API =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:5000" : "");
const API_BASE = `${API}/api`;

function authHeaders(getState) {
  const token = getState().auth.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Compress a file before upload.
 *   • Images  → compressImage()  (canvas re-encode)
 *   • Videos  → compressVideo()  (MediaRecorder re-encode)
 *   • Others  → returned unchanged
 *
 * onProgress receives a 0–100 value scoped to the compression phase.
 * It is called only when video compression is running.
 *
 * @param {File}     file
 * @param {function} [onProgress]
 * @returns {Promise<File>}
 */
async function compressFile(file, onProgress) {
  if (file.type.startsWith('image/')) return compressImage(file)
  if (file.type.startsWith('video/')) return compressVideo(file, onProgress)
  return file
}

/**
 * Upload a file to S3 (presigned form) or through the backend proxy,
 * with client-side image/video compression before any network activity.
 *
 * Progress reporting:
 *   - During video compression:  onProgress receives 0–100 (compression %)
 *   - During S3 upload:          onProgress receives 0–100 (upload %)
 *   The two phases run sequentially, so the bar never goes backward.
 *
 * @param {object}   opts
 * @param {string}   opts.presignUrl
 * @param {string}   opts.completeUrl
 * @param {File}     opts.file
 * @param {function} opts.getState
 * @param {function} [opts.onProgress]  (0–100) → void
 * @returns {Promise<{ fileUrl, fileType, fileName, fileSize, mimeType }>}
 */
export async function uploadWithPresignedForm({ presignUrl, completeUrl, file, getState, onProgress }) {
  const headers = authHeaders(getState);

  // ── Step 1: compress before any network activity ─────────────────────────
  // For video this may take several seconds and fires onProgress during encode.
  // For images it is fast (canvas encode) and doesn't fire progress.
  // For everything else it returns immediately.
  const fileToUpload = await compressFile(file, onProgress)

  const contentType = fileToUpload.type || "application/octet-stream";

  // ── Step 2: request a presigned upload form ───────────────────────────────
  const presignResponse = await fetch(presignUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      contentType,
      size: fileToUpload.size,
      fileName: fileToUpload.name,
    }),
  });
  const presignData = await presignResponse.json();
  if (!presignResponse.ok) throw new Error(presignData.error || "Unable to prepare upload");
  if (presignData.mode === "proxy") return { mode: "proxy" };

  // ── Step 3: upload directly to S3 via XHR (progress events) ─────────────
  const formData = new FormData();
  Object.entries(presignData.fields || {}).forEach(([k, v]) => formData.append(k, v));
  formData.append("file", fileToUpload);

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", presignData.url);

    if (onProgress) {
      xhr.upload.addEventListener("progress", (evt) => {
        if (evt.lengthComputable) {
          onProgress(Math.round((evt.loaded / evt.total) * 90));
        }
      });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgress?.(90); resolve(); }
      else reject(new Error("S3 upload failed. Check bucket CORS and upload permissions."));
    };
    xhr.onerror = () => reject(new Error("S3 upload failed (network error)."));
    xhr.send(formData);
  });

  // ── Step 4: tell the backend the upload is done ───────────────────────────
  const completeResponse = await fetch(completeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ completionToken: presignData.completionToken }),
  });
  const completeData = await completeResponse.json();
  if (!completeResponse.ok) throw new Error(completeData.error || "Unable to finish upload");

  onProgress?.(100);
  return completeData;
}

/**
 * Direct proxy upload path (used when S3 is not configured).
 * Compression is applied here too so the proxy path is consistent.
 */
export async function uploadViaProxy({ proxyUrl, file, getState, onProgress }) {
  const headers = authHeaders(getState);
  const fileToUpload = await compressFile(file, onProgress);

  const formData = new FormData();
  formData.append("file", fileToUpload);

  const res = await fetch(proxyUrl, { method: "POST", headers, body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "File upload failed");
  return data;
}

export { API_BASE };
