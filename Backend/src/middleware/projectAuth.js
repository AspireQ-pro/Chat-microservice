module.exports = function createProjectAuth({ prisma, jwt, config, resolveChatCapabilities, generateApiKey }) {
  const { CHAT_JWT_SECRET } = config;

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
      if (apiKey) project = await prisma.project.findUnique({ where: { apiKey } });

      if (!project && societyId) {
        const societyStr = String(societyId).trim();
        const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(societyStr);
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

        if (!project) {
          const capabilities = resolveChatCapabilities(req.body);
          const projectName = req.body?.societyName || req.body?.name || `Society ${societyStr}`;
          project = await prisma.project.create({
            data: {
              name: projectName,
              apiKey: generateApiKey(),
              plan: capabilities.plan || "custom",
              allowGroupChat: capabilities.allowGroupChat ?? true,
              allowDirectChat: capabilities.allowDirectChat ?? true,
            },
          });
          console.log(`[resolveProject] Auto-created project "${project.name}" (${project.id}) for societyId=${societyStr}`);
        }
      }

      if (!project) return res.status(401).json({ error: "Invalid API key or society ID" });
      if (!project.isActive) return res.status(403).json({ error: "Project is deactivated" });
      req.project = project;
      next();
    } catch (err) {
      console.error("resolveProject error", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  function authenticateChatJWT(req, res, next) {
    const header = req.headers["authorization"];
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization header required (Bearer <token>)" });
    }
    try {
      const payload = jwt.verify(header.slice(7), CHAT_JWT_SECRET);
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

  return { resolveProject, authenticateChatJWT };
};
