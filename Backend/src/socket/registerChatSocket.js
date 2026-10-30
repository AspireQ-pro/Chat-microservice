const { dispatchChatPushNotification } = require("../services/pushNotificationService");
module.exports = function registerChatSocket(context) {
  const {
    io, prisma, jwt, CHAT_JWT_SECRET, resolveChatCapabilities,
    getProjectPermissions, mediaStorage, roomMediaStorageKey,
    decryptMessage, decryptContent, encryptContent, serializeRoomForUser, sendError,
    onlineUsers = new Map(),
  } = context;

// Returns true when the role string indicates an admin-level user (e.g.
// "admin", "Admin", "GroupAdmin", "group_admin"). This grants the ability to
// delete any user's message for everyone in both group and direct chats.
function isAdminRole(role) {
  if (!role || typeof role !== "string") return false;
  return role.toLowerCase().includes("admin");
}

// Recalculate a room's lastMessagePreview / lastMessageAt after a message is
// deleted for everyone, so the room list never shows stale (deleted) content.
// Returns the plaintext preview + timestamp so callers can broadcast a
// realtime room_updated event.
async function updateRoomLastMessage(roomId) {
  const lastMsg = await prisma.message.findFirst({
    where: { roomId, isDeleted: false },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, content: true, messageType: true },
  });
  let preview = "";
  let lastMessageAt = null;
  if (lastMsg) {
    if (lastMsg.messageType === "image") preview = "📷 Photo";
    else if (lastMsg.messageType === "file") preview = "📎 File";
    else preview = (decryptContent(lastMsg.content) || "").slice(0, 100);
    lastMessageAt = lastMsg.createdAt;
  }
  await prisma.chatRoom.update({
    where: { id: roomId },
    data: {
      lastMessageAt,
      lastMessagePreview: encryptContent(preview),
    },
  });
  return { lastMessageAt, lastMessagePreview: preview };
}

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

  // Deliver any pending messages waiting for this user across their rooms
  (async () => {
    try {
      const now = new Date();
      const memberships = await prisma.chatRoomMember.findMany({
        where: {
          userId: socket.userId,
          room: { projectId: socket.projectId },
        },
        select: { roomId: true },
      });
      const roomIds = memberships.map((m) => m.roomId);
      if (roomIds.length > 0) {
        const undelivered = await prisma.message.findMany({
          where: {
            roomId: { in: roomIds },
            senderId: { not: socket.userId },
            deliveredAt: null,
          },
          select: { id: true, roomId: true, senderId: true },
        });
        if (undelivered.length > 0) {
          await prisma.message.updateMany({
            where: {
              id: { in: undelivered.map((m) => m.id) },
            },
            data: { deliveredAt: now },
          });
          const touchedRooms = [...new Set(undelivered.map((m) => m.roomId))];
          for (const rid of touchedRooms) {
            io.to(rid).emit("messages_delivered", {
              roomId: rid,
              recipientId: socket.userId,
              deliveredAt: now,
            });
          }
          const senders = [...new Set(undelivered.map((m) => m.senderId))];
          for (const sId of senders) {
            io.to(`user:${sId}`).emit("messages_delivered", {
              recipientId: socket.userId,
              deliveredAt: now,
            });
          }
        }
      }
    } catch (err) {
      console.error("auto delivery on connect error", err);
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
    async ({ roomId, content, fileUrl, fileType, fileName, fileSize, clientId }) => {
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
          select: {
            userId: true,
            user: { select: { externalUserId: true, name: true } },
          },
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
            fileName: fileUrl ? (String(fileName || "").slice(0, 255) || null) : null,
            fileSize: fileUrl && Number.isFinite(Number(fileSize)) && fileSize > 0 ? Number(fileSize) : null,
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

        if (someRecipientOnline && created.deliveredAt) {
          io.to(roomId).emit("messages_delivered", {
            roomId,
            deliveredAt: created.deliveredAt,
          });
          io.to(`user:${senderId}`).emit("messages_delivered", {
            roomId,
            deliveredAt: created.deliveredAt,
          });
        }

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

        // â”€â”€ Dispatch push notifications to recipients â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        try {
          const recipientExternalIds = members
            .filter((m) => m.userId !== senderId && m.user && m.user.externalUserId)
            .map((m) => parseInt(m.user.externalUserId, 10))
            .filter((id) => !isNaN(id) && id > 0);

          if (recipientExternalIds.length > 0) {
            const senderExternalId = sender.externalUserId ? parseInt(sender.externalUserId, 10) : null;
            dispatchChatPushNotification({
              senderUserId: !isNaN(senderExternalId) ? senderExternalId : null,
              senderName: sender.name,
              recipientUserIds: recipientExternalIds,
              message: plainPreview,
              roomId,
              roomName: room.name || null,
              isGroup: Boolean(room.isGroup),
            }).catch((pushErr) => {
              console.error("[registerChatSocket] Error dispatching push notification:", pushErr);
            });
          }
        } catch (pushErr) {
          console.error("[registerChatSocket] Error preparing push notification:", pushErr);
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
      const roomMembers = await prisma.chatRoomMember.findMany({
        where: { roomId },
        select: { userId: true },
      });
      for (const m of roomMembers) {
        if (m.userId !== socket.userId) {
          io.to(`user:${m.userId}`).emit("messages_delivered", {
            roomId,
            recipientId: socket.userId,
            deliveredAt: now,
          });
        }
      }
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

  socket.on("edit_message", async ({ messageId, content }) => {
    if (!messageId || !content?.trim()) return;
    try {
      // Verify the message exists, belongs to this project, and was sent by this user.
      const message = await prisma.message.findFirst({
        where: { id: messageId, senderId: socket.userId },
        include: { room: true, sender: true },
      });
      if (!message) return socket.emit("error", { message: "Message not found or unauthorized" });
      if (message.room.projectId !== socket.projectId)
        return socket.emit("error", { message: "Unauthorized" });
      if (message.isDeleted) return socket.emit("error", { message: "Cannot edit a deleted message" });
      if (message.messageType !== "text") return socket.emit("error", { message: "Only text messages can be edited" });

      const updated = await prisma.message.update({
        where: { id: messageId },
        data: { content: encryptContent(content.trim()), editedAt: new Date() },
        include: { sender: true },
      });

      const decrypted = await decryptMessage(updated);
      io.to(message.roomId).emit("message_edited", { message: decrypted });
    } catch (err) {
      console.error("edit_message error", err);
      socket.emit("error", { message: "Failed to edit message" });
    }
  });

  socket.on("delete_message", async ({ messageId, scope }) => {
    if (!messageId) return;
    const deleteScope = scope === "me" ? "me" : "everyone";
    try {
      // Look up the message without filtering by sender so admins can also
      // delete other users' messages.
      const message = await prisma.message.findFirst({
        where: { id: messageId },
        include: { room: true },
      });
      if (!message) return socket.emit("error", { message: "Message not found" });
      if (message.room.projectId !== socket.projectId)
        return socket.emit("error", { message: "Unauthorized" });

      // The caller must be a member of the room to delete (either scope).
      const membership = await prisma.chatRoomMember.findUnique({
        where: { roomId_userId: { roomId: message.roomId, userId: socket.userId } },
      });
      if (!membership)
        return socket.emit("error", { message: "Not a member of this room" });

      if (deleteScope === "me") {
        // ── Delete for me ──────────────────────────────────────────────
        // Records a per-user deletion so the message is hidden from the
        // caller's view only. Other participants still see it, and it stays
        // hidden after refresh because the REST endpoint filters by this.
        await prisma.messageDeletion.upsert({
          where: { messageId_userId: { messageId, userId: socket.userId } },
          create: { messageId, userId: socket.userId },
          update: {},
        });
        // Notify only the caller — no broadcast to the room.
        socket.emit("message_deleted_for_me", {
          messageId,
          roomId: message.roomId,
        });
      } else {
        // ── Delete for everyone ────────────────────────────────────────
        if (message.isDeleted) return; // already deleted — no-op

        // Permission: the message sender OR any user with an admin role.
        const isOwner = message.senderId === socket.userId;
        let canDeleteForEveryone = isOwner;
        if (!isOwner) {
          const chatUser = await prisma.chatUser.findUnique({
            where: { id: socket.userId },
            select: { role: true },
          });
          canDeleteForEveryone = isAdminRole(chatUser?.role);
        }
        if (!canDeleteForEveryone) {
          return socket.emit("error", {
            message: "You can only delete your own messages",
          });
        }

        await prisma.message.update({
          where: { id: messageId },
          data: {
            isDeleted: true,
            content: null,
            fileUrl: null,
            fileStorageKey: null,
            fileType: null,
          },
        });

        // Refresh the room preview so the sidebar doesn't show deleted content.
        const roomUpdate = await updateRoomLastMessage(message.roomId);

        io.to(message.roomId).emit("message_deleted", {
          messageId,
          roomId: message.roomId,
        });

        // Notify all members so their room-list preview updates in realtime.
        const roomMembers = await prisma.chatRoomMember.findMany({
          where: { roomId: message.roomId },
          select: { userId: true },
        });
        for (const m of roomMembers) {
          io.to(`user:${m.userId}`).emit("room_updated", {
            roomId: message.roomId,
            lastMessagePreview: roomUpdate.lastMessagePreview,
            lastMessageAt: roomUpdate.lastMessageAt,
          });
        }
      }
    } catch (err) {
      console.error("delete_message error", err);
      socket.emit("error", { message: "Failed to delete message" });
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
