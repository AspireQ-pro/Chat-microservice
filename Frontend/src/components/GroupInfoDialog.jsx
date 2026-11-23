import React from 'react'
import {
  Box, Typography, Avatar, TextField, Button,
  CircularProgress, Alert, Dialog, Slide,
  IconButton, InputAdornment, Chip, Divider, Tooltip,
  Snackbar,
} from '@mui/material'
import {
  ArrowBackIos, Close, Search, Check,
  CameraAlt, Edit, PersonAdd, PersonRemove, ExitToApp,
  People, DeleteForever, AdminPanelSettings,
} from '@mui/icons-material'
import AuthenticatedAvatar from '@/features/media/AuthenticatedAvatar'
import {
  formatJoinedDate,
  getAvatarColor,
  getInitials,
  useGroupInfoDialogLogic,
} from '../handler/componentLogic'

const SlideUp = React.forwardRef(function SlideUp(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />
})

/* ════════════════════════════════════════════════
   GroupInfoDialog
════════════════════════════════════════════════ */
function GroupInfoDialog({
  open,
  onClose,
  room,
  currentUserId,
  contacts,
}) {
  const {
    isMobileOrTablet,
    members,
    isOwner,
    view,
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
    leaving,
    deleting,
    actionError,
    avatarLightbox,
    minMemberWarning,
    toast,
    hasContactsToAdd,
    addableContactRows,
    selectedAddContacts,
    memberRows,
    isLastAdmin,
    tooFewAfterLeave,
    leaveBlocked,
    leaveTooltip,
    headerTitle,
    handlePhotoChange,
    handleSaveInfo,
    handleAddMembers,
    handleDeleteGroup,
    handleLeave,
    handleEditNameChange,
    handleEditDescriptionChange,
    handleAddSearchChange,
    handleClearAddIds,
    getRemoveAddIdHandler,
    getToggleAddIdHandler,
    getPromoteMemberHandler,
    getRemoveMemberHandler,
    openEditView,
    openAddMembersView,
    closeMinMemberWarning,
    openAvatarLightbox,
    closeAvatarLightbox,
    closeToast,
    removeEditPhoto,
    openPhotoPicker,
    handleHeaderBack,
    stopPropagation,
  } = useGroupInfoDialogLogic({ open, onClose, room, currentUserId, contacts })

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
              onClick={(savedAvatarPreview || room?.avatarUrl) ? openAvatarLightbox : undefined}
              sx={{
                width: 80,
                height: 80,
                bgcolor: '#7e57c2',
                fontSize: '1.8rem',
                fontWeight: 700,
                cursor: (savedAvatarPreview || room?.avatarUrl) ? 'zoom-in' : 'default',
              }}
            >
              {getInitials(room?.name || 'GR')}
            </AuthenticatedAvatar>
            {isOwner && (
              <Tooltip title="Edit group">
                <Box
                  onClick={openEditView}
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
                  onClick={openAddMembersView}
                  sx={{ color: '#3C4F4A', '&:hover': { bgcolor: '#EEF2F1' } }}
                >
                  <PersonAdd sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>

          {/* Min-member warning — shown when removal would violate the 2-non-admin rule */}
          {minMemberWarning && (
            <Alert
              severity="warning"
              sx={{ mb: 1.5, borderRadius: 2, py: 0.75, fontSize: '0.8rem', alignItems: 'flex-start' }}
              onClose={closeMinMemberWarning}
            >
              <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5, fontSize: '0.8rem' }}>
                A group must have at least 2 members besides the admins.
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Add more members or delete the group.
              </Typography>
              <Button
                size="small"
                variant="outlined"
                color="error"
                startIcon={deleting ? <CircularProgress size={12} color="inherit" /> : <DeleteForever sx={{ fontSize: '1rem !important' }} />}
                disabled={deleting}
                onClick={handleDeleteGroup}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  py: 0.25,
                  px: 1,
                  borderRadius: 1.5,
                  borderColor: '#ef9a9a',
                  color: '#c62828',
                  '&:hover': { bgcolor: '#FEEBEE', borderColor: '#c62828' },
                }}
              >
                {deleting ? 'Deleting…' : 'Delete group'}
              </Button>
            </Alert>
          )}

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
            {memberRows.map((memberRow) => {
                const { user, isMe, isMemberAdmin, isCreator, isRemoving, isPromoting, index } = memberRow
                return (
                  <Box key={memberRow.userId || index}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        px: 1.75,
                        py: 1.25,
                        gap: 1.5,
                      }}
                    >
                      <AuthenticatedAvatar
                        src={user.avatarUrl || undefined}
                        sx={{
                          width: 40,
                          height: 40,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          bgcolor: isMe ? '#2D4A44' : getAvatarColor(user.name || ''),
                          color: '#fff',
                          flexShrink: 0,
                        }}
                      >
                        {getInitials(user.name || '?')}
                      </AuthenticatedAvatar>

                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {isMe ? 'You' : (user.name || 'Unknown')}
                          </Typography>
                          {isMemberAdmin && (
                            <Chip
                              label={isCreator ? 'Admin' : 'Admin'}
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
                          {isMe && !isMemberAdmin && (
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
                          {memberRow.joinedAt ? ` · Joined ${formatJoinedDate(memberRow.joinedAt)}` : ''}
                        </Typography>
                      </Box>

                      {/* Admin actions: promote or remove non-admin members */}
                      {isOwner && !isMe && !isMemberAdmin && (
                        <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                          <Tooltip title="Make Admin">
                            <IconButton
                              size="small"
                              disabled={isPromoting || isRemoving}
                              onClick={getPromoteMemberHandler(memberRow.userId)}
                              sx={{ color: '#2D4A44', '&:hover': { bgcolor: '#E8F5E9' } }}
                            >
                              {isPromoting
                                ? <CircularProgress size={16} color="inherit" />
                                : <AdminPanelSettings sx={{ fontSize: 18 }} />}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Remove from group">
                            <IconButton
                              size="small"
                              disabled={isRemoving || isPromoting}
                              onClick={getRemoveMemberHandler(memberRow.userId)}
                              sx={{ color: '#c62828', '&:hover': { bgcolor: '#FEEBEE' } }}
                            >
                              {isRemoving
                                ? <CircularProgress size={16} color="inherit" />
                                : <PersonRemove sx={{ fontSize: 18 }} />}
                            </IconButton>
                          </Tooltip>
                        </Box>
                      )}
                    </Box>
                    {index < members.length - 1 && <Divider />}
                  </Box>
                )
              })}
          </Box>
        </Box>

        {/* Leave group — available to all members including admins.
            Blocked only when the current user is the sole remaining admin
            (leaving would make the group unmanageable). */}
        <Box sx={{ px: 2.5, pt: 1.5, pb: 3 }}>
              <Tooltip
                title={leaveTooltip}
                disableHoverListener={!leaveBlocked}
                disableFocusListener={!leaveBlocked}
                disableTouchListener={!leaveBlocked}
              >
                <span style={{ display: 'block' }}>
                  <Button
                    fullWidth
                    variant="outlined"
                    color="error"
                    startIcon={leaving ? <CircularProgress size={16} color="inherit" /> : <ExitToApp />}
                    disabled={leaving || leaveBlocked}
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
                </span>
              </Tooltip>
              {isLastAdmin && (
                <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: 'text.secondary', textAlign: 'center' }}>
                  You're the only admin. Promote someone before leaving.
                </Typography>
              )}
              {!isLastAdmin && tooFewAfterLeave && (
                <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: 'text.secondary', textAlign: 'center' }}>
                  A group must have at least 3 members. Add more members or delete the group.
                </Typography>
              )}
        </Box>

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
            onClick={openPhotoPicker}
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
            onClick={openPhotoPicker}
          >
            {editPhoto ? 'Change photo' : 'Change group photo'}
          </Typography>
          {editPhoto && (
            <Typography
              variant="caption"
              sx={{ color: '#c62828', cursor: 'pointer', mt: 0.25 }}
              onClick={removeEditPhoto}
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
          onChange={handleEditNameChange}
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
          onChange={handleEditDescriptionChange}
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
          onChange={handleAddSearchChange}
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
              onClick={handleClearAddIds}
            >
              Clear all
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {selectedAddContacts.map((c) => (
              <Chip
                key={c.id} size="small"
                avatar={
                  <Avatar sx={{ bgcolor: getAvatarColor(c.name), fontSize: '0.6rem', width: 22, height: 22 }}>
                    {getInitials(c.name)}
                  </Avatar>
                }
                label={c.name?.split(' ')[0] || c.name}
                onDelete={getRemoveAddIdHandler(c.id)}
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
        {addableContactRows.length === 0 ? (
          <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.disabled">
              {!hasContactsToAdd
                ? 'All contacts are already in this group'
                : 'No contacts found'}
            </Typography>
          </Box>
        ) : (
          addableContactRows.map((c) => {
            const selected = c.selected
            return (
              <Box
                key={c.id}
                onClick={getToggleAddIdHandler(c.id)}
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
                    bgcolor: getAvatarColor(c.name),
                    fontSize: '0.85rem', fontWeight: 600, color: '#fff',
                    mr: 1.5, flexShrink: 0,
                  }}
                >
                  {getInitials(c.name)}
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
        onClick={handleHeaderBack}
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
      onClose={closeToast}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      message={toast}
      ContentProps={{
        sx: { bgcolor: '#2D4A44', color: '#fff', borderRadius: '10px', fontWeight: 500, fontSize: '0.85rem' },
      }}
    />
  )

  /* ── Avatar lightbox ── */
  const AvatarLightbox = (
    <Dialog
      open={avatarLightbox}
      onClose={closeAvatarLightbox}
      maxWidth={false}
      PaperProps={{
        sx: {
          bgcolor: 'transparent',
          boxShadow: 'none',
          overflow: 'visible',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
      }}
      slotProps={{ backdrop: { sx: { bgcolor: 'rgba(0,0,0,0.85)' } } }}
      onClick={closeAvatarLightbox}
    >
      <Box sx={{ position: 'relative' }} onClick={stopPropagation}>
        <AuthenticatedAvatar
          src={savedAvatarPreview || room?.avatarUrl || undefined}
          sx={{ width: 280, height: 280, fontSize: '5rem', bgcolor: '#7e57c2' }}
        >
          {getInitials(room?.name || 'GR')}
        </AuthenticatedAvatar>
        <IconButton
          onClick={closeAvatarLightbox}
          size="small"
          sx={{
            position: 'absolute', top: -12, right: -12,
            bgcolor: 'rgba(0,0,0,0.6)', color: '#fff',
            '&:hover': { bgcolor: 'rgba(0,0,0,0.85)' },
          }}
        >
          <Close sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>
    </Dialog>
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
        {AvatarLightbox}
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
      {AvatarLightbox}
    </Dialog>
  )
}

export default GroupInfoDialog
