import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000'

// ─── Async Thunks ─────────────────────────────────────────────────────────────

// Fetch all users except the current user → used to populate the contact list
export const fetchUsers = createAsyncThunk(
  'chat/fetchUsers',
  async (currentUserId, { rejectWithValue }) => {
    try {
      const res = await fetch(`${API}/users?excludeId=${currentUserId}`)
      if (!res.ok) throw new Error('Failed to fetch users')
      return await res.json()
    } catch (err) {
      return rejectWithValue(err.message)
    }
  }
)

// Fetch all rooms (existing chats/groups) that the current user belongs to
export const fetchMyRooms = createAsyncThunk(
  'chat/fetchMyRooms',
  async (userId, { rejectWithValue }) => {
    try {
      const res = await fetch(`${API}/users/${userId}/rooms`)
      if (!res.ok) throw new Error('Failed to fetch rooms')
      return await res.json()
    } catch (err) {
      return rejectWithValue(err.message)
    }
  }
)

// Get or create a 1-to-1 room between two users
export const openDirectRoom = createAsyncThunk(
  'chat/openDirectRoom',
  async ({ userId1, userId2 }, { rejectWithValue }) => {
    try {
      const res = await fetch(`${API}/rooms/direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId1, userId2 }),
      })
      if (!res.ok) throw new Error('Failed to open direct room')
      return await res.json()
    } catch (err) {
      return rejectWithValue(err.message)
    }
  }
)

// Create a group chat room
export const createGroup = createAsyncThunk(
  'chat/createGroup',
  async ({ name, creatorId, memberIds }, { rejectWithValue }) => {
    try {
      const res = await fetch(`${API}/rooms/group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, creatorId, memberIds }),
      })
      if (!res.ok) throw new Error('Failed to create group')
      return await res.json()
    } catch (err) {
      return rejectWithValue(err.message)
    }
  }
)

// Fetch chat history for a room
export const fetchMessages = createAsyncThunk(
  'chat/fetchMessages',
  async (roomId, { rejectWithValue }) => {
    try {
      const res = await fetch(`${API}/rooms/${roomId}/messages`)
      if (!res.ok) throw new Error('Failed to fetch messages')
      const msgs = await res.json()
      return { roomId, msgs }
    } catch (err) {
      return rejectWithValue(err.message)
    }
  }
)

// ─── Slice ────────────────────────────────────────────────────────────────────
const chatSlice = createSlice({
  name: 'chat',
  initialState: {
    // contacts = list of users fetched from /users
    contacts: [],
    // rooms = list of ChatRoom objects the current user is in
    rooms: [],
    // activeRoomId = currently open room id
    activeRoomId: null,
    // messages keyed by roomId: { [roomId]: [...] }
    messages: {},
    // loading / error
    loading: false,
    error: null,
    // socket connection flag
    connected: false,
  },
  reducers: {
    setActiveRoom(state, { payload }) {
      // payload = room object
      state.activeRoomId = payload?.id ?? null
    },
    // Called by the socket handler when a new message arrives
    receiveMessage(state, { payload }) {
      const { roomId, message } = payload
      if (!state.messages[roomId]) state.messages[roomId] = []
      // Avoid duplicate if we already added it optimistically
      const exists = state.messages[roomId].some((m) => m.id === message.id)
      if (!exists) state.messages[roomId].push(message)
    },
    // Optimistic local append when the current user sends a message
    appendMessage(state, { payload }) {
      const { roomId, message } = payload
      if (!state.messages[roomId]) state.messages[roomId] = []
      state.messages[roomId].push(message)
    },
    setConnected(state, { payload }) {
      state.connected = payload
    },
    // Update online flag on contacts from the list of online userIds
    setOnlineUsers(state, { payload: onlineIds }) {
      state.contacts = state.contacts.map((c) => ({
        ...c,
        online: onlineIds.includes(c.id),
      }))
    },
    clearChat(state) {
      state.contacts      = []
      state.rooms         = []
      state.activeRoomId  = null
      state.messages      = {}
      state.connected     = false
    },
  },
  extraReducers: (builder) => {
    // fetchUsers
    builder
      .addCase(fetchUsers.pending, (state) => { state.loading = true })
      .addCase(fetchUsers.fulfilled, (state, { payload }) => {
        state.loading  = false
        // Map backend user objects to the shape the UI expects
        state.contacts = payload.map((u) => ({
          id:     u.id,
          name:   u.name,
          email:  u.email,
          avatar: u.name
            .split(' ')
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2),
          role:   u.role || 'member',
          flat:   u.flat || '',
          online: false, // real presence would need socket events
        }))
      })
      .addCase(fetchUsers.rejected, (state, { payload }) => {
        state.loading = false
        state.error   = payload
      })

    // fetchMyRooms
    builder
      .addCase(fetchMyRooms.fulfilled, (state, { payload }) => {
        state.rooms = payload
      })

    // openDirectRoom — sets the active room
    builder
      .addCase(openDirectRoom.fulfilled, (state, { payload }) => {
        state.activeRoomId = payload.id
        // Add to rooms list if not already there
        const exists = state.rooms.some((r) => r.id === payload.id)
        if (!exists) state.rooms.unshift(payload)
      })

    // createGroup — sets the new group as active room
    builder
      .addCase(createGroup.fulfilled, (state, { payload }) => {
        state.activeRoomId = payload.id
        const exists = state.rooms.some((r) => r.id === payload.id)
        if (!exists) state.rooms.unshift(payload)
      })

    // fetchMessages
    builder
      .addCase(fetchMessages.fulfilled, (state, { payload }) => {
        const { roomId, msgs } = payload
        // Normalise to the shape MessageBubble expects
        state.messages[roomId] = msgs.map((m) => ({
          id:       m.id,
          senderId: m.senderId,
          text:     m.content || '',
          fileUrl:  m.fileUrl  || null,
          fileType: m.fileType || null,
          time:     new Date(m.createdAt).toLocaleTimeString([], {
            hour:   '2-digit',
            minute: '2-digit',
          }),
          // "mine" is resolved in the component using currentUser.id
          mine: false,
        }))
      })
  },
})

export const {
  setActiveRoom,
  receiveMessage,
  appendMessage,
  setConnected,
  setOnlineUsers,
  clearChat,
} = chatSlice.actions

export default chatSlice.reducer
