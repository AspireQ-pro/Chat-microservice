import React from 'react'
import {
  Box, Typography, Avatar, Badge,
  IconButton, TextField, Tooltip,
} from '@mui/material'
import { Send, ArrowBack, Circle, AttachFile, People } from '@mui/icons-material'
import MessageBubble from './MessageBubble'

function ChatWindow({
  isMobile, activeContact, activeRoom,
  messages, messagesEndRef,
  input, setInput, handleSend, handleKeyDown, setShowPanel,
  selectedFile, fileInputRef, uploading, handleFileChange, handleRemoveFile,
  onViewMembers,
}) {
  if (!activeContact) {
    return (
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
        <Typography variant="body2" color="text.secondary">Select a contact to start messaging</Typography>
        <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5 }}>
          Phone numbers are never shared — all chats go through the system
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      {/* Header */}
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
        {activeContact.isGroup && (
          <Tooltip title="View members">
            <IconButton
              size="small"
              onClick={onViewMembers}
              sx={{ color: '#64748b', '&:hover': { color: '#1565C0', bgcolor: '#e3f2fd' } }}
            >
              <People fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Messages */}
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

      {/* Input */}
      <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
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
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
          <Tooltip title="Attach file">
            <IconButton
              size="small"
              onClick={() => fileInputRef.current?.click()}
              sx={{ color: '#64748b', flexShrink: 0, '&:hover': { color: '#1565C0', bgcolor: '#e3f2fd' } }}
            >
              <AttachFile fontSize="small" />
            </IconButton>
          </Tooltip>
          <TextField
            fullWidth multiline maxRows={3} size="small"
            placeholder={`Message ${activeContact.name}...`}
            value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px', bgcolor: '#f8fafc' } }}
          />
          <IconButton
            onClick={handleSend}
            disabled={(!input.trim() && !selectedFile) || uploading}
            sx={{
              bgcolor: (input.trim() || selectedFile) && !uploading ? '#1565C0' : '#e0e0e0',
              color:   (input.trim() || selectedFile) && !uploading ? '#fff'    : '#9e9e9e',
              width: 42, height: 42, flexShrink: 0,
              '&:hover': { bgcolor: (input.trim() || selectedFile) ? '#0d47a1' : '#e0e0e0' },
              transition: 'all 0.15s',
            }}
          >
            <Send fontSize="small" />
          </IconButton>
        </Box>
      </Box>
    </Box>
  )
}

export default ChatWindow
