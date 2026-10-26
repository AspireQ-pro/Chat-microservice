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
      size: saved.size,
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
    const allowedType = UPLOAD_TYPES[req.file.mimetype];
    if (!allowedType || !hasAllowedFileSignature(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({ error: "File contents do not match an allowed type" });
    }
    const filename = `${crypto.randomUUID()}${allowedType.extension}`;
    const category = req.room.isGroup ? "groups" : "direct";
    const key = mediaKey(req.projectId, category, req.room.id, filename);
    await mediaStorage.putObject({ key, body: req.file.buffer, contentType: req.file.mimetype });
    res.status(201).json({
      fileUrl: `${BACKEND_URL}${API_BASE}/rooms/${req.params.roomId}/uploads/${filename}`,
      fileType: allowedType.fileType,
      size: req.file.size,
    });
  }),
);

app.get(
  `${API_BASE}/rooms/:roomId/uploads/:filename`,
  authenticateChatJWT,
  asyncHandler(async (req, res) => {
    const { roomId, filename } = req.params;
    if (
      path.basename(filename) !== filename ||
      !/^[0-9a-f-]{36}\.(jpg|png|gif|webp|pdf)$/i.test(filename)
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
        fileUrl: { endsWith: `/uploads/${filename}` },
      },
      select: { id: true, fileStorageKey: true },
    });
    if (!referenced) return res.status(404).json({ error: "Attachment not found" });

    const category = room.isGroup ? "groups" : "direct";
    const key = referenced.fileStorageKey || legacyMediaKey(req.projectId, category, roomId, filename);
    await sendStoredMedia(res, key);
  }),
);

// â”€â”€â”€ Serve general uploads (group avatars etc.) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET /api/uploads/:filename
// JWT-protected. Any authenticated member of the same project can load avatars.
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
        avatarUrl: { endsWith: `/uploads/${filename}` },
      },
      select: { id: true, avatarStorageKey: true },
    });
    if (!room) return res.status(404).json({ error: "Not found" });

    const key = room.avatarStorageKey || legacyMediaKey(req.projectId, "groups/avatars", "shared", filename);
    await sendStoredMedia(res, key);
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
