import React from 'react'
import {
  Box, Typography, Avatar, Divider, Button,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material'
import { People } from '@mui/icons-material'

function GroupMembersDialog({ open, onClose, room }) {
  const members = room?.members || []
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
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
          {members.map((m, idx) => {
            const user   = m.user || {}
            const avatar = user.name?.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?'
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

export default GroupMembersDialog
