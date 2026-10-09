import React, { useRef } from "react";
import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  CircularProgress,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import arrowIcon from "@/assets/arrow.svg";
import {
  AttachFile,
  Circle,
  People,
  Send,
} from "@mui/icons-material";
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
  onUploadFile,
  uploadingFile,
  sendError,
  sendingFirstMessage,
  input,
  setInput,
  handleSend,
  handleKeyDown,
  setShowPanel,
  onViewMembers,
}) {
  const fileInputRef = useRef(null);

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
        <Avatar sx={{ width: 64, height: 64, bgcolor: "rgba(60,79,74,0.1)", mb: 1 }}>
          <Send sx={{ color: "#3C4F4A", fontSize: 28 }} />
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
  const requestAlreadySent = messages.length > 0 || Boolean(activeRoom?.lastMessageAt);
  const canSendFirstRequest = isPendingRequest && isRequestSender && !requestAlreadySent;

  return (
    <Box
      sx={{
        flexGrow: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        minWidth: 0,
        height: "100%",
      }}
    >
      {/* Chat header */}
      <Box
        sx={{
          px: 1.5,
          py: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          gap: 1,
          bgcolor: "background.paper",
          minHeight: 56,
        }}
      >
        {/* Back arrow — mobile only */}
        {isMobile && (
          <IconButton
            size="small"
            onClick={() => setShowPanel(true)}
            sx={{ p: 0, minWidth: 0 }}
          >
            <img src={arrowIcon} alt="back" style={{ width: 8, height: 14 }} />
          </IconButton>
        )}

        {/* Avatar */}
        <Badge
          overlap="circular"
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          badgeContent={
            !activeContact.isGroup ? (
              <Circle
                sx={{
                  fontSize: 10,
                  color: activeContact.online ? "#4caf50" : "#bdbdbd",
                }}
              />
            ) : null
          }
        >
          <Avatar
            sx={{
              bgcolor: activeContact.isGroup ? "#7e57c2" : "#3C4F4A",
              width: 38,
              height: 38,
              fontSize: "0.8rem",
              fontWeight: 700,
            }}
          >
            {activeContact.avatar}
          </Avatar>
        </Badge>

        {/* Name + status */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={700} noWrap>
            {activeContact.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
            {headerStatus}
          </Typography>
        </Box>

        {/* Action icons */}
        <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          {activeContact.isGroup && (
            <Tooltip title="View members">
              <IconButton size="small" sx={{ color: "text.secondary" }} onClick={onViewMembers}>
                <People fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      <Box
        ref={messagesContainerRef}
        onScroll={onMessagesScroll}
        sx={{ flex: 1, minHeight: 0, overflowY: "auto", py: 2, bgcolor: "#fafafa" }}
      >
        {loadingOlder && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
            <CircularProgress size={18} />
          </Box>
        )}
        {!loadingOlder && hasMoreOlder && (
          <Typography
            variant="caption"
            sx={{ display: "block", textAlign: "center", color: "text.disabled", py: 0.5 }}
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
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} onRetry={onRetryMessage} />
          ))
        )}
        <div ref={messagesEndRef} />
      </Box>

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
          <Button variant="contained" onClick={onAcceptRequest} sx={{ flexShrink: 0, textTransform: "none" }}>
            Accept
          </Button>
        </Box>
      ) : isPendingRequest && !canSendFirstRequest ? (
        <Box sx={{ px: 2, py: 1.5, borderTop: "1px solid", borderColor: "divider", bgcolor: "background.paper", textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            Message request sent. Waiting for {activeContact.name} to accept.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ px: 2, py: 1.5, borderTop: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
          {sendError && <Alert severity="error" sx={{ mb: 1 }}>{sendError}</Alert>}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUploadFile?.(file);
                event.target.value = "";
              }}
            />
            <IconButton
              aria-label="Attach image or PDF"
              onClick={() => fileInputRef.current?.click()}
              disabled={!activeRoom?.id || uploadingFile || sendingFirstMessage}
            >
              {uploadingFile ? <CircularProgress size={18} /> : <AttachFile fontSize="small" />}
            </IconButton>
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
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sendingFirstMessage || uploadingFile}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: "12px", bgcolor: "#f8fafc" } }}
            />
            <IconButton
              onClick={handleSend}
              disabled={!input.trim() || sendingFirstMessage || uploadingFile}
              sx={{
                bgcolor: input.trim() ? "#3C4F4A" : "#e0e0e0",
                color: input.trim() ? "#fff" : "#9e9e9e",
                width: 42,
                height: 42,
                flexShrink: 0,
                "&:hover": { bgcolor: input.trim() ? "#2a3834" : "#e0e0e0" },
              }}
            >
              {sendingFirstMessage ? <CircularProgress size={18} color="inherit" /> : <Send fontSize="small" />}
            </IconButton>
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default ChatWindow;
