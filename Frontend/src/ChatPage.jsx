import React, { useState } from "react";
import { Paper } from "@mui/material";
import { useChatHandler } from "@/handler/chat";
import ContactPanel from "@/components/ContactPanel";
import ChatWindow from "@/components/ChatWindow";
import CreateGroupDialog from "@/components/CreateGroupDialog";
import GroupMembersDialog from "@/components/GroupMembersDialog";

function ChatPage() {
  const {
    input,
    search,
    showPanel,
    isMobile,
    activeContact,
    activeRoomId,
    activeRoom,
    headerStatus,
    messages,
    chatUserId,
    filteredContacts,
    contacts,
    rooms,
    messagesEndRef,
    messagesContainerRef,
    hasMoreOlder,
    loadingOlder,
    setInput,
    setSearch,
    setShowPanel,
    setGroupName,
    handleSend,
    handleKeyDown,
    handleRetryMessage,
    handleMessagesScroll,
    handleSelectContact,
    handleSelectRoom,
    handleAcceptRequest,
    handleUploadFile,
    getLastMessage,
    getUnreadCount,
    unreadCounts,
    groupDialogOpen,
    groupName,
    groupMemberIds,
    groupCreating,
    groupError,
    sendError,
    sendingFirstMessage,
    uploadingFile,
    openGroupDialog,
    closeGroupDialog,
    toggleGroupMember,
    handleCreateGroup,
  } = useChatHandler();

  const [membersDialogOpen, setMembersDialogOpen] = useState(false);

  const panel = (
    <ContactPanel
      isMobile={isMobile}
      search={search}
      setSearch={setSearch}
      filteredContacts={filteredContacts}
      contacts={contacts}
      rooms={rooms}
      getLastMessage={getLastMessage}
      getUnreadCount={getUnreadCount}
      unreadCounts={unreadCounts}
      handleSelectContact={handleSelectContact}
      handleSelectRoom={handleSelectRoom}
      activeRoomId={activeRoomId}
      openGroupDialog={openGroupDialog}
      setShowPanel={setShowPanel}
    />
  );

  const window = (
    <ChatWindow
      isMobile={isMobile}
      activeContact={activeContact}
      activeRoom={activeRoom}
      currentUserId={chatUserId}
      headerStatus={headerStatus}
      messages={messages}
      messagesEndRef={messagesEndRef}
      messagesContainerRef={messagesContainerRef}
      hasMoreOlder={hasMoreOlder}
      loadingOlder={loadingOlder}
      onMessagesScroll={handleMessagesScroll}
      onRetryMessage={handleRetryMessage}
      onAcceptRequest={handleAcceptRequest}
      onUploadFile={handleUploadFile}
      uploadingFile={uploadingFile}
      sendError={sendError}
      sendingFirstMessage={sendingFirstMessage}
      input={input}
      setInput={setInput}
      handleSend={handleSend}
      handleKeyDown={handleKeyDown}
      setShowPanel={setShowPanel}
      onViewMembers={() => setMembersDialogOpen(true)}
    />
  );

  return (
    <Paper
      elevation={0}
      sx={{
        display: "flex",
        height: "100%",
        flex: 1,
        minHeight: 0,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 0,
        overflow: "hidden",
      }}
    >
      {isMobile ? (
        showPanel ? (
          panel
        ) : (
          window
        )
      ) : (
        <>
          {panel}
          {window}
        </>
      )}

      <CreateGroupDialog
        open={groupDialogOpen}
        onClose={closeGroupDialog}
        contacts={contacts}
        groupName={groupName}
        setGroupName={setGroupName}
        groupMemberIds={groupMemberIds}
        toggleGroupMember={toggleGroupMember}
        groupCreating={groupCreating}
        groupError={groupError}
        handleCreateGroup={handleCreateGroup}
      />
      <GroupMembersDialog
        open={membersDialogOpen}
        onClose={() => setMembersDialogOpen(false)}
        room={activeRoom}
      />
    </Paper>
  );
}

export default ChatPage;
