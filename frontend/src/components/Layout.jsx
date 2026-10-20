import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  truncateAddress,
  getMessages,
  getUnreadNotificationCount,
  resendVerification,
  sendHeartbeat,
} from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import AuthModal from "./AuthModal.jsx";
import InviteModal from "./InviteModal.jsx";
import { updatePresence } from "../lib/firebase.js";
import ThemeToggle from "./ThemeToggle.jsx";

export default function Layout({ children, immersive = false }) {
  const { user, address, isAuthenticated, isLoading, signOut, openAuthModal } =
    useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadMsgs, setUnreadMsgs] = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [verifyBanner, setVerifyBanner] = useState(false);
  const [resendsent, setResendSent] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const location = useLocation();

  const isOnMessages = location.pathname === "/messages" || location.pathname === "/";
  const isOnNotifications = location.pathname === "/notifications";

  // Unread messages badge
  useEffect(() => {
    if (!isAuthenticated || !address) {
      setUnreadMsgs(0);
      return;
    }
    if (isOnMessages) {
      setUnreadMsgs(0);
      localStorage.setItem(`msgs_seen_${address}`, new Date().toISOString());
      return;
    }
    const checkUnread = async () => {
      try {
        const lastSeen =
          localStorage.getItem(`msgs_seen_${address}`) ||
          new Date(0).toISOString();
        const msgs = await getMessages(address);
        const count = (msgs || []).filter(
          (m) => m.receiver === address && (m.createdAt || "") > lastSeen,
        ).length;
        setUnreadMsgs(count);
      } catch {}
    };
    checkUnread();
    const iv = setInterval(checkUnread, 60000);
    return () => clearInterval(iv);
  }, [isAuthenticated, address, isOnMessages]);

  // Unread notifications badge
  useEffect(() => {
    if (!isAuthenticated || !address) {
      setUnreadNotifs(0);
      return;
    }
    if (isOnNotifications) {
      setUnreadNotifs(0);
      return;
    }
    const check = async () => {
      try {
        const { count } = await getUnreadNotificationCount();
        setUnreadNotifs(count);
      } catch {}
    };
    check();
    const iv = setInterval(check, 60000);
    return () => clearInterval(iv);
  }, [isAuthenticated, address, isOnNotifications]);

  // Presence heartbeat — fires every 30s while app is open
  // Writes to Firebase (real-time) + Postgres (mobile compat)
  useEffect(() => {
    if (!isAuthenticated || !address) return;
    const beat = () => {
      updatePresence(address); // Firebase real-time presence
      sendHeartbeat().catch(() => {}); // Postgres fallback for mobile
    };
    beat();
    const iv = setInterval(beat, 30000);
    return () => clearInterval(iv);
  }, [isAuthenticated, address]);

  // Email verification banner
  useEffect(() => {
    if (isAuthenticated && user?.email && user?.emailVerified === false) {
      setVerifyBanner(true);
    } else {
      setVerifyBanner(false);
    }
  }, [isAuthenticated, user]);

  const handleResendVerify = async () => {
    try {
      await resendVerification();
      setResendSent(true);
    } catch {}
  };

  const isActive = (path) =>
    location.pathname === path || (path === "/messages" && location.pathname === "/");

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">
      {!immersive && (
        <>
      {/* Email verification banner */}
      {verifyBanner && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between gap-3 text-xs md:text-sm">
          <span className="text-amber-300">
            <strong>Verify your email</strong> — check your inbox for a
            confirmation link to secure your account.
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {resendsent ? (
              <span className="text-green-400 text-xs">Sent!</span>
            ) : (
              <button
                onClick={handleResendVerify}
                className="text-amber-300 underline text-xs hover:text-amber-200"
              >
                Resend
              </button>
            )}
            <button
              onClick={() => setVerifyBanner(false)}
              className="text-amber-400 hover:text-amber-200 p-1"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="sticky top-0 z-50 glass-panel border-b border-border px-4 h-14 md:h-16 flex items-center justify-between">
        <Link to="/messages" className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="myWorld"
            className="w-7 h-7 md:w-8 md:h-8 rounded-full"
          />
          <span className="font-bold text-lg md:text-xl tracking-tight">
            myWorld
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-3">
          {[
            { path: "/messages", label: "Messages", badge: unreadMsgs },
            { path: "/reels", label: "Reels" },
            { path: "/feed", label: "Updates" },
            {
              path: "/notifications",
              label: "Notifications",
              badge: unreadNotifs,
            },
          ].map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`relative rounded-full px-3 py-2 text-sm font-semibold transition-colors hover:bg-secondary hover:text-foreground ${isActive(link.path) ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
            >
              {link.label}
              {link.badge > 0 && (
                <span className="absolute -top-1.5 -right-3 min-w-[16px] h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center px-1">
                  {link.badge > 9 ? "9+" : link.badge}
                </span>
              )}
            </Link>
          ))}
          {isAuthenticated ? (
            <Link
              to={`/profile/${address}`}
              className={`rounded-full px-3 py-2 text-sm font-semibold transition-colors hover:bg-secondary hover:text-foreground ${location.pathname.startsWith("/profile") ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
            >
              Profile
            </Link>
          ) : (
            <button
              onClick={() => openAuthModal("signin")}
              className="rounded-full px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              Profile
            </button>
          )}
        </nav>

        <div className="flex items-center gap-2 md:gap-3">
          <ThemeToggle />
          {/* Invite Friends (desktop) */}
          <button
            onClick={() => setShowInvite(true)}
            title="Invite Friends"
            className="hidden md:flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-full hover:bg-white/10"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" x2="19" y1="8" y2="14" />
              <line x1="22" x2="16" y1="11" y2="11" />
            </svg>
            Invite
          </button>

          {isAuthenticated && (
            <Link
              to="/create"
              className="hidden md:flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-full font-medium hover:bg-primary/90 transition-colors text-sm"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="M12 5v14" />
              </svg>
              Post
            </Link>
          )}

          {isLoading ? (
            <div className="w-8 h-8 rounded-full bg-secondary animate-pulse" />
          ) : isAuthenticated ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 bg-secondary text-secondary-foreground px-3 py-1.5 rounded-full text-sm font-medium hover:bg-secondary/80 transition-colors border border-border"
              >
                <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                <span className="max-w-[80px] truncate">@{user?.username}</span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-60 glass-panel border border-white/10 rounded-2xl shadow-2xl p-4 flex flex-col gap-3 animate-fade-in origin-top-right z-50">
                  <div className="text-xs text-muted-foreground">
                    <div className="font-bold text-foreground text-sm">
                      @{user?.username}
                    </div>
                    {user?.email && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="truncate">{user.email}</span>
                        {user.emailVerified ? (
                          <span className="text-green-400 text-[9px] font-bold bg-green-500/10 px-1.5 py-0.5 rounded-full">
                            VERIFIED
                          </span>
                        ) : (
                          <span className="text-amber-400 text-[9px] font-bold bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                            UNVERIFIED
                          </span>
                        )}
                      </div>
                    )}
                    <div className="font-mono break-all opacity-70 mt-1 text-[10px]">
                      {truncateAddress(address)}
                    </div>
                  </div>
                  <Link
                    to={`/profile/${address}`}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    View Profile
                  </Link>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setShowInvite(true);
                    }}
                    className="flex items-center gap-2 text-sm hover:text-primary transition-colors text-left"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <line x1="19" x2="19" y1="8" y2="14" />
                      <line x1="22" x2="16" y1="11" y2="11" />
                    </svg>
                    Invite Friends
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      signOut();
                    }}
                    className="w-full bg-secondary border border-white/10 rounded-lg py-2 text-sm font-bold hover:bg-secondary/80"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => openAuthModal("signin")}
                className="text-sm font-medium px-3 py-1.5 rounded-full hover:bg-white/10 transition-colors"
              >
                Sign in
              </button>
              <button
                onClick={() => openAuthModal("signup")}
                className="bg-primary text-primary-foreground px-3 py-1.5 rounded-full text-sm font-bold hover:bg-primary/90 transition-colors"
              >
                Sign up
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Messaging-first mobile navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-panel border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="flex h-16 items-center justify-around px-1">
          <Link
            to="/messages"
            aria-label="Messages"
            className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1 text-[10px] font-semibold transition-colors ${isActive("/messages") ? "text-primary" : "text-muted-foreground"}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>Messages</span>
            {unreadMsgs > 0 && (
              <span className="absolute top-0 right-[calc(50%-19px)] min-w-[16px] h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center px-1 pointer-events-none">
                {unreadMsgs > 9 ? "9+" : unreadMsgs}
              </span>
            )}
          </Link>

          <Link
            to="/reels"
            aria-label="Reels"
            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1 text-[10px] font-semibold transition-colors ${isActive("/reels") ? "text-primary" : "text-muted-foreground"}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <path d="m9 3 6 6M15 3l6 6M3 9l6 6M9 21l6-6M15 21l6-6" />
              <path d="m10 8 6 4-6 4z" fill="currentColor" stroke="none" />
            </svg>
            <span>Reels</span>
          </Link>

          <Link
            to="/feed"
            aria-label="Updates"
            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1 text-[10px] font-semibold transition-colors ${isActive("/feed") ? "text-primary" : "text-muted-foreground"}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="17" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18M7 14h4M7 17h7" />
            </svg>
            <span>Updates</span>
          </Link>

          <Link
            to="/notifications"
            aria-label="Notifications"
            className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1 text-[10px] font-semibold transition-colors ${isActive("/notifications") ? "text-primary" : "text-muted-foreground"}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            <span>Notifications</span>
            {unreadNotifs > 0 && (
              <span className="absolute top-0 right-[calc(50%-19px)] min-w-[16px] h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center px-1 pointer-events-none">
                {unreadNotifs > 9 ? "9+" : unreadNotifs}
              </span>
            )}
          </Link>

          {isAuthenticated ? (
            <Link
              to={`/profile/${address}`}
              aria-label="Profile"
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1 text-[10px] font-semibold transition-colors ${location.pathname.startsWith("/profile") ? "text-primary" : "text-muted-foreground"}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>Profile</span>
            </Link>
          ) : (
            <button
              onClick={() => openAuthModal("signin")}
              aria-label="Profile"
              className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1 text-[10px] font-semibold text-muted-foreground"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>Profile</span>
            </button>
          )}
        </div>
      </nav>

        </>
      )}

      <main className={immersive ? "flex-1 min-h-0 flex flex-col relative pb-0" : "flex-1 flex flex-col relative pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0"}>
        {children}
      </main>

      <AuthModal />
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
    </div>
  );
}
