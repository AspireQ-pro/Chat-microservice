require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const CHAT_JWT_SECRET =
  process.env.CHAT_JWT_SECRET || crypto.randomBytes(64).toString("hex");
const BACKEND_URL = (
  process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`
).replace(/\/$/, "");
const corsOrigin = process.env.CORS_ORIGIN || "*";
const API_BASE = "/api";
const CHAT_FRONTEND_URL = (
  process.env.CHAT_FRONTEND_URL ||
  `http://localhost:${process.env.CHAT_FRONTEND_PORT || 3001}`
).replace(/\/$/, "");

function sendError(res, status, error, details) {
  const payload = { error };
  if (details) payload.details = details;
  return res.status(status).json(payload);
}

function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

app.use(cors({ origin: corsOrigin }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`,
    );
  });
  next();
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function generateApiKey() {
  return "ck_" + crypto.randomBytes(32).toString("hex");
}

// ─── Message encryption at rest (AES-256-GCM) ───────────────────────────────
// Content is encrypted before it is written to Postgres and decrypted when
// served. The server can still read messages (this is encryption-at-rest, not
// end-to-end), which protects against raw database exposure. Legacy plaintext
// rows (written before this feature) are detected and returned as-is.

const ENC_PREFIX = "enc:v1:";
// Derive a stable 32-byte key from a secret. Prefer a dedicated key; fall back
// to the JWT secret so the feature works even if MESSAGE_ENC_KEY isn't set.
const MESSAGE_ENC_KEY = crypto
  .createHash("sha256")
  .update(
    String(
      process.env.MESSAGE_ENC_KEY ||
        process.env.CHAT_JWT_SECRET ||
        "chat-message-encryption-fallback",
    ),
  )
  .digest();

function encryptContent(plain) {
  if (plain == null) return plain;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", MESSAGE_ENC_KEY, iv);
    const ct = Buffer.concat([
      cipher.update(String(plain), "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return ENC_PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
  } catch (err) {
    console.error("encryptContent error", err);
    return plain; // never lose the message; store plaintext as a last resort
  }
}

function decryptContent(stored) {
  if (stored == null) return stored;
  if (typeof stored !== "string" || !stored.startsWith(ENC_PREFIX)) {
    return stored; // legacy plaintext or non-string — return untouched
  }
  try {
    const raw = Buffer.from(stored.slice(ENC_PREFIX.length), "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", MESSAGE_ENC_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
      "utf8",
    );
  } catch (err) {
    console.error("decryptContent error", err);
    return ""; // corrupt/undecryptable — return empty rather than throwing
  }
}

// Decrypt a message object's content field in place (returns a shallow copy).
function decryptMessage(msg) {
  if (!msg) return msg;
  return { ...msg, content: decryptContent(msg.content) };
}

// ─── Middleware: Resolve project from X-API-KEY (for server-to-server calls) ─

async function resolveProject(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey)
    return res.status(401).json({ error: "X-API-KEY header is required" });

  try {
    const project = await prisma.project.findUnique({ where: { apiKey } });
    if (!project) return res.status(401).json({ error: "Invalid API key" });
    if (!project.isActive)
      return res.status(403).json({ error: "Project is deactivated" });
    req.project = project;
    next();
  } catch (err) {
    console.error("resolveProject error", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ─── Middleware: Authenticate chat JWT (for frontend requests) ─────────────

function authenticateChatJWT(req, res, next) {
  const header = req.headers["authorization"];
  if (!header || !header.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Authorization header required (Bearer <token>)" });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, CHAT_JWT_SECRET);
    req.userId = payload.userId;
    req.projectId = payload.projectId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ─── Health ────────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.json({ status: "Chat service is running" });
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. REGISTER PROJECT — Admin creates a project and gets an API key
// ═════════════════════════════════════════════════════════════════════════════

app.post(
  `${API_BASE}/projects`,
  asyncHandler(async (req, res) => {
    const { name } = req.body;
    if (!name) return sendError(res, 400, "Project name is required");

    const project = await prisma.project.create({
      data: { name, apiKey: generateApiKey() },
    });
    res.status(201).json({
      id: project.id,
      name: project.name,
      apiKey: project.apiKey,
    });
  }),
);

// ═════════════════════════════════════════════════════════════════════════════
// 2. SYNC USER — Project's backend calls this when a user clicks "Chat"
//    Server-to-server: X-API-KEY identifies the project, body has user details
// ═════════════════════════════════════════════════════════════════════════════

app.post(
  `${API_BASE}/users/sync`,
  resolveProject,
  asyncHandler(async (req, res) => {
    const { id, name, email, role } = req.body || {};
    if (!id || !name) {
      return sendError(res, 400, "id and name are required");
    }

    const safeEmail =
      email && String(email).trim()
        ? String(email).trim()
        : `${String(id)}@noemail.local`;
    const safeRole =
      role && String(role).trim() ? String(role).trim() : null;

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

    const chatToken = jwt.sign(
      {
        userId: chatUser.id,
        projectId: req.project.id,
        name: chatUser.name,
        email: chatUser.email,
      },
      CHAT_JWT_SECRET,
      { expiresIn: "24h" },
    );

    res.json({
      success: true,
      token: chatToken,
      chatUrl: CHAT_FRONTEND_URL,
      projectId: req.project.id,
      user: { id: chatUser.id, name: chatUser.name, email: chatUser.email },
    });
  }),
);

// ═════════════════════════════════════════════════════════════════════════════
// 2b. BULK SYNC USERS — Project's backend pushes its whole member list so every
//     member appears in chat immediately (not only after they open chat).
//     Server-to-server: X-API-KEY identifies the project.
// ═════════════════════════════════════════════════════════════════════════════

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
      const safeRole = u.role && String(u.role).trim() ? String(u.role).trim() : null;

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

// ═════════════════════════════════════════════════════════════════════════════
// 3. SEARCH USERS — Only within the same project
// ═════════════════════════════════════════════════════════════════════════════

app.get(`${API_BASE}/users`, authenticateChatJWT, async (req, res) => {
  const { excludeId, q } = req.query;
  try {
    const where = { projectId: req.projectId };
    if (excludeId) where.id = { not: excludeId };
    if (q) where.name = { contains: q, mode: "insensitive" };

    const users = await prisma.chatUser.findMany({
      where,
      orderBy: { name: "asc" },
    });
    res.json(users);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. ROOMS — Scoped by project
// ═════════════════════════════════════════════════════════════════════════════

// List rooms for a user
app.get(`${API_BASE}/users/:userId/rooms`, authenticateChatJWT, async (req, res) => {
  const { userId } = req.params;
  try {
    const rooms = await prisma.chatRoom.findMany({
      where: { projectId: req.projectId, members: { some: { userId } } },
      include: { members: { include: { user: true } } },
      orderBy: [
        { lastMessageAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
    });
    // Previews are stored encrypted at rest; decrypt for display.
    const out = rooms.map((r) => ({
      ...r,
      lastMessagePreview: decryptContent(r.lastMessagePreview),
    }));
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Create or get direct 1-to-1 room
app.post(`${API_BASE}/rooms/direct`, authenticateChatJWT, async (req, res) => {
  // The current user is the authenticated JWT user, not a client-supplied id.
  const userId1 = req.userId;
  // Accept the other party from either field name for backwards compatibility.
  const userId2 = req.body?.userId2 || req.body?.otherUserId || req.body?.userId1;

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
    if (existing) return res.json(existing);

    const room = await prisma.chatRoom.create({
      data: {
        projectId: req.projectId,
        isGroup: false,
        members: { create: [{ userId: userId1 }, { userId: userId2 }] },
      },
      include: { members: { include: { user: true } } },
    });
    res.json(room);
  } catch (err) {
    console.error("rooms/direct error", err);
    res.status(400).json({ error: err.message });
  }
});

// Create group room
app.post(`${API_BASE}/rooms/group`, authenticateChatJWT, async (req, res) => {
  const { name, creatorId, memberIds } = req.body;
  if (!name || !creatorId || !memberIds?.length) {
    return res
      .status(400)
      .json({ error: "name, creatorId, and memberIds are required" });
  }

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
        members: { create: allIds.map((userId) => ({ userId })) },
      },
      include: { members: { include: { user: true } } },
    });
    res.json(room);
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
    res.json(room);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get room messages (paginated, WhatsApp-style)
//
// Query params:
//   limit  - page size (default 30, max 100)
//   before - ISO timestamp; return messages OLDER than this (for "load previous")
//
// Returns: { messages: [...oldest→newest], hasMore, nextBefore }
//   - messages are ordered oldest→newest so the client can append directly
//   - hasMore indicates whether older messages exist beyond this page
//   - nextBefore is the cursor to pass as `before` to fetch the previous page
app.get(
  `${API_BASE}/rooms/:roomId/messages`,
  authenticateChatJWT,
  async (req, res) => {
    const { roomId } = req.params;
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 30, 1), 100);
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
      // Reverse to oldest→newest for display, decrypting content.
      const messages = page.reverse().map(decryptMessage);
      const nextBefore = messages.length ? messages[0].createdAt : null;

      res.json({ messages, hasMore, nextBefore });
    } catch (err) {
      console.error("rooms/messages error", err);
      res.status(400).json({ error: err.message });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// 5. READ RECEIPTS — Mark messages as read when user opens a room
// ═════════════════════════════════════════════════════════════════════════════

app.post(`${API_BASE}/messages/read`, authenticateChatJWT, async (req, res) => {
  // The reader is the authenticated user, not a client-supplied id.
  const userId = req.userId;
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ error: "roomId required" });

  try {
    const now = new Date();
    await prisma.message.updateMany({
      where: { roomId, senderId: { not: userId }, isRead: false },
      data: { isRead: true, readAt: now },
    });
    // Notify the room that this user has read up to now, so senders' ticks turn blue.
    if (io) {
      io.to(roomId).emit("messages_read", { roomId, readerId: userId, readAt: now });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get(`${API_BASE}/health`, (req, res) => {
  res.json({ status: "ok", service: "chat" });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. SOCKET.IO — Multi-tenant real-time messaging
// ═════════════════════════════════════════════════════════════════════════════

const io = new Server(server, { cors: { origin: corsOrigin } });
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
      const memberships = await prisma.chatRoomMember.findMany({
        where: { userId: socket.userId, room: { projectId: socket.projectId } },
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
    if (!room)
      return socket.emit("error", {
        message: "Room not found or unauthorized",
      });
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
            ? "📷 Photo"
            : "📎 File"
          : content?.slice(0, 100) || "";

        // Is anyone else in the room currently online? If so, mark delivered now.
        const members = await prisma.chatRoomMember.findMany({
          where: { roomId },
          select: { userId: true },
        });
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
            fileUrl,
            fileType,
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
        const outgoing = { ...decryptMessage(created), clientId: clientId || null };
        io.to(roomId).emit("new_message", outgoing);

        for (const m of members) {
          io.to(`user:${m.userId}`).emit("room_updated", {
            roomId,
            lastMessageAt: created.createdAt,
            lastMessagePreview: plainPreview, // realtime plaintext to members
            message: outgoing,
          });
        }
      } catch (err) {
        console.error("Error saving message:", err);
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
      const now = new Date();
      await prisma.message.updateMany({
        where: { roomId, senderId: { not: socket.userId }, isRead: false },
        data: { isRead: true, readAt: now, deliveredAt: undefined },
      });
      io.to(roomId).emit("messages_read", {
        roomId,
        readerId: socket.userId,
        readAt: now,
      });
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

// ═════════════════════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 5000;
server.keepAliveTimeout = Number(process.env.KEEP_ALIVE_TIMEOUT_MS || 5000);
server.headersTimeout = Number(
  process.env.HEADERS_TIMEOUT_MS || server.keepAliveTimeout + 1000,
);

app.use((req, res) => {
  sendError(res, 404, "Resource not found");
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  if (res.headersSent) return next(err);
  sendError(res, 500, "Internal server error");
});

process.on("uncaughtException", (err) => {
  console.error("uncaughtException", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection", reason);
});

server.listen(PORT, () => {
  console.log(`Chat service running on port ${PORT}`);
});
