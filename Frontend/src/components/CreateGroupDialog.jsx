import React from 'react'
import {
  Box, Typography, Avatar, TextField, Divider,
  Button, Checkbox, FormControlLabel, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material'
import { GroupAdd } from '@mui/icons-material'

function CreateGroupDialog({
  open, onClose, contacts,
  groupName, setGroupName,
  groupMemberIds, toggleGroupMember,
  groupCreating, groupError,
  handleCreateGroup,
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ pb: 1, fontWeight: 700, fontSize: '1rem' }}>Create New Group</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <TextField
          fullWidth size="small" label="Group Name"
          placeholder="e.g. Block A Residents"
          value={groupName} onChange={(e) => setGroupName(e.target.value)}
          sx={{ mb: 2, mt: 0.5 }} autoFocus
        />
        <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          SELECT MEMBERS ({groupMemberIds.length} selected)
        </Typography>
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, maxHeight: 260, overflowY: 'auto' }}>
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
                      <Avatar sx={{ width: 30, height: 30, fontSize: '0.7rem', bgcolor: '#90a4ae' }}>{c.avatar}</Avatar>
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
        {groupError && <Alert severity="error" sx={{ mt: 1.5, py: 0.5 }}>{groupError}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={onClose} variant="outlined" size="small" disabled={groupCreating}
          sx={{ borderRadius: 2, textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          onClick={handleCreateGroup} variant="contained" size="small" disabled={groupCreating}
          startIcon={groupCreating ? <CircularProgress size={14} color="inherit" /> : <GroupAdd fontSize="small" />}
          sx={{ borderRadius: 2, textTransform: 'none', bgcolor: '#1565C0', '&:hover': { bgcolor: '#0d47a1' } }}
        >
          {groupCreating ? 'Creating...' : 'Create Group'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default CreateGroupDialog
