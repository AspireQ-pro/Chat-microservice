require("dotenv").config();
const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const multer = require("multer");
const { Server } = require("socket.io");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const isProduction = process.env.NODE_ENV === "production";
const CHAT_JWT_SECRET = process.env.CHAT_JWT_SECRET ||
  (!isProduction ? crypto.randomBytes(64).toString("hex") : "");
const isPlaceholderSecret = (value) => /^(replace|change|your[-_])/i.test(String(value || ""));
if (
  isProduction &&
  (CHAT_JWT_SECRET.length < 32 || isPlaceholderSecret(CHAT_JWT_SECRET))
) {
  throw new Error("CHAT_JWT_SECRET must be configured with at least 32 characters in production");
}
if (isProduction && (!process.env.PROJECT_REGISTRATION_SECRET || isPlaceholderSecret(process.env.PROJECT_REGISTRATION_SECRET))) {
  throw new Error("PROJECT_REGISTRATION_SECRET must be configured in production");
}

const BACKEND_URL = (
  process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`
).replace(/\/$/, "");
const corsOrigins = String(
  process.env.CORS_ORIGIN ||
    (isProduction
      ? ""
      : "http://localhost:3001,http://localhost:5173,http://localhost:3000"),
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
if (isProduction && (!corsOrigins.length || corsOrigins.includes("*"))) {
  throw new Error("CORS_ORIGIN must list explicit frontend origins in production");
}
if (isProduction && corsOrigins.some((origin) => {
  try { return new URL(origin).protocol !== "https:"; } catch { return true; }
})) {
  throw new Error("Every production CORS_ORIGIN must be a valid HTTPS origin");
}
const corsOrigin = corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins;
const API_BASE = "/api";
const CHAT_FRONTEND_URL = (
  process.env.CHAT_FRONTEND_URL ||
  (!isProduction ? `http://localhost:${process.env.CHAT_FRONTEND_PORT || 3001}` : "")
).replace(/\/$/, "");
const UPLOAD_DIR = path.join(__dirname, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const UPLOAD_TYPES = {
  "image/jpeg": { extension: ".jpg", fileType: "image" },
  "image/png": { extension: ".png", fileType: "image" },
  "image/gif": { extension: ".gif", fileType: "image" },
  "image/webp": { extension: ".webp", fileType: "image" },
  "application/pdf": { extension: ".pdf", fileType: "file" },
};

const uploadFile = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
    filename: (_req, file, callback) => {
      const type = UPLOAD_TYPES[file.mimetype];
      callback(null, `${crypto.randomUUID()}${type?.extension || ""}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!UPLOAD_TYPES[file.mimetype]) {
      return callback(new Error("Only JPEG, PNG, GIF, WebP, and PDF files are allowed"));
    }
    callback(null, true);
  },
});

function parseRoomUpload(req, res, next) {
  uploadFile.single("file")(req, res, (err) => {
    if (err) {
      const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return sendError(res, status, err.message || "Upload failed");
    }
    next();
  });
}

function hasAllowedFileSignature(buffer, mimeType) {
  if (mimeType === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/gif") return buffer.subarray(0, 6).toString("ascii").match(/^GIF8[79]a$/) !== null;
  if (mimeType === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (mimeType === "application/pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  return false;
}
if (isProduction) {
  let chatFrontend;
  try {
    chatFrontend = new URL(CHAT_FRONTEND_URL);
  } catch {
    throw new Error("CHAT_FRONTEND_URL must be configured with the public Chat URL in production");
  }
  if (chatFrontend.protocol !== "https:") {
    throw new Error("CHAT_FRONTEND_URL must use HTTPS in production");
  }
  if (new URL(BACKEND_URL).protocol !== "https:") {
    throw new Error("BACKEND_URL must use HTTPS in production");
  }
}

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
if (isProduction && (!process.env.MESSAGE_ENC_KEY || isPlaceholderSecret(process.env.MESSAGE_ENC_KEY))) {
  throw new Error("MESSAGE_ENC_KEY must be configured and kept stable in production");
}
const MESSAGE_ENC_KEY = crypto
  .createHash("sha256")
  .update(
    String(
      process.env.MESSAGE_ENC_KEY ||
        process.env.CHAT_JWT_SECRET ||
        "chat-development-encryption-key-change-me",
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
    if (isProduction) throw err;
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
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      MESSAGE_ENC_KEY,
      iv,
    );
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

async function serializeRoomForUser(room, userId) {
  if (!room) return room;
  const membership = room.members?.find((member) => member.userId === userId);
  const unreadCount = membership
    ? await prisma.message.count({
        where: {
          roomId: room.id,
          senderId: { not: userId },
          createdAt: { gt: membership.lastReadAt || membership.joinedAt },
        },
      })
    : 0;

  return {
    ...room,
    lastMessagePreview: decryptContent(room.lastMessagePreview),
    unreadCount,
  };
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

    const { name, plan } = req.body;
    if (!name) return sendError(res, 400, "Project name is required");
    const resolvedPlan = plan === "basic" ? "basic" : "premium";

    const project = await prisma.project.create({
      data: { name, apiKey: generateApiKey(), plan: resolvedPlan },
    });
    res.status(201).json({
      id: project.id,
      name: project.name,
      apiKey: project.apiKey,
      plan: project.plan,
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

    const chatToken = jwt.sign(
      {
        userId: chatUser.id,
        projectId: req.project.id,
        name: chatUser.name,
        email: chatUser.email,
        plan: req.project.plan || "premium",
      },
      CHAT_JWT_SECRET,
      { expiresIn: "24h" },
    );

    res.json({
      success: true,
      token: chatToken,
      chatUrl: CHAT_FRONTEND_URL,
      projectId: req.project.id,
      plan: req.project.plan || "premium",
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
      const rooms = await prisma.chatRoom.findMany({
        where: {
          projectId: req.projectId,
          members: { some: { userId } },
          OR: [
            { isGroup: true },
            { directStatus: "accepted" },
            { directStatus: "pending", messages: { some: {} } },
          ],
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
app.post(`${API_BASE}/rooms/direct`, authenticateChatJWT, async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.projectId }, select: { plan: true } });
  if (project?.plan === "basic") return sendError(res, 403, "Direct messaging is not available on the basic plan");
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
    const project = await prisma.project.findUnique({ where: { id: req.projectId }, select: { plan: true } });
    if (project?.plan === "basic") return sendError(res, 403, "Direct messaging is not available on the basic plan");
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
        ...decryptMessage(saved.message),
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

// Create group room
app.post(`${API_BASE}/rooms/group`, authenticateChatJWT, async (req, res) => {
  const { name, memberIds } = req.body;
  const creatorId = req.userId;
  if (!name || !memberIds?.length) {
    return res
      .status(400)
      .json({ error: "name and memberIds are required" });
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
    res.json(await serializeRoomForUser(room, req.userId));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post(
  `${API_BASE}/rooms/:roomId/upload`,
  authenticateChatJWT,
  asyncHandler(async (req, res, next) => {
    const member = await prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId: req.params.roomId, userId: req.userId } },
      select: { roomId: true },
    });
    if (!member) return res.status(403).json({ error: "Not a member of this room" });
    next();
  }),
  parseRoomUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "A file is required" });
    const filePath = path.join(UPLOAD_DIR, req.file.filename);
    const signature = await fs.promises.readFile(filePath);
    const allowedType = UPLOAD_TYPES[req.file.mimetype];
    if (!allowedType || !hasAllowedFileSignature(signature, req.file.mimetype)) {
      await fs.promises.unlink(filePath).catch(() => {});
      return res.status(400).json({ error: "File contents do not match an allowed type" });
    }
    res.status(201).json({
      fileUrl: `${BACKEND_URL}${API_BASE}/rooms/${req.params.roomId}/uploads/${req.file.filename}`,
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
      select: { id: true },
    });
    if (!room) return res.status(404).json({ error: "Attachment not found" });

    const referenced = await prisma.message.findFirst({
      where: {
        roomId,
        fileUrl: { endsWith: `/uploads/${filename}` },
      },
      select: { id: true },
    });
    if (!referenced) return res.status(404).json({ error: "Attachment not found" });

    const filePath = path.join(UPLOAD_DIR, filename);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", "inline");
    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) res.status(err.statusCode || 404).end();
    });
  }),
);

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
      const roomMembers = await prisma.chatRoomMember.findMany({
        where: { roomId },
        select: { userId: true, lastReadAt: true },
      });
      const messages = page.reverse().map((message) => {
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
          ...decryptMessage(message),
          readBy,
          recipientCount,
        };
      });
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
      const [memberships, pendingRequests] = await Promise.all([
        prisma.chatRoomMember.findMany({
          where: {
            userId,
            room: { projectId: req.projectId, directStatus: "accepted" },
          },
          select: { roomId: true, joinedAt: true, lastReadAt: true },
        }),
        prisma.chatRoom.count({
          where: {
            projectId: req.projectId,
            isGroup: false,
            directStatus: "pending",
            requestedById: { not: userId },
            messages: { some: {} },
            members: { some: { userId } },
          },
        }),
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

// ─── Storage verification (JWT-protected) ────────────────────────────────────
// Confirms messages are persisting. Scoped to the caller's project.
//   GET /api/stats                 → project-wide totals
//   GET /api/rooms/:roomId/count   → count for one room + latest message time
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
    const membership =
      room &&
      (await prisma.chatRoomMember.findUnique({
        where: { roomId_userId: { roomId, userId: socket.userId } },
      }));
    if (!room || !membership)
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

        const members = await prisma.chatRoomMember.findMany({
          where: { roomId },
          select: { userId: true },
        });
        if (!members.some((member) => member.userId === senderId)) {
          return socket.emit("error", { message: "Not a member of this room" });
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
              ...decryptMessage(existingRequestMessage),
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
            ? "📷 Photo"
            : "📎 File"
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
        const outgoing = {
          ...decryptMessage(created),
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
      const membership = await prisma.chatRoom.findFirst({
        where: {
          id: roomId,
          projectId: socket.projectId,
          members: { some: { userId: socket.userId } },
        },
        select: { id: true },
      });
      if (!membership) return;

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

// ─── Encryption key self-check ──────────────────────────────────────────────
// Verify the encryption key round-trips at boot, and warn loudly if we're on
// the fallback key (which risks old messages becoming unreadable if the key
// later changes). This never blocks startup.
(function verifyEncryptionKey() {
  try {
    const probe = "chat-enc-selftest";
    const roundTrip = decryptContent(encryptContent(probe));
    if (roundTrip !== probe) {
      console.error(
        "[ENCRYPTION] Self-check FAILED: encrypt/decrypt round-trip mismatch. Messages may be unreadable.",
      );
    } else {
      console.log("[ENCRYPTION] Self-check OK (AES-256-GCM at rest).");
    }
  } catch (err) {
    console.error("[ENCRYPTION] Self-check error:", err.message);
  }
  if (!process.env.MESSAGE_ENC_KEY) {
    console.warn(
      "[ENCRYPTION] MESSAGE_ENC_KEY is not set — using a key derived from CHAT_JWT_SECRET. " +
        "Set a STABLE MESSAGE_ENC_KEY in production; if this key ever changes, previously " +
        "encrypted messages will not decrypt.",
    );
  }
})();

server.listen(PORT, () => {
  console.log(`Chat service running on port ${PORT}`);
});
