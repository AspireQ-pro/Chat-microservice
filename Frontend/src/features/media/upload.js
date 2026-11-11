const API =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:5000" : "");
const API_BASE = `${API}/api`;

function authHeaders(getState) {
  const token = getState().auth.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Upload a file using the presigned S3 form or the direct proxy fallback,
 * with optional upload-progress reporting.
 *
 * Phase 3: the S3 binary upload step (the largest one) now uses
 * XMLHttpRequest so we can fire onProgress callbacks with a percentage.
 *
 * @param {object}   opts
 * @param {string}   opts.presignUrl   – POST endpoint to request the presigned form
 * @param {string}   opts.completeUrl  – POST endpoint to finalise the S3 upload
 * @param {File}     opts.file         – the File object from the input/drop event
 * @param {function} opts.getState     – Redux getState (for auth token)
 * @param {function} [opts.onProgress] – (pct: number) => void, 0–100
 * @returns {Promise<{ fileUrl, fileType, fileName, fileSize } | { mode: "proxy" }>}
 */
export async function uploadWithPresignedForm({ presignUrl, completeUrl, file, getState, onProgress }) {
  const headers = authHeaders(getState);
  // Some browsers report an empty MIME type for unusual file formats.
  // Fall back to application/octet-stream so the backend always gets a valid value.
  const contentType = file.type || "application/octet-stream";

  const presignResponse = await fetch(presignUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ contentType, size: file.size, fileName: file.name }),
  });
  const presignData = await presignResponse.json();
  if (!presignResponse.ok) throw new Error(presignData.error || "Unable to prepare upload");
  if (presignData.mode === "proxy") return { mode: "proxy" };

  // ── S3 presigned POST: use XHR so we get upload progress events ──
  const formData = new FormData();
  Object.entries(presignData.fields || {}).forEach(([name, value]) => formData.append(name, value));
  formData.append("file", file);

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", presignData.url);

    // Fire progress from 0 → 90 % for the S3 upload phase.
    // The remaining 10 % is reserved for the /upload-complete round-trip.
    if (onProgress) {
      xhr.upload.addEventListener("progress", (evt) => {
        if (evt.lengthComputable) {
          const pct = Math.round((evt.loaded / evt.total) * 90);
          onProgress(pct);
        }
      });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(90);
        resolve();
      } else {
        reject(new Error("S3 upload failed. Check bucket CORS and upload permissions."));
      }
    };
    xhr.onerror = () => reject(new Error("S3 upload failed (network error)."));
    xhr.send(formData);
  });

  // ── Finalise the upload on the backend ──
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

export { API_BASE };
