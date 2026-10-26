module.exports = function registerChatSocket(context) {
  const {
    io, prisma, jwt, CHAT_JWT_SECRET, resolveChatCapabilities,
    getProjectPermissions, mediaStorage, roomMediaStorageKey,
    decryptMessage, encryptContent, serializeRoomForUser, sendError,
  } = context;
const onlineUsers = new Map(); // socketId -> { userId, projectId }

function broadcastOnlineUsers(projectId) {
  const userIds = [
    ...new Set(
      [...onlineUsers.values()]
        .filter((u) => u.projectId === projectId)
        .map((u) => u.userId),
    ),
  ];
  io.to(`project:${projectId}`).emit("online_users", userIds);
}

io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) return next(new Error("Authentication required"));
  try {
    const payload = jwt.verify(token, CHAT_JWT_SECRET);
    socket.userId = payload.userId;
    socket.projectId = payload.projectId;
    socket.plan = payload.plan;
    socket.allowGroupChat = payload.allowGroupChat;
    socket.allowDirectChat = payload.allowDirectChat;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  // Join project + personal channels. Runs on every (re)connect, so a client
  // that drops and reconnects is automatically back in its channels.
  socket.join(`project:${socket.projectId}`);
  socket.join(`user:${socket.userId}`);

  // Auto re-join every room the user belongs to, so reconnected clients keep
  // receiving realtime messages without having to re-open each chat.
  (async () => {
    try {
      const { allowDirectChat, allowGroupChat } = await getProjectPermissions(socket.projectId, socket);
      if (!allowDirectChat && !allowGroupChat) return;

      const roomConditions = [];
      if (allowGroupChat) roomConditions.push({ isGroup: true });
      if (allowDirectChat) roomConditions.push({ isGroup: false });

      const memberships = await prisma.chatRoomMember.findMany({
        where: {
          userId: socket.userId,
          room: {
            projectId: socket.projectId,
            OR: roomConditions,
          },
        },
        select: { roomId: true },
      });
      for (const m of memberships) socket.join(m.roomId);
    } catch (err) {
      console.error("auto re-join rooms error", err);
    }
  })();

  // Mark online immediately on connect (no separate client emit required).
  onlineUsers.set(socket.id, {
    userId: socket.userId,
    projectId: socket.projectId,
  });
  broadcastOnlineUsers(socket.projectId);
  prisma.chatUser
    .update({ where: { id: socket.userId }, data: { lastSeenAt: new Date() } })
    .catch(() => {});

  socket.on("user_online", () => {
    // Kept for backwards compatibility; presence is already set on connect.
    const userId = socket.userId;
    onlineUsers.set(socket.id, { userId, projectId: socket.projectId });
    broadcastOnlineUsers(socket.projectId);
    prisma.chatUser
      .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  });

  socket.on("get_online_users", () => {
    const userIds = [
      ...new Set(
        [...onlineUsers.values()]
          .filter((u) => u.projectId === socket.projectId)
          .map((u) => u.userId),
      ),
    ];
    socket.emit("online_users", userIds);
  });

  socket.on("join_room", async (roomId) => {
    const room = await prisma.chatRoom.findFirst({
      where: { id: roomId, projectId: socket.projectId },
    });
    const membership =
      room &&
      (await prisma.chatRoomMember.findUnique({
        where: { roomId_userId: { roomId, userId: socket.userId } },
      }));
    if (!room || !membership)
      return socket.emit("error", {
        message: "Room not found or unauthorized",
      });

    const { allowDirectChat, allowGroupChat } = await getProjectPermissions(socket.projectId, socket);
    if (room.isGroup && !allowGroupChat) {
      return socket.emit("error", {
        message: "Group chat is not enabled for this project",
      });
    }
    if (!room.isGroup && !allowDirectChat) {
      return socket.emit("error", {
        message: "Direct messaging is not enabled for this project",
      });
    }

    socket.join(roomId);
  });

  socket.on(
    "send_message",
    async ({ roomId, content, fileUrl, fileType, clientId }) => {
      // The sender is always the authenticated JWT user (never client-supplied).
      const senderId = socket.userId;
      if (!roomId || (!content && !fileUrl)) {
        return socket.emit("error", {
          message: "roomId and content or fileUrl are required",
        });
      }

      try {
        const room = await prisma.chatRoom.findFirst({
          where: { id: roomId, projectId: socket.projectId },
        });
        if (!room) return socket.emit("error", { message: "Room not found" });

        const { allowDirectChat, allowGroupChat } = await getProjectPermissions(socket.projectId, socket);
        if (room.isGroup && !allowGroupChat) {
          socket.emit("message_ack", {
            clientId: clientId || null,
            status: "failed",
            error: "Group chat is not enabled for this project",
          });
          return socket.emit("error", {
            message: "Group chat is not enabled for this project",
            clientId: clientId || null,
          });
        }
        if (!room.isGroup && !allowDirectChat) {
          socket.emit("message_ack", {
            clientId: clientId || null,
            status: "failed",
            error: "Direct messaging is not enabled for this project",
          });
          return socket.emit("error", {
            message: "Direct messaging is not enabled for this project",
            clientId: clientId || null,
          });
        }

        const members = await prisma.chatRoomMember.findMany({
          where: { roomId },
          select: { userId: true },
        });
        if (!members.some((member) => member.userId === senderId)) {
          return socket.emit("error", { message: "Not a member of this room" });
        }

        const fileStorageKey = fileUrl ? roomMediaStorageKey(socket.projectId, room, fileUrl) : null;
        if (fileUrl && !fileStorageKey) {
          socket.emit("message_ack", {
            clientId: clientId || null,
            status: "failed",
            error: "Attachment URL is invalid for this room",
          });
          return socket.emit("error", { message: "Attachment URL is invalid for this room" });
        }
        if (fileStorageKey && !(await mediaStorage.objectExists(fileStorageKey))) {
          socket.emit("message_ack", {
            clientId: clientId || null,
            status: "failed",
            error: "Attachment upload was not completed",
          });
          return socket.emit("error", { message: "Attachment upload was not completed" });
        }

        if (!room.isGroup && room.directStatus === "pending") {
          if (room.requestedById !== senderId) {
            return socket.emit("error", {
              message: "Accept this message request before replying",
            });
          }

          const existingRequestMessage = await prisma.message.findFirst({
            where: { roomId },
            orderBy: { createdAt: "asc" },
            include: { sender: true },
          });
          if (existingRequestMessage) {
            const outgoing = {
              ...await decryptMessage(existingRequestMessage),
              clientId: clientId || null,
            };
            return socket.emit("message_ack", {
              clientId: clientId || null,
              status: "saved",
              message: outgoing,
            });
          }
        }

        const sender = await prisma.chatUser.findFirst({
          where: { id: senderId, projectId: socket.projectId },
        });
        if (!sender) {
          return socket.emit("error", {
            message: "Sender not found or unauthorized",
          });
        }

        const messageType = fileUrl
          ? fileType === "image"
            ? "image"
            : "file"
          : "text";
        const plainPreview = fileUrl
          ? fileType === "image"
            ? "ðŸ“· Photo"
            : "ðŸ“Ž File"
          : content?.slice(0, 100) || "";

        // Is anyone else in the room currently online? If so, mark delivered now.
        const onlineIds = new Set(
          [...onlineUsers.values()]
            .filter((u) => u.projectId === socket.projectId)
            .map((u) => u.userId),
        );
        const someRecipientOnline = members.some(
          (m) => m.userId !== senderId && onlineIds.has(m.userId),
        );

        const created = await prisma.message.create({
          data: {
            roomId,
            senderId,
            content: encryptContent(content), // encrypted at rest
            fileUrl: fileStorageKey ? null : fileUrl,
            fileType,
            fileStorageKey,
            messageType,
            deliveredAt: someRecipientOnline ? new Date() : null,
          },
          include: { sender: true },
        });

        // Store an encrypted preview so the room list isn't plaintext at rest.
        await prisma.chatRoom.update({
          where: { id: roomId },
          data: {
            lastMessageAt: new Date(),
            lastMessagePreview: encryptContent(plainPreview),
          },
        });

        // Ensure the sender is in the room so they get the echo too.
        socket.join(roomId);

        // Emit the DECRYPTED message (plus the clientId so the sender can
        // reconcile their optimistic bubble) once to the room channel.
        const outgoing = {
          ...await decryptMessage(created),
          clientId: clientId || null,
          readBy: [],
          recipientCount: members.filter((member) => member.userId !== senderId).length,
        };
        io.to(roomId).emit("new_message", outgoing);

        // Explicit persistence acknowledgement to the sender, so the client
        // knows the message was actually saved (not just optimistically shown).
        socket.emit("message_ack", {
          clientId: clientId || null,
          status: "saved",
          message: outgoing,
        });

        for (const m of members) {
          io.to(`user:${m.userId}`).emit("room_updated", {
            roomId,
            lastMessageAt: created.createdAt,
            lastMessagePreview: plainPreview, // realtime plaintext to members
            directStatus: room.directStatus,
            requestedById: room.requestedById,
            message: outgoing,
          });
        }
      } catch (err) {
        console.error("Error saving message:", err);
        // Tell the sender the message was NOT saved so it can be retried and
        // never silently lost.
        socket.emit("message_ack", {
          clientId: clientId || null,
          status: "failed",
          error: "Unable to save message",
        });
        socket.emit("error", {
          message: "Unable to save message",
          clientId: clientId || null,
        });
      }
    },
  );

  // Recipient acknowledges delivery (message reached their device).
  socket.on("message_delivered", async ({ roomId }) => {
    if (!roomId) return;
    try {
      const room = await prisma.chatRoom.findFirst({
        where: {
          id: roomId,
          projectId: socket.projectId,
          members: { some: { userId: socket.userId } },
        },
        select: { id: true, isGroup: true },
      });
      if (!room) return;

      const { allowDirectChat, allowGroupChat } = await getProjectPermissions(socket.projectId, socket);
      if (room.isGroup && !allowGroupChat) return;
      if (!room.isGroup && !allowDirectChat) return;

      const now = new Date();
      await prisma.message.updateMany({
        where: {
          roomId,
          senderId: { not: socket.userId },
          deliveredAt: null,
        },
        data: { deliveredAt: now },
      });
      io.to(roomId).emit("messages_delivered", {
        roomId,
        recipientId: socket.userId,
        deliveredAt: now,
      });
    } catch (err) {
      console.error("message_delivered error", err);
    }
  });

  // Recipient read the room's messages.
  socket.on("messages_read", async ({ roomId }) => {
    if (!roomId) return;
    try {
      const membership = await prisma.chatRoom.findFirst({
        where: {
          id: roomId,
          projectId: socket.projectId,
          members: { some: { userId: socket.userId } },
        },
        select: { id: true, isGroup: true },
      });
      if (!membership) return;

      const { allowDirectChat, allowGroupChat } = await getProjectPermissions(socket.projectId, socket);
      if (membership.isGroup && !allowGroupChat) return;
      if (!membership.isGroup && !allowDirectChat) return;

      const now = new Date();
      const readOperations = [
        prisma.chatRoomMember.update({
          where: { roomId_userId: { roomId, userId: socket.userId } },
          data: { lastReadAt: now },
        }),
      ];
      if (!membership.isGroup) {
        readOperations.push(prisma.message.updateMany({
          where: { roomId, senderId: { not: socket.userId }, isRead: false },
          data: { isRead: true, readAt: now, deliveredAt: undefined },
        }));
      }
      await prisma.$transaction(readOperations);
      io.to(roomId).emit("messages_read", {
        roomId,
        readerId: socket.userId,
        readAt: now,
      });
      io.to(`user:${socket.userId}`).emit("chat_notification_updated");
    } catch (err) {
      console.error("messages_read error", err);
    }
  });

  socket.on("disconnect", () => {
    onlineUsers.delete(socket.id);
    broadcastOnlineUsers(socket.projectId);
    // Record last-seen and notify the project so headers can show "last seen".
    const now = new Date();
    prisma.chatUser
      .update({ where: { id: socket.userId }, data: { lastSeenAt: now } })
      .catch(() => {});
    // Only broadcast offline if the user has no other active sockets.
    const stillOnline = [...onlineUsers.values()].some(
      (u) => u.userId === socket.userId && u.projectId === socket.projectId,
    );
    if (!stillOnline) {
      io.to(`project:${socket.projectId}`).emit("user_offline", {
        userId: socket.userId,
        lastSeenAt: now,
      });
    }
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
};
