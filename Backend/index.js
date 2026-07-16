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

const app = express();
const server = http.createServer(app);
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

app.use(cors());
app.use(express.json());

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "uploads"));
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });

// Health check route
app.get("/", (req, res) => {
  res.json({ status: "Chat service is running" });
});

// SSO endpoint — verifies a JWT issued by the Society backend and
// finds or creates the corresponding user in the chat DB.
app.post("/auth/sso", async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: "Token is required" });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const { id, name, email } = payload;
  if (!email) {
    return res.status(400).json({ error: "Token payload must include email" });
  }

  try {
    // find-or-create: prefer the id carried in the token so the user's
    // identity stays consistent across both apps.
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          ...(id ? { id } : {}),  // use the Society id if provided
          name: name || email,
          email,
        },
      });
    }
    res.json({ id: user.id, name: user.name, email: user.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a user (for testing, since we have no separate auth system yet)
app.post("/users", async (req, res) => {
  const { name, email } = req.body;
  try {
    const user = await prisma.user.create({ data: { name, email } });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Sign up: create a brand new user (fails if email already exists)
app.post("/signup", async (req, res) => {
  const { name, email } = req.body;
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: "Email already registered. Please login instead." });
    }
    const user = await prisma.user.create({ data: { name, email } });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Login: find an existing user by email (fails if not found)
app.post("/login", async (req, res) => {
  const { email } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: "No account found with this email. Please sign up." });
    }
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// List all users except the current one
app.get("/users", async (req, res) => {
  const { excludeId } = req.query;
  try {
    const users = await prisma.user.findMany({
      where: excludeId ? { id: { not: excludeId } } : undefined,
      orderBy: { name: "asc" },
    });
    res.json(users);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get or create a 1-to-1 room between two specific users
app.post("/rooms/direct", async (req, res) => {
  const { userId1, userId2 } = req.body;
  try {
    const existingRoom = await prisma.chatRoom.findFirst({
      where: {
        isGroup: false,
        AND: [
          { members: { some: { userId: userId1 } } },
          { members: { some: { userId: userId2 } } },
        ],
      },
      include: { members: true },
    });

    if (existingRoom) {
      return res.json(existingRoom);
    }

    const newRoom = await prisma.chatRoom.create({
      data: {
        isGroup: false,
        members: {
          create: [{ userId: userId1 }, { userId: userId2 }],
        },
      },
      include: { members: true },
    });
    res.json(newRoom);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// Create a chat room
app.post("/rooms", async (req, res) => {
  const { name, isGroup, memberIds } = req.body;
  try {
    const room = await prisma.chatRoom.create({
      data: {
        name,
        isGroup: !!isGroup,
        members: {
          create: memberIds.map((userId) => ({ userId })),
        },
      },
      include: { members: true },
    });
    res.json(room);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Create a group chat with multiple members
app.post("/rooms/group", async (req, res) => {
  const { name, creatorId, memberIds } = req.body;
  try {
    const allMemberIds = Array.from(new Set([creatorId, ...memberIds]));

    const room = await prisma.chatRoom.create({
      data: {
        name,
        isGroup: true,
        members: {
          create: allMemberIds.map((userId) => ({ userId })),
        },
      },
      include: { members: { include: { user: true } } },
    });
    res.json(room);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get all rooms (chats/groups) that a user belongs to
app.get("/users/:userId/rooms", async (req, res) => {
  const { userId } = req.params;
  try {
    const rooms = await prisma.chatRoom.findMany({
      where: {
        members: { some: { userId } },
      },
      include: {
        members: { include: { user: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(rooms);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get messages for a room (chat history)
app.get("/rooms/:roomId/messages", async (req, res) => {
  const { roomId } = req.params;
  try {
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

// Get details of a specific room, including all members
app.get("/rooms/:roomId", async (req, res) => {
  const { roomId } = req.params;
  try {
    const room = await prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: { members: { include: { user: true } } },
    });
    if (!room) return res.status(404).json({ error: "Room not found" });
    res.json(room);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Socket.io setup
const io = new Server(server, {
  cors: { origin: "*" },
});

// Track online users: { socketId -> userId }
const onlineUsers = new Map();

// Broadcast the current set of online userIds to everyone
function broadcastOnlineUsers() {
  const userIds = Array.from(new Set(onlineUsers.values()));
  io.emit("online_users", userIds);
}

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Client emits this right after connecting so we know who they are
  socket.on("user_online", (userId) => {
    onlineUsers.set(socket.id, userId);
    broadcastOnlineUsers();
  });

  socket.on("join_room", (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
  });

  socket.on("send_message", async ({ roomId, senderId, content, fileUrl, fileType }) => {
    try {
      const message = await prisma.message.create({
        data: { roomId, senderId, content, fileUrl, fileType },
        include: { sender: true },
      });
      io.to(roomId).emit("new_message", message);
    } catch (err) {
      console.error("Error saving message:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    onlineUsers.delete(socket.id);
    broadcastOnlineUsers();
  });
});

// Upload a file/image
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const fileUrl = `http://localhost:5000/uploads/${req.file.filename}`;
  const isImage = req.file.mimetype.startsWith("image/");
  res.json({ fileUrl, fileType: isImage ? "image" : "file" });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Chat service running on port ${PORT}`);
});