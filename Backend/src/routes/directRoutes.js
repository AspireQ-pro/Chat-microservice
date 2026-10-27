module.exports = function registerDirectRoutes(context) {
  const {
    app, prisma, API_BASE, BACKEND_URL, CHAT_FRONTEND_URL, CHAT_JWT_SECRET,
    UPLOAD_TYPES, parseRoomUpload, mediaStorage, mediaKey, legacyMediaKey,
    sendStoredMedia, startPresignedMediaUpload, verifyUploadToken,
    completePresignedMediaUpload, requireRoomUploadAccess,
    hasAllowedFileSignature, sendError, asyncHandler, generateApiKey,
    encryptContent, decryptContent, decryptMessage, serializeRoomForUser,
    roomMediaStorageKey, resolveProject, authenticateChatJWT,
    parseFeatureFlag, resolveChatCapabilities, getProjectPermissions,
    crypto, jwt, path, io, onlineUsers = new Map(),
  } = context;
app.post(`${API_BASE}/rooms/direct`, authenticateChatJWT, async (req, res) => {
  const { allowDirectChat } = await getProjectPermissions(req.projectId, req);
  if (!allowDirectChat) {
    return sendError(res, 403, "Direct messaging is not enabled for this project");
  }
  // The current user is the authenticated JWT user, not a client-supplied id.
  const userId1 = req.userId;
  // Accept the other party from either field name for backwards compatibility.
  const userId2 =
    req.body?.userId2 || req.body?.otherUserId || req.body?.userId1;

  if (!userId1 || !userId2)
    return res.status(400).json({ error: "userId2 (other user) is required" });
  if (userId1 === userId2)
    return res
      .status(400)
      .json({ error: "Cannot open a direct room with yourself" });

  try {
    // Both users must belong to this project
    const count = await prisma.chatUser.count({
      where: { projectId: req.projectId, id: { in: [userId1, userId2] } },
    });
    if (count !== 2)
      return res
        .status(403)
        .json({ error: "Users must belong to this project" });

    const existing = await prisma.chatRoom.findFirst({
      where: {
        projectId: req.projectId,
        isGroup: false,
        AND: [
          { members: { some: { userId: userId1 } } },
          { members: { some: { userId: userId2 } } },
        ],
      },
      include: { members: { include: { user: true } } },
    });
    if (existing)
      return res.json(await serializeRoomForUser(existing, userId1));
    return res.status(404).json({
      error: "No conversation exists yet; send an initial message to create a request",
    });
  } catch (err) {
    console.error("rooms/direct error", err);
    res.status(400).json({ error: err.message });
  }
});

// Create the initial message and direct room together, so merely selecting a
// contact cannot create an empty message request.
app.post(
  `${API_BASE}/rooms/direct/request`,
  authenticateChatJWT,
  async (req, res) => {
    const { allowDirectChat } = await getProjectPermissions(req.projectId, req);
    if (!allowDirectChat) {
      return sendError(res, 403, "Direct messaging is not enabled for this project");
    }
    const senderId = req.userId;
    const userId2 = req.body?.userId2;
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    const clientId = req.body?.clientId || null;

    if (!userId2 || !content) {
      return res.status(400).json({ error: "userId2 and a first message are required" });
    }
    if (content.length > 10000) {
      return res.status(400).json({ error: "Message is too long" });
    }
    if (senderId === userId2) {
      return res.status(400).json({ error: "Cannot message yourself" });
    }

    try {
      const validUsers = await prisma.chatUser.count({
        where: { projectId: req.projectId, id: { in: [senderId, userId2] } },
      });
      if (validUsers !== 2) {
        return res.status(403).json({ error: "Users must belong to this project" });
      }

      const saved = await prisma.$transaction(async (tx) => {
        let room = await tx.chatRoom.findFirst({
          where: {
            projectId: req.projectId,
            isGroup: false,
            AND: [
              { members: { some: { userId: senderId } } },
              { members: { some: { userId: userId2 } } },
            ],
          },
          include: { members: { include: { user: true } } },
        });

        if (room?.directStatus === "pending") {
          const existingMessages = await tx.message.count({ where: { roomId: room.id } });
          if (existingMessages > 0 && room.requestedById !== senderId) {
            const error = new Error("Accept this message request before replying");
            error.statusCode = 403;
            throw error;
          }
          if (existingMessages > 0) {
            const error = new Error("A message request has already been sent");
            error.statusCode = 409;
            throw error;
          }
          // Recover empty requests created by older versions when a contact was selected.
          room = await tx.chatRoom.update({
            where: { id: room.id },
            data: { requestedById: senderId },
            include: { members: { include: { user: true } } },
          });
        }

        if (!room) {
          room = await tx.chatRoom.create({
            data: {
              projectId: req.projectId,
              isGroup: false,
              directStatus: "pending",
              requestedById: senderId,
              members: { create: [{ userId: senderId }, { userId: userId2 }] },
            },
            include: { members: { include: { user: true } } },
          });
        }

        const recipientOnline = [...onlineUsers.values()].some(
          (online) => online.projectId === req.projectId && online.userId === userId2,
        );
        const message = await tx.message.create({
          data: {
            roomId: room.id,
            senderId,
            content: encryptContent(content),
            messageType: "text",
            deliveredAt: recipientOnline ? new Date() : null,
          },
          include: { sender: true },
        });
        room = await tx.chatRoom.update({
          where: { id: room.id },
          data: {
            lastMessageAt: message.createdAt,
            lastMessagePreview: encryptContent(content.slice(0, 100)),
          },
          include: { members: { include: { user: true } } },
        });
        return { room, message };
      });

      const outgoing = {
        ...await decryptMessage(saved.message),
        clientId,
        readBy: [],
        recipientCount: saved.room.members.filter(
          (member) => member.userId !== senderId,
        ).length,
      };
      io.to(saved.room.id).emit("new_message", outgoing);
      for (const member of saved.room.members) {
        io.to(`user:${member.userId}`).emit("room_updated", {
          roomId: saved.room.id,
          lastMessageAt: saved.message.createdAt,
          lastMessagePreview: content.slice(0, 100),
          directStatus: saved.room.directStatus,
          requestedById: saved.room.requestedById,
          message: outgoing,
        });
      }
      if (saved.message.deliveredAt) {
        io.to(saved.room.id).emit("messages_delivered", {
          roomId: saved.room.id,
          recipientId: userId2,
          deliveredAt: saved.message.deliveredAt,
        });
        io.to(`user:${senderId}`).emit("messages_delivered", {
          roomId: saved.room.id,
          recipientId: userId2,
          deliveredAt: saved.message.deliveredAt,
        });
      }

      res.status(201).json({
        room: await serializeRoomForUser(saved.room, senderId),
        message: outgoing,
      });
    } catch (err) {
      if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
      console.error("rooms/direct/request error", err);
      res.status(400).json({ error: err.message });
    }
  },
);

// Accept an incoming direct-message request before replying.
app.post(
  `${API_BASE}/rooms/:roomId/accept`,
  authenticateChatJWT,
  async (req, res) => {
    const { allowDirectChat } = await getProjectPermissions(req.projectId, req);
    if (!allowDirectChat) {
      return sendError(res, 403, "Direct messaging is not enabled for this project");
    }
    const { roomId } = req.params;
    try {
      const room = await prisma.chatRoom.findFirst({
        where: { id: roomId, projectId: req.projectId, isGroup: false },
        include: { members: { include: { user: true } } },
      });
      if (!room)
        return res.status(404).json({ error: "Direct room not found" });

      const isMember = room.members.some(
        (member) => member.userId === req.userId,
      );
      if (!isMember)
        return res.status(403).json({ error: "Not a member of this room" });
      if (room.directStatus !== "pending") {
        return res
          .status(400)
          .json({ error: "This message request is not pending" });
      }
      if (room.requestedById === req.userId) {
        return res
          .status(403)
          .json({ error: "Only the recipient can accept this request" });
      }

      const acceptedRoom = await prisma.chatRoom.update({
        where: { id: roomId },
        data: { directStatus: "accepted" },
        include: { members: { include: { user: true } } },
      });

      for (const member of acceptedRoom.members) {
        io.to(`user:${member.userId}`).emit("room_updated", {
          roomId,
          directStatus: acceptedRoom.directStatus,
          requestedById: acceptedRoom.requestedById,
        });
      }
      res.json(await serializeRoomForUser(acceptedRoom, req.userId));
    } catch (err) {
      console.error("rooms/accept error", err);
      res.status(400).json({ error: err.message });
    }
  },
);

// â”€â”€â”€ Upload group avatar (before the room is created) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// POST /api/rooms/group/avatar
// Authenticated; returns { avatarUrl } which callers pass into POST /rooms/group.
};
