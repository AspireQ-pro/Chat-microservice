import React from 'react'
import {
  Menu, MenuItem, ListItemIcon, ListItemText,
} from '@mui/material'
import { Delete, DeleteOutline, Download, Edit } from '@mui/icons-material'
import { useMessageActionsMenuLogic } from '../handler/componentLogic'

function MessageActionsMenu({
  anchorEl,
  onClose,
  message,
  isAdmin,
  onDelete,
  canEdit = false,
  onEdit,
  canDownload = false,
  downloadLabel = 'Download',
  onDownload,
}) {
  const {
    handleEdit,
    handleDownload,
    handleDeleteForMe,
    handleDeleteForEveryone,
  } = useMessageActionsMenuLogic({ message, onClose, onDelete, onEdit, onDownload })

  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      anchorOrigin={{ vertical: 'top', horizontal: message.mine ? 'left' : 'right' }}
      transformOrigin={{ vertical: 'bottom', horizontal: message.mine ? 'right' : 'left' }}
      PaperProps={{
        sx: { borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', minWidth: 160, py: 0.5 },
      }}
    >
      {canEdit && (
        <MenuItem
          onClick={handleEdit}
          sx={{ gap: 1, py: 1, px: 1.75, borderRadius: '8px', mx: 0.5, '&:hover': { bgcolor: '#f0f5f4' } }}
        >
          <ListItemIcon sx={{ minWidth: 'auto' }}><Edit sx={{ fontSize: 17, color: '#3C4F4A' }} /></ListItemIcon>
          <ListItemText primary="Edit" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500 }} />
        </MenuItem>
      )}
      {canDownload && (
        <MenuItem
          onClick={handleDownload}
          sx={{ gap: 1, py: 1, px: 1.75, borderRadius: '8px', mx: 0.5, '&:hover': { bgcolor: '#f0f5f4' } }}
        >
          <ListItemIcon sx={{ minWidth: 'auto' }}><Download sx={{ fontSize: 17, color: '#3C4F4A' }} /></ListItemIcon>
          <ListItemText primary={downloadLabel} primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500 }} />
        </MenuItem>
      )}
      <MenuItem
        onClick={handleDeleteForMe}
        sx={{ gap: 1, py: 1, px: 1.75, borderRadius: '8px', mx: 0.5, '&:hover': { bgcolor: '#f5f5f5' } }}
      >
        <ListItemIcon sx={{ minWidth: 'auto' }}><DeleteOutline sx={{ fontSize: 17, color: '#757575' }} /></ListItemIcon>
        <ListItemText primary="Delete for me" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500, color: '#616161' }} />
      </MenuItem>
      {(message.mine || isAdmin) && (
        <MenuItem
          onClick={handleDeleteForEveryone}
          sx={{ gap: 1, py: 1, px: 1.75, borderRadius: '8px', mx: 0.5, '&:hover': { bgcolor: '#feebee' } }}
        >
          <ListItemIcon sx={{ minWidth: 'auto' }}><Delete sx={{ fontSize: 17, color: '#c62828' }} /></ListItemIcon>
          <ListItemText
            primary="Delete for everyone"
            primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500, color: '#c62828' }}
          />
        </MenuItem>
      )}
    </Menu>
  )
}

export default MessageActionsMenu
