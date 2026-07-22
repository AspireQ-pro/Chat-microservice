require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const multer = require("multer");
const path = require("path");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const CHAT_JWT_SECRET = process.env.CHAT_JWT_SECRET || crypto.randomBytes(64).toString("hex");

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "uploads")),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// ─── Helpers ───────────────────────────────────────────────────────────────

function generateApiKey() {
  return "ck_" + crypto.randomBytes(32).toString("hex");
}

// ─── Middleware: Resolve project from X-API-KEY (for server-to-server calls) ─

async function resolveProject(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey) return res.status(401).json({ error: "X-API-KEY header is required" });

  try {
    const project = await prisma.project.findUnique({ where: { apiKey } });
    if (!project) return res.status(401).json({ error: "Invalid API key" });
    if (!project.isActive) return res.status(403).json({ error: "Project is deactivated" });
    req.project = project;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Middleware: Authenticate chat JWT (for frontend requests) ─────────────

function authenticateChatJWT(req, res, next) {
  const header = req.headers["authorization"];
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authorization header required (Bearer <token>)" });
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

app.post("/api/projects", async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Project name is required" });

  try {
    const project = await prisma.project.create({
      data: { name, apiKey: generateApiKey() },
    });
    res.status(201).json({
      id: project.id,
      name: project.name,
      apiKey: project.apiKey,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. SYNC USER — Project's backend calls this when a user clicks "Chat"
//    Server-to-server: X-API-KEY identifies the project, body has user details
// ═════════════════════════════════════════════════════════════════════════════

app.post("/api/users/sync", resolveProject, async (req, res) => {
  const { id, name, email } = req.body;
  if (!id || !name) {
    return res.status(400).json({ error: "id and name are required" });
  }

  try {
    let chatUser = await prisma.chatUser.findUnique({
      where: {
        projectId_externalUserId: { projectId: req.project.id, externalUserId: String(id) },
      },
    });

    if (!chatUser) {
      chatUser = await prisma.chatUser.create({
        data: {
          projectId: req.project.id,
          externalUserId: String(id),
          name,
          email,
        },
      });
    } else {
      // Update name/email if changed in project's system
      chatUser = await prisma.chatUser.update({
        where: { id: chatUser.id },
        data: { name, email },
      });
    }

    // Generate a short-lived token for the frontend to use
    const chatToken = jwt.sign(
      {
        userId: chatUser.id,
        projectId: req.project.id,
        name: chatUser.name,
        email: chatUser.email,
      },
      CHAT_JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      token: chatToken,
      user: { id: chatUser.id, name: chatUser.name, email: chatUser.email },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. SEARCH USERS — Only within the same project
// ═════════════════════════════════════════════════════════════════════════════

app.get("/users", authenticateChatJWT, async (req, res) => {
  const { excludeId, q } = req.query;
  try {
    const where = { projectId: req.projectId };
    if (excludeId) where.id = { not: excludeId };
    if (q) where.name = { contains: q, mode: "insensitive" };

    const users = await prisma.chatUser.findMany({ where, orderBy: { name: "asc" } });
    res.json(users);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. ROOMS — Scoped by project
// ═════════════════════════════════════════════════════════════════════════════

// List rooms for a user
app.get("/users/:userId/rooms", authenticateChatJWT, async (req, res) => {
  const { userId } = req.params;
  try {
    const rooms = await prisma.chatRoom.findMany({
      where: { projectId: req.projectId, members: { some: { userId } } },
      include: { members: { include: { user: true } } },
      orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    });
    res.json(rooms);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Create or get direct 1-to-1 room
app.post("/rooms/direct", authenticateChatJWT, async (req, res) => {
  const { userId1, userId2 } = req.body;
  if (!userId1 || !userId2) return res.status(400).json({ error: "Both userId1 and userId2 are required" });

  // Both users must be in this project
  const count = await prisma.chatUser.count({
    where: { projectId: req.projectId, id: { in: [userId1, userId2] } },
  });
  if (count !== 2) return res.status(403).json({ error: "Users must belong to this project" });

  try {
    const existing = await prisma.chatRoom.findFirst({
      where: {
        projectId: req.projectId, isGroup: false,
        AND: [{ members: { some: { userId: userId1 } } }, { members: { some: { userId: userId2 } } }],
      },
      include: { members: true },
    });
    if (existing) return res.json(existing);

    const room = await prisma.chatRoom.create({
      data: {
        projectId: req.projectId, isGroup: false,
        members: { create: [{ userId: userId1 }, { userId: userId2 }] },
      },
      include: { members: true },
    });
    res.json(room);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Create group room
app.post("/rooms/group", authenticateChatJWT, async (req, res) => {
  const { name, creatorId, memberIds } = req.body;
  if (!name || !creatorId || !memberIds?.length) {
    return res.status(400).json({ error: "name, creatorId, and memberIds are required" });
  }

  const allIds = Array.from(new Set([creatorId, ...memberIds]));
  const validCount = await prisma.chatUser.count({
    where: { projectId: req.projectId, id: { in: allIds } },
  });
  if (validCount !== allIds.length) {
    return res.status(403).json({ error: "All members must belong to this project" });
  }

  try {
    const room = await prisma.chatRoom.create({
      data: {
        projectId: req.projectId, name, isGroup: true,
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
app.get("/rooms/:roomId", authenticateChatJWT, async (req, res) => {
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

// Get room messages
app.get("/rooms/:roomId/messages", authenticateChatJWT, async (req, res) => {
  const { roomId } = req.params;
  try {
    const room = await prisma.chatRoom.findFirst({
      where: { id: roomId, projectId: req.projectId },
    });
    if (!room) return res.status(404).json({ error: "Room not found" });

    const messages = await prisma.message.findMany({
      where: { roomId },
      orderBy: { createdAt: "asc" },
      include: { sender: true },
    });
    res.json(messages);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. READ RECEIPTS — Mark messages as read when user opens a room
// ═════════════════════════════════════════════════════════════════════════════

app.post("/messages/read", authenticateChatJWT, async (req, res) => {
  const { roomId, userId } = req.body;
  if (!roomId || !userId) return res.status(400).json({ error: "roomId and userId required" });

  try {
    await prisma.message.updateMany({
      where: { roomId, senderId: { not: userId }, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. FILE UPLOAD
// ═════════════════════════════════════════════════════════════════════════════

app.post("/upload", authenticateChatJWT, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const fileUrl = `http://localhost:${process.env.PORT || 5000}/uploads/${req.file.filename}`;
  const isImage = req.file.mimetype.startsWith("image/");
  res.json({ fileUrl, fileType: isImage ? "image" : "file" });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. SOCKET.IO — Multi-tenant real-time messaging
// ═════════════════════════════════════════════════════════════════════════════

const io = new Server(server, { cors: { origin: "*" } });
const onlineUsers = new Map(); // socketId -> { userId, projectId }

function broadcastOnlineUsers(projectId) {
  const userIds = [...new Set(
    [...onlineUsers.values()]
      .filter((u) => u.projectId === projectId)
      .map((u) => u.userId)
  )];
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
  socket.join(`project:${socket.projectId}`);

  socket.on("user_online", (userId) => {
    onlineUsers.set(socket.id, { userId, projectId: socket.projectId });
    broadcastOnlineUsers(socket.projectId);
    prisma.chatUser.update({ where: { id: userId }, data: { lastSeenAt: new Date() } }).catch(() => {});
  });

  socket.on("get_online_users", () => {
    const userIds = [...new Set(
      [...onlineUsers.values()]
        .filter((u) => u.projectId === socket.projectId)
        .map((u) => u.userId)
    )];
    socket.emit("online_users", userIds);
  });

  socket.on("join_room", (roomId) => {
    socket.join(roomId);
  });

  socket.on("send_message", async ({ roomId, senderId, content, fileUrl, fileType }) => {
    try {
      const room = await prisma.chatRoom.findFirst({
        where: { id: roomId, projectId: socket.projectId },
      });
      if (!room) return socket.emit("error", { message: "Room not found" });

      const messageType = fileUrl ? (fileType === "image" ? "image" : "file") : "text";
      const preview = fileUrl
        ? (fileType === "image" ? "📷 Photo" : "📎 File")
        : (content?.slice(0, 100) || "");

      const message = await prisma.message.create({
        data: { roomId, senderId, content, fileUrl, fileType, messageType },
        include: { sender: true },
      });

      await prisma.chatRoom.update({
        where: { id: roomId },
        data: { lastMessageAt: new Date(), lastMessagePreview: preview },
      });

      io.to(roomId).emit("new_message", message);
      io.to(`project:${socket.projectId}`).emit("new_message", message);
    } catch (err) {
      console.error("Error saving message:", err);
    }
  });

  socket.on("disconnect", () => {
    onlineUsers.delete(socket.id);
    broadcastOnlineUsers(socket.projectId);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Chat service running on port ${PORT}`);
});
