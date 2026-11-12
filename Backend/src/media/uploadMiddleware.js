const multer = require("multer");

// Per-type size limits — matches WhatsApp's behaviour.
// Multer uses a single hard ceiling to stop obviously oversized requests
// early; the MIME-aware check below enforces the per-type limits.
const MULTER_HARD_LIMIT = 100 * 1024 * 1024; // 100 MB — largest allowed type (video)
const IMAGE_MAX_SIZE    =  16 * 1024 * 1024; //  16 MB — images  (WhatsApp: 16 MB)
const VIDEO_MAX_SIZE    = 100 * 1024 * 1024; // 100 MB — videos  (compressor → ~10 MB)
const OTHER_MAX_SIZE    = 100 * 1024 * 1024; // 100 MB — documents, audio, archives (WhatsApp: 100 MB)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MULTER_HARD_LIMIT, files: 1 },
});

function parseMediaUpload(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err) {
      const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return res.status(status).json({ error: err.message || "Upload failed" });
    }

    // ── Per-type size check ───────────────────────────────────────────────
    if (req.file) {
      const mime = (req.file.mimetype || "").toLowerCase();
      const size = req.file.size;
      let limit = OTHER_MAX_SIZE;
      let label = "Files";
      if (mime.startsWith("image/")) { limit = IMAGE_MAX_SIZE; label = "Images"; }
      else if (mime.startsWith("video/")) { limit = VIDEO_MAX_SIZE; label = "Videos"; }

      if (size > limit) {
        const limitMB = limit / (1024 * 1024);
        return res.status(413).json({
          error: `${label} must be under ${limitMB} MB.`,
        });
      }
    }

    next();
  });
}

module.exports = { parseMediaUpload };
