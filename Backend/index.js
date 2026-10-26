const config = require("./src/config/runtime");
const createApp = require("./src/app/createApp");
const mediaStorage = require("./src/media/storage");
const { mediaKey, legacyMediaKey } = require("./src/media/keys");

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
const UPLOAD_TYPES = {
  "image/jpeg": { extension: ".jpg", fileType: "image" },
  "image/png": { extension: ".png", fileType: "image" },
  "image/gif": { extension: ".gif", fileType: "image" },
  "image/webp": { extension: ".webp", fileType: "image" },
  "application/pdf": { extension: ".pdf", fileType: "file" },
};

const parseRoomUpload = parseMediaUpload;

async function sendStoredMedia(res, key) {
  const target = await mediaStorage.getDownloadTarget(key);
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (target.url) return res.redirect(302, target.url);
  res.setHeader("Content-Disposition", "inline");
  return res.sendFile(target.path, (err) => {
    if (err && !res.headersSent) res.status(err.statusCode || 404).end();
  });
}

function mediaUploadInput(req, imagesOnly = false) {
  const contentType = String(req.body?.contentType || "");
  const type = UPLOAD_TYPES[contentType];
  const size = Number(req.body?.size);
  if (!type || (imagesOnly && type.fileType !== "image")) return null;
  if (!Number.isInteger(size) || size < 1 || size > 10 * 1024 * 1024) return null;
  return { contentType, type, size };
}

async function startPresignedMediaUpload(req, { purpose, category, ownerId, roomId, imagesOnly = false }) {
  const input = mediaUploadInput(req, imagesOnly);
  if (!input) return { error: "Unsupported file type or size" };
  if (!mediaStorage.isS3Enabled) return { mode: "proxy" };

  const filename = `${crypto.randomUUID()}${input.type.extension}`;
  const finalKey = mediaKey(req.projectId, category, ownerId, filename);
  const stagingKey = `pending/${req.projectId}/${crypto.randomUUID()}`;
  const form = await mediaStorage.createUploadForm({
    key: stagingKey,
    contentType: input.contentType,
    maxSize: 10 * 1024 * 1024,
  });
  const completionToken = jwt.sign({
    scope: "media-upload",
    purpose,
    projectId: req.projectId,
    userId: req.userId,
    roomId: roomId || null,
    stagingKey,
    finalKey,
    filename,
    contentType: input.contentType,
    fileType: input.type.fileType,
  }, CHAT_JWT_SECRET, { expiresIn: "10m" });

  return {
    mode: "s3",
    url: form.url,
    fields: form.fields,
    completionToken,
  };
}

function verifyUploadToken(req, purpose, roomId) {
  const token = req.body?.completionToken;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, CHAT_JWT_SECRET);
    if (
      payload.scope !== "media-upload" || payload.purpose !== purpose ||
      payload.projectId !== req.projectId || payload.userId !== req.userId ||
      (roomId && payload.roomId !== roomId)
    ) return null;
    return payload;
  } catch {
    return null;
  }
}

async function completePresignedMediaUpload(req, payload) {
  return mediaStorage.finalizeUpload({
    stagingKey: payload.stagingKey,
    finalKey: payload.finalKey,
    contentType: payload.contentType,
    maxSize: 10 * 1024 * 1024,
    verifySignature: hasAllowedFileSignature,
  });
}

function requireRoomUploadAccess(req, res, next) {
  (async () => {
    const room = await prisma.chatRoom.findFirst({
      where: { id: req.params.roomId, projectId: req.projectId },
      include: { members: { where: { userId: req.userId }, select: { userId: true } } },
    });
    if (!room || room.members.length === 0) return sendError(res, 403, "Not a member of this room");
    const { allowDirectChat, allowGroupChat } = await getProjectPermissions(req.projectId, req);
    if ((room.isGroup && !allowGroupChat) || (!room.isGroup && !allowDirectChat)) {
      return sendError(res, 403, "Chat is not enabled for this project");
    }
    req.mediaRoom = room;
    next();
  })().catch(next);
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

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function generateApiKey() {
  return "ck_" + crypto.randomBytes(32).toString("hex");
}

// â”€â”€â”€ Message encryption at rest (AES-256-GCM) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    return stored; // legacy plaintext or non-string â€” return untouched
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
    return ""; // corrupt/undecryptable â€” return empty rather than throwing
  }
}

// Decrypt a message object's content field in place (returns a shallow copy).
function decryptMessage(msg) {
  if (!msg) return msg;
  const { fileStorageKey: _fileStorageKey, ...publicMessage } = msg;
  return { ...publicMessage, content: decryptContent(msg.content) };
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

  // The creator is the member who joined first (set at group creation time)
  let createdById = null;
  if (room.isGroup && room.members?.length) {
    const sorted = [...room.members].sort(
      (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
    );
    createdById = sorted[0]?.userId || null;
  }

  const { avatarStorageKey: _avatarStorageKey, ...publicRoom } = room;
  const members = room.members?.map((member) => {
    if (!member.user) return member;
    const { avatarStorageKey: _userAvatarStorageKey, ...publicUser } = member.user;
    return { ...member, user: publicUser };
  });

  return {
    ...publicRoom,
    ...(members ? { members } : {}),
    lastMessagePreview: decryptContent(room.lastMessagePreview),
    unreadCount,
    createdById,
  };
}

function roomMediaStorageKey(projectId, room, fileUrl) {
  try {
    const url = new URL(String(fileUrl));
    const prefix = `${API_BASE}/rooms/${room.id}/uploads/`;
    if (url.origin !== new URL(BACKEND_URL).origin || !url.pathname.startsWith(prefix) || url.search || url.hash) return null;
    const filename = path.basename(url.pathname);
    if (!/^[0-9a-f-]{36}\.(jpg|png|gif|webp|pdf)$/i.test(filename)) return null;
    return mediaKey(projectId, room.isGroup ? "groups" : "direct", room.id, filename);
  } catch {
    return null;
  }
}

// â”€â”€â”€ Middleware: Resolve project from X-API-KEY or societyId â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function resolveProject(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  const societyId =
    req.headers["x-society-id"] ||
    req.headers["society-id"] ||
    req.headers["societyid"] ||
    req.body?.societyId ||
    req.query?.societyId ||
    req.body?.projectId ||
    req.query?.projectId;

  if (!apiKey && !societyId) {
    return res.status(401).json({ error: "X-API-KEY or societyId is required" });
  }

  try {
    let project = null;

    if (apiKey) {
      project = await prisma.project.findUnique({ where: { apiKey } });
    }

    if (!project && societyId) {
      const societyStr = String(societyId).trim();
      const isUuid =
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
          societyStr,
        );

      project = await prisma.project.findFirst({
        where: {
          OR: [
            ...(isUuid ? [{ id: societyStr }] : []),
            { apiKey: societyStr },
            { name: societyStr },
            { name: `Society ${societyStr}` },
            { name: `society_${societyStr}` },
            { name: `society-${societyStr}` },
          ],
        },
      });

      // Auto-create project for the society if it doesn't exist yet
      if (!project) {
        const capabilities = resolveChatCapabilities(req.body);
        const projectName =
          req.body?.societyName || req.body?.name || `Society ${societyStr}`;
        project = await prisma.project.create({
          data: {
            name: projectName,
            apiKey: generateApiKey(),
            plan: capabilities.plan || "custom",
            allowGroupChat: capabilities.allowGroupChat ?? true,
            allowDirectChat: capabilities.allowDirectChat ?? true,
          },
        });
        console.log(
          `[resolveProject] Auto-created project "${project.name}" (${project.id}) for societyId=${societyStr}`,
        );
      }
    }

    if (!project) return res.status(401).json({ error: "Invalid API key or society ID" });
    if (!project.isActive)
      return res.status(403).json({ error: "Project is deactivated" });
    req.project = project;
    next();
  } catch (err) {
    console.error("resolveProject error", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// â”€â”€â”€ Middleware: Authenticate chat JWT (for frontend requests) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    req.plan = payload.plan;
    req.allowGroupChat = payload.allowGroupChat;
    req.allowDirectChat = payload.allowDirectChat;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

function parseFeatureFlag(val) {
  if (typeof val === "boolean") return val;
  if (val === "true") return true;
  if (val === "false") return false;
  return undefined;
}

// â”€â”€â”€ Resolve Plan & Chat Capabilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function resolveChatCapabilities(body = {}, existingProject = null) {
  let allowGroup;
  if (body.allowGroupChat !== undefined) {
    allowGroup = parseFeatureFlag(body.allowGroupChat);
  } else if (body.groupChat !== undefined) {
    allowGroup = parseFeatureFlag(body.groupChat);
  }

  let allowDirect;
  if (body.allowDirectChat !== undefined) {
    allowDirect = parseFeatureFlag(body.allowDirectChat);
  } else if (body.allowIndividualChat !== undefined) {
    allowDirect = parseFeatureFlag(body.allowIndividualChat);
  } else if (body.individualChat !== undefined) {
    allowDirect = parseFeatureFlag(body.individualChat);
  } else if (body.allowOneToOneChat !== undefined) {
    allowDirect = parseFeatureFlag(body.allowOneToOneChat);
  } else if (body.directChat !== undefined) {
    allowDirect = parseFeatureFlag(body.directChat);
  } else if (body.oneToOneChat !== undefined) {
    allowDirect = parseFeatureFlag(body.oneToOneChat);
  }

  // If plan is provided as an object containing explicit flags
  if (typeof body.plan === "object" && body.plan !== null) {
    if (allowGroup === undefined) {
      if (body.plan.allowGroupChat !== undefined) allowGroup = parseFeatureFlag(body.plan.allowGroupChat);
      else if (body.plan.groupChat !== undefined) allowGroup = parseFeatureFlag(body.plan.groupChat);
    }
    if (allowDirect === undefined) {
      if (body.plan.allowDirectChat !== undefined) allowDirect = parseFeatureFlag(body.plan.allowDirectChat);
      else if (body.plan.allowIndividualChat !== undefined) allowDirect = parseFeatureFlag(body.plan.allowIndividualChat);
      else if (body.plan.individualChat !== undefined) allowDirect = parseFeatureFlag(body.plan.individualChat);
      else if (body.plan.allowOneToOneChat !== undefined) allowDirect = parseFeatureFlag(body.plan.allowOneToOneChat);
      else if (body.plan.directChat !== undefined) allowDirect = parseFeatureFlag(body.plan.directChat);
      else if (body.plan.oneToOneChat !== undefined) allowDirect = parseFeatureFlag(body.plan.oneToOneChat);
    }
  }

  // Check subFeatures map e.g. { CHAT: ["GROUP_CHAT", "INDIVIDUAL_CHAT"] }
  const subFeatures = body.subFeatures || (typeof body.plan === "object" ? body.plan?.subFeatures : null);
  if (subFeatures && typeof subFeatures === "object") {
    const chatSubs = subFeatures.CHAT || subFeatures.chat || subFeatures.Chat || [];
    if (Array.isArray(chatSubs)) {
      if (allowGroup === undefined) {
        if (chatSubs.includes("GROUP_CHAT") || chatSubs.includes("group_chat") || chatSubs.includes("Group Chat")) {
          allowGroup = true;
        }
      }
      if (allowDirect === undefined) {
        if (
          chatSubs.includes("INDIVIDUAL_CHAT") ||
          chatSubs.includes("individual_chat") ||
          chatSubs.includes("Individual Chat") ||
          chatSubs.includes("DIRECT_CHAT") ||
          chatSubs.includes("direct_chat") ||
          chatSubs.includes("ONE_TO_ONE_CHAT")
        ) {
          allowDirect = true;
        }
      }
    }
  }

  // Check top-level features array
  const features = body.features || (typeof body.plan === "object" ? body.plan?.features : null);
  if (Array.isArray(features)) {
    if (allowGroup === undefined && (features.includes("GROUP_CHAT") || features.includes("group_chat"))) {
      allowGroup = true;
    }
    if (
      allowDirect === undefined &&
      (features.includes("INDIVIDUAL_CHAT") || features.includes("individual_chat") || features.includes("DIRECT_CHAT") || features.includes("direct_chat"))
    ) {
      allowDirect = true;
    }
  }

  // Fallback to existing project configuration if available
  if (allowGroup === undefined && existingProject?.allowGroupChat !== undefined) {
    allowGroup = parseFeatureFlag(existingProject.allowGroupChat);
  }
  if (allowDirect === undefined && existingProject?.allowDirectChat !== undefined) {
    allowDirect = parseFeatureFlag(existingProject.allowDirectChat);
  }

  // Plan name is metadata only â€” it never determines feature availability
  const planName =
    typeof body.plan === "string" && body.plan.trim()
      ? body.plan.trim()
      : (existingProject?.plan || "custom");

  // If configuration is missing or invalid, do not automatically enable either feature.
  if (allowGroup === undefined) {
    allowGroup = false;
  }
  if (allowDirect === undefined) {
    allowDirect = false;
  }

  return {
    plan: planName,
    allowGroupChat: Boolean(allowGroup),
    allowDirectChat: Boolean(allowDirect),
  };
}

async function getProjectPermissions(projectId, reqOrSocket = {}) {
  let allowDirect;
  let allowGroup;

  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { allowDirectChat: true, allowGroupChat: true },
    });
    if (project) {
      allowDirect = parseFeatureFlag(project.allowDirectChat);
      allowGroup = parseFeatureFlag(project.allowGroupChat);
    }
  }

  if (
    (allowDirect === undefined || (allowDirect === false && allowGroup === false)) &&
    reqOrSocket.allowDirectChat !== undefined
  ) {
    allowDirect = parseFeatureFlag(reqOrSocket.allowDirectChat);
  }
  if (
    (allowGroup === undefined || (allowDirect === false && allowGroup === false)) &&
    reqOrSocket.allowGroupChat !== undefined
  ) {
    allowGroup = parseFeatureFlag(reqOrSocket.allowGroupChat);
  }

  return {
    allowDirectChat: Boolean(allowDirect),
    allowGroupChat: Boolean(allowGroup),
  };
}

// â”€â”€â”€ Health â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    res.json(users.map(({ avatarStorageKey: _storageKey, ...user }) => user));
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
app.post(
  `${API_BASE}/rooms/group/avatar/presign`,
  authenticateChatJWT,
  asyncHandler(async (req, res) => {
    const { allowGroupChat } = await getProjectPermissions(req.projectId, req);
    if (!allowGroupChat) return sendError(res, 403, "Group chat is not enabled for this project");
    const result = await startPresignedMediaUpload(req, {
      purpose: "group-avatar",
      category: "groups/avatars",
      ownerId: "shared",
      imagesOnly: true,
    });
    if (result.error) return sendError(res, 400, result.error);
    res.json(result);
  }),
);

app.post(
  `${API_BASE}/rooms/group/avatar/complete`,
  authenticateChatJWT,
  asyncHandler(async (req, res) => {
    const { allowGroupChat } = await getProjectPermissions(req.projectId, req);
    if (!allowGroupChat) return sendError(res, 403, "Group chat is not enabled for this project");
    const payload = verifyUploadToken(req, "group-avatar");
    if (!payload) return sendError(res, 403, "Invalid or expired upload authorization");
    await completePresignedMediaUpload(req, payload);
    res.status(201).json({ avatarUrl: `${BACKEND_URL}${API_BASE}/uploads/${payload.filename}` });
  }),
);

app.post(
  `${API_BASE}/rooms/group/avatar`,
  authenticateChatJWT,
  asyncHandler(async (req, res, next) => {
    const { allowGroupChat } = await getProjectPermissions(req.projectId, req);
    if (!allowGroupChat) {
      return sendError(res, 403, "Group chat is not enabled for this project");
    }
    next();
  }),
  parseRoomUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) return sendError(res, 400, "A file is required");

    // Only images are accepted as group avatars (not PDFs).
    const allowedType = UPLOAD_TYPES[req.file.mimetype];
    if (!allowedType || allowedType.fileType !== "image") {
      return sendError(res, 400, "Only image files (JPEG, PNG, GIF, WebP) are accepted for group avatars");
    }

    // Verify magic bytes to prevent MIME spoofing.
    if (!hasAllowedFileSignature(req.file.buffer, req.file.mimetype)) {
      return sendError(res, 400, "File contents do not match an allowed image type");
    }

    const filename = `${crypto.randomUUID()}${allowedType.extension}`;
    const key = mediaKey(req.projectId, "groups/avatars", "shared", filename);
    await mediaStorage.putObject({ key, body: req.file.buffer, contentType: req.file.mimetype });
    const avatarUrl = `${BACKEND_URL}${API_BASE}/uploads/${filename}`;
    res.status(201).json({ avatarUrl });
  }),
);

// Upload or replace the authenticated user's profile image.
app.post(
  `${API_BASE}/users/me/avatar/presign`,
  authenticateChatJWT,
  asyncHandler(async (req, res) => {
    const result = await startPresignedMediaUpload(req, {
      purpose: "profile-avatar",
      category: "users/profile",
      ownerId: req.userId,
      imagesOnly: true,
    });
    if (result.error) return sendError(res, 400, result.error);
    res.json(result);
  }),
);

app.post(
  `${API_BASE}/users/me/avatar/complete`,
  authenticateChatJWT,
  asyncHandler(async (req, res) => {
    const payload = verifyUploadToken(req, "profile-avatar");
    if (!payload) return sendError(res, 403, "Invalid or expired upload authorization");
    await completePresignedMediaUpload(req, payload);
    const avatarUrl = `${BACKEND_URL}${API_BASE}/users/${req.userId}/avatar/${payload.filename}`;
    await prisma.chatUser.update({
      where: { id: req.userId },
      data: { avatarUrl, avatarStorageKey: payload.finalKey },
    });
    res.status(201).json({ avatarUrl });
  }),
);

app.post(
  `${API_BASE}/users/me/avatar`,
  authenticateChatJWT,
  parseRoomUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) return sendError(res, 400, "A file is required");
    const allowedType = UPLOAD_TYPES[req.file.mimetype];
    if (!allowedType || allowedType.fileType !== "image" || !hasAllowedFileSignature(req.file.buffer, req.file.mimetype)) {
      return sendError(res, 400, "File contents do not match an allowed image type");
    }
    const filename = `${crypto.randomUUID()}${allowedType.extension}`;
    const key = mediaKey(req.projectId, "users/profile", req.userId, filename);
    await mediaStorage.putObject({ key, body: req.file.buffer, contentType: req.file.mimetype });
    const avatarUrl = `${BACKEND_URL}${API_BASE}/users/${req.userId}/avatar/${filename}`;
    await prisma.chatUser.update({
      where: { id: req.userId },
      data: { avatarUrl, avatarStorageKey: key },
    });
    res.status(201).json({ avatarUrl });
  }),
);

// Profile images are private and only available to users in the same society.
app.get(
  `${API_BASE}/users/:userId/avatar/:filename`,
  authenticateChatJWT,
  asyncHandler(async (req, res) => {
    const { userId, filename } = req.params;
    if (path.basename(filename) !== filename || !/^[0-9a-f-]{36}\.(jpg|png|gif|webp)$/i.test(filename)) {
      return res.status(404).json({ error: "Not found" });
    }
    const user = await prisma.chatUser.findFirst({
      where: { id: userId, projectId: req.projectId, avatarUrl: `${BACKEND_URL}${API_BASE}/users/${userId}/avatar/${filename}` },
      select: { id: true, avatarStorageKey: true },
    });
    if (!user) return res.status(404).json({ error: "Not found" });
    const key = user.avatarStorageKey || legacyMediaKey(req.projectId, "users/profile", userId, filename);
    await sendStoredMedia(res, key);
  }),
);

// Create group room
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

app.post(
  `${API_BASE}/rooms/:roomId/upload-url`,
  authenticateChatJWT,
  requireRoomUploadAccess,
  asyncHandler(async (req, res) => {
    const result = await startPresignedMediaUpload(req, {
      purpose: "room-attachment",
      category: req.mediaRoom.isGroup ? "groups" : "direct",
      ownerId: req.mediaRoom.id,
      roomId: req.mediaRoom.id,
    });
    if (result.error) return sendError(res, 400, result.error);
    res.json(result);
  }),
);

app.post(
  `${API_BASE}/rooms/:roomId/upload-complete`,
  authenticateChatJWT,
  requireRoomUploadAccess,
  asyncHandler(async (req, res) => {
    const payload = verifyUploadToken(req, "room-attachment", req.mediaRoom.id);
    if (!payload) return sendError(res, 403, "Invalid or expired upload authorization");
    const saved = await completePresignedMediaUpload(req, payload);
    res.status(201).json({
      fileUrl: `${BACKEND_URL}${API_BASE}/rooms/${req.mediaRoom.id}/uploads/${payload.filename}`,
      fileType: payload.fileType,
      size: saved.size,
    });
  }),
);

app.post(
  `${API_BASE}/rooms/:roomId/upload`,
  authenticateChatJWT,
  asyncHandler(async (req, res, next) => {
    const room = await prisma.chatRoom.findFirst({
      where: { id: req.params.roomId, projectId: req.projectId },
      include: { members: { where: { userId: req.userId } } },
    });
    if (!room || room.members.length === 0) {
      return res.status(403).json({ error: "Not a member of this room" });
    }
    const { allowDirectChat, allowGroupChat } = await getProjectPermissions(req.projectId, req);
    if (room.isGroup && !allowGroupChat) {
      return sendError(res, 403, "Group chat is not enabled for this project");
    }
    if (!room.isGroup && !allowDirectChat) {
      return sendError(res, 403, "Direct messaging is not enabled for this project");
    }
    req.room = room;
    next();
  }),
  parseRoomUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "A file is required" });
    const allowedType = UPLOAD_TYPES[req.file.mimetype];
    if (!allowedType || !hasAllowedFileSignature(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({ error: "File contents do not match an allowed type" });
    }
    const filename = `${crypto.randomUUID()}${allowedType.extension}`;
    const category = req.room.isGroup ? "groups" : "direct";
    const key = mediaKey(req.projectId, category, req.room.id, filename);
    await mediaStorage.putObject({ key, body: req.file.buffer, contentType: req.file.mimetype });
    res.status(201).json({
      fileUrl: `${BACKEND_URL}${API_BASE}/rooms/${req.params.roomId}/uploads/${filename}`,
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
      select: { id: true, isGroup: true },
    });
    if (!room) return res.status(404).json({ error: "Attachment not found" });

    const referenced = await prisma.message.findFirst({
      where: {
        roomId,
        fileUrl: { endsWith: `/uploads/${filename}` },
      },
      select: { id: true, fileStorageKey: true },
    });
    if (!referenced) return res.status(404).json({ error: "Attachment not found" });

    const category = room.isGroup ? "groups" : "direct";
    const key = referenced.fileStorageKey || legacyMediaKey(req.projectId, category, roomId, filename);
    await sendStoredMedia(res, key);
  }),
);

// â”€â”€â”€ Serve general uploads (group avatars etc.) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET /api/uploads/:filename
// JWT-protected. Any authenticated member of the same project can load avatars.
app.get(
  `${API_BASE}/uploads/:filename`,
  authenticateChatJWT,
  asyncHandler(async (req, res) => {
    const { filename } = req.params;
    // Only image files allowed here (avatars are never PDFs).
    if (
      path.basename(filename) !== filename ||
      !/^[0-9a-f-]{36}\.(jpg|png|gif|webp)$/i.test(filename)
    ) {
      return res.status(404).json({ error: "Not found" });
    }

    // Confirm the file is referenced as a group avatarUrl within this project.
    const room = await prisma.chatRoom.findFirst({
      where: {
        projectId: req.projectId,
        avatarUrl: { endsWith: `/uploads/${filename}` },
      },
      select: { id: true, avatarStorageKey: true },
    });
    if (!room) return res.status(404).json({ error: "Not found" });

    const key = room.avatarStorageKey || legacyMediaKey(req.projectId, "groups/avatars", "shared", filename);
    await sendStoredMedia(res, key);
  }),
);

// Get room messages (paginated, WhatsApp-style)
//
// Query params:
//   limit  - page size (default 30, max 100)
//   before - ISO timestamp; return messages OLDER than this (for "load previous")
//
// Returns: { messages: [...oldestâ†’newest], hasMore, nextBefore }
//   - messages are ordered oldestâ†’newest so the client can append directly
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
            fileUrl,
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

  // ─── Edit a sent message (sender only, text messages only) ───────────────
  socket.on("edit_message", async ({ messageId, content }) => {
    console.log(`[edit_message] userId=${socket.userId} messageId=${messageId}`);
    if (!messageId || !content?.trim()) {
      return socket.emit("error", { message: "messageId and content are required" });
    }
    try {
      const msg = await prisma.message.findFirst({
        where: { id: messageId },
        include: { sender: true },
      });
      if (!msg) return socket.emit("error", { message: "Message not found" });
      if (msg.senderId !== socket.userId) {
        return socket.emit("error", { message: "You can only edit your own messages" });
      }
      if (msg.isDeleted) {
        return socket.emit("error", { message: "Cannot edit a deleted message" });
      }
      if (msg.messageType !== "text") {
        return socket.emit("error", { message: "Only text messages can be edited" });
      }
      // Verify the message belongs to this project via the room
      const room = await prisma.chatRoom.findFirst({
        where: { id: msg.roomId, projectId: socket.projectId },
      });
      if (!room) return socket.emit("error", { message: "Room not found" });

      const now = new Date();
      const updated = await prisma.message.update({
        where: { id: messageId },
        data: {
          content: encryptContent(content.trim()),
          editedAt: now,
        },
        include: { sender: true },
      });

      // Update room preview if this was the last message
      if (room.lastMessageAt && new Date(room.lastMessageAt).getTime() <= new Date(updated.createdAt).getTime()) {
        await prisma.chatRoom.update({
          where: { id: msg.roomId },
          data: { lastMessagePreview: encryptContent(content.trim().slice(0, 100)) },
        }).catch(() => {});
      }

      const outgoing = {
        ...decryptMessage(updated),
        editedAt: now,
      };
      io.to(msg.roomId).emit("message_edited", { message: outgoing });
    } catch (err) {
      console.error("edit_message error", err);
      socket.emit("error", { message: "Failed to edit message" });
    }
  });

  // ─── Delete a message for everyone (sender only) ──────────────────────────
  socket.on("delete_message", async ({ messageId }) => {
    console.log(`[delete_message] userId=${socket.userId} messageId=${messageId}`);
    if (!messageId) {
      return socket.emit("error", { message: "messageId is required" });
    }
    try {
      const msg = await prisma.message.findFirst({
        where: { id: messageId },
      });
      if (!msg) return socket.emit("error", { message: "Message not found" });
      if (msg.senderId !== socket.userId) {
        return socket.emit("error", { message: "You can only delete your own messages" });
      }
      // Verify the message belongs to this project
      const room = await prisma.chatRoom.findFirst({
        where: { id: msg.roomId, projectId: socket.projectId },
      });
      if (!room) return socket.emit("error", { message: "Room not found" });

      await prisma.message.update({
        where: { id: messageId },
        data: {
          isDeleted: true,
          content: null,       // wipe encrypted content
          fileUrl: null,
          fileType: null,
        },
      });

      io.to(msg.roomId).emit("message_deleted", { messageId, roomId: msg.roomId });
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

const PORT = process.env.PORT || 5000;
server.keepAliveTimeout = Number(process.env.KEEP_ALIVE_TIMEOUT_MS || 5000);
server.headersTimeout = Number(
  process.env.HEADERS_TIMEOUT_MS || server.keepAliveTimeout + 1000,
);

app.use((req, res) => chatCore.sendError(res, 404, "Resource not found"));
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  if (res.headersSent) return next(err);
  chatCore.sendError(res, 500, "Internal server error");
});

process.on("uncaughtException", (err) => {
  console.error("uncaughtException", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection", reason);
});

// â”€â”€â”€ Encryption key self-check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      "[ENCRYPTION] MESSAGE_ENC_KEY is not set â€” using a key derived from CHAT_JWT_SECRET. " +
        "Set a STABLE MESSAGE_ENC_KEY in production; if this key ever changes, previously " +
        "encrypted messages will not decrypt.",
    );
  }
})();

if (process.env.NODE_ENV !== "test") {
  // Run pending migrations before starting the server so new columns are
  // always available (e.g. editedAt, isDeleted on Message).
  const { execSync } = require("child_process");
  try {
    execSync("npx prisma migrate deploy", { stdio: "inherit", cwd: __dirname });
  } catch (err) {
    console.error("[STARTUP] prisma migrate deploy failed:", err.message);
    // Don't crash — server may still work if migrations are already applied.
  }
  server.listen(PORT, () => {
    console.log(`Chat service running on port ${PORT}`);
  });
}

module.exports = {
  app,
  server,
  io,
  resolveChatCapabilities: chatCore.resolveChatCapabilities,
  getProjectPermissions: chatCore.getProjectPermissions,
  parseFeatureFlag: chatCore.parseFeatureFlag,
  prisma,
};
