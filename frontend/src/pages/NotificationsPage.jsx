import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  format,
  formatDistanceToNow,
  isToday,
  isThisWeek,
  isYesterday,
} from "date-fns";
import Layout from "../components/Layout.jsx";
import {
  getNotifications,
  markNotificationRead,
  markNotificationsRead,
  truncateAddress,
} from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import EmailPreferencesPanel from "../components/EmailPreferencesPanel.jsx";

function NotificationIcon({ type }) {
  const styles = {
    like: "bg-red-500/15 text-red-400",
    comment: "bg-blue-500/15 text-blue-400",
    follow: "bg-emerald-500/15 text-emerald-400",
    message: "bg-primary/15 text-primary",
  };
  const iconClass = `w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${styles[type] || "bg-secondary text-muted-foreground"}`;

  return (
    <div className={iconClass} aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {type === "like" ? (
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
        ) : type === "comment" ? (
          <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
        ) : type === "follow" ? (
          <>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M19 8v6m3-3h-6" />
          </>
        ) : type === "message" ? (
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        ) : (
          <>
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M10 21h4" />
          </>
        )}
      </svg>
    </div>
  );
}

function actorName(notification) {
  return notification.actorProfile?.username || truncateAddress(notification.actorAddress) || "Someone";
}

function notificationText(item) {
  const first = item.notifications[0];
  const actors = item.actors;
  if (first.type === "like") {
    if (actors.length === 1) return <><strong>@{actors[0].name}</strong> liked your post</>;
    if (actors.length === 2) return <><strong>@{actors[0].name}</strong> and <strong>@{actors[1].name}</strong> liked your post</>;
    return <><strong>@{actors[0].name}</strong>, <strong>@{actors[1].name}</strong> and <strong>{actors.length - 2} others</strong> liked your post</>;
  }
  const actor = actors[0]?.name || "Someone";
  if (first.type === "comment") {
    return <><strong>@{actor}</strong> commented: <span className="text-muted-foreground">"{first.excerpt || "View the conversation"}"</span></>;
  }
  if (first.type === "follow") return <><strong>@{actor}</strong> started following you</>;
  if (first.type === "message") {
    return <><strong>@{actor}</strong> sent you a message: <span className="text-muted-foreground">"{first.excerpt || "Open your inbox to view it"}"</span></>;
  }
  return <><strong>@{actor}</strong> {first.excerpt || "sent you a notification"}</>;
}

function getNotificationDate(notification) {
  const date = notification.createdAt ? new Date(notification.createdAt) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function getDateSection(date) {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  if (isThisWeek(date, { weekStartsOn: 1 })) return "This week";
  return format(date, "MMMM yyyy");
}

function groupNotifications(notifications) {
  const groups = new Map();

  for (const notification of notifications) {
    const date = getNotificationDate(notification);
    const canGroup = notification.type === "like" && notification.postId;
    const key = canGroup
      ? `like:${notification.postId}:${format(date, "yyyy-MM-dd")}`
      : `single:${notification.id}`;

    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        type: notification.type,
        postId: notification.postId,
        notifications: [],
        actors: [],
        date,
      });
    }

    const group = groups.get(key);
    group.notifications.push(notification);
    group.date = group.date > date ? group.date : date;
    if (!group.actors.some((actor) => actor.address === notification.actorAddress)) {
      group.actors.push({
        address: notification.actorAddress,
        name: actorName(notification),
        avatarUrl: notification.actorProfile?.avatarUrl || null,
      });
    }
  }

  return [...groups.values()].sort((a, b) => b.date - a.date);
}

function notificationHref(notification) {
  if (notification.type === "message") {
    return notification.actorAddress
      ? `/messages?with=${encodeURIComponent(notification.actorAddress)}`
      : "/messages";
  }
  if (notification.postId) return `/post/${encodeURIComponent(notification.postId)}`;
  if (notification.type === "follow" && notification.actorAddress) {
    return `/profile/${encodeURIComponent(notification.actorAddress)}`;
  }
  return "/notifications";
}

function ActorAvatars({ actors }) {
  return (
    <div className="flex items-center flex-shrink-0 -space-x-2" aria-hidden="true">
      {actors.slice(0, 3).map((actor, index) => (
        actor.avatarUrl ? (
          <img key={actor.address || index} src={actor.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-background" />
        ) : (
          <div key={actor.address || index} className="w-9 h-9 rounded-full bg-gradient-brand ring-2 ring-background flex items-center justify-center text-white font-bold text-xs">
            {(actor.name || "?").charAt(0).toUpperCase()}
          </div>
        )
      ))}
      {actors.length > 3 && (
        <span className="w-9 h-9 rounded-full bg-secondary ring-2 ring-background flex items-center justify-center text-[10px] font-bold text-muted-foreground">
          +{actors.length - 3}
        </span>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  const { isAuthenticated, openAuthModal } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [readError, setReadError] = useState("");
  const [filter, setFilter] = useState("all");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    if (!isAuthenticated) {
      setIsLoading(false);
      return () => { active = false; };
    }

    setIsLoading(true);
    setLoadError("");
    getNotifications()
      .then((data) => {
        if (active) setNotifications(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        console.error("Failed to load notifications", error);
        if (active) setLoadError("We couldn't load your notifications. Please try again.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => { active = false; };
  }, [isAuthenticated, refreshKey]);

  const unreadCount = notifications.filter((notification) => !notification.readAt).length;
  const visibleNotifications = useMemo(
    () => groupNotifications(
      filter === "unread"
        ? notifications.filter((notification) => !notification.readAt)
        : notifications,
    ),
    [notifications, filter],
  );
  const sections = useMemo(() => {
    const result = [];
    for (const item of visibleNotifications) {
      const title = getDateSection(item.date);
      const previous = result[result.length - 1];
      if (!previous || previous.title !== title) result.push({ title, items: [item] });
      else previous.items.push(item);
    }
    return result;
  }, [visibleNotifications]);

  const handleMarkRead = async (ids) => {
    const idSet = new Set(ids);
    const previous = notifications;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) =>
      idSet.has(item.id) && !item.readAt ? { ...item, readAt } : item,
    ));
    setReadError("");
    try {
      await Promise.all(ids.map((id) => markNotificationRead(id)));
    } catch (error) {
      setNotifications(previous);
      setReadError(error.message || "Couldn't update the read status. Please try again.");
    }
  };

  const handleMarkAllRead = async () => {
    const previous = notifications;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) =>
      item.readAt ? item : { ...item, readAt },
    ));
    setReadError("");
    try {
      await markNotificationsRead();
    } catch (error) {
      setNotifications(previous);
      setReadError(error.message || "Couldn't mark notifications as read. Please try again.");
    }
  };

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="max-w-md mx-auto w-full px-4 py-20 text-center flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">
            <NotificationIcon type="notification" />
          </div>
          <h2 className="text-xl font-bold">Sign in to see notifications</h2>
          <button onClick={() => openAuthModal("signin")} className="bg-primary text-primary-foreground px-6 py-3 rounded-full font-bold hover:bg-primary/90 text-sm">
            Sign in
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full px-4 py-6 md:py-8">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary mb-1">Your world, in the loop</p>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Notifications</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {unreadCount ? `${unreadCount} unread update${unreadCount === 1 ? "" : "s"}` : "You're all caught up"}
            </p>
          </div>
          {unreadCount > 0 && (
            <button type="button" onClick={handleMarkAllRead} className="text-xs sm:text-sm font-semibold text-primary hover:text-primary/80 whitespace-nowrap pt-2">
              Mark all as read
            </button>
          )}
        </div>

        <EmailPreferencesPanel />

        <div className="flex items-center gap-2 border-b border-border mb-4" aria-label="Notification filters">
          <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")} className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${filter === "all" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            All <span className="ml-1 text-xs text-muted-foreground">{notifications.length}</span>
          </button>
          <button type="button" aria-pressed={filter === "unread"} onClick={() => setFilter("unread")} className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${filter === "unread" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            Unread <span className="ml-1 text-xs text-muted-foreground">{unreadCount}</span>
          </button>
        </div>

        {readError && <p role="alert" className="text-sm text-red-400 mb-3">{readError}</p>}

        {isLoading ? (
          <div className="flex flex-col gap-3" aria-label="Loading notifications">
            {[1, 2, 3].map((item) => <div key={item} className="glass-panel rounded-2xl h-[76px] animate-pulse" />)}
          </div>
        ) : loadError ? (
          <div className="glass-panel rounded-3xl p-8 text-center">
            <p className="font-semibold">{loadError}</p>
            <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="mt-4 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">
              Try again
            </button>
          </div>
        ) : visibleNotifications.length === 0 ? (
          <div className="glass-panel rounded-3xl p-10 md:p-12 text-center flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
              <NotificationIcon type="notification" />
            </div>
            <div>
              <p className="font-semibold">{filter === "unread" ? "You're all caught up" : "No notifications yet"}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {filter === "unread" ? "New activity that needs your attention will appear here." : "When people interact with you on myWorld, you'll see it here."}
              </p>
            </div>
            {filter === "unread" && notifications.length > 0 && (
              <button type="button" onClick={() => setFilter("all")} className="text-sm font-semibold text-primary">View all notifications</button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {sections.map((section) => (
              <section key={section.title} aria-label={section.title}>
                <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground mb-2 px-1">{section.title}</h2>
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const first = item.notifications[0];
                    const ids = item.notifications.map((notification) => notification.id);
                    const isUnread = item.notifications.some((notification) => !notification.readAt);
                    return (
                      <Link
                        key={item.id}
                        to={notificationHref(first)}
                        onClick={() => {
                          if (isUnread) void handleMarkRead(ids);
                        }}
                        className={`group flex items-center gap-3 px-3 sm:px-4 py-3.5 rounded-2xl border transition-colors focus-visible:outline-offset-2 ${isUnread ? "bg-primary/[0.07] border-primary/20 hover:bg-primary/10" : "border-transparent hover:bg-secondary/70"}`}
                      >
                        <NotificationIcon type={item.type} />
                        <ActorAvatars actors={item.actors} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm leading-snug">{notificationText(item)}</p>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {formatDistanceToNow(item.date, { addSuffix: true })}
                            {item.notifications.length > 1 ? ` · ${item.notifications.length} activities` : ""}
                          </p>
                        </div>
                        {isUnread ? (
                          <span className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.45)] flex-shrink-0" aria-label="Unread" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-border-strong opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
