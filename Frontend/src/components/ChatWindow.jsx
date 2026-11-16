import React, { useRef, useState, useCallback } from "react";
import { useSelector } from "react-redux";
import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Chip,
  IconButton,
  LinearProgress,
  ListItemIcon,
  Menu,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import arrowIcon from "@/assets/arrow.svg";
import {
  AttachFile,
  Block,
  Circle,
  MoreVert,
  Send,
} from "@mui/icons-material";
import MessageBubble from "./MessageBubble";
import AuthenticatedAvatar from "../features/media/AuthenticatedAvatar";

/* ── Date separator label ───────────────────────────────────────────────── */
function dateSeparatorLabel(dateStr) {
  // dateStr is a YYYY-MM-DD string in local time
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

  if (dateStr === todayStr) return "Today";
  if (dateStr === yesterdayStr) return "Yesterday";

  // e.g. "Monday, 12 November 2026"
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString(undefined, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function localDateKey(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
  onBlockUser,
  onUnblockUser,
  socketConnected,
}) {
  const fileInputRef = useRef(null);
  const user = useSelector((s) => s.auth.user);
  const allowGroupChat = Boolean(user?.allowGroupChat);
  const allowDirectChat = Boolean(user?.allowDirectChat);
  const isAdmin = Boolean(user?.role) && user.role.toLowerCase().includes("admin");

  // ── Three-dot menu ──
  const [menuAnchor, setMenuAnchor] = useState(null);
  const openMenu = (e) => setMenuAnchor(e.currentTarget);
  const closeMenu = () => setMenuAnchor(null);

  // ── Block / unblock confirmation dialogs ──
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [unblockDialogOpen, setUnblockDialogOpen] = useState(false);
  const [blockActionLoading, setBlockActionLoading] = useState(false);
  const [blockActionError, setBlockActionError] = useState("");

  const handleOpenBlockDialog = () => {
    closeMenu();
    setBlockActionError("");
    setBlockDialogOpen(true);
  };
  const handleOpenUnblockDialog = () => {
    closeMenu();
    setBlockActionError("");
    setUnblockDialogOpen(true);
  };

  const handleConfirmBlock = useCallback(async () => {
    setBlockActionLoading(true);
    setBlockActionError("");
    try {
      await onBlockUser(activeContact.id);
      setBlockDialogOpen(false);
    } catch (err) {
      setBlockActionError(typeof err === "string" ? err : err?.message || "Failed to block user");
    } finally {
      setBlockActionLoading(false);
    }
  }, [onBlockUser, activeContact]);

  const handleConfirmUnblock = useCallback(async () => {
    setBlockActionLoading(true);
    setBlockActionError("");
    try {
      await onUnblockUser(activeContact.id);
      setUnblockDialogOpen(false);
    } catch (err) {
      setBlockActionError(typeof err === "string" ? err : err?.message || "Failed to unblock user");
    } finally {
      setBlockActionLoading(false);
    }
  }, [onUnblockUser, activeContact]);

  // ── Drag-and-drop ──
  const [isDragOver, setIsDragOver] = useState(false);

  // Derived: chat feature enabled?
  const chatFeatureDisabled = activeContact?.isGroup ? !allowGroupChat : !allowDirectChat;

  // Admin-only group check — allow both the original creator and any promoted group admin
  const myGroupMembership = activeRoom?.members?.find((m) => m.userId === currentUserId);
  const isGroupAdmin = myGroupMembership?.role === "admin" || activeRoom?.createdById === currentUserId;
  const canSendInAdminOnlyGroup = isAdmin || isGroupAdmin;
  const adminOnlyBlocked = Boolean(
    activeContact?.isGroup &&
    activeRoom?.adminOnlyMessages &&
    !canSendInAdminOnlyGroup,
  );

  // Block status (direct rooms only)
  const blockedByMe   = !activeContact?.isGroup && Boolean(activeRoom?.blockedByMe);
  const blockedByThem = !activeContact?.isGroup && Boolean(activeRoom?.blockedByThem);
  const isBlocked     = blockedByMe || blockedByThem;

  // Consolidated disabled flags
  const attachDisabled =
    !activeRoom?.id ||
    uploadingFile ||
    sendingFirstMessage ||
    adminOnlyBlocked ||
    isBlocked ||
    chatFeatureDisabled ||
    socketConnected === false;

  const inputDisabled =
    sendingFirstMessage ||
    uploadingFile ||
    adminOnlyBlocked ||
    isBlocked ||
    chatFeatureDisabled;

  const sendDisabled = !input.trim() || inputDisabled;

  // Drag-and-drop handlers
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (attachDisabled) return;
    setIsDragOver(true);
  }, [attachDisabled]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (attachDisabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onUploadFile?.(file);
  }, [attachDisabled, onUploadFile]);

  // ── Empty state ──
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
  const isRequestSender  = activeRoom?.requestedById === currentUserId;
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
        position: "relative",
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag-and-drop overlay */}
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

      {/* ── Chat header ── */}
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
            {blockedByThem ? "Blocked you" : blockedByMe ? "Blocked" : headerStatus}
          </Typography>
        </Box>

        {/* Three-dot menu — only for direct (1-to-1) chats */}
        {!activeContact.isGroup && (
          <>
            <IconButton
              size="small"
              onClick={openMenu}
              sx={{ color: "text.secondary", flexShrink: 0 }}
              aria-label="Chat options"
            >
              <MoreVert fontSize="small" />
            </IconButton>
            <Menu
              anchorEl={menuAnchor}
              open={Boolean(menuAnchor)}
              onClose={closeMenu}
              transformOrigin={{ horizontal: "right", vertical: "top" }}
              anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
              PaperProps={{ elevation: 2, sx: { borderRadius: 2, minWidth: 160 } }}
            >
              {blockedByMe ? (
                <MenuItem onClick={handleOpenUnblockDialog}>
                  <ListItemIcon>
                    <Block fontSize="small" sx={{ color: "#2e7d32" }} />
                  </ListItemIcon>
                  Unblock User
                </MenuItem>
              ) : (
                <MenuItem onClick={handleOpenBlockDialog}>
                  <ListItemIcon>
                    <Block fontSize="small" sx={{ color: "#c62828" }} />
                  </ListItemIcon>
                  Block User
                </MenuItem>
              )}
            </Menu>
          </>
        )}
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

      {/* Upload progress bar */}
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

      {/* ── Message list ── */}
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
          (() => {
            const items = [];
            let lastDateKey = null;
            messages.forEach((message) => {
              const dateKey = localDateKey(message.createdAt);
              if (dateKey && dateKey !== lastDateKey) {
                lastDateKey = dateKey;
                items.push(
                  <Box
                    key={`sep-${dateKey}`}
                    sx={{ display: "flex", alignItems: "center", justifyContent: "center", my: 1.5, px: 2 }}
                  >
                    <Chip
                      label={dateSeparatorLabel(dateKey)}
                      size="small"
                      sx={{
                        bgcolor: "rgba(0,0,0,0.08)",
                        color: "text.secondary",
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        height: 22,
                        px: 0.5,
                        borderRadius: "11px",
                        userSelect: "none",
                        "& .MuiChip-label": { px: 1.25 },
                      }}
                    />
                  </Box>
                );
              }
              items.push(
                <MessageBubble
                  key={message.id}
                  message={message}
                  onRetry={onRetryMessage}
                  onEdit={onEditMessage}
                  onDelete={onDeleteMessage}
                  isAdmin={isAdmin}
                />
              );
            });
            return items;
          })()
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* ── Bottom area ── */}
      {isPendingRequest && !isRequestSender ? (
        /* Accept request banner */
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
        /* Waiting for accept */
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
      ) : blockedByMe ? (
        /* You blocked this user */
        <Box
          sx={{
            px: 2,
            py: 1.75,
            borderTop: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Block sx={{ fontSize: 20, color: "#9e9e9e" }} />
            <Typography variant="body2" color="text.secondary">
              You blocked {activeContact.name}. You can no longer send or receive messages.
            </Typography>
          </Box>
          <Button
            variant="outlined"
            size="small"
            onClick={handleOpenUnblockDialog}
            sx={{
              flexShrink: 0,
              textTransform: "none",
              borderRadius: 2,
              borderColor: "#3C4F4A",
              color: "#3C4F4A",
              "&:hover": { bgcolor: "rgba(60,79,74,0.06)" },
            }}
          >
            Unblock
          </Button>
        </Box>
      ) : blockedByThem ? (
        /* The other user blocked you */
        <Box
          sx={{
            px: 2,
            py: 1.75,
            borderTop: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <Block sx={{ fontSize: 20, color: "#9e9e9e" }} />
          <Typography variant="body2" color="text.secondary">
            You can no longer send messages to {activeContact.name}.
          </Typography>
        </Box>
      ) : (
        /* Normal message input */
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderTop: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
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
          {sendError && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {sendError}
            </Alert>
          )}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
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
            <Tooltip
              title={
                socketConnected === false
                  ? "Reconnecting… wait to send files"
                  : "Attach file"
              }
              placement="top"
            >
              {/* span required by Tooltip when the child is disabled */}
              <span>
                <IconButton
                  aria-label="Attach file"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attachDisabled}
                  sx={{
                    p: 1,
                    minWidth: 40,
                    minHeight: 40,
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
              disabled={sendDisabled}
              sx={{
                bgcolor: !sendDisabled ? "#3C4F4A" : "#e0e0e0",
                color: !sendDisabled ? "#fff" : "#9e9e9e",
                width: 42,
                height: 42,
                flexShrink: 0,
                "&:hover": { bgcolor: !sendDisabled ? "#2a3834" : "#e0e0e0" },
              }}
            >
              {sendingFirstMessage
                ? <CircularProgress size={18} color="inherit" />
                : <Send fontSize="small" />}
            </IconButton>
          </Box>
        </Box>
      )}

      {/* ── Block confirmation dialog ── */}
      <Dialog
        open={blockDialogOpen}
        onClose={() => !blockActionLoading && setBlockDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: "1rem" }}>
          Block {activeContact?.name}?
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: "0.9rem" }}>
            {activeContact?.name} won't be able to send you messages, and you won't be
            able to message them. You can unblock them at any time.
          </DialogContentText>
          {blockActionError && (
            <Alert severity="error" sx={{ mt: 1.5, borderRadius: 2 }}>
              {blockActionError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button
            onClick={() => setBlockDialogOpen(false)}
            disabled={blockActionLoading}
            sx={{ textTransform: "none", color: "text.secondary" }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmBlock}
            variant="contained"
            disabled={blockActionLoading}
            startIcon={
              blockActionLoading
                ? <CircularProgress size={16} color="inherit" />
                : <Block sx={{ fontSize: "1rem !important" }} />
            }
            sx={{
              textTransform: "none",
              bgcolor: "#c62828",
              borderRadius: 2,
              "&:hover": { bgcolor: "#b71c1c" },
              "&:disabled": { bgcolor: "#ef9a9a", color: "#fff" },
            }}
          >
            {blockActionLoading ? "Blocking…" : "Block"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Unblock confirmation dialog ── */}
      <Dialog
        open={unblockDialogOpen}
        onClose={() => !blockActionLoading && setUnblockDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: "1rem" }}>
          Unblock {activeContact?.name}?
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: "0.9rem" }}>
            {activeContact?.name} will be able to send you messages again, and you'll
            be able to message them.
          </DialogContentText>
          {blockActionError && (
            <Alert severity="error" sx={{ mt: 1.5, borderRadius: 2 }}>
              {blockActionError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button
            onClick={() => setUnblockDialogOpen(false)}
            disabled={blockActionLoading}
            sx={{ textTransform: "none", color: "text.secondary" }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmUnblock}
            variant="contained"
            disabled={blockActionLoading}
            startIcon={
              blockActionLoading ? <CircularProgress size={16} color="inherit" /> : null
            }
            sx={{
              textTransform: "none",
              bgcolor: "#2D4A44",
              borderRadius: 2,
              "&:hover": { bgcolor: "#213832" },
              "&:disabled": { bgcolor: "#a5c3bb", color: "#fff" },
            }}
          >
            {blockActionLoading ? "Unblocking…" : "Unblock"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default ChatWindow;
