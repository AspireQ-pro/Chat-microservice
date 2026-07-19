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
} from '@/provider/chatSlice'

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000'

// ─── Role label color map ─────────────────────────────────────────────────────
export const ROLE_COLOR = {
  member:   { bgcolor: '#e3f2fd', color: '#1565c0' },
  security: { bgcolor: '#fce4ec', color: '#c62828' },
  admin:    { bgcolor: '#e8f5e9', color: '#2e7d32' },
}

// ─── Main chat logic hook ─────────────────────────────────────────────────────
export function useChatHandler() {
  const dispatch  = useDispatch()
  const theme     = useTheme()
  const isMobile  = useMediaQuery(theme.breakpoints.down('md'))

  const currentUser  = useSelector((s) => s.auth.user)
  const activeRoomId = useSelector((s) => s.chat.activeRoomId)
  const allMessages  = useSelector((s) => s.chat.messages)
  const contacts     = useSelector((s) => s.chat.contacts)
  const rooms        = useSelector((s) => s.chat.rooms)

  const [input,        setInput]        = useState('')
  const [search,       setSearch]       = useState('')
  const [showPanel,    setShowPanel]    = useState(true)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading,    setUploading]    = useState(false)

  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [groupName,       setGroupName]       = useState('')
  const [groupMemberIds,  setGroupMemberIds]  = useState([])
  const [groupCreating,   setGroupCreating]   = useState(false)
  const [groupError,      setGroupError]      = useState('')

  const messagesEndRef = useRef(null)
  const fileInputRef   = useRef(null)

  const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? null

  const activeContact = (() => {
    if (!activeRoom) return null
    if (activeRoom.isGroup) {
      return {
        id:      activeRoom.id,
        name:    activeRoom.name,
        avatar:  activeRoom.name?.slice(0, 2).toUpperCase() || 'GR',
        role:    'member',
        flat:    '',
        online:  false,
        isGroup: true,
      }
    }
    const partnerMember = activeRoom.members?.find(
      (m) => m.userId !== currentUser?.id
    )
    const partner = contacts.find((c) => c.id === partnerMember?.userId)
    return partner ?? null
  })()

  const rawMessages = activeRoomId ? (allMessages[activeRoomId] || []) : []
  const messages = rawMessages.map((m) => ({
    ...m,
    mine: m.senderId === currentUser?.id,
  }))

  const filteredContacts = contacts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.role || '').toLowerCase().includes(search.toLowerCase())
  )

  // Bootstrap: load users + rooms once the user is known
  useEffect(() => {
    if (!currentUser?.id) return
    dispatch(fetchUsers(currentUser.id))
    dispatch(fetchMyRooms(currentUser.id))
  }, [dispatch, currentUser?.id])

  // Socket lifecycle
  useEffect(() => {
    const onConnect    = () => {
      dispatch(setConnected(true))
      if (currentUser?.id) socket.emit('user_online', currentUser.id)
    }
    const onDisconnect = () => dispatch(setConnected(false))
    const onOnline     = (ids) => dispatch(setOnlineUsers(ids))

    socket.on('connect',      onConnect)
    socket.on('disconnect',   onDisconnect)
    socket.on('online_users', onOnline)

    if (socket.connected && currentUser?.id) {
      dispatch(setConnected(true))
      socket.emit('user_online', currentUser.id)
    }

    return () => {
      socket.off('connect',      onConnect)
      socket.off('disconnect',   onDisconnect)
      socket.off('online_users', onOnline)
    }
  }, [dispatch, currentUser?.id])

  // Join room + fetch history when active room changes
  useEffect(() => {
    if (!activeRoomId) return
    socket.emit('join_room', activeRoomId)
    dispatch(fetchMessages(activeRoomId))

    const onNewMessage = (message) => {
      if (message.roomId === activeRoomId) {
        dispatch(receiveMessage({
          roomId: activeRoomId,
          message: {
            id:         message.id,
            senderId:   message.senderId,
            senderName: message.sender?.name || '',
            text:       message.content  || '',
            fileUrl:    message.fileUrl  || null,
            fileType:   message.fileType || null,
            time:       new Date(message.createdAt).toLocaleTimeString([], {
              hour: '2-digit', minute: '2-digit',
            }),
            mine: false,
          },
        }))
      }
    }

    socket.on('new_message', onNewMessage)
    return () => socket.off('new_message', onNewMessage)
  }, [dispatch, activeRoomId])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(async () => {
    if (!input.trim() && !selectedFile) return
    if (!activeRoomId || !currentUser?.id) return

    let fileUrl  = null
    let fileType = null

    if (selectedFile) {
      setUploading(true)
      try {
        const form = new FormData()
        form.append('file', selectedFile)
        const res  = await fetch(`${API}/upload`, { method: 'POST', body: form })
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

  const handleFileChange  = useCallback((e) => setSelectedFile(e.target.files[0] || null), [])
  const handleRemoveFile  = useCallback(() => {
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])
  const handleKeyDown     = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleSelectContact = useCallback(async (contactId) => {
    if (!currentUser?.id) return
    await dispatch(openDirectRoom({ userId1: currentUser.id, userId2: contactId }))
    if (isMobile) setShowPanel(false)
  }, [dispatch, currentUser?.id, isMobile])

  const handleSelectRoom = useCallback((room) => {
    dispatch(setActiveRoom(room))
    if (isMobile) setShowPanel(false)
  }, [dispatch, isMobile])

  const getLastMessage = useCallback((contactId) => {
    const room = rooms.find(
      (r) => !r.isGroup &&
        r.members?.some((m) => m.userId === contactId) &&
        r.members?.some((m) => m.userId === currentUser?.id)
    )
    if (!room) return null
    const msgs = allMessages[room.id]
    return msgs?.length ? msgs[msgs.length - 1].text : null
  }, [rooms, allMessages, currentUser?.id])

  const openGroupDialog = useCallback(() => {
    setGroupName(''); setGroupMemberIds([]); setGroupError(''); setGroupDialogOpen(true)
  }, [])
  const closeGroupDialog = useCallback(() => {
    setGroupDialogOpen(false); setGroupName(''); setGroupMemberIds([]); setGroupError('')
  }, [])
  const toggleGroupMember = useCallback((id) => {
    setGroupMemberIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    )
  }, [])
  const handleCreateGroup = useCallback(async () => {
    if (!groupName.trim()) { setGroupError('Group name is required.'); return }
    if (groupMemberIds.length === 0) { setGroupError('Select at least one member.'); return }
    setGroupCreating(true); setGroupError('')
    try {
      await dispatch(createGroup({ name: groupName.trim(), creatorId: currentUser.id, memberIds: groupMemberIds }))
      closeGroupDialog()
      if (isMobile) setShowPanel(false)
    } catch {
      setGroupError('Failed to create group. Try again.')
    } finally {
      setGroupCreating(false)
    }
  }, [dispatch, groupName, groupMemberIds, currentUser?.id, closeGroupDialog, isMobile])

  return {
    input, search, showPanel, isMobile,
    activeRoom, activeContact, activeRoomId, messages,
    contacts, rooms, filteredContacts, messagesEndRef, currentUser,
    selectedFile, fileInputRef, uploading,
    groupDialogOpen, groupName, groupMemberIds, groupCreating, groupError,
    setInput, setSearch, setShowPanel, setGroupName,
    handleSend, handleKeyDown, handleSelectContact, handleSelectRoom,
    getLastMessage, handleFileChange, handleRemoveFile,
    openGroupDialog, closeGroupDialog, toggleGroupMember, handleCreateGroup,
  }
}
