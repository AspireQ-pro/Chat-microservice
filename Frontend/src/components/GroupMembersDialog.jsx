import React, { useState } from 'react'
import {
  Box, Typography, Avatar, Divider, Button, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress,
} from '@mui/material'
import { ExitToApp, People } from '@mui/icons-material'

function GroupMembersDialog({ open, onClose, room, currentUserId, onLeave }) {
  const members = room?.members || []
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState('')

  async function handleLeave() {
    setLeaveError('')
    setLeaving(true)
    try {
      await onLeave(room.id)
      onClose()
    } catch (err) {
      setLeaveError(err.message || 'Failed to leave group')
    } finally {
      setLeaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: 3 } }}>
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
        {leaveError && (
          <Typography variant="caption" color="error" sx={{ mb: 1, display: 'block' }}>
            {leaveError}
          </Typography>
        )}
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
          {members.map((m, idx) => {
            const user      = m.user || {}
            const isMe      = m.userId === currentUserId
            const avatar    = user.name?.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?'
            return (
              <Box key={m.userId || idx}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.25 }}>
                  <Avatar sx={{ width: 36, height: 36, fontSize: '0.75rem', fontWeight: 700, bgcolor: isMe ? '#1565C0' : '#90a4ae' }}>
                    {avatar}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <Typography variant="body2" fontWeight={500} noWrap>
                        {user.name || 'Unknown'}
                      </Typography>
                      {isMe && (
                        <Chip label="You" size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: '#e3f2fd', color: '#1565c0', fontWeight: 700 }} />
                      )}
                    </Box>
                    <Typography variant="caption" color="text.disabled" noWrap sx={{ display: 'block' }}>
                      {user.email || ''}
                    </Typography>
                  </Box>
                  {isMe && (
                    <Button
                      size="small"
                      color="error"
                      variant="outlined"
                      startIcon={leaving ? <CircularProgress size={12} color="inherit" /> : <ExitToApp sx={{ fontSize: '0.9rem !important' }} />}
                      disabled={leaving}
                      onClick={handleLeave}
                      sx={{
                        textTransform: 'none',
                        fontSize: '0.72rem',
                        py: 0.25,
                        px: 1,
                        borderRadius: 1.5,
                        flexShrink: 0,
                        minWidth: 'auto',
                      }}
                    >
                      {leaving ? 'Leaving…' : 'Exit'}
                    </Button>
                  )}
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

export default GroupMembersDialog
