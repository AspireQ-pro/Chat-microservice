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
  Close,
  InsertDriveFile,
  MoreVert,
  Send,
} from "@mui/icons-material";
import MessageBubble from "./MessageBubble";
import MediaAlbumBubble from "./MediaAlbumBubble";
import AuthenticatedAvatar from "../features/media/AuthenticatedAvatar";
import {
  buildChatMessageGroups,
  useChatWindowLogic,
  useQueuedImageThumbLogic,
} from "../handler/componentLogic";

/* ── Thumbnail for image files queued for upload ───────────────────────── */
function QueuedImageThumb({ file }) {
  const src = useQueuedImageThumbLogic(file);
  if (!src) return <InsertDriveFile sx={{ fontSize: 20, color: "#5c7a74", flexShrink: 0 }} />;
  return (
    <Box
      component="img"
      src={src}
      sx={{ width: 28, height: 28, objectFit: "cover", borderRadius: "4px", flexShrink: 0 }}
    />
  );
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
  const {
    fileInputRef,
    allowGroupChat,
    allowDirectChat,
    isAdmin,
    queuedFiles,
    queuedFileRows,
    clearQueue,
    getRemoveFromQueueHandler,
    menuAnchor,
    openMenu,
    closeMenu,
    blockDialogOpen,
    unblockDialogOpen,
    blockActionLoading,
    blockActionError,
    handleOpenBlockDialog,
    handleOpenUnblockDialog,
    handleConfirmBlock,
    handleConfirmUnblock,
    handleCloseBlockDialog,
    handleCloseUnblockDialog,
    handleBlockDialogClose,
    handleUnblockDialogClose,
    isDragOver,
    adminOnlyBlocked,
    blockedByMe,
    blockedByThem,
    attachDisabled,
    inputDisabled,
    sendDisabled,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    openContactPanel,
    handleFileInputChange,
    openFilePicker,
    handleInputChange,
    handleInputKeyDown,
    handleSendAction,
    isPendingRequest,
    isRequestSender,
    canSendFirstRequest,
    emptyStateTitle,
    emptyStateDescription,
  } = useChatWindowLogic({
    activeContact,
    activeRoom,
    currentUserId,
    messages,
    uploadingFile,
    sendingFirstMessage,
    input,
    setInput,
    handleSend,
    handleKeyDown,
    setShowPanel,
    onUploadFile,
    onBlockUser,
    onUnblockUser,
    socketConnected,
  })

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
              onClick={openContactPanel}
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
          {emptyStateTitle}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {emptyStateDescription}
        </Typography>
      </Box>
    );
  }

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
              Drop files to send
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
            onClick={openContactPanel}
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
        sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", py: 2, bgcolor: "#fafafa" }}
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
          buildChatMessageGroups(messages).map((group) => {
            if (group.type === "date") {
              return (
                <Box
                  key={`sep-${group.dateKey}`}
                  sx={{ display: "flex", alignItems: "center", justifyContent: "center", my: 1.5, px: 2 }}
                >
                  <Chip
                    label={group.label}
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
            if (group.type === "album") {
              return (
                <MediaAlbumBubble
                  key={group.groupId}
                  groupId={group.groupId}
                  messages={group.messages}
                  onRetry={onRetryMessage}
                  onDelete={onDeleteMessage}
                  isAdmin={isAdmin}
                />
              );
            }
            return (
              <MessageBubble
                key={group.message.id}
                message={group.message}
                onRetry={onRetryMessage}
                onEdit={onEditMessage}
                onDelete={onDeleteMessage}
                isAdmin={isAdmin}
              />
            );
          })
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

          {/* ── File queue tray ── */}
          {queuedFiles.length > 0 && (
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 0.75,
                mb: 1,
                p: 1,
                bgcolor: "#f1f5f4",
                borderRadius: "10px",
                border: "1px solid #dde8e5",
              }}
            >
              {queuedFileRows.map(({ file, index, isImage }) => {
                return (
                  <Box
                    key={index}
                    sx={{
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                      px: 1,
                      py: 0.5,
                      bgcolor: "#fff",
                      border: "1px solid #c8d8d4",
                      borderRadius: "8px",
                      maxWidth: 180,
                    }}
                  >
                    {isImage ? (
                      <QueuedImageThumb file={file} />
                    ) : (
                      <InsertDriveFile sx={{ fontSize: 20, color: "#5c7a74", flexShrink: 0 }} />
                    )}
                    <Typography
                      variant="caption"
                      sx={{
                        maxWidth: 100,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontSize: "0.7rem",
                        color: "text.secondary",
                      }}
                    >
                      {file.name}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={getRemoveFromQueueHandler(index)}
                      sx={{ p: 0.25, ml: 0.25, color: "#9e9e9e", "&:hover": { color: "#c62828" } }}
                    >
                      <Close sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                );
              })}
              <Tooltip title="Clear all">
                <IconButton
                  size="small"
                  onClick={clearQueue}
                  sx={{ ml: "auto", p: 0.5, color: "#9e9e9e", "&:hover": { color: "#c62828" } }}
                >
                  <Close sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>
          )}

          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={handleFileInputChange}
            />
            <Tooltip
              title={
                socketConnected === false
                  ? "Reconnecting… wait to send files"
                  : "Attach file (pick multiple to queue)"
              }
              placement="top"
            >
              {/* span required by Tooltip when the child is disabled */}
              <span>
                <IconButton
                  aria-label="Attach file"
                  onClick={openFilePicker}
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
                queuedFiles.length > 0
                  ? `${queuedFiles.length} file${queuedFiles.length > 1 ? "s" : ""} queued — press Send or add more`
                  : canSendFirstRequest
                  ? `Write a message request to ${activeContact.name}...`
                  : `Message ${activeContact.name}...`
              }
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              disabled={inputDisabled}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: "12px", bgcolor: "#f8fafc" } }}
            />
            <IconButton
              onClick={handleSendAction}
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
        onClose={handleBlockDialogClose}
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
            onClick={handleCloseBlockDialog}
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
        onClose={handleUnblockDialogClose}
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
            onClick={handleCloseUnblockDialog}
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
