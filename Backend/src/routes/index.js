const registerProjectRoutes = require('./projectRoutes');
const registerDirectRoutes = require('./directRoutes');
const registerAvatarRoutes = require('./avatarRoutes');
const registerGroupRoutes = require('./groupRoutes');
const registerMediaRoutes = require('./mediaRoutes');
const registerMessageRoutes = require('./messageRoutes');

module.exports = function registerRoutes(context) {
  registerProjectRoutes(context);
  registerDirectRoutes(context);
  registerAvatarRoutes(context);
  registerGroupRoutes(context);
  registerMediaRoutes(context);
  registerMessageRoutes(context);
};