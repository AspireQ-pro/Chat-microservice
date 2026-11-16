import React, { useRef, useCallback, useState } from "react";
import { useSelector } from "react-redux";
import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  CircularProgress,
  IconButton,
  LinearProgress,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import arrowIcon from "@/assets/arrow.svg";
import {
  AttachFile,
  Circle,
  Send,
} from "@mui/icons-material";
import MessageBubble from "./MessageBubble";
import AuthenticatedAvatar from "../features/media/AuthenticatedAvatar";

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
  uploadProgress,
  sendError,
  sendingFirstMessage,
  input,
  setInput,
  handleSend,
  handleKeyDown,
  setShowPanel,
  onViewMembers,
  onEditMessage,
  onDeleteMessage,
  socketConnected,
}) {
  const fileInputRef = useRef(null);
  const user = useSelector((s) => s.auth.user);
  const allowGroupChat = Boolean(user?.allowGroupChat);
  const allowDirectChat = Boolean(user?.allowDirectChat);
  const isAdmin = Boolean(user?.role) && user.role.toLowerCase().includes("admin");

  const isGroupCreator = activeRoom?.createdById === currentUserId;
  const canSendInAdminOnlyGroup = isAdmin || isGroupCreator;
  const adminOnlyBlocked = Boolean(
    activeContact?.isGroup &&
    activeRoom?.adminOnlyMessages &&
    !canSendInAdminOnlyGroup,
  );

  // Phase 3: drag-and-drop state
  const [isDragOver, setIsDragOver] = useState(false);

  // Derived: whether the input bar is functional
  const chatFeatureDisabled = activeContact?.isGroup ? !allowGroupChat : !allowDirectChat;
  const inputDisabled = sendingFirstMessage || uploadingFile || adminOnlyBlocked || chatFeatureDisabled;
  // Phase 3: also disable attach button when socket is disconnected
  const attachDisabled = !activeRoom?.id || uploadingFile || sendingFirstMessage || adminOnlyBlocked || chatFeatureDisabled || socketConnected === false;

  // Phase 3: drag-and-drop handlers — attached to the whole chat body
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (attachDisabled) return;
    setIsDragOver(true);
  }, [attachDisabled]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only clear when leaving the outer container, not a child element
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (attachDisabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onUploadFile?.(file);
  }, [attachDisabled, onUploadFile]);

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
          position: "relative",
        }}
      >
        {isMobile && (
          <Box sx={{ position: "absolute", top: 12, left: 12 }}>
            <IconButton
              size="small"
              onClick={() => setShowPanel(true)}
              sx={{ p: 1, minWidth: 40, minHeight: 40 }}
            >
              <img src={arrowIcon} alt="back" style={{ width: 8, height: 14 }} />
            </IconButton>
          </Box>
        )}
        <Avatar sx={{ width: 64, height: 64, bgcolor: "rgba(60,79,74,0.1)", mb: 1 }}>
          <Send sx={{ color: "#3C4F4A", fontSize: 28 }} />
        </Avatar>
        <Typography variant="h6" fontWeight={600}>
          {!allowGroupChat && !allowDirectChat
            ? "Chat Disabled"
            : allowGroupChat && !allowDirectChat
              ? "Group Chat"
              : !allowGroupChat && allowDirectChat
                ? "Individual Chat"
                : "Chat"}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {!allowGroupChat && !allowDirectChat
            ? "Neither group chat nor individual chat is enabled for this project"
            : allowGroupChat && !allowDirectChat
              ? "Select a group to start messaging"
              : !allowGroupChat && allowDirectChat
                ? "Select a contact to start messaging"
                : "Select a contact or group to start messaging"}
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
        // Phase 3: drag-and-drop visual overlay
        position: "relative",
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Phase 3: drag-and-drop drop-zone overlay */}
      {isDragOver && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            bgcolor: "rgba(60,79,74,0.12)",
            border: "2px dashed #3C4F4A",
            borderRadius: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <Box sx={{ textAlign: "center" }}>
            <AttachFile sx={{ fontSize: 48, color: "#3C4F4A", opacity: 0.6, mb: 1 }} />
            <Typography variant="body1" fontWeight={600} sx={{ color: "#3C4F4A" }}>
              Drop file to send
            </Typography>
          </Box>
        </Box>
      )}

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
            sx={{ p: 1, minWidth: 40, minHeight: 40, mr: 0.5 }}
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
          <AuthenticatedAvatar
            src={activeContact.avatarUrl || undefined}
            onClick={activeContact.isGroup ? onViewMembers : undefined}
            sx={{
              bgcolor: activeContact.isGroup ? "#7e57c2" : "#3C4F4A",
              width: 38,
              height: 38,
              fontSize: "0.8rem",
              fontWeight: 700,
              cursor: activeContact.isGroup ? "pointer" : "default",
            }}
          >
            {activeContact.avatar}
          </AuthenticatedAvatar>
        </Badge>

        {/* Name + status */}
        <Box
          sx={{ flex: 1, minWidth: 0, cursor: activeContact.isGroup ? "pointer" : "default" }}
          onClick={activeContact.isGroup ? onViewMembers : undefined}
        >
          <Typography variant="body2" fontWeight={700} noWrap>
            {activeContact.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
            {headerStatus}
          </Typography>
        </Box>
      </Box>

      {/* Reconnecting banner */}
      {socketConnected === false && (
        <Box
          sx={{
            px: 2,
            py: 0.75,
            bgcolor: "#fff8e1",
            borderBottom: "1px solid #ffe082",
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <CircularProgress size={12} sx={{ color: "#f59e0b" }} />
          <Typography variant="caption" sx={{ color: "#92400e", fontWeight: 500 }}>
            Reconnecting… messages will update automatically
          </Typography>
        </Box>
      )}

      {/* Phase 3: upload progress bar — shown while a file is uploading */}
      {uploadingFile && uploadProgress != null && (
        <Box sx={{ px: 0 }}>
          <LinearProgress
            variant={uploadProgress > 0 ? "determinate" : "indeterminate"}
            value={uploadProgress}
            sx={{
              height: 3,
              bgcolor: "rgba(60,79,74,0.12)",
              "& .MuiLinearProgress-bar": { bgcolor: "#3C4F4A" },
            }}
          />
          {uploadProgress > 0 && uploadProgress < 100 && (
            <Typography
              variant="caption"
              sx={{
                display: "block",
                textAlign: "right",
                px: 1.5,
                pt: 0.25,
                fontSize: "0.65rem",
                color: "text.secondary",
              }}
            >
              Uploading… {uploadProgress}%
            </Typography>
          )}
        </Box>
      )}

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
            <MessageBubble
              key={message.id}
              message={message}
              onRetry={onRetryMessage}
              onEdit={onEditMessage}
              onDelete={onDeleteMessage}
              isAdmin={isAdmin}
            />
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
          {activeContact.isGroup && !allowGroupChat && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              Group chat is not enabled for this project.
            </Alert>
          )}
          {activeContact.isGroup && allowGroupChat && adminOnlyBlocked && (
            <Alert severity="info" sx={{ mb: 1 }}>
              Only the group admin can send messages in this group.
            </Alert>
          )}
          {!activeContact.isGroup && !allowDirectChat && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              Individual chat is not enabled for this project.
            </Alert>
          )}
          {sendError && <Alert severity="error" sx={{ mb: 1 }}>{sendError}</Alert>}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {/* Phase 1 fix: removed non-standard accept="*".
                Phase 3: works correctly on mobile — no accept attribute means
                the OS native picker shows all file types (Files app on iOS,
                file chooser on Android). */}
            <input
              ref={fileInputRef}
              type="file"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUploadFile?.(file);
                event.target.value = "";
              }}
            />
            {/* Phase 3: disabled when socket is disconnected;
                touch-friendly minimum target size (40×40 px) preserved */}
            <Tooltip
              title={socketConnected === false ? "Reconnecting… wait to send files" : "Attach file"}
              placement="top"
            >
              {/* span required by Tooltip when child is disabled */}
              <span>
                <IconButton
                  aria-label="Attach file"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attachDisabled}
                  sx={{
                    p: 1,
                    minWidth: 40,
                    minHeight: 40,
                    // Show a subtle offline tint when disconnected
                    opacity: socketConnected === false ? 0.5 : 1,
                  }}
                >
                  {uploadingFile
                    ? <CircularProgress size={18} />
                    : <AttachFile fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
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
              disabled={inputDisabled}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: "12px", bgcolor: "#f8fafc" } }}
            />
            <IconButton
              onClick={handleSend}
              disabled={!input.trim() || inputDisabled}
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
