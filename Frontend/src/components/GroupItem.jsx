import React from 'react'
import {
  Box, Typography, Avatar,
  ListItem, ListItemAvatar, ListItemText, Divider,
} from '@mui/material'

function GroupItem({ room, active, unread = 0, onClick }) {
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
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" fontWeight={unread ? 700 : 500} noWrap sx={{ maxWidth: 130 }}>
                {room.name}
              </Typography>
              {unread > 0 && (
                <Box sx={{ bgcolor: '#1565C0', color: '#fff', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant="caption" sx={{ fontSize: '0.6rem', fontWeight: 700 }}>{unread}</Typography>
                </Box>
              )}
            </Box>
          }
          secondary={
            <Typography
              variant="caption"
              noWrap
              sx={{
                display: 'block', mt: 0.2,
                fontWeight: unread ? 700 : 400,
                color: unread ? 'text.primary' : 'text.disabled',
              }}
            >
              {room.lastMessagePreview || `${room.members?.length ?? 0} members`}
            </Typography>
          }
        />
      </ListItem>
      <Divider variant="inset" component="li" />
    </>
  )
}

export default GroupItem
