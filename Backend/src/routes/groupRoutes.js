module.exports = function registerGroupRoutes(context) {
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
app.post(`${API_BASE}/rooms/group`, authenticateChatJWT, async (req, res) => {
  const { allowGroupChat } = await getProjectPermissions(req.projectId, req);
  if (!allowGroupChat) {
    return sendError(res, 403, "Group chat is not enabled for this project");
  }

  const { name, memberIds, avatarUrl, description } = req.body;
  const creatorId = req.userId;
  if (!name || !memberIds?.length) {
    return res
      .status(400)
      .json({ error: "name and memberIds are required" });
  }

  // Validate the avatarUrl if provided â€” must be a URL served by this backend.
  const safeAvatarUrl = (() => {
    if (!avatarUrl) return null;
    try {
      const u = new URL(String(avatarUrl));
      const base = new URL(BACKEND_URL);
      if (u.origin !== base.origin) return null;
      if (!u.pathname.startsWith(`${API_BASE}/uploads/`)) return null;
      const filename = path.basename(u.pathname);
      if (!/^[0-9a-f-]{36}\.(jpg|png|gif|webp)$/i.test(filename)) return null;
      return avatarUrl;
    } catch {
      return null;
    }
  })();
  const safeAvatarStorageKey = safeAvatarUrl
    ? mediaKey(req.projectId, "groups/avatars", "shared", path.basename(new URL(safeAvatarUrl).pathname))
    : null;
  if (safeAvatarStorageKey && !(await mediaStorage.objectExists(safeAvatarStorageKey))) {
    return sendError(res, 400, "Group avatar upload was not found");
  }

  const safeDescription = description && String(description).trim()
    ? String(description).trim().slice(0, 500)
    : null;

  const allIds = Array.from(new Set([creatorId, ...memberIds]));
  const validCount = await prisma.chatUser.count({
    where: { projectId: req.projectId, id: { in: allIds } },
  });
  if (validCount !== allIds.length) {
    return res
      .status(403)
      .json({ error: "All members must belong to this project" });
  }

  try {
    const room = await prisma.chatRoom.create({
      data: {
        projectId: req.projectId,
        name,
        isGroup: true,
        avatarUrl: safeAvatarUrl,
        avatarStorageKey: safeAvatarStorageKey,
        description: safeDescription,
        members: { create: allIds.map((userId) => ({ userId })) },
      },
      include: { members: { include: { user: true } } },
    });
    await Promise.all(
      allIds.map(async (userId) => {
        const memberRoom = await serializeRoomForUser(room, userId);
        io.to(`user:${userId}`).emit("group_created", { room: memberRoom });
      }),
    );
    res.json(await serializeRoomForUser(room, creatorId));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get single room
app.get(`${API_BASE}/rooms/:roomId`, authenticateChatJWT, async (req, res) => {
  const { roomId } = req.params;
  try {
    const room = await prisma.chatRoom.findFirst({
      where: { id: roomId, projectId: req.projectId },
      include: { members: { include: { user: true } } },
    });
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (!room.members.some((member) => member.userId === req.userId)) {
      return res.status(403).json({ error: "Not a member of this room" });
    }
    const { allowDirectChat, allowGroupChat } = await getProjectPermissions(req.projectId, req);
    if (room.isGroup && !allowGroupChat) {
      return sendError(res, 403, "Group chat is not enabled for this project");
    }
    if (!room.isGroup && !allowDirectChat) {
      return sendError(res, 403, "Direct messaging is not enabled for this project");
    }
    res.json(await serializeRoomForUser(room, req.userId));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Leave a group room (member removes themselves)
app.delete(`${API_BASE}/rooms/:roomId/members/me`, authenticateChatJWT, async (req, res) => {
  const { roomId } = req.params;
  try {
    const room = await prisma.chatRoom.findFirst({
      where: { id: roomId, projectId: req.projectId, isGroup: true },
      include: { members: { select: { userId: true } } },
    });
    if (!room) return res.status(404).json({ error: "Room not found" });

    const isMember = room.members.some((m) => m.userId === req.userId);
    if (!isMember) return res.status(403).json({ error: "Not a member of this room" });

    await prisma.chatRoomMember.delete({
      where: { roomId_userId: { roomId, userId: req.userId } },
    });

    // Notify remaining members that the room roster changed
    const remaining = room.members
      .map((m) => m.userId)
      .filter((id) => id !== req.userId);
    for (const uid of remaining) {
      io.to(`user:${uid}`).emit("member_left", { roomId, userId: req.userId });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Update group info (name / description / avatar) — owner only ─────────────
// PATCH /api/rooms/:roomId
app.patch(`${API_BASE}/rooms/:roomId`, authenticateChatJWT, asyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const room = await prisma.chatRoom.findFirst({
    where: { id: roomId, projectId: req.projectId, isGroup: true },
    include: { members: { orderBy: { joinedAt: 'asc' }, select: { userId: true, joinedAt: true } } },
  });
  if (!room) return sendError(res, 404, 'Group not found');

  // Only the first member (creator) may update group info
  const creatorId = room.members[0]?.userId;
  if (creatorId !== req.userId) return sendError(res, 403, 'Only the group creator can edit group info');

  const { name, description, avatarUrl } = req.body;
  const updateData = {};

  if (name !== undefined) {
    const trimmed = String(name || '').trim().slice(0, 50);
    if (!trimmed) return sendError(res, 400, 'Group name cannot be empty');
    updateData.name = trimmed;
  }

  if (description !== undefined) {
    updateData.description = description
      ? String(description).trim().slice(0, 500)
      : null;
  }

  if (avatarUrl !== undefined) {
    if (!avatarUrl) {
      updateData.avatarUrl = null;
    } else {
      try {
        const u = new URL(String(avatarUrl));
        const base = new URL(BACKEND_URL);
        if (u.origin !== base.origin || !u.pathname.startsWith(`${API_BASE}/uploads/`)) {
          return sendError(res, 400, 'Invalid avatar URL');
        }
        const filename = path.basename(u.pathname);
        if (!/^[0-9a-f-]{36}\.(jpg|png|gif|webp)$/i.test(filename)) {
          return sendError(res, 400, 'Invalid avatar file');
        }
        updateData.avatarUrl = avatarUrl;
      } catch {
        return sendError(res, 400, 'Invalid avatar URL');
      }
    }
  }

  if (!Object.keys(updateData).length) return sendError(res, 400, 'Nothing to update');

  const updated = await prisma.chatRoom.update({
    where: { id: roomId },
    data: updateData,
    include: { members: { include: { user: true } } },
  });

  // Notify all members
  for (const m of updated.members) {
    const memberRoom = await serializeRoomForUser(updated, m.userId);
    io.to(`user:${m.userId}`).emit('group_updated', { room: memberRoom });
  }

  res.json(await serializeRoomForUser(updated, req.userId));
}));

// ─── Add members to a group — owner only ──────────────────────────────────────
// POST /api/rooms/:roomId/members
app.post(`${API_BASE}/rooms/:roomId/members`, authenticateChatJWT, asyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const room = await prisma.chatRoom.findFirst({
    where: { id: roomId, projectId: req.projectId, isGroup: true },
    include: { members: { orderBy: { joinedAt: 'asc' }, include: { user: true } } },
  });
  if (!room) return sendError(res, 404, 'Group not found');

  const creatorId = room.members[0]?.userId;
  if (creatorId !== req.userId) return sendError(res, 403, 'Only the group creator can add members');

  const { memberIds } = req.body;
  if (!Array.isArray(memberIds) || !memberIds.length) {
    return sendError(res, 400, 'memberIds array is required');
  }

  const existingIds = new Set(room.members.map((m) => m.userId));
  const newIds = memberIds.filter((id) => !existingIds.has(id));
  if (!newIds.length) return sendError(res, 400, 'All users are already members');

  const validCount = await prisma.chatUser.count({
    where: { projectId: req.projectId, id: { in: newIds } },
  });
  if (validCount !== newIds.length) {
    return sendError(res, 403, 'Some users do not belong to this project');
  }

  await prisma.chatRoomMember.createMany({
    data: newIds.map((userId) => ({ roomId, userId })),
    skipDuplicates: true,
  });

  const updatedRoom = await prisma.chatRoom.findFirst({
    where: { id: roomId },
    include: { members: { include: { user: true } } },
  });

  // Notify all members (existing + new)
  for (const m of updatedRoom.members) {
    const memberRoom = await serializeRoomForUser(updatedRoom, m.userId);
    io.to(`user:${m.userId}`).emit('group_updated', { room: memberRoom });
  }

  res.json(await serializeRoomForUser(updatedRoom, req.userId));
}));

// ─── Remove a member from a group — owner only ────────────────────────────────
// DELETE /api/rooms/:roomId/members/:userId
app.delete(`${API_BASE}/rooms/:roomId/members/:targetUserId`, authenticateChatJWT, asyncHandler(async (req, res) => {
  const { roomId, targetUserId } = req.params;
  const room = await prisma.chatRoom.findFirst({
    where: { id: roomId, projectId: req.projectId, isGroup: true },
    include: { members: { orderBy: { joinedAt: 'asc' }, select: { userId: true, joinedAt: true } } },
  });
  if (!room) return sendError(res, 404, 'Group not found');

  const creatorId = room.members[0]?.userId;
  if (creatorId !== req.userId) return sendError(res, 403, 'Only the group creator can remove members');
  if (targetUserId === req.userId) return sendError(res, 400, 'Use the leave endpoint to remove yourself');

  const isMember = room.members.some((m) => m.userId === targetUserId);
  if (!isMember) return sendError(res, 404, 'User is not a member of this group');

  await prisma.chatRoomMember.delete({
    where: { roomId_userId: { roomId, userId: targetUserId } },
  });

  // Notify remaining members
  const remaining = room.members.map((m) => m.userId).filter((id) => id !== targetUserId);
  for (const uid of remaining) {
    io.to(`user:${uid}`).emit('member_removed', { roomId, userId: targetUserId });
  }
  // Notify the removed user
  io.to(`user:${targetUserId}`).emit('member_removed', { roomId, userId: targetUserId });

  res.json({ ok: true });
}));
};
