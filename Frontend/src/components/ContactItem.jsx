import React from 'react'
import { Box, Typography, Avatar, Badge, ListItem, ListItemAvatar, ListItemText, Divider } from '@mui/material'
import { Circle } from '@mui/icons-material'

function ContactItem({ contact, active, lastMessage, unread, onClick }) {
  const lastSeen = contact.lastSeenAt
    ? new Date(contact.lastSeenAt).toLocaleDateString()
    : null

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
                maxWidth: 140, display: 'block', mt: 0.2,
                fontWeight: unread ? 700 : 400,
                color: unread ? 'text.primary' : 'text.disabled',
              }}
            >
              {lastMessage || (contact.online ? 'Online' : (lastSeen ? `Last seen ${lastSeen}` : ''))}
            </Typography>
          }
        />
      </ListItem>
      <Divider variant="inset" component="li" />
    </>
  )
}

export default ContactItem
