import { useEffect, useRef, useState, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTheme, useMediaQuery } from "@mui/material";
import getSocket, { connectSocket } from "@/services/socket";
import { publishChatNotificationSummary } from "@/services/notifications";
import {
  setActiveRoom,
  selectContact,
  appendMessage,
  queueOutbox,
  messageSaved,
  messageFailed,
  retryingMessage,
  receiveMessage,
  messagesDelivered,
  messagesRead,
  roomUpdated,
  groupCreated,
  setConnected,
  setOnlineUsers,
  userOffline,
  fetchUsers,
  fetchMyRooms,
  fetchChatNotificationSummary,
  sendDirectRequest,
  uploadChatFile,
  acceptDirectRequest,
  fetchMessages,
  fetchOlderMessages,
  createGroup,
  markMessagesRead,
} from "@/provider/chatSlice";

export const ROLE_COLOR = {
  member: { bgcolor: "#e3f2fd", color: "#1565c0" },
  security: { bgcolor: "#fce4ec", color: "#c62828" },
  admin: { bgcolor: "#e8f5e9", color: "#2e7d32" },
};

function decodeChatUserId(token) {
  try {
    const payload = token.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes))?.userId || null;
  } catch {
    return null;
  }
}

function formatLastSeen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "last seen just now";
  if (diff < 3600) return `last seen ${Math.floor(diff / 60)}m ago`;
  const sameDay = d.toDateString() === new Date().toDateString();
  if (sameDay)
    return `last seen today ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  return `last seen ${d.toLocaleDateString()}`;
}

let clientMsgSeq = 0;
function makeClientId() {
  clientMsgSeq += 1;
  return `c-${Date.now()}-${clientMsgSeq}`;
}

function findDirectRoom(rooms, contactId, currentUserId) {
  return rooms.find(
    (room) =>
      !room.isGroup &&
      room.members?.some((member) => member.userId === contactId) &&
      room.members?.some((member) => member.userId === currentUserId),
  );
}

export function useChatHandler() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const currentUser = useSelector((s) => s.auth.user);
  const authToken = useSelector((s) => s.auth.token);
  const activeRoomId = useSelector((s) => s.chat.activeRoomId);
  const selectedContactId = useSelector((s) => s.chat.selectedContactId);
  const allMessages = useSelector((s) => s.chat.messages);
  const contacts = useSelector((s) => s.chat.contacts);
  const rooms = useSelector((s) => s.chat.rooms);
  const unreadCounts = useSelector((s) => s.chat.unreadCounts);
  const notificationSummary = useSelector((s) => s.chat.notificationSummary);
  const pagination = useSelector((s) => s.chat.pagination);
  const outbox = useSelector((s) => s.chat.outbox);
  const lastSeen = useSelector((s) => s.chat.lastSeen);

  const chatUserId = authToken ? decodeChatUserId(authToken) : null;

  useEffect(() => {
    publishChatNotificationSummary(notificationSummary);
  }, [
    notificationSummary.total,
    notificationSummary.unreadMessages,
    notificationSummary.pendingRequests,
  ]);

  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [showPanel, setShowPanel] = useState(true);

  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState([]);
  const [groupCreating, setGroupCreating] = useState(false);
  const [groupError, setGroupError] = useState("");
  const [sendError, setSendError] = useState("");
  const [sendingFirstMessage, setSendingFirstMessage] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  const searchTimer = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const activeRoomIdRef = useRef(null);
  const selectedContactIdRef = useRef(selectedContactId);
  const prevScrollHeightRef = useRef(0);
  const outboxRef = useRef(outbox);

  useEffect(() => {
    outboxRef.current = outbox;
  }, [outbox]);
  useEffect(() => {
    activeRoomIdRef.current = activeRoomId;
  }, [activeRoomId]);
  useEffect(() => {
    selectedContactIdRef.current = selectedContactId;
  }, [selectedContactId]);

  const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? null;

  const activeContact = (() => {
    if (!activeRoom) {
      return contacts.find((contact) => contact.id === selectedContactId) ?? null;
    }
    if (activeRoom.isGroup) {
      return {
        id: activeRoom.id,
        name: activeRoom.name,
        avatar: activeRoom.name?.slice(0, 2).toUpperCase() || "GR",
        online: false,
        isGroup: true,
      };
    }
    const partnerMember = activeRoom.members?.find(
      (m) => m.userId !== chatUserId,
    );
    const partner = contacts.find((c) => c.id === partnerMember?.userId);
    return partner ?? null;
  })();

  const rawMessages = activeRoomId ? allMessages[activeRoomId] || [] : [];
  const messages = rawMessages;
  const activePagination = activeRoomId ? pagination[activeRoomId] : null;

  const filteredContacts = contacts
    .filter((contact) =>
      (contact.name || "").toLowerCase().includes(search.toLowerCase()),
    )
    .slice()
    .sort((a, b) => {
      const roomA = findDirectRoom(rooms, a.id, chatUserId);
      const roomB = findDirectRoom(rooms, b.id, chatUserId);
      const unreadA = roomA ? unreadCounts[roomA.id] || 0 : 0;
      const unreadB = roomB ? unreadCounts[roomB.id] || 0 : 0;

      if (unreadA !== unreadB) return unreadB - unreadA;

      const activityA = new Date(roomA?.lastMessageAt || 0).getTime();
      const activityB = new Date(roomB?.lastMessageAt || 0).getTime();
      if (activityA !== activityB) return activityB - activityA;
      return (a.name || "").localeCompare(b.name || "");
    });

  const headerStatus = (() => {
    if (!activeContact) return "";
    if (activeContact.isGroup)
      return `${activeRoom?.members?.length ?? 0} members`;
    if (activeContact.online) return "Online";
    const seen = lastSeen[activeContact.id] || activeContact.lastSeenAt;
    return formatLastSeen(seen) || "Offline";
  })();

  // ── Connect socket + load users/rooms ──
  useEffect(() => {
    if (!currentUser?.id || !authToken) return;
    const socket =
      authToken !== "dev-mock-token" ? connectSocket(authToken) : null;
    dispatch(fetchUsers({}));
    dispatch(fetchMyRooms());
    dispatch(fetchChatNotificationSummary());

    if (!socket) return;

    const myChatId = decodeChatUserId(authToken);

    const onConnect = () => {
      dispatch(setConnected(true));
      socket.emit("get_online_users");
      dispatch(fetchMyRooms());
      dispatch(fetchChatNotificationSummary());
      const openRoom = activeRoomIdRef.current;
      if (openRoom) {
        socket.emit("join_room", openRoom);
        dispatch(fetchMessages(openRoom));
        socket.emit("messages_read", { roomId: openRoom });
      }
      // Flush queued (offline) messages.
      (outboxRef.current || []).forEach((o) => {
        socket.emit("send_message", {
          roomId: o.roomId,
          content: o.text,
          clientId: o.clientId,
        });
      });
    };
    const onDisconnect = () => dispatch(setConnected(false));
    const onOnline = (ids) => dispatch(setOnlineUsers(ids || []));
    const onOffline = (p) => dispatch(userOffline(p || {}));
    const onNewMessage = (message) => {
      const rid = message?.roomId;
      const mine = myChatId && message?.senderId === myChatId;
      if (mine && !message?.clientId) return;
      dispatch(
        receiveMessage({ roomId: rid, message, currentUserId: myChatId }),
      );
      dispatch(fetchChatNotificationSummary());
      if (mine) return;
      socket.emit("message_delivered", { roomId: rid });
      if (activeRoomIdRef.current === rid)
        socket.emit("messages_read", { roomId: rid });
    };
    const onAck = (p) => {
      if (!p) return;
      if (p.status === "saved")
        dispatch(
          messageSaved({ clientId: p.clientId, roomId: p.message?.roomId }),
        );
      else if (p.status === "failed")
        dispatch(messageFailed({ clientId: p.clientId }));
    };
    const onDelivered = (p) => dispatch(messagesDelivered(p || {}));
    const onRead = (p) => {
      dispatch(messagesRead(p || {}));
      dispatch(fetchChatNotificationSummary());
    };
    const onRoomUpd = (p) => {
      dispatch(roomUpdated(p || {}));
      if (p?.roomId) {
        dispatch(fetchMyRooms())
          .unwrap()
          .then((updatedRooms) => {
            if (
              p.directStatus !== "pending" ||
              p.requestedById === myChatId ||
              !selectedContactIdRef.current
            ) return;
            const requestRoom = updatedRooms.find((room) => room.id === p.roomId);
            const otherMember = requestRoom?.members?.find(
              (member) => member.userId !== myChatId,
            );
            if (otherMember?.userId === selectedContactIdRef.current) {
              dispatch(setActiveRoom(requestRoom));
            }
          })
          .catch(() => {});
        dispatch(fetchChatNotificationSummary());
      }
    };
    const onGroupCreated = (p) => dispatch(groupCreated(p || {}));

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("online_users", onOnline);
    socket.on("user_offline", onOffline);
    socket.on("new_message", onNewMessage);
    socket.on("message_ack", onAck);
    socket.on("messages_delivered", onDelivered);
    socket.on("messages_read", onRead);
    socket.on("room_updated", onRoomUpd);
    socket.on("group_created", onGroupCreated);

    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("online_users", onOnline);
      socket.off("user_offline", onOffline);
      socket.off("new_message", onNewMessage);
      socket.off("message_ack", onAck);
      socket.off("messages_delivered", onDelivered);
      socket.off("messages_read", onRead);
      socket.off("room_updated", onRoomUpd);
      socket.off("group_created", onGroupCreated);
    };
  }, [dispatch, currentUser?.id, authToken]);

  // ── Search with debounce ──
  useEffect(() => {
    if (!currentUser?.id) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      dispatch(fetchUsers({ q: search || undefined }));
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [dispatch, search, currentUser?.id]);

  // ── Join room + history + mark read on active room change ──
  useEffect(() => {
    if (!activeRoomId) return;
    const socket = getSocket();
    if (socket) {
      socket.emit("join_room", activeRoomId);
      socket.emit("messages_read", { roomId: activeRoomId });
    }
    dispatch(fetchMessages(activeRoomId));
    dispatch(markMessagesRead({ roomId: activeRoomId }));
  }, [dispatch, activeRoomId]);

  // ── Auto-scroll (not while loading older) ──
  useEffect(() => {
    if (activePagination?.loadingOlder) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activePagination?.loadingOlder]);

  // ── Preserve scroll after prepending older ──
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    if (prevScrollHeightRef.current) {
      const diff = el.scrollHeight - prevScrollHeightRef.current;
      if (diff > 0) el.scrollTop = diff;
      prevScrollHeightRef.current = 0;
    }
  }, [messages]);

  const handleMessagesScroll = useCallback(
    (e) => {
      const el = e.currentTarget;
      if (el.scrollTop > 40) return;
      const p = activeRoomId ? pagination[activeRoomId] : null;
      if (!p || !p.hasMore || p.loadingOlder) return;
      prevScrollHeightRef.current = el.scrollHeight;
      dispatch(fetchOlderMessages(activeRoomId));
    },
    [dispatch, activeRoomId, pagination],
  );

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    if (!activeRoomId && selectedContactId) {
      if (sendingFirstMessage) return;
      setSendingFirstMessage(true);
      setSendError("");
      try {
        await dispatch(
          sendDirectRequest({
            userId2: selectedContactId,
            content: text,
            clientId: makeClientId(),
          }),
        ).unwrap();
        setInput("");
      } catch (err) {
        setSendError(err || "Could not send the message request. Try again.");
      } finally {
        setSendingFirstMessage(false);
      }
      return;
    }
    if (!activeRoomId) return;
    setSendError("");
    const clientId = makeClientId();
    const socket = getSocket();
    const online = !!(socket && socket.connected);

    dispatch(
      appendMessage({
        roomId: activeRoomId,
        message: {
          id: `optimistic-${clientId}`,
          clientId,
          roomId: activeRoomId,
          senderId: chatUserId,
          senderName: currentUser?.name || "",
          text,
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          createdAt: new Date().toISOString(),
          mine: true,
          status: online ? "sent" : "sending",
        },
      }),
    );

    if (online) {
      socket.emit("send_message", {
        roomId: activeRoomId,
        content: text,
        clientId,
      });
    } else {
      dispatch(queueOutbox({ clientId, roomId: activeRoomId, text }));
    }
    setInput("");
  }, [
    dispatch,
    input,
    activeRoomId,
    selectedContactId,
    sendingFirstMessage,
    chatUserId,
    currentUser?.name,
  ]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRetryMessage = useCallback(
    (message) => {
      if (!message?.clientId) return;
      const socket = getSocket();
      if (socket && socket.connected) {
        dispatch(retryingMessage({ clientId: message.clientId }));
        socket.emit("send_message", {
          roomId: message.roomId,
          content: message.text || undefined,
          fileUrl: message.fileUrl || undefined,
          fileType: message.fileType || undefined,
          clientId: message.clientId,
        });
      } else {
        if (message.fileUrl) {
          setSendError("Reconnect to Chat before retrying this attachment.");
          return;
        }
        dispatch(retryingMessage({ clientId: message.clientId }));
        dispatch(
          queueOutbox({
            clientId: message.clientId,
            roomId: message.roomId,
            text: message.text,
          }),
        );
      }
    },
    [dispatch],
  );

  const handleUploadFile = useCallback(async (file) => {
    if (!file || !activeRoomId) return;
    const socket = getSocket();
    if (!socket?.connected) {
      setSendError("Connect to Chat before sending an attachment.");
      return;
    }

    setUploadingFile(true);
    setSendError("");
    try {
      const uploaded = await dispatch(
        uploadChatFile({ roomId: activeRoomId, file }),
      ).unwrap();
      const clientId = makeClientId();
      dispatch(
        appendMessage({
          roomId: activeRoomId,
          message: {
            id: `optimistic-${clientId}`,
            clientId,
            roomId: activeRoomId,
            senderId: chatUserId,
            senderName: currentUser?.name || "",
            text: "",
            fileUrl: uploaded.fileUrl,
            fileType: uploaded.fileType,
            messageType: uploaded.fileType === "image" ? "image" : "file",
            time: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            createdAt: new Date().toISOString(),
            mine: true,
            status: "sending",
          },
        }),
      );
      socket.emit("send_message", {
        roomId: activeRoomId,
        fileUrl: uploaded.fileUrl,
        fileType: uploaded.fileType,
        clientId,
      });
    } catch (err) {
      setSendError(err || "File upload failed. Try again.");
    } finally {
      setUploadingFile(false);
    }
  }, [dispatch, activeRoomId, chatUserId, currentUser?.name]);

  const handleSelectContact = useCallback(
    (contactId) => {
      const room = findDirectRoom(rooms, contactId, chatUserId);
      setSendError("");
      if (room) dispatch(setActiveRoom(room));
      else dispatch(selectContact(contactId));
      if (isMobile) setShowPanel(false);
    },
    [dispatch, rooms, chatUserId, isMobile],
  );

  const handleSelectRoom = useCallback(
    (room) => {
      dispatch(setActiveRoom(room));
      if (isMobile) setShowPanel(false);
    },
    [dispatch, isMobile],
  );

  const getLastMessage = useCallback(
    (contactId) => {
      const room = findDirectRoom(rooms, contactId, chatUserId);
      if (room?.directStatus === "pending" && !room.lastMessagePreview) {
        return room.requestedById === chatUserId
          ? "Waiting for acceptance"
          : "Message request";
      }
      return room?.lastMessagePreview || null;
    },
    [rooms, chatUserId],
  );

  const handleAcceptRequest = useCallback(() => {
    if (activeRoomId) dispatch(acceptDirectRequest({ roomId: activeRoomId }));
  }, [dispatch, activeRoomId]);

  const getUnreadCount = useCallback(
    (contactId) => {
      const room = findDirectRoom(rooms, contactId, chatUserId);
      return room ? unreadCounts[room.id] || 0 : 0;
    },
    [rooms, unreadCounts, chatUserId],
  );

  const openGroupDialog = useCallback(() => {
    setGroupName("");
    setGroupMemberIds([]);
    setGroupError("");
    setGroupDialogOpen(true);
  }, []);
  const closeGroupDialog = useCallback(() => {
    setGroupDialogOpen(false);
    setGroupName("");
    setGroupMemberIds([]);
    setGroupError("");
  }, []);
  const toggleGroupMember = useCallback((id) => {
    setGroupMemberIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  }, []);
  const handleCreateGroup = useCallback(async () => {
    if (!groupName.trim()) {
      setGroupError("Group name is required.");
      return;
    }
    if (groupMemberIds.length === 0) {
      setGroupError("Select at least one member.");
      return;
    }
    setGroupCreating(true);
    setGroupError("");
    try {
      await dispatch(
        createGroup({ name: groupName.trim(), memberIds: groupMemberIds }),
      ).unwrap();
      closeGroupDialog();
      if (isMobile) setShowPanel(false);
    } catch (err) {
      setGroupError(
        typeof err === "string"
          ? err
          : err?.message || "Failed to create group. Try again.",
      );
    } finally {
      setGroupCreating(false);
    }
  }, [dispatch, groupName, groupMemberIds, closeGroupDialog, isMobile]);

  return {
    input,
    search,
    showPanel,
    isMobile,
    activeRoom,
    activeContact,
    activeRoomId,
    headerStatus,
    messages,
    contacts,
    rooms,
    filteredContacts,
    messagesEndRef,
    messagesContainerRef,
    currentUser,
    chatUserId,
    unreadCounts,
    hasMoreOlder: !!activePagination?.hasMore,
    loadingOlder: !!activePagination?.loadingOlder,
    groupDialogOpen,
    groupName,
    groupMemberIds,
    groupCreating,
    groupError,
    sendError,
    sendingFirstMessage,
    uploadingFile,
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
    openGroupDialog,
    closeGroupDialog,
    toggleGroupMember,
    handleCreateGroup,
  };
}
