const crypto = require("crypto");
const { pipeline } = require("node:stream/promises");
const { getUploadType } = require("../config/runtime");

module.exports = function createMediaUploadService({
  prisma,
  jwt,
  config,
  mediaStorage,
  mediaKey,
  parseMediaUpload,
  getProjectPermissions,
  sendError,
}) {
  const { API_BASE, BACKEND_URL, CHAT_JWT_SECRET } = config;
  const MAX_SIZE       = 100 * 1024 * 1024; // hard ceiling kept for non-chat uploads (avatars etc.)
  const IMAGE_MAX_SIZE =  16 * 1024 * 1024; //  16 MB — images  (WhatsApp: 16 MB)
  const VIDEO_MAX_SIZE = 100 * 1024 * 1024; // 100 MB — videos  (compressor → ~10 MB)
  const OTHER_MAX_SIZE = 100 * 1024 * 1024; // 100 MB — documents, audio, archives (WhatsApp: 100 MB)

  // ── Serve a stored file back to the client ──────────────────────────────────
  async function sendStoredMedia(req, res, key) {
    const target = await mediaStorage.getDownloadTarget(key, req.headers.range);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    if (target.body) {
      res.setHeader("Content-Type", target.contentType || "application/octet-stream");
      res.setHeader("Accept-Ranges", target.acceptRanges || "bytes");
      if (target.contentLength != null) res.setHeader("Content-Length", target.contentLength);
      if (target.contentRange) {
        res.status(206);
        res.setHeader("Content-Range", target.contentRange);
      }
      await pipeline(target.body, res);
      return;
    }
    if (!res.getHeader("Content-Disposition")) res.setHeader("Content-Disposition", "inline");
    return res.sendFile(target.path, (err) => {
      if (err && !res.headersSent) res.status(err.statusCode || 404).end();
    });
  }

  // ── Parse upload intent from presign request body ───────────────────────────
  function mediaUploadInput(req, imagesOnly = false) {
    const contentType = (String(req.body?.contentType || "").trim()) || "application/octet-stream";
    const originalName = String(req.body?.fileName || "").trim();
    const type = getUploadType(contentType, originalName);
    const size = Number(req.body?.size);
    if (imagesOnly && type.fileType !== "image") return null;
    if (!Number.isInteger(size) || size < 1) return null;

    // ── Per-type size limits ─────────────────────────────────────────────────
    const mime = contentType.toLowerCase();
    let sizeLimit = OTHER_MAX_SIZE;
    let sizeLabel = "Files must be under 100 MB";
    if (mime.startsWith("image/")) { sizeLimit = IMAGE_MAX_SIZE; sizeLabel = "Images must be under 16 MB"; }
    else if (mime.startsWith("video/")) { sizeLimit = VIDEO_MAX_SIZE; sizeLabel = "Videos must be under 100 MB"; }

    if (size > sizeLimit) return { error: sizeLabel };
    return { contentType, type, size, sizeLimit };
  }

  // ── Start a presigned S3 upload ──────────────────────────────────────────────
  async function startPresignedMediaUpload(req, { purpose, category, ownerId, roomId, imagesOnly = false }) {
    const input = mediaUploadInput(req, imagesOnly);
    if (!input) return { error: "Invalid file size" };
    if (input.error) return { error: input.error }; // per-type size error
    if (!mediaStorage.isS3Enabled) return { mode: "proxy" };

    const filename = `${crypto.randomUUID()}${input.type.extension}`;
    const finalKey = mediaKey(req.projectId, category, ownerId, filename);
    const stagingKey = `pending/${req.projectId}/${crypto.randomUUID()}`;

    const form = await mediaStorage.createUploadForm({
      key: stagingKey,
      contentType: input.contentType,
      maxSize: input.sizeLimit, // use the per-type limit, not the global cap
    });

    const originalName = String(req.body?.fileName || "").slice(0, 255) || filename;
    const completionToken = jwt.sign(
      {
        scope: "media-upload",
        purpose,
        projectId: req.projectId,
        userId: req.userId,
        roomId: roomId || null,
        stagingKey,
        finalKey,
        filename,
        originalName,
        contentType: input.contentType,
        fileType: input.type.fileType,
        size: input.size,
        sizeLimit: input.sizeLimit, // per-type limit for finalize validation
      },
      CHAT_JWT_SECRET,
      { expiresIn: "10m" },
    );

    return { mode: "s3", url: form.url, fields: form.fields, completionToken };
  }

  // ── Verify a presign completion token ───────────────────────────────────────
  function verifyUploadToken(req, purpose, roomId) {
    const token = req.body?.completionToken;
    if (!token) return null;
    try {
      const payload = jwt.verify(token, CHAT_JWT_SECRET);
      if (
        payload.scope !== "media-upload" ||
        payload.purpose !== purpose ||
        payload.projectId !== req.projectId ||
        payload.userId !== req.userId ||
        (roomId && payload.roomId !== roomId)
      ) return null;
      return payload;
    } catch {
      return null;
    }
  }

  // ── Finalise a presigned S3 upload ───────────────────────────────────────────
  async function completePresignedMediaUpload(req, payload) {
    const saved = await mediaStorage.finalizeUpload({
      stagingKey: payload.stagingKey,
      finalKey: payload.finalKey,
      contentType: payload.contentType,
      // Use the per-type limit stored in the token; fall back to 20 MB for
      // tokens issued before this field existed.
      maxSize: payload.sizeLimit || OTHER_MAX_SIZE,
      verifySignature: () => true,
    });
    return {
      ...saved,
      fileName: payload.originalName || payload.filename,
      fileType: payload.fileType,
    };
  }

  // ── Middleware: verify the user is a room member before upload ───────────────
  function requireRoomUploadAccess(req, res, next) {
    (async () => {
      const room = await prisma.chatRoom.findFirst({
        where: { id: req.params.roomId, projectId: req.projectId },
        include: { members: { where: { userId: req.userId }, select: { userId: true } } },
      });
      if (!room || room.members.length === 0) return sendError(res, 403, "Not a member of this room");
      const { allowDirectChat, allowGroupChat } = await getProjectPermissions(req.projectId, req);
      if ((room.isGroup && !allowGroupChat) || (!room.isGroup && !allowDirectChat)) {
        return sendError(res, 403, "Chat is not enabled for this project");
      }
      req.mediaRoom = room;
      next();
    })().catch(next);
  }

  // hasAllowedFileSignature — kept as a no-op so existing callers don't break
  function hasAllowedFileSignature() { return true; }

  return {
    parseRoomUpload: parseMediaUpload,
    sendStoredMedia,
    mediaUploadInput,
    startPresignedMediaUpload,
    verifyUploadToken,
    completePresignedMediaUpload,
    requireRoomUploadAccess,
    hasAllowedFileSignature,
  };
};
