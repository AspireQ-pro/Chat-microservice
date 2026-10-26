module.exports = function registerProjectRoutes(context) {
  const {
    app, prisma, API_BASE, BACKEND_URL, CHAT_FRONTEND_URL, CHAT_JWT_SECRET,
    UPLOAD_TYPES, parseRoomUpload, mediaStorage, mediaKey, legacyMediaKey,
    sendStoredMedia, startPresignedMediaUpload, verifyUploadToken,
    completePresignedMediaUpload, requireRoomUploadAccess,
    hasAllowedFileSignature, sendError, asyncHandler, generateApiKey,
    encryptContent, decryptContent, decryptMessage, serializeRoomForUser,
    profileAvatarUrl, normalizeLegacyMediaUrl,
    roomMediaStorageKey, resolveProject, authenticateChatJWT,
    parseFeatureFlag, resolveChatCapabilities, getProjectPermissions,
    crypto, jwt, path, io,
  } = context;
app.get("/", (req, res) => {
  res.json({ status: "Chat service is running" });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 1. REGISTER PROJECT â€” Admin creates a project and gets an API key
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

app.post(
  `${API_BASE}/projects`,
  asyncHandler(async (req, res) => {
    const expectedSecret = process.env.PROJECT_REGISTRATION_SECRET;
    if (!expectedSecret) {
      return sendError(res, 503, "Project registration is disabled");
    }
    const providedSecret = req.headers["x-registration-secret"];
    const expectedBuffer = Buffer.from(expectedSecret);
    const providedBuffer = Buffer.from(String(providedSecret || ""));
    if (
      providedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      return sendError(res, 401, "Invalid project registration secret");
    }

    const { name } = req.body;
    if (!name) return sendError(res, 400, "Project name is required");
    const capabilities = resolveChatCapabilities(req.body);

    const project = await prisma.project.create({
      data: {
        name,
        apiKey: generateApiKey(),
        plan: capabilities.plan,
        allowGroupChat: capabilities.allowGroupChat,
        allowDirectChat: capabilities.allowDirectChat,
      },
    });
    res.status(201).json({
      id: project.id,
      name: project.name,
      apiKey: project.apiKey,
      plan: project.plan,
      allowGroupChat: project.allowGroupChat,
      allowDirectChat: project.allowDirectChat,
    });
  }),
);

app.patch(
  `${API_BASE}/projects/:id`,
  asyncHandler(async (req, res) => {
    const expectedSecret = process.env.PROJECT_REGISTRATION_SECRET;
    if (!expectedSecret) {
      return sendError(res, 503, "Project administration is disabled");
    }
    const providedSecret = req.headers["x-registration-secret"];
    const expectedBuffer = Buffer.from(expectedSecret);
    const providedBuffer = Buffer.from(String(providedSecret || ""));
    if (
      providedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      return sendError(res, 401, "Invalid project registration secret");
    }

    const { id } = req.params;
    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) return sendError(res, 404, "Project not found");

    const capabilities = resolveChatCapabilities(req.body, existing);
    const updated = await prisma.project.update({
      where: { id },
      data: {
        name: req.body.name && String(req.body.name).trim() ? String(req.body.name).trim() : existing.name,
        plan: capabilities.plan,
        allowGroupChat: capabilities.allowGroupChat,
        allowDirectChat: capabilities.allowDirectChat,
        ...(req.body.isActive !== undefined ? { isActive: Boolean(req.body.isActive) } : {}),
      },
    });

    res.json({
      id: updated.id,
      name: updated.name,
      apiKey: updated.apiKey,
      plan: updated.plan,
      allowGroupChat: updated.allowGroupChat,
      allowDirectChat: updated.allowDirectChat,
      isActive: updated.isActive,
    });
  }),
);

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 2. SYNC USER â€” Project's backend calls this when a user clicks "Chat"
//    Server-to-server: X-API-KEY identifies the project, body has user details
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const handleSyncUser = asyncHandler(async (req, res) => {
  const { id, name, email, role } = req.body || {};
  if (!id || !name) {
    return sendError(res, 400, "id and name are required");
  }

  const safeEmail =
    email && String(email).trim()
      ? String(email).trim()
      : `${String(id)}@noemail.local`;
  const safeRole = role && String(role).trim() ? String(role).trim() : null;

  let chatUser = await prisma.chatUser.findUnique({
    where: {
      projectId_externalUserId: {
        projectId: req.project.id,
        externalUserId: String(id),
      },
    },
  });

  if (!chatUser) {
    chatUser = await prisma.chatUser.create({
      data: {
        projectId: req.project.id,
        externalUserId: String(id),
        name: String(name),
        email: safeEmail,
        role: safeRole,
      },
    });
  } else {
    chatUser = await prisma.chatUser.update({
      where: { id: chatUser.id },
      data: { name: String(name), email: safeEmail, role: safeRole },
    });
  }

  const capabilities = resolveChatCapabilities(req.body, req.project);

  if (
    req.project &&
    (req.project.allowGroupChat !== capabilities.allowGroupChat ||
      req.project.allowDirectChat !== capabilities.allowDirectChat ||
      req.project.plan !== capabilities.plan) &&
    (req.body.allowGroupChat !== undefined ||
      req.body.groupChat !== undefined ||
      req.body.allowDirectChat !== undefined ||
      req.body.allowIndividualChat !== undefined ||
      req.body.individualChat !== undefined ||
      req.body.subFeatures !== undefined ||
      req.body.features !== undefined ||
      (typeof req.body.plan === "object" && req.body.plan !== null))
  ) {
    await prisma.project.update({
      where: { id: req.project.id },
      data: {
        plan: capabilities.plan,
        allowGroupChat: capabilities.allowGroupChat,
        allowDirectChat: capabilities.allowDirectChat,
      },
    });
    req.project.plan = capabilities.plan;
    req.project.allowGroupChat = capabilities.allowGroupChat;
    req.project.allowDirectChat = capabilities.allowDirectChat;
  }

  const chatToken = jwt.sign(
    {
      userId: chatUser.id,
      projectId: req.project.id,
      name: chatUser.name,
      email: chatUser.email,
      plan: capabilities.plan,
      allowGroupChat: capabilities.allowGroupChat,
      allowDirectChat: capabilities.allowDirectChat,
    },
    CHAT_JWT_SECRET,
    { expiresIn: "24h" },
  );

  res.json({
    success: true,
    token: chatToken,
    chatUrl: CHAT_FRONTEND_URL,
    projectId: req.project.id,
    plan: capabilities.plan,
    allowGroupChat: capabilities.allowGroupChat,
    allowDirectChat: capabilities.allowDirectChat,
    user: {
      id: chatUser.id,
      name: chatUser.name,
      email: chatUser.email,
      plan: capabilities.plan,
      allowGroupChat: capabilities.allowGroupChat,
      allowDirectChat: capabilities.allowDirectChat,
    },
    data: {
      token: chatToken,
      chatUrl: CHAT_FRONTEND_URL,
      projectId: req.project.id,
      user: {
        id: chatUser.id,
        name: chatUser.name,
        email: chatUser.email,
      },
    },
  });
});

app.post(`${API_BASE}/users/sync`, resolveProject, handleSyncUser);
app.post(`${API_BASE}/chat/session`, resolveProject, handleSyncUser);
// ── GET /api/projects/current — returns the project ID for a given API key ──
// Server-to-server: X-API-KEY identifies the project. Used by the RBAC service
// to backfill chatProjectId for societies that have a chatApiKey but no projectId.
app.get(
  `${API_BASE}/projects/current`,
  resolveProject,
  (req, res) => {
    res.json({
      id: req.project.id,
      name: req.project.name,
      plan: req.project.plan,
      allowGroupChat: req.project.allowGroupChat,
      allowDirectChat: req.project.allowDirectChat,
      isActive: req.project.isActive,
    });
  },
);

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 2b. BULK SYNC USERS â€” Project's backend pushes its whole member list so every
//     member appears in chat immediately (not only after they open chat).
//     Server-to-server: X-API-KEY identifies the project.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

app.post(
  `${API_BASE}/users/bulk-sync`,
  resolveProject,
  asyncHandler(async (req, res) => {
    const users = Array.isArray(req.body?.users) ? req.body.users : [];
    if (users.length === 0) {
      return sendError(res, 400, "users array is required");
    }

    let synced = 0;
    const errors = [];

    for (const u of users) {
      const id = u?.id;
      const name = u?.name;
      if (!id || !name) {
        errors.push({ id: id ?? null, error: "id and name are required" });
        continue;
      }
      const safeEmail =
        u.email && String(u.email).trim()
          ? String(u.email).trim()
          : `${String(id)}@noemail.local`;
      const safeRole =
        u.role && String(u.role).trim() ? String(u.role).trim() : null;

      try {
        await prisma.chatUser.upsert({
          where: {
            projectId_externalUserId: {
              projectId: req.project.id,
              externalUserId: String(id),
            },
          },
          update: { name: String(name), email: safeEmail, role: safeRole },
          create: {
            projectId: req.project.id,
            externalUserId: String(id),
            name: String(name),
            email: safeEmail,
            role: safeRole,
          },
        });
        synced++;
      } catch (err) {
        errors.push({ id: String(id), error: err.message });
      }
    }

    res.json({ success: true, synced, total: users.length, errors });
  }),
);

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 3. SEARCH USERS â€” Only within the same project
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

app.get(`${API_BASE}/users`, authenticateChatJWT, async (req, res) => {
  const { excludeId, q } = req.query;
  try {
    const { allowDirectChat, allowGroupChat } = await getProjectPermissions(req.projectId, req);
    if (!allowDirectChat && !allowGroupChat) {
      return res.json([]);
    }
    const where = { projectId: req.projectId };
    if (excludeId) where.id = { not: excludeId };
    if (q) where.name = { contains: q, mode: "insensitive" };

    const users = await prisma.chatUser.findMany({
      where,
      orderBy: { name: "asc" },
    });
    res.json(await Promise.all(users.map(async ({ avatarStorageKey, ...user }) => ({
      ...user,
      avatarUrl: avatarStorageKey
        ? await profileAvatarUrl(user.id, avatarStorageKey)
        : normalizeLegacyMediaUrl(user.avatarUrl),
    }))));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 4. ROOMS â€” Scoped by project
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// List rooms for a user
app.get(
  `${API_BASE}/users/:userId/rooms`,
  authenticateChatJWT,
  async (req, res) => {
    const { userId } = req.params;
    if (userId !== req.userId) {
      return res
        .status(403)
        .json({ error: "Cannot access another user's rooms" });
    }
    try {
      const { allowDirectChat, allowGroupChat } = await getProjectPermissions(req.projectId, req);
      if (!allowDirectChat && !allowGroupChat) {
        return res.json([]);
      }

      const roomConditions = [];
      if (allowGroupChat) {
        roomConditions.push({ isGroup: true });
      }
      if (allowDirectChat) {
        roomConditions.push(
          { isGroup: false, directStatus: "accepted" },
          { isGroup: false, directStatus: "pending", messages: { some: {} } },
        );
      }

      const rooms = await prisma.chatRoom.findMany({
        where: {
          projectId: req.projectId,
          members: { some: { userId } },
          OR: roomConditions,
        },
        include: { members: { include: { user: true } } },
        orderBy: [
          { lastMessageAt: { sort: "desc", nulls: "last" } },
          { createdAt: "desc" },
        ],
      });
      const out = await Promise.all(
        rooms.map((room) => serializeRoomForUser(room, userId)),
      );
      res.json(out);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },
);

// Create or get direct 1-to-1 room
};
