const API =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:5000" : "");
const API_BASE = `${API}/api`;

function authHeaders(getState) {
  const token = getState().auth.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function uploadWithPresignedForm({ presignUrl, completeUrl, file, getState }) {
  const headers = authHeaders(getState);
  const presignResponse = await fetch(presignUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ contentType: file.type, size: file.size, fileName: file.name }),
  });
  const presignData = await presignResponse.json();
  if (!presignResponse.ok) throw new Error(presignData.error || "Unable to prepare upload");
  if (presignData.mode === "proxy") return { mode: "proxy" };

  const formData = new FormData();
  Object.entries(presignData.fields || {}).forEach(([name, value]) => formData.append(name, value));
  formData.append("file", file);
  const uploadResponse = await fetch(presignData.url, { method: "POST", body: formData });
  if (!uploadResponse.ok) throw new Error("S3 upload failed. Check bucket CORS and upload permissions.");

  const completeResponse = await fetch(completeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ completionToken: presignData.completionToken }),
  });
  const completeData = await completeResponse.json();
  if (!completeResponse.ok) throw new Error(completeData.error || "Unable to finish upload");
  return completeData;
}

export { API_BASE };
