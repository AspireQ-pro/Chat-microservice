import React from 'react'
import {
  Box, Typography, Avatar, TextField, Button,
  CircularProgress, Alert, Dialog, Slide,
  IconButton, InputAdornment,
  Snackbar, Switch, FormControlLabel, Checkbox,
} from '@mui/material'
import {
  ArrowBackIos, Close, Search, Check,
  CameraAlt, Edit, CheckBox, CheckBoxOutlineBlank, IndeterminateCheckBox,
} from '@mui/icons-material'
import { getAvatarColor, getInitials, useCreateGroupDialogLogic } from '../handler/componentLogic'

/* ─── Slide-up transition for mobile fullscreen ── */
const SlideUp = React.forwardRef(function SlideUp(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />
})

/* ════════════════════════════════════════════════
   Main component
════════════════════════════════════════════════ */
function CreateGroupDialog({
  open, onClose, contacts,
  groupName, setGroupName,
  groupMemberIds, toggleGroupMember,
  groupCreating, groupError,
  handleCreateGroup,
}) {
  const {
    isMobileOrTablet,
    uploadingAvatar,
    photoError,
    toastOpen,
    step,
    memberSearch,
    description,
    adminOnlyMessages,
    groupPhoto,
    photoInputRef,
    filteredContactRows,
    selectedContacts,
    allFilteredSelected,
    someFilteredSelected,
    selectedNames,
    handlePhotoChange,
    handleCreateGroup: onCreateGroup,
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
  } = useCreateGroupDialogLogic({
    open,
    onClose,
    contacts,
    groupName,
    setGroupName,
    groupMemberIds,
    toggleGroupMember,
    handleCreateGroup,
  })

  /* ══════════════
     STEP 1 BODY
  ══════════════ */
  const Step1 = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Search */}
      <Box sx={{ px: 2, pt: 2, pb: 1 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search name or email"
          value={memberSearch}
          onChange={handleMemberSearchChange}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ fontSize: 18, color: 'text.disabled' }} />
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: '12px',
              bgcolor: '#F5F7F6',
              '& fieldset': { borderColor: '#E0E5E3' },
              '&.Mui-focused fieldset': { borderColor: '#3C4F4A' },
            },
          }}
        />
      </Box>

      {/* Selected count badge */}
      {selectedContacts.length > 0 && (
        <Box sx={{ px: 2, pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              bgcolor: '#2D4A44',
              color: '#fff',
              borderRadius: '20px',
              px: 1.5,
              py: 0.4,
            }}
          >
            <Check sx={{ fontSize: 13 }} />
            <Typography variant="caption" fontWeight={600} sx={{ color: '#fff', lineHeight: 1 }}>
              {selectedContacts.length} selected
            </Typography>
          </Box>
          <Typography
            variant="caption"
            color="#3C4F4A"
            fontWeight={600}
            sx={{ cursor: 'pointer', textDecoration: 'underline' }}
            onClick={handleClearSelectedMembers}
          >
            Clear all
          </Typography>
        </Box>
      )}

      {/* Contact list */}
      <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {/* Section label + Select all checkbox */}
        {filteredContactRows.length > 0 && (
            <Box
              sx={{
                px: 2, py: 0.5,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderBottom: '1px solid #F0F0F0',
              }}
            >
              <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Contacts · {filteredContactRows.length}
              </Typography>
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', userSelect: 'none' }}
                onClick={handleToggleFilteredSelection}
              >
                <Checkbox
                  size="small"
                  checked={allFilteredSelected}
                  indeterminate={!allFilteredSelected && someFilteredSelected}
                  disableRipple
                  icon={<CheckBoxOutlineBlank sx={{ fontSize: 18, color: '#B0BDB9' }} />}
                  checkedIcon={<CheckBox sx={{ fontSize: 18, color: '#2D4A44' }} />}
                  indeterminateIcon={<IndeterminateCheckBox sx={{ fontSize: 18, color: '#2D4A44' }} />}
                  sx={{ p: 0 }}
                />
                <Typography variant="caption" fontWeight={600} sx={{ color: '#3C4F4A' }}>
                  {allFilteredSelected ? 'Deselect all' : 'Select all'}
                </Typography>
              </Box>
            </Box>
        )}

        {filteredContactRows.length === 0 ? (
          <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.disabled">No contacts found</Typography>
          </Box>
        ) : (
          filteredContactRows.map((c) => {
            const selected = c.selected
            return (
              <Box
                key={c.id}
                onClick={getToggleMemberHandler(c.id)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  px: 2,
                  py: 1.25,
                  cursor: 'pointer',
                  borderBottom: '1px solid #F0F0F0',
                  bgcolor: selected ? '#F0F5F4' : 'transparent',
                  transition: 'background 0.15s',
                  '&:active': { bgcolor: '#E8EEEC' },
                }}
              >
                <Avatar
                  sx={{
                    width: 42,
                    height: 42,
                    bgcolor: getAvatarColor(c.name),
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: '#fff',
                    mr: 1.5,
                    flexShrink: 0,
                  }}
                >
                  {getInitials(c.name)}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={500} noWrap>{c.name}</Typography>
                  <Typography variant="caption" color="text.disabled" noWrap>{c.email}</Typography>
                </Box>
                {/* Circular checkbox */}
                <Box
                  sx={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    border: selected ? 'none' : '2px solid #C5CDC9',
                    bgcolor: selected ? '#2D4A44' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'background 0.15s, border 0.15s',
                  }}
                >
                  {selected && <Check sx={{ fontSize: 14, color: '#fff', strokeWidth: 2 }} />}
                </Box>
              </Box>
            )
          })
        )}

        {/* Admin note */}
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="caption" color="text.disabled">
            You'll be added as the group admin.
          </Typography>
        </Box>
      </Box>

      {/* Bottom CTA */}
      <Box
        sx={{
          px: 2,
          pt: 1.5,
          pb: 2,
          borderTop: '1px solid #EEF0EF',
          bgcolor: '#fff',
        }}
      >
        <Button
          fullWidth
          variant="contained"
          disabled={groupMemberIds.length === 0}
          onClick={handleNextStep}
          endIcon={<span style={{ fontSize: '1rem' }}>→</span>}
          sx={{
            bgcolor: '#2D4A44',
            color: '#fff',
            borderRadius: '12px',
            height: 52,
            fontSize: '0.95rem',
            fontWeight: 600,
            textTransform: 'none',
            boxShadow: 'none',
            '&:hover': { bgcolor: '#213832', boxShadow: 'none' },
            '&:disabled': { bgcolor: '#B0BDB9', color: '#fff' },
          }}
        >
          Next: Group details
        </Button>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', textAlign: 'center', mt: 0.75 }}>
          {groupMemberIds.length} selected · {groupMemberIds.length + 1} members including you
        </Typography>
      </Box>
    </Box>
  )

  /* ══════════════
     STEP 2 BODY
  ══════════════ */
  const Step2 = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ flex: 1, overflowY: 'auto', px: 2, pt: 2, pb: 1 }}>
        {/* Group photo */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
          {/* Hidden file input */}
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
            <Avatar
              src={groupPhoto?.previewUrl || undefined}
              sx={{
                width: 80,
                height: 80,
                bgcolor: '#DDE8E5',
                fontSize: groupPhoto ? '0' : '2rem',
              }}
            >
              {!groupPhoto && '🌱'}
            </Avatar>
            <Box
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
                border: '2px solid #fff',
                pointerEvents: 'none',   // click goes to the outer Box
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
            {groupPhoto ? 'Change photo' : 'Add group photo'}
          </Typography>
          {groupPhoto && (
            <Typography
              variant="caption"
              sx={{ color: '#c62828', cursor: 'pointer', mt: 0.25 }}
              onClick={handleRemovePhoto}
            >
              Remove
            </Typography>
          )}
        </Box>

        {/* Group name */}
        <Typography variant="body2" fontWeight={600} sx={{ mb: 0.75, color: '#172A26' }}>
          Group name
        </Typography>
        <TextField
          fullWidth
          size="small"
          placeholder="e.g. Building A Garden Club"
          value={groupName}
          onChange={handleGroupNameChange}
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
          {groupName.length} / 50
        </Typography>

        {/* Description */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
          <Typography variant="body2" fontWeight={600} color="#172A26">Description</Typography>
          <Typography variant="caption" color="text.disabled">Optional</Typography>
        </Box>
        <TextField
          fullWidth
          multiline
          minRows={3}
          placeholder="What's this group about?"
          value={description}
          onChange={handleDescriptionChange}
          sx={{
            mb: 2.5,
            '& .MuiOutlinedInput-root': {
              borderRadius: '10px',
              '& fieldset': { borderColor: '#D5DCD9' },
              '&.Mui-focused fieldset': { borderColor: '#3C4F4A' },
            },
          }}
        />

        {/* Admin-only messaging toggle */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            bgcolor: '#F5F7F6',
            borderRadius: '12px',
            px: 2,
            py: 1.5,
            mb: 2.5,
          }}
        >
          <Box sx={{ flex: 1, mr: 1 }}>
            <Typography variant="body2" fontWeight={600} color="#172A26">
              Admin only can message
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Only the group admin will be able to send messages. Others can read but not reply.
            </Typography>
          </Box>
          <Switch
            checked={adminOnlyMessages}
            onChange={handleAdminOnlyMessagesChange}
            size="small"
            sx={{
              mt: 0.25,
              '& .MuiSwitch-switchBase.Mui-checked': { color: '#2D4A44' },
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#2D4A44' },
            }}
          />
        </Box>

        {/* Members summary */}
        <Box
          sx={{
            bgcolor: '#F5F7F6',
            borderRadius: '12px',
            p: 1.75,
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="body2" fontWeight={600} color="#172A26">
              Members · {groupMemberIds.length + 1}
            </Typography>
            <Box
              onClick={handlePreviousStep}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.4,
                cursor: 'pointer',
                color: '#3C4F4A',
              }}
            >
              <Edit sx={{ fontSize: 14 }} />
              <Typography variant="caption" fontWeight={600} color="#3C4F4A">Edit</Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* stacked avatars */}
            <Box sx={{ display: 'flex' }}>
              {selectedContacts.slice(0, 3).map((c, i) => (
                <Avatar
                  key={c.id}
                  sx={{
                    width: 28,
                    height: 28,
                    fontSize: '0.65rem',
                    bgcolor: getAvatarColor(c.name),
                    border: '2px solid #F5F7F6',
                    ml: i === 0 ? 0 : -1,
                    fontWeight: 600,
                  }}
                >
                  {getInitials(c.name)}
                </Avatar>
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary">
              You{selectedNames && `, ${selectedNames}`}
            </Typography>
          </Box>
        </Box>

        {(groupError || photoError) && (
          <Alert severity="error" sx={{ mt: 2, borderRadius: 2, py: 0.5 }}>
            {photoError || groupError}
          </Alert>
        )}
        {false && (
          <Alert severity="error" sx={{ mt: 2, borderRadius: 2, py: 0.5 }}>
            {groupError}
          </Alert>
        )}
      </Box>

      {/* Bottom CTA */}
      <Box sx={{ px: 2, pt: 1.5, pb: 2, borderTop: '1px solid #EEF0EF', bgcolor: '#fff' }}>
        <Button
          fullWidth
          variant="contained"
          disabled={groupCreating || uploadingAvatar || !groupName.trim()}
          onClick={onCreateGroup}
          startIcon={(groupCreating || uploadingAvatar) ? <CircularProgress size={16} color="inherit" /> : null}
          sx={{
            bgcolor: '#2D4A44',
            color: '#fff',
            borderRadius: '12px',
            height: 52,
            fontSize: '0.95rem',
            fontWeight: 600,
            textTransform: 'none',
            boxShadow: 'none',
            '&:hover': { bgcolor: '#213832', boxShadow: 'none' },
            '&:disabled': { bgcolor: '#B0BDB9', color: '#fff' },
          }}
        >
          {groupCreating ? 'Creating…' : 'Create group'}
        </Button>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', textAlign: 'center', mt: 0.75 }}>
          You can edit these details before creating.
        </Typography>
      </Box>
    </Box>
  )

  /* ════════════════════════════════════════
     Shared header (back / title / cancel)
  ════════════════════════════════════════ */
  const Header = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        px: 2,
        py: 1.5,
        borderBottom: '1px solid #EEF0EF',
        bgcolor: '#fff',
        minHeight: 56,
        flexShrink: 0,
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
          fontWeight: 600,
          fontSize: '1.05rem',
          color: '#172A26',
        }}
      >
        Create group
      </Typography>
      <Typography
        onClick={onClose}
        sx={{
          cursor: 'pointer',
          color: '#3C4F4A',
          fontWeight: 500,
          fontSize: '0.9rem',
          userSelect: 'none',
        }}
      >
        Cancel
      </Typography>
    </Box>
  )

  /* ════════════════════════════════════════
     RENDER
  ════════════════════════════════════════ */
  const Toast = (
    <Snackbar
      open={toastOpen}
      autoHideDuration={3500}
      onClose={handleToastClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      message="A group needs at least 2 other members. Please add more people."
      ContentProps={{
        sx: {
          bgcolor: '#2D4A44',
          color: '#fff',
          borderRadius: '10px',
          fontWeight: 500,
          fontSize: '0.85rem',
        },
      }}
    />
  )

  if (isMobileOrTablet) {
    // Fullscreen slide-up on mobile / tablet
    return (
      <Dialog
        open={open}
        onClose={onClose}
        fullScreen
        TransitionComponent={SlideUp}
        PaperProps={{
          sx: {
            display: 'flex',
            flexDirection: 'column',
            bgcolor: '#fff',
          },
        }}
      >
        {Header}
        {/* On fullscreen the remaining space after the 56px header fills naturally */}
        <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Box
            sx={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              display: 'flex',
              flexDirection: 'column',
              transform: step === 1 ? 'translateX(0%)' : 'translateX(-100%)',
              transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
              bgcolor: '#fff',
            }}
          >
            {Step1}
          </Box>
          <Box
            sx={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              display: 'flex',
              flexDirection: 'column',
              transform: step === 2 ? 'translateX(0%)' : 'translateX(100%)',
              transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
              bgcolor: '#fff',
            }}
          >
            {Step2}
          </Box>
        </Box>
        {Toast}
      </Dialog>
    )
  }

  // ── Desktop dialog (≥ 900px) ──
  // Fixed height so absolute step panels have a concrete size to fill.
  // 560px fits comfortably on any laptop screen; scroll is handled inside each step.
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{
        sx: {
          borderRadius: '16px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          height: 600,          // fixed height — steps scroll internally
          maxHeight: '90vh',    // never taller than the viewport
        },
      }}
    >
      {/* Header — ~56px */}
      {Header}

      {/* Sliding step area fills the rest */}
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        {/* Step 1 */}
        <Box
          sx={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            transform: step === 1 ? 'translateX(0%)' : 'translateX(-100%)',
            transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
            willChange: 'transform',
            bgcolor: '#fff',
          }}
        >
          {Step1}
        </Box>

        {/* Step 2 */}
        <Box
          sx={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            transform: step === 2 ? 'translateX(0%)' : 'translateX(100%)',
            transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
            willChange: 'transform',
            bgcolor: '#fff',
          }}
        >
          {Step2}
        </Box>
      </Box>
      {Toast}
    </Dialog>
  )
}

export default CreateGroupDialog
