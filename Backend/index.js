const config = require("./src/config/runtime");
const createApp = require("./src/app/createApp");
const mediaStorage = require("./src/media/storage");
const { mediaKey, legacyMediaKey } = require("./src/media/keys");
const { parseMediaUpload } = require("./src/media/uploadMiddleware");
const createChatCore = require("./src/services/chatCore");
const createProjectAuth = require("./src/middleware/projectAuth");
const createMediaUploadService = require("./src/media/uploadService");
const registerRoutes = require("./src/routes");
const registerChatSocket = require("./src/socket/registerChatSocket");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const path = require("path");

const { app, server, prisma, io } = createApp(config);
const chatCore = createChatCore({ prisma, config, mediaKey });
const projectAuth = createProjectAuth({
  prisma,
  jwt,
  config,
  resolveChatCapabilities: chatCore.resolveChatCapabilities,
  generateApiKey: chatCore.generateApiKey,
});
const mediaUpload = createMediaUploadService({
  prisma,
  jwt,
  config,
  mediaStorage,
  mediaKey,
  parseMediaUpload,
  getProjectPermissions: chatCore.getProjectPermissions,
  sendError: chatCore.sendError,
});

registerRoutes({
  app,
  prisma,
  ...config,
  ...mediaUpload,
  ...chatCore,
  ...projectAuth,
  mediaStorage,
  mediaKey,
  legacyMediaKey,
  jwt,
  crypto,
  path,
  io,
});
registerChatSocket({
  io,
  prisma,
  jwt,
  CHAT_JWT_SECRET: config.CHAT_JWT_SECRET,
  resolveChatCapabilities: chatCore.resolveChatCapabilities,
  getProjectPermissions: chatCore.getProjectPermissions,
  mediaStorage,
  roomMediaStorageKey: chatCore.roomMediaStorageKey,
  decryptMessage: chatCore.decryptMessage,
  encryptContent: chatCore.encryptContent,
  serializeRoomForUser: chatCore.serializeRoomForUser,
  sendError: chatCore.sendError,
});

const { PORT, KEEP_ALIVE_TIMEOUT_MS, HEADERS_TIMEOUT_MS } = config;
server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
server.headersTimeout = HEADERS_TIMEOUT_MS;

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

chatCore.verifyEncryptionKey();
if (process.env.NODE_ENV !== "test") {
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
