/**
 * componentLogic.js
 *
 * Centralized business logic, custom hooks, and utility functions for Chat UI components.
 * Separates state management, side effects, media handling, and accessibility handlers
 * from the presentation layer (React components).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useMediaQuery, useTheme } from '@mui/material'
import {
  addGroupMembers,
  deleteGroup,
  leaveGroup,
  promoteToAdmin,
  removeGroupMember,
  updateGroupInfo,
  uploadGroupAvatar,
} from '../provider/chatSlice'
import { API_BASE } from '../features/media/upload'
import { downloadFile, openFile, resolveMime } from '../utils/fileOpener'

// ============================================================================
// 1. AVATAR & USER PRESENTATION UTILITIES
// ============================================================================

/** Palette of muted background colors for fallback user/group avatar circles. */
const AVATAR_COLORS = [
  '#A8C5BD', '#B5C8E2', '#C8B5D4', '#D4C4A8', '#A8D4B5',
  '#D4A8B5', '#B5D4C8', '#C8D4A8', '#A8B5D4', '#D4B5A8',
]

/**
 * Extracts up to two uppercase initials from a user or group name.
 * Example: "Jane Doe" -> "JD", "Support" -> "S"
 *
 * @param {string} [name=''] - The full name or display name.
 * @returns {string} 1 or 2 uppercase characters representing the initials.
 */
export function getInitials(name = '') {
  return name.split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase()
}

/**
 * Generates a deterministic avatar color based on a string hash of the name.
 * Ensures the same user or group always renders with the same color.
 *
 * @param {string} [name=''] - The display name used for hashing.
 * @returns {string} Hex color code chosen from AVATAR_COLORS.
 */
export function getAvatarColor(name = '') {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

// ============================================================================
// 2. MESSAGE GROUPING & DATE UTILITIES
// ============================================================================

/**
 * Groups an array of chronological messages into:
 * 1. Date separators ({ type: 'date', dateKey, label }) when the calendar day changes.
 * 2. Media album collections ({ type: 'album', groupId, messages }) when multiple consecutive
 *    media messages share the same `groupId`.
 * 3. Individual messages ({ type: 'message', message }) for standard standalone messages.
 *
 * @param {Array<Object>} messages - Chronological list of chat message objects.
 * @returns {Array<Object>} Processed message items ready for flat rendering.
 */
export function buildChatMessageGroups(messages) {
  const groups = []
  let lastDateKey = null
  messages.forEach((message) => {
    // Check if the current message belongs to a new calendar day
    const dateKey = localDateKey(message.createdAt)
    if (dateKey && dateKey !== lastDateKey) {
      lastDateKey = dateKey
      groups.push({ type: 'date', dateKey, label: dateSeparatorLabel(dateKey) })
    }

    const previous = groups[groups.length - 1]
    // Collapse consecutive media messages with identical groupId into an album
    if (message.groupId && previous?.type === 'album' && previous.groupId === message.groupId) {
      previous.messages.push(message)
    } else if (message.groupId) {
      groups.push({ type: 'album', groupId: message.groupId, messages: [message] })
    } else {
      groups.push({ type: 'message', message })
    }
  })
  return groups
}

/**
 * Hook to create and manage an object URL preview for a queued image file.
 * Automatically revokes the object URL on change or unmount to prevent memory leaks.
 *
 * @param {File|Blob} file - The image file being previewed.
 * @returns {string|null} Temporary object URL or null.
 */
export function useQueuedImageThumbLogic(file) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  return src
}

/**
 * Formats an ISO date string into a user-friendly date (e.g., "Jan 15, 2024").
 *
 * @param {string} dateStr - ISO timestamp or date string.
 * @returns {string} Formatted localized date or empty string if invalid.
 */
export function formatJoinedDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date)) return ''
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Accessibility helper: triggers the onClick handler when Enter or Space is pressed.
 *
 * @param {KeyboardEvent} event - The keyboard event.
 * @param {Function} [onClick] - The click handler to trigger.
 */
function handleKeyboardActivation(event, onClick) {
  if (event.key === 'Enter' || event.key === ' ') onClick?.()
}

/**
 * Formats a timestamp for individual contact rows (e.g., "2:45 PM").
 *
 * @param {string} dateStr - ISO timestamp string.
 * @returns {string} Formatted time or empty string.
 */
function formatContactTime(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date)) return ''
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/**
 * Formats a timestamp for group chat rows relative to current time:
 * - Today: "2:45 PM"
 * - Yesterday: "Yesterday"
 * - Within last 7 days: Day name (e.g., "Mon")
 * - Older: Date string (e.g., "11/20/26")
 *
 * @param {string} dateStr - ISO timestamp string.
 * @returns {string} Relative formatted date/time.
 */
function formatGroupTime(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date)) return ''
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const weekStart = new Date(today)
  weekStart.setDate(weekStart.getDate() - 6)

  if (date >= today) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (date >= yesterday) return 'Yesterday'
  if (date >= weekStart) return date.toLocaleDateString([], { weekday: 'short' })
  return date.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' })
}

// ============================================================================
// 3. CONTACT & GROUP LIST ITEM HOOKS
// ============================================================================

/**
 * Hook providing time labels and keyboard accessibility for contact list items.
 *
 * @param {Object} contact - The contact object (with lastMessageAt / lastSeenAt).
 * @param {Function} onClick - Selection callback.
 * @returns {{ timeLabel: string, handleKeyDown: Function }}
 */
export function useContactItemLogic(contact, onClick) {
  return {
    timeLabel: formatContactTime(contact.lastMessageAt || contact.lastSeenAt),
    handleKeyDown: (event) => handleKeyboardActivation(event, onClick),
  }
}

/**
 * Hook providing initials, time labels, keyboard accessibility, and info modal
 * triggers for group chat list items.
 *
 * @param {Object} room - The chat room object.
 * @param {Function} onClick - Room selection callback.
 * @param {Function} [onInfoClick] - Group info button click callback.
 * @returns {{ avatar: string, timeLabel: string, handleKeyDown: Function, handleAvatarClick: Function }}
 */
export function useGroupItemLogic(room, onClick, onInfoClick) {
  return {
    avatar: room.name?.slice(0, 2).toUpperCase() || 'GR',
    timeLabel: formatGroupTime(room.lastMessageAt || room.createdAt),
    handleKeyDown: (event) => handleKeyboardActivation(event, onClick),
    handleAvatarClick: (event) => {
      if (!onInfoClick) return
      event.stopPropagation()
      onInfoClick(room)
    },
  }
}

// ============================================================================
// 4. CONTACT PANEL (CHATS SIDEBAR) LOGIC
// ============================================================================

/**
 * Hook managing the contact panel state:
 * - Direct vs. Group chat feature flags from the auth user/project settings
 * - Active tab switching (Direct chats vs. Group chats)
 * - Search query filtering and placeholder/title resolution
 * - Cross-frame back navigation (via postMessage) or local panel closing
 *
 * @param {Object} params
 * @param {string} params.search - Current search text.
 * @param {Function} params.setSearch - Search text setter.
 * @param {Array<Object>} params.rooms - List of active rooms.
 * @param {Function} params.setShowPanel - Function to toggle panel visibility.
 * @param {Function} params.handleSelectContact - Callback on contact selection.
 * @param {Function} params.handleSelectRoom - Callback on room selection.
 */
export function useContactPanelLogic({
  search,
  setSearch,
  rooms,
  setShowPanel,
  handleSelectContact,
  handleSelectRoom,
}) {
  const user = useSelector((state) => state.auth.user)
  const allowGroupChat = Boolean(user?.allowGroupChat)
  const allowDirectChat = Boolean(user?.allowDirectChat)
  const showTabs = allowGroupChat && allowDirectChat
  const [activeTab, setActiveTab] = useState(0)
  const searchLower = (search || '').trim().toLowerCase()

  // Filter and sort group rooms by most recent activity descending
  const groupRooms = rooms
    .filter((room) => room.isGroup)
    .filter((room) => !searchLower || (room.name || '').toLowerCase().includes(searchLower))
    .slice()
    .sort((a, b) =>
      new Date(b.lastMessageAt || b.createdAt) -
      new Date(a.lastMessageAt || a.createdAt)
    )

  // Dynamically resolve placeholder and header title based on allowed features and active tab
  const searchPlaceholder =
    allowGroupChat && !allowDirectChat
      ? 'Search groups'
      : !allowGroupChat && allowDirectChat
        ? 'Search contacts'
        : activeTab === 1
          ? 'Search groups'
          : 'Search contacts'
  const title =
    allowGroupChat && !allowDirectChat
      ? 'Group Chats'
      : !allowGroupChat && allowDirectChat
        ? 'Individual Chats'
        : 'Chats'

  return {
    allowGroupChat,
    allowDirectChat,
    showTabs,
    activeTab,
    groupRooms,
    searchPlaceholder,
    title,
    // Notify parent window if embedded in iframe, else close panel locally
    handleBack: () => {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'CHAT_GO_BACK' }, '*')
      } else {
        setShowPanel?.(false)
      }
    },
    handleSearchChange: (event) => setSearch(event.target.value),
    showDirectTab: () => setActiveTab(0),
    showGroupsTab: () => setActiveTab(1),
    getRoomSelectHandler: (room) => () => handleSelectRoom(room),
    getContactSelectHandler: (contactId) => () => handleSelectContact(contactId),
  }
}

// ============================================================================
// 5. GROUP MEMBERS DIALOG LOGIC
// ============================================================================

/**
 * Hook managing the group members list modal and leave group action.
 *
 * @param {Object} params
 * @param {Object} params.room - Active room object with members array.
 * @param {string} params.currentUserId - Authenticated user's ID.
 * @param {Function} params.onClose - Modal close handler.
 * @param {Function} params.onLeave - Async leave group callback.
 */
export function useGroupMembersDialogLogic({ room, currentUserId, onClose, onLeave }) {
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState('')

  // Map member records with presentation helpers (isMe, isAdmin, avatar initials)
  const members = (room?.members || []).map((member, index) => {
    const user = member.user || {}
    return {
      ...member,
      index,
      user,
      isMe: member.userId === currentUserId,
      isAdmin: member.role === 'admin',
      avatar: user.name?.split(' ').map((word) => word[0]).join('').toUpperCase().slice(0, 2) || '?',
    }
  })

  // Leave group handler with loading and error state management
  const handleLeave = async () => {
    setLeaveError('')
    setLeaving(true)
    try {
      await onLeave(room.id)
      onClose()
    } catch (error) {
      setLeaveError(error.message || 'Failed to leave group')
    } finally {
      setLeaving(false)
    }
  }

  return { members, leaving, leaveError, handleLeave }
}

// ============================================================================
// 6. PROJECT REGISTRATION LOGIC
// ============================================================================

/** Project registration endpoint origin. */
const PROJECT_API =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:5000' : '')

/**
 * Hook managing project onboarding/registration form state and API interaction.
 *
 * @returns {Object} Form fields, submit handler, loading/error state, and API key copy helper.
 */
export function useRegisterProjectLogic() {
  const [name, setName] = useState('')
  const [registrationSecret, setRegistrationSecret] = useState('')
  const [allowGroupChat, setAllowGroupChat] = useState(true)
  const [allowDirectChat, setAllowDirectChat] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  return {
    name,
    registrationSecret,
    allowGroupChat,
    allowDirectChat,
    loading,
    result,
    error,
    copied,
    handleSubmit: async (event) => {
      event.preventDefault()
      if (!name.trim() || !registrationSecret.trim()) return
      setLoading(true)
      setResult(null)
      setError('')
      try {
        const response = await fetch(`${PROJECT_API}/api/projects`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-REGISTRATION-SECRET': registrationSecret,
          },
          body: JSON.stringify({ name: name.trim(), allowGroupChat, allowDirectChat }),
        })
        const data = await response.json()
        if (response.ok) setResult(data)
        else setError(data.error || 'Failed to register')
      } catch (requestError) {
        setError(requestError.message)
      } finally {
        setLoading(false)
      }
    },
    handleNameChange: (event) => setName(event.target.value),
    handleSecretChange: (event) => setRegistrationSecret(event.target.value),
    handleGroupChatChange: (event) => setAllowGroupChat(event.target.checked),
    handleDirectChatChange: (event) => setAllowDirectChat(event.target.checked),
    handleCopyApiKey: () => {
      if (result?.apiKey) {
        navigator.clipboard.writeText(result.apiKey)
        setCopied(true)
      }
    },
    handleCloseCopied: () => setCopied(false),
  }
}

// ============================================================================
// 7. MESSAGE ACTIONS CONTEXT MENU LOGIC
// ============================================================================

/**
 * Hook providing click handlers for the message dropdown context menu
 * (Edit, Download, Delete for Me, Delete for Everyone).
 *
 * @param {Object} params
 * @param {Object} params.message - Target message.
 * @param {Function} params.onClose - Menu close callback.
 * @param {Function} [params.onDelete] - Deletion handler: (messageId, scope).
 * @param {Function} [params.onEdit] - Edit initiation callback.
 * @param {Function} [params.onDownload] - Download trigger callback.
 */
export function useMessageActionsMenuLogic({ message, onClose, onDelete, onEdit, onDownload }) {
  return {
    handleEdit: () => { onClose(); onEdit?.() },
    handleDownload: (event) => { onClose(); onDownload?.(event) },
    handleDeleteForMe: () => { onDelete?.(message.id, 'me'); onClose() },
    handleDeleteForEveryone: () => { onDelete?.(message.id, 'everyone'); onClose() },
  }
}

// ============================================================================
// 8. DATE KEY & SEPARATOR FORMATTERS
// ============================================================================

/**
 * Converts an ISO date string into a local 'YYYY-MM-DD' key for date grouping.
 *
 * @param {string} isoString - ISO format timestamp.
 * @returns {string|null} Formatted date key or null if invalid.
 */
export function localDateKey(isoString) {
  if (!isoString) return null
  const date = new Date(isoString)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Generates user-friendly separator labels for date dividers in the chat timeline.
 * Returns 'Today', 'Yesterday', or the full localized date string (e.g., 'Monday, January 1, 2024').
 *
 * @param {string} dateStr - 'YYYY-MM-DD' formatted date string.
 * @returns {string} Human-readable separator label.
 */
export function dateSeparatorLabel(dateStr) {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
  if (dateStr === todayStr) return 'Today'
  if (dateStr === yesterdayStr) return 'Yesterday'
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

/**
 * Returns Authorization header if the media URL matches the backend API origin.
 * Prevents leaking bearer tokens to external third-party origins.
 *
 * @param {string} url - Target media URL.
 * @param {string} token - JWT authentication token.
 * @returns {Object} Headers object with Authorization header or empty object.
 */
function mediaAuthHeaders(url, token) {
  try {
    const backendOrigin = new URL(API_BASE, window.location.href).origin
    if (new URL(url, window.location.href).origin === backendOrigin) {
      return { Authorization: `Bearer ${token}` }
    }
  } catch { /* ignore */ }
  return {}
}

// ============================================================================
// 9. MEDIA ALBUM TILE & BUBBLE HOOKS
// ============================================================================

/**
 * Hook managing the logic for an individual tile inside a media album:
 * - Blob URL resolution with authentication and fallback proxy route
 * - File download triggering
 * - Context menu and mobile long-press detection
 * - Dynamic tile width and height sizing based on total album count and position
 *
 * @param {Object} params
 * @param {Object} params.message - Individual media message object.
 * @param {number} params.totalCount - Total number of media items in this album.
 * @param {number} params.index - Index of this tile in the album grid.
 */
export function useMediaAlbumTileLogic({ message, totalCount, index }) {
  const token = useSelector((state) => state.auth.token)
  const isImage = message.fileType === 'image'
  const isVideo = message.fileType === 'video'
  const isAudio = message.fileType === 'audio'
  const isFile = !isImage && !isVideo && !isAudio
  const [blobUrl, setBlobUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState(null)
  const longPressTimer = useRef(null)

  // Resolves backend upload route or proxy fallback for protected media
  const resolveUrl = useCallback(() => {
    if (!message.fileUrl) return null
    try {
      const parsed = new URL(message.fileUrl, window.location.href)
      const backendOrigin = new URL(API_BASE, window.location.href).origin
      if (parsed.origin === backendOrigin && parsed.pathname.includes('/uploads/')) return message.fileUrl
      if (!message.roomId) return message.fileUrl
      const filename = parsed.pathname.split('/').pop()
      return filename ? `${API_BASE}/rooms/${message.roomId}/uploads/${filename}` : message.fileUrl
    } catch {
      return message.fileUrl
    }
  }, [message.fileUrl, message.roomId])

  // Fetch media with auth header, convert to blob, and manage cleanup on unmount
  useEffect(() => {
    if ((!isImage && !isVideo) || !message.fileUrl || !token) return
    const controller = new AbortController()
    setLoading(true)
    let objectUrl = null
    const fetchUrl = (url) =>
      fetch(url, { headers: mediaAuthHeaders(url, token), signal: controller.signal })

    fetchUrl(message.fileUrl)
      .then((response) => {
        if (response.ok) return response
        const proxy = resolveUrl()
        if (proxy && proxy !== message.fileUrl) return fetchUrl(proxy)
        throw new Error(`HTTP ${response.status}`)
      })
      .then((response) => response.blob())
      .then((blob) => {
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setBlobUrl(objectUrl)
        setLoading(false)
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setLoading(false)
      })

    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [isImage, isVideo, message.fileUrl, token, resolveUrl])

  // File download handler with busy flag guard
  const handleDownload = useCallback(async (event) => {
    event?.stopPropagation()
    if (downloading) return
    const url = resolveUrl()
    if (!url) return
    setDownloading(true)
    try {
      await downloadFile(url, message.fileName || url.split('/').pop() || 'download', token)
    } catch {
      // The shared download utility reports its own failures.
    } finally {
      setDownloading(false)
    }
  }, [downloading, resolveUrl, message.fileName, token])

  // Desktop right-click / context menu opener
  const openMenu = useCallback((event) => {
    event.preventDefault()
    if (message.isDeleted || message.id?.startsWith('optimistic-')) return
    setMenuAnchor(event.currentTarget)
  }, [message.isDeleted, message.id])

  // Mobile long-press timer triggers context menu after 500ms
  const onTouchStart = useCallback((event) => {
    if (message.isDeleted || message.id?.startsWith('optimistic-')) return
    const target = event.currentTarget
    longPressTimer.current = setTimeout(() => setMenuAnchor(target), 500)
  }, [message.isDeleted, message.id])
  const onTouchEnd = useCallback(() => clearTimeout(longPressTimer.current), [])
  const closeMenu = () => setMenuAnchor(null)
  useEffect(() => () => clearTimeout(longPressTimer.current), [])

  // Dynamic grid layout sizing based on total items count
  const fullRow = totalCount === 1 || (totalCount === 3 && index === 0)
  const tileWidth = fullRow ? '100%' : 'calc(50% - 1px)'
  const tileHeight = fullRow
    ? (totalCount === 1 ? 240 : 170)
    : (totalCount === 2 ? 200 : 150)
  const sharedSx = {
    position: 'relative',
    width: tileWidth,
    flexShrink: 0,
    height: tileHeight,
    overflow: 'hidden',
    bgcolor: '#111',
    '&:hover .dl-btn': { opacity: 1 },
    cursor: message.isDeleted || message.id?.startsWith('optimistic-') ? 'default' : 'context-menu',
  }

  return {
    token,
    isMine: message.mine,
    isImage,
    isVideo,
    isAudio,
    isFile,
    blobUrl,
    loading,
    downloading,
    menuAnchor,
    handleDownload,
    openMenu,
    onTouchStart,
    onTouchEnd,
    closeMenu,
    sharedSx,
    handleOpenImage: () => {
      if (blobUrl) window.open(blobUrl, '_blank', 'noopener,noreferrer')
    },
  }
}

/**
 * Hook computing container-level metadata for a media album bubble:
 * - Sender identity (first message ownership)
 * - Message count and boundary references (first/last)
 * - Overall failure status
 *
 * @param {Array<Object>} messages - Messages belonging to the album.
 */
export function useMediaAlbumBubbleLogic(messages) {
  const list = messages || []
  const first = list[0]
  const last = list[list.length - 1]
  if (!first) return { first: null, isMine: false, count: 0, last: null, failed: false }
  return {
    first,
    isMine: first.mine,
    count: list.length,
    last,
    failed: first.mine && list.some((message) => message.status === 'failed'),
  }
}

// ============================================================================
// 10. MESSAGE BUBBLE LOGIC & MEDIA STREAMING
// ============================================================================

/**
 * Performs fetch with Bearer token if the destination URL belongs to the backend origin.
 *
 * @param {string} url - Request destination.
 * @param {string} token - JWT bearer token.
 * @returns {Promise<Response>}
 */
function authFetch(url, token) {
  let headers = {}
  try {
    const backendOrigin = new URL(API_BASE, window.location.href).origin
    if (token && new URL(url, window.location.href).origin === backendOrigin) {
      headers = { Authorization: `Bearer ${token}` }
    }
  } catch { /* ignore */ }
  return fetch(url, { headers })
}

/**
 * Formats a byte number into a human-readable file size string (B, KB, MB).
 *
 * @param {number} bytes - Size in bytes.
 * @returns {string} Formatted size string.
 */
function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Hook encapsulating all logic for individual chat message bubbles:
 * - Media fetching (images, audio, video) with auth headers and fallback proxy
 * - File opening and downloading via shared utilities
 * - Message editing inline state and keyboard shortcuts (Enter to submit, Esc to cancel)
 * - Context menu and mobile long-press gestures
 * - Failed message retry trigger
 * - Presentation formatting (file size, filename, theme colors)
 *
 * @param {Object} params
 * @param {Object} params.message - The message data object.
 * @param {Function} [params.onRetry] - Retry callback for failed messages.
 * @param {Function} [params.onEdit] - Edit submission callback.
 */
export function useMessageBubbleLogic({ message, onRetry, onEdit }) {
  const token = useSelector((state) => state.auth.token)
  const failed = message.mine && message.status === 'failed'
  const isImage = message.fileType === 'image'
  const isAudio = message.fileType === 'audio'
  const isVideo = message.fileType === 'video'
  const isFile = Boolean(message.fileUrl) && !isImage && !isAudio && !isVideo
  const [mediaBlobUrl, setMediaBlobUrl] = useState(null)
  const [mediaLoading, setMediaLoading] = useState(false)
  const [mediaError, setMediaError] = useState(false)

  // Resolves backend upload route or proxy fallback for protected media
  const proxyUrl = useCallback(() => {
    if (!message.fileUrl) return null
    try {
      const parsed = new URL(message.fileUrl, window.location.href)
      const backendOrigin = new URL(API_BASE, window.location.href).origin
      if (parsed.origin === backendOrigin && parsed.pathname.includes('/uploads/')) return message.fileUrl
      if (!message.roomId) return message.fileUrl
      const filename = parsed.pathname.split('/').pop()
      if (!filename) return message.fileUrl
      return `${API_BASE}/rooms/${message.roomId}/uploads/${filename}`
    } catch {
      return message.fileUrl
    }
  }, [message.fileUrl, message.roomId])

  // Loads protected media with AbortController and proxy fallback
  const loadMedia = useCallback(() => {
    if (!(isImage || isAudio || isVideo) || !message.fileUrl || !token || message.isDeleted) return undefined
    const controller = new AbortController()
    setMediaLoading(true)
    setMediaError(false)
    let objectUrl = null
    const doFetch = (url) => authFetch(url, token)

    doFetch(message.fileUrl)
      .then((response) => {
        if (response.ok) return response
        const proxy = proxyUrl()
        if (proxy && proxy !== message.fileUrl) {
          return doFetch(proxy).then((proxyResponse) => {
            if (!proxyResponse.ok) throw new Error(`HTTP ${proxyResponse.status}`)
            return proxyResponse
          })
        }
        throw new Error(`HTTP ${response.status}`)
      })
      .then((response) => response.blob())
      .then((blob) => {
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setMediaBlobUrl(objectUrl)
        setMediaLoading(false)
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('[MessageBubble] media fetch error:', error)
          if (!controller.signal.aborted) {
            setMediaError(true)
            setMediaLoading(false)
          }
        }
      })

    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [isImage, isAudio, isVideo, message.fileUrl, token, message.isDeleted, proxyUrl])

  useEffect(() => {
    setMediaBlobUrl(null)
    setMediaError(false)
    return loadMedia()
  }, [loadMedia])

  const retryMedia = () => {
    setMediaError(false)
    loadMedia()
  }

  // Opens non-media files or external documents in viewer/new tab
  const [opening, setOpening] = useState(false)
  const handleOpenFile = useCallback(async (event) => {
    event?.stopPropagation()
    if (opening) return
    const url = proxyUrl()
    if (!url) return
    setOpening(true)
    try {
      await openFile({
        url,
        fileName: message.fileName || url.split('/').pop().split('?')[0],
        mimeType: resolveMime(message.mimeType, message.fileName || ''),
        fileType: message.fileType,
        token,
      })
    } catch (error) {
      console.warn('[MessageBubble] openFile error', error)
    } finally {
      setOpening(false)
    }
  }, [opening, proxyUrl, message.mimeType, message.fileName, message.fileType, token])

  // Opens image in new tab from blob URL or falls back to file opener
  const handleOpenImage = useCallback((event) => {
    event?.stopPropagation()
    if (mediaBlobUrl) window.open(mediaBlobUrl, '_blank', 'noopener,noreferrer')
    else handleOpenFile(event)
  }, [mediaBlobUrl, handleOpenFile])

  // Downloads attached file
  const [downloading, setDownloading] = useState(false)
  const handleDownload = useCallback(async (event) => {
    event?.stopPropagation()
    if (downloading) return
    const url = proxyUrl()
    if (!url) return
    const fileName = message.fileName || url.split('/').pop().split('?')[0] || 'download'
    setDownloading(true)
    try {
      await downloadFile(url, fileName, token)
    } catch (error) {
      console.error('[MessageBubble] download error', error)
    } finally {
      setDownloading(false)
    }
  }, [downloading, proxyUrl, token, message.fileName])

  // Context menu & long-press handling
  const [menuAnchor, setMenuAnchor] = useState(null)
  const longPressTimer = useRef(null)
  const openMenu = useCallback((event) => {
    event.preventDefault()
    if (message.isDeleted || message.id?.startsWith('optimistic-')) return
    setMenuAnchor(event.currentTarget)
  }, [message.isDeleted, message.id])
  const closeMenu = () => setMenuAnchor(null)
  const onTouchStart = useCallback((event) => {
    if (message.isDeleted || message.id?.startsWith('optimistic-')) return
    const target = event.currentTarget
    longPressTimer.current = setTimeout(() => setMenuAnchor(target), 500)
  }, [message.isDeleted, message.id])
  const onTouchEnd = useCallback(() => clearTimeout(longPressTimer.current), [])

  // Inline message editing controls
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const editInputRef = useRef(null)
  const startEdit = () => {
    setEditValue(message.text)
    setEditing(true)
    closeMenu()
    setTimeout(() => editInputRef.current?.focus(), 50)
  }
  const cancelEdit = () => { setEditing(false); setEditValue('') }
  const submitEdit = () => {
    const trimmed = editValue.trim()
    if (!trimmed || trimmed === message.text) { cancelEdit(); return }
    onEdit?.(message.id, trimmed)
    setEditing(false)
    setEditValue('')
  }
  const handleEditChange = (event) => setEditValue(event.target.value)
  const handleEditKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitEdit() }
    if (event.key === 'Escape') cancelEdit()
  }

  const handleRetry = () => onRetry?.(message)
  const isTextOnly = !message.fileUrl && message.messageType === 'text'
  const displayName = message.fileName
    || (message.fileUrl ? decodeURIComponent(message.fileUrl.split('/').pop().split('?')[0]) : '')
  const displaySize = formatFileSize(message.fileSize)
  const iconColor = message.mine ? 'rgba(255,255,255,0.85)' : '#3C4F4A'
  const mutedColor = message.mine ? 'rgba(255,255,255,0.7)' : '#757575'

  return {
    failed, isImage, isAudio, isVideo, isFile, mediaBlobUrl, mediaLoading,
    mediaError, retryMedia, opening, handleOpenFile, handleOpenImage,
    downloading, handleDownload, menuAnchor, openMenu, closeMenu,
    onTouchStart, onTouchEnd, editing, editValue, editInputRef,
    startEdit, cancelEdit, submitEdit, handleEditChange, handleEditKeyDown,
    handleRetry, isTextOnly, displayName, displaySize, iconColor, mutedColor,
  }
}

// ============================================================================
// 11. CHAT WINDOW LOGIC HOOK
// ============================================================================

/**
 * Primary hook managing the state, permissions, and interactions of ChatWindow:
 * - File upload queue (deduplication, image preview flags, clearing on room switch)
 * - Drag-and-drop file attachment
 * - User blocking/unblocking confirmation dialogs and handlers
 * - Permission and disable rules (admin-only broadcast channels, blocked contacts, disabled chat features)
 * - Enter key handling for message dispatch vs. multi-line entry
 * - Empty state title and message generation
 *
 * @param {Object} params - ChatWindow props and event handlers.
 */
export function useChatWindowLogic({
  activeContact,
  activeRoom,
  currentUserId,
  messages,
  uploadingFile,
  sendingFirstMessage,
  input,
  setInput,
  handleSend,
  handleKeyDown,
  setShowPanel,
  onUploadFile,
  onBlockUser,
  onUnblockUser,
  socketConnected,
}) {
  const fileInputRef = useRef(null)
  const user = useSelector((state) => state.auth.user)
  const allowGroupChat = Boolean(user?.allowGroupChat)
  const allowDirectChat = Boolean(user?.allowDirectChat)
  const isAdmin = Boolean(user?.role) && user.role.toLowerCase().includes('admin')

  // Queued file upload state (deduplicated by fileName + fileSize)
  const [queuedFiles, setQueuedFiles] = useState([])
  const queuedFileRows = queuedFiles.map((file, index) => ({
    file,
    index,
    isImage: file.type.startsWith('image/'),
  }))
  const addToQueue = useCallback((fileList) => {
    const incoming = Array.from(fileList)
    setQueuedFiles((previous) => {
      const existing = new Set(previous.map((file) => `${file.name}:${file.size}`))
      const fresh = incoming.filter((file) => !existing.has(`${file.name}:${file.size}`))
      return [...previous, ...fresh]
    })
  }, [])
  const removeFromQueue = useCallback((index) => {
    setQueuedFiles((previous) => previous.filter((_, itemIndex) => itemIndex !== index))
  }, [])
  const clearQueue = useCallback(() => setQueuedFiles([]), [])
  useEffect(() => { setQueuedFiles([]) }, [activeRoom?.id])

  // Window options menu anchor
  const [menuAnchor, setMenuAnchor] = useState(null)
  const openMenu = (event) => setMenuAnchor(event.currentTarget)
  const closeMenu = () => setMenuAnchor(null)

  // Block / Unblock dialog state and async execution
  const [blockDialogOpen, setBlockDialogOpen] = useState(false)
  const [unblockDialogOpen, setUnblockDialogOpen] = useState(false)
  const [blockActionLoading, setBlockActionLoading] = useState(false)
  const [blockActionError, setBlockActionError] = useState('')
  const handleOpenBlockDialog = () => {
    closeMenu()
    setBlockActionError('')
    setBlockDialogOpen(true)
  }
  const handleOpenUnblockDialog = () => {
    closeMenu()
    setBlockActionError('')
    setUnblockDialogOpen(true)
  }
  const handleConfirmBlock = useCallback(async () => {
    setBlockActionLoading(true)
    setBlockActionError('')
    try {
      await onBlockUser(activeContact.id)
      setBlockDialogOpen(false)
    } catch (error) {
      setBlockActionError(typeof error === 'string' ? error : error?.message || 'Failed to block user')
    } finally {
      setBlockActionLoading(false)
    }
  }, [onBlockUser, activeContact])
  const handleConfirmUnblock = useCallback(async () => {
    setBlockActionLoading(true)
    setBlockActionError('')
    try {
      await onUnblockUser(activeContact.id)
      setUnblockDialogOpen(false)
    } catch (error) {
      setBlockActionError(typeof error === 'string' ? error : error?.message || 'Failed to unblock user')
    } finally {
      setBlockActionLoading(false)
    }
  }, [onUnblockUser, activeContact])

  // Drag-and-drop file attachment
  const [isDragOver, setIsDragOver] = useState(false)

  // Permissions and disable conditions
  const chatFeatureDisabled = activeContact?.isGroup ? !allowGroupChat : !allowDirectChat
  const myGroupMembership = activeRoom?.members?.find((member) => member.userId === currentUserId)
  const isGroupAdmin = myGroupMembership?.role === 'admin' || activeRoom?.createdById === currentUserId
  const adminOnlyBlocked = Boolean(
    activeContact?.isGroup &&
    activeRoom?.adminOnlyMessages &&
    !(isAdmin || isGroupAdmin),
  )
  const blockedByMe = !activeContact?.isGroup && Boolean(activeRoom?.blockedByMe)
  const blockedByThem = !activeContact?.isGroup && Boolean(activeRoom?.blockedByThem)
  const isBlocked = blockedByMe || blockedByThem
  const attachDisabled = !activeRoom?.id ||
    uploadingFile ||
    adminOnlyBlocked ||
    isBlocked ||
    chatFeatureDisabled ||
    socketConnected === false
  const inputDisabled = sendingFirstMessage ||
    uploadingFile ||
    adminOnlyBlocked ||
    isBlocked ||
    chatFeatureDisabled
  const sendDisabled = (!input.trim() && queuedFiles.length === 0) || inputDisabled
  const sendQueueDisabled = uploadingFile ||
    queuedFiles.length === 0 ||
    adminOnlyBlocked ||
    isBlocked ||
    chatFeatureDisabled ||
    socketConnected === false

  // Drag-and-drop event handlers
  const handleDragOver = useCallback((event) => {
    event.preventDefault()
    event.stopPropagation()
    if (!attachDisabled) setIsDragOver(true)
  }, [attachDisabled])
  const handleDragLeave = useCallback((event) => {
    event.preventDefault()
    event.stopPropagation()
    if (!event.currentTarget.contains(event.relatedTarget)) setIsDragOver(false)
  }, [])
  const handleDrop = useCallback((event) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragOver(false)
    if (!attachDisabled && event.dataTransfer.files?.length) addToQueue(event.dataTransfer.files)
  }, [attachDisabled, addToQueue])

  const openContactPanel = () => setShowPanel(true)
  const getRemoveFromQueueHandler = (index) => () => removeFromQueue(index)
  const handleFileInputChange = (event) => {
    if (event.target.files?.length) addToQueue(event.target.files)
    event.target.value = ''
  }
  const openFilePicker = () => fileInputRef.current?.click()
  const handleInputChange = (event) => setInput(event.target.value)

  // Enter key handler: uploads queued files if input text is empty, otherwise sends message
  const handleInputKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && queuedFiles.length > 0 && !input.trim()) {
      event.preventDefault()
      onUploadFile?.(queuedFiles)
      clearQueue()
      return
    }
    handleKeyDown(event)
  }
  const handleSendAction = () => {
    if (queuedFiles.length > 0) {
      onUploadFile?.(queuedFiles)
      clearQueue()
    } else {
      handleSend()
    }
  }

  const handleCloseBlockDialog = () => setBlockDialogOpen(false)
  const handleCloseUnblockDialog = () => setUnblockDialogOpen(false)
  const handleBlockDialogClose = () => {
    if (!blockActionLoading) setBlockDialogOpen(false)
  }
  const handleUnblockDialogClose = () => {
    if (!blockActionLoading) setUnblockDialogOpen(false)
  }

  // Pending direct message request states
  const isPendingRequest = activeRoom?.directStatus === 'pending'
  const isRequestSender = activeRoom?.requestedById === currentUserId
  const requestAlreadySent = messages.length > 0 || Boolean(activeRoom?.lastMessageAt)
  const canSendFirstRequest = isPendingRequest && isRequestSender && !requestAlreadySent

  // Context-aware empty state text
  const emptyStateTitle = !allowGroupChat && !allowDirectChat
    ? 'Chat Disabled'
    : allowGroupChat && !allowDirectChat
      ? 'Group Chat'
      : !allowGroupChat && allowDirectChat
        ? 'Individual Chat'
        : 'Chat'
  const emptyStateDescription = !allowGroupChat && !allowDirectChat
    ? 'Neither group chat nor individual chat is enabled for this project'
    : allowGroupChat && !allowDirectChat
      ? 'Select a group to start messaging'
      : !allowGroupChat && allowDirectChat
        ? 'Select a contact to start messaging'
        : 'Select a contact or group to start messaging'

  return {
    fileInputRef,
    user,
    allowGroupChat,
    allowDirectChat,
    isAdmin,
    queuedFiles,
    queuedFileRows,
    addToQueue,
    clearQueue,
    getRemoveFromQueueHandler,
    menuAnchor,
    openMenu,
    closeMenu,
    blockDialogOpen,
    unblockDialogOpen,
    blockActionLoading,
    blockActionError,
    handleOpenBlockDialog,
    handleOpenUnblockDialog,
    handleConfirmBlock,
    handleConfirmUnblock,
    handleCloseBlockDialog,
    handleCloseUnblockDialog,
    handleBlockDialogClose,
    handleUnblockDialogClose,
    isDragOver,
    chatFeatureDisabled,
    isGroupAdmin,
    adminOnlyBlocked,
    blockedByMe,
    blockedByThem,
    isBlocked,
    attachDisabled,
    inputDisabled,
    sendDisabled,
    sendQueueDisabled,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    openContactPanel,
    handleFileInputChange,
    openFilePicker,
    handleInputChange,
    handleInputKeyDown,
    handleSendAction,
    isPendingRequest,
    isRequestSender,
    requestAlreadySent,
    canSendFirstRequest,
    emptyStateTitle,
    emptyStateDescription,
  }
}

// ============================================================================
// 12. CREATE GROUP DIALOG LOGIC
// ============================================================================

/**
 * Hook driving the multi-step group creation workflow:
 * - Step 1: Member search, filtering, and selection (minimum 2 members required)
 * - Step 2: Group name, description, admin-only messages toggle, and optional avatar upload
 * - Image validation (formats: JPEG, PNG, GIF, WebP, max 10MB) and object URL cleanup
 *
 * @param {Object} params - Dialog props, contacts list, and group creation callbacks.
 */
export function useCreateGroupDialogLogic({
  open,
  onClose,
  contacts,
  groupName,
  setGroupName,
  groupMemberIds,
  toggleGroupMember,
  handleCreateGroup: submitGroup,
}) {
  const dispatch = useDispatch()
  const theme = useTheme()
  const isMobileOrTablet = useMediaQuery(theme.breakpoints.down('md'))
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const [step, setStep] = useState(1)
  const [memberSearch, setMemberSearch] = useState('')
  const [description, setDescription] = useState('')
  const [adminOnlyMessages, setAdminOnlyMessages] = useState(false)
  const [groupPhoto, setGroupPhoto] = useState(null)
  const photoInputRef = useRef(null)

  // Revoke object URLs on modal close to free memory
  useEffect(() => {
    if (!open && groupPhoto?.previewUrl) {
      URL.revokeObjectURL(groupPhoto.previewUrl)
      setGroupPhoto(null)
      setPhotoError('')
    }
  }, [open])

  // Reset dialog state upon opening
  useEffect(() => {
    if (open) {
      setStep(1)
      setMemberSearch('')
      setDescription('')
      setAdminOnlyMessages(false)
      setGroupPhoto(null)
    }
  }, [open])

  // Filter contacts by search query matching name or email
  const filtered = useMemo(() => {
    const query = memberSearch.toLowerCase()
    return contacts.filter((contact) =>
      (contact.name || '').toLowerCase().includes(query) ||
      (contact.email || '').toLowerCase().includes(query)
    )
  }, [contacts, memberSearch])
  const selectedContacts = contacts.filter((contact) => groupMemberIds.includes(contact.id))
  const filteredContactRows = filtered.map((contact) => ({
    ...contact,
    selected: groupMemberIds.includes(contact.id),
  }))
  const allFilteredSelected = filtered.length > 0 &&
    filtered.every((contact) => groupMemberIds.includes(contact.id))
  const someFilteredSelected = filtered.some((contact) => groupMemberIds.includes(contact.id))

  // Group avatar file picker change with type and size validations
  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      setPhotoError('Choose a JPEG, PNG, GIF, or WebP image.')
      event.target.value = ''
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setPhotoError('Group images must be 10 MB or smaller.')
      event.target.value = ''
      return
    }
    setPhotoError('')
    if (groupPhoto?.previewUrl) URL.revokeObjectURL(groupPhoto.previewUrl)
    setGroupPhoto({ file, previewUrl: URL.createObjectURL(file) })
    event.target.value = ''
  }

  // Final group submission: uploads avatar first (if selected), then invokes create group
  const handleCreateGroup = async () => {
    let uploadedAvatarUrl = null
    if (groupPhoto?.file) {
      setUploadingAvatar(true)
      setPhotoError('')
      try {
        const result = await dispatch(uploadGroupAvatar({ file: groupPhoto.file })).unwrap()
        uploadedAvatarUrl = result?.avatarUrl || null
      } catch (error) {
        setUploadingAvatar(false)
        setPhotoError(typeof error === 'string' ? error : 'Failed to upload group avatar')
        return
      }
      setUploadingAvatar(false)
    }
    submitGroup({
      name: groupName.trim(),
      memberIds: groupMemberIds,
      avatarUrl: uploadedAvatarUrl,
      description: description.trim() || undefined,
      adminOnlyMessages,
    })
  }

  const handleMemberSearchChange = (event) => setMemberSearch(event.target.value)
  const handleGroupNameChange = (event) => setGroupName(event.target.value)
  const handleDescriptionChange = (event) => setDescription(event.target.value)
  const handleAdminOnlyMessagesChange = (event) => setAdminOnlyMessages(event.target.checked)
  const getToggleMemberHandler = (userId) => () => toggleGroupMember(userId)
  const handleClearSelectedMembers = () => selectedContacts.forEach((contact) => toggleGroupMember(contact.id))
  const handleToggleFilteredSelection = () => {
    filtered.forEach((contact) => {
      const selected = groupMemberIds.includes(contact.id)
      if (allFilteredSelected ? selected : !selected) toggleGroupMember(contact.id)
    })
  }

  // Validate minimum members (at least 2 selected + creator = 3 total) before advancing to step 2
  const handleNextStep = () => {
    if (groupMemberIds.length < 2) {
      setToastOpen(true)
      return
    }
    setStep(2)
  }
  const handlePreviousStep = () => setStep(1)
  const handleHeaderBack = () => step === 1 ? onClose() : setStep(1)
  const openPhotoPicker = () => photoInputRef.current?.click()
  const handleRemovePhoto = () => {
    if (groupPhoto?.previewUrl) URL.revokeObjectURL(groupPhoto.previewUrl)
    setGroupPhoto(null)
  }
  const handleToastClose = () => setToastOpen(false)
  const selectedNames = selectedContacts.map((contact) => contact.name?.split(' ')[0]).join(', ')

  return {
    isMobileOrTablet,
    uploadingAvatar,
    photoError,
    toastOpen,
    step,
    setStep,
    memberSearch,
    description,
    adminOnlyMessages,
    groupPhoto,
    photoInputRef,
    filtered,
    filteredContactRows,
    selectedContacts,
    allFilteredSelected,
    someFilteredSelected,
    selectedNames,
    handlePhotoChange,
    handleCreateGroup,
    handleMemberSearchChange,
    handleGroupNameChange,
    handleDescriptionChange,
    handleAdminOnlyMessagesChange,
    getToggleMemberHandler,
    handleClearSelectedMembers,
    handleToggleFilteredSelection,
    handleNextStep,
    handlePreviousStep,
    handleHeaderBack,
    openPhotoPicker,
    handleRemovePhoto,
    handleToastClose,
  }
}

// ============================================================================
// 13. GROUP INFO & MANAGEMENT DIALOG LOGIC
// ============================================================================

/**
 * Hook driving the group information, settings, and member administration dialog:
 * - Multi-view navigation ('info' overview, 'edit' metadata, 'addMembers' picker)
 * - Editing group name, description, and avatar photo
 * - Adding contacts as new group members
 * - Removing members (enforcing minimum 3 total members rule)
 * - Promoting members to admin role
 * - Leaving the group (blocking last admin from abandoning group without promotion)
 * - Deleting the group (owner/admin action)
 * - Member sorting: creator first, admins next, then alphabetical by name
 *
 * @param {Object} params
 * @param {boolean} params.open - Dialog visibility.
 * @param {Function} params.onClose - Close callback.
 * @param {Object} params.room - Active group room object.
 * @param {string} params.currentUserId - Authenticated user's ID.
 * @param {Array<Object>} params.contacts - All available contacts.
 */
export function useGroupInfoDialogLogic({ open, onClose, room, currentUserId, contacts }) {
  const dispatch = useDispatch()
  const theme = useTheme()
  const isMobileOrTablet = useMediaQuery(theme.breakpoints.down('md'))
  const members = room?.members || []
  const createdById = room?.createdById || null
  const myMembership = members.find((member) => member.userId === currentUserId)
  const isAdmin = myMembership?.role === 'admin' ||
    Boolean(currentUserId && createdById && currentUserId === createdById)
  const isOwner = isAdmin

  // View state: 'info' | 'edit' | 'addMembers'
  const [view, setView] = useState('info')
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPhoto, setEditPhoto] = useState(null)
  const [savedAvatarPreview, setSavedAvatarPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const photoInputRef = useRef(null)
  const [addSearch, setAddSearch] = useState('')
  const [addIds, setAddIds] = useState([])
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [removingId, setRemovingId] = useState(null)
  const [leaving, setLeaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [actionError, setActionError] = useState('')
  const [promotingId, setPromotingId] = useState(null)
  const [avatarLightbox, setAvatarLightbox] = useState(false)
  const [minMemberWarning, setMinMemberWarning] = useState(false)
  const [toast, setToast] = useState('')

  // Reset modal state on open
  useEffect(() => {
    if (open) {
      setView('info')
      setSaveError('')
      setAddError('')
      setActionError('')
      setMinMemberWarning(false)
      setAddIds([])
      setAddSearch('')
      setSavedAvatarPreview(null)
    }
  }, [open])

  // Populate edit fields when transitioning to edit view
  useEffect(() => {
    if (view === 'edit') {
      setEditName(room?.name || '')
      setEditDescription(room?.description || '')
      setEditPhoto(null)
      setSaveError('')
    }
  }, [view, room])

  // Revoke avatar preview object URLs on close
  useEffect(() => {
    if (!open) {
      if (editPhoto?.previewUrl) {
        URL.revokeObjectURL(editPhoto.previewUrl)
        setEditPhoto(null)
      }
      if (savedAvatarPreview) {
        URL.revokeObjectURL(savedAvatarPreview)
        setSavedAvatarPreview(null)
      }
    }
  }, [open])

  // Candidate contacts who are not yet members of the group
  const memberUserIds = useMemo(() => new Set(members.map((member) => member.userId)), [members])
  const addableContacts = useMemo(() => {
    const query = addSearch.toLowerCase()
    return contacts.filter((contact) =>
      !memberUserIds.has(contact.id) &&
      (!query ||
        (contact.name || '').toLowerCase().includes(query) ||
        (contact.email || '').toLowerCase().includes(query))
    )
  }, [contacts, memberUserIds, addSearch])
  const hasContactsToAdd = contacts.some((contact) => !memberUserIds.has(contact.id))
  const selectedAddContacts = contacts.filter((contact) => addIds.includes(contact.id))
  const addableContactRows = addableContacts.map((contact) => ({
    ...contact,
    selected: addIds.includes(contact.id),
  }))

  // Sort members: Creator -> Admins -> Alphabetical by name
  const memberRows = members
    .slice()
    .sort((a, b) => {
      const aIsAdmin = a.role === 'admin' || a.userId === createdById
      const bIsAdmin = b.role === 'admin' || b.userId === createdById
      if (aIsAdmin !== bIsAdmin) return aIsAdmin ? -1 : 1
      if (aIsAdmin && bIsAdmin) {
        if (a.userId === createdById) return -1
        if (b.userId === createdById) return 1
      }
      return (a.user?.name || '').localeCompare(b.user?.name || '')
    })
    .map((member, index) => ({
      ...member,
      index,
      user: member.user || {},
      isMe: member.userId === currentUserId,
      isMemberAdmin: member.role === 'admin' || member.userId === createdById,
      isCreator: member.userId === createdById,
      isRemoving: removingId === member.userId,
      isPromoting: promotingId === member.userId,
    }))

  // Group membership rule constraints
  const adminCount = members.filter((member) => member.role === 'admin').length
  const isLastAdmin = isAdmin && adminCount <= 1
  const tooFewAfterLeave = members.length <= 3
  const leaveBlocked = isLastAdmin || tooFewAfterLeave
  const leaveTooltip = isLastAdmin
    ? 'Promote another member to admin before leaving'
    : tooFewAfterLeave
      ? 'A group must have at least 3 members. Add more members or delete the group.'
      : ''
  const headerTitle = view === 'edit' ? 'Edit group' : view === 'addMembers' ? 'Add members' : 'Group info'

  // Photo picker with type and size checks
  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      setSaveError('Choose a JPEG, PNG, GIF, or WebP image.')
      event.target.value = ''
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setSaveError('Group images must be 10 MB or smaller.')
      event.target.value = ''
      return
    }
    setSaveError('')
    if (editPhoto?.previewUrl) URL.revokeObjectURL(editPhoto.previewUrl)
    setEditPhoto({ file, previewUrl: URL.createObjectURL(file) })
    event.target.value = ''
  }

  // Saves modified group metadata (name, description, avatar)
  const handleSaveInfo = async () => {
    const name = editName.trim()
    if (!name) {
      setSaveError('Group name cannot be empty')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      let avatarUrl
      const previewUrl = editPhoto?.previewUrl || null
      if (editPhoto?.file) {
        const result = await dispatch(uploadGroupAvatar({ file: editPhoto.file })).unwrap()
        avatarUrl = result?.avatarUrl || undefined
      }
      const payload = { roomId: room.id, name }
      if (editDescription !== (room?.description || '')) payload.description = editDescription
      if (avatarUrl !== undefined) payload.avatarUrl = avatarUrl
      await dispatch(updateGroupInfo(payload)).unwrap()
      if (previewUrl) setSavedAvatarPreview(previewUrl)
      setToast('Group info updated')
      setView('info')
    } catch (error) {
      setSaveError(typeof error === 'string' ? error : error?.message || 'Failed to update group')
    } finally {
      setSaving(false)
    }
  }

  // Adds selected contact IDs to the group
  const handleAddMembers = async () => {
    if (!addIds.length) return
    setAdding(true)
    setAddError('')
    try {
      await dispatch(addGroupMembers({ roomId: room.id, memberIds: addIds })).unwrap()
      setToast(`${addIds.length} member${addIds.length > 1 ? 's' : ''} added`)
      setAddIds([])
      setAddSearch('')
      setView('info')
    } catch (error) {
      setAddError(typeof error === 'string' ? error : error?.message || 'Failed to add members')
    } finally {
      setAdding(false)
    }
  }

  // Removes a member after validating minimum group size (must have at least 2 non-admins)
  const handleRemoveMember = async (userId) => {
    const nonAdminAfterRemoval = members.filter(
      (member) =>
        member.role !== 'admin' &&
        member.userId !== createdById &&
        member.userId !== userId,
    ).length
    if (nonAdminAfterRemoval < 2) {
      setMinMemberWarning(true)
      return
    }
    setRemovingId(userId)
    setActionError('')
    setMinMemberWarning(false)
    try {
      await dispatch(removeGroupMember({ roomId: room.id, userId })).unwrap()
      setToast('Member removed')
    } catch (error) {
      setActionError(typeof error === 'string' ? error : error?.message || 'Failed to remove member')
    } finally {
      setRemovingId(null)
    }
  }

  // Deletes the group entirely (admin/creator only)
  const handleDeleteGroup = async () => {
    setDeleting(true)
    setActionError('')
    try {
      await dispatch(deleteGroup(room.id)).unwrap()
      onClose()
    } catch (error) {
      setActionError(typeof error === 'string' ? error : error?.message || 'Failed to delete group')
      setDeleting(false)
    }
  }

  // Current user leaves the group
  const handleLeave = async () => {
    setLeaving(true)
    setActionError('')
    try {
      await dispatch(leaveGroup(room.id)).unwrap()
      onClose()
    } catch (error) {
      setActionError(typeof error === 'string' ? error : error?.message || 'Failed to leave group')
    } finally {
      setLeaving(false)
    }
  }

  // Promotes member to admin role
  const handlePromoteToAdmin = async (userId) => {
    setPromotingId(userId)
    setActionError('')
    try {
      await dispatch(promoteToAdmin({ roomId: room.id, userId })).unwrap()
      setToast('Member promoted to admin')
    } catch (error) {
      setActionError(typeof error === 'string' ? error : error?.message || 'Failed to promote member')
    } finally {
      setPromotingId(null)
    }
  }

  return {
    isMobileOrTablet,
    members,
    createdById,
    isAdmin,
    isOwner,
    view,
    setView,
    editName,
    editDescription,
    editPhoto,
    savedAvatarPreview,
    saving,
    saveError,
    photoInputRef,
    addSearch,
    addIds,
    adding,
    addError,
    removingId,
    leaving,
    deleting,
    actionError,
    promotingId,
    avatarLightbox,
    minMemberWarning,
    toast,
    memberUserIds,
    addableContacts,
    hasContactsToAdd,
    addableContactRows,
    selectedAddContacts,
    memberRows,
    adminCount,
    isLastAdmin,
    tooFewAfterLeave,
    leaveBlocked,
    leaveTooltip,
    headerTitle,
    handlePhotoChange,
    handleSaveInfo,
    handleAddMembers,
    handleRemoveMember,
    handleDeleteGroup,
    handleLeave,
    handlePromoteToAdmin,
    handleEditNameChange: (event) => setEditName(event.target.value),
    handleEditDescriptionChange: (event) => setEditDescription(event.target.value),
    handleAddSearchChange: (event) => setAddSearch(event.target.value),
    handleClearAddIds: () => setAddIds([]),
    getRemoveAddIdHandler: (userId) => () => setAddIds((previous) => previous.filter((id) => id !== userId)),
    getToggleAddIdHandler: (userId) => () => setAddIds((previous) =>
      previous.includes(userId) ? previous.filter((id) => id !== userId) : [...previous, userId]
    ),
    getPromoteMemberHandler: (userId) => () => handlePromoteToAdmin(userId),
    getRemoveMemberHandler: (userId) => () => handleRemoveMember(userId),
    openEditView: () => setView('edit'),
    openAddMembersView: () => setView('addMembers'),
    closeMinMemberWarning: () => setMinMemberWarning(false),
    openAvatarLightbox: () => setAvatarLightbox(true),
    closeAvatarLightbox: () => setAvatarLightbox(false),
    closeToast: () => setToast(''),
    removeEditPhoto: () => {
      if (editPhoto?.previewUrl) URL.revokeObjectURL(editPhoto.previewUrl)
      setEditPhoto(null)
    },
    openPhotoPicker: () => photoInputRef.current?.click(),
    handleHeaderBack: () => view === 'info' ? onClose() : setView('info'),
    stopPropagation: (event) => event.stopPropagation(),
  }
}
