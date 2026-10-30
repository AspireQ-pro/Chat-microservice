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
    // For local-disk fallback, only set Content-Disposition if not already set
    if (!res.getHeader("Content-Disposition")) {
      res.setHeader("Content-Disposition", "inline");
    }
    return res.sendFile(target.path, (err) => {
      if (err && !res.headersSent) res.status(err.statusCode || 404).end();
    });
  }

  function mediaUploadInput(req, imagesOnly = false) {
    const contentType = String(req.body?.contentType || "");
    const type = UPLOAD_TYPES[contentType];
    const size = Number(req.body?.size);
    if (!type || (imagesOnly && type.fileType !== "image")) return null;
    if (!Number.isInteger(size) || size < 1 || size > 25 * 1024 * 1024) return null;
    return { contentType, type, size };
  }

  async function startPresignedMediaUpload(req, { purpose, category, ownerId, roomId, imagesOnly = false }) {
    const input = mediaUploadInput(req, imagesOnly);
    if (!input) return { error: "Unsupported file type or size" };
    if (!mediaStorage.isS3Enabled) return { mode: "proxy" };

    const filename = `${crypto.randomUUID()}${input.type.extension}`;
    const finalKey = mediaKey(req.projectId, category, ownerId, filename);
    const stagingKey = `pending/${req.projectId}/${crypto.randomUUID()}`;
    const MAX_SIZE = 25 * 1024 * 1024;
    const form = await mediaStorage.createUploadForm({
      key: stagingKey,
      contentType: input.contentType,
      maxSize: MAX_SIZE,
    });
    const originalName = String(req.body?.fileName || "").slice(0, 255) || filename;
    const completionToken = jwt.sign({
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
    const saved = await mediaStorage.finalizeUpload({
      stagingKey: payload.stagingKey,
      finalKey: payload.finalKey,
      contentType: payload.contentType,
      maxSize: 25 * 1024 * 1024,
      verifySignature: hasAllowedFileSignature,
    });
    return {
      ...saved,
      fileName: payload.originalName || payload.filename,
      fileType: payload.fileType,
    };
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
    if (!buffer || buffer.length < 4) return false;
    // Images
    if (mimeType === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (mimeType === "image/gif") return buffer.subarray(0, 6).toString("ascii").match(/^GIF8[79]a$/) !== null;
    if (mimeType === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.length >= 12 && buffer.subarray(8, 12).toString("ascii") === "WEBP";
    // PDF
    if (mimeType === "application/pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
    // Office Open XML (DOCX, XLSX, PPTX) and ZIP — PK header
    if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
      mimeType === "application/zip"
    ) {
      return buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07);
    }
    // Legacy Office DOC/XLS/PPT — Compound Document File (D0 CF 11 E0)
    if (
      mimeType === "application/msword" ||
      mimeType === "application/vnd.ms-excel" ||
      mimeType === "application/vnd.ms-powerpoint"
    ) {
      return buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;
    }
    // Audio
    if (mimeType === "audio/mpeg") {
      // MP3: sync word 0xFF 0xEx or ID3 tag
      return (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) ||
             (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33);
    }
    if (mimeType === "audio/ogg") return buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53;
    if (mimeType === "audio/wav") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.length >= 12 && buffer.subarray(8, 12).toString("ascii") === "WAVE";
    // Video
    if (mimeType === "video/mp4") {
      // Check ftyp box at byte offset 4 (most common) or moov/mdat boxes
      if (buffer.length < 8) return false;
      const box = buffer.subarray(4, 8).toString("ascii");
      return box === "ftyp" || box === "moov" || box === "mdat" || box === "free" || box === "wide";
    }
    if (mimeType === "video/webm") return buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
    // Text/CSV — no reliable magic bytes; allow anything
    if (mimeType === "text/plain" || mimeType === "text/csv") return true;
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
