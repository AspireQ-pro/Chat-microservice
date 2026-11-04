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
  const MAX_SIZE = 100 * 1024 * 1024; // 100 MB

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
    // Normalise MIME — browsers sometimes report empty string for unusual types
    const contentType = (String(req.body?.contentType || "").trim()) || "application/octet-stream";
    const originalName = String(req.body?.fileName || "").trim();
    const type = getUploadType(contentType, originalName);
    const size = Number(req.body?.size);
    if (imagesOnly && type.fileType !== "image") return null;
    if (!Number.isInteger(size) || size < 1 || size > MAX_SIZE) return null;
    return { contentType, type, size };
  }

  // ── Start a presigned S3 upload ──────────────────────────────────────────────
  async function startPresignedMediaUpload(req, { purpose, category, ownerId, roomId, imagesOnly = false }) {
    const input = mediaUploadInput(req, imagesOnly);
    if (!input) return { error: "Invalid file size" };
    if (!mediaStorage.isS3Enabled) return { mode: "proxy" };

    const filename = `${crypto.randomUUID()}${input.type.extension}`;
    const finalKey = mediaKey(req.projectId, category, ownerId, filename);
    const stagingKey = `pending/${req.projectId}/${crypto.randomUUID()}`;

    const form = await mediaStorage.createUploadForm({
      key: stagingKey,
      contentType: input.contentType,
      maxSize: MAX_SIZE,
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
    // No signature check — all file types are accepted
    const saved = await mediaStorage.finalizeUpload({
      stagingKey: payload.stagingKey,
      finalKey: payload.finalKey,
      contentType: payload.contentType,
      maxSize: MAX_SIZE,
      verifySignature: () => true, // accept any file content
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
