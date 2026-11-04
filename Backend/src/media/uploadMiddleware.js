const multer = require("multer");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
});

function parseMediaUpload(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(status).json({ error: err.message || "Upload failed" });
  });
}

module.exports = { parseMediaUpload };
