import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDistanceToNow, isToday, isYesterday, format } from "date-fns";
import { ref, onValue } from "firebase/database";
import Layout from "../components/Layout.jsx";
import {
  getMessages,
  getUnreadMessageCounts,
  sendMessage,
  uploadMessageAttachment,
  getAllProfiles,
  getConversation,
  markConversationRead,
  setConversationTyping,
  getConversationsTyping,
  truncateAddress,
} from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { firebaseDb, convId as fbConvId } from "../lib/firebase.js";

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

function isOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
}

function PresenceDot({ online, size = "md" }) {
  const sz = size === "sm" ? "w-2.5 h-2.5 border-[1.5px]" : "w-3 h-3 border-2";
  return (
    <span
      className={`absolute bottom-0 right-0 ${sz} rounded-full border-background ${online ? "bg-green-500" : "bg-zinc-500"}`}
    />
  );
}

function TypingDots({ size = "sm" }) {
  const dotSize = size === "lg" ? "w-1.5 h-1.5" : "w-1 h-1";
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label="Typing"
      role="status"
    >
      <span className={`${dotSize} rounded-full bg-current animate-bounce`} style={{ animationDelay: "0ms" }} />
      <span className={`${dotSize} rounded-full bg-current animate-bounce`} style={{ animationDelay: "140ms" }} />
      <span className={`${dotSize} rounded-full bg-current animate-bounce`} style={{ animationDelay: "280ms" }} />
    </span>
  );
}

function Avatar({ profile, size = "md" }) {
  const sz =
    size === "sm"
      ? "w-8 h-8 text-xs"
      : size === "lg"
        ? "w-12 h-12 text-base"
        : "w-10 h-10 text-sm";
  if (profile?.avatarUrl) {
    return (
      <img
        src={profile.avatarUrl}
        alt={profile.username || "?"}
        className={`${sz} rounded-full object-cover flex-shrink-0`}
      />
    );
  }
  const initial = profile?.username
    ? profile.username.charAt(0).toUpperCase()
    : "?";
  return (
    <div
      className={`${sz} rounded-full bg-gradient-brand flex items-center justify-center text-white font-bold flex-shrink-0`}
    >
      {initial}
    </div>
  );
}

function DateSeparator({ date }) {
  const label = isToday(date)
    ? "Today"
    : isYesterday(date)
      ? "Yesterday"
      : format(date, "MMMM d, yyyy");
  return (
    <div className="flex items-center gap-3 my-2">
      <div className="flex-1 h-px bg-white/10" />
      <span className="text-[10px] text-muted-foreground font-medium px-2">
        {label}
      </span>
      <div className="flex-1 h-px bg-white/10" />
    </div>
  );
}

function UnreadSeparator() {
  return (
    <div className="flex items-center gap-3 my-3">
      <div className="flex-1 h-px bg-primary/40" />
      <span className="text-[10px] text-primary font-semibold px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
        Unread messages
      </span>
      <div className="flex-1 h-px bg-primary/40" />
    </div>
  );
}

function groupMessages(messages) {
  const groups = [];
  let lastDate = null;
  messages.forEach((msg, i) => {
    const msgDate = msg.createdAt ? new Date(msg.createdAt) : new Date();
    const dateStr = format(msgDate, "yyyy-MM-dd");
    if (dateStr !== lastDate) {
      groups.push({ type: "date", date: msgDate, key: `date-${dateStr}` });
      lastDate = dateStr;
    }
    const prev = messages[i - 1];
    const isContinuation = prev && prev.sender === msg.sender;
    groups.push({ type: "message", msg, isContinuation });
  });
  return groups;
}

export default function MessagesPage() {
  const { address: wallet, isAuthenticated, openAuthModal } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedAddress = searchParams.get("with") || "";
  const [allMessages, setAllMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [allProfiles, setAllProfiles] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [selectedAttachment, setSelectedAttachment] = useState(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const attachmentInputRef = useRef(null);
  const [isLoadingConvos, setIsLoadingConvos] = useState(true);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [conversationFilter, setConversationFilter] = useState("all");
  const [unreadByConversation, setUnreadByConversation] = useState({});
  const [presence, setPresence] = useState({});
  const [typingByUser, setTypingByUser] = useState({});
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const markReadTimerRef = useRef(null);
  const typingStopTimerRef = useRef(null);
  const typingActiveRef = useRef(false);
  const typingLastSentAtRef = useRef(0);
  const processedNativeActionRef = useRef(null);

  const refreshUnreadCounts = useCallback(async () => {
    if (!wallet || !isAuthenticated) {
      setUnreadByConversation({});
      return;
    }
    try {
      const result = await getUnreadMessageCounts();
      setUnreadByConversation(result?.conversations || {});
    } catch {
      // Keep the last good counts during temporary network problems.
    }
  }, [wallet, isAuthenticated]);

  useEffect(() => {
    if (!wallet || !isAuthenticated) {
      setUnreadByConversation({});
      return;
    }
    refreshUnreadCounts();
    const intervalId = setInterval(refreshUnreadCounts, 5000);
    window.addEventListener("myworld:unread-messages-changed", refreshUnreadCounts);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener("myworld:unread-messages-changed", refreshUnreadCounts);
    };
  }, [wallet, isAuthenticated, refreshUnreadCounts]);

  const loadConversations = useCallback(async () => {
    if (!wallet) return;
    try {
      const [profilesData, msgs] = await Promise.all([
        getAllProfiles(),
        getMessages(wallet),
      ]);
      const profileMap = {};
      profilesData.forEach((p) => {
        profileMap[p.address] = p;
      });
      setProfiles(profileMap);
      setAllProfiles(profilesData.filter((p) => p.address !== wallet));
      setAllMessages(msgs || []);

      const convMap = {};
      (msgs || []).forEach((msg) => {
        const other = msg.sender === wallet ? msg.receiver : msg.sender;
        if (!convMap[other]) convMap[other] = { address: other, messages: [] };
        convMap[other].messages.push(msg);
      });

      const sorted = Object.values(convMap).sort((a, b) => {
        const aLast = a.messages[a.messages.length - 1]?.createdAt || "0";
        const bLast = b.messages[b.messages.length - 1]?.createdAt || "0";
        return bLast.localeCompare(aLast);
      });

      setConversations(sorted);
    } catch (err) {
      console.error("Failed to load conversations", err);
    } finally {
      setIsLoadingConvos(false);
    }
  }, [wallet]);

  const selectConversation = useCallback((profile) => {
    if (!profile?.address) return;
    setSelectedUser(profile);
    setShowNewChat(false);
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("with", profile.address);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const startNewChat = (profile) => {
    selectConversation(profile);
    setNewChatSearch("");
  };

  useEffect(() => {
    if (isAuthenticated) loadConversations();
  }, [isAuthenticated, loadConversations]);

  // Push and notification links can open a specific conversation.
  useEffect(() => {
    if (!isAuthenticated || !requestedAddress) return;
    const profile =
      profiles[requestedAddress] ||
      allProfiles.find((item) => item.address === requestedAddress) ||
      { address: requestedAddress };
    setSelectedUser((current) =>
      current?.address === requestedAddress && current === profile ? current : profile,
    );
    setShowNewChat(false);
  }, [isAuthenticated, requestedAddress, profiles, allProfiles]);

  // Handle authenticated actions submitted from Android notification buttons.
  // The native wrapper puts the action in the URL so this still works when the
  // app was fully closed and the WebView had to start from scratch.
  useEffect(() => {
    const nativeAction = searchParams.get("nativeAction");
    const actionId = searchParams.get("nativeActionId");
    const replyText = (searchParams.get("replyText") || "").trim();

    if (
      !isAuthenticated ||
      !wallet ||
      !requestedAddress ||
      !nativeAction ||
      !actionId ||
      !["reply", "mark-as-read"].includes(nativeAction)
    ) {
      return;
    }
    if (processedNativeActionRef.current === actionId) return;
    processedNativeActionRef.current = actionId;

    const clearActionFromUrl = () => {
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        next.delete("nativeAction");
        next.delete("nativeActionId");
        next.delete("replyText");
        return next;
      }, { replace: true });
    };

    (async () => {
      try {
        if (nativeAction === "reply") {
          if (!replyText) return;
          await sendMessage({
            sender: wallet,
            receiver: requestedAddress,
            content: replyText.slice(0, 2000),
          });
          await loadConversations();
        }

        // A quick reply is also an interaction with this conversation, so
        // synchronize incoming read receipts through the same API as the chat.
        await markConversationRead(requestedAddress);
        window.dispatchEvent(new Event("myworld:unread-messages-changed"));
      } catch (error) {
        console.warn("Android notification action failed:", error);
      } finally {
        clearActionFromUrl();
      }
    })();
  }, [
    isAuthenticated,
    wallet,
    requestedAddress,
    searchParams,
    setSearchParams,
    loadConversations,
  ]);

  // ─── Firebase real-time presence for all conversation partners ───────────
  useEffect(() => {
    if (!conversations.length) return;
    const addrs = conversations.map((c) => c.address).filter(Boolean);
    const unsubs = addrs.map((addr) => {
      const presRef = ref(firebaseDb, `presence/${addr}`);
      return onValue(presRef, (snapshot) => {
        const data = snapshot.val();
        setPresence((prev) => ({ ...prev, [addr]: data?.lastSeenAt || null }));
      });
    });
    return () => unsubs.forEach((u) => u());
  }, [conversations]);

  // ─── Firebase presence for the currently open conversation ───────────────
  // Handles users not yet in the conversations list (e.g. new chats)
  useEffect(() => {
    if (!selectedUser?.address) return;
    const presRef = ref(firebaseDb, `presence/${selectedUser.address}`);
    const unsub = onValue(presRef, (snapshot) => {
      const data = snapshot.val();
      setPresence((prev) => ({
        ...prev,
        [selectedUser.address]: data?.lastSeenAt || null,
      }));
    });
    return () => unsub();
  }, [selectedUser?.address]);

  // Every conversation row subscribes to its partner's typing state. This
  // lets the inbox show who is typing without first opening that conversation.
  const typingTargetAddresses = useMemo(
    () =>
      Array.from(
        new Set([
          ...conversations.map((conversation) => conversation.address),
          selectedUser?.address,
        ].filter(Boolean)),
      ).slice(0, 100),
    [conversations, selectedUser?.address],
  );

  useEffect(() => {
    if (!wallet || !isAuthenticated || !typingTargetAddresses.length) {
      setTypingByUser({});
      return;
    }

    const expiryTimers = new Map();
    const unsubscribers = typingTargetAddresses.map((otherAddress) => {
      const typingRef = ref(
        firebaseDb,
        `conversations/${fbConvId(wallet, otherAddress)}/typing/${otherAddress}`,
      );

      return onValue(
        typingRef,
        (snapshot) => {
          const status = snapshot.val();
          const updatedAt = Date.parse(status?.updatedAt || "");
          const ageMs = Date.now() - updatedAt;
          const isTyping =
            status?.isTyping === true &&
            Number.isFinite(updatedAt) &&
            ageMs >= -5000 &&
            ageMs < 8000;

          setTypingByUser((previous) =>
            previous[otherAddress] === isTyping
              ? previous
              : { ...previous, [otherAddress]: isTyping },
          );

          const existingTimer = expiryTimers.get(otherAddress);
          if (existingTimer) clearTimeout(existingTimer);
          if (isTyping) {
            expiryTimers.set(
              otherAddress,
              setTimeout(() => {
                setTypingByUser((previous) => ({
                  ...previous,
                  [otherAddress]: false,
                }));
                expiryTimers.delete(otherAddress);
              }, Math.max(0, 8000 - ageMs + 100)),
            );
          } else {
            expiryTimers.delete(otherAddress);
          }
        },
        (error) => {
          console.warn("[firebase] typing listener error:", error);
        },
      );
    });

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      expiryTimers.forEach((timer) => clearTimeout(timer));
    };
  }, [typingTargetAddresses, wallet, isAuthenticated]);

  // Keep a batched API fallback so typing remains visible if a Firebase
  // typing write/listener is rejected or temporarily disconnected. One request
  // covers the entire inbox rather than polling once per conversation.
  useEffect(() => {
    if (!wallet || !isAuthenticated || !typingTargetAddresses.length) return;

    let active = true;
    const refreshTypingStatuses = async () => {
      try {
        const result = await getConversationsTyping(typingTargetAddresses);
        if (!active) return;
        const statuses = result?.statuses || {};
        setTypingByUser((previous) => {
          const next = { ...previous };
          typingTargetAddresses.forEach((otherAddress) => {
            next[otherAddress] = statuses[otherAddress]?.isTyping === true;
          });
          return next;
        });
      } catch {
        // The Firebase subscription remains live if the fallback request fails.
      }
    };

    refreshTypingStatuses();
    const intervalId = setInterval(refreshTypingStatuses, 1000);
    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [typingTargetAddresses, wallet, isAuthenticated]);

  // Stop typing updates when a conversation changes or the component unmounts.
  useEffect(() => {
    const otherAddress = selectedUser?.address;
    return () => {
      if (typingStopTimerRef.current) {
        clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = null;
      }
      if (typingActiveRef.current && otherAddress && isAuthenticated) {
        typingActiveRef.current = false;
        setConversationTyping(otherAddress, false).catch(() => {});
      }
    };
  }, [selectedUser?.address, isAuthenticated]);

  // ─── Firebase real-time message listener (with Neon DB history fallback) ─────────────────────────────────
  useEffect(() => {
    if (!selectedUser || !wallet) return;

    setIsLoadingChat(true);
    setChatMessages([]);
    inputRef.current?.focus();

    const cId = fbConvId(wallet, selectedUser.address);
    const msgsRef = ref(firebaseDb, `conversations/${cId}/messages`);

    // Mutable buckets shared between the DB load and the Firebase listener.
    // Both must resolve before we render — this avoids a blank flash when
    // Firebase fires before the DB fetch returns (or vice versa).
    // `active` prevents stale async results from overwriting a newer conversation.
    let active = true;
    let dbMsgs = [];
    let fbMsgs = [];
    let dbDone = false;
    let fbDone = false;
    function mergeAndSet() {
      if (!active || !dbDone || !fbDone) return;
      const map = new Map();
      // DB messages provide the complete historical record. Firebase may send
      // partial updates (for example, a read receipt), so merge rather than
      // replacing a complete DB message with an incomplete realtime payload.
      dbMsgs.forEach((m) => map.set(m.id, m));
      fbMsgs.forEach((m) => {
        const previous = map.get(m.id) || {};
        map.set(m.id, {
          ...previous,
          ...m,
          id: m.id,
          readAt: m.readAt ?? previous.readAt ?? null,
        });
      });
      const sorted = Array.from(map.values()).sort((a, b) =>
        (a.createdAt || "").localeCompare(b.createdAt || ""),
      );
      setChatMessages(sorted);
      setIsLoadingChat(false);
    }

    // 1) Load full history from Neon DB so old conversations are never blank
    getConversation(wallet, selectedUser.address)
      .then((msgs) => {
        dbMsgs = msgs || [];
      })
      .catch(() => {})
      .finally(() => {
        dbDone = true;
        mergeAndSet();
      });

    // 2) Subscribe to Firebase for real-time updates (new messages arrive here)

    const unsubscribe = onValue(
      msgsRef,
      (snapshot) => {
        const data = snapshot.val();
        fbMsgs = data
          ? Object.entries(data).map(([id, msg]) => ({ ...msg, id }))
          : [];
        fbDone = true;
        mergeAndSet();

        // Keep sidebar in sync when new messages arrive
        if (active) loadConversations();
      },
      (err) => {
        console.error("[firebase] onValue error:", err);
        fbDone = true;
        mergeAndSet();
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [selectedUser?.address, wallet]);

  // Persist message reads and update inbox/navigation badges immediately.
  useEffect(() => {
    const otherAddress = selectedUser?.address;
    if (!otherAddress || !wallet || !isAuthenticated || isLoadingChat) return;

    const hasUnreadIncoming = chatMessages.some(
      (message) =>
        message.sender === otherAddress &&
        message.receiver === wallet &&
        !message.readAt,
    );
    if (!hasUnreadIncoming) return;

    clearTimeout(markReadTimerRef.current);
    markReadTimerRef.current = setTimeout(async () => {
      try {
        const result = await markConversationRead(otherAddress);
        const receipts = new Map(
          (result?.messages || []).map((message) => [message.id, message.readAt]),
        );
        if (receipts.size) {
          const applyReceipts = (current) =>
            current.map((message) =>
              receipts.has(message.id)
                ? { ...message, readAt: receipts.get(message.id) }
                : message,
            );
          setChatMessages(applyReceipts);
          setAllMessages(applyReceipts);
        }

        setUnreadByConversation((previous) => ({
          ...previous,
          [otherAddress]: 0,
        }));
        window.dispatchEvent(new Event("myworld:unread-messages-changed"));
        refreshUnreadCounts();
      } catch (err) {
        console.warn("Failed to sync conversation read receipt:", err);
      }
    }, 350);

    return () => clearTimeout(markReadTimerRef.current);
  }, [
    chatMessages,
    selectedUser?.address,
    wallet,
    isAuthenticated,
    isLoadingChat,
    refreshUnreadCounts,
  ]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const stopTyping = (otherAddress = selectedUser?.address) => {
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    if (typingActiveRef.current && otherAddress) {
      typingActiveRef.current = false;
      typingLastSentAtRef.current = 0;
      setConversationTyping(otherAddress, false).catch(() => {});
    }
  };

  const handleMessageChange = (event) => {
    const value = event.target.value;
    setNewMessage(value);
    const otherAddress = selectedUser?.address;
    if (!otherAddress || !isAuthenticated) return;

    if (!value.trim()) {
      stopTyping(otherAddress);
      return;
    }

    const now = Date.now();
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      typingLastSentAtRef.current = now;
      setConversationTyping(otherAddress, true).catch(() => {
        typingActiveRef.current = false;
      });
    } else if (now - typingLastSentAtRef.current >= 2000) {
      // Refresh the short-lived server indicator while the user keeps typing.
      typingLastSentAtRef.current = now;
      setConversationTyping(otherAddress, true).catch(() => {});
    }
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(() => {
      typingActiveRef.current = false;
      typingLastSentAtRef.current = 0;
      setConversationTyping(otherAddress, false).catch(() => {});
      typingStopTimerRef.current = null;
    }, 3000);
  };

  const handleAttachmentSelect = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      window.alert("Files must be 25 MB or smaller.");
      event.target.value = "";
      return;
    }
    const allowed = ["image/jpeg","image/png","image/gif","image/webp","application/pdf","text/plain","text/csv","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation"];
    if (!allowed.includes(file.type)) {
      window.alert("Choose an image, PDF, text/CSV, Word, Excel, or PowerPoint file.");
      event.target.value = "";
      return;
    }
    if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl);
    setSelectedAttachment(file);
    setAttachmentPreviewUrl(file.type.startsWith("image/") ? URL.createObjectURL(file) : "");
  };

  const clearSelectedAttachment = () => {
    if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl);
    setAttachmentPreviewUrl("");
    setSelectedAttachment(null);
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const text = newMessage.trim();
    if ((!text && !selectedAttachment) || !selectedUser || isSendingMessage) return;
    if (!isAuthenticated) { openAuthModal("signin"); return; }
    stopTyping(selectedUser.address);
    setIsSendingMessage(true);
    setUploadProgress(0);
    setNewMessage("");
    const attachment = selectedAttachment;
    try {
      if (attachment) {
        await uploadMessageAttachment(selectedUser.address, attachment, text, setUploadProgress);
        clearSelectedAttachment();
      } else {
        await sendMessage({ sender: wallet, receiver: selectedUser.address, content: text });
      }
      loadConversations();
    } catch (err) {
      console.error("Failed to send message", err);
      setNewMessage(text);
      window.alert(err.message || "Message could not be sent. Please try again.");
    } finally {
      setIsSendingMessage(false);
      setUploadProgress(0);
    }
  };

  const handleSelectUser = (conv) => {
    const profile = profiles[conv.address] || { address: conv.address };
    selectConversation(profile);
  };

  // Per-chat counts are derived from the persisted read_at status.
  const unreadCount = useCallback(
    (convAddress) => Number(unreadByConversation[convAddress]) || 0,
    [unreadByConversation],
  );

  // Find the first message the current account has not read yet.
  const firstUnreadIndex = useCallback(() => {
    if (!selectedUser) return -1;
    return chatMessages.findIndex(
      (message) =>
        message.sender === selectedUser.address &&
        message.receiver === wallet &&
        !message.readAt,
    );
  }, [chatMessages, selectedUser, wallet]);

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="max-w-md mx-auto w-full px-4 py-20 text-center flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mb-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h2 className="text-xl md:text-2xl font-bold">
            Sign in to read messages
          </h2>
          <p className="text-muted-foreground text-sm">
            Messages are private to your account.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => openAuthModal("signin")}
              className="bg-primary text-primary-foreground px-6 py-3 rounded-full font-bold hover:bg-primary/90 text-sm"
            >
              Sign in
            </button>
            <button
              onClick={() => openAuthModal("signup")}
              className="bg-secondary border border-white/10 px-6 py-3 rounded-full font-bold hover:bg-secondary/80 text-sm"
            >
              Sign up
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  const selectedProfile = selectedUser
    ? profiles[selectedUser.address] || selectedUser
    : null;
  const grouped = groupMessages(chatMessages);
  const unreadIdx = firstUnreadIndex();

  // Inject unread separator into grouped items
  const groupedWithSeparator = [];
  let separatorInserted = false;
  grouped.forEach((item) => {
    if (
      !separatorInserted &&
      unreadIdx !== -1 &&
      item.type === "message" &&
      item.msg === chatMessages[unreadIdx]
    ) {
      groupedWithSeparator.push({
        type: "unread-separator",
        key: "unread-sep",
      });
      separatorInserted = true;
    }
    groupedWithSeparator.push(item);
  });

  const filteredConversations = conversations.filter((conv) => {
    const profile = profiles[conv.address] || {};
    const lastMsg = conv.messages[conv.messages.length - 1];
    const query = conversationSearch.trim().toLowerCase();
    const searchableText = [
      profile.displayName,
      profile.username,
      conv.address,
      lastMsg?.content,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matchesSearch = !query || searchableText.includes(query);
    const matchesFilter =
      conversationFilter === "all" ||
      (conversationFilter === "unread" && unreadCount(conv.address) > 0) ||
      (conversationFilter === "online" && isOnline(presence[conv.address]));
    return matchesSearch && matchesFilter;
  });

  return (
    <Layout>
      <div
        className="max-w-6xl mx-auto w-full px-2 md:px-4 py-4 md:py-8"
        style={{
          height: "calc(100dvh - 4rem - env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="flex h-full gap-3 md:gap-6">
          {/* Sidebar */}
          <div
            className={`w-full md:w-80 glass-panel rounded-2xl md:rounded-3xl flex flex-col overflow-hidden flex-shrink-0 ${selectedUser ? "hidden md:flex" : "flex"}`}
          >
            <div className="px-4 md:px-5 py-4 border-b border-white/10 flex-shrink-0 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg md:text-xl font-bold tracking-tight">
                  Chats
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Conversations, without the noise.
                </p>
              </div>
              <button
                onClick={() => setShowNewChat((v) => !v)}
                title="New conversation"
                className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="M12 5v14" />
                </svg>
              </button>
            </div>

            <div className="px-3 py-3 border-b border-white/5 flex-shrink-0">
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="search"
                  value={conversationSearch}
                  onChange={(e) => setConversationSearch(e.target.value)}
                  placeholder="Search chats or messages"
                  aria-label="Search chats or messages"
                  className="w-full bg-secondary/50 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex items-center gap-2 mt-3">
                {[
                  { id: "all", label: "All" },
                  { id: "unread", label: "Unread" },
                  { id: "online", label: "Online" },
                ].map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setConversationFilter(filter.id)}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${conversationFilter === filter.id ? "bg-primary text-primary-foreground" : "bg-secondary/70 text-muted-foreground hover:text-foreground"}`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {/* New Chat Search Panel */}
            {showNewChat && (
              <div className="border-b border-white/10 flex-shrink-0">
                <div className="px-3 py-2">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search people…"
                    value={newChatSearch}
                    onChange={(e) => setNewChatSearch(e.target.value)}
                    className="w-full bg-secondary/50 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto custom-scrollbar">
                  {allProfiles
                    .filter(
                      (p) =>
                        !newChatSearch ||
                        (p.username || "")
                          .toLowerCase()
                          .includes(newChatSearch.toLowerCase()),
                    )
                    .slice(0, 15)
                    .map((p) => (
                      <button
                        key={p.address}
                        onClick={() => startNewChat(p)}
                        className="flex items-center gap-3 px-4 py-2.5 w-full text-left hover:bg-white/5 transition-colors"
                      >
                        <Avatar profile={p} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">
                            {p.username || truncateAddress(p.address)}
                          </p>
                          {p.profession && (
                            <p className="text-[10px] text-muted-foreground truncate">
                              {p.profession}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  {allProfiles.filter(
                    (p) =>
                      !newChatSearch ||
                      (p.username || "")
                        .toLowerCase()
                        .includes(newChatSearch.toLowerCase()),
                  ).length === 0 && (
                    <p className="px-4 py-3 text-xs text-muted-foreground">
                      No users found.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {isLoadingConvos ? (
                <div className="flex flex-col gap-2 p-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-16 rounded-2xl bg-white/5 animate-pulse"
                    />
                  ))}
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-6 text-center flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-muted-foreground"
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    No conversations yet.
                    <br />
                    Tap <strong className="text-foreground">+</strong> to start
                    one.
                  </p>
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No chats match this search or filter.
                </div>
              ) : (
                filteredConversations.map((conv) => {
                  const p = profiles[conv.address];
                  const lastMsg = conv.messages[conv.messages.length - 1];
                  const unread = unreadCount(conv.address);
                  const hasUnread = unread > 0;
                  const isSelected = selectedUser?.address === conv.address;
                  return (
                    <button
                      key={conv.address}
                      onClick={() => handleSelectUser(conv)}
                      className={`flex items-center gap-3 px-4 py-3 w-full text-left transition-all border-b border-white/5 last:border-0
                      ${isSelected ? "bg-primary/15" : hasUnread ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-white/5"}`}
                    >
                      <div className="relative flex-shrink-0">
                        <Avatar profile={p} />
                        <PresenceDot
                          online={isOnline(presence[conv.address])}
                          size="sm"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-sm truncate ${hasUnread ? "font-bold text-foreground" : "font-semibold"}`}
                          >
                            {p?.username || truncateAddress(conv.address)}
                          </span>
                          {lastMsg && (
                            <span
                              className={`text-[10px] flex-shrink-0 ${hasUnread ? "text-primary font-medium" : "text-muted-foreground"}`}
                            >
                              {formatDistanceToNow(
                                new Date(lastMsg.createdAt),
                                { addSuffix: false },
                              )}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <p
                            className={`text-xs truncate ${typingByUser[conv.address] ? "text-primary font-semibold" : hasUnread ? "text-foreground/80 font-medium" : "text-muted-foreground"}`}
                          >
                            {typingByUser[conv.address] ? (
                              <span className="inline-flex items-center gap-1.5">
                                <TypingDots />
                                <span>typing…</span>
                              </span>
                            ) : lastMsg ? (
                              lastMsg.sender === wallet
                                ? `You: ${lastMsg.content}`
                                : lastMsg.content
                            ) : (
                              p?.bio || "Say hello!"
                            )}
                          </p>
                          {hasUnread && (
                            <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                              {unread > 9 ? "9+" : unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Chat Area */}
          <div
            className={`flex-1 glass-panel rounded-2xl md:rounded-3xl flex flex-col overflow-hidden ${!selectedUser ? "hidden md:flex" : "flex"}`}
          >
            {!selectedUser ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center gap-4">
                <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="opacity-50"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    Your messages
                  </p>
                  <p className="text-sm mt-1">
                    Select a conversation to start chatting
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Chat Header */}
                <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3 bg-background/40 backdrop-blur-md flex-shrink-0">
                  <button
                    className="md:hidden p-2 -ml-1 rounded-full hover:bg-white/10 transition-colors"
                    onClick={() => setSelectedUser(null)}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                  </button>
                  <div className="relative flex-shrink-0">
                    <Avatar profile={selectedProfile} />
                    <PresenceDot
                      online={isOnline(presence[selectedUser.address])}
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm md:text-base truncate">
                      {selectedProfile?.username ||
                        truncateAddress(selectedUser.address)}
                    </h3>
                    {(() => {
                      const lastSeenAt = presence[selectedUser.address];
                      const online = isOnline(lastSeenAt);
                      if (typingByUser[selectedUser.address]) {
                        return (
                          <p className="text-[11px] text-primary font-semibold flex items-center gap-1.5">
                            <TypingDots />
                            Typing
                          </p>
                        );
                      }
                      if (online) {
                        return (
                          <p className="text-[11px] text-green-400 font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                            Online
                          </p>
                        );
                      }
                      if (lastSeenAt) {
                        return (
                          <p className="text-[11px] text-muted-foreground">
                            Last seen{" "}
                            {formatDistanceToNow(new Date(lastSeenAt), {
                              addSuffix: true,
                            })}
                          </p>
                        );
                      }
                      return (
                        <p className="text-[10px] text-muted-foreground font-mono truncate">
                          {truncateAddress(selectedUser.address)}
                        </p>
                      );
                    })()}
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 flex flex-col custom-scrollbar">
                  {isLoadingChat ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : chatMessages.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 text-muted-foreground py-10">
                      <Avatar profile={selectedProfile} size="lg" />
                      <div>
                        <p className="font-semibold text-foreground text-sm">
                          {selectedProfile?.username ||
                            truncateAddress(selectedUser.address)}
                        </p>
                        <p className="text-xs mt-1">
                          No messages yet — say something!
                        </p>
                      </div>
                    </div>
                  ) : (
                    groupedWithSeparator.map((item, idx) => {
                      if (item.type === "date") {
                        return (
                          <DateSeparator key={item.key} date={item.date} />
                        );
                      }
                      if (item.type === "unread-separator") {
                        return <UnreadSeparator key={item.key} />;
                      }
                      const { msg } = item;
                      const isMe = msg.sender === wallet;
                      const isUnreadMsg =
                        !isMe && msg.receiver === wallet && !msg.readAt;
                      return (
                        <div
                          key={msg.id}
                          className={`flex items-end gap-2 mb-1 ${isMe ? "flex-row-reverse" : "flex-row"}`}
                        >
                          {!isMe && (
                            <div className="flex-shrink-0 mb-1">
                              <Avatar
                                profile={profiles[msg.sender]}
                                size="sm"
                              />
                            </div>
                          )}
                          <div
                            className={`flex flex-col max-w-[70%] ${isMe ? "items-end" : "items-start"}`}
                          >
                            <div
                              className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
                                isMe
                                  ? "bg-primary text-primary-foreground rounded-br-sm"
                                  : isUnreadMsg
                                    ? "bg-secondary/90 text-foreground rounded-bl-sm ring-1 ring-primary/30"
                                    : "bg-secondary text-secondary-foreground rounded-bl-sm"
                              }`}
                            >
                              {msg.attachmentUrl && (
                                msg.attachmentMime?.startsWith("image/") ? (
                                  <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" className="block mb-1">
                                    <img src={msg.attachmentUrl} alt={msg.attachmentName || "Shared image"} loading="lazy" className="max-w-full max-h-72 rounded-lg object-contain" />
                                  </a>
                                ) : (
                                  <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" download={msg.attachmentName || true} className="mb-1 flex items-center gap-3 rounded-xl border border-current/15 bg-black/5 p-3 min-w-0 hover:opacity-80">
                                    <span className="text-xl" aria-hidden="true">📎</span>
                                    <span className="min-w-0">
                                      <span className="block text-xs font-semibold break-all">{msg.attachmentName || "Attachment"}</span>
                                      <span className="block text-[10px] opacity-70">{msg.attachmentSize ? (msg.attachmentSize >= 1048576 ? `${(msg.attachmentSize / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(msg.attachmentSize / 1024))} KB`) : "File"}</span>
                                    </span>
                                  </a>
                                )
                              )}
                              {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
                            </div>
                            <span className="text-[10px] text-muted-foreground mt-0.5 px-1 flex items-center gap-1">
                              <span>
                                {msg.createdAt
                                  ? formatDistanceToNow(new Date(msg.createdAt), {
                                      addSuffix: true,
                                    })
                                  : "just now"}
                              </span>
                              {isMe && (
                                <span
                                  className={msg.readAt ? "text-sky-300 font-bold" : "text-primary-foreground/70"}
                                  aria-label={msg.readAt ? "Read" : "Sent"}
                                  title={msg.readAt ? "Read" : "Sent"}
                                >
                                  {msg.readAt ? "✓✓" : "✓"}
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {typingByUser[selectedUser.address] && (
                  <div
                    className="px-5 py-2 flex items-center gap-2 text-xs text-primary border-t border-white/5 bg-background/30"
                    aria-live="polite"
                  >
                    <TypingDots size="lg" />
                    <span>
                      {selectedProfile?.username ||
                        truncateAddress(selectedUser.address)}{" "}
                      is typing
                    </span>
                  </div>
                )}

                {/* Attachment picker and message composer */}
                {selectedAttachment && <div className="px-4 pt-3 border-t border-white/10 bg-background/40"><div className="flex items-center gap-3 rounded-xl border border-white/10 bg-secondary/40 p-2">
                  {attachmentPreviewUrl ? <img src={attachmentPreviewUrl} alt="Attachment preview" className="h-14 w-14 rounded-lg object-cover" /> : <span className="text-2xl px-3" aria-hidden="true">📎</span>}
                  <div className="min-w-0 flex-1"><p className="text-xs font-semibold truncate">{selectedAttachment.name}</p><p className="text-[10px] text-muted-foreground">{(selectedAttachment.size / 1048576).toFixed(2)} MB · Ready to send</p></div>
                  <button type="button" onClick={clearSelectedAttachment} disabled={isSendingMessage} aria-label="Remove attachment" className="p-2 rounded-full hover:bg-white/10 disabled:opacity-40">✕</button>
                </div></div>}
                {isSendingMessage && selectedAttachment && <div className="px-4 py-1 text-[11px] text-muted-foreground" role="status">Uploading attachment… {uploadProgress}%</div>}
                <form onSubmit={handleSend} className="px-3 md:px-4 py-3 border-t border-white/10 bg-background/40 flex gap-2 flex-shrink-0 items-center">
                  <input ref={attachmentInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={handleAttachmentSelect} className="hidden" aria-label="Choose an image or file" />
                  <button type="button" onClick={() => attachmentInputRef.current?.click()} disabled={isSendingMessage} aria-label="Attach image or file" title="Attach image or file" className="p-2.5 rounded-full hover:bg-white/10 disabled:opacity-40 text-lg">＋</button>
                  <input ref={inputRef} type="text" value={newMessage} onChange={handleMessageChange} placeholder="Message..." disabled={isSendingMessage} className="flex-1 min-w-0 bg-secondary/50 border border-white/10 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all" />
                  <button type="submit" disabled={(!newMessage.trim() && !selectedAttachment) || isSendingMessage} className="bg-primary text-primary-foreground p-2.5 rounded-full hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center aspect-square">
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
