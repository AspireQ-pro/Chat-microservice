const { RBAC_BACKEND_URL } = require("../config/runtime");

/**
 * Dispatches push notifications to offline/background room members
 * via the Society Management backend bridge.
 */
async function dispatchChatPushNotification({
  senderUserId,
  senderName,
  recipientUserIds,
  message,
  roomId,
  roomName,
  isGroup,
}) {
  if (!recipientUserIds || !recipientUserIds.length) return;

  const baseUrl = (RBAC_BACKEND_URL || "http://3.110.56.109:8080").replace(/\/$/, "");
  const url = `${baseUrl}/api/v1/chat/notifications/push`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        senderUserId,
        senderName,
        recipientUserIds,
        message,
        roomId,
        roomName,
        isGroup,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.warn(`[pushNotificationService] Push request to ${url} returned HTTP ${res.status}`);
    }
  } catch (err) {
    console.error(`[pushNotificationService] Failed to dispatch chat push:`, err.message);
  }
}

module.exports = { dispatchChatPushNotification };
