import React, { useState } from 'react'
import {
  Box, Typography, TextField, IconButton, Avatar, Badge,
  List, ListItem, ListItemAvatar, ListItemText, Divider,
  Paper, InputAdornment, Chip, Tooltip, Button,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Checkbox, FormControlLabel, CircularProgress, Alert,
} from '@mui/material'
import { Send, Search, ArrowBack, Circle, AttachFile, GroupAdd, People } from '@mui/icons-material'
import { useChatHandler, ROLE_COLOR } from '@pages/Dashboard/Chat/handler/chat'

// ─── Contact List Item ────────────────────────────────────────────────────────
function ContactItem({ contact, active, lastMessage, unread, onClick }) {
  const roleStyle = ROLE_COLOR[contact.role] || ROLE_COLOR.member

  return (
    <>
      <ListItem
        onClick={onClick}
        sx={{
          bgcolor: active ? 'rgba(21,101,192,0.06)' : 'transparent',
          borderLeft: active ? '3px solid #1565C0' : '3px solid transparent',
          cursor: 'pointer',
          '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' },
          transition: 'all 0.15s',
        }}
      >
        <ListItemAvatar>
          <Badge
            overlap="circular"
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            badgeContent={
              <Circle sx={{ fontSize: 10, color: contact.online ? '#4caf50' : '#bdbdbd' }} />
            }
          >
            <Avatar
              sx={{
                bgcolor: active ? '#1565C0' : '#90a4ae',
                width: 42, height: 42,
                fontSize: '0.875rem', fontWeight: 700,
              }}
            >
              {contact.avatar}
            </Avatar>
          </Badge>
        </ListItemAvatar>
        <ListItemText
          primary={
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" fontWeight={unread ? 700 : 500} noWrap sx={{ maxWidth: 120 }}>
                {contact.name}
              </Typography>
              {unread > 0 && (
                <Chip
                  label={unread}
                  size="small"
                  sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#1565C0', color: '#fff', minWidth: 22 }}
                />
              )}
            </Box>
          }
          secondary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.3 }}>
              <Chip
                label={contact.role}
                size="small"
                sx={{ height: 16, fontSize: '0.6rem', ...roleStyle, borderRadius: 1 }}
              />
              <Typography variant="caption" color="text.disabled" noWrap sx={{ maxWidth: 90 }}>
                {lastMessage || ''}
              </Typography>
            </Box>
          }
        />
      </ListItem>
      <Divider variant="inset" component="li" />
    </>
  )
}

// ─── Group List Item ──────────────────────────────────────────────────────────
function GroupItem({ room, active, onClick }) {
  const avatar = room.name?.slice(0, 2).toUpperCase() || 'GR'
  return (
    <>
      <ListItem
        onClick={onClick}
        sx={{
          bgcolor: active ? 'rgba(21,101,192,0.06)' : 'transparent',
          borderLeft: active ? '3px solid #1565C0' : '3px solid transparent',
          cursor: 'pointer',
          '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' },
          transition: 'all 0.15s',
        }}
      >
        <ListItemAvatar>
          <Avatar
            sx={{
              bgcolor: active ? '#1565C0' : '#7b68ee',
              width: 42, height: 42,
              fontSize: '0.8rem', fontWeight: 700,
            }}
          >
            {avatar}
          </Avatar>
        </ListItemAvatar>
        <ListItemText
          primary={
            <Typography variant="body2" fontWeight={500} noWrap sx={{ maxWidth: 150 }}>
              {room.name}
            </Typography>
          }
          secondary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.3 }}>
              <Chip
                label="group"
                size="small"
                sx={{ height: 16, fontSize: '0.6rem', bgcolor: '#ede7f6', color: '#5e35b1', borderRadius: 1 }}
              />
              <Typography variant="caption" color="text.disabled">
                {room.members?.length ?? 0} members
              </Typography>
            </Box>
          }
        />
      </ListItem>
      <Divider variant="inset" component="li" />
    </>
  )
}


function MessageBubble({ message }) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: message.mine ? 'flex-end' : 'flex-start',
        mb: 1.5, px: 1,
      }}
    >
      <Box
        sx={{
          maxWidth: '65%',
          px: 2, py: 1,
          borderRadius: message.mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          bgcolor: message.mine ? '#1565C0' : '#f5f5f5',
          color: message.mine ? '#fff' : 'text.primary',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}
      >
        {/* Show sender name for received messages */}
        {!message.mine && message.senderName && (
          <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, mb: 0.3, opacity: 0.8 }}>
            {message.senderName}
          </Typography>
        )}

        {/* Image attachment */}
        {message.fileUrl && message.fileType === 'image' && (
          <Box
            component="img"
            src={message.fileUrl}
            alt="attachment"
            sx={{ maxWidth: '100%', borderRadius: 1, mb: message.text ? 0.5 : 0 }}
          />
        )}

        {/* File attachment */}
        {message.fileUrl && message.fileType === 'file' && (
          <Box component="a" href={message.fileUrl} target="_blank" rel="noreferrer"
            sx={{ display: 'block', color: 'inherit', mb: message.text ? 0.5 : 0 }}>
            📎 Download file
          </Box>
        )}

        {/* Text */}
        {message.text && (
          <Typography variant="body2" sx={{ lineHeight: 1.5 }}>{message.text}</Typography>
        )}

        <Typography
          variant="caption"
          sx={{ display: 'block', textAlign: 'right', mt: 0.5, opacity: 0.7, fontSize: '0.65rem' }}
        >
          {message.time}
        </Typography>
      </Box>
    </Box>
  )
}

// ─── Group Members Dialog ─────────────────────────────────────────────────────
function GroupMembersDialog({ open, onClose, room }) {
  const members = room?.members || []
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle sx={{ pb: 1, fontWeight: 700, fontSize: '1rem' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <People sx={{ color: '#1565C0', fontSize: 20 }} />
          {room?.name} — Members
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 0 }}>
        <Typography variant="caption" color="text.disabled" sx={{ mb: 1, display: 'block' }}>
          {members.length} member{members.length !== 1 ? 's' : ''}
        </Typography>
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
          {members.map((m, idx) => {
            const user = m.user || {}
            const avatar = user.name
              ?.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?'
            return (
              <Box key={m.userId || idx}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.25 }}>
                  <Avatar sx={{ width: 36, height: 36, fontSize: '0.75rem', fontWeight: 700, bgcolor: '#90a4ae' }}>
                    {avatar}
                  </Avatar>
                  <Box>
                    <Typography variant="body2" fontWeight={500}>{user.name || 'Unknown'}</Typography>
                    <Typography variant="caption" color="text.disabled">{user.email || ''}</Typography>
                  </Box>
                </Box>
                {idx < members.length - 1 && <Divider />}
              </Box>
            )
          })}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button
          onClick={onClose}
          variant="contained"
          size="small"
          sx={{ borderRadius: 2, textTransform: 'none', bgcolor: '#1565C0', '&:hover': { bgcolor: '#0d47a1' } }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ─── Create Group Dialog ──────────────────────────────────────────────────────
function CreateGroupDialog({
  open, onClose, contacts,
  groupName, setGroupName,
  groupMemberIds, toggleGroupMember,
  groupCreating, groupError,
  handleCreateGroup,
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle sx={{ pb: 1, fontWeight: 700, fontSize: '1rem' }}>
        Create New Group
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {/* Group name input */}
        <TextField
          fullWidth
          size="small"
          label="Group Name"
          placeholder="e.g. Block A Residents"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          sx={{ mb: 2, mt: 0.5 }}
          autoFocus
        />

        {/* Member selection */}
        <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          SELECT MEMBERS ({groupMemberIds.length} selected)
        </Typography>

        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            maxHeight: 260,
            overflowY: 'auto',
          }}
        >
          {contacts.length === 0 ? (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.disabled">No contacts available</Typography>
            </Box>
          ) : (
            contacts.map((c, idx) => (
              <Box key={c.id}>
                <FormControlLabel
                  sx={{ m: 0, px: 1.5, py: 0.75, width: '100%', '&:hover': { bgcolor: '#f8fafc' } }}
                  control={
                    <Checkbox
                      size="small"
                      checked={groupMemberIds.includes(c.id)}
                      onChange={() => toggleGroupMember(c.id)}
                      sx={{ '&.Mui-checked': { color: '#1565C0' } }}
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar sx={{ width: 30, height: 30, fontSize: '0.7rem', bgcolor: '#90a4ae' }}>
                        {c.avatar}
                      </Avatar>
                      <Box>
                        <Typography variant="body2" fontWeight={500}>{c.name}</Typography>
                        <Typography variant="caption" color="text.disabled">{c.email}</Typography>
                      </Box>
                    </Box>
                  }
                />
                {idx < contacts.length - 1 && <Divider />}
              </Box>
            ))
          )}
        </Box>

        {groupError && (
          <Alert severity="error" sx={{ mt: 1.5, py: 0.5 }} >
            {groupError}
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button
          onClick={onClose}
          variant="outlined"
          size="small"
          disabled={groupCreating}
          sx={{ borderRadius: 2, textTransform: 'none' }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleCreateGroup}
          variant="contained"
          size="small"
          disabled={groupCreating}
          startIcon={groupCreating ? <CircularProgress size={14} color="inherit" /> : <GroupAdd fontSize="small" />}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            bgcolor: '#1565C0',
            '&:hover': { bgcolor: '#0d47a1' },
          }}
        >
          {groupCreating ? 'Creating...' : 'Create Group'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ─── Chat Page ────────────────────────────────────────────────────────────────
function ChatPage() {
  const {
    input, search, showPanel, isMobile,
    activeContact, activeRoomId, activeRoom, messages, filteredContacts, contacts, rooms, messagesEndRef,
    setInput, setSearch, setShowPanel, setGroupName,
    handleSend, handleKeyDown, handleSelectContact, getLastMessage, handleSelectRoom,
    selectedFile, fileInputRef, uploading, handleFileChange, handleRemoveFile,
    groupDialogOpen, groupName, groupMemberIds, groupCreating, groupError,
    openGroupDialog, closeGroupDialog, toggleGroupMember, handleCreateGroup,
  } = useChatHandler()

  const [membersDialogOpen, setMembersDialogOpen] = useState(false)

  // Groups the current user is part of
  const groupRooms = rooms.filter((r) => r.isGroup)

  // ── Contact Panel ──
  const ContactPanel = (
    <Box
      sx={{
        width: isMobile ? '100%' : 300,
        borderRight: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        flexShrink: 0,
        bgcolor: 'background.paper',
      }}
    >
      {/* Header */}
      <Box sx={{ px: 2, pt: 2, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="h6" fontWeight={700} mb={1.5}>Messages</Typography>
        <TextField
          fullWidth size="small"
          placeholder="Search people..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" sx={{ color: 'text.disabled' }} />
              </InputAdornment>
            ),
          }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', bgcolor: '#f8fafc' } }}
        />
      </Box>

      {/* Scrollable list — People + Groups */}
      <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>

        {/* ── People section ── */}
        <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
          <Typography variant="caption" fontWeight={700} color="text.disabled" sx={{ letterSpacing: 0.8 }}>
            PEOPLE
          </Typography>
        </Box>
        <List disablePadding>
          {filteredContacts.length === 0 ? (
            <Box sx={{ px: 2, py: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.disabled">No contacts found</Typography>
            </Box>
          ) : (
            filteredContacts.map((contact) => (
              <ContactItem
                key={contact.id}
                contact={contact}
                active={activeRoomId != null && (() => false)()}
                lastMessage={getLastMessage(contact.id)}
                unread={0}
                onClick={() => handleSelectContact(contact.id)}
              />
            ))
          )}
        </List>

        {/* ── Groups section — only shown when user has groups ── */}
        {groupRooms.length > 0 && (
          <>
            <Box sx={{ px: 2, pt: 2, pb: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="caption" fontWeight={700} color="text.disabled" sx={{ letterSpacing: 0.8 }}>
                  GROUPS
                </Typography>
                <Chip
                  label={groupRooms.length}
                  size="small"
                  sx={{ height: 16, fontSize: '0.6rem', bgcolor: '#ede7f6', color: '#5e35b1', minWidth: 20 }}
                />
              </Box>
              <Tooltip title="Create group">
                <IconButton
                  size="small"
                  onClick={openGroupDialog}
                  sx={{
                    color: '#7b68ee',
                    p: 0.3,
                    '&:hover': { bgcolor: '#ede7f6', color: '#5e35b1' },
                  }}
                >
                  <GroupAdd sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>
            <List disablePadding>
              {groupRooms.map((room) => (
                <GroupItem
                  key={room.id}
                  room={room}
                  active={room.id === activeRoomId}
                  onClick={() => handleSelectRoom(room)}
                />
              ))}
            </List>
          </>
        )}

      </Box>
    </Box>
  )

  // ── Chat Window ──
  const ChatWindow = (
    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      {activeContact ? (
        <>
          {/* Chat Header */}
          <Box
            sx={{
              px: 2, py: 1.5,
              borderBottom: '1px solid', borderColor: 'divider',
              display: 'flex', alignItems: 'center', gap: 1.5,
              bgcolor: 'background.paper',
            }}
          >
            {isMobile && (
              <IconButton size="small" onClick={() => setShowPanel(true)}>
                <ArrowBack fontSize="small" />
              </IconButton>
            )}
            <Badge
              overlap="circular"
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              badgeContent={
                <Circle sx={{ fontSize: 10, color: activeContact.online ? '#4caf50' : '#bdbdbd' }} />
              }
            >
              <Avatar sx={{ bgcolor: '#1565C0', width: 38, height: 38, fontSize: '0.8rem', fontWeight: 700 }}>
                {activeContact.avatar}
              </Avatar>
            </Badge>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body1" fontWeight={600}>{activeContact.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {activeContact.isGroup
                  ? `${activeRoom?.members?.length ?? 0} members`
                  : activeContact.flat
                    ? `${activeContact.flat} · ${activeContact.online ? 'Online' : 'Offline'}`
                    : activeContact.online ? 'Online' : 'Offline'}
              </Typography>
            </Box>
            {/* Show members button only for group chats */}
            {activeContact.isGroup && (
              <Tooltip title="View members">
                <IconButton
                  size="small"
                  onClick={() => setMembersDialogOpen(true)}
                  sx={{
                    color: '#64748b',
                    '&:hover': { color: '#1565C0', bgcolor: '#e3f2fd' },
                  }}
                >
                  <People fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>

          {/* Messages Area */}
          <Box sx={{ flexGrow: 1, overflowY: 'auto', py: 2, bgcolor: '#fafafa' }}>
            {messages.length === 0 ? (
              <Box sx={{ textAlign: 'center', mt: 8 }}>
                <Typography color="text.disabled">No messages yet. Say hello!</Typography>
              </Box>
            ) : (
              messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
            )}
            <div ref={messagesEndRef} />
          </Box>

          {/* Message Input */}
          <Box
            sx={{
              px: 2, py: 1.5,
              borderTop: '1px solid', borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            {/* File preview strip */}
            {selectedFile && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, px: 0.5 }}>
                <AttachFile sx={{ fontSize: 15, color: '#1565C0' }} />
                <Typography variant="caption" noWrap sx={{ flex: 1, color: '#374151' }}>
                  {selectedFile.name}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: 'error.main', cursor: 'pointer', fontWeight: 600 }}
                  onClick={handleRemoveFile}
                >
                  ✕
                </Typography>
              </Box>
            )}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {/* Hidden file input */}
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />

              {/* Attach button */}
              <Tooltip title="Attach file">
                <IconButton
                  size="small"
                  onClick={() => fileInputRef.current?.click()}
                  sx={{
                    color: '#64748b',
                    flexShrink: 0,
                    '&:hover': { color: '#1565C0', bgcolor: '#e3f2fd' },
                  }}
                >
                  <AttachFile fontSize="small" />
                </IconButton>
              </Tooltip>

              <TextField
                fullWidth multiline maxRows={3} size="small"
                placeholder={`Message ${activeContact.name}...`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: '#f8fafc' } }}
              />
              <IconButton
                onClick={handleSend}
                disabled={(!input.trim() && !selectedFile) || uploading}
                sx={{
                  bgcolor: (input.trim() || selectedFile) && !uploading ? '#1565C0' : '#e0e0e0',
                  color: (input.trim() || selectedFile) && !uploading ? '#fff' : '#9e9e9e',
                  width: 42, height: 42,
                  '&:hover': { bgcolor: (input.trim() || selectedFile) ? '#0d47a1' : '#e0e0e0' },
                  transition: 'all 0.15s',
                  flexShrink: 0,
                }}
              >
                <Send fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        </>
      ) : (
        // Empty state
        <Box
          sx={{
            flexGrow: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            bgcolor: '#fafafa', gap: 1,
          }}
        >
          <Avatar sx={{ width: 64, height: 64, bgcolor: '#e3f2fd', mb: 1 }}>
            <Send sx={{ color: '#1565C0', fontSize: 28 }} />
          </Avatar>
          <Typography variant="h6" fontWeight={600}>Society Chat</Typography>
          <Typography variant="body2" color="text.secondary">
            Select a contact to start messaging
          </Typography>
          <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5 }}>
            Phone numbers are never shared — all chats go through the system
          </Typography>
        </Box>
      )}
    </Box>
  )

  return (
    <Paper
      elevation={0}
      sx={{
        display: 'flex',
        height: '100%',
        minHeight: 0,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3,
        overflow: 'hidden',
      }}
    >
      {isMobile ? (
        showPanel ? ContactPanel : ChatWindow
      ) : (
        <>
          {ContactPanel}
          {ChatWindow}
        </>
      )}

      <CreateGroupDialog
        open={groupDialogOpen}
        onClose={closeGroupDialog}
        contacts={contacts}
        groupName={groupName}
        setGroupName={setGroupName}
        groupMemberIds={groupMemberIds}
        toggleGroupMember={toggleGroupMember}
        groupCreating={groupCreating}
        groupError={groupError}
        handleCreateGroup={handleCreateGroup}
      />

      <GroupMembersDialog
        open={membersDialogOpen}
        onClose={() => setMembersDialogOpen(false)}
        room={activeRoom}
      />
    </Paper>
  )
}

export default ChatPage
