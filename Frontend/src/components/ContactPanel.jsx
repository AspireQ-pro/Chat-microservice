import React, { useState } from "react";
import {
  Box,
  Typography,
  TextField,
  List,
  InputAdornment,
  IconButton,
  Tooltip,
} from "@mui/material";
import arrowIcon from "@/assets/arrow.svg";
import {
  Search,
  GroupAdd,
} from "@mui/icons-material";
import ContactItem from "./ContactItem";
import GroupItem from "./GroupItem";
import { useSelector } from "react-redux";

function GroupsList({ groupRooms, activeRoomId, unreadCounts, openGroupDialog, handleSelectRoom }) {
  return (
    <>
      {/* Groups section header with add button */}
      <Box
        sx={{
          px: 2,
          py: 1.25,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography
          sx={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 500,
            fontSize: "16px",
            lineHeight: "100%",
            letterSpacing: 0,
            color: "text.primary",
          }}
        >
          Groups
        </Typography>
        <Tooltip title="Create group">
          <IconButton
            size="small"
            onClick={openGroupDialog}
            sx={{
              color: "#3C4F4A",
              "&:hover": { bgcolor: "#e8edec" },
            }}
          >
            <GroupAdd fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <List disablePadding>
        {groupRooms.length === 0 ? (
          <Box sx={{ px: 2, py: 3, textAlign: "center" }}>
            <Typography variant="body2" color="text.disabled">
              No groups yet
            </Typography>
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{ display: "block", mt: 0.5 }}
            >
              Tap + to create one
            </Typography>
          </Box>
        ) : (
          groupRooms.map((room) => (
            <GroupItem
              key={room.id}
              room={room}
              active={room.id === activeRoomId}
              unread={unreadCounts[room.id] || 0}
              onClick={() => handleSelectRoom(room)}
            />
          ))
        )}
      </List>
    </>
  );
}

function ContactPanel({
  isMobile,
  search,
  setSearch,
  filteredContacts,
  contacts,
  rooms,
  getLastMessage,
  getUnreadCount,
  unreadCounts,
  handleSelectContact,
  handleSelectRoom,
  activeRoomId,
  openGroupDialog,
  setShowPanel,
}) {
  const plan = useSelector((s) => s.auth.user?.plan) || "premium";
  const isPremium = plan === "premium";
  const [activeTab, setActiveTab] = useState(0); // 0 = All Chats, 1 = Groups

  const groupRooms = rooms
    .filter((room) => room.isGroup)
    .slice()
    .sort((a, b) => {
      const unreadDiff =
        (unreadCounts[b.id] || 0) - (unreadCounts[a.id] || 0);
      if (unreadDiff) return unreadDiff;
      return (
        new Date(b.lastMessageAt || b.createdAt) -
        new Date(a.lastMessageAt || a.createdAt)
      );
    });

  return (
    <Box
      sx={{
        width: isMobile ? "100%" : 300,
        borderRight: "1px solid",
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        flexShrink: 0,
        bgcolor: "background.paper",
      }}
    >
      {/* Title row — arrow + Chats */}
      <Box
        sx={{
          px: "16px",
          pt: "20px",
          pb: "20px",
          borderBottom: "1px solid #D5D9D8",
          bgcolor: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          gap: "24px",
        }}
      >
        {isMobile && (
          <IconButton
            size="small"
            onClick={() => {
              // If embedded in an iframe, tell the parent app to navigate back
              // (same behaviour as every other dashboard tab's back arrow).
              // Fall back to setShowPanel for standalone / desktop use.
              if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'CHAT_GO_BACK' }, '*')
              } else {
                setShowPanel && setShowPanel(false)
              }
            }}
            sx={{ p: 0, minWidth: 0, lineHeight: 1 }}
          >
            <img src={arrowIcon} alt="back" style={{ width: 8, height: 14 }} />
          </IconButton>
        )}
        <Typography
          sx={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 500,
            fontSize: "18px",
            lineHeight: "100%",
            letterSpacing: 0,
            color: "#172A26",
            flex: 1,
          }}
        >
          Chats
        </Typography>
      </Box>

      {/* Search */}
      <Box
        sx={{
          px: "16px",
          py: "12px",
          bgcolor: "#FFFFFF",
        }}
      >
        <TextField
          fullWidth
          size="small"
          placeholder="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start" sx={{ mr: 0 }}>
                <Search sx={{ fontSize: 18, color: "text.disabled" }} />
              </InputAdornment>
            ),

          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              height: 48,
              borderRadius: "8px",
              bgcolor: "#fff",
              gap: "10px",
              "& fieldset": {
                borderColor: "#E0E0E0",
                borderWidth: "1px",
              },
              "&:hover fieldset": {
                borderColor: "#BDBDBD",
              },
              "&.Mui-focused fieldset": {
                borderColor: "#3C4F4A",
                borderWidth: "1px",
              },
            },
            "& .MuiOutlinedInput-input": {
              padding: "14px 0",
              fontSize: "0.875rem",
            },
            "& .MuiInputAdornment-positionStart": {
              marginRight: 0,
            },
          }}
        />
      </Box>

      {/* Pill Tabs — only shown on premium (basic goes straight to groups) */}
      {isPremium && (
        <Box
          sx={{
            px: 1.5,
            py: 1,
            borderBottom: "1px solid",
            borderColor: "divider",
            display: "flex",
            gap: 1.5,
            bgcolor: "background.paper",
          }}
        >
          <Box
            sx={{
              display: "flex",
              flex: 1,
              gap: "12px",
              bgcolor: "#F5F5F5",
              borderRadius: "8px",
              p: "4px",
            }}
          >
            <Box
              onClick={() => setActiveTab(0)}
              onTouchEnd={(e) => { e.preventDefault(); setActiveTab(0) }}
              role="button"
              tabIndex={0}
              sx={{
                flex: 1,
                textAlign: "center",
                height: "42px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                px: "10px",
                gap: "10px",
                borderRadius: "8px",
                cursor: "pointer",
                bgcolor: activeTab === 0 ? "#3C4F4A" : "transparent",
                color: activeTab === 0 ? "#fff" : "text.secondary",
                border: activeTab === 0 ? "1px solid #1A312C" : "1px solid transparent",
                fontWeight: 600,
                fontSize: "0.85rem",
                transition: "background 0.2s, color 0.2s, border-color 0.2s",
                userSelect: "none",
              }}
            >
              All Chats
            </Box>
            <Box
              onClick={() => setActiveTab(1)}
              onTouchEnd={(e) => { e.preventDefault(); setActiveTab(1) }}
              role="button"
              tabIndex={0}
              sx={{
                flex: 1,
                textAlign: "center",
                height: "42px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                px: "10px",
                gap: "10px",
                borderRadius: "8px",
                cursor: "pointer",
                bgcolor: activeTab === 1 ? "#3C4F4A" : "transparent",
                color: activeTab === 1 ? "#fff" : "text.secondary",
                border: activeTab === 1 ? "1px solid #1A312C" : "1px solid transparent",
                fontWeight: 600,
                fontSize: "0.85rem",
                transition: "background 0.2s, color 0.2s, border-color 0.2s",
                userSelect: "none",
              }}
            >
              Groups
            </Box>
          </Box>
        </Box>
      )}

      {/* Content */}
      <Box sx={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {/* Basic plan: render groups list directly, no tab UI */}
        {!isPremium ? (
          <GroupsList
            groupRooms={groupRooms}
            activeRoomId={activeRoomId}
            unreadCounts={unreadCounts}
            openGroupDialog={openGroupDialog}
            handleSelectRoom={handleSelectRoom}
          />
        ) : activeTab === 0 ? (
          /* ── All Chats tab (premium) ── */
          <List disablePadding>
            {filteredContacts.length === 0 ? (
              <Box sx={{ px: 2, py: 4, textAlign: "center" }}>
                <Typography variant="body2" color="text.disabled">
                  No contacts found
                </Typography>
              </Box>
            ) : (
              filteredContacts.map((contact) => (
                <ContactItem
                  key={contact.id}
                  contact={contact}
                  active={false}
                  lastMessage={getLastMessage(contact.id)}
                  unread={getUnreadCount(contact.id)}
                  onClick={() => handleSelectContact(contact.id)}
                />
              ))
            )}
          </List>
        ) : (
          /* ── Groups tab (premium) ── */
          <GroupsList
            groupRooms={groupRooms}
            activeRoomId={activeRoomId}
            unreadCounts={unreadCounts}
            openGroupDialog={openGroupDialog}
            handleSelectRoom={handleSelectRoom}
          />
        )}
      </Box>
    </Box>
  );
}

export default ContactPanel;
