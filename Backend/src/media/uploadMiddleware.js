const multer = require("multer");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
    if (!allowed.includes(file.mimetype)) {
      return callback(new Error("Only JPEG, PNG, GIF, WebP, and PDF files are allowed"));
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

module.exports = { parseMediaUpload };
