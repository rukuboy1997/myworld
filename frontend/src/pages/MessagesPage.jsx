import React, { useState, useEffect, useRef, useCallback } from 'react';
import { formatDistanceToNow, isToday, isYesterday, format } from 'date-fns';
import { ref, onValue } from 'firebase/database';
import Layout from '../components/Layout.jsx';
import { getMessages, sendMessage, getAllProfiles, truncateAddress } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { firebaseDb, convId as fbConvId } from '../lib/firebase.js';

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

function isOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
}

function PresenceDot({ online, size = 'md' }) {
  const sz = size === 'sm' ? 'w-2.5 h-2.5 border-[1.5px]' : 'w-3 h-3 border-2';
  return (
    <span className={`absolute bottom-0 right-0 ${sz} rounded-full border-background ${online ? 'bg-green-500' : 'bg-zinc-500'}`} />
  );
}

function Avatar({ profile, size = 'md' }) {
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-12 h-12 text-base' : 'w-10 h-10 text-sm';
  if (profile?.avatarUrl) {
    return <img src={profile.avatarUrl} alt={profile.username || '?'} className={`${sz} rounded-full object-cover flex-shrink-0`} />;
  }
  const initial = profile?.username ? profile.username.charAt(0).toUpperCase() : '?';
  return (
    <div className={`${sz} rounded-full bg-gradient-brand flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {initial}
    </div>
  );
}

function DateSeparator({ date }) {
  const label = isToday(date) ? 'Today' : isYesterday(date) ? 'Yesterday' : format(date, 'MMMM d, yyyy');
  return (
    <div className="flex items-center gap-3 my-2">
      <div className="flex-1 h-px bg-white/10" />
      <span className="text-[10px] text-muted-foreground font-medium px-2">{label}</span>
      <div className="flex-1 h-px bg-white/10" />
    </div>
  );
}

function UnreadSeparator() {
  return (
    <div className="flex items-center gap-3 my-3">
      <div className="flex-1 h-px bg-primary/40" />
      <span className="text-[10px] text-primary font-semibold px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">Unread messages</span>
      <div className="flex-1 h-px bg-primary/40" />
    </div>
  );
}

function groupMessages(messages) {
  const groups = [];
  let lastDate = null;
  messages.forEach((msg, i) => {
    const msgDate = msg.createdAt ? new Date(msg.createdAt) : new Date();
    const dateStr = format(msgDate, 'yyyy-MM-dd');
    if (dateStr !== lastDate) {
      groups.push({ type: 'date', date: msgDate, key: `date-${dateStr}` });
      lastDate = dateStr;
    }
    const prev = messages[i - 1];
    const isContinuation = prev && prev.sender === msg.sender;
    groups.push({ type: 'message', msg, isContinuation });
  });
  return groups;
}

// Per-conversation read tracking
function getConvLastRead(wallet, otherAddress) {
  return localStorage.getItem(`msgs_read_${wallet}_${otherAddress}`) || new Date(0).toISOString();
}

function setConvLastRead(wallet, otherAddress) {
  const now = new Date().toISOString();
  localStorage.setItem(`msgs_read_${wallet}_${otherAddress}`, now);
  localStorage.setItem(`msgs_seen_${wallet}`, now);
}

export default function MessagesPage() {
  const { address: wallet, isAuthenticated, openAuthModal } = useAuth();
  const [allMessages, setAllMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [allProfiles, setAllProfiles] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoadingConvos, setIsLoadingConvos] = useState(true);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState('');
  const [readConvs, setReadConvs] = useState({});
  const [presence, setPresence] = useState({});
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const markReadTimerRef = useRef(null);

  const loadConversations = useCallback(async () => {
    if (!wallet) return;
    try {
      const [profilesData, msgs] = await Promise.all([getAllProfiles(), getMessages(wallet)]);
      const profileMap = {};
      profilesData.forEach(p => { profileMap[p.address] = p; });
      setProfiles(profileMap);
      setAllProfiles(profilesData.filter(p => p.address !== wallet));
      setAllMessages(msgs || []);

      const convMap = {};
      (msgs || []).forEach(msg => {
        const other = msg.sender === wallet ? msg.receiver : msg.sender;
        if (!convMap[other]) convMap[other] = { address: other, messages: [] };
        convMap[other].messages.push(msg);
      });

      const sorted = Object.values(convMap).sort((a, b) => {
        const aLast = a.messages[a.messages.length - 1]?.createdAt || '0';
        const bLast = b.messages[b.messages.length - 1]?.createdAt || '0';
        return bLast.localeCompare(aLast);
      });

      setConversations(sorted);
    } catch (err) {
      console.error('Failed to load conversations', err);
    } finally {
      setIsLoadingConvos(false);
    }
  }, [wallet]);

  const startNewChat = (profile) => {
    setSelectedUser(profile);
    setShowNewChat(false);
    setNewChatSearch('');
  };

  useEffect(() => {
    if (isAuthenticated) loadConversations();
  }, [isAuthenticated, loadConversations]);

  // ─── Firebase real-time presence for all conversation partners ───────────
  useEffect(() => {
    if (!conversations.length) return;
    const addrs = conversations.map(c => c.address).filter(Boolean);
    const unsubs = addrs.map(addr => {
      const presRef = ref(firebaseDb, `presence/${addr}`);
      return onValue(presRef, (snapshot) => {
        const data = snapshot.val();
        setPresence(prev => ({ ...prev, [addr]: data?.lastSeenAt || null }));
      });
    });
    return () => unsubs.forEach(u => u());
  }, [conversations]);

  // ─── Firebase presence for the currently open conversation ───────────────
  // Handles users not yet in the conversations list (e.g. new chats)
  useEffect(() => {
    if (!selectedUser?.address) return;
    const presRef = ref(firebaseDb, `presence/${selectedUser.address}`);
    const unsub = onValue(presRef, (snapshot) => {
      const data = snapshot.val();
      setPresence(prev => ({ ...prev, [selectedUser.address]: data?.lastSeenAt || null }));
    });
    return () => unsub();
  }, [selectedUser?.address]);

  // ─── Firebase real-time message listener ─────────────────────────────────
  useEffect(() => {
    if (!selectedUser || !wallet) return;

    setIsLoadingChat(true);
    inputRef.current?.focus();

    const cId = fbConvId(wallet, selectedUser.address);
    const msgsRef = ref(firebaseDb, `conversations/${cId}/messages`);

    const unsubscribe = onValue(msgsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const msgs = Object.entries(data)
          .map(([id, msg]) => ({ ...msg, id }))
          .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
        setChatMessages(msgs);
      } else {
        setChatMessages([]);
      }
      setIsLoadingChat(false);
      // Keep sidebar in sync when new messages arrive
      loadConversations();
    }, (err) => {
      console.error('[firebase] onValue error:', err);
      setIsLoadingChat(false);
    });

    // Mark as read after a short delay so the unread separator shows briefly
    clearTimeout(markReadTimerRef.current);
    markReadTimerRef.current = setTimeout(() => {
      setConvLastRead(wallet, selectedUser.address);
      setReadConvs(prev => ({ ...prev, [selectedUser.address]: true }));
    }, 1500);

    return () => {
      unsubscribe();
      clearTimeout(markReadTimerRef.current);
    };
  }, [selectedUser?.address, wallet]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSend = async (e) => {
    e.preventDefault();
    const text = newMessage.trim();
    if (!text || !selectedUser) return;
    if (!isAuthenticated) { openAuthModal('signin'); return; }

    setNewMessage('');

    try {
      await sendMessage({ sender: wallet, receiver: selectedUser.address, content: text });
      // Firebase onValue will deliver the message automatically — no manual setChatMessages needed
      loadConversations();
    } catch (err) {
      console.error('Failed to send message', err);
      setNewMessage(text); // restore on failure
    }
  };

  const handleSelectUser = (conv) => {
    const profile = profiles[conv.address] || { address: conv.address };
    setSelectedUser(profile);
  };

  // Count unread messages in a conversation using per-conversation timestamp
  const unreadCount = useCallback((convAddress) => {
    if (readConvs[convAddress]) return 0;
    const lastRead = getConvLastRead(wallet, convAddress);
    return allMessages.filter(
      m => m.sender === convAddress && m.receiver === wallet && (m.createdAt || '') > lastRead
    ).length;
  }, [allMessages, wallet, readConvs]);

  // Find the index of the first unread message in the chat view
  const firstUnreadIndex = useCallback(() => {
    if (!selectedUser || readConvs[selectedUser.address]) return -1;
    const lastRead = getConvLastRead(wallet, selectedUser.address);
    return chatMessages.findIndex(
      m => m.sender === selectedUser.address && m.receiver === wallet && (m.createdAt || '') > lastRead
    );
  }, [chatMessages, selectedUser, wallet, readConvs]);

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="max-w-md mx-auto w-full px-4 py-20 text-center flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <h2 className="text-xl md:text-2xl font-bold">Sign in to read messages</h2>
          <p className="text-muted-foreground text-sm">Messages are private to your account.</p>
          <div className="flex gap-3">
            <button onClick={() => openAuthModal('signin')} className="bg-primary text-primary-foreground px-6 py-3 rounded-full font-bold hover:bg-primary/90 text-sm">Sign in</button>
            <button onClick={() => openAuthModal('signup')} className="bg-secondary border border-white/10 px-6 py-3 rounded-full font-bold hover:bg-secondary/80 text-sm">Sign up</button>
          </div>
        </div>
      </Layout>
    );
  }

  const selectedProfile = selectedUser ? (profiles[selectedUser.address] || selectedUser) : null;
  const grouped = groupMessages(chatMessages);
  const unreadIdx = firstUnreadIndex();

  // Inject unread separator into grouped items
  const groupedWithSeparator = [];
  let separatorInserted = false;
  grouped.forEach((item) => {
    if (
      !separatorInserted &&
      unreadIdx !== -1 &&
      item.type === 'message' &&
      item.msg === chatMessages[unreadIdx]
    ) {
      groupedWithSeparator.push({ type: 'unread-separator', key: 'unread-sep' });
      separatorInserted = true;
    }
    groupedWithSeparator.push(item);
  });

  return (
    <Layout>
      <div className="max-w-6xl mx-auto w-full px-2 md:px-4 py-4 md:py-8" style={{ height: 'calc(100dvh - 4rem - env(safe-area-inset-bottom, 0px))' }}>
        <div className="flex h-full gap-3 md:gap-6">

          {/* Sidebar */}
          <div className={`w-full md:w-80 glass-panel rounded-2xl md:rounded-3xl flex flex-col overflow-hidden flex-shrink-0 ${selectedUser ? 'hidden md:flex' : 'flex'}`}>
            <div className="px-4 md:px-5 py-4 border-b border-white/10 flex-shrink-0 flex items-center justify-between gap-3">
              <h2 className="text-lg md:text-xl font-bold tracking-tight">Messages</h2>
              <button onClick={() => setShowNewChat(v => !v)}
                title="New conversation"
                className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
              </button>
            </div>

            {/* New Chat Search Panel */}
            {showNewChat && (
              <div className="border-b border-white/10 flex-shrink-0">
                <div className="px-3 py-2">
                  <input autoFocus type="text" placeholder="Search people…" value={newChatSearch}
                    onChange={e => setNewChatSearch(e.target.value)}
                    className="w-full bg-secondary/50 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="max-h-48 overflow-y-auto custom-scrollbar">
                  {allProfiles
                    .filter(p => !newChatSearch || (p.username || '').toLowerCase().includes(newChatSearch.toLowerCase()))
                    .slice(0, 15)
                    .map(p => (
                      <button key={p.address} onClick={() => startNewChat(p)}
                        className="flex items-center gap-3 px-4 py-2.5 w-full text-left hover:bg-white/5 transition-colors">
                        <Avatar profile={p} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{p.username || truncateAddress(p.address)}</p>
                          {p.profession && <p className="text-[10px] text-muted-foreground truncate">{p.profession}</p>}
                        </div>
                      </button>
                    ))}
                  {allProfiles.filter(p => !newChatSearch || (p.username || '').toLowerCase().includes(newChatSearch.toLowerCase())).length === 0 && (
                    <p className="px-4 py-3 text-xs text-muted-foreground">No users found.</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {isLoadingConvos ? (
                <div className="flex flex-col gap-2 p-3">
                  {[1,2,3].map(i => <div key={i} className="h-16 rounded-2xl bg-white/5 animate-pulse" />)}
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-6 text-center flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  </div>
                  <p className="text-sm text-muted-foreground">No conversations yet.<br/>Tap <strong className="text-foreground">+</strong> to start one.</p>
                </div>
              ) : conversations.map(conv => {
                const p = profiles[conv.address];
                const lastMsg = conv.messages[conv.messages.length - 1];
                const unread = unreadCount(conv.address);
                const hasUnread = unread > 0;
                const isSelected = selectedUser?.address === conv.address;
                return (
                  <button key={conv.address} onClick={() => handleSelectUser(conv)}
                    className={`flex items-center gap-3 px-4 py-3 w-full text-left transition-all border-b border-white/5 last:border-0
                      ${isSelected ? 'bg-primary/15' : hasUnread ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-white/5'}`}>
                    <div className="relative flex-shrink-0">
                      <Avatar profile={p} />
                      <PresenceDot online={isOnline(presence[conv.address])} size="sm" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm truncate ${hasUnread ? 'font-bold text-foreground' : 'font-semibold'}`}>
                          {p?.username || truncateAddress(conv.address)}
                        </span>
                        {lastMsg && (
                          <span className={`text-[10px] flex-shrink-0 ${hasUnread ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                            {formatDistanceToNow(new Date(lastMsg.createdAt), { addSuffix: false })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className={`text-xs truncate ${hasUnread ? 'text-foreground/80 font-medium' : 'text-muted-foreground'}`}>
                          {lastMsg ? (lastMsg.sender === wallet ? `You: ${lastMsg.content}` : lastMsg.content) : p?.bio || 'Say hello!'}
                        </p>
                        {hasUnread && (
                          <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                            {unread > 9 ? '9+' : unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chat Area */}
          <div className={`flex-1 glass-panel rounded-2xl md:rounded-3xl flex flex-col overflow-hidden ${!selectedUser ? 'hidden md:flex' : 'flex'}`}>
            {!selectedUser ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center gap-4">
                <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <div>
                  <p className="text-lg font-semibold text-foreground">Your messages</p>
                  <p className="text-sm mt-1">Select a conversation to start chatting</p>
                </div>
              </div>
            ) : (
              <>
                {/* Chat Header */}
                <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3 bg-background/40 backdrop-blur-md flex-shrink-0">
                  <button className="md:hidden p-2 -ml-1 rounded-full hover:bg-white/10 transition-colors" onClick={() => setSelectedUser(null)}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                  </button>
                  <div className="relative flex-shrink-0">
                    <Avatar profile={selectedProfile} />
                    <PresenceDot online={isOnline(presence[selectedUser.address])} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm md:text-base truncate">{selectedProfile?.username || truncateAddress(selectedUser.address)}</h3>
                    {(() => {
                      const lastSeenAt = presence[selectedUser.address];
                      const online = isOnline(lastSeenAt);
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
                            Last seen {formatDistanceToNow(new Date(lastSeenAt), { addSuffix: true })}
                          </p>
                        );
                      }
                      return (
                        <p className="text-[10px] text-muted-foreground font-mono truncate">{truncateAddress(selectedUser.address)}</p>
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
                        <p className="font-semibold text-foreground text-sm">{selectedProfile?.username || truncateAddress(selectedUser.address)}</p>
                        <p className="text-xs mt-1">No messages yet — say something!</p>
                      </div>
                    </div>
                  ) : (
                    groupedWithSeparator.map((item, idx) => {
                      if (item.type === 'date') {
                        return <DateSeparator key={item.key} date={item.date} />;
                      }
                      if (item.type === 'unread-separator') {
                        return <UnreadSeparator key={item.key} />;
                      }
                      const { msg } = item;
                      const isMe = msg.sender === wallet;
                      const lastRead = getConvLastRead(wallet, selectedUser.address);
                      const isUnreadMsg = !isMe && !readConvs[selectedUser.address] && (msg.createdAt || '') > lastRead;
                      return (
                        <div key={msg.id} className={`flex items-end gap-2 mb-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                          {!isMe && (
                            <div className="flex-shrink-0 mb-1">
                              <Avatar profile={profiles[msg.sender]} size="sm" />
                            </div>
                          )}
                          <div className={`flex flex-col max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
                            <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
                              isMe
                                ? 'bg-primary text-primary-foreground rounded-br-sm'
                                : isUnreadMsg
                                  ? 'bg-secondary/90 text-foreground rounded-bl-sm ring-1 ring-primary/30'
                                  : 'bg-secondary text-secondary-foreground rounded-bl-sm'
                            }`}>
                              {msg.content}
                            </div>
                            <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
                              {msg.createdAt ? formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true }) : 'just now'}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <form onSubmit={handleSend} className="px-3 md:px-4 py-3 border-t border-white/10 bg-background/40 flex gap-2 flex-shrink-0">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Message..."
                    className="flex-1 bg-secondary/50 border border-white/10 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                  />
                  <button type="submit" disabled={!newMessage.trim()}
                    className="bg-primary text-primary-foreground p-2.5 rounded-full hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center aspect-square">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
