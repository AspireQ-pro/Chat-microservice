// New media is grouped consistently under each society. S3 prefixes are for
// organization and lifecycle policies; delivery speed comes from caching/CDN.
function mediaKey(projectId, category, ownerId, filename) {
  const base = `societies/${projectId}/media`;
  if (category === "users/profile") {
    return `${base}/profiles/${ownerId}/${filename}`;
  }
  if (category === "groups/avatars") {
    // Avatars are uploaded before group creation, so no room ID exists yet.
    return `${base}/group-avatars/${ownerId}/${filename}`;
  }
  if (category === "groups" || category === "direct") {
    return `${base}/chats/${category}/${ownerId}/attachments/${filename}`;
  }
  throw new Error(`Unsupported media category: ${category}`);
}

// Keep this for records created before the media prefix was standardized.
function legacyMediaKey(projectId, category, ownerId, filename) {
  return `societies/${projectId}/${category}/${ownerId}/${filename}`;
}

module.exports = { mediaKey, legacyMediaKey };
