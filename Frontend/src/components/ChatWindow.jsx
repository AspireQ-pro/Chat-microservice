import React from "react";
import {
  Box,
  Typography,
  Avatar,
  Badge,
  IconButton,
  TextField,
  Tooltip,
  CircularProgress,
  Button,
} from "@mui/material";
import { Send, ArrowBack, Circle, People } from "@mui/icons-material";
import MessageBubble from "./MessageBubble";

function ChatWindow({
  isMobile,
  activeContact,
  activeRoom,
  currentUserId,
  headerStatus,
  messages,
  messagesEndRef,
  messagesContainerRef,
  hasMoreOlder,
  loadingOlder,
  onMessagesScroll,
  onRetryMessage,
  onAcceptRequest,
  input,
  setInput,
  handleSend,
  handleKeyDown,
  setShowPanel,
  onViewMembers,
}) {
  if (!activeContact) {
    return (
      <Box
        sx={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "#fafafa",
          gap: 1,
        }}
      >
        <Avatar sx={{ width: 64, height: 64, bgcolor: "#e3f2fd", mb: 1 }}>
          <Send sx={{ color: "#1565C0", fontSize: 28 }} />
        </Avatar>
        <Typography variant="h6" fontWeight={600}>
          Chat
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Select a contact or group to start messaging
        </Typography>
      </Box>
    );
  }

  const isPendingRequest = activeRoom?.directStatus === "pending";
  const isRequestSender = activeRoom?.requestedById === currentUserId;
  const requestAlreadySent =
    messages.length > 0 || Boolean(activeRoom?.lastMessageAt);
  const canSendFirstRequest =
    isPendingRequest && isRequestSender && !requestAlreadySent;

  return (
    <Box
      sx={{
        flexGrow: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        minWidth: 0,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: "1px solid",
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          bgcolor: "background.paper",
        }}
      >
        {isMobile && (
          <IconButton size="small" onClick={() => setShowPanel(true)}>
            <ArrowBack fontSize="small" />
          </IconButton>
        )}
        <Badge
          overlap="circular"
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          badgeContent={
            <Circle
              sx={{
                fontSize: 10,
                color: activeContact.online ? "#4caf50" : "#bdbdbd",
              }}
            />
          }
        >
          <Avatar
            sx={{
              bgcolor: activeContact.isGroup ? "#7e57c2" : "#1565C0",
              width: 38,
              height: 38,
              fontSize: "0.8rem",
              fontWeight: 700,
            }}
          >
            {activeContact.avatar}
          </Avatar>
        </Badge>
        <Box sx={{ flex: 1 }}>
          <Typography variant="body1" fontWeight={600}>
            {activeContact.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {headerStatus}
          </Typography>
        </Box>
        {activeContact.isGroup && (
          <Tooltip title="View members">
            <IconButton
              size="small"
              onClick={onViewMembers}
              sx={{
                color: "#64748b",
                "&:hover": { color: "#1565C0", bgcolor: "#e3f2fd" },
              }}
            >
              <People fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Messages */}
      <Box
        ref={messagesContainerRef}
        onScroll={onMessagesScroll}
        sx={{ flexGrow: 1, overflowY: "auto", py: 2, bgcolor: "#fafafa" }}
      >
        {loadingOlder && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
            <CircularProgress size={18} />
          </Box>
        )}
        {!loadingOlder && hasMoreOlder && (
          <Typography
            variant="caption"
            sx={{
              display: "block",
              textAlign: "center",
              color: "text.disabled",
              py: 0.5,
            }}
          >
            Scroll up to load previous messages
          </Typography>
        )}
        {messages.length === 0 ? (
          <Box sx={{ textAlign: "center", mt: 8 }}>
            <Typography color="text.disabled">
              {isPendingRequest && !isRequestSender
                ? "This user wants to start a conversation with you."
                : "No messages yet. Say hello!"}
            </Typography>
          </Box>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onRetry={onRetryMessage}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Accept or pending-request status */}
      {isPendingRequest && !isRequestSender ? (
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderTop: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Accept this request to start the conversation.
          </Typography>
          <Button
            variant="contained"
            onClick={onAcceptRequest}
            sx={{ flexShrink: 0, textTransform: "none" }}
          >
            Accept
          </Button>
        </Box>
      ) : isPendingRequest && !canSendFirstRequest ? (
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderTop: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            textAlign: "center",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Message request sent. Waiting for {activeContact.name} to accept.
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderTop: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <TextField
              fullWidth
              multiline
              maxRows={3}
              size="small"
              placeholder={
                canSendFirstRequest
                  ? `Write a message request to ${activeContact.name}...`
                  : `Message ${activeContact.name}...`
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: "12px",
                  bgcolor: "#f8fafc",
                },
              }}
            />
            <IconButton
              onClick={handleSend}
              disabled={!input.trim()}
              sx={{
                bgcolor: input.trim() ? "#1565C0" : "#e0e0e0",
                color: input.trim() ? "#fff" : "#9e9e9e",
                width: 42,
                height: 42,
                flexShrink: 0,
                "&:hover": { bgcolor: input.trim() ? "#0d47a1" : "#e0e0e0" },
                transition: "all 0.15s",
              }}
            >
              <Send fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default ChatWindow;
