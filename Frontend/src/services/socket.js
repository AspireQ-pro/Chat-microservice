import { io } from 'socket.io-client'

let socket = null

export function connectSocket(token) {
  if (socket?.connected) return socket
  if (socket) {
    // Token may have changed — tear down the old connection first.
    socket.disconnect()
    socket = null
  }

  socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
    autoConnect: true,
    auth: { token },
    // Automatic reconnection so dropped connections recover on their own.
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  })

  socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err.message)
  })

  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

export default function getSocket() {
  return socket
}
