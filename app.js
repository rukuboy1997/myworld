import express from "express";
import { Readable } from "node:stream";
import cors from "cors";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import {
  uploadToR2,
  deleteFromR2,
  getFromR2,
  r2MediaUrl,
  sniffMime,
} from "./services/r2.service.js";
import {
  initDb,
  pool,
  getPosts,
  getPostsPage,
  getReelsPage,
  getRankedReelsPage,
  getTrendingReelsPage,
  getReelCreatorAnalytics,
  recordReelWatch,
  getRankedPostsPage,
  getFeedEngagement,
  createStatus,
  getActiveStatusesForViewer,
  getActiveStatusById,
  getActiveStatusMediaKey,
  recordStatusView,
  getStatusViewers,
  getExpiredStatuses,
  deleteExpiredStatusIds,
  getPostById,
  savePost,
  updatePost,
  getProfile,
  saveProfile,
  getAllProfiles,
  getProfileStats,
  getComments,
  saveComment,
  getLikes,
  hasLiked,
  saveLike,
  removeLike,
  getMessages,
  getUnreadMessageCounts,
  getConversation,
  saveMessage,
  updateMessageContent,
  deleteMessageForEveryone,
  markConversationMessagesRead,
  setMessageTyping,
  getMessageTyping,
  getMessageTypingBatch,
  createFollow,
  deleteFollow,
  isFollowing,
  getFollowerCount,
  getFollowingCount,
  getFollowers,
  getFollowing,
  createNotification,
  getNotifications,
  markNotificationsRead,
  getUnreadNotificationCount,
  upsertPresence,
  getBatchPresence,
  getUserByAddress,
  saveReport,
  blockUser,
  unblockUser,
  getBlockStatus,
  getBlockedUsers,
  isBlockedEitherWay,
  saveAccountReport,
  getAdminReports,
  updateAdminReport,
  getAdminUsers,
  updateAdminUserStatus,
  getModerationAuditLog,
  updateAdminReportPriority,
  getAdminAlertDeliveries,
  getAdminIncidents,
  updateAdminIncident,
} from "./data/db.js";
import {
  requireAuth,
  optionalAuth,
  signup,
  login,
  getCurrentUser,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
  resendVerification,
} from "./services/auth.service.js";
import { getClientIp } from "./utils/clientIp.js";
import { sendNotificationEmail } from "./services/notification-email.service.js";
import { sendCriticalModerationAlert } from "./services/moderation-alert.service.js";
import { asyncWrapProviders } from "async_hooks";
import { timeStamp } from "console";

// ─── Firebase Realtime Database (fire-and-forget write) ───────────────────────
const FIREBASE_DB_URL = (
  process.env.FIREBASE_DB_URL ||
  "https://fascoin-app-default-rtdb.firebaseio.com"
).replace(/\/$/, "");
function fbConvId(a, b) {
  return [a, b].sort().join("_");
}
async function firebaseWrite(path, data) {
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/${path}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn(`[firebase] write to ${path} failed: ${res.status} ${detail}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[firebase] write error:", err.message);
    return false;
  }
}

async function firebasePatch(path, data) {
  try {
    const normalizedPath = String(path || "").split("/").filter(Boolean).join("/");
    const url = `${FIREBASE_DB_URL}/${normalizedPath ? `${normalizedPath}.json` : ".json"}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn(`[firebase] patch to ${normalizedPath || "/"} failed: ${res.status} ${detail}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[firebase] patch error:", err.message);
    return false;
  }
}

// Fire-and-forget email notification — never blocks the HTTP response
async function fireEmailNotif({ type, recipientAddress, actorAddress, extra }) {
  try {
    const [recipientUser, actorProfile] = await Promise.all([
      getUserByAddress(recipientAddress),
      getProfile(actorAddress),
    ]);
    if (!recipientUser?.email) return;
    await sendNotificationEmail({
      type,
      recipientEmail: recipientUser.email,
      recipientName: recipientUser.username,
      actorProfile,
      extra,
    });
  } catch (err) {
    console.warn("[email-notif] failed:", err.message);
  }
}

// Expo push delivery is best-effort: notification records remain the source of truth,
// and a push provider outage must never fail the user's social action.
async function deliverExpoPush({ recipient, type, actorAddress, postId, excerpt }) {
  try {
    // Reports stay in the in-app notification centre; do not push them to users.
    if (type === "report") return;

    const { rows } = await pool.query(
      "SELECT token FROM push_tokens WHERE user_address = $1",
      [recipient],
    );
    const tokens = [...new Set(rows.map((row) => row.token).filter(Boolean))];
    if (!tokens.length) return;

    let actorProfile = null;
    try {
      actorProfile = await getProfile(actorAddress);
    } catch (err) {
      console.warn("[push] actor profile lookup failed:", err.message);
    }
    const actorName =
      actorProfile?.displayName?.trim() ||
      actorProfile?.username ||
      (actorAddress ? actorAddress.slice(0, 6) + "…" + actorAddress.slice(-4) : "Someone");
    const rawAvatarUrl = actorProfile?.avatarUrl;
    const senderAvatarUrl =
      typeof rawAvatarUrl === "string" && /^https:\/\//i.test(rawAvatarUrl)
        ? rawAvatarUrl
        : null;

    const copy = {
      like: { title: "New like on myWorld", body: actorName + " liked your post." },
      comment: { title: "New comment on myWorld", body: actorName + " commented: " + (excerpt || "Open myWorld to view it.") },
      follow: { title: "New follower on myWorld", body: actorName + " started following you." },
      // The app name remains the Android notification header; show the sender
      // as the title and their message as the body for a more personal inbox.
      message: { title: actorName, body: excerpt || "Sent you a message." },
    }[type] || { title: "myWorld notification", body: excerpt || "You have a new notification." };

    const path = type === "message"
      ? `/messages?with=${encodeURIComponent(actorAddress || "")}`
      : type === "follow"
        ? `/profile/${encodeURIComponent(actorAddress || "")}`
        : postId
          ? `/post/${encodeURIComponent(postId)}`
          : "/notifications";

    // Expo accepts up to 100 messages per request.
    for (let offset = 0; offset < tokens.length; offset += 100) {
      const batch = tokens.slice(offset, offset + 100);
      const messages = batch.map((token) => ({
        to: token,
        title: copy.title,
        body: copy.body.slice(0, 220),
        sound: "default",
        priority: "high",
        channelId: "default",
        ...(type === "message" ? {
          categoryId: "myworldmessage",
          // Keep each Android message alert as a separate notification.
          // A stable Android tag replaces the previous displayed notification,
          // and collapseId can discard pending messages while the device is offline.
          // iOS can still group messages using threadId.
          threadId: "mw-" + String(recipient).slice(0, 14) + "-" + String(actorAddress || "").slice(-14),
          // Expo renders this separately from the message text/attachment on Android.
          ...(senderAvatarUrl ? { richContent: { image: senderAvatarUrl } } : {}),
        } : {}),
        data: {
          url: path,
          path,
          type,
          actorAddress: actorAddress || null,
          conversationAddress: type === "message" ? actorAddress || null : null,
          senderAvatarUrl: type === "message" ? senderAvatarUrl : null,
        },
      }));

      try {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(messages),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          console.warn("[push] Expo request failed:", response.status, result?.errors || "");
          continue;
        }

        const tickets = Array.isArray(result?.data) ? result.data : [result?.data];
        const invalidTokens = tickets.flatMap((ticket, index) =>
          ticket?.status === "error" &&
          ticket?.details?.error === "DeviceNotRegistered" &&
          batch[index]
            ? [batch[index]]
            : [],
        );
        if (invalidTokens.length) {
          await pool.query(
            "DELETE FROM push_tokens WHERE user_address = $1 AND token = ANY($2::text[])",
            [recipient, invalidTokens],
          );
        }
        const providerErrors = tickets.filter((ticket) => ticket?.status === "error");
        if (providerErrors.length) {
          console.warn("[push] Expo rejected one or more messages:", providerErrors.map((ticket) => ticket.message || ticket.details?.error || "unknown error"));
        }
      } catch (err) {
        console.warn("[push] delivery request failed:", err.message);
      }
    }
  } catch (err) {
    console.warn("[push] delivery preparation failed:", err.message);
  }
}

async function createNotificationAndPush(notification) {
  await createNotification(notification);
  // Deliberately do not await provider delivery; social actions should stay responsive.
  void deliverExpoPush(notification);
}

let dbReady = null;
export function ensureDb() {
  if (!dbReady)
    dbReady = initDb().catch((e) => {
      dbReady = null;
      throw e;
    });
  return dbReady;
}

export function buildApp() {
  const app = express();

  const adminAddressSet = new Set(
    (process.env.ADMIN_USER_ADDRESSES || "")
      .split(",")
      .map((address) => address.trim().toLowerCase())
      .filter(Boolean),
  );
  function requireAdmin(req, res, next) {
    if (!adminAddressSet.size) {
      return res.status(503).json({ error: "Admin access is not configured. Set ADMIN_USER_ADDRESSES in the API environment." });
    }
    if (!adminAddressSet.has(String(req.userAddress || "").toLowerCase())) {
      return res.status(403).json({ error: "Administrator access required" });
    }
    next();
  }

  const PROFILE_USERNAME_MAX_LENGTH = 32;
  const PROFILE_DISPLAY_NAME_MAX_LENGTH = 80;
  const PROFILE_BIO_MAX_LENGTH = 500;
  const PROFILE_WEBSITE_MAX_LENGTH = 200;
  const PROFILE_LOCATION_MAX_LENGTH = 80;
  const PROFILE_TWITTER_MAX_LENGTH = 50;
  const PROFILE_PROFESSION_MAX_LENGTH = 80;
  const POST_TITLE_MAX_LENGTH = 200;
  const POST_CONTENT_MAX_LENGTH = 10000;
  const COMMENT_CONTENT_MAX_LENGTH = 1000;
  const MESSAGE_CONTENT_MAX_LENGTH = 2000;

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  // CORS
  // myWorld is a browser + WebView application, so the API intentionally
  // accepts requests from any origin. The frontend does not use cookie-based
  // credentials, so wildcard CORS is safe here and avoids origin-matching
  // failures when the web app or mobile WebView changes origin.
  const corsOptions = {
    origin: "*",
    credentials: false,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
  };

  // CORS must run before DB initialization so OPTIONS preflight requests are
  // answered without touching Neon or any other external service.
  app.use(cors(corsOptions));
  app.options(/.*/, cors(corsOptions));
  app.use(express.json({ limit: "10mb" }));

  // Lightweight diagnostics. This route is intentionally before the
  // database-init middleware so deployment/startup failures are visible as
  // JSON instead of an opaque Vercel 500 page.
  app.get("/api/health", async (req, res) => {
    try {
      await ensureDb();
      await pool.query("SELECT 1");
      res.json({ ok: true, service: "myWorld API", database: "connected" });
    } catch (err) {
      console.error("[health] database initialization failed:", err);
      res.status(500).json({
        ok: false,
        service: "myWorld API",
        database: "error",
        error: err?.message || "Database initialization failed",
      });
    }
  });



  app.use(async (req, res, next) => {
    try {
      await ensureDb();
      next();
    } catch (err) {
      next(err);
    }
  });

  // ─── Helpers ─────────────────────────────────────────────────────────
  function truncateAddr(addr) {
    if (!addr) return "Unknown";
    return addr.slice(0, 6) + "..." + addr.slice(-4);
  }
  function defaultProfile(addr) {
    return {
      address: addr,
      username: truncateAddr(addr),
      bio: "",
      displayName: "",
      avatarUrl: null,
      profession: "",
    };
  }
  function detectMediaType(mime) {
    if (!mime) return null;
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    return null;
  }
  function normalizeTextInput(value) {
    return typeof value === "string" ? value.trim() : "";
  }
  function tooLongError(field, maxLength) {
    return `${field} too long (max ${maxLength} characters)`;
  }
  function validateMaxLength(res, field, value, maxLength) {
    if (value.length <= maxLength) return false;
    res.status(400).json({ error: tooLongError(field, maxLength) });
    return true;
  }
  // Check if post is deleted or doesn't exist
  function isPostUnavailable(post) {
    return !post || post.isDeleted === true;
  }

  // ─── Auth ──────────────────────────────────────────────────────────────
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { username, email, password } = req.body || {};
      const result = await signup({ username, email, password });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message || "Signup failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body || {};
      const result = await login({ username, password });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message || "Login failed" });
    }
  });

  app.get("/api/auth/me", getCurrentUser);

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body || {};
      const ip = getClientIp(req);
      const result = await requestPasswordReset({ email, ip });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message || "Request failed" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { email, code, newPassword } = req.body || {};
      const ip = getClientIp(req);
      const result = await resetPassword({ email, code, newPassword, ip });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message || "Reset failed" });
    }
  });

  app.post("/api/auth/verify-email", async (req, res) => {
    try {
      const { token } = req.body || {};
      const result = await verifyEmail({ token });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message || "Verification failed" });
    }
  });

  app.post("/api/auth/resend-verify", requireAuth, async (req, res) => {
    try {
      const result = await resendVerification({ userId: req.userAddress });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message || "Resend failed" });
    }
  });

  app.get("/api/config", (req, res) => {
    res.json({ status: "ok", storage: "r2" });
  });

  // ─── Feed ──────────────────────────────────────────────────────────────
  app.get("/api/feed", optionalAuth, async (req, res) => {
    try {
      const rawLimit = req.query.limit;
      const limit = rawLimit === undefined ? 20 : Number.parseInt(rawLimit, 10);
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
        return res.status(400).json({ error: "limit must be an integer between 1 and 50" });
      }

      const sort = req.query.sort === undefined ? "latest" : String(req.query.sort);
      if (sort !== "latest" && sort !== "for-you") {
        return res.status(400).json({ error: "sort must be latest or for-you" });
      }
      let beforeCreatedAt = null;
      let beforeId = null;
      let beforeScore = null;
      if (req.query.cursor) {
        try {
          const decoded = Buffer.from(String(req.query.cursor), "base64url").toString("utf8");
          const cursor = JSON.parse(decoded);
          if (
            typeof cursor.createdAt !== "string" ||
            Number.isNaN(Date.parse(cursor.createdAt)) ||
            typeof cursor.id !== "string" ||
            !cursor.id
          ) throw new Error("Invalid cursor");
          if (sort === "for-you" || sort === "trending") {
            if (typeof cursor.score !== "number" || !Number.isFinite(cursor.score)) throw new Error("Invalid ranked cursor");
            beforeScore = cursor.score;
          }
          beforeCreatedAt = cursor.createdAt;
          beforeId = cursor.id;
        } catch {
          return res.status(400).json({ error: "Invalid feed cursor" });
        }
      }

      const viewer = req.userAddress || null;
      const posts = sort === "for-you"
        ? await getRankedPostsPage({ viewer, limit: limit + 1, beforeScore, beforeCreatedAt, beforeId })
        : await getPostsPage({ limit: limit + 1, beforeCreatedAt, beforeId, viewer });
      const hasMore = posts.length > limit;
      const page = hasMore ? posts.slice(0, limit) : posts;
      const [profiles, engagement] = await Promise.all([
        getAllProfiles(),
        getFeedEngagement(page.map((post) => post.id), viewer),
      ]);

      const items = page.map((post) => ({
        ...post,
        ...(engagement[post.id] || { likes: 0, commentCount: 0, userLiked: false }),
        profile: profiles[post.owner] || defaultProfile(post.owner),
      }));

      const lastPost = page[page.length - 1];
      const nextCursor = hasMore && lastPost
        ? Buffer.from(JSON.stringify({
            ...(sort === "for-you" || sort === "trending" ? { score: lastPost.score } : {}),
            createdAt: lastPost.createdAt,
            id: lastPost.id,
          })).toString("base64url")
        : null;
      res.set("Cache-Control", "private, no-store");
      res.json({ items, nextCursor, hasMore, sort });
    } catch (err) {
      console.error("feed error:", err);
      res.status(500).json({ error: "Failed to load feed" });
    }
  });

  // Dedicated video-only feed. For You ranks by relevance; Latest stays chronological.
  app.get("/api/reels", optionalAuth, async (req, res) => {
    try {
      const rawLimit = req.query.limit;
      const limit = rawLimit === undefined ? 10 : Number.parseInt(rawLimit, 10);
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
        return res.status(400).json({ error: "limit must be an integer between 1 and 20" });
      }
      const sort = req.query.sort === undefined ? "for-you" : String(req.query.sort);
      if (sort !== "for-you" && sort !== "latest" && sort !== "trending") {
        return res.status(400).json({ error: "sort must be for-you, latest, or trending" });
      }
      let beforeCreatedAt = null;
      let beforeId = null;
      let beforeScore = null;
      if (req.query.cursor) {
        try {
          const decoded = Buffer.from(String(req.query.cursor), "base64url").toString("utf8");
          const cursor = JSON.parse(decoded);
          if (typeof cursor.createdAt !== "string" || Number.isNaN(Date.parse(cursor.createdAt)) ||
              typeof cursor.id !== "string" || !cursor.id) throw new Error("Invalid cursor");
          if (sort === "for-you" || sort === "trending") {
            if (typeof cursor.score !== "number" || !Number.isFinite(cursor.score)) throw new Error("Invalid ranked cursor");
            beforeScore = cursor.score;
          }
          beforeCreatedAt = cursor.createdAt;
          beforeId = cursor.id;
        } catch {
          return res.status(400).json({ error: "Invalid Reels cursor" });
        }
      }
      // Never trust a client-supplied viewer ID for personal recommendations.
      const viewer = req.userAddress || null;
      const posts = sort === "for-you"
        ? await getRankedReelsPage({ viewer, limit: limit + 1, beforeScore, beforeCreatedAt, beforeId })
        : sort === "trending"
          ? await getTrendingReelsPage({ limit: limit + 1, beforeScore, beforeCreatedAt, beforeId, viewer })
          : await getReelsPage({ limit: limit + 1, beforeCreatedAt, beforeId, viewer });
      const hasMore = posts.length > limit;
      const page = hasMore ? posts.slice(0, limit) : posts;
      const [profiles, engagement] = await Promise.all([
        getAllProfiles(),
        getFeedEngagement(page.map((post) => post.id), viewer),
      ]);
      const items = page.map((post) => ({
        ...post,
        ...(engagement[post.id] || { likes: 0, commentCount: 0, userLiked: false }),
        profile: profiles[post.owner] || defaultProfile(post.owner),
      }));
      const lastPost = page[page.length - 1];
      const nextCursor = hasMore && lastPost
        ? Buffer.from(JSON.stringify({
            ...(sort === "for-you" || sort === "trending" ? { score: lastPost.score } : {}),
            createdAt: lastPost.createdAt,
            id: lastPost.id,
          })).toString("base64url")
        : null;
      res.set("Cache-Control", "private, no-store");
      res.json({ items, nextCursor, hasMore, sort });
    } catch (err) {
      console.error("reels feed error:", err);
      res.status(500).json({ error: "Failed to load Reels" });
    }
  });

  app.post("/api/reels/:id/watch", requireAuth, async (req, res) => {
    try {
      const { sessionId, watchedMs, durationMs, completed = false } = req.body || {};
      if (typeof sessionId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
        return res.status(400).json({ error: "A valid playback sessionId is required" });
      }
      const maxDurationMs = 4 * 60 * 60 * 1000;
      if (!Number.isInteger(watchedMs) || watchedMs < 0 || watchedMs > maxDurationMs ||
          !Number.isInteger(durationMs) || durationMs < 0 || durationMs > maxDurationMs ||
          typeof completed !== "boolean") {
        return res.status(400).json({ error: "Invalid playback measurements" });
      }
      const recorded = await recordReelWatch({
        sessionId, postId: req.params.id, viewer: req.userAddress,
        watchedMs, durationMs, completed,
      });
      if (!recorded) return res.status(404).json({ error: "Video not found or playback session unavailable" });
      res.set("Cache-Control", "private, no-store");
      res.json({ ok: true, watch: recorded });
    } catch (err) {
      console.error("record_reel_watch error:", err);
      res.status(500).json({ error: "Failed to record video watch" });
    }
  });

  // Private creator dashboard: only the authenticated creator can view their own Reel analytics.
  app.get("/api/reels/analytics", requireAuth, async (req, res) => {
    try {
      const analytics = await getReelCreatorAnalytics(req.userAddress);
      res.set("Cache-Control", "private, no-store");
      res.json(analytics);
    } catch (err) {
      console.error("reel_analytics error:", err);
      res.status(500).json({ error: "Failed to load Reel analytics" });
    }
  });

  // Vercel Cron: expire status records and remove their unique R2 media objects.
  app.get("/api/cron/status-cleanup", async (req, res) => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return res.status(503).json({ error: "Status cleanup is not configured" });
    }
    if (req.headers.authorization !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const expired = await getExpiredStatuses();
      const deletableIds = [];
      let mediaFailures = 0;
      for (const status of expired) {
        if (status.media_key) {
          // Only delete objects created by this status feature.
          if (!status.media_key.startsWith("statuses/")) {
            mediaFailures += 1;
            console.warn("[status-cleanup] skipped unexpected media key", status.id);
            continue;
          }
          try {
            await deleteFromR2(status.media_key);
          } catch (err) {
            mediaFailures += 1;
            console.warn("[status-cleanup] R2 deletion failed; status will be retried", status.id, err.message);
            continue;
          }
        }
        deletableIds.push(status.id);
      }
      const deleted = await deleteExpiredStatusIds(deletableIds);
      res.json({ ok: true, scanned: expired.length, deleted, mediaFailures });
    } catch (err) {
      console.error("status_cleanup error:", err);
      res.status(500).json({ error: "Status cleanup failed" });
    }
  });

  // ─── Status ───────────────────────────────────────────────────────────────
  app.get("/api/statuses", requireAuth, async (req, res) => {
    try {
      const statuses = await getActiveStatusesForViewer(req.userAddress);
      res.set("Cache-Control", "private, no-store");
      res.json({ items: statuses });
    } catch (err) {
      console.error("get_statuses error:", err);
      res.status(500).json({ error: "Failed to load statuses" });
    }
  });

  app.post(
    "/api/statuses",
    requireAuth,
    upload.single("media"),
    async (req, res) => {
      try {
        const content = normalizeTextInput(req.body?.content || "");
        const audience = req.body?.audience === "everyone" ? "everyone" : "followers";
        if (content.length > 700) {
          return res.status(400).json({ error: "Status text must be 700 characters or fewer" });
        }
        if (!content && !req.file) {
          return res.status(400).json({ error: "Add text or choose an image/video" });
        }

        let mediaKey = null;
        let mediaUrl = null;
        let mediaType = null;
        let mediaMime = null;
        if (req.file) {
          mediaMime = (req.file.mimetype || "").toLowerCase();
          const sniffed = sniffMime(req.file.buffer);
          const declaredType = detectMediaType(mediaMime);
          const detectedType = detectMediaType(sniffed);

          // Some Android/WebView file pickers report video files as
          // application/octet-stream or omit the MIME type entirely. Prefer
          // the file signature in that case, rather than rejecting a valid clip.
          mediaType = declaredType || detectedType;
          if (!mediaType) {
            return res.status(400).json({
              error: "We couldn't recognize that file. Please choose an image, MP4, or WebM video.",
            });
          }
          if (declaredType && detectedType && declaredType !== detectedType) {
            return res.status(400).json({
              error: "The selected file type doesn't match its contents. Please choose another file.",
            });
          }
          if (sniffed && !["image/", "video/"].some((prefix) => sniffed.startsWith(prefix))) {
            return res.status(400).json({ error: "The uploaded file does not appear to be an image or video" });
          }

          // Keep the actual detected type when a mobile picker supplies a
          // generic MIME type, so browsers can play the uploaded status.
          if (!declaredType && detectedType) mediaMime = sniffed;
          const maxBytes = mediaType === "video" ? 25 * 1024 * 1024 : 10 * 1024 * 1024;
          if (req.file.size > maxBytes) {
            return res.status(400).json({
              error: mediaType === "video" ? "Status videos must be 25 MB or smaller" : "Status images must be 10 MB or smaller",
            });
          }
          const ext = mediaMime.split("/")[1]?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || (mediaType === "video" ? "mp4" : "jpg");
          mediaKey = `statuses/${req.userAddress}/${uuidv4()}.${ext}`;
          const uploaded = await uploadToR2(mediaKey, req.file.buffer, mediaMime);
          mediaUrl = uploaded.url;
        }

        const status = await createStatus({
          id: uuidv4(),
          owner: req.userAddress,
          content,
          mediaKey,
          mediaUrl,
          mediaType,
          mediaMime,
          audience,
        });
        res.status(201).json({ status });
      } catch (err) {
        console.error("create_status error:", err);
        res.status(500).json({ error: "Failed to create status" });
      }
    },
  );

  app.get("/api/statuses/:id/media", requireAuth, async (req, res) => {
    try {
      const media = await getActiveStatusMediaKey(req.params.id, req.userAddress);
      if (!media?.media_key) {
        return res.status(404).json({ error: "Status media not found or unavailable" });
      }
      const object = await getFromR2(media.media_key);
      res.set("Content-Type", media.media_mime || object.headers.get("content-type") || "application/octet-stream");
      res.set("Cache-Control", "private, no-store");
      res.set("X-Content-Type-Options", "nosniff");
      if (object.headers.get("content-length")) res.set("Content-Length", object.headers.get("content-length"));
      Readable.fromWeb(object.body).pipe(res);
    } catch (err) {
      console.error("status_media error:", err);
      if (!res.headersSent) res.status(500).json({ error: "Failed to load status media" });
      else res.end();
    }
  });

  app.post("/api/statuses/:id/view", requireAuth, async (req, res) => {
    try {
      const status = await getActiveStatusById(req.params.id, req.userAddress);
      if (!status) return res.status(404).json({ error: "Status not found or unavailable" });
      const recorded = await recordStatusView(status.id, req.userAddress);
      res.json({ ok: true, recorded });
    } catch (err) {
      console.error("view_status error:", err);
      res.status(500).json({ error: "Failed to record status view" });
    }
  });

  app.get("/api/statuses/:id/viewers", requireAuth, async (req, res) => {
    try {
      const status = await getActiveStatusById(req.params.id, req.userAddress);
      if (!status || status.owner !== req.userAddress) {
        return res.status(404).json({ error: "Status not found" });
      }
      const viewers = await getStatusViewers(status.id, req.userAddress);
      res.json({ viewers, count: viewers.length });
    } catch (err) {
      console.error("status_viewers error:", err);
      res.status(500).json({ error: "Failed to load status viewers" });
    }
  });

  // ─── Post CRUD ──────────────────────────────────────────────────────────
  app.post(
    "/api/post",
    requireAuth,
    upload.single("media"),
    async (req, res) => {
      try {
        const title = normalizeTextInput(req.body?.title);
        const content = normalizeTextInput(req.body?.content);
        if (!title || !content)
          return res.status(400).json({ error: "title and content required" });
        if (title.length > POST_TITLE_MAX_LENGTH)
          return res
            .status(400)
            .json({ error: tooLongError("title", POST_TITLE_MAX_LENGTH) });
        if (content.length > POST_CONTENT_MAX_LENGTH)
          return res
            .status(400)
            .json({ error: tooLongError("content", POST_CONTENT_MAX_LENGTH) });
        const effectiveOwner = req.userAddress;
        let mediaKey = null,
          mediaUrl = null,
          mediaType = null,
          mediaMime = null;
        if (req.file) {
          mediaMime = req.file.mimetype;
          mediaType = detectMediaType(mediaMime);
          if (!mediaType)
            return res
              .status(400)
              .json({ error: "Only image/* or video/* media is allowed" });
          const sniffed = sniffMime(req.file.buffer);
          if (
            sniffed &&
            !["image/", "video/"].some((p) => sniffed.startsWith(p))
          ) {
            return res
              .status(400)
              .json({ error: "Only image/* or video/* media is allowed" });
          }
          const ext = mediaMime.split("/")[1]?.replace("+xml", "") || "bin";
          mediaKey = `posts/${uuidv4()}.${ext}`;
          const r2 = await uploadToR2(mediaKey, req.file.buffer, mediaMime);
          mediaUrl = r2.url;
        }
        const saved = await savePost({
          id: uuidv4(),
          mediaBlobId: mediaKey,
          mediaUrl,
          mediaType,
          mediaMime,
          owner: effectiveOwner,
          title,
          content,
          isDeleted: false,
          createdAt: new Date().toISOString(),
        });
        res.json(saved);
      } catch (err) {
        console.error("create_post error:", err);
        res.status(500).json({ error: err.message });
      }
    },
  );

  app.get("/api/post/:id", async (req, res) => {
    try {
      const post = await getPostById(req.params.id);
      if (isPostUnavailable(post))
        return res.status(404).json({ error: "Not found" });
      const content = post.content || "";
      const likes = await getLikes(post.id);
      const comments = await getComments(post.id);
      const profiles = await getAllProfiles();
      const profile = profiles[post.owner] || defaultProfile(post.owner);
      const enrichedComments = comments.map((c) => ({
        ...c,
        profile: profiles[c.owner] || defaultProfile(c.owner),
      }));
      res.json({
        ...post,
        content,
        likes: likes.length,
        comments: enrichedComments,
        profile,
      });
    } catch (err) {
      console.error("get_post error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/post/:id", requireAuth, async (req, res) => {
    try {
      const title = normalizeTextInput(req.body?.title);
      const content = normalizeTextInput(req.body?.content);
      if (!title || !content)
        return res.status(400).json({ error: "title and content required" });
      if (title.length > POST_TITLE_MAX_LENGTH)
        return res
          .status(400)
          .json({ error: tooLongError("title", POST_TITLE_MAX_LENGTH) });
      if (content.length > POST_CONTENT_MAX_LENGTH)
        return res
          .status(400)
          .json({ error: tooLongError("content", POST_CONTENT_MAX_LENGTH) });
      const post = await getPostById(req.params.id);
      if (isPostUnavailable(post))
        return res.status(404).json({ error: "Not found" });
      if (post.owner !== req.userAddress)
        return res.status(403).json({ error: "Forbidden" });
      const updated = await updatePost(req.params.id, { title, content });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/post/:id", requireAuth, async (req, res) => {
    try {
      const post = await getPostById(req.params.id);
      if (!post) return res.status(404).json({ error: "Not found" });
      if (post.owner !== req.userAddress)
        return res.status(403).json({ error: "Forbidden" });
      const updated = await updatePost(req.params.id, { isDeleted: true });
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Like ────────────────────────────────────────────────────────────────
  app.post("/api/post/:id/like", requireAuth, async (req, res) => {
    try {
      const effectiveOwner = req.userAddress;
      const postId = req.params.id;
      const post = await getPostById(postId);
      if (isPostUnavailable(post))
        return res.status(404).json({ error: "Not found" });
      if (await isBlockedEitherWay(effectiveOwner, post.owner))
        return res.status(403).json({ error: "You cannot interact with this post because one of these users has blocked the other" });
      if (await hasLiked(postId, effectiveOwner)) {
        await removeLike(postId, effectiveOwner);
        const likes = await getLikes(postId);
        res.json({ liked: false, likes: likes.length });
      } else {
        await saveLike({
          id: uuidv4(),
          postId,
          owner: effectiveOwner,
          createdAt: new Date().toISOString(),
        });
        // Notify post owner (skip self-notification)
        if (post.owner !== effectiveOwner) {
          await createNotificationAndPush({
            recipient: post.owner,
            type: "like",
            actorAddress: effectiveOwner,
            postId,
            excerpt: `liked your post "${post.title.slice(0, 50)}"`,
          });
          fireEmailNotif({
            type: "like",
            recipientAddress: post.owner,
            actorAddress: effectiveOwner,
            extra: { postId, postTitle: post.title?.slice(0, 60) },
          });
        }
        const likes = await getLikes(postId);
        res.json({ liked: true, likes: likes.length });
      }
    } catch (err) {
      console.error("like error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/post/:id/likes", async (req, res) => {
    try {
      const post = await getPostById(req.params.id);
      if (isPostUnavailable(post))
        return res.status(404).json({ error: "Not found" });
      const likes = await getLikes(req.params.id);
      res.json({ count: likes.length, likes });
    } catch (err) {
      console.error("get_likes error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Comment ────────────────────────────────────────────────────────────
  app.post("/api/post/:id/comment", requireAuth, async (req, res) => {
    try {
      const content = normalizeTextInput(req.body?.content);
      if (!content) return res.status(400).json({ error: "content required" });
      if (content.length > COMMENT_CONTENT_MAX_LENGTH)
        return res
          .status(400)
          .json({ error: tooLongError("content", COMMENT_CONTENT_MAX_LENGTH) });
      const effectiveOwner = req.userAddress;
      const postId = req.params.id;
      const post = await getPostById(postId);
      if (isPostUnavailable(post))
        return res.status(404).json({ error: "Not found" });
      if (await isBlockedEitherWay(effectiveOwner, post.owner))
        return res.status(403).json({ error: "You cannot comment here because one of these users has blocked the other" });
      const comment = await saveComment({
        id: uuidv4(),
        postId,
        owner: effectiveOwner,
        content,
        createdAt: new Date().toISOString(),
      });
      // Notify post owner (skip self-notification)
      if (post.owner !== effectiveOwner) {
        await createNotificationAndPush({
          recipient: post.owner,
          type: "comment",
          actorAddress: effectiveOwner,
          postId,
          excerpt: content.slice(0, 80),
        });
        fireEmailNotif({
          type: "comment",
          recipientAddress: post.owner,
          actorAddress: effectiveOwner,
          extra: {
            postId,
            postTitle: post.title?.slice(0, 60),
            commentText: content.slice(0, 200),
          },
        });
      }
      const profile =
        (await getProfile(effectiveOwner)) || defaultProfile(effectiveOwner);
      res.json({ ...comment, profile });
    } catch (err) {
      console.error("add_comment error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/post/:id/comments", async (req, res) => {
    try {
      const post = await getPostById(req.params.id);
      if (isPostUnavailable(post))
        return res.status(404).json({ error: "Not found" });
      const profiles = await getAllProfiles();
      const comments = await getComments(req.params.id);
      res.json(
        comments.map((c) => ({
          ...c,
          profile: profiles[c.owner] || defaultProfile(c.owner),
        })),
      );
    } catch (err) {
      console.error("get_comments error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Admin moderation ───────────────────────────────────────────────────
  app.get("/api/admin/reports", requireAuth, requireAdmin, async (req, res) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : "pending";
      const priority = typeof req.query.priority === "string" ? req.query.priority : "all";
      if (!["pending", "reviewed", "dismissed", "removed", "all"].includes(status)) {
        return res.status(400).json({ error: "Invalid report status" });
      }
      if (!["all", "urgent", "critical", "standard"].includes(priority)) {
        return res.status(400).json({ error: "Invalid report priority" });
      }
      const items = await getAdminReports({ status, priority, limit: req.query.limit });
      res.set("Cache-Control", "private, no-store");
      res.json({ items });
    } catch (err) {
      console.error("admin_reports error:", err);
      res.status(500).json({ error: "Failed to load reports" });
    }
  });

  app.patch("/api/admin/reports/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { action } = req.body || {};
      if (!["reviewed", "dismissed", "removed"].includes(action)) {
        return res.status(400).json({ error: "Choose reviewed, dismissed, or removed" });
      }
      const result = await updateAdminReport(req.params.id, action, req.userAddress);
      if (!result) return res.status(404).json({ error: "Report not found" });
      res.json({ success: true, report: result });
    } catch (err) {
      console.error("admin_moderate_report error:", err);
      res.status(500).json({ error: "Failed to update report" });
    }
  });

  app.patch("/api/admin/reports/:id/priority", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { priority } = req.body || {};
      const note = normalizeTextInput(req.body?.note);
      if (!["standard", "urgent", "critical"].includes(priority)) {
        return res.status(400).json({ error: "Choose standard, urgent, or critical priority" });
      }
      if (note.length > 1000) {
        return res.status(400).json({ error: "Escalation note must be 1000 characters or fewer" });
      }
      if (priority !== "standard" && note.length < 3) {
        return res.status(400).json({ error: "Add a short note explaining why this report needs urgent handling" });
      }
      const report = await updateAdminReportPriority(req.params.id, priority, note, req.userAddress);
      if (!report) return res.status(404).json({ error: "Report not found" });
      res.set("Cache-Control", "private, no-store");
      res.json({ success: true, report });
    } catch (err) {
      console.error("admin_report_priority error:", err);
      res.status(500).json({ error: "Failed to update report priority" });
    }
  });

  app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : "all";
      const search = typeof req.query.search === "string" ? req.query.search : "";
      if (!["active", "suspended", "all"].includes(status)) {
        return res.status(400).json({ error: "Invalid account status filter" });
      }
      if (search.length > 100) {
        return res.status(400).json({ error: "Search must be 100 characters or fewer" });
      }
      const items = await getAdminUsers({ status, search, limit: req.query.limit });
      res.set("Cache-Control", "private, no-store");
      res.json({ items });
    } catch (err) {
      console.error("admin_users error:", err);
      res.status(500).json({ error: "Failed to load accounts" });
    }
  });

  app.patch("/api/admin/users/:address", requireAuth, requireAdmin, async (req, res) => {
    try {
      const targetAddress = normalizeTextInput(req.params.address).toLowerCase();
      const { action } = req.body || {};
      const reason = normalizeTextInput(req.body?.reason);
      if (!/^0x[a-f0-9]{64}$/.test(targetAddress)) {
        return res.status(400).json({ error: "A valid account address is required" });
      }
      if (!["suspend", "restore"].includes(action)) {
        return res.status(400).json({ error: "Choose suspend or restore" });
      }
      if (action === "suspend" && adminAddressSet.has(targetAddress)) {
        return res.status(400).json({ error: "Administrator accounts cannot be suspended through this dashboard" });
      }
      if (action === "suspend" && (reason.length < 3 || reason.length > 1000)) {
        return res.status(400).json({ error: "A suspension reason of 3 to 1000 characters is required" });
      }
      if (reason.length > 1000) {
        return res.status(400).json({ error: "Reason must be 1000 characters or fewer" });
      }
      const result = await updateAdminUserStatus(targetAddress, action, reason, req.userAddress);
      if (!result) return res.status(404).json({ error: "Account not found" });
      res.set("Cache-Control", "private, no-store");
      res.json({ success: true, unchanged: !!result.unchanged, account: result });
    } catch (err) {
      console.error("admin_moderate_user error:", err);
      res.status(500).json({ error: "Failed to update account status" });
    }
  });

  app.get("/api/admin/audit", requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = req.query.limit === undefined ? 100 : Number.parseInt(req.query.limit, 10);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
        return res.status(400).json({ error: "limit must be an integer between 1 and 200" });
      }
      const items = await getModerationAuditLog({ limit });
      res.set("Cache-Control", "private, no-store");
      res.json({ items });
    } catch (err) {
      console.error("admin_audit error:", err);
      res.status(500).json({ error: "Failed to load moderation audit log" });
    }
  });

  app.get("/api/admin/alerts", requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = req.query.limit === undefined ? 100 : Number.parseInt(req.query.limit, 10);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
        return res.status(400).json({ error: "limit must be an integer between 1 and 200" });
      }
      const items = await getAdminAlertDeliveries({ limit });
      res.set("Cache-Control", "private, no-store");
      res.json({ items });
    } catch (err) {
      console.error("admin_alert_deliveries error:", err);
      res.status(500).json({ error: "Failed to load critical alert delivery history" });
    }
  });
  app.get("/api/admin/incidents", requireAuth, requireAdmin, async (req, res) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : "active";
      const allowed = ["active", "open", "acknowledged", "in_progress", "escalated", "resolved"];
      if (!allowed.includes(status)) {
        return res.status(400).json({ error: "Choose a valid incident status" });
      }
      const limit = req.query.limit === undefined ? 100 : Number.parseInt(req.query.limit, 10);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
        return res.status(400).json({ error: "limit must be an integer between 1 and 200" });
      }
      const items = await getAdminIncidents({ status, limit });
      res.set("Cache-Control", "private, no-store");
      res.json({ items });
    } catch (err) {
      console.error("admin_incidents error:", err);
      res.status(500).json({ error: "Failed to load incident response queue" });
    }
  });

  app.patch("/api/admin/incidents/:reportId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { action } = req.body || {};
      const note = normalizeTextInput(req.body?.note);
      const assignedTo = typeof req.body?.assignedTo === "string" ? req.body.assignedTo.trim() : null;
      if (!["acknowledge", "start", "escalate", "resolve", "reopen", "assign"].includes(action)) {
        return res.status(400).json({ error: "Choose a valid incident action" });
      }
      if (note.length > 1000) {
        return res.status(400).json({ error: "Incident note must be 1000 characters or fewer" });
      }
      if (["resolve", "escalate"].includes(action) && note.length < 3) {
        return res.status(400).json({ error: "Add a short note for resolution or escalation" });
      }
      if (action === "assign" && !assignedTo) {
        return res.status(400).json({ error: "Choose an administrator to assign this incident to" });
      }
      if (action === "assign" && !adminAddressSet.has(assignedTo.toLowerCase())) {
        return res.status(400).json({ error: "Incidents can only be assigned to an address in ADMIN_USER_ADDRESSES" });
      }
      const incident = await updateAdminIncident(req.params.reportId, action, note, req.userAddress, assignedTo);
      if (!incident) return res.status(404).json({ error: "Incident not found" });
      res.set("Cache-Control", "private, no-store");
      res.json({ incident });
    } catch (err) {
      if (/required|invalid|resolved|choose|reopen|short note|only be assigned/i.test(err?.message || "")) {
        return res.status(400).json({ error: err.message });
      }
      console.error("admin_incident_update error:", err);
      res.status(500).json({ error: "Failed to update incident" });
    }
  });

  // ─── Report Post ────────────────────────────────────────────────────────
  app.post("/api/post/:id/report", requireAuth, async (req, res) => {
    try {
      const postId = req.params.id;
      const { reason, description } = req.body || {};
      const reporterAddress = req.userAddress;

      if (!reason) {
        return res.status(400).json({ error: "reason required" });
      }

      const post = await getPostById(postId);
      if (isPostUnavailable(post))
        return res.status(404).json({ error: "Post not found" });

      const allowedReasons = ["spam", "harassment", "impersonation", "inappropriate", "hate", "violence", "child-safety", "other"];
      if (!allowedReasons.includes(reason)) {
        return res.status(400).json({ error: "Choose a valid report reason" });
      }
      const safeDescription = normalizeTextInput(description);
      if (safeDescription.length > 1000) {
        return res.status(400).json({ error: "Description must be 1000 characters or fewer" });
      }

      const savedReport = await saveReport({
        postId,
        reporter: reporterAddress,
        reason,
        description: safeDescription,
      });
      // Critical alerts go only to configured moderation contacts. The alert
      // omits reporter identity and the submitted description/content.
      if (savedReport?.triage_priority === "critical") {
        await sendCriticalModerationAlert({
          reportId: savedReport.id,
          reason: savedReport.reason,
          targetAddress: post.owner,
          reportType: "post",
        });
      }
      // Reports are confidential; never notify the reported account that a specific user filed one.
      console.info("[Safety] Post report received", { postId, reason });
      res.json({ success: true, message: "Post reported. Thank you for helping keep myWorld safe." });
    } catch (err) {
      console.error("report_post error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Profile ────────────────────────────────────────────────────────────
  app.post(
    "/api/profile",
    requireAuth,
    upload.fields([
      { name: "avatar", maxCount: 1 },
      { name: "banner", maxCount: 1 },
    ]),
    async (req, res) => {
      try {
        const username = normalizeTextInput(req.body?.username);
        const bio = normalizeTextInput(req.body?.bio);
        const displayName = normalizeTextInput(req.body?.displayName);
        const website = normalizeTextInput(req.body?.website);
        const location = normalizeTextInput(req.body?.location);
        const twitter = normalizeTextInput(req.body?.twitter);
        const profession = normalizeTextInput(req.body?.profession);
        if (!username)
          return res.status(400).json({ error: "username required" });
        if (
          validateMaxLength(
            res,
            "username",
            username,
            PROFILE_USERNAME_MAX_LENGTH,
          )
        )
          return;
        if (
          validateMaxLength(
            res,
            "displayName",
            displayName,
            PROFILE_DISPLAY_NAME_MAX_LENGTH,
          )
        )
          return;
        if (validateMaxLength(res, "bio", bio, PROFILE_BIO_MAX_LENGTH)) return;
        if (
          validateMaxLength(res, "website", website, PROFILE_WEBSITE_MAX_LENGTH)
        )
          return;
        if (
          validateMaxLength(
            res,
            "location",
            location,
            PROFILE_LOCATION_MAX_LENGTH,
          )
        )
          return;
        if (
          validateMaxLength(res, "twitter", twitter, PROFILE_TWITTER_MAX_LENGTH)
        )
          return;
        if (
          validateMaxLength(
            res,
            "profession",
            profession,
            PROFILE_PROFESSION_MAX_LENGTH,
          )
        )
          return;
        const effectiveAddress = req.userAddress;
        const update = {
          username,
          bio,
          displayName,
          website,
          location,
          twitter,
          profession,
        };
        if (req.files?.avatar?.[0]) {
          const f = req.files.avatar[0];
          if (!f.mimetype.startsWith("image/"))
            return res.status(400).json({ error: "Avatar must be an image" });
          const ext = f.mimetype.split("/")[1] || "jpg";
          const key = `avatars/${effectiveAddress}-${Date.now()}.${ext}`;
          const r2 = await uploadToR2(key, f.buffer, f.mimetype);
          update.avatarBlobId = r2.key;
          update.avatarUrl = r2.url;
        } else if (req.body.avatarUrl) {
          update.avatarUrl = String(req.body.avatarUrl);
        }
        if (req.files?.banner?.[0]) {
          const f = req.files.banner[0];
          if (!f.mimetype.startsWith("image/"))
            return res.status(400).json({ error: "Banner must be an image" });
          const ext = f.mimetype.split("/")[1] || "jpg";
          const key = `banners/${effectiveAddress}-${Date.now()}.${ext}`;
          const r2 = await uploadToR2(key, f.buffer, f.mimetype);
          update.bannerBlobId = r2.key;
          update.bannerUrl = r2.url;
        } else if (req.body.bannerUrl) {
          update.bannerUrl = String(req.body.bannerUrl);
        }
        const profile = await saveProfile(effectiveAddress, update);
        res.json(profile);
      } catch (err) {
        console.error("profile error:", err);
        res.status(500).json({ error: err.message });
      }
    },
  );

  app.get("/api/profile/:address", async (req, res) => {
    try {
      const targetAddr = req.params.address;
      const viewer = req.query.viewer || null;
      const profile = await getProfile(targetAddr);
      const allPosts = await getPosts();
      const posts = allPosts.filter((p) => p.owner === targetAddr);
      const enrichedPosts = await Promise.all(
        posts.map(async (p) => {
          const likes = await getLikes(p.id);
          const comments = await getComments(p.id);
          const userLiked = viewer
            ? likes.some((l) => l.owner === viewer)
            : false;
          return {
            ...p,
            likes: likes.length,
            commentCount: comments.length,
            userLiked,
          };
        }),
      );
      const totalLikes = enrichedPosts.reduce((acc, p) => acc + p.likes, 0);
      const [followerCount, followingCount] = await Promise.all([
        getFollowerCount(targetAddr),
        getFollowingCount(targetAddr),
      ]);
      res.json({
        address: targetAddr,
        ...(profile || defaultProfile(targetAddr)),
        posts: enrichedPosts,
        totalLikes,
        postCount: enrichedPosts.length,
        followerCount,
        followingCount,
      });
    } catch (err) {
      console.error("get_profile error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/profiles", async (req, res) => {
    try {
      const [profiles, stats] = await Promise.all([
        getAllProfiles(),
        getProfileStats(),
      ]);
      res.json(
        Object.values(profiles).map((profile) => ({
          ...profile,
          postCount: stats[profile.address]?.postCount || 0,
          totalLikes: stats[profile.address]?.totalLikes || 0,
        })),
      );
    } catch (err) {
      console.error("get_profiles error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Safety & Privacy: user blocks ──────────────────────────────────────
  app.get("/api/users/:address/block-status", requireAuth, async (req, res) => {
    try {
      const target = normalizeTextInput(req.params.address);
      if (!target) return res.status(400).json({ error: "User address required" });
      if (target === req.userAddress) {
        return res.status(400).json({ error: "Cannot check block status for yourself" });
      }
      const status = await getBlockStatus(req.userAddress, target);
      res.set("Cache-Control", "private, no-store");
      res.json(status);
    } catch (err) {
      console.error("block_status error:", err);
      res.status(500).json({ error: "Failed to load block status" });
    }
  });

  app.get("/api/blocks", requireAuth, async (req, res) => {
    try {
      const items = await getBlockedUsers(req.userAddress);
      res.set("Cache-Control", "private, no-store");
      res.json({ items });
    } catch (err) {
      console.error("get_blocks error:", err);
      res.status(500).json({ error: "Failed to load blocked users" });
    }
  });

  app.post("/api/users/:address/block", requireAuth, async (req, res) => {
    try {
      const target = normalizeTextInput(req.params.address);
      if (!target) return res.status(400).json({ error: "User address required" });
      if (target === req.userAddress) return res.status(400).json({ error: "You cannot block yourself" });
      const exists = await pool.query("SELECT 1 FROM users WHERE address = $1 LIMIT 1", [target]);
      if (!exists.rowCount) return res.status(404).json({ error: "User not found" });
      await blockUser(req.userAddress, target);
      res.json({ ok: true, blocked: true });
    } catch (err) {
      console.error("block_user error:", err);
      res.status(500).json({ error: "Failed to block user" });
    }
  });

  app.delete("/api/users/:address/block", requireAuth, async (req, res) => {
    try {
      const target = normalizeTextInput(req.params.address);
      if (!target) return res.status(400).json({ error: "User address required" });
      await unblockUser(req.userAddress, target);
      res.json({ ok: true, blocked: false });
    } catch (err) {
      console.error("unblock_user error:", err);
      res.status(500).json({ error: "Failed to unblock user" });
    }
  });

  app.post("/api/users/:address/report", requireAuth, async (req, res) => {
    try {
      const targetAddress = normalizeTextInput(req.params.address);
      const reason = normalizeTextInput(req.body?.reason);
      const description = normalizeTextInput(req.body?.description);
      const allowedReasons = ["spam", "harassment", "impersonation", "inappropriate", "hate", "violence", "child-safety", "other"];
      if (!targetAddress) return res.status(400).json({ error: "User address required" });
      if (targetAddress === req.userAddress) return res.status(400).json({ error: "You cannot report your own account" });
      if (!allowedReasons.includes(reason)) return res.status(400).json({ error: "Choose a valid report reason" });
      if (description.length > 1000) return res.status(400).json({ error: "Description must be 1000 characters or fewer" });
      const exists = await pool.query("SELECT 1 FROM users WHERE address = $1 LIMIT 1", [targetAddress]);
      if (!exists.rowCount) return res.status(404).json({ error: "User not found" });
      const report = await saveAccountReport({ targetAddress, reporter: req.userAddress, reason, description });
      // Critical alerts go only to configured moderation contacts. The alert
      // omits reporter identity and the submitted description/content.
      if (report?.triage_priority === "critical") {
        await sendCriticalModerationAlert({
          reportId: report.id,
          reason: report.reason,
          targetAddress,
          reportType: "account",
        });
      }
      console.info("[Safety] Account report received", { reportId: report.id, reason });
      res.status(201).json({ ok: true, message: "Account reported. Thank you for helping keep myWorld safe." });
    } catch (err) {
      console.error("report_account error:", err);
      res.status(500).json({ error: "Failed to submit account report" });
    }
  });

  // ─── Follows ────────────────────────────────────────────────────────────
  app.post("/api/follow", requireAuth, async (req, res) => {
    try {
      const follower = req.userAddress;
      const following = normalizeTextInput(req.body?.following);
      if (!following)
        return res.status(400).json({ error: "following address required" });
      if (follower === following)
        return res.status(400).json({ error: "Cannot follow yourself" });
      if (await isBlockedEitherWay(follower, following))
        return res.status(403).json({ error: "This action is unavailable because one of these users has blocked the other" });
      await createFollow(follower, following);
      await createNotificationAndPush({
        recipient: following,
        type: "follow",
        actorAddress: follower,
        excerpt: "started following you",
      });
      fireEmailNotif({
        type: "follow",
        recipientAddress: following,
        actorAddress: follower,
        extra: {},
      });
      res.json({ ok: true, following: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/follow/:address", requireAuth, async (req, res) => {
    try {
      const follower = req.userAddress;
      const following = normalizeTextInput(req.params.address);
      if (!following)
        return res.status(400).json({ error: "following address required" });
      await deleteFollow(follower, following);
      res.json({ ok: true, following: false });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/follow/status/:address", requireAuth, async (req, res) => {
    try {
      const target = normalizeTextInput(req.params.address);
      if (!target)
        return res.status(400).json({ error: "following address required" });
      const following = await isFollowing(req.userAddress, target);
      res.json({ following });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/profile/:address/followers", async (req, res) => {
    try {
      const followers = await getFollowers(req.params.address);
      const profiles = await getAllProfiles();
      res.json(
        followers.map((f) => ({
          ...f,
          profile: profiles[f.address] || defaultProfile(f.address),
        })),
      );
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/profile/:address/following", async (req, res) => {
    try {
      const following = await getFollowing(req.params.address);
      const profiles = await getAllProfiles();
      res.json(
        following.map((f) => ({
          ...f,
          profile: profiles[f.address] || defaultProfile(f.address),
        })),
      );
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Notifications ──────────────────────────────────────────────────────
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const notifications = await getNotifications(req.userAddress);
      const profiles = await getAllProfiles();
      res.json(
        notifications.map((n) => ({
          ...n,
          actorProfile:
            profiles[n.actorAddress] || defaultProfile(n.actorAddress),
        })),
      );
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/notifications/read", requireAuth, async (req, res) => {
    try {
      await markNotificationsRead(req.userAddress);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      const count = await getUnreadNotificationCount(req.userAddress);
      res.json({ count });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Presence ───────────────────────────────────────────────────────────
  app.post("/api/presence/heartbeat", requireAuth, async (req, res) => {
    try {
      await upsertPresence(req.userAddress);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/presence/batch", async (req, res) => {
    try {
      const addresses = (req.query.addresses || "").split(",").filter(Boolean);
      const presence = await getBatchPresence(addresses);
      res.json(presence);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Messages ───────────────────────────────────────────────────────────
  app.post("/api/message", requireAuth, async (req, res) => {
    try {
      const receiver = normalizeTextInput(req.body?.receiver);
      const content = normalizeTextInput(req.body?.content);
      if (!receiver || !content) return res.status(400).json({ error: "receiver and content required" });
      if (content.length > MESSAGE_CONTENT_MAX_LENGTH) return res.status(400).json({ error: tooLongError("content", MESSAGE_CONTENT_MAX_LENGTH) });
      const sender = req.userAddress;
      if (receiver === sender) return res.status(400).json({ error: "You cannot message yourself" });
      const receiverExists = await pool.query("SELECT 1 FROM users WHERE address = $1 LIMIT 1", [receiver]);
      if (!receiverExists.rowCount) return res.status(404).json({ error: "User not found" });
      if (await isBlockedEitherWay(sender, receiver)) return res.status(403).json({ error: "This conversation is unavailable because one of these users has blocked the other" });
      const message = await saveMessage({ id: uuidv4(), sender, receiver, content, createdAt: new Date().toISOString() });
      publishMessageToFirebase(message);
      await notifyMessageReceiver(receiver, sender, content);
      res.json(message);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.put("/api/message/:id", requireAuth, async (req, res) => {
    try {
      const content = normalizeTextInput(req.body?.content);
      if (!content) return res.status(400).json({ error: "Message content cannot be empty" });
      if (content.length > MESSAGE_CONTENT_MAX_LENGTH) return res.status(400).json({ error: tooLongError("content", MESSAGE_CONTENT_MAX_LENGTH) });
      const message = await updateMessageContent(req.params.id, req.userAddress, content);
      if (!message) return res.status(409).json({ error: "This message can no longer be edited. Messages can be edited for 15 minutes after sending." });
      const conversationId = fbConvId(message.sender, message.receiver);
      await firebaseWrite(`conversations/${conversationId}/messages/${message.id}`, message);
      res.json(message);
    } catch (err) {
      console.error("edit_message error:", err);
      res.status(500).json({ error: "Could not edit message" });
    }
  });

  app.delete("/api/message/:id", requireAuth, async (req, res) => {
    try {
      const existing = await pool.query("SELECT sender, attachment_key FROM messages WHERE id = $1 LIMIT 1", [req.params.id]);
      if (!existing.rowCount || existing.rows[0].sender !== req.userAddress) {
        return res.status(404).json({ error: "Message not found" });
      }
      const message = await deleteMessageForEveryone(req.params.id, req.userAddress);
      if (!message) return res.status(409).json({ error: "This message has already been deleted" });
      const attachmentKey = existing.rows[0].attachment_key;
      if (attachmentKey) {
        deleteFromR2(attachmentKey).catch((err) => console.warn("Could not remove deleted message attachment:", err?.message));
      }
      const conversationId = fbConvId(message.sender, message.receiver);
      await firebaseWrite(`conversations/${conversationId}/messages/${message.id}`, message);
      res.json(message);
    } catch (err) {
      console.error("delete_message error:", err);
      res.status(500).json({ error: "Could not delete message" });
    }
  });

  const messageAttachmentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
  const allowedMessageMimeTypes = new Set([
    "image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf",
    "text/plain", "text/csv", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/wav", "audio/aac", "audio/3gpp",
  ]);
  app.post("/api/message/attachment", requireAuth, messageAttachmentUpload.single("file"), async (req, res) => {
    let uploadedKey = null;
    try {
      const receiver = normalizeTextInput(req.body?.receiver);
      const content = normalizeTextInput(req.body?.content);
      const file = req.file;
      if (!receiver || !file) return res.status(400).json({ error: "receiver and file are required" });
      if (content.length > MESSAGE_CONTENT_MAX_LENGTH) return res.status(400).json({ error: tooLongError("content", MESSAGE_CONTENT_MAX_LENGTH) });
      const sender = req.userAddress;
      if (receiver === sender) return res.status(400).json({ error: "You cannot message yourself" });
      const receiverExists = await pool.query("SELECT 1 FROM users WHERE address = $1 LIMIT 1", [receiver]);
      if (!receiverExists.rowCount) return res.status(404).json({ error: "User not found" });
      if (await isBlockedEitherWay(sender, receiver)) return res.status(403).json({ error: "This conversation is unavailable because one of these users has blocked the other" });
      const mimeType = String(file.mimetype || "").toLowerCase();
      if (!allowedMessageMimeTypes.has(mimeType)) return res.status(400).json({ error: "This file type is not supported" });
      const originalName = String(file.originalname || "attachment").replace(/[\\/\x00-\x1f\x7f]/g, "_").slice(0, 180);
      if (mimeType.startsWith("image/")) {
        const detected = sniffMime(file.buffer);
        if (!detected || detected !== mimeType) return res.status(400).json({ error: "The image file content does not match its declared type" });
      }
      const nameExt = originalName.includes(".") ? originalName.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) : "";
      const mimeExt = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/").pop().split("+")[0].replace(/[^a-z0-9]/g, "").slice(0, 10);
      uploadedKey = `messages/${sender}/${uuidv4()}.${nameExt || mimeExt || "bin"}`;
      const stored = await uploadToR2(uploadedKey, file.buffer, mimeType);
      const message = await saveMessage({
        id: uuidv4(), sender, receiver, content,
        attachmentUrl: stored.url, attachmentKey: stored.key, attachmentName: originalName,
        attachmentMime: mimeType, attachmentSize: file.size, createdAt: new Date().toISOString(),
      });
      publishMessageToFirebase(message);
      await notifyMessageReceiver(receiver, sender, content || (mimeType.startsWith("audio/") ? "🎤 Voice message" : `📎 ${originalName}`));
      res.json(message);
    } catch (err) {
      if (uploadedKey) deleteFromR2(uploadedKey).catch(() => {});
      if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Files must be 25 MB or smaller" });
      console.error("message attachment upload failed:", err);
      res.status(500).json({ error: "Could not send attachment" });
    }
  });

  function publishMessageToFirebase(message) {
    firebaseWrite(`conversations/${fbConvId(message.sender, message.receiver)}/messages/${message.id}`, {
      id: message.id, sender: message.sender, receiver: message.receiver, content: message.content || "",
      createdAt: message.createdAt, readAt: message.readAt || null,
      attachmentUrl: message.attachmentUrl || null, attachmentKey: message.attachmentKey || null,
      attachmentName: message.attachmentName || null, attachmentMime: message.attachmentMime || null,
      attachmentSize: message.attachmentSize || null,
      editedAt: message.editedAt || null, deletedAt: message.deletedAt || null,
    });
  }

  async function notifyMessageReceiver(receiver, sender, content) {
    if (receiver === sender) return;
    const preview = String(content || "Sent an attachment");
    await createNotificationAndPush({ recipient: receiver, type: "message", actorAddress: sender, excerpt: preview.slice(0, 80) });
    fireEmailNotif({ type: "message", recipientAddress: receiver, actorAddress: sender, extra: { messagePreview: preview.slice(0, 200) } });
  }

  app.get("/api/messages/unread-count", requireAuth, async (req, res) => {
    try {
      const counts = await getUnreadMessageCounts(req.userAddress);
      res.set("Cache-Control", "private, no-store");
      res.json(counts);
    } catch (err) {
      console.error("get_unread_messages_count error:", err);
      res.status(500).json({ error: "Failed to load unread message counts" });
    }
  });

  app.get("/api/messages/:address", requireAuth, async (req, res) => {
    try {
      if (req.params.address !== req.userAddress)
        return res.status(403).json({ error: "Forbidden" });
      const messages = await getMessages(req.userAddress);
      const profiles = await getAllProfiles();
      const enriched = messages.map((m) => ({
        ...m,
        senderProfile: profiles[m.sender] || defaultProfile(m.sender),
        receiverProfile: profiles[m.receiver] || defaultProfile(m.receiver),
      }));
      res.json(enriched);
    } catch (err) {
      console.error("get_messages error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/conversation", requireAuth, async (req, res) => {
    try {
      const { a, b } = req.query;
      if (!a || !b)
        return res.status(400).json({ error: "a and b addresses required" });
      if (a !== req.userAddress && b !== req.userAddress)
        return res.status(403).json({ error: "Forbidden" });
      if (await isBlockedEitherWay(a, b))
        return res.status(403).json({ error: "This conversation is unavailable because one of these users has blocked the other" });
      const messages = await getConversation(a, b);
      res.json(messages);
    } catch (err) {
      console.error("get_conversation error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/conversation/read", requireAuth, async (req, res) => {
    try {
      const otherAddress = normalizeTextInput(req.body?.otherAddress);
      if (!otherAddress)
        return res.status(400).json({ error: "otherAddress required" });
      if (otherAddress === req.userAddress)
        return res.status(400).json({ error: "Invalid conversation" });
      if (await isBlockedEitherWay(req.userAddress, otherAddress))
        return res.status(403).json({ error: "This conversation is unavailable because one of these users has blocked the other" });

      const readMessages = await markConversationMessagesRead(req.userAddress, otherAddress);
      const conversationId = fbConvId(req.userAddress, otherAddress);
      if (readMessages.length) {
        // Firebase multi-location updates must use full child paths. Patching
        // {messageId: {readAt}} at /messages replaces each full message object;
        // these slash-delimited paths update only the readAt field instead.
        const readUpdates = Object.fromEntries(
          readMessages.map((message) => [
            `conversations/${conversationId}/messages/${message.id}/readAt`,
            message.readAt,
          ]),
        );
        await firebasePatch("", readUpdates);
      }
      res.json({
        ok: true,
        updated: readMessages.length,
        messages: readMessages,
      });
    } catch (err) {
      console.error("mark_conversation_read error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/conversation/typing", requireAuth, async (req, res) => {
    try {
      const otherAddress = normalizeTextInput(req.body?.otherAddress);
      if (!otherAddress)
        return res.status(400).json({ error: "otherAddress required" });
      if (otherAddress === req.userAddress)
        return res.status(400).json({ error: "Invalid conversation" });
      if (await isBlockedEitherWay(req.userAddress, otherAddress))
        return res.status(403).json({ error: "This conversation is unavailable because one of these users has blocked the other" });

      const isTyping = req.body?.typing === true;
      await setMessageTyping(req.userAddress, otherAddress, isTyping);

      // Also publish to Realtime Database so the other open chat receives the
      // event immediately instead of waiting for a database polling interval.
      const realtimePublished = await firebaseWrite(
        `conversations/${fbConvId(req.userAddress, otherAddress)}/typing/${req.userAddress}`,
        { isTyping, updatedAt: new Date().toISOString() },
      );
      res.json({ ok: true, isTyping, realtimePublished });
    } catch (err) {
      console.error("set_conversation_typing error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/conversation/typing", requireAuth, async (req, res) => {
    try {
      const otherAddress = normalizeTextInput(req.query?.otherAddress);
      if (!otherAddress)
        return res.status(400).json({ error: "otherAddress required" });
      if (otherAddress === req.userAddress)
        return res.status(400).json({ error: "Invalid conversation" });
      if (await isBlockedEitherWay(req.userAddress, otherAddress))
        return res.status(403).json({ error: "This conversation is unavailable because one of these users has blocked the other" });

      res.json(await getMessageTyping(otherAddress, req.userAddress));
    } catch (err) {
      console.error("get_conversation_typing error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Batched typing state powers the chat-list indicators and serves as a
  // database-backed fallback if Firebase realtime writes are unavailable.
  app.get("/api/conversations/typing", requireAuth, async (req, res) => {
    try {
      const addresses = String(req.query?.addresses || "")
        .split(",")
        .map((address) => normalizeTextInput(address))
        .filter((address) => address && address !== req.userAddress)
        .slice(0, 100);
      const statuses = await getMessageTypingBatch(req.userAddress, addresses);
      res.set("Cache-Control", "private, no-store");
      res.json({ statuses });
    } catch (err) {
      console.error("get_conversations_typing error:", err);
      res.status(500).json({ error: "Failed to load typing status" });
    }
  });

  // ─── Push Tokens ────────────────────────────────────────────────────────
  app.post("/api/push-token", requireAuth, async (req, res) => {
    try {
      const { token, platform = "unknown" } = req.body;
      if (!token) return res.status(400).json({ error: "token required" });
      await pool.query(
        `INSERT INTO push_tokens (user_address, token, platform)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_address, token) DO UPDATE SET platform = $3`,
        [req.userAddress, token, platform],
      );
      res.json({ ok: true });
    } catch (e) {
      console.error("[push-token]", e.message);
      res.status(500).json({ error: "Failed to register push token" });
    }
  });

  // ─── R2 Media Proxy ─────────────────────────────────────────────────────
  app.get(/^\/api\/media\/(.+)$/, async (req, res) => {
    try {
      const key = req.params[0];
      if (!key) return res.status(400).json({ error: "key required" });
      const r2Res = await getFromR2(key);
      const contentType =
        r2Res.headers.get("content-type") || "application/octet-stream";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      const ct = r2Res.headers.get("content-length");
      if (ct) res.setHeader("Content-Length", ct);
      const { Readable } = await import("stream");
      const nodeStream = Readable.fromWeb
        ? Readable.fromWeb(r2Res.body)
        : r2Res.body;
      nodeStream.pipe(res);
    } catch (err) {
      console.error("[media-proxy]", err.message);
      res.status(404).json({ error: "Media not found" });
    }
  });

  // ─── Stats ──────────────────────────────────────────────────────────────
  app.get("/api/stats", async (req, res) => {
    try {
      const posts = await getPosts();
      const profiles = await getAllProfiles();
      let totalLikes = 0,
        totalComments = 0;
      for (const p of posts) {
        totalLikes += (await getLikes(p.id)).length;
        totalComments += (await getComments(p.id)).length;
      }
      res.json({
        totalPosts: posts.length,
        totalProfiles: Object.keys(profiles).length,
        totalLikes,
        totalComments,
      });
    } catch (err) {
      console.error("stats error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Explicit JSON error handler for Vercel/Express failures that occur
  // before an individual route's try/catch (for example DB initialization).
  app.use((err, req, res, next) => {
    console.error("[api] unhandled error:", err);
    if (res.headersSent) return next(err);
    res.status(500).json({
      error: err?.message || "Internal server error",
    });
  });

  return app;
}

// Vercel may detect app.js itself as the Express entrypoint.
// Export a ready Express server as the default export so Vercel can invoke it.
const vercelApp = buildApp();
export default vercelApp;
