module.exports = function registerMediaRoutes(context) {
  const {
    app, prisma, API_BASE, BACKEND_URL, CHAT_FRONTEND_URL, CHAT_JWT_SECRET,
    UPLOAD_TYPES, parseRoomUpload, mediaStorage, mediaKey, legacyMediaKey,
    sendStoredMedia, startPresignedMediaUpload, verifyUploadToken,
    completePresignedMediaUpload, requireRoomUploadAccess,
    hasAllowedFileSignature, sendError, asyncHandler, generateApiKey,
    encryptContent, decryptContent, decryptMessage, serializeRoomForUser,
    roomMediaStorageKey, resolveProject, authenticateChatJWT,
    parseFeatureFlag, resolveChatCapabilities, getProjectPermissions,
    crypto, jwt, path, io,
  } = context;
app.post(
  `${API_BASE}/rooms/:roomId/upload-url`,
  authenticateChatJWT,
  requireRoomUploadAccess,
  asyncHandler(async (req, res) => {
    const result = await startPresignedMediaUpload(req, {
      purpose: "room-attachment",
      category: req.mediaRoom.isGroup ? "groups" : "direct",
      ownerId: req.mediaRoom.id,
      roomId: req.mediaRoom.id,
    });
    if (result.error) return sendError(res, 400, result.error);
    res.json(result);
  }),
);

app.post(
  `${API_BASE}/rooms/:roomId/upload-complete`,
  authenticateChatJWT,
  requireRoomUploadAccess,
  asyncHandler(async (req, res) => {
    const payload = verifyUploadToken(req, "room-attachment", req.mediaRoom.id);
    if (!payload) return sendError(res, 403, "Invalid or expired upload authorization");
    const saved = await completePresignedMediaUpload(req, payload);
    res.status(201).json({
      fileUrl: `${BACKEND_URL}${API_BASE}/rooms/${req.mediaRoom.id}/uploads/${payload.filename}`,
      fileType: payload.fileType,
      fileName: saved.fileName || payload.filename,
      fileSize: saved.size,
    });
  }),
);

app.post(
  `${API_BASE}/rooms/:roomId/upload`,
  authenticateChatJWT,
  asyncHandler(async (req, res, next) => {
    const room = await prisma.chatRoom.findFirst({
      where: { id: req.params.roomId, projectId: req.projectId },
      include: { members: { where: { userId: req.userId } } },
    });
    if (!room || room.members.length === 0) {
      return res.status(403).json({ error: "Not a member of this room" });
    }
    const { allowDirectChat, allowGroupChat } = await getProjectPermissions(req.projectId, req);
    if (room.isGroup && !allowGroupChat) {
      return sendError(res, 403, "Group chat is not enabled for this project");
    }
    if (!room.isGroup && !allowDirectChat) {
      return sendError(res, 403, "Direct messaging is not enabled for this project");
    }
    req.room = room;
    next();
  }),
  parseRoomUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "A file is required" });
    const { getUploadType } = require('../config/runtime');
    // Use the original filename's extension for storage — no type restrictions
    const mime = (req.file.mimetype || "application/octet-stream").trim() || "application/octet-stream";
    const originalName = req.file.originalname
      ? path.basename(req.file.originalname).replace(/[^\w.\-]/g, "_").slice(0, 255)
      : "";
    const { extension, fileType } = getUploadType(mime, originalName);
    const filename = `${crypto.randomUUID()}${extension}`;
    const category = req.room.isGroup ? "groups" : "direct";
    const key = mediaKey(req.projectId, category, req.room.id, filename);
    await mediaStorage.putObject({ key, body: req.file.buffer, contentType: mime });
    res.status(201).json({
      fileUrl: `${BACKEND_URL}${API_BASE}/rooms/${req.params.roomId}/uploads/${filename}`,
      fileType,
      fileName: originalName,
      fileSize: req.file.size,
    });
  }),
);

app.get(
  `${API_BASE}/rooms/:roomId/uploads/:filename`,
  authenticateChatJWT,
  asyncHandler(async (req, res) => {
    const { roomId, filename } = req.params;
    // Disallow path traversal. Accept any UUID-named file (UUID + dot + safe extension).
    // Extension: 1-12 alphanumeric chars — covers all known and future types (rtf, html, bin, …).
    if (
      path.basename(filename) !== filename ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,20}$/i.test(filename)
    ) {
      return res.status(404).json({ error: "Attachment not found" });
    }

    const room = await prisma.chatRoom.findFirst({
      where: {
        id: roomId,
        projectId: req.projectId,
        members: { some: { userId: req.userId } },
      },
      select: { id: true, isGroup: true },
    });
    if (!room) return res.status(404).json({ error: "Attachment not found" });

    const referenced = await prisma.message.findFirst({
      where: {
        roomId,
        OR: [
          { fileStorageKey: { endsWith: `/${filename}` } },
          { fileUrl: { endsWith: `/uploads/${filename}` } },
        ],
      },
      select: { id: true, fileStorageKey: true, fileName: true, fileType: true },
    });
    if (!referenced) return res.status(404).json({ error: "Attachment not found" });

    const category = room.isGroup ? "groups" : "direct";
    const key = referenced.fileStorageKey || legacyMediaKey(req.projectId, category, roomId, filename);

    // Always serve inline so the browser / OS viewer can open the file directly.
    // The frontend handles explicit downloads by fetching the blob and using <a download>.
    const downloadName = referenced.fileName || filename;
    const safeName = downloadName.replace(/[^\w.\-]/g, '_').replace(/^_+|_+$/g, '') || filename;
    const encodedName = encodeURIComponent(safeName);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"; filename*=UTF-8''${encodedName}`);

    await sendStoredMedia(req, res, key);
  }),
);

// â”€â”€â”€ Serve general uploads (group avatars etc.) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET /api/uploads/:filename
// JWT-protected. Only members of the group can load its avatar.
app.get(
  `${API_BASE}/uploads/:filename`,
  authenticateChatJWT,
  asyncHandler(async (req, res) => {
    const { filename } = req.params;
    // Only image files allowed here (avatars are never PDFs).
    if (
      path.basename(filename) !== filename ||
      !/^[0-9a-f-]{36}\.(jpg|png|gif|webp)$/i.test(filename)
    ) {
      return res.status(404).json({ error: "Not found" });
    }

    // Confirm the file is referenced as a group avatarUrl within this project.
    const room = await prisma.chatRoom.findFirst({
      where: {
        projectId: req.projectId,
        isGroup: true,
        members: { some: { userId: req.userId } },
        OR: [
          { avatarStorageKey: { endsWith: `/${filename}` } },
          { avatarUrl: { endsWith: `/uploads/${filename}` } },
        ],
      },
      select: { id: true, avatarStorageKey: true },
    });
    if (!room) return res.status(404).json({ error: "Not found" });

    const key = room.avatarStorageKey || legacyMediaKey(req.projectId, "groups/avatars", "shared", filename);
    await sendStoredMedia(req, res, key);
  }),
);

// Get room messages (paginated, WhatsApp-style)
//
// Query params:
//   limit  - page size (default 30, max 100)
//   before - ISO timestamp; return messages OLDER than this (for "load previous")
//
// Returns: { messages: [...oldestâ†’newest], hasMore, nextBefore }
//   - messages are ordered oldestâ†’newest so the client can append directly
//   - hasMore indicates whether older messages exist beyond this page
//   - nextBefore is the cursor to pass as `before` to fetch the previous page
};
