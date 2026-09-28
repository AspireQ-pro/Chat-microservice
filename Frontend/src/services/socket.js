import { io } from 'socket.io-client'

let socket = null
let socketToken = null

export function connectSocket(token) {
  const socketUrl =
    import.meta.env.VITE_SOCKET_URL ||
    (import.meta.env.DEV ? "http://localhost:5000" : "");
  if (!socketUrl) {
    console.error("VITE_SOCKET_URL must be configured for the Chat frontend");
    return null;
  }
  if (socket?.connected && socketToken === token) return socket
  if (socket) {
    // Token may have changed — tear down the old connection first.
    socket.disconnect()
    socket = null
  }
  socketToken = token

  socket = io(socketUrl, {
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
    socketToken = null
  }
}

export default function getSocket() {
  return socket
}
