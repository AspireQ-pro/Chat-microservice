import React, { useState } from "react";
import { Paper } from "@mui/material";
import { useDispatch } from "react-redux";
import { useChatHandler } from "@/handler/chat";
import ContactPanel from "@/components/ContactPanel";
import ChatWindow from "@/components/ChatWindow";
import CreateGroupDialog from "@/components/CreateGroupDialog";
import GroupInfoDialog from "@/components/GroupInfoDialog";

function ChatPage() {
  const dispatch = useDispatch();
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
    handleEditMessage,
    handleDeleteMessage,
    socketConnected,
  } = useChatHandler();

  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [groupInfoRoomId, setGroupInfoRoomId] = useState(null);

  // Opens the info dialog for any group room (from sidebar click or header click)
  const openGroupInfo = (room) => {
    setGroupInfoRoomId((room || activeRoom)?.id || null);
    setGroupInfoOpen(true);
  };

  // Always use the latest room data from Redux
  const groupInfoRoom = rooms.find((r) => r.id === (groupInfoRoomId || activeRoomId)) || activeRoom;

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
      onGroupInfoClick={openGroupInfo}
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
      onViewMembers={() => openGroupInfo(activeRoom)}
      onEditMessage={handleEditMessage}
      onDeleteMessage={handleDeleteMessage}
      socketConnected={socketConnected}
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
        maxHeight: "100%",
        border: "none",
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

      <GroupInfoDialog
        open={groupInfoOpen}
        onClose={() => setGroupInfoOpen(false)}
        room={groupInfoRoom || activeRoom}
        currentUserId={chatUserId}
        contacts={contacts}
      />
    </Paper>
  );
}

export default ChatPage;
