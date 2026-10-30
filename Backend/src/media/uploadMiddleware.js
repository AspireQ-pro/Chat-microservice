const multer = require("multer");

const ALLOWED_MIMETYPES = new Set([
  // Images
  "image/jpeg", "image/png", "image/gif", "image/webp",
  // PDF
  "application/pdf",
  // Microsoft Office
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Text
  "text/plain", "text/csv",
  // Archive
  "application/zip",
  // Audio
  "audio/mpeg", "audio/ogg", "audio/wav",
  // Video
  "video/mp4", "video/webm",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
      return callback(new Error("File type not allowed"));
    }
    callback(null, true);
  },
});

function parseMediaUpload(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(status).json({ error: err.message || "Upload failed" });
  });
}

module.exports = { parseMediaUpload, ALLOWED_MIMETYPES };
