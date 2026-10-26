const crypto = require("crypto");
const path = require("path");

module.exports = function createChatCore({ prisma, config, mediaKey, mediaStorage }) {
  const { isProduction, CHAT_JWT_SECRET, API_BASE, BACKEND_URL } = config;
  const ENC_PREFIX = "enc:v1:";
  const MESSAGE_ENC_KEY = crypto
    .createHash("sha256")
    .update(String(
      process.env.MESSAGE_ENC_KEY ||
      process.env.CHAT_JWT_SECRET ||
      "chat-development-encryption-key-change-me",
    ))
    .digest();

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

  function generateApiKey() {
    return "ck_" + crypto.randomBytes(32).toString("hex");
  }

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
      return plain;
    }
  }

  function decryptContent(stored) {
    if (stored == null) return stored;
    if (typeof stored !== "string" || !stored.startsWith(ENC_PREFIX)) return stored;
    try {
      const raw = Buffer.from(stored.slice(ENC_PREFIX.length), "base64");
      const iv = raw.subarray(0, 12);
      const tag = raw.subarray(12, 28);
      const ct = raw.subarray(28);
      const decipher = crypto.createDecipheriv("aes-256-gcm", MESSAGE_ENC_KEY, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    } catch (err) {
      console.error("decryptContent error", err);
      return "";
    }
  }

  async function decryptMessage(msg) {
    if (!msg) return msg;
    const { fileStorageKey: _fileStorageKey, ...publicMessage } = msg;
    return {
      ...publicMessage,
      fileUrl: msg.fileStorageKey
        ? await attachmentUrl(msg.roomId, msg.fileStorageKey)
        : normalizeLegacyMediaUrl(msg.fileUrl),
      content: decryptContent(msg.content),
    };
  }

  function normalizeLegacyMediaUrl(value) {
    if (!value) return value;
    try {
      const url = new URL(String(value), BACKEND_URL);
      if (url.pathname.startsWith(`${API_BASE}/`)) return `${BACKEND_URL}${url.pathname}`;
    } catch {
      // Preserve legacy non-HTTP media references.
    }
    return value;
  }

  async function attachmentUrl(roomId, key) {
    const signedUrl = await mediaStorage.createDownloadUrl(key);
    if (signedUrl) return signedUrl;
    return `${BACKEND_URL}${API_BASE}/rooms/${roomId}/uploads/${path.basename(key)}`;
  }

  async function profileAvatarUrl(userId, key) {
    const signedUrl = await mediaStorage.createDownloadUrl(key);
    if (signedUrl) return signedUrl;
    return `${BACKEND_URL}${API_BASE}/users/${userId}/avatar/${path.basename(key)}`;
  }

  async function groupAvatarUrl(key) {
    const signedUrl = await mediaStorage.createDownloadUrl(key);
    if (signedUrl) return signedUrl;
    return `${BACKEND_URL}${API_BASE}/uploads/${path.basename(key)}`;
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

    let createdById = null;
    if (room.isGroup && room.members?.length) {
      const sorted = [...room.members].sort(
        (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
      );
      createdById = sorted[0]?.userId || null;
    }

    const { avatarStorageKey, ...publicRoom } = room;
    if (avatarStorageKey) publicRoom.avatarUrl = await groupAvatarUrl(avatarStorageKey);
    else publicRoom.avatarUrl = normalizeLegacyMediaUrl(publicRoom.avatarUrl);
    const members = await Promise.all((room.members || []).map(async (member) => {
      if (!member.user) return member;
      const { avatarStorageKey, ...publicUser } = member.user;
      if (avatarStorageKey) publicUser.avatarUrl = await profileAvatarUrl(member.user.id, avatarStorageKey);
      else publicUser.avatarUrl = normalizeLegacyMediaUrl(publicUser.avatarUrl);
      return { ...member, user: publicUser };
    }));

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
      const url = new URL(String(fileUrl), BACKEND_URL);
      const prefix = `${API_BASE}/rooms/${room.id}/uploads/`;
      if (url.origin !== new URL(BACKEND_URL).origin || !url.pathname.startsWith(prefix) || url.search || url.hash) return null;
      const filename = path.basename(url.pathname);
      if (!/^[0-9a-f-]{36}\.(jpg|png|gif|webp|pdf)$/i.test(filename)) return null;
      return mediaKey(projectId, room.isGroup ? "groups" : "direct", room.id, filename);
    } catch {
      return null;
    }
  }

  function parseFeatureFlag(val) {
    if (typeof val === "boolean") return val;
    if (val === "true") return true;
    if (val === "false") return false;
    return undefined;
  }

  function resolveChatCapabilities(body = {}, existingProject = null) {
    let allowGroup;
    if (body.allowGroupChat !== undefined) allowGroup = parseFeatureFlag(body.allowGroupChat);
    else if (body.groupChat !== undefined) allowGroup = parseFeatureFlag(body.groupChat);

    let allowDirect;
    if (body.allowDirectChat !== undefined) allowDirect = parseFeatureFlag(body.allowDirectChat);
    else if (body.allowIndividualChat !== undefined) allowDirect = parseFeatureFlag(body.allowIndividualChat);
    else if (body.individualChat !== undefined) allowDirect = parseFeatureFlag(body.individualChat);
    else if (body.allowOneToOneChat !== undefined) allowDirect = parseFeatureFlag(body.allowOneToOneChat);
    else if (body.directChat !== undefined) allowDirect = parseFeatureFlag(body.directChat);
    else if (body.oneToOneChat !== undefined) allowDirect = parseFeatureFlag(body.oneToOneChat);

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

    const subFeatures = body.subFeatures || (typeof body.plan === "object" ? body.plan?.subFeatures : null);
    if (subFeatures && typeof subFeatures === "object") {
      const chatSubs = subFeatures.CHAT || subFeatures.chat || subFeatures.Chat || [];
      if (Array.isArray(chatSubs)) {
        if (allowGroup === undefined && ["GROUP_CHAT", "group_chat", "Group Chat"].some((item) => chatSubs.includes(item))) allowGroup = true;
        if (allowDirect === undefined && ["INDIVIDUAL_CHAT", "individual_chat", "Individual Chat", "DIRECT_CHAT", "direct_chat", "ONE_TO_ONE_CHAT"].some((item) => chatSubs.includes(item))) allowDirect = true;
      }
    }

    const features = body.features || (typeof body.plan === "object" ? body.plan?.features : null);
    if (Array.isArray(features)) {
      if (allowGroup === undefined && ["GROUP_CHAT", "group_chat"].some((item) => features.includes(item))) allowGroup = true;
      if (allowDirect === undefined && ["INDIVIDUAL_CHAT", "individual_chat", "DIRECT_CHAT", "direct_chat"].some((item) => features.includes(item))) allowDirect = true;
    }

    if (allowGroup === undefined && existingProject?.allowGroupChat !== undefined) allowGroup = parseFeatureFlag(existingProject.allowGroupChat);
    if (allowDirect === undefined && existingProject?.allowDirectChat !== undefined) allowDirect = parseFeatureFlag(existingProject.allowDirectChat);
    const planName = typeof body.plan === "string" && body.plan.trim()
      ? body.plan.trim()
      : (existingProject?.plan || "custom");
    if (allowGroup === undefined) allowGroup = false;
    if (allowDirect === undefined) allowDirect = false;

    return { plan: planName, allowGroupChat: Boolean(allowGroup), allowDirectChat: Boolean(allowDirect) };
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
    if ((allowDirect === undefined || (allowDirect === false && allowGroup === false)) && reqOrSocket.allowDirectChat !== undefined) {
      allowDirect = parseFeatureFlag(reqOrSocket.allowDirectChat);
    }
    if ((allowGroup === undefined || (allowDirect === false && allowGroup === false)) && reqOrSocket.allowGroupChat !== undefined) {
      allowGroup = parseFeatureFlag(reqOrSocket.allowGroupChat);
    }
    return { allowDirectChat: Boolean(allowDirect), allowGroupChat: Boolean(allowGroup) };
  }

  function verifyEncryptionKey() {
    try {
      const probe = "chat-enc-selftest";
      if (decryptContent(encryptContent(probe)) !== probe) {
        console.error("[ENCRYPTION] Self-check FAILED: encrypt/decrypt round-trip mismatch. Messages may be unreadable.");
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
  }

  return {
    sendError,
    asyncHandler,
    generateApiKey,
    encryptContent,
    decryptContent,
    decryptMessage,
    serializeRoomForUser,
    profileAvatarUrl,
    normalizeLegacyMediaUrl,
    roomMediaStorageKey,
    parseFeatureFlag,
    resolveChatCapabilities,
    getProjectPermissions,
    verifyEncryptionKey,
  };
};
