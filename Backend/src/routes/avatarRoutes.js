module.exports = function registerAvatarRoutes(context) {
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
  `${API_BASE}/rooms/group/avatar/presign`,
  authenticateChatJWT,
  asyncHandler(async (req, res) => {
    const { allowGroupChat } = await getProjectPermissions(req.projectId, req);
    if (!allowGroupChat) return sendError(res, 403, "Group chat is not enabled for this project");
    const result = await startPresignedMediaUpload(req, {
      purpose: "group-avatar",
      category: "groups/avatars",
      ownerId: "shared",
      imagesOnly: true,
    });
    if (result.error) return sendError(res, 400, result.error);
    res.json(result);
  }),
);

app.post(
  `${API_BASE}/rooms/group/avatar/complete`,
  authenticateChatJWT,
  asyncHandler(async (req, res) => {
    const { allowGroupChat } = await getProjectPermissions(req.projectId, req);
    if (!allowGroupChat) return sendError(res, 403, "Group chat is not enabled for this project");
    const payload = verifyUploadToken(req, "group-avatar");
    if (!payload) return sendError(res, 403, "Invalid or expired upload authorization");
    await completePresignedMediaUpload(req, payload);
    res.status(201).json({ avatarUrl: `${BACKEND_URL}${API_BASE}/uploads/${payload.filename}` });
  }),
);

app.post(
  `${API_BASE}/rooms/group/avatar`,
  authenticateChatJWT,
  asyncHandler(async (req, res, next) => {
    const { allowGroupChat } = await getProjectPermissions(req.projectId, req);
    if (!allowGroupChat) {
      return sendError(res, 403, "Group chat is not enabled for this project");
    }
    next();
  }),
  parseRoomUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) return sendError(res, 400, "A file is required");

    // Only images are accepted as group avatars (not PDFs).
    const allowedType = UPLOAD_TYPES[req.file.mimetype];
    if (!allowedType || allowedType.fileType !== "image") {
      return sendError(res, 400, "Only image files (JPEG, PNG, GIF, WebP) are accepted for group avatars");
    }

    // Verify magic bytes to prevent MIME spoofing.
    if (!hasAllowedFileSignature(req.file.buffer, req.file.mimetype)) {
      return sendError(res, 400, "File contents do not match an allowed image type");
    }

    const filename = `${crypto.randomUUID()}${allowedType.extension}`;
    const key = mediaKey(req.projectId, "groups/avatars", "shared", filename);
    await mediaStorage.putObject({ key, body: req.file.buffer, contentType: req.file.mimetype });
    const avatarUrl = `${BACKEND_URL}${API_BASE}/uploads/${filename}`;
    res.status(201).json({ avatarUrl });
  }),
);

// Upload or replace the authenticated user's profile image.
app.post(
  `${API_BASE}/users/me/avatar/presign`,
  authenticateChatJWT,
  asyncHandler(async (req, res) => {
    const result = await startPresignedMediaUpload(req, {
      purpose: "profile-avatar",
      category: "users/profile",
      ownerId: req.userId,
      imagesOnly: true,
    });
    if (result.error) return sendError(res, 400, result.error);
    res.json(result);
  }),
);

app.post(
  `${API_BASE}/users/me/avatar/complete`,
  authenticateChatJWT,
  asyncHandler(async (req, res) => {
    const payload = verifyUploadToken(req, "profile-avatar");
    if (!payload) return sendError(res, 403, "Invalid or expired upload authorization");
    await completePresignedMediaUpload(req, payload);
    const avatarUrl = `${BACKEND_URL}${API_BASE}/users/${req.userId}/avatar/${payload.filename}`;
    await prisma.chatUser.update({
      where: { id: req.userId },
      data: { avatarUrl, avatarStorageKey: payload.finalKey },
    });
    res.status(201).json({ avatarUrl });
  }),
);

app.post(
  `${API_BASE}/users/me/avatar`,
  authenticateChatJWT,
  parseRoomUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) return sendError(res, 400, "A file is required");
    const allowedType = UPLOAD_TYPES[req.file.mimetype];
    if (!allowedType || allowedType.fileType !== "image" || !hasAllowedFileSignature(req.file.buffer, req.file.mimetype)) {
      return sendError(res, 400, "File contents do not match an allowed image type");
    }
    const filename = `${crypto.randomUUID()}${allowedType.extension}`;
    const key = mediaKey(req.projectId, "users/profile", req.userId, filename);
    await mediaStorage.putObject({ key, body: req.file.buffer, contentType: req.file.mimetype });
    const avatarUrl = `${BACKEND_URL}${API_BASE}/users/${req.userId}/avatar/${filename}`;
    await prisma.chatUser.update({
      where: { id: req.userId },
      data: { avatarUrl, avatarStorageKey: key },
    });
    res.status(201).json({ avatarUrl });
  }),
);

// Profile images are private and only available to users in the same society.
app.get(
  `${API_BASE}/users/:userId/avatar/:filename`,
  authenticateChatJWT,
  asyncHandler(async (req, res) => {
    const { userId, filename } = req.params;
    if (path.basename(filename) !== filename || !/^[0-9a-f-]{36}\.(jpg|png|gif|webp)$/i.test(filename)) {
      return res.status(404).json({ error: "Not found" });
    }
    const user = await prisma.chatUser.findFirst({
      where: { id: userId, projectId: req.projectId, avatarUrl: `${BACKEND_URL}${API_BASE}/users/${userId}/avatar/${filename}` },
      select: { id: true, avatarStorageKey: true },
    });
    if (!user) return res.status(404).json({ error: "Not found" });
    const key = user.avatarStorageKey || legacyMediaKey(req.projectId, "users/profile", userId, filename);
    await sendStoredMedia(res, key);
  }),
);

// Create group room
};
