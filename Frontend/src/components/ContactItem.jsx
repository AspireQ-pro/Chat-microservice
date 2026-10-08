import React from "react";
import { Box, Typography, Avatar, Badge } from "@mui/material";
import { Circle } from "@mui/icons-material";

function formatTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function ContactItem({ contact, active, lastMessage, unread, onClick }) {
  const timeLabel = formatTime(contact.lastMessageAt || contact.lastSeenAt);

  return (
    <Box
      onClick={onClick}
      onTouchEnd={(e) => { e.preventDefault(); onClick?.() }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.() }}
      sx={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        width: "100%",
        minHeight: 73,
        px: "12px",
        py: "12px",
        gap: "12px",                          // gap between avatar and text block
        borderBottom: "1px solid #D5D9D8",
        bgcolor: active ? "rgba(60,79,74,0.06)" : "transparent",
        borderLeft: active ? "3px solid #3C4F4A" : "3px solid transparent",
        cursor: "pointer",
        boxSizing: "border-box",
        "&:hover": { bgcolor: "rgba(0,0,0,0.04)" },
        transition: "background 0.15s",
      }}
    >
      {/* Avatar with online dot */}
      <Badge
        overlap="circular"
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        badgeContent={
          <Circle
            sx={{ fontSize: 10, color: contact.online ? "#4caf50" : "#bdbdbd" }}
          />
        }
      >
        <Avatar
          sx={{
            bgcolor: active ? "#3C4F4A" : "#90a4ae",
            width: 46,
            height: 46,
            fontSize: "0.875rem",
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {contact.avatar}
        </Avatar>
      </Badge>

      {/* Text block — fills remaining space */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {/* Row 1: name + timestamp */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: "2px",
          }}
        >
          <Typography
            noWrap
            sx={{
              flex: 1,
              mr: 1,
              fontWeight: unread ? 700 : 600,
              fontSize: "0.9rem",
              lineHeight: 1.3,
              color: "text.primary",
            }}
          >
            {contact.name}
          </Typography>
          <Typography
            sx={{
              flexShrink: 0,
              fontSize: "0.72rem",
              fontWeight: unread ? 600 : 400,
              color: unread ? "#3C4F4A" : "text.disabled",
              lineHeight: 1.3,
            }}
          >
            {timeLabel}
          </Typography>
        </Box>

        {/* Row 2: last message + unread badge */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Typography
            noWrap
            sx={{
              flex: 1,
              mr: 1,
              fontSize: "0.8rem",
              fontWeight: unread ? 600 : 400,
              color: unread ? "text.primary" : "text.disabled",
              lineHeight: 1.3,
            }}
          >
            {lastMessage || (contact.online ? "Online" : "")}
          </Typography>
          {unread > 0 && (
            <Box
              sx={{
                bgcolor: "#3C4F4A",
                color: "#fff",
                borderRadius: "50%",
                minWidth: 20,
                height: 20,
                px: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Typography
                sx={{ fontSize: "0.65rem", fontWeight: 700, lineHeight: 1 }}
              >
                {unread}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default ContactItem;
