require("dotenv").config();

const crypto = require("crypto");

const isProduction = process.env.NODE_ENV === "production";
const isPlaceholderSecret = (value) => /^(replace|change|your[-_])/i.test(String(value || ""));
const CHAT_JWT_SECRET = process.env.CHAT_JWT_SECRET ||
  (!isProduction ? crypto.randomBytes(64).toString("hex") : "");

if (isProduction && (CHAT_JWT_SECRET.length < 32 || isPlaceholderSecret(CHAT_JWT_SECRET))) {
  throw new Error("CHAT_JWT_SECRET must be configured with at least 32 characters in production");
}
if (isProduction && (!process.env.PROJECT_REGISTRATION_SECRET || isPlaceholderSecret(process.env.PROJECT_REGISTRATION_SECRET))) {
  throw new Error("PROJECT_REGISTRATION_SECRET must be configured in production");
}
if (isProduction && (!process.env.MESSAGE_ENC_KEY || isPlaceholderSecret(process.env.MESSAGE_ENC_KEY))) {
  throw new Error("MESSAGE_ENC_KEY must be configured and kept stable in production");
}

const BACKEND_URL = (
  process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`
).replace(/\/$/, "");
const corsOrigins = String(
  process.env.CORS_ORIGIN ||
    (isProduction ? "" : "http://localhost:3001,http://localhost:5173,http://localhost:3000"),
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (isProduction && (!corsOrigins.length || corsOrigins.includes("*"))) {
  throw new Error("CORS_ORIGIN must list explicit frontend origins in production");
}
if (isProduction && corsOrigins.some((origin) => {
  try { return new URL(origin).protocol !== "https:"; } catch { return true; }
})) {
  throw new Error("Every production CORS_ORIGIN must be a valid HTTPS origin");
}

const corsOrigin = corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins;
const API_BASE = "/api";
const CHAT_FRONTEND_URL = (
  process.env.CHAT_FRONTEND_URL ||
  (!isProduction ? `http://localhost:${process.env.CHAT_FRONTEND_PORT || 3001}` : "")
).replace(/\/$/, "");
if (isProduction) {
  let chatFrontend;
  try {
    chatFrontend = new URL(CHAT_FRONTEND_URL);
  } catch {
    throw new Error("CHAT_FRONTEND_URL must be configured with the public Chat URL in production");
  }
  if (chatFrontend.protocol !== "https:") {
    throw new Error("CHAT_FRONTEND_URL must use HTTPS in production");
  }
  if (new URL(BACKEND_URL).protocol !== "https:") {
    throw new Error("BACKEND_URL must use HTTPS in production");
  }
}

const UPLOAD_TYPES = {
  // Images
  "image/jpeg": { extension: ".jpg", fileType: "image" },
  "image/png": { extension: ".png", fileType: "image" },
  "image/gif": { extension: ".gif", fileType: "image" },
  "image/webp": { extension: ".webp", fileType: "image" },
  // PDF
  "application/pdf": { extension: ".pdf", fileType: "file" },
  // Microsoft Office documents
  "application/msword": { extension: ".doc", fileType: "file" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { extension: ".docx", fileType: "file" },
  "application/vnd.ms-excel": { extension: ".xls", fileType: "file" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { extension: ".xlsx", fileType: "file" },
  "application/vnd.ms-powerpoint": { extension: ".ppt", fileType: "file" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { extension: ".pptx", fileType: "file" },
  // Plain text and CSV
  "text/plain": { extension: ".txt", fileType: "file" },
  "text/csv": { extension: ".csv", fileType: "file" },
  // Archives
  "application/zip": { extension: ".zip", fileType: "file" },
  // Audio
  "audio/mpeg": { extension: ".mp3", fileType: "audio" },
  "audio/ogg": { extension: ".ogg", fileType: "audio" },
  "audio/wav": { extension: ".wav", fileType: "audio" },
  // Video
  "video/mp4": { extension: ".mp4", fileType: "video" },
  "video/webm": { extension: ".webm", fileType: "video" },
};
const KEEP_ALIVE_TIMEOUT_MS = Number(process.env.KEEP_ALIVE_TIMEOUT_MS || 5000);
const HEADERS_TIMEOUT_MS = Number(process.env.HEADERS_TIMEOUT_MS || KEEP_ALIVE_TIMEOUT_MS + 1000);
const RBAC_BACKEND_URL = (
  process.env.RBAC_BACKEND_URL ||
  process.env.SOCIETY_BACKEND_URL ||
  "http://3.110.56.109:8080"
).replace(/\/$/, "");

module.exports = {
  isProduction,
  isPlaceholderSecret,
  CHAT_JWT_SECRET,
  BACKEND_URL,
  corsOrigin,
  API_BASE,
  CHAT_FRONTEND_URL,
  RBAC_BACKEND_URL,
  UPLOAD_TYPES,
  PORT: process.env.PORT || 5000,
  KEEP_ALIVE_TIMEOUT_MS,
  HEADERS_TIMEOUT_MS,
};
