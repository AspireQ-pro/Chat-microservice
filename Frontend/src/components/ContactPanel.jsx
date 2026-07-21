import React, { useState } from 'react'
import {
  Box, Typography, TextField, List, Tabs, Tab,
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
  const [activeTab, setActiveTab] = useState(0)
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

      {/* Tabs */}
      <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center' }}>
        <Tabs
          value={activeTab}
          onChange={(e, newVal) => setActiveTab(newVal)}
          sx={{
            flex: 1,
            minHeight: 42,
            '& .MuiTab-root': {
              minHeight: 42,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.875rem',
              flex: 1,
            },
            '& .Mui-selected': { color: '#1565C0' },
          }}
        >
          <Tab
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                People
                <Chip
                  label={filteredContacts.length} size="small"
                  sx={{ height: 18, fontSize: '0.65rem', minWidth: 24,
                    bgcolor: activeTab === 0 ? '#e3f2fd' : '#f5f5f5',
                    color:  activeTab === 0 ? '#1565C0' : 'text.secondary' }}
                />
              </Box>
            }
          />
          <Tab
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                Groups
                <Chip
                  label={groupRooms.length} size="small"
                  sx={{ height: 18, fontSize: '0.65rem', minWidth: 24,
                    bgcolor: activeTab === 1 ? '#ede7f6' : '#f5f5f5',
                    color:  activeTab === 1 ? '#5e35b1' : 'text.secondary' }}
                />
              </Box>
            }
          />
        </Tabs>

        {/* Create group button — only visible on Groups tab */}
        {activeTab === 1 && (
          <Tooltip title="Create group">
            <IconButton size="small" onClick={openGroupDialog}
              sx={{ mr: 1, color: '#7b68ee', '&:hover': { bgcolor: '#ede7f6', color: '#5e35b1' } }}>
              <GroupAdd fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {activeTab === 0 ? (
          /* ── People tab ── */
          <List disablePadding>
            {filteredContacts.length === 0 ? (
              <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
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
        ) : (
          /* ── Groups tab ── */
          <List disablePadding>
            {groupRooms.length === 0 ? (
              <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
                <Typography variant="body2" color="text.disabled">No groups yet</Typography>
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
                  Use the + button above to create one
                </Typography>
              </Box>
            ) : (
              groupRooms.map((room) => (
                <GroupItem
                  key={room.id}
                  room={room}
                  active={room.id === activeRoomId}
                  onClick={() => handleSelectRoom(room)}
                />
              ))
            )}
          </List>
        )}
      </Box>
    </Box>
  )
}

export default ContactPanel
