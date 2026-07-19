import React from 'react'
import {
  Box, Typography, Avatar,
  ListItem, ListItemAvatar, ListItemText, Divider, Chip,
} from '@mui/material'

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

export default GroupItem
