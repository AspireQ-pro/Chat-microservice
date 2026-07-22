import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000'

function authHeaders(getState) {
  const token = getState().auth.token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const fetchUsers = createAsyncThunk(
  'chat/fetchUsers',
  async ({ excludeId, q }, { getState, rejectWithValue }) => {
    try {
      const params = new URLSearchParams()
      if (excludeId) params.set('excludeId', excludeId)
      if (q) params.set('q', q)
      const res = await fetch(`${API}/users?${params}`, { headers: authHeaders(getState) })
      if (!res.ok) throw new Error('Failed to fetch users')
      return await res.json()
    } catch (err) {
      return rejectWithValue(err.message)
    }
  }
)

export const fetchMyRooms = createAsyncThunk(
  'chat/fetchMyRooms',
  async (userId, { getState, rejectWithValue }) => {
    try {
      const res = await fetch(`${API}/users/${userId}/rooms`, { headers: authHeaders(getState) })
      if (!res.ok) throw new Error('Failed to fetch rooms')
      return await res.json()
    } catch (err) {
      return rejectWithValue(err.message)
    }
  }
)

export const openDirectRoom = createAsyncThunk(
  'chat/openDirectRoom',
  async ({ userId1, userId2 }, { getState, rejectWithValue }) => {
    try {
      const res = await fetch(`${API}/rooms/direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(getState) },
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
  async ({ name, creatorId, memberIds }, { getState, rejectWithValue }) => {
    try {
      const res = await fetch(`${API}/rooms/group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(getState) },
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
  async (roomId, { getState, rejectWithValue }) => {
    try {
      const res = await fetch(`${API}/rooms/${roomId}/messages`, { headers: authHeaders(getState) })
      if (!res.ok) throw new Error('Failed to fetch messages')
      const msgs = await res.json()
      return { roomId, msgs }
    } catch (err) {
      return rejectWithValue(err.message)
    }
  }
)

export const markMessagesRead = createAsyncThunk(
  'chat/markMessagesRead',
  async ({ roomId, userId }, { getState }) => {
    try {
      await fetch(`${API}/messages/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(getState) },
        body: JSON.stringify({ roomId, userId }),
      })
    } catch (err) {
      console.error('Failed to mark as read:', err)
    }
  }
)

const chatSlice = createSlice({
  name: 'chat',
  initialState: {
    contacts: [],
    rooms: [],
    activeRoomId: null,
    messages: {},
    unreadCounts: {},
    loading: false,
    error: null,
    connected: false,
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

      // Increment unread if not active room
      if (state.activeRoomId !== roomId) {
        state.unreadCounts[roomId] = (state.unreadCounts[roomId] || 0) + 1
      }

      // Update room preview and move to top
      const roomIndex = state.rooms.findIndex((r) => r.id === roomId)
      if (roomIndex !== -1) {
        const room = state.rooms[roomIndex]
        room.lastMessagePreview = message.fileUrl
          ? (message.fileType === 'image' ? '📷 Photo' : '📎 File')
          : (message.text || '')
        room.lastMessageAt = new Date().toISOString()
        // Move to top
        state.rooms.splice(roomIndex, 1)
        state.rooms.unshift(room)
      }
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
    updateUserLastSeen(state, { payload: { userId, lastSeenAt } }) {
      const contact = state.contacts.find((c) => c.id === userId)
      if (contact) contact.lastSeenAt = lastSeenAt
    },
    clearChat(state) {
      state.contacts = []
      state.rooms = []
      state.activeRoomId = null
      state.messages = {}
      state.connected = false
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => { state.loading = true })
      .addCase(fetchUsers.fulfilled, (state, { payload }) => {
        state.loading = false
        state.contacts = payload.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          lastSeenAt: u.lastSeenAt,
          avatar: u.name
            .split(' ')
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2),
          online: false,
        }))
      })
      .addCase(fetchUsers.rejected, (state, { payload }) => {
        state.loading = false
        state.error = payload
      })

    builder.addCase(fetchMyRooms.fulfilled, (state, { payload }) => {
      state.rooms = payload.sort((a, b) => {
        const aTime = a.lastMessageAt || a.createdAt
        const bTime = b.lastMessageAt || b.createdAt
        return new Date(bTime) - new Date(aTime)
      })
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
        id: m.id,
        senderId: m.senderId,
        senderName: m.sender?.name || '',
        text: m.content || '',
        fileUrl: m.fileUrl || null,
        fileType: m.fileType || null,
        messageType: m.messageType || 'text',
        isRead: m.isRead || false,
        readAt: m.readAt || null,
        time: new Date(m.createdAt).toLocaleTimeString([], {
          hour: '2-digit', minute: '2-digit',
        }),
        mine: false,
      }))
    })

    builder.addCase(markMessagesRead.fulfilled, (state, { meta }) => {
      const { roomId } = meta.arg
      const msgs = state.messages[roomId]
      if (msgs) {
        msgs.forEach((m) => {
          if (!m.mine) { m.isRead = true; m.readAt = new Date().toISOString() }
        })
      }
      state.unreadCounts[roomId] = 0
    })
  },
})

export const {
  setActiveRoom,
  receiveMessage,
  appendMessage,
  setConnected,
  setOnlineUsers,
  updateUserLastSeen,
  clearChat,
} = chatSlice.actions

export default chatSlice.reducer
