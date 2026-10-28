import React, { useState, useMemo, useRef, useEffect } from 'react'
import {
  Box, Typography, Avatar, TextField, Button,
  CircularProgress, Alert, Dialog, Slide,
  IconButton, InputAdornment, Chip, Divider, Tooltip,
  Snackbar,
} from '@mui/material'
import {
  ArrowBackIos, Close, Search, Check,
  CameraAlt, Edit, PersonAdd, PersonRemove, ExitToApp,
  People,
} from '@mui/icons-material'
import { useTheme, useMediaQuery } from '@mui/material'
import { useDispatch } from 'react-redux'
import AuthenticatedAvatar from '@/features/media/AuthenticatedAvatar'
import {
  updateGroupInfo,
  addGroupMembers,
  removeGroupMember,
  leaveGroup,
  uploadGroupAvatar,
} from '@/provider/chatSlice'

/* ─── helpers ─────────────────────────────────── */
function initials(name = '') {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

const AVATAR_COLORS = [
  '#A8C5BD', '#B5C8E2', '#C8B5D4', '#D4C4A8', '#A8D4B5',
  '#D4A8B5', '#B5D4C8', '#C8D4A8', '#A8B5D4', '#D4B5A8',
]
function avatarColor(name = '') {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function formatJoinedDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d)) return ''
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

const SlideUp = React.forwardRef(function SlideUp(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />
})

/* ════════════════════════════════════════════════
   GroupInfoDialog
   Mimics WhatsApp-style group info:
     - View / edit group name, description, avatar (owner only)
     - Member list with remove (owner only)
     - Add members panel (owner only)
     - Leave group (non-owner)
════════════════════════════════════════════════ */
function GroupInfoDialog({
  open,
  onClose,
  room,
  currentUserId,
  contacts,         // all project contacts to pick from when adding
}) {
  const dispatch = useDispatch()
  const theme = useTheme()
  const isMobileOrTablet = useMediaQuery(theme.breakpoints.down('md'))

  /* ── Derived data ── */
  const members = room?.members || []
  // Use the server-computed createdById from the room object (set by serializeRoomForUser)
  // rather than re-sorting locally by joinedAt, which is fragile when timestamps are equal
  // or when the members array is incomplete.
  const createdById = room?.createdById || null
  const isOwner = !!(currentUserId && createdById && currentUserId === createdById)

  /* ── View modes: 'info' | 'edit' | 'addMembers' ── */
  const [view, setView] = useState('info')

  /* ── Edit state ── */
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPhoto, setEditPhoto] = useState(null)   // { file, previewUrl }
  const [savedAvatarPreview, setSavedAvatarPreview] = useState(null) // blob URL kept for info view
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const photoInputRef = useRef(null)

  /* ── Add-members state ── */
  const [addSearch, setAddSearch] = useState('')
  const [addIds, setAddIds] = useState([])
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  /* ── Remove / leave state ── */
  const [removingId, setRemovingId] = useState(null)
  const [leaving, setLeaving] = useState(false)
  const [actionError, setActionError] = useState('')

  /* ── Toast ── */
  const [toast, setToast] = useState('')

  // Reset local state when dialog opens
  useEffect(() => {
    if (open) {
      setView('info')
      setSaveError('')
      setAddError('')
      setActionError('')
      setAddIds([])
      setAddSearch('')
      setSavedAvatarPreview(null)
    }
  }, [open])

  // Pre-fill edit fields when entering edit view
  useEffect(() => {
    if (view === 'edit') {
      setEditName(room?.name || '')
      setEditDescription(room?.description || '')
      setEditPhoto(null)
      setSaveError('')
    }
  }, [view, room])

  // Cleanup object URLs
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

  /* ── Contacts eligible to be added (not already members) ── */
  const memberUserIds = useMemo(() => new Set(members.map((m) => m.userId)), [members])
  const addableContacts = useMemo(() => {
    const q = addSearch.toLowerCase()
    return contacts.filter(
      (c) =>
        !memberUserIds.has(c.id) &&
        (!q || (c.name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q))
    )
  }, [contacts, memberUserIds, addSearch])

  const selectedAddContacts = contacts.filter((c) => addIds.includes(c.id))

  /* ── handlers ── */
  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      setSaveError('Choose a JPEG, PNG, GIF, or WebP image.')
      e.target.value = ''
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setSaveError('Group images must be 10 MB or smaller.')
      e.target.value = ''
      return
    }
    setSaveError('')
    if (editPhoto?.previewUrl) URL.revokeObjectURL(editPhoto.previewUrl)
    setEditPhoto({ file, previewUrl: URL.createObjectURL(file) })
    e.target.value = ''
  }

  const handleSaveInfo = async () => {
    const name = editName.trim()
    if (!name) { setSaveError('Group name cannot be empty'); return }
    setSaving(true)
    setSaveError('')
    try {
      let avatarUrl = undefined
      const previewUrl = editPhoto?.previewUrl || null
      if (editPhoto?.file) {
        const result = await dispatch(uploadGroupAvatar({ file: editPhoto.file })).unwrap()
        avatarUrl = result?.avatarUrl || undefined
      }
      const payload = { roomId: room.id, name }
      if (editDescription !== (room?.description || '')) payload.description = editDescription
      if (avatarUrl !== undefined) payload.avatarUrl = avatarUrl
      await dispatch(updateGroupInfo(payload)).unwrap()
      // Keep the local blob preview so the Info view shows the new photo immediately,
      // even if the server URL hasn't propagated to Redux yet or uses a different hostname.
      if (previewUrl) setSavedAvatarPreview(previewUrl)
      setToast('Group info updated')
      setView('info')
    } catch (err) {
      setSaveError(typeof err === 'string' ? err : err?.message || 'Failed to update group')
    } finally {
      setSaving(false)
    }
  }

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
    } catch (err) {
      setAddError(typeof err === 'string' ? err : err?.message || 'Failed to add members')
    } finally {
      setAdding(false)
    }
  }

  const handleRemoveMember = async (userId) => {
    setRemovingId(userId)
    setActionError('')
    try {
      await dispatch(removeGroupMember({ roomId: room.id, userId })).unwrap()
      setToast('Member removed')
    } catch (err) {
      setActionError(typeof err === 'string' ? err : err?.message || 'Failed to remove member')
    } finally {
      setRemovingId(null)
    }
  }

  const handleLeave = async () => {
    setLeaving(true)
    setActionError('')
    try {
      await dispatch(leaveGroup(room.id)).unwrap()
      onClose()
    } catch (err) {
      setActionError(typeof err === 'string' ? err : err?.message || 'Failed to leave group')
    } finally {
      setLeaving(false)
    }
  }

  /* ─────────────────────────────────────────────
     VIEW: INFO
  ───────────────────────────────────────────── */
  const ViewInfo = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ flex: 1, overflowY: 'auto' }}>

        {/* Group hero section */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            pt: 3,
            pb: 2.5,
            px: 2,
            bgcolor: '#F8FAF9',
            borderBottom: '1px solid #EEF0EF',
            position: 'relative',
          }}
        >
          <Box sx={{ position: 'relative' }}>
            <AuthenticatedAvatar
              src={savedAvatarPreview || room?.avatarUrl || undefined}
              sx={{
                width: 80,
                height: 80,
                bgcolor: '#7e57c2',
                fontSize: '1.8rem',
                fontWeight: 700,
              }}
            >
              {initials(room?.name || 'GR')}
            </AuthenticatedAvatar>
            {isOwner && (
              <Tooltip title="Edit group">
                <Box
                  onClick={() => setView('edit')}
                  sx={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    bgcolor: '#2D4A44',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid #F8FAF9',
                    cursor: 'pointer',
                  }}
                >
                  <Edit sx={{ fontSize: 13, color: '#fff' }} />
                </Box>
              </Tooltip>
            )}
          </Box>

          <Typography
            sx={{
              mt: 1.5,
              fontWeight: 700,
              fontSize: '1.15rem',
              color: '#172A26',
              textAlign: 'center',
            }}
          >
            {room?.name}
          </Typography>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: 0.25 }}
          >
            Group · {members.length} member{members.length !== 1 ? 's' : ''}
          </Typography>
        </Box>

        {/* Description */}
        {room?.description && (
          <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid #EEF0EF' }}>
            <Typography variant="caption" fontWeight={600} color="text.disabled" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Description
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5, color: '#2C3E3A', lineHeight: 1.6 }}>
              {room.description}
            </Typography>
          </Box>
        )}

        {/* Members section */}
        <Box sx={{ px: 2.5, pt: 2, pb: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <People sx={{ fontSize: 16, color: '#3C4F4A' }} />
              <Typography variant="body2" fontWeight={700} color="#172A26">
                {members.length} member{members.length !== 1 ? 's' : ''}
              </Typography>
            </Box>
            {isOwner && (
              <Tooltip title="Add members">
                <IconButton
                  size="small"
                  onClick={() => setView('addMembers')}
                  sx={{ color: '#3C4F4A', '&:hover': { bgcolor: '#EEF2F1' } }}
                >
                  <PersonAdd sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>

          {actionError && (
            <Alert severity="error" sx={{ mb: 1.5, borderRadius: 2, py: 0.5, fontSize: '0.8rem' }}>
              {actionError}
            </Alert>
          )}

          <Box
            sx={{
              border: '1px solid #EEF0EF',
              borderRadius: '12px',
              overflow: 'hidden',
            }}
          >
            {members
              .slice()
              .sort((a, b) => {
                // Creator first, then others alphabetically
                if (a.userId === createdById) return -1
                if (b.userId === createdById) return 1
                return (a.user?.name || '').localeCompare(b.user?.name || '')
              })
              .map((m, idx) => {
                const user = m.user || {}
                const isMe = m.userId === currentUserId
                const isCreator = m.userId === createdById
                const isRemoving = removingId === m.userId

                return (
                  <Box key={m.userId || idx}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        px: 1.75,
                        py: 1.25,
                        gap: 1.5,
                      }}
                    >
                      <Avatar
                        sx={{
                          width: 40,
                          height: 40,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          bgcolor: isMe ? '#2D4A44' : avatarColor(user.name || ''),
                          color: '#fff',
                          flexShrink: 0,
                        }}
                      >
                        {initials(user.name || '?')}
                      </Avatar>

                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {isMe ? 'You' : (user.name || 'Unknown')}
                          </Typography>
                          {isCreator && (
                            <Chip
                              label="Admin"
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: '0.6rem',
                                fontWeight: 700,
                                bgcolor: '#E8F5E9',
                                color: '#2E7D32',
                                borderRadius: '6px',
                              }}
                            />
                          )}
                          {isMe && !isCreator && (
                            <Chip
                              label="You"
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: '0.6rem',
                                fontWeight: 700,
                                bgcolor: '#E3F2FD',
                                color: '#1565C0',
                                borderRadius: '6px',
                              }}
                            />
                          )}
                        </Box>
                        <Typography variant="caption" color="text.disabled" noWrap sx={{ display: 'block' }}>
                          {user.email || ''}
                          {m.joinedAt ? ` · Joined ${formatJoinedDate(m.joinedAt)}` : ''}
                        </Typography>
                      </Box>

                      {/* Owner can remove non-admin members */}
                      {isOwner && !isMe && !isCreator && (
                        <Tooltip title="Remove from group">
                          <IconButton
                            size="small"
                            disabled={isRemoving}
                            onClick={() => handleRemoveMember(m.userId)}
                            sx={{ color: '#c62828', '&:hover': { bgcolor: '#FEEBEE' }, flexShrink: 0 }}
                          >
                            {isRemoving
                              ? <CircularProgress size={16} color="inherit" />
                              : <PersonRemove sx={{ fontSize: 18 }} />}
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                    {idx < members.length - 1 && <Divider />}
                  </Box>
                )
              })}
          </Box>
        </Box>

        {/* Leave group — non-owners */}
        {!isOwner && (
          <Box sx={{ px: 2.5, pt: 1.5, pb: 3 }}>
            <Button
              fullWidth
              variant="outlined"
              color="error"
              startIcon={leaving ? <CircularProgress size={16} color="inherit" /> : <ExitToApp />}
              disabled={leaving}
              onClick={handleLeave}
              sx={{
                borderRadius: '12px',
                height: 48,
                fontWeight: 600,
                textTransform: 'none',
                fontSize: '0.9rem',
                borderColor: '#ef9a9a',
                color: '#c62828',
                '&:hover': { bgcolor: '#FEEBEE', borderColor: '#c62828' },
              }}
            >
              {leaving ? 'Leaving…' : 'Exit group'}
            </Button>
          </Box>
        )}

        <Box sx={{ pb: 2 }} />
      </Box>
    </Box>
  )

  /* ─────────────────────────────────────────────
     VIEW: EDIT
  ───────────────────────────────────────────── */
  const ViewEdit = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ flex: 1, overflowY: 'auto', px: 2, pt: 2.5, pb: 1 }}>

        {/* Avatar picker */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            style={{ display: 'none' }}
            onChange={handlePhotoChange}
          />
          <Box
            sx={{ position: 'relative', cursor: 'pointer' }}
            onClick={() => photoInputRef.current?.click()}
          >
            <AuthenticatedAvatar
              src={editPhoto?.previewUrl || room?.avatarUrl || undefined}
              sx={{
                width: 80,
                height: 80,
                bgcolor: '#DDE8E5',
                fontSize: !editPhoto && !room?.avatarUrl ? '2rem' : 0,
              }}
            >
              {!editPhoto && !room?.avatarUrl && '🌱'}
            </AuthenticatedAvatar>
            <Box
              sx={{
                position: 'absolute', bottom: 0, right: 0,
                width: 26, height: 26, borderRadius: '50%',
                bgcolor: '#2D4A44',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid #fff',
                pointerEvents: 'none',
              }}
            >
              <CameraAlt sx={{ fontSize: 13, color: '#fff' }} />
            </Box>
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: 1, cursor: 'pointer' }}
            onClick={() => photoInputRef.current?.click()}
          >
            {editPhoto ? 'Change photo' : 'Change group photo'}
          </Typography>
          {editPhoto && (
            <Typography
              variant="caption"
              sx={{ color: '#c62828', cursor: 'pointer', mt: 0.25 }}
              onClick={() => { URL.revokeObjectURL(editPhoto.previewUrl); setEditPhoto(null) }}
            >
              Remove
            </Typography>
          )}
        </Box>

        {/* Name */}
        <Typography variant="body2" fontWeight={600} sx={{ mb: 0.75, color: '#172A26' }}>
          Group name
        </Typography>
        <TextField
          fullWidth size="small"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          inputProps={{ maxLength: 50 }}
          sx={{
            mb: 0.5,
            '& .MuiOutlinedInput-root': {
              borderRadius: '10px',
              '& fieldset': { borderColor: '#D5DCD9' },
              '&.Mui-focused fieldset': { borderColor: '#3C4F4A' },
            },
          }}
        />
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', textAlign: 'right', mb: 2 }}>
          {editName.length} / 50
        </Typography>

        {/* Description */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
          <Typography variant="body2" fontWeight={600} color="#172A26">Description</Typography>
          <Typography variant="caption" color="text.disabled">Optional</Typography>
        </Box>
        <TextField
          fullWidth multiline minRows={3}
          placeholder="What's this group about?"
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          inputProps={{ maxLength: 500 }}
          sx={{
            mb: 2.5,
            '& .MuiOutlinedInput-root': {
              borderRadius: '10px',
              '& fieldset': { borderColor: '#D5DCD9' },
              '&.Mui-focused fieldset': { borderColor: '#3C4F4A' },
            },
          }}
        />

        {saveError && (
          <Alert severity="error" sx={{ borderRadius: 2, py: 0.5, mb: 1.5 }}>
            {saveError}
          </Alert>
        )}
      </Box>

      <Box sx={{ px: 2, pt: 1.5, pb: 2, borderTop: '1px solid #EEF0EF', bgcolor: '#fff' }}>
        <Button
          fullWidth variant="contained"
          disabled={saving || !editName.trim()}
          onClick={handleSaveInfo}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
          sx={{
            bgcolor: '#2D4A44', color: '#fff', borderRadius: '12px', height: 52,
            fontSize: '0.95rem', fontWeight: 600, textTransform: 'none',
            boxShadow: 'none',
            '&:hover': { bgcolor: '#213832', boxShadow: 'none' },
            '&:disabled': { bgcolor: '#B0BDB9', color: '#fff' },
          }}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </Box>
    </Box>
  )

  /* ─────────────────────────────────────────────
     VIEW: ADD MEMBERS
  ───────────────────────────────────────────── */
  const ViewAddMembers = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Search */}
      <Box sx={{ px: 2, pt: 2, pb: 1 }}>
        <TextField
          fullWidth size="small"
          placeholder="Search name or email"
          value={addSearch}
          onChange={(e) => setAddSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ fontSize: 18, color: 'text.disabled' }} />
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: '12px', bgcolor: '#F5F7F6',
              '& fieldset': { borderColor: '#E0E5E3' },
              '&.Mui-focused fieldset': { borderColor: '#3C4F4A' },
            },
          }}
        />
      </Box>

      {/* Selected chips */}
      {selectedAddContacts.length > 0 && (
        <Box sx={{ px: 2, pb: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
            <Typography variant="caption" fontWeight={600} color="text.secondary">
              {selectedAddContacts.length} selected
            </Typography>
            <Typography
              variant="caption" color="#3C4F4A" fontWeight={600}
              sx={{ cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => setAddIds([])}
            >
              Clear all
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {selectedAddContacts.map((c) => (
              <Chip
                key={c.id} size="small"
                avatar={
                  <Avatar sx={{ bgcolor: avatarColor(c.name), fontSize: '0.6rem', width: 22, height: 22 }}>
                    {initials(c.name)}
                  </Avatar>
                }
                label={c.name?.split(' ')[0] || c.name}
                onDelete={() => setAddIds((prev) => prev.filter((id) => id !== c.id))}
                deleteIcon={<Close sx={{ fontSize: '14px !important' }} />}
                sx={{
                  bgcolor: '#EEF2F1', border: '1px solid #D5DCD9',
                  borderRadius: '20px', fontSize: '0.78rem', height: 28,
                  '& .MuiChip-deleteIcon': { color: '#3C4F4A' },
                }}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Contact list */}
      <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {addableContacts.length === 0 ? (
          <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.disabled">
              {contacts.filter((c) => !memberUserIds.has(c.id)).length === 0
                ? 'All contacts are already in this group'
                : 'No contacts found'}
            </Typography>
          </Box>
        ) : (
          addableContacts.map((c) => {
            const selected = addIds.includes(c.id)
            return (
              <Box
                key={c.id}
                onClick={() => setAddIds((prev) =>
                  prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                )}
                sx={{
                  display: 'flex', alignItems: 'center',
                  px: 2, py: 1.25, cursor: 'pointer',
                  borderBottom: '1px solid #F0F0F0',
                  bgcolor: selected ? '#F0F5F4' : 'transparent',
                  transition: 'background 0.15s',
                  '&:active': { bgcolor: '#E8EEEC' },
                }}
              >
                <Avatar
                  sx={{
                    width: 42, height: 42,
                    bgcolor: avatarColor(c.name),
                    fontSize: '0.85rem', fontWeight: 600, color: '#fff',
                    mr: 1.5, flexShrink: 0,
                  }}
                >
                  {initials(c.name)}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={500} noWrap>{c.name}</Typography>
                  <Typography variant="caption" color="text.disabled" noWrap>{c.email}</Typography>
                </Box>
                <Box
                  sx={{
                    width: 24, height: 24, borderRadius: '50%',
                    border: selected ? 'none' : '2px solid #C5CDC9',
                    bgcolor: selected ? '#2D4A44' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'background 0.15s, border 0.15s',
                  }}
                >
                  {selected && <Check sx={{ fontSize: 14, color: '#fff' }} />}
                </Box>
              </Box>
            )
          })
        )}
      </Box>

      {addError && (
        <Box sx={{ px: 2, pb: 1 }}>
          <Alert severity="error" sx={{ borderRadius: 2, py: 0.5, fontSize: '0.8rem' }}>
            {addError}
          </Alert>
        </Box>
      )}

      <Box sx={{ px: 2, pt: 1.5, pb: 2, borderTop: '1px solid #EEF0EF', bgcolor: '#fff' }}>
        <Button
          fullWidth variant="contained"
          disabled={addIds.length === 0 || adding}
          onClick={handleAddMembers}
          startIcon={adding ? <CircularProgress size={16} color="inherit" /> : null}
          sx={{
            bgcolor: '#2D4A44', color: '#fff', borderRadius: '12px', height: 52,
            fontSize: '0.95rem', fontWeight: 600, textTransform: 'none',
            boxShadow: 'none',
            '&:hover': { bgcolor: '#213832', boxShadow: 'none' },
            '&:disabled': { bgcolor: '#B0BDB9', color: '#fff' },
          }}
        >
          {adding ? 'Adding…' : `Add ${addIds.length > 0 ? addIds.length : ''} member${addIds.length !== 1 ? 's' : ''}`}
        </Button>
      </Box>
    </Box>
  )

  /* ─────────────────────────────────────────────
     HEADER
  ───────────────────────────────────────────── */
  const headerTitle =
    view === 'edit' ? 'Edit group' :
    view === 'addMembers' ? 'Add members' :
    'Group info'

  const Header = (
    <Box
      sx={{
        display: 'flex', alignItems: 'center',
        px: 2, py: 1.5,
        borderBottom: '1px solid #EEF0EF',
        bgcolor: '#fff', minHeight: 56, flexShrink: 0,
      }}
    >
      <IconButton
        size="small"
        onClick={view === 'info' ? onClose : () => setView('info')}
        sx={{ mr: 1, p: 0.5, color: '#3C4F4A' }}
      >
        <ArrowBackIos sx={{ fontSize: 16 }} />
      </IconButton>
      <Typography
        sx={{
          flex: 1,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 600, fontSize: '1.05rem', color: '#172A26',
        }}
      >
        {headerTitle}
      </Typography>
      <Typography
        onClick={onClose}
        sx={{
          cursor: 'pointer', color: '#3C4F4A',
          fontWeight: 500, fontSize: '0.9rem', userSelect: 'none',
        }}
      >
        Close
      </Typography>
    </Box>
  )

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */
  const activeView = view === 'edit' ? ViewEdit : view === 'addMembers' ? ViewAddMembers : ViewInfo

  const Toast = (
    <Snackbar
      open={!!toast}
      autoHideDuration={3000}
      onClose={() => setToast('')}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      message={toast}
      ContentProps={{
        sx: { bgcolor: '#2D4A44', color: '#fff', borderRadius: '10px', fontWeight: 500, fontSize: '0.85rem' },
      }}
    />
  )

  if (isMobileOrTablet) {
    return (
      <Dialog
        open={open} onClose={onClose}
        fullScreen
        TransitionComponent={SlideUp}
        PaperProps={{ sx: { display: 'flex', flexDirection: 'column', bgcolor: '#fff' } }}
      >
        {Header}
        <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Sliding panels */}
          {['info', 'edit', 'addMembers'].map((v) => (
            <Box
              key={v}
              sx={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex', flexDirection: 'column',
                transform: view === v ? 'translateX(0%)' : view > v ? 'translateX(-100%)' : 'translateX(100%)',
                transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
                bgcolor: '#fff',
              }}
            >
              {v === 'info' && ViewInfo}
              {v === 'edit' && ViewEdit}
              {v === 'addMembers' && ViewAddMembers}
            </Box>
          ))}
        </Box>
        {Toast}
      </Dialog>
    )
  }

  return (
    <Dialog
      open={open} onClose={onClose}
      fullWidth maxWidth="xs"
      PaperProps={{
        sx: {
          borderRadius: '16px', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          height: 620, maxHeight: '90vh',
        },
      }}
    >
      {Header}
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        {['info', 'edit', 'addMembers'].map((v, i) => {
          const order = ['info', 'edit', 'addMembers']
          const currentIdx = order.indexOf(view)
          const thisIdx = order.indexOf(v)
          const transform =
            currentIdx === thisIdx ? 'translateX(0%)' :
            thisIdx < currentIdx ? 'translateX(-100%)' : 'translateX(100%)'
          return (
            <Box
              key={v}
              sx={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex', flexDirection: 'column',
                transform,
                transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
                willChange: 'transform',
                bgcolor: '#fff',
              }}
            >
              {v === 'info' && ViewInfo}
              {v === 'edit' && ViewEdit}
              {v === 'addMembers' && ViewAddMembers}
            </Box>
          )
        })}
      </Box>
      {Toast}
    </Dialog>
  )
}

export default GroupInfoDialog
