import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000'

// ─── Async Thunks ─────────────────────────────────────────────────────────────

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
    contacts:      [],
    rooms:         [],
    activeRoomId:  null,
    messages:      {},
    loading:       false,
    error:         null,
    connected:     false,
  },
  reducers: {
    setActiveRoom(state, { payload }) {
      state.activeRoomId = payload?.id ?? null
    },
    receiveMessage(state, { payload }) {
      const { roomId, message } = payload
      if (!state.messages[roomId]) state.messages[roomId] = []
      const exists = state.messages[roomId].some((m) => m.id === message.id)
      if (!exists) state.messages[roomId].push(message)
    },
    appendMessage(state, { payload }) {
      const { roomId, message } = payload
      if (!state.messages[roomId]) state.messages[roomId] = []
      state.messages[roomId].push(message)
    },
    setConnected(state, { payload }) {
      state.connected = payload
    },
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
    builder
      .addCase(fetchUsers.pending,   (state) => { state.loading = true })
      .addCase(fetchUsers.fulfilled, (state, { payload }) => {
        state.loading  = false
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
          role:   u.role   || 'member',
          flat:   u.flat   || '',
          online: false,
        }))
      })
      .addCase(fetchUsers.rejected,  (state, { payload }) => {
        state.loading = false
        state.error   = payload
      })

    builder.addCase(fetchMyRooms.fulfilled, (state, { payload }) => {
      state.rooms = payload
    })

    builder.addCase(openDirectRoom.fulfilled, (state, { payload }) => {
      state.activeRoomId = payload.id
      const exists = state.rooms.some((r) => r.id === payload.id)
      if (!exists) state.rooms.unshift(payload)
    })

    builder.addCase(createGroup.fulfilled, (state, { payload }) => {
      state.activeRoomId = payload.id
      const exists = state.rooms.some((r) => r.id === payload.id)
      if (!exists) state.rooms.unshift(payload)
    })

    builder.addCase(fetchMessages.fulfilled, (state, { payload }) => {
      const { roomId, msgs } = payload
      state.messages[roomId] = msgs.map((m) => ({
        id:         m.id,
        senderId:   m.senderId,
        senderName: m.sender?.name || '',
        text:       m.content  || '',
        fileUrl:    m.fileUrl  || null,
        fileType:   m.fileType || null,
        time:       new Date(m.createdAt).toLocaleTimeString([], {
          hour: '2-digit', minute: '2-digit',
        }),
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
