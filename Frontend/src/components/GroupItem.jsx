import React from "react";
import { Box, Typography } from "@mui/material";
import AuthenticatedAvatar from "../features/media/AuthenticatedAvatar";

function formatTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);

  if (d >= startOfToday) {
    // Today — show time only
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (d >= startOfYesterday) {
    return "Yesterday";
  }
  if (d >= startOfWeek) {
    // Within the last 7 days — show day name (e.g. "Mon")
    return d.toLocaleDateString([], { weekday: "short" });
  }
  // Older — show date (e.g. "12/25/24")
  return d.toLocaleDateString([], { month: "numeric", day: "numeric", year: "2-digit" });
}

function GroupItem({ room, active, unread = 0, onClick, onInfoClick }) {
  const avatar = room.name?.slice(0, 2).toUpperCase() || "GR";
  const timeLabel = formatTime(room.lastMessageAt || room.createdAt);

  return (
    <Box
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
        gap: "12px",
        borderBottom: "1px solid #D5D9D8",
        bgcolor: active ? "rgba(60,79,74,0.06)" : "transparent",
        borderLeft: active ? "3px solid #3C4F4A" : "3px solid transparent",
        cursor: "pointer",
        boxSizing: "border-box",
        "&:hover": { bgcolor: "rgba(0,0,0,0.04)" },
        transition: "background 0.15s",
      }}
      onClick={onClick}
    >
      {/* Avatar */}
      <AuthenticatedAvatar
        src={room.avatarUrl || undefined}
        onClick={(e) => {
          if (onInfoClick) { e.stopPropagation(); onInfoClick(room); }
        }}
        sx={{
          bgcolor: active ? "#3C4F4A" : "#7b68ee",
          width: 46,
          height: 46,
          fontSize: "0.8rem",
          fontWeight: 700,
          flexShrink: 0,
          cursor: onInfoClick ? "pointer" : "default",
        }}
      >
        {avatar}
      </AuthenticatedAvatar>

      {/* Text block */}
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
            {room.name}
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
            {room.lastMessagePreview || `${room.members?.length ?? 0} members`}
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

export default GroupItem;
