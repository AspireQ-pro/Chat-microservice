import React from 'react'
import {
  Box, Typography, Avatar, Badge,
  List, ListItem, ListItemAvatar, ListItemText, Divider, Chip,
} from '@mui/material'
import { Circle } from '@mui/icons-material'
import { ROLE_COLOR } from '@/handler/chat'

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

export default ContactItem
