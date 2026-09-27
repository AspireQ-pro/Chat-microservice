import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";
const API_BASE = `${API}/api`;
const PAGE_SIZE = 30;
const OUTBOX_KEY = "chat_outbox";

function authHeaders(getState) {
  const token = getState().auth.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// The chat backend keys users by the UUID inside the chat JWT.
function decodeChatUserId(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload?.userId || null;
  } catch {
    return null;
  }
}

function currentChatUserId(getState) {
  const t = getState().auth.token;
  return t ? decodeChatUserId(t) : null;
}

function loadOutbox() {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function persistOutbox(outbox) {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox || []));
  } catch {
    /* ignore */
  }
}

function normalizeMessage(m, currentUserId) {
  const mine = currentUserId != null && m.senderId === currentUserId;
  return {
    id: m.id,
    clientId: m.clientId || null,
    roomId: m.roomId,
    senderId: m.senderId,
    senderName: m.sender?.name || "",
    text: m.content || "",
    time: new Date(m.createdAt || Date.now()).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    createdAt: m.createdAt || new Date().toISOString(),
    mine,
    status: mine
      ? m.isRead
        ? "read"
        : m.deliveredAt
          ? "delivered"
          : "sent"
      : undefined,
  };
}

// ─── Thunks ─────────────────────────────────────────────────────────────────

export const fetchUsers = createAsyncThunk(
  "chat/fetchUsers",
  async ({ excludeId, q } = {}, { getState, rejectWithValue }) => {
    try {
      const params = new URLSearchParams();
      const me = excludeId || currentChatUserId(getState);
      if (me) params.set("excludeId", me);
      if (q) params.set("q", q);
      const res = await fetch(`${API_BASE}/users?${params}`, {
        headers: authHeaders(getState),
      });
      if (!res.ok) throw new Error("Failed to fetch users");
      return await res.json();
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

export const fetchMyRooms = createAsyncThunk(
  "chat/fetchMyRooms",
  async (_, { getState, rejectWithValue }) => {
    try {
      const me = currentChatUserId(getState);
      if (!me) return rejectWithValue("No chat user id");
      const res = await fetch(`${API_BASE}/users/${me}/rooms`, {
        headers: authHeaders(getState),
      });
      if (!res.ok) throw new Error("Failed to fetch rooms");
      return await res.json();
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

export const openDirectRoom = createAsyncThunk(
  "chat/openDirectRoom",
  async ({ userId2 }, { getState, rejectWithValue }) => {
    try {
      if (!userId2) return rejectWithValue("No target user");
      const res = await fetch(`${API_BASE}/rooms/direct`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(getState) },
        body: JSON.stringify({ userId2 }),
      });
      if (!res.ok) throw new Error("Failed to open direct room");
      return await res.json();
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

export const createGroup = createAsyncThunk(
  "chat/createGroup",
  async ({ name, memberIds }, { getState, rejectWithValue }) => {
    try {
      const creatorId = currentChatUserId(getState);
      if (!name || !memberIds?.length) return rejectWithValue("Name and members required");
      const res = await fetch(`${API_BASE}/rooms/group`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(getState) },
        body: JSON.stringify({ name, creatorId, memberIds }),
      });
      if (!res.ok) throw new Error("Failed to create group");
      return await res.json();
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

export const fetchMessages = createAsyncThunk(
  "chat/fetchMessages",
  async (roomId, { getState, rejectWithValue }) => {
    try {
      const res = await fetch(
        `${API_BASE}/rooms/${roomId}/messages?limit=${PAGE_SIZE}`,
        { headers: authHeaders(getState) },
      );
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = await res.json();
      return {
        roomId,
        messages: data.messages || [],
        hasMore: !!data.hasMore,
        nextBefore: data.nextBefore || null,
        currentUserId: currentChatUserId(getState),
      };
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

export const fetchOlderMessages = createAsyncThunk(
  "chat/fetchOlderMessages",
  async (roomId, { getState, rejectWithValue }) => {
    try {
      const before = getState().chat.pagination[roomId]?.nextBefore;
      if (!before) return { roomId, messages: [], hasMore: false, nextBefore: null };
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), before });
      const res = await fetch(`${API_BASE}/rooms/${roomId}/messages?${params}`, {
        headers: authHeaders(getState),
      });
      if (!res.ok) throw new Error("Failed to fetch older messages");
      const data = await res.json();
      return {
        roomId,
        messages: data.messages || [],
        hasMore: !!data.hasMore,
        nextBefore: data.nextBefore || null,
        currentUserId: currentChatUserId(getState),
      };
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

export const markMessagesRead = createAsyncThunk(
  "chat/markMessagesRead",
  async ({ roomId }, { getState }) => {
    try {
      await fetch(`${API_BASE}/messages/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(getState) },
        body: JSON.stringify({ roomId }),
      });
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
    return { roomId };
  },
);

const chatSlice = createSlice({
  name: "chat",
  initialState: {
    contacts: [],
    rooms: [],
    activeRoomId: null,
    messages: {},
    pagination: {},
    unreadCounts: {},
    outbox: loadOutbox(),
    lastSeen: {},
    loading: false,
    error: null,
    connected: false,
  },
  reducers: {
    setActiveRoom(state, { payload }) {
      state.activeRoomId = payload?.id ?? null;
      if (state.activeRoomId) state.unreadCounts[state.activeRoomId] = 0;
    },
    appendMessage(state, { payload }) {
      const { roomId, message } = payload;
      if (!roomId || !message) return;
      if (!state.messages[roomId]) state.messages[roomId] = [];
      state.messages[roomId].push({ ...message, status: message.status || "sending" });
    },
    queueOutbox(state, { payload }) {
      const { clientId, roomId, text } = payload;
      if (!clientId || !roomId) return;
      if (!state.outbox.some((o) => o.clientId === clientId)) {
        state.outbox.push({ clientId, roomId, text });
        persistOutbox(state.outbox);
      }
    },
    messageSaved(state, { payload }) {
      const { clientId, roomId } = payload;
      if (!clientId) return;
      const list = roomId ? state.messages[roomId] : null;
      const target = list?.find((m) => m.clientId === clientId);
      if (target) target.status = target.status === "read" ? "read" : "sent";
      state.outbox = state.outbox.filter((o) => o.clientId !== clientId);
      persistOutbox(state.outbox);
    },
    messageFailed(state, { payload }) {
      const { clientId } = payload;
      if (!clientId) return;
      let rid = null;
      let body = null;
      for (const [k, list] of Object.entries(state.messages)) {
        const m = list.find((x) => x.clientId === clientId);
        if (m) {
          m.status = "failed";
          rid = k;
          body = m.text;
          break;
        }
      }
      if (rid && !state.outbox.some((o) => o.clientId === clientId)) {
        state.outbox.push({ clientId, roomId: rid, text: body });
      }
      persistOutbox(state.outbox);
    },
    retryingMessage(state, { payload }) {
      const { clientId } = payload;
      for (const list of Object.values(state.messages)) {
        const m = list.find((x) => x.clientId === clientId);
        if (m) {
          m.status = "sending";
          break;
        }
      }
    },
    receiveMessage(state, { payload }) {
      const { roomId, message, currentUserId } = payload;
      const rid = roomId || message?.roomId;
      if (!rid || !message) return;
      const normalized = normalizeMessage(message, currentUserId);
      if (!state.messages[rid]) state.messages[rid] = [];
      const list = state.messages[rid];

      if (normalized.mine && normalized.clientId) {
        const optIdx = list.findIndex(
          (m) => m.clientId && m.clientId === normalized.clientId,
        );
        if (optIdx !== -1) {
          list[optIdx] = { ...normalized, status: normalized.status || "sent" };
          state.outbox = state.outbox.filter((o) => o.clientId !== normalized.clientId);
          persistOutbox(state.outbox);
          return;
        }
      }

      if (list.some((m) => m.id === normalized.id)) return;
      list.push(normalized);

      if (!normalized.mine && state.activeRoomId !== rid) {
        state.unreadCounts[rid] = (state.unreadCounts[rid] || 0) + 1;
      }
    },
    messagesDelivered(state, { payload }) {
      const { roomId } = payload;
      const list = state.messages[roomId];
      if (!list) return;
      list.forEach((m) => {
        if (m.mine && (m.status === "sending" || m.status === "sent")) {
          m.status = "delivered";
        }
      });
    },
    messagesRead(state, { payload }) {
      const { roomId } = payload;
      const list = state.messages[roomId];
      if (!list) return;
      list.forEach((m) => {
        if (m.mine) m.status = "read";
      });
    },
    roomUpdated(state, { payload }) {
      const { roomId, lastMessagePreview, lastMessageAt } = payload;
      const idx = state.rooms.findIndex((r) => r.id === roomId);
      if (idx !== -1) {
        const room = state.rooms[idx];
        room.lastMessagePreview = lastMessagePreview;
        room.lastMessageAt = lastMessageAt;
        state.rooms.splice(idx, 1);
        state.rooms.unshift(room);
      }
    },
    setConnected(state, { payload }) {
      state.connected = payload;
    },
    setOnlineUsers(state, { payload }) {
      const onlineIds = payload || [];
      state.contacts = state.contacts.map((c) => ({
        ...c,
        online: onlineIds.includes(c.id),
      }));
    },
    userOffline(state, { payload }) {
      const { userId, lastSeenAt } = payload || {};
      if (!userId) return;
      if (lastSeenAt) state.lastSeen[userId] = lastSeenAt;
      const c = state.contacts.find((x) => x.id === userId);
      if (c) {
        c.online = false;
        if (lastSeenAt) c.lastSeenAt = lastSeenAt;
      }
    },
    clearChat(state) {
      state.contacts = [];
      state.rooms = [];
      state.activeRoomId = null;
      state.messages = {};
      state.pagination = {};
      state.unreadCounts = {};
      state.outbox = [];
      persistOutbox([]);
      state.connected = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchUsers.fulfilled, (state, { payload }) => {
        state.loading = false;
        const list = Array.isArray(payload) ? payload : [];
        state.contacts = list.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role || "member",
          lastSeenAt: u.lastSeenAt,
          avatar: (u.name || "?")
            .split(" ")
            .map((w) => w[0])
            .join("")
            .toUpperCase()
            .slice(0, 2),
          online: false,
        }));
        list.forEach((u) => {
          if (u.lastSeenAt) state.lastSeen[u.id] = u.lastSeenAt;
        });
      })
      .addCase(fetchUsers.rejected, (state, { payload }) => {
        state.loading = false;
        state.error = payload;
      });

    builder.addCase(fetchMyRooms.fulfilled, (state, { payload }) => {
      state.rooms = (payload || []).slice().sort((a, b) => {
        const at = new Date(a.lastMessageAt || a.createdAt).getTime();
        const bt = new Date(b.lastMessageAt || b.createdAt).getTime();
        return bt - at;
      });
    });

    builder.addCase(openDirectRoom.fulfilled, (state, { payload }) => {
      state.activeRoomId = payload.id;
      if (!state.rooms.some((r) => r.id === payload.id)) state.rooms.unshift(payload);
    });

    builder.addCase(createGroup.fulfilled, (state, { payload }) => {
      state.activeRoomId = payload.id;
      if (!state.rooms.some((r) => r.id === payload.id)) state.rooms.unshift(payload);
    });

    builder.addCase(fetchMessages.fulfilled, (state, { payload }) => {
      const { roomId, messages, hasMore, nextBefore, currentUserId } = payload;
      state.messages[roomId] = messages.map((m) => normalizeMessage(m, currentUserId));
      state.pagination[roomId] = { hasMore, nextBefore, loadingOlder: false };
      state.unreadCounts[roomId] = 0;
    });

    builder
      .addCase(fetchOlderMessages.pending, (state, { meta }) => {
        const roomId = meta.arg;
        if (state.pagination[roomId]) state.pagination[roomId].loadingOlder = true;
      })
      .addCase(fetchOlderMessages.fulfilled, (state, { payload }) => {
        const { roomId, messages, hasMore, nextBefore, currentUserId } = payload;
        const older = messages.map((m) => normalizeMessage(m, currentUserId));
        const existing = state.messages[roomId] || [];
        const existingIds = new Set(existing.map((m) => m.id));
        state.messages[roomId] = [
          ...older.filter((m) => !existingIds.has(m.id)),
          ...existing,
        ];
        state.pagination[roomId] = { hasMore, nextBefore, loadingOlder: false };
      })
      .addCase(fetchOlderMessages.rejected, (state, { meta }) => {
        const roomId = meta.arg;
        if (state.pagination[roomId]) state.pagination[roomId].loadingOlder = false;
      });

    builder.addCase(markMessagesRead.fulfilled, (state, { payload }) => {
      const { roomId } = payload;
      state.unreadCounts[roomId] = 0;
    });
  },
});

export const {
  setActiveRoom,
  appendMessage,
  queueOutbox,
  messageSaved,
  messageFailed,
  retryingMessage,
  receiveMessage,
  messagesDelivered,
  messagesRead,
  roomUpdated,
  setConnected,
  setOnlineUsers,
  userOffline,
  clearChat,
} = chatSlice.actions;

export default chatSlice.reducer;
