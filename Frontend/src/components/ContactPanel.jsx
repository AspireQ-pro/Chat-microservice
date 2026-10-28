import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  TextField,
  List,
  InputAdornment,
  IconButton,
  Tooltip,
  CircularProgress,
  Snackbar,
  Alert,
} from "@mui/material";
import arrowIcon from "@/assets/arrow.svg";
import {
  Search,
  GroupAdd,
  CameraAlt,
} from "@mui/icons-material";
import ContactItem from "./ContactItem";
import GroupItem from "./GroupItem";
import AuthenticatedAvatar from "../features/media/AuthenticatedAvatar";
import { useSelector, useDispatch } from "react-redux";
import { uploadProfileAvatar, fetchSelfProfile } from "@/provider/chatSlice";

function GroupsList({ groupRooms, activeRoomId, unreadCounts, openGroupDialog, handleSelectRoom, onGroupInfoClick }) {
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
        <Tooltip title="Create group" disableTouchListener>
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
              onInfoClick={onGroupInfoClick}
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
  onGroupInfoClick,
}) {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const myAvatarUrl = useSelector((s) => s.auth.myAvatarUrl);
  const allowGroupChat = Boolean(user?.allowGroupChat);
  const allowDirectChat = Boolean(user?.allowDirectChat);
  const showTabs = allowGroupChat && allowDirectChat;

  const [activeTab, setActiveTab] = useState(0); // 0 = Direct Chats, 1 = Groups

  // ── Profile avatar upload state ──
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarSuccess, setAvatarSuccess] = useState(false);
  const avatarInputRef = useRef(null);

  // Fetch own profile (including avatarUrl) on mount so the circle is always
  // populated — even before the user has uploaded anything this session.
  useEffect(() => {
    dispatch(fetchSelfProfile());
  }, [dispatch]);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingAvatar(true);
    setAvatarError("");
    try {
      await dispatch(uploadProfileAvatar({ file })).unwrap();
      setAvatarSuccess(true);
    } catch (err) {
      setAvatarError(err?.message || "Failed to upload profile picture");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const searchLower = (search || "").trim().toLowerCase();
  const groupRooms = rooms
    .filter((room) => room.isGroup)
    .filter((room) => !searchLower || (room.name || "").toLowerCase().includes(searchLower))
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

  const searchPlaceholder =
    allowGroupChat && !allowDirectChat
      ? "Search groups"
      : !allowGroupChat && allowDirectChat
        ? "Search contacts"
        : activeTab === 1
          ? "Search groups"
          : "Search contacts";

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
              if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: "CHAT_GO_BACK" }, "*");
              } else {
                setShowPanel && setShowPanel(false);
              }
            }}
            sx={{ p: 1, minWidth: 36, minHeight: 36, lineHeight: 1 }}
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
          {allowGroupChat && !allowDirectChat
            ? "Group Chats"
            : !allowGroupChat && allowDirectChat
              ? "Individual Chats"
              : "Chats"}
        </Typography>

        {/* My profile avatar — click to upload */}
        <Tooltip title="Change profile picture" disableTouchListener>
          <Box
            sx={{ position: "relative", flexShrink: 0, cursor: "pointer" }}
            onClick={() => !uploadingAvatar && avatarInputRef.current?.click()}
          >
            <AuthenticatedAvatar
              src={myAvatarUrl || undefined}
              sx={{ width: 36, height: 36, bgcolor: "#3C4F4A", fontSize: "0.8rem", fontWeight: 700 }}
            >
              {(user?.name || "?").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
            </AuthenticatedAvatar>
            {/* Camera overlay */}
            {uploadingAvatar ? (
              <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "rgba(0,0,0,0.45)", borderRadius: "50%" }}>
                <CircularProgress size={14} sx={{ color: "#fff" }} />
              </Box>
            ) : (
              <Box sx={{
                position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                bgcolor: "rgba(0,0,0,0.35)", borderRadius: "50%", opacity: 0,
                transition: "opacity 0.2s", "&:hover": { opacity: 1 },
              }}>
                <CameraAlt sx={{ fontSize: 14, color: "#fff" }} />
              </Box>
            )}
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: "none" }}
              onChange={handleAvatarChange}
            />
          </Box>
        </Tooltip>
      </Box>

      {/* Toast feedback */}
      <Snackbar open={avatarSuccess} autoHideDuration={3000} onClose={() => setAvatarSuccess(false)} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
        <Alert severity="success" onClose={() => setAvatarSuccess(false)} sx={{ width: "100%" }}>Profile picture updated</Alert>
      </Snackbar>
      <Snackbar open={Boolean(avatarError)} autoHideDuration={4000} onClose={() => setAvatarError("")} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
        <Alert severity="error" onClose={() => setAvatarError("")} sx={{ width: "100%" }}>{avatarError}</Alert>
      </Snackbar>

      {/* Search */}
      {(allowGroupChat || allowDirectChat) && (
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
            placeholder={searchPlaceholder}
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
      )}

      {/* Pill Tabs — shown when both group chat and individual chat are enabled */}
      {showTabs && (
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
              Direct Chats
            </Box>
            <Box
              onClick={() => setActiveTab(1)}
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
        {!allowGroupChat && !allowDirectChat ? (
          <Box sx={{ px: 3, py: 6, textAlign: "center" }}>
            <Typography variant="body2" fontWeight={600} color="text.secondary" gutterBottom>
              Chat Disabled
            </Typography>
            <Typography variant="caption" color="text.disabled">
              Neither group chat nor individual chat is enabled for this project.
            </Typography>
          </Box>
        ) : (!showTabs ? allowGroupChat : activeTab === 1) ? (
          /* ── Groups view ── */
          <GroupsList
            groupRooms={groupRooms}
            activeRoomId={activeRoomId}
            unreadCounts={unreadCounts}
            openGroupDialog={openGroupDialog}
            handleSelectRoom={handleSelectRoom}
            onGroupInfoClick={onGroupInfoClick}
          />
        ) : (
          /* ── Direct / Individual Chats view ── */
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
        )}
      </Box>
    </Box>
  );
}

export default ContactPanel;
