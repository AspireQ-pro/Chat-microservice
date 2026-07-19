import React, { useState } from 'react'
import { Paper } from '@mui/material'
import { useChatHandler } from '@/handler/chat'
import ContactPanel from '@/components/ContactPanel'
import ChatWindow from '@/components/ChatWindow'
import CreateGroupDialog from '@/components/CreateGroupDialog'
import GroupMembersDialog from '@/components/GroupMembersDialog'

function ChatPage() {
  const {
    input, search, showPanel, isMobile,
    activeContact, activeRoomId, activeRoom, messages,
    filteredContacts, contacts, rooms, messagesEndRef,
    setInput, setSearch, setShowPanel, setGroupName,
    handleSend, handleKeyDown, handleSelectContact,
    getLastMessage, handleSelectRoom,
    selectedFile, fileInputRef, uploading, handleFileChange, handleRemoveFile,
    groupDialogOpen, groupName, groupMemberIds, groupCreating, groupError,
    openGroupDialog, closeGroupDialog, toggleGroupMember, handleCreateGroup,
  } = useChatHandler()

  const [membersDialogOpen, setMembersDialogOpen] = useState(false)

  const panel = (
    <ContactPanel
      isMobile={isMobile}
      search={search}
      setSearch={setSearch}
      filteredContacts={filteredContacts}
      contacts={contacts}
      rooms={rooms}
      getLastMessage={getLastMessage}
      handleSelectContact={handleSelectContact}
      handleSelectRoom={handleSelectRoom}
      activeRoomId={activeRoomId}
      openGroupDialog={openGroupDialog}
    />
  )

  const window = (
    <ChatWindow
      isMobile={isMobile}
      activeContact={activeContact}
      activeRoom={activeRoom}
      messages={messages}
      messagesEndRef={messagesEndRef}
      input={input}
      setInput={setInput}
      handleSend={handleSend}
      handleKeyDown={handleKeyDown}
      setShowPanel={setShowPanel}
      selectedFile={selectedFile}
      fileInputRef={fileInputRef}
      uploading={uploading}
      handleFileChange={handleFileChange}
      handleRemoveFile={handleRemoveFile}
      onViewMembers={() => setMembersDialogOpen(true)}
    />
  )

  return (
    <Paper
      elevation={0}
      sx={{
        display: 'flex', height: '100vh', minHeight: 0,
        border: '1px solid', borderColor: 'divider',
        borderRadius: 0, overflow: 'hidden',
      }}
    >
      {isMobile ? (showPanel ? panel : window) : <>{panel}{window}</>}

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
  )
}

export default ChatPage
