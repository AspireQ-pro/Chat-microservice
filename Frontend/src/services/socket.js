import { io } from 'socket.io-client'

// Singleton socket — shared across the whole Chat app.
const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
  autoConnect: true,
})

export default socket
