module.exports = function registerMessageRoutes(context) {
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
app.get(
  `${API_BASE}/rooms/:roomId/messages`,
  authenticateChatJWT,
  async (req, res) => {
    const { roomId } = req.params;
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Math.min(
      Math.max(Number.isFinite(rawLimit) ? rawLimit : 30, 1),
      100,
    );
    const before = req.query.before ? new Date(req.query.before) : null;

    try {
      const room = await prisma.chatRoom.findFirst({
        where: { id: roomId, projectId: req.projectId },
      });
      if (!room) return res.status(404).json({ error: "Room not found" });

      // Caller must be a member of the room.
      const membership = await prisma.chatRoomMember.findUnique({
        where: { roomId_userId: { roomId, userId: req.userId } },
      });
      if (!membership)
        return res.status(403).json({ error: "Not a member of this room" });

      const { allowDirectChat, allowGroupChat } = await getProjectPermissions(req.projectId, req);
      if (room.isGroup && !allowGroupChat) {
        return sendError(res, 403, "Group chat is not enabled for this project");
      }
      if (!room.isGroup && !allowDirectChat) {
        return sendError(res, 403, "Direct messaging is not enabled for this project");
      }

      const where = { roomId };
      if (before && !isNaN(before.getTime())) {
        where.createdAt = { lt: before };
      }

      // Fetch newest-first, one extra row to detect if more exist.
      const rows = await prisma.message.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        include: { sender: true },
      });

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      // Reverse to oldestâ†’newest for display, decrypting content.
      const roomMembers = await prisma.chatRoomMember.findMany({
        where: { roomId },
        select: { userId: true, lastReadAt: true },
      });
      const messages = await Promise.all(page.reverse().map(async (message) => {
        const readBy = roomMembers
          .filter(
            (member) =>
              member.userId !== message.senderId &&
              member.lastReadAt &&
              new Date(member.lastReadAt) >= new Date(message.createdAt),
          )
          .map((member) => member.userId);
        const recipientCount = roomMembers.filter(
          (member) => member.userId !== message.senderId,
        ).length;
        return {
          ...await decryptMessage(message),
          readBy,
          recipientCount,
        };
      }));
      const nextBefore = messages.length ? messages[0].createdAt : null;

      res.json({ messages, hasMore, nextBefore });
    } catch (err) {
      console.error("rooms/messages error", err);
      res.status(400).json({ error: err.message });
    }
  },
);

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 5. READ RECEIPTS â€” Mark messages as read when user opens a room
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

app.post(`${API_BASE}/messages/read`, authenticateChatJWT, async (req, res) => {
  // The reader is the authenticated user, not a client-supplied id.
  const userId = req.userId;
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ error: "roomId required" });

  try {
    const membership = await prisma.chatRoom.findFirst({
      where: {
        id: roomId,
        projectId: req.projectId,
        members: { some: { userId } },
      },
        select: { id: true, isGroup: true },
    });
    if (!membership) {
      return res.status(403).json({ error: "Not a member of this room" });
    }

    const now = new Date();
    const readOperations = [
      prisma.chatRoomMember.update({
        where: { roomId_userId: { roomId, userId } },
        data: { lastReadAt: now },
      }),
    ];
    if (!membership.isGroup) {
      readOperations.push(prisma.message.updateMany({
        where: { roomId, senderId: { not: userId }, isRead: false },
        data: { isRead: true, readAt: now },
      }));
    }
    await prisma.$transaction(readOperations);
    // Notify the room that this user has read up to now, so senders' ticks turn blue.
    if (io) {
      io.to(roomId).emit("messages_read", {
        roomId,
        readerId: userId,
        readAt: now,
      });
      io.to(`user:${userId}`).emit("chat_notification_updated");
    }
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Notification badge count for the authenticated user's society header.
// Pending requests count once as actionable requests; accepted/group rooms
// contribute their unread-message count.
app.get(
  `${API_BASE}/notifications/unread-count`,
  authenticateChatJWT,
  async (req, res) => {
    const userId = req.userId;
    try {
      const { allowDirectChat, allowGroupChat } = await getProjectPermissions(req.projectId, req);
      if (!allowDirectChat && !allowGroupChat) {
        return res.json({ unreadMessages: 0, pendingRequests: 0, total: 0 });
      }

      const roomFilters = [];
      if (allowGroupChat) {
        roomFilters.push({ isGroup: true });
      }
      if (allowDirectChat) {
        roomFilters.push({ isGroup: false, directStatus: "accepted" });
      }

      const [memberships, pendingRequests] = await Promise.all([
        roomFilters.length > 0
          ? prisma.chatRoomMember.findMany({
              where: {
                userId,
                room: { projectId: req.projectId, OR: roomFilters },
              },
              select: { roomId: true, joinedAt: true, lastReadAt: true },
            })
          : Promise.resolve([]),
        allowDirectChat
          ? prisma.chatRoom.count({
              where: {
                projectId: req.projectId,
                isGroup: false,
                directStatus: "pending",
                requestedById: { not: userId },
                messages: { some: {} },
                members: { some: { userId } },
              },
            })
          : Promise.resolve(0),
      ]);
      const unreadCounts = await Promise.all(
        memberships.map((membership) =>
          prisma.message.count({
            where: {
              roomId: membership.roomId,
              senderId: { not: userId },
              createdAt: {
                gt: membership.lastReadAt || membership.joinedAt,
              },
            },
          }),
        ),
      );
      const unreadMessages = unreadCounts.reduce(
        (total, count) => total + count,
        0,
      );
      res.json({
        unreadMessages,
        pendingRequests,
        total: unreadMessages + pendingRequests,
      });
    } catch (err) {
      console.error("notifications/unread-count error", err);
      res.status(400).json({ error: err.message });
    }
  },
);

app.get(`${API_BASE}/health`, (req, res) => {
  res.json({ status: "ok", service: "chat" });
});

// â”€â”€â”€ Storage verification (JWT-protected) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Confirms messages are persisting. Scoped to the caller's project.
//   GET /api/stats                 â†’ project-wide totals
//   GET /api/rooms/:roomId/count   â†’ count for one room + latest message time
app.get(`${API_BASE}/stats`, authenticateChatJWT, async (req, res) => {
  try {
    const [users, rooms, roomIds] = await Promise.all([
      prisma.chatUser.count({ where: { projectId: req.projectId } }),
      prisma.chatRoom.count({ where: { projectId: req.projectId } }),
      prisma.chatRoom.findMany({
        where: { projectId: req.projectId },
        select: { id: true },
      }),
    ]);
    const messages = await prisma.message.count({
      where: { roomId: { in: roomIds.map((r) => r.id) } },
    });
    res.json({ projectId: req.projectId, users, rooms, messages });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get(
  `${API_BASE}/rooms/:roomId/count`,
  authenticateChatJWT,
  async (req, res) => {
    const { roomId } = req.params;
    try {
      const room = await prisma.chatRoom.findFirst({
        where: { id: roomId, projectId: req.projectId },
      });
      if (!room) return res.status(404).json({ error: "Room not found" });
      const membership = await prisma.chatRoomMember.findUnique({
        where: { roomId_userId: { roomId, userId: req.userId } },
        select: { roomId: true },
      });
      if (!membership) {
        return res.status(403).json({ error: "Not a member of this room" });
      }
      const count = await prisma.message.count({ where: { roomId } });
      const latest = await prisma.message.findFirst({
        where: { roomId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      res.json({ roomId, count, latestAt: latest?.createdAt || null });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },
);

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 6. SOCKET.IO â€” Multi-tenant real-time messaging
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
};
