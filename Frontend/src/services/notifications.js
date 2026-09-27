const NOTIFICATION_EVENT = "chat:notification-count";

function getParentOrigin() {
  const configuredOrigin = import.meta.env.VITE_SOCIETY_ORIGIN;
  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).origin;
    } catch {
      console.warn(
        "Invalid VITE_SOCIETY_ORIGIN; using the chat referrer origin.",
      );
    }
  }

  try {
    return document.referrer ? new URL(document.referrer).origin : "*";
  } catch {
    return "*";
  }
}

export function publishChatNotificationSummary(summary = {}) {
  if (typeof window === "undefined") return;

  const notification = {
    source: "chat-microservice",
    type: NOTIFICATION_EVENT,
    unreadMessages: Number(summary.unreadMessages) || 0,
    pendingRequests: Number(summary.pendingRequests) || 0,
    total: Number(summary.total) || 0,
  };

  window.dispatchEvent(
    new CustomEvent(NOTIFICATION_EVENT, { detail: notification }),
  );

  const targetOrigin = getParentOrigin();
  const targets = new Set();
  if (window.opener && !window.opener.closed) targets.add(window.opener);
  if (window.parent && window.parent !== window) targets.add(window.parent);

  for (const target of targets) {
    try {
      target.postMessage(notification, targetOrigin);
    } catch (err) {
      console.warn(
        "Unable to send chat notification count to parent app.",
        err,
      );
    }
  }
}
