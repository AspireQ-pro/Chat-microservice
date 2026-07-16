import { useEffect, useRef, useState, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useTheme, useMediaQuery } from '@mui/material'
import socket from '@/services/socket'
import {
  setActiveRoom,
  receiveMessage,
  appendMessage,
  setConnected,
  setOnlineUsers,
  fetchUsers,
  fetchMyRooms,
  openDirectRoom,
  fetchMessages,
  createGroup,
} from '@pages/Dashboard/Chat/provider/chatSlice'

// ─── Role label color map ─────────────────────────────────────────────────────
export const ROLE_COLOR = {
  member:   { bgcolor: '#e3f2fd', color: '#1565c0' },
  security: { bgcolor: '#fce4ec', color: '#c62828' },
  admin:    { bgcolor: '#e8f5e9', color: '#2e7d32' },
}

// ─── Main chat logic hook ─────────────────────────────────────────────────────
export function useChatHandler() {
  const dispatch   = useDispatch()
  const theme      = useTheme()
  const isMobile   = useMediaQuery(theme.breakpoints.down('md'))

  // ── Selectors ──
  const currentUser   = useSelector((s) => s.auth.user)
  const activeRoomId  = useSelector((s) => s.chat.activeRoomId)
  const allMessages   = useSelector((s) => s.chat.messages)
  const contacts      = useSelector((s) => s.chat.contacts)
  const rooms         = useSelector((s) => s.chat.rooms)

  // ── Local UI state ──
  const [input,        setInput]        = useState('')
  const [search,       setSearch]       = useState('')
  const [showPanel,    setShowPanel]    = useState(true)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading,    setUploading]    = useState(false)

  // ── Group creation dialog state ──
  const [groupDialogOpen,  setGroupDialogOpen]  = useState(false)
  const [groupName,        setGroupName]        = useState('')
  const [groupMemberIds,   setGroupMemberIds]   = useState([])
  const [groupCreating,    setGroupCreating]    = useState(false)
  const [groupError,       setGroupError]       = useState('')

  const messagesEndRef = useRef(null)
  const fileInputRef   = useRef(null)

  // ── Derived ──
  const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? null

  // Build the active contact info from the room + contacts list
  const activeContact = (() => {
    if (!activeRoom) return null
    if (activeRoom.isGroup) {
      return {
        id:     activeRoom.id,
        name:   activeRoom.name,
        avatar: activeRoom.name?.slice(0, 2).toUpperCase() || 'GR',
        role:   'member',
        flat:   '',
        online: false,
        isGroup: true,
      }
    }
    const partnerMember = activeRoom.members?.find(
      (m) => m.userId !== currentUser?.id
    )
    const partner = contacts.find((c) => c.id === partnerMember?.userId)
    return partner ?? null
  })()

  // Normalise messages for the active room, resolving `mine` per current user
  const rawMessages = activeRoomId ? (allMessages[activeRoomId] || []) : []
  const messages = rawMessages.map((m) => ({
    ...m,
    mine: m.senderId === currentUser?.id,
  }))

  // Filter contacts by search term
  const filteredContacts = contacts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.role || '').toLowerCase().includes(search.toLowerCase())
  )

  // ── Bootstrap: load users + rooms on mount ──
  useEffect(() => {
    if (!currentUser?.id) return
    dispatch(fetchUsers(currentUser.id))
    dispatch(fetchMyRooms(currentUser.id))
  }, [dispatch, currentUser?.id])

  // ── Socket lifecycle ──
  useEffect(() => {
    const handleConnect = () => {
      dispatch(setConnected(true))
      // Tell the server who we are so presence tracking works
      if (currentUser?.id) socket.emit('user_online', currentUser.id)
    }
    const handleDisconnect = () => dispatch(setConnected(false))
    const handleOnlineUsers = (onlineIds) => dispatch(setOnlineUsers(onlineIds))

    socket.on('connect',      handleConnect)
    socket.on('disconnect',   handleDisconnect)
    socket.on('online_users', handleOnlineUsers)

    // If already connected when this effect runs, announce immediately
    if (socket.connected && currentUser?.id) {
      dispatch(setConnected(true))
      socket.emit('user_online', currentUser.id)
    }

    return () => {
      socket.off('connect',      handleConnect)
      socket.off('disconnect',   handleDisconnect)
      socket.off('online_users', handleOnlineUsers)
    }
  }, [dispatch, currentUser?.id])

  // ── Join room + listen for messages when active room changes ──
  useEffect(() => {
    if (!activeRoomId) return

    // Join the socket room
    socket.emit('join_room', activeRoomId)

    // Load chat history
    dispatch(fetchMessages(activeRoomId))

    // Listen for incoming messages
    const handleNewMessage = (message) => {
      if (message.roomId === activeRoomId) {
        dispatch(receiveMessage({ roomId: activeRoomId, message: {
          id:       message.id,
          senderId: message.senderId,
          text:     message.content || '',
          fileUrl:  message.fileUrl  || null,
          fileType: message.fileType || null,
          time:     new Date(message.createdAt).toLocaleTimeString([], {
            hour: '2-digit', minute: '2-digit',
          }),
          mine: false, // resolved in the messages selector above
        }}))
      }
    }

    socket.on('new_message', handleNewMessage)

    return () => {
      socket.off('new_message', handleNewMessage)
    }
  }, [dispatch, activeRoomId])

  // ── Auto-scroll to latest message ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send a message ──
  const handleSend = useCallback(async () => {
    if (!input.trim() && !selectedFile) return
    if (!activeRoomId || !currentUser?.id) return

    let fileUrl  = null
    let fileType = null

    // Upload the file first if one is selected
    if (selectedFile) {
      setUploading(true)
      try {
        const formData = new FormData()
        formData.append('file', selectedFile)
        const res  = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/upload`, {
          method: 'POST',
          body: formData,
        })
        const data = await res.json()
        fileUrl  = data.fileUrl
        fileType = data.fileType
      } catch (err) {
        console.error('Upload failed:', err)
        setUploading(false)
        return
      }
      setUploading(false)
    }

    // Optimistic append so the sender sees it immediately
    const optimistic = {
      id:       `optimistic-${Date.now()}`,
      senderId: currentUser.id,
      text:     input.trim(),
      fileUrl,
      fileType,
      time:     new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mine:     true,
    }
    dispatch(appendMessage({ roomId: activeRoomId, message: optimistic }))

    // Emit to backend
    socket.emit('send_message', {
      roomId:   activeRoomId,
      senderId: currentUser.id,
      content:  input.trim() || null,
      fileUrl,
      fileType,
    })

    setInput('')
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [dispatch, input, selectedFile, activeRoomId, currentUser?.id])

  const handleFileChange = useCallback((e) => {
    setSelectedFile(e.target.files[0] || null)
  }, [])

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Select a contact → open / create a direct room ──
  const handleSelectContact = useCallback(async (contactId) => {
    if (!currentUser?.id) return
    await dispatch(openDirectRoom({ userId1: currentUser.id, userId2: contactId }))
    if (isMobile) setShowPanel(false)
  }, [dispatch, currentUser?.id, isMobile])

  // ── Select an existing room directly (e.g. from the rooms list) ──
  const handleSelectRoom = useCallback((room) => {
    dispatch(setActiveRoom(room))
    if (isMobile) setShowPanel(false)
  }, [dispatch, isMobile])

  // ── Get preview of last message for a contact/room ──
  const getLastMessage = useCallback((contactId) => {
    // Try finding a direct room with this contact
    const room = rooms.find(
      (r) => !r.isGroup &&
        r.members?.some((m) => m.userId === contactId) &&
        r.members?.some((m) => m.userId === currentUser?.id)
    )
    if (!room) return null
    const msgs = allMessages[room.id]
    if (!msgs || msgs.length === 0) return null
    return msgs[msgs.length - 1].text
  }, [rooms, allMessages, currentUser?.id])

  // ── Group dialog helpers ──
  const openGroupDialog = useCallback(() => {
    setGroupName('')
    setGroupMemberIds([])
    setGroupError('')
    setGroupDialogOpen(true)
  }, [])

  const closeGroupDialog = useCallback(() => {
    setGroupDialogOpen(false)
    setGroupName('')
    setGroupMemberIds([])
    setGroupError('')
  }, [])

  const toggleGroupMember = useCallback((id) => {
    setGroupMemberIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    )
  }, [])

  const handleCreateGroup = useCallback(async () => {
    if (!groupName.trim()) {
      setGroupError('Group name is required.')
      return
    }
    if (groupMemberIds.length === 0) {
      setGroupError('Select at least one member.')
      return
    }
    setGroupCreating(true)
    setGroupError('')
    try {
      await dispatch(createGroup({
        name:      groupName.trim(),
        creatorId: currentUser.id,
        memberIds: groupMemberIds,
      }))
      closeGroupDialog()
      if (isMobile) setShowPanel(false)
    } catch {
      setGroupError('Failed to create group. Try again.')
    } finally {
      setGroupCreating(false)
    }
  }, [dispatch, groupName, groupMemberIds, currentUser?.id, closeGroupDialog, isMobile])

  return {
    // state
    input,
    search,
    showPanel,
    isMobile,
    activeRoom,
    activeContact,
    activeRoomId,
    messages,
    contacts,
    rooms,
    filteredContacts,
    messagesEndRef,
    currentUser,
    selectedFile,
    fileInputRef,
    uploading,
    // group dialog
    groupDialogOpen,
    groupName,
    groupMemberIds,
    groupCreating,
    groupError,
    // setters
    setInput,
    setSearch,
    setShowPanel,
    setGroupName,
    // handlers
    handleSend,
    handleKeyDown,
    handleSelectContact,
    handleSelectRoom,
    getLastMessage,
    handleFileChange,
    handleRemoveFile,
    openGroupDialog,
    closeGroupDialog,
    toggleGroupMember,
    handleCreateGroup,
  }
}
