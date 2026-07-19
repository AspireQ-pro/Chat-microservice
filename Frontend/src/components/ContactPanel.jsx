import React from 'react'
import {
  Box, Typography, TextField, List,
  InputAdornment, Chip, Tooltip, IconButton,
} from '@mui/material'
import { Search, GroupAdd } from '@mui/icons-material'
import ContactItem from './ContactItem'
import GroupItem from './GroupItem'

function ContactPanel({
  isMobile, search, setSearch,
  filteredContacts, contacts, rooms,
  getLastMessage, handleSelectContact, handleSelectRoom,
  activeRoomId, openGroupDialog,
}) {
  const groupRooms = rooms.filter((r) => r.isGroup)

  return (
    <Box
      sx={{
        width: isMobile ? '100%' : 300,
        borderRight: '1px solid', borderColor: 'divider',
        display: 'flex', flexDirection: 'column',
        minHeight: 0, flexShrink: 0, bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ px: 2, pt: 2, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="h6" fontWeight={700} mb={1.5}>Messages</Typography>
        <TextField
          fullWidth size="small" placeholder="Search people..."
          value={search} onChange={(e) => setSearch(e.target.value)}
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

      <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
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
                active={false}
                lastMessage={getLastMessage(contact.id)}
                unread={0}
                onClick={() => handleSelectContact(contact.id)}
              />
            ))
          )}
        </List>

        {groupRooms.length > 0 && (
          <>
            <Box sx={{ px: 2, pt: 2, pb: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="caption" fontWeight={700} color="text.disabled" sx={{ letterSpacing: 0.8 }}>
                  GROUPS
                </Typography>
                <Chip
                  label={groupRooms.length} size="small"
                  sx={{ height: 16, fontSize: '0.6rem', bgcolor: '#ede7f6', color: '#5e35b1', minWidth: 20 }}
                />
              </Box>
              <Tooltip title="Create group">
                <IconButton size="small" onClick={openGroupDialog}
                  sx={{ color: '#7b68ee', p: 0.3, '&:hover': { bgcolor: '#ede7f6', color: '#5e35b1' } }}>
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
}

export default ContactPanel
