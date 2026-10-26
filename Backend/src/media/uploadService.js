const crypto = require("crypto");
const { pipeline } = require("node:stream/promises");

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
  const { API_BASE, BACKEND_URL, CHAT_JWT_SECRET, UPLOAD_TYPES } = config;

  async function sendStoredMedia(req, res, key) {
    const target = await mediaStorage.getDownloadTarget(key, req.headers.range);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    if (target.body) {
      res.setHeader("Content-Type", target.contentType || "application/octet-stream");
      res.setHeader("Accept-Ranges", target.acceptRanges || "bytes");
      if (target.contentLength != null) {
        res.setHeader("Content-Length", target.contentLength);
      }
      if (target.contentRange) {
        res.status(206);
        res.setHeader("Content-Range", target.contentRange);
      }
      await pipeline(target.body, res);
      return;
    }
    res.setHeader("Content-Disposition", "inline");
    return res.sendFile(target.path, (err) => {
      if (err && !res.headersSent) res.status(err.statusCode || 404).end();
    });
  }

  function mediaUploadInput(req, imagesOnly = false) {
    const contentType = String(req.body?.contentType || "");
    const type = UPLOAD_TYPES[contentType];
    const size = Number(req.body?.size);
    if (!type || (imagesOnly && type.fileType !== "image")) return null;
    if (!Number.isInteger(size) || size < 1 || size > 10 * 1024 * 1024) return null;
    return { contentType, type, size };
  }

  async function startPresignedMediaUpload(req, { purpose, category, ownerId, roomId, imagesOnly = false }) {
    const input = mediaUploadInput(req, imagesOnly);
    if (!input) return { error: "Unsupported file type or size" };
    if (!mediaStorage.isS3Enabled) return { mode: "proxy" };

    const filename = `${crypto.randomUUID()}${input.type.extension}`;
    const finalKey = mediaKey(req.projectId, category, ownerId, filename);
    const stagingKey = `pending/${req.projectId}/${crypto.randomUUID()}`;
    const form = await mediaStorage.createUploadForm({
      key: stagingKey,
      contentType: input.contentType,
      maxSize: 10 * 1024 * 1024,
    });
    const completionToken = jwt.sign({
      scope: "media-upload",
      purpose,
      projectId: req.projectId,
      userId: req.userId,
      roomId: roomId || null,
      stagingKey,
      finalKey,
      filename,
      contentType: input.contentType,
      fileType: input.type.fileType,
    }, CHAT_JWT_SECRET, { expiresIn: "10m" });

    return { mode: "s3", url: form.url, fields: form.fields, completionToken };
  }

  function verifyUploadToken(req, purpose, roomId) {
    const token = req.body?.completionToken;
    if (!token) return null;
    try {
      const payload = jwt.verify(token, CHAT_JWT_SECRET);
      if (
        payload.scope !== "media-upload" || payload.purpose !== purpose ||
        payload.projectId !== req.projectId || payload.userId !== req.userId ||
        (roomId && payload.roomId !== roomId)
      ) return null;
      return payload;
    } catch {
      return null;
    }
  }

  async function completePresignedMediaUpload(req, payload) {
    return mediaStorage.finalizeUpload({
      stagingKey: payload.stagingKey,
      finalKey: payload.finalKey,
      contentType: payload.contentType,
      maxSize: 10 * 1024 * 1024,
      verifySignature: hasAllowedFileSignature,
    });
  }

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

  function hasAllowedFileSignature(buffer, mimeType) {
    if (mimeType === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (mimeType === "image/gif") return buffer.subarray(0, 6).toString("ascii").match(/^GIF8[79]a$/) !== null;
    if (mimeType === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
    if (mimeType === "application/pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
    return false;
  }

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
