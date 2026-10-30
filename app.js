import express from "express";
// R2 inventory admin route integration.
import { Readable } from "node:stream";
import cors from "cors";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import {
  uploadToR2,
  deleteFromR2,
  createPresignedR2Upload,
  getFromR2,
  getR2ObjectMetadata,
  listR2Objects,
  getR2ObjectPrefix,
  getR2ObjectRange,
  matchesR2UploadMetadata,
  matchesR2UploadSignature,
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
  getPinnedConversations,
  setConversationPinned,
  getConversation,
  rowToMessage,
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
  getMembershipSubscription,
  recordMediaUsage,
  getMediaUsageSummary,
  getMediaIntegrityAuditCandidates,
  createMediaUploadIntent,
  getMediaUploadIntent,
  claimCompletedMediaUploadIntent,
  releaseMediaUploadIntentClaim,
  getAbandonedMediaUploadIntents,
  deleteCleanedMediaUploadIntents,
  completeMediaUploadIntent,
  recordMediaUploadDiagnostic,
  getRecentMediaUploadDiagnostics,
  markMediaUsageDeleted,
  enqueueMediaDeletion,
  getPendingMediaDeletions,
  completeMediaDeletion,
  failMediaDeletion,
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
import { getPublicMembershipPlan, isMembershipEntitled, getMediaSizeLimit } from "./services/membership.service.js";
import { parseVideoDurationSeconds } from "./services/video-duration.service.js";
import { sendNotificationEmail } from "./services/notification-email.service.js";
import { sendCriticalModerationAlert } from "./services/moderation-alert.service.js";
import {
  createFirebaseCustomToken,
  ensureFirebaseConversationMembers,
  ensureFirebaseConversationMemberships,
  revokeFirebaseConversationMembers,
  firebaseWrite,
  firebasePatch,
  writeFirebasePresence,
} from "./services/firebase-realtime.service.js";
import { asyncWrapProviders } from "async_hooks";
import { timeStamp } from "console";

// ─── Firebase Realtime Database ───────────────────────────────────────────────
function fbConvId(a, b) {
  return [a, b].sort().join("_");
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

  // Keep the API's existing in-memory safety ceiling. Larger paid-tier media
  // will be enabled after direct-to-R2 uploads replace memory-buffered uploads.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  async function resolveMembershipPlan(req, res, next) {
    try {
      const subscription = await getMembershipSubscription(req.userAddress);
      const entitled = isMembershipEntitled(subscription ? {
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end,
      } : null);
      req.membershipPlan = getPublicMembershipPlan(
        entitled ? subscription.plan_id : "free",
      );
      next();
    } catch (err) {
      console.error("[membership] failed to resolve upload limits:", err);
      res.status(500).json({ error: "Could not verify membership upload limits" });
    }
  }

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

  // Membership details are always resolved by the API. A client cannot
  // grant itself a paid plan by changing local state or request parameters.
  app.get("/api/membership/usage", requireAuth, resolveMembershipPlan, async (req, res) => {
    try {
      const usage = await getMediaUsageSummary(req.userAddress);
      res.set("Cache-Control", "private, no-store");
      res.json({
        usedBytes: usage.usedBytes,
        storageLimitBytes: req.membershipPlan.storageBytes,
        remainingBytes: Math.max(0, req.membershipPlan.storageBytes - usage.usedBytes),
        objectCount: usage.objectCount,
        counts: usage.counts,
        planId: req.membershipPlan.id,
        accountingScope: "media uploaded after usage accounting was enabled",
      });
    } catch (err) {
      console.error("[membership] failed to load media usage:", err);
      res.status(500).json({ error: "Could not load media usage" });
    }
  });

  // Direct uploads are not used by the current frontend yet. This endpoint
  // issues a short-lived, size-reserved upload intent for the future R2 flow.
  app.post("/api/media/upload-intents", requireAuth, resolveMembershipPlan, async (req, res) => {
    // Keep direct uploads fail-closed until the completion endpoint verifies
    // the actual R2 object size/type and atomically consumes the reservation.
    if (process.env.ENABLE_DIRECT_R2_UPLOADS !== "true") {
      return res.status(503).json({ error: "Direct uploads are not enabled yet" });
    }
    try {
      const { category, mediaType, contentType, sizeBytes } = req.body || {};
      const allowedContentTypes = {
        image: new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]),
        video: new Set(["video/mp4", "video/webm", "video/quicktime"]),
      };
      if (!["post", "status", "message", "avatar", "banner"].includes(category)) {
        return res.status(400).json({ error: "Invalid media category" });
      }
      if (!["image", "video"].includes(mediaType) ||
          !allowedContentTypes[mediaType].has(contentType) ||
          !Number.isSafeInteger(sizeBytes) || sizeBytes < 1) {
        return res.status(400).json({ error: "Invalid media type, content type, or size" });
      }
      if (["avatar", "banner"].includes(category) && mediaType !== "image") {
        return res.status(400).json({ error: "Profile media must be an image" });
      }

      const maxBytes = getMediaSizeLimit(req.membershipPlan.id, mediaType);
      if (!maxBytes || sizeBytes > maxBytes) {
        return res.status(413).json({
          error: "Media exceeds your membership upload limit",
          maxBytes,
          planId: req.membershipPlan.id,
        });
      }

      const folder = {
        post: "posts", status: "statuses", message: "messages",
        avatar: "avatars", banner: "banners",
      }[category];
      const extension = {
        "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
        "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm",
        "video/quicktime": "mov",
      }[contentType];
      const intentId = uuidv4();
      const objectKey = folder + "/" + req.userAddress.replace(/[^a-zA-Z0-9_-]/g, "_") +
        "/" + intentId + "." + extension;
      const expiresIn = 300;

      const intent = await createMediaUploadIntent({
        id: intentId,
        userAddress: req.userAddress,
        objectKey,
        category,
        mediaType,
        contentType,
        sizeBytes,
        storageLimitBytes: req.membershipPlan.storageBytes,
        uploadsPerDay: req.membershipPlan.uploadsPerDay,
        uploadsPerMonth: req.membershipPlan.uploadsPerMonth,
        expiresInSeconds: expiresIn,
      });
      let signed;
      try {
        signed = createPresignedR2Upload({
          key: objectKey,
          contentType,
          expiresIn,
        });
      } catch (signingError) {
        // Do not leave a reservation behind if R2 credentials are missing.
        await pool.query(
          "UPDATE media_upload_intents SET status = 'canceled' WHERE id = $1 AND user_address = $2 AND status = 'pending'",
          [intentId, req.userAddress],
        );
        throw signingError;
      }

      res.set("Cache-Control", "private, no-store");
      return res.status(201).json({
        intentId: intent.id,
        uploadUrl: signed.url,
        method: "PUT",
        headers: signed.requiredHeaders,
        expiresIn: signed.expiresIn,
        expectedBytes: Number(intent.expected_bytes),
        objectKey: intent.object_key,
        status: "pending",
        note: "Upload completion verification is not enabled yet; this intent does not publish or attach media.",
      });
    } catch (err) {
      if (["MEDIA_STORAGE_LIMIT", "MEDIA_DAILY_LIMIT", "MEDIA_MONTHLY_LIMIT"].includes(err.code)) {
        return res.status(429).json({ error: err.message, code: err.code });
      }
      console.error("[media-upload] failed to create upload intent:", err);
      return res.status(503).json({
        error: "Could not authorize direct upload. Check R2 S3 credentials and bucket configuration.",
      });
    }
  });

  app.post("/api/media/upload-intents/:intentId/complete", requireAuth, resolveMembershipPlan, async (req, res) => {
    let diagnosticStage = "load_intent";
    if (process.env.ENABLE_DIRECT_R2_UPLOADS !== "true") {
      return res.status(503).json({ error: "Direct uploads are not enabled yet" });
    }
    const intentId = String(req.params.intentId || "");
    if (!/^[0-9a-f-]{36}$/i.test(intentId)) {
      return res.status(400).json({ error: "Invalid upload intent ID" });
    }

    let intent;
    try {
      intent = await getMediaUploadIntent(intentId, req.userAddress);
      if (!intent) return res.status(404).json({ error: "Upload intent not found" });
      if (intent.status !== "pending") {
        return res.status(409).json({ error: "Upload intent is not pending", status: intent.status });
      }
      if (new Date(intent.expires_at).getTime() <= Date.now()) {
        await pool.query(
          "UPDATE media_upload_intents SET status = 'expired' WHERE id = $1 AND user_address = $2 AND status = 'pending'",
          [intentId, req.userAddress],
        );
        return res.status(410).json({ error: "Upload intent expired" });
      }

      diagnosticStage = "r2_metadata_lookup";
      const metadata = await getR2ObjectMetadata(intent.object_key);
      if (!metadata) {
        return res.status(409).json({ error: "R2 object not found; upload it before completing the intent" });
      }
      const expectedBytes = Number(intent.expected_bytes);
      const expectedType = String(intent.content_type).toLowerCase();
      if (!matchesR2UploadMetadata({
        expectedBytes,
        expectedContentType: expectedType,
      }, metadata)) {
        await pool.query(
          "UPDATE media_upload_intents SET status = 'canceled' WHERE id = $1 AND user_address = $2 AND status = 'pending'",
          [intentId, req.userAddress],
        );
        await deleteFromR2(intent.object_key).catch((deleteError) => {
          console.error("[media-upload] failed to remove mismatched R2 object:", deleteError.message);
        });
        return res.status(422).json({
          error: "Uploaded object size or content type does not match the reservation",
          expectedBytes,
          actualBytes: metadata.sizeBytes,
          expectedContentType: expectedType,
          actualContentType: metadata.contentType,
        });
      }

      // Inspect real file bytes through a bounded Range request, never a full download.
      diagnosticStage = "r2_signature_range";
      const prefix = await getR2ObjectPrefix(intent.object_key, 64);
      if (!prefix || !matchesR2UploadSignature(expectedType, prefix)) {
        await pool.query(
          "UPDATE media_upload_intents SET status = 'canceled' WHERE id = $1 AND user_address = $2 AND status = 'pending'",
          [intentId, req.userAddress],
        );
        await deleteFromR2(intent.object_key).catch((deleteError) => {
          console.error("[media-upload] failed to remove invalid-signature R2 object:", deleteError.message);
        });
        return res.status(422).json({
          error: "Uploaded file bytes do not match the declared media type",
          expectedContentType: expectedType,
        });
      }

      if (intent.media_type === "video") {
        // Inspect at most 8 MiB total (head + tail); never buffer the full video.
        const sampleBytes = 4 * 1024 * 1024;
        diagnosticStage = "r2_video_head_range";
        const head = await getR2ObjectRange(intent.object_key, 0, sampleBytes - 1);
        const tailStart = Math.max(0, metadata.sizeBytes - sampleBytes);
        diagnosticStage = "r2_video_tail_range";
        const tail = tailStart === 0 ? null : await getR2ObjectRange(
          intent.object_key,
          tailStart,
          metadata.sizeBytes - 1,
        );
        const durationSeconds = parseVideoDurationSeconds(expectedType, [head, tail].filter(Boolean));
        const maxDurationSeconds = intent.media_category === "status" ? 180 : getPublicMembershipPlan(req.membershipPlan?.id || "free").reelDurationSeconds;
        if (!Number.isFinite(durationSeconds)) {
          await pool.query(
            "UPDATE media_upload_intents SET status = 'canceled' WHERE id = $1 AND user_address = $2 AND status = 'pending'",
            [intentId, req.userAddress],
          );
          await deleteFromR2(intent.object_key).catch((deleteError) => {
            console.error("[media-upload] failed to remove video with unverifiable duration:", deleteError.message);
          });
          return res.status(422).json({
            error: "Could not verify video duration from its container metadata",
            code: "VIDEO_DURATION_UNVERIFIABLE",
          });
        }
        if (durationSeconds > maxDurationSeconds) {
          await pool.query(
            "UPDATE media_upload_intents SET status = 'canceled' WHERE id = $1 AND user_address = $2 AND status = 'pending'",
            [intentId, req.userAddress],
          );
          await deleteFromR2(intent.object_key).catch((deleteError) => {
            console.error("[media-upload] failed to remove over-duration video:", deleteError.message);
          });
          return res.status(422).json({
            error: "Video exceeds your membership duration limit",
            code: "VIDEO_DURATION_LIMIT",
            durationSeconds: Math.ceil(durationSeconds),
            maxDurationSeconds,
          });
        }
      }

      diagnosticStage = "database_complete_intent";
      const completed = await completeMediaUploadIntent({
        id: intentId,
        userAddress: req.userAddress,
        actualSizeBytes: metadata.sizeBytes,
        actualContentType: metadata.contentType,
      });
      res.set("Cache-Control", "private, no-store");
      return res.json({
        ok: true,
        status: "completed",
        objectKey: completed.objectKey,
        category: completed.category,
        mediaType: completed.mediaType,
        sizeBytes: completed.sizeBytes,
      });
    } catch (err) {
      if (err.code === "MEDIA_INTENT_EXPIRED") {
        await pool.query(
          "UPDATE media_upload_intents SET status = 'expired' WHERE id = $1 AND user_address = $2 AND status = 'pending'",
          [intentId, req.userAddress],
        ).catch(() => {});
        return res.status(410).json({ error: "Upload intent expired" });
      }
      if (err.code === "MEDIA_INTENT_NOT_PENDING") {
        return res.status(409).json({ error: "Upload intent is no longer pending" });
      }
      if (err.code === "MEDIA_OBJECT_MISMATCH") {
        await pool.query(
          "UPDATE media_upload_intents SET status = 'canceled' WHERE id = $1 AND user_address = $2 AND status = 'pending'",
          [intentId, req.userAddress],
        ).catch(() => {});
        if (intent?.object_key) await deleteFromR2(intent.object_key).catch(() => {});
        return res.status(422).json({ error: err.message });
      }
      console.error("[media-upload] completion verification failed:", {
        intentId,
        stage: diagnosticStage,
        name: err?.name || "Error",
        code: err?.code || null,
        message: String(err?.message || "Unknown error").slice(0, 500),
        status: Number.isInteger(err?.status) ? err.status : (Number.isInteger(err?.statusCode) ? err.statusCode : null),
      });
      try {
        await recordMediaUploadDiagnostic({
          intentId,
          stage: diagnosticStage,
          errorName: err?.name || "Error",
          errorCode: err?.code || null,
          errorMessage: err?.message || "Unknown error",
          httpStatus: Number.isInteger(err?.status) ? err.status : (Number.isInteger(err?.statusCode) ? err.statusCode : null),
        });
      } catch (diagnosticError) {
        // Keep the original API response even if the diagnostic table is unavailable.
        console.error("[media-upload] failed to persist diagnostic:", diagnosticError?.message || "Unknown database error");
      }
      return res.status(502).json({ error: "Could not verify uploaded media with R2" });
    }
  });

  // Restricted to configured administrators; diagnostics expire after seven days.
  // Read-only integrity audit: inspect active usage records against R2 metadata
  // and live database references. No objects or accounting records are changed.
  app.get("/api/admin/media-storage-audit", requireAuth, requireAdmin, async (req, res) => {
    try {
      const parsedLimit = Number.parseInt(String(req.query.limit || "50"), 10);
      const parsedOffset = Number.parseInt(String(req.query.offset || "0"), 10);
      const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 50;
      const offset = Number.isFinite(parsedOffset) ? Math.max(0, parsedOffset) : 0;
      const audit = await getMediaIntegrityAuditCandidates({ limit, offset });
      const inspectItem = async (item) => {
        try {
          const metadata = await getR2ObjectMetadata(item.object_key);
          if (!metadata) {
            return {
              objectKey: item.object_key,
              category: item.media_category,
              recordedSizeBytes: item.recorded_size_bytes == null ? null : Number(item.recorded_size_bytes),
              referenced: Boolean(item.is_referenced),
              hasUsageRecord: Boolean(item.has_usage_record),
              source: item.source_table || undefined,
              status: "missing_in_r2",
            };
          }
          const recordedSizeBytes = item.recorded_size_bytes == null ? null : Number(item.recorded_size_bytes);
          if (!item.has_usage_record) {
            return {
              objectKey: item.object_key, category: item.media_category, recordedSizeBytes,
              actualSizeBytes: metadata.sizeBytes, contentType: metadata.contentType,
              referenced: true, hasUsageRecord: false, source: item.source_table,
              status: "untracked_reference",
            };
          }
          const sizeMatches = metadata.sizeBytes === recordedSizeBytes;
          return {
            objectKey: item.object_key, category: item.media_category, recordedSizeBytes,
            actualSizeBytes: metadata.sizeBytes, contentType: metadata.contentType,
            referenced: Boolean(item.is_referenced), hasUsageRecord: true,
            status: !sizeMatches ? "size_mismatch" : !item.is_referenced ? "unreferenced_usage" : "healthy",
          };
        } catch (error) {
          return {
            objectKey: item.object_key,
            category: item.media_category,
            recordedSizeBytes: Number(item.recorded_size_bytes),
            referenced: Boolean(item.is_referenced),
            status: "check_failed",
            error: String(error?.message || "R2 metadata check failed").slice(0, 180),
          };
        }
      };
      // Keep R2 metadata requests bounded instead of fanning out the whole page.
      const results = [];
      for (let index = 0; index < audit.items.length; index += 10) {
        const batch = audit.items.slice(index, index + 10);
        results.push(...await Promise.all(batch.map(inspectItem)));
      }
      const counts = results.reduce((summary, item) => {
        summary[item.status] = (summary[item.status] || 0) + 1;
        return summary;
      }, {});
      res.set("Cache-Control", "private, no-store");
      return res.json({
        generatedAt: new Date().toISOString(),
        pagination: { limit, offset, total: audit.total, hasMore: offset + results.length < audit.total },
        summary: {
          checked: results.length,
          healthy: counts.healthy || 0,
          missingInR2: counts.missing_in_r2 || 0,
          sizeMismatches: counts.size_mismatch || 0,
          unreferencedUsage: counts.unreferenced_usage || 0,
          checkFailures: counts.check_failed || 0,
          untrackedReferences: counts.untracked_reference || 0,
          pendingDeletionJobs: audit.pendingDeletions,
          expiredPendingUploads: audit.expiredPendingUploads,
        },
        results,
        safety: "Read-only audit. No media objects, usage records, or upload intents were modified.",
      });
    } catch (err) {
      console.error("[media-storage-audit] failed:", err?.message || "Unknown error");
      return res.status(500).json({ error: "Could not run media storage integrity audit" });
    }
  });


  app.get("/api/admin/media-storage-inventory", requireAuth, requireAdmin, async (req, res) => {
    try {
      const parsedLimit = Number.parseInt(String(req.query.limit || "100"), 10);
      const limit = Number.isFinite(parsedLimit) ? Math.min(250, Math.max(1, parsedLimit)) : 100;
      const cursor = typeof req.query.cursor === "string" ? req.query.cursor : null;
      const page = await listR2Objects({ cursor, limit });
      const keys = page.objects.map((item) => item.key);
      const dbResult = keys.length ? await pool.query(
        `SELECT o.object_key,
          EXISTS (SELECT 1 FROM posts p WHERE p.is_deleted = false AND (p.media_blob_id = o.object_key OR p.media_url LIKE '%' || o.object_key)) OR
          EXISTS (SELECT 1 FROM statuses s WHERE s.expires_at > NOW() AND (s.media_key = o.object_key OR s.media_url LIKE '%' || o.object_key)) OR
          EXISTS (SELECT 1 FROM messages m WHERE m.deleted_at IS NULL AND (m.attachment_key = o.object_key OR m.attachment_url LIKE '%' || o.object_key)) OR
          EXISTS (SELECT 1 FROM profiles pr WHERE pr.avatar_blob_id = o.object_key OR pr.banner_blob_id = o.object_key OR pr.avatar_url LIKE '%' || o.object_key OR pr.banner_url LIKE '%' || o.object_key) AS referenced,
          u.user_address, u.media_category, u.size_bytes, u.object_key IS NOT NULL AS has_usage,
          u.deleted_at IS NULL AND u.object_key IS NOT NULL AS active_usage,
          EXISTS (SELECT 1 FROM media_deletion_queue q WHERE q.object_key = o.object_key) AS queued,
          (SELECT q.attempts FROM media_deletion_queue q WHERE q.object_key = o.object_key LIMIT 1) AS queue_attempts,
          (SELECT q.last_error FROM media_deletion_queue q WHERE q.object_key = o.object_key LIMIT 1) AS queue_last_error,
          EXISTS (SELECT 1 FROM posts p WHERE p.is_deleted = true AND (p.media_blob_id = o.object_key OR p.media_url LIKE '%' || o.object_key)) AS deleted_post,
          EXISTS (SELECT 1 FROM messages m WHERE m.deleted_at IS NOT NULL AND (m.attachment_key = o.object_key OR m.attachment_url LIKE '%' || o.object_key)) AS deleted_message,
          EXISTS (SELECT 1 FROM statuses s WHERE s.expires_at <= NOW() AND (s.media_key = o.object_key OR s.media_url LIKE '%' || o.object_key)) AS expired_status
         FROM unnest($1::text[]) AS o(object_key)
         LEFT JOIN media_usage_events u ON u.object_key = o.object_key`,
        [keys],
      ) : { rows: [] };
      const indexed = new Map(dbResult.rows.map((row) => [row.object_key, row]));
      const results = page.objects.map((object) => {
        const row = indexed.get(object.key) || {};
        const managed = /^(posts|statuses|messages|avatars|banners)\/[a-zA-Z0-9_./-]+$/.test(object.key) && !object.key.includes("..");
        const reasons = [];
        if (row.deleted_post) reasons.push("deleted_post");
        if (row.deleted_message) reasons.push("deleted_message");
        if (row.expired_status) reasons.push("expired_status");
        if (row.queued) reasons.push("queued_for_deletion");
        if (!row.referenced && !reasons.length) reasons.push("no_live_database_reference");
        return {
          ...object, category: row.media_category || object.key.split("/")[0],
          userAddress: row.user_address || null,
          recordedSizeBytes: row.size_bytes == null ? null : Number(row.size_bytes),
          referenced: Boolean(row.referenced), hasUsageRecord: Boolean(row.has_usage),
          queuedForDeletion: Boolean(row.queued),
          cleanupAttempts: Number(row.queue_attempts || 0),
          cleanupLastError: row.queue_last_error || null,
          reasons,
          status: !managed ? "unsupported_namespace" : !row.referenced ? "orphaned" : !row.active_usage ? "legacy_untracked" : "healthy",
        };
      });
      const summary = results.reduce((counts, item) => {
        counts[item.status] = (counts[item.status] || 0) + 1;
        counts.totalSizeBytes += item.sizeBytes;
        return counts;
      }, { scanned: results.length, totalSizeBytes: 0 });
      res.set("Cache-Control", "private, no-store");
      return res.json({ generatedAt: new Date().toISOString(), summary, results, nextCursor: page.nextCursor, hasMore: Boolean(page.nextCursor), safety: "Read-only inventory. No R2 objects or database records were changed." });
    } catch (err) {
      console.error("[media-storage-inventory] failed:", err?.message || "Unknown error");
      return res.status(500).json({ error: "Could not scan the R2 bucket inventory" });
    }
  });

  // Queue only explicitly selected orphaned R2 objects. The inventory is advisory:
  // every key is revalidated against current database references and R2 before enqueue.
  app.post("/api/admin/media-storage-cleanup/queue", requireAuth, requireAdmin, async (req, res) => {
    try {
      const submitted = Array.isArray(req.body?.objectKeys) ? req.body.objectKeys : [];
      const objectKeys = [...new Set(submitted.filter((key) => typeof key === "string"))];
      if (!objectKeys.length) return res.status(400).json({ error: "Select at least one orphaned object" });
      if (objectKeys.length > 50) return res.status(400).json({ error: "Queue at most 50 objects per request" });

      const prefixToCategory = {
        "posts/": "post",
        "statuses/": "status",
        "messages/": "message",
        "avatars/": "avatar",
        "banners/": "banner",
      };
      const invalid = objectKeys.filter((key) =>
        key.length > 1024 ||
        key.includes("..") ||
        key.startsWith("/") ||
        !Object.keys(prefixToCategory).some((prefix) => key.startsWith(prefix)) ||
        !/^(posts|statuses|messages|avatars|banners)\/[a-zA-Z0-9_./-]+$/.test(key)
      );
      if (invalid.length) return res.status(400).json({ error: "One or more selected object keys are not eligible for cleanup" });

      const { rows } = await pool.query(
        `SELECT o.object_key,
          EXISTS (SELECT 1 FROM posts p WHERE p.is_deleted = false AND (p.media_blob_id = o.object_key OR p.media_url LIKE '%' || o.object_key)) OR
          EXISTS (SELECT 1 FROM statuses s WHERE s.expires_at > NOW() AND (s.media_key = o.object_key OR s.media_url LIKE '%' || o.object_key)) OR
          EXISTS (SELECT 1 FROM messages m WHERE m.deleted_at IS NULL AND (m.attachment_key = o.object_key OR m.attachment_url LIKE '%' || o.object_key)) OR
          EXISTS (SELECT 1 FROM profiles pr WHERE pr.avatar_blob_id = o.object_key OR pr.banner_blob_id = o.object_key OR pr.avatar_url LIKE '%' || o.object_key OR pr.banner_url LIKE '%' || o.object_key) AS referenced,
          u.user_address,
          EXISTS (SELECT 1 FROM media_deletion_queue q WHERE q.object_key = o.object_key) AS queued
         FROM unnest($1::text[]) AS o(object_key)
         LEFT JOIN media_usage_events u ON u.object_key = o.object_key`,
        [objectKeys],
      );
      const byKey = new Map(rows.map((row) => [row.object_key, row]));
      const queued = [];
      const skipped = [];

      // Bound concurrent R2 metadata checks; do not enqueue missing objects.
      for (let offset = 0; offset < objectKeys.length; offset += 10) {
        const batch = objectKeys.slice(offset, offset + 10);
        const metadata = await Promise.all(batch.map(async (key) => {
          try {
            return [key, await getR2ObjectMetadata(key), null];
          } catch (error) {
            return [key, null, error?.message || "R2 metadata check failed"];
          }
        }));

        for (const [key, objectMetadata, metadataError] of metadata) {
          const row = byKey.get(key);
          if (!row) {
            skipped.push({ objectKey: key, reason: "not_found_in_database_check" });
            continue;
          }
          if (row.referenced) {
            skipped.push({ objectKey: key, reason: "live_reference_found" });
            continue;
          }
          if (row.queued) {
            skipped.push({ objectKey: key, reason: "already_queued" });
            continue;
          }
          if (metadataError) {
            skipped.push({ objectKey: key, reason: "r2_check_failed", error: metadataError });
            continue;
          }
          if (!objectMetadata) {
            skipped.push({ objectKey: key, reason: "missing_in_r2" });
            continue;
          }

          const category = Object.entries(prefixToCategory).find(([prefix]) => key.startsWith(prefix))?.[1];
          await enqueueMediaDeletion({ objectKey: key, userAddress: row.user_address || null, category });
          queued.push({ objectKey: key, sizeBytes: objectMetadata.sizeBytes });
        }
      }

      res.set("Cache-Control", "private, no-store");
      return res.json({
        queued,
        skipped,
        summary: {
          requested: objectKeys.length,
          queued: queued.length,
          skipped: skipped.length,
          queuedSizeBytes: queued.reduce((total, item) => total + item.sizeBytes, 0),
        },
        safety: "Objects are queued only after a fresh reference check. The cleanup worker rechecks references immediately before deletion.",
      });
    } catch (err) {
      console.error("[media-storage-cleanup] queue request failed:", err?.message || "Unknown error");
      return res.status(500).json({ error: "Could not queue selected orphaned media" });
    }
  });

  app.get("/api/admin/media-upload-diagnostics", requireAuth, requireAdmin, async (req, res) => {
    try {
      const parsedLimit = Number.parseInt(String(req.query.limit || "50"), 10);
      const diagnostics = await getRecentMediaUploadDiagnostics({
        limit: Number.isFinite(parsedLimit) ? parsedLimit : 50,
      });
      res.set("Cache-Control", "private, no-store");
      return res.json({ diagnostics });
    } catch (err) {
      console.error("[media-upload] failed to read diagnostics:", err?.message || "Unknown error");
      return res.status(500).json({ error: "Could not load media upload diagnostics" });
    }
  });

  app.get("/api/membership/me", requireAuth, async (req, res) => {
    try {
      const subscription = await getMembershipSubscription(req.userAddress);
      const normalizedSubscription = subscription ? {
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end,
      } : null;
      const entitled = isMembershipEntitled(normalizedSubscription);
      const effectivePlanId = entitled ? subscription.plan_id : "free";
      const plan = getPublicMembershipPlan(effectivePlanId);

      res.set("Cache-Control", "private, no-store");
      res.json({
        plan,
        subscription: subscription ? {
          planId: subscription.plan_id,
          status: subscription.status,
          billingInterval: subscription.billing_interval,
          currentPeriodStart: subscription.current_period_start,
          currentPeriodEnd: subscription.current_period_end,
          cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
          identityVerificationStatus: subscription.identity_verification_status,
        } : null,
      });
    } catch (err) {
      console.error("get_membership error:", err);
      res.status(500).json({ error: "Failed to load membership" });
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

  // Firebase identity is issued only after the existing myWorld session has
  // been verified by requireAuth. Never accept a Firebase UID from the client.
  app.post("/api/firebase/custom-token", requireAuth, (req, res) => {
    try {
      const firebaseToken = createFirebaseCustomToken(req.user);
      res.set("Cache-Control", "private, no-store");
      res.json({ firebaseToken, uid: req.userAddress });
    } catch (err) {
      console.error("[firebase-auth] custom-token issuance failed:", err.message);
      res.status(503).json({
        error: "Realtime authentication is not configured on the API",
      });
    }
  });

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
      const expiredMediaKeys = expired
        .filter((status) => deletableIds.includes(status.id) && status.media_key)
        .map((status) => status.media_key);
      if (expiredMediaKeys.length) await markMediaUsageDeleted(expiredMediaKeys);
      // Clean abandoned direct-upload objects in bounded batches. The DB query
      // excludes completed intents and any object already registered as media.
      let uploadIntentsScanned = 0;
      let uploadObjectsDeleted = 0;
      let uploadCleanupFailures = 0;
      try {
        const abandoned = await getAbandonedMediaUploadIntents({ limit: 100 });
        uploadIntentsScanned = abandoned.length;
        const cleanedIds = [];
        for (const intent of abandoned) {
          // Object keys are server-generated under the direct-upload prefixes.
          const allowedPrefixes = ["posts/", "statuses/", "messages/", "avatars/", "banners/"];
          if (!allowedPrefixes.some((prefix) => intent.object_key.startsWith(prefix))) {
            uploadCleanupFailures += 1;
            console.warn("[upload-cleanup] skipped unexpected object key", intent.id);
            continue;
          }
          try {
            await deleteFromR2(intent.object_key);
            cleanedIds.push(intent.id);
            uploadObjectsDeleted += 1;
          } catch (deleteError) {
            uploadCleanupFailures += 1;
            console.warn("[upload-cleanup] R2 deletion failed; will retry", intent.id, deleteError.message);
          }
        }
        if (cleanedIds.length) await deleteCleanedMediaUploadIntents(cleanedIds);
      } catch (uploadCleanupError) {
        uploadCleanupFailures += 1;
        console.error("[upload-cleanup] abandoned upload cleanup failed:", uploadCleanupError.message);
      }

      // Retry media cleanup for soft-deleted posts. This makes a transient R2
      // outage recoverable without requiring the user to delete the post again.
      let deletedPostMediaScanned = 0;
      let deletedPostMediaCleaned = 0;
      let deletedPostMediaFailures = 0;
      try {
        const { rows: deletedPosts } = await pool.query(
          `SELECT p.id, p.media_blob_id
           FROM posts p
           WHERE p.is_deleted = true
             AND p.media_blob_id LIKE 'posts/%'
             AND NOT EXISTS (
               SELECT 1 FROM posts live
               WHERE live.media_blob_id = p.media_blob_id
                 AND live.is_deleted = false
             )
           ORDER BY p.created_at ASC
           LIMIT 100`,
        );
        deletedPostMediaScanned = deletedPosts.length;
        for (const post of deletedPosts) {
          if (!/^posts\/[a-zA-Z0-9_./-]+$/.test(post.media_blob_id) || post.media_blob_id.includes("..")) {
            deletedPostMediaFailures += 1;
            continue;
          }
          try {
            await deleteFromR2(post.media_blob_id);
            await markMediaUsageDeleted(post.media_blob_id);
            deletedPostMediaCleaned += 1;
          } catch (cleanupError) {
            deletedPostMediaFailures += 1;
            console.warn("[post-media-cleanup] retry failed:", post.id, cleanupError.message);
          }
        }
      } catch (postCleanupError) {
        deletedPostMediaFailures += 1;
        console.error("[post-media-cleanup] retry scan failed:", postCleanupError.message);
      }

      // Drain durable cleanup jobs for replaced profile images and deleted
      // message attachments. Failed deletes remain queued for the next run.
      let queuedMediaScanned = 0;
      let queuedMediaDeleted = 0;
      let queuedMediaFailures = 0;
      try {
        const pendingMedia = await getPendingMediaDeletions({ limit: 100 });
        queuedMediaScanned = pendingMedia.length;
        for (const item of pendingMedia) {
          const allowedPrefix = {
            post: "posts/",
            status: "statuses/",
            message: "messages/",
            avatar: "avatars/",
            banner: "banners/",
          }[item.media_category];
          if (!allowedPrefix || !item.object_key.startsWith(allowedPrefix) ||
              !/^(posts|statuses|messages|avatars|banners)\/[a-zA-Z0-9_./-]+$/.test(item.object_key) ||
              item.object_key.includes("..")) {
            queuedMediaFailures += 1;
            await failMediaDeletion(item.object_key, "Unexpected object key prefix");
            continue;
          }
          try {
            // Never remove an object that is still referenced by a live record.
            const referenced = await pool.query(
              `SELECT
                EXISTS (SELECT 1 FROM posts WHERE is_deleted = false AND (media_blob_id = $1 OR media_url LIKE '%' || $1))
                OR EXISTS (SELECT 1 FROM statuses WHERE expires_at > NOW() AND (media_key = $1 OR media_url LIKE '%' || $1))
                OR EXISTS (SELECT 1 FROM messages WHERE deleted_at IS NULL AND (attachment_key = $1 OR attachment_url LIKE '%' || $1))
                OR EXISTS (SELECT 1 FROM profiles WHERE avatar_blob_id = $1 OR banner_blob_id = $1 OR avatar_url LIKE '%' || $1 OR banner_url LIKE '%' || $1)
                AS in_use`,
              [item.object_key],
            );
            if (referenced.rows[0]?.in_use) {
              await completeMediaDeletion(item.object_key);
              continue;
            }
            await deleteFromR2(item.object_key);
            await markMediaUsageDeleted(item.object_key);
            await completeMediaDeletion(item.object_key);
            queuedMediaDeleted += 1;
          } catch (cleanupError) {
            queuedMediaFailures += 1;
            await failMediaDeletion(item.object_key, cleanupError.message);
            console.warn("[media-cleanup] queued object deletion failed; will retry:", cleanupError.message);
          }
        }
      } catch (queueError) {
        queuedMediaFailures += 1;
        console.error("[media-cleanup] queue processing failed:", queueError.message);
      }

      res.json({
        ok: true,
        scanned: expired.length,
        deleted,
        mediaFailures,
        uploadIntentsScanned,
        uploadObjectsDeleted,
        uploadCleanupFailures,
        deletedPostMediaScanned,
        deletedPostMediaCleaned,
        deletedPostMediaFailures,
        queuedMediaScanned,
        queuedMediaDeleted,
        queuedMediaFailures,
      });
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
    resolveMembershipPlan,
    upload.single("media"),
    async (req, res) => {
      let claimedIntentId = null;
      let claimedStatusId = null;
      try {
        const content = normalizeTextInput(req.body?.content || "");
        const audience = req.body?.audience === "everyone" ? "everyone" : "followers";
        const mediaIntentId = typeof req.body?.mediaIntentId === "string" ? req.body.mediaIntentId : "";
        if (content.length > 700) return res.status(400).json({ error: "Status text must be 700 characters or fewer" });
        if (mediaIntentId && req.file) return res.status(400).json({ error: "Choose either a verified direct upload or a buffered media file, not both" });
        if (mediaIntentId && !/^[0-9a-f-]{36}$/i.test(mediaIntentId)) return res.status(400).json({ error: "Invalid media upload intent ID" });
        if (!content && !req.file && !mediaIntentId) return res.status(400).json({ error: "Add text or choose an image/video" });

        let mediaKey = null;
        let mediaUrl = null;
        let mediaType = null;
        let mediaMime = null;
        let mediaSizeBytes = null;
        const statusId = uuidv4();

        if (mediaIntentId) {
          const claimed = await claimCompletedMediaUploadIntent({
            id: mediaIntentId,
            userAddress: req.userAddress,
            category: "status",
            attachmentId: statusId,
          });
          if (!claimed) return res.status(409).json({ error: "This verified upload is unavailable, already attached, or not a completed status upload" });
          claimedIntentId = mediaIntentId;
          claimedStatusId = statusId;
          mediaKey = claimed.objectKey;
          mediaUrl = r2MediaUrl(mediaKey);
          mediaType = claimed.mediaType;
          mediaMime = claimed.contentType;
          mediaSizeBytes = claimed.sizeBytes;
        } else if (req.file) {
          mediaMime = (req.file.mimetype || "").toLowerCase();
          const sniffed = sniffMime(req.file.buffer);
          const declaredType = detectMediaType(mediaMime);
          const detectedType = detectMediaType(sniffed);
          mediaType = declaredType || detectedType;
          if (!mediaType) return res.status(400).json({ error: "We couldn't recognize that file. Please choose an image, MP4, or WebM video." });
          if (declaredType && detectedType && declaredType !== detectedType) return res.status(400).json({ error: "The selected file type doesn't match its contents. Please choose another file." });
          if (sniffed && !["image/", "video/"].some((prefix) => sniffed.startsWith(prefix))) return res.status(400).json({ error: "The uploaded file does not appear to be an image or video" });
          if (!declaredType && detectedType) mediaMime = sniffed;

          const maxBytes = mediaType === "video" ? req.membershipPlan.maxVideoBytes : req.membershipPlan.maxImageBytes;
          if (req.file.size > maxBytes) {
            const maxMiB = Math.floor(maxBytes / (1024 * 1024));
            return res.status(413).json({ error: `Your ${req.membershipPlan.name} plan allows status ${mediaType} files up to ${maxMiB} MiB`, code: "MEMBERSHIP_MEDIA_SIZE_LIMIT", planId: req.membershipPlan.id, maxBytes });
          }
          if (mediaType === "video") {
            const durationSeconds = parseVideoDurationSeconds(mediaMime, [req.file.buffer]);
            if (!Number.isFinite(durationSeconds)) return res.status(422).json({ error: "Could not verify video duration. Please choose a supported MP4, MOV, or WebM video.", code: "VIDEO_DURATION_UNVERIFIABLE" });
            if (durationSeconds > 180) return res.status(422).json({ error: "Status videos must be 3 minutes (180 seconds) or shorter.", code: "STATUS_VIDEO_DURATION_LIMIT", durationSeconds: Math.ceil(durationSeconds), maxDurationSeconds: 180 });
          }
          const ext = mediaMime.split("/")[1]?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || (mediaType === "video" ? "mp4" : "jpg");
          mediaKey = `statuses/${req.userAddress}/${uuidv4()}.${ext}`;
          const uploaded = await uploadToR2(mediaKey, req.file.buffer, mediaMime);
          mediaUrl = uploaded.url;
          mediaSizeBytes = req.file.size;
        }

        const status = await createStatus({ id: statusId, owner: req.userAddress, content, mediaKey, mediaUrl, mediaType, mediaMime, audience });
        if (mediaKey && req.file) {
          try {
            await recordMediaUsage({ id: uuidv4(), userAddress: req.userAddress, objectKey: mediaKey, category: "status", mediaType, sizeBytes: mediaSizeBytes });
          } catch (usageErr) {
            console.error("[membership] status media usage recording failed:", usageErr);
          }
        }
        res.status(201).json({ status });
      } catch (err) {
        if (claimedIntentId && claimedStatusId) {
          await releaseMediaUploadIntentClaim({ id: claimedIntentId, userAddress: req.userAddress, attachmentId: claimedStatusId }).catch((releaseError) => {
            console.error("[media-upload] failed to release status intent claim:", releaseError.message);
          });
        }
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
    resolveMembershipPlan,
    upload.single("media"),
    async (req, res) => {
      let claimedIntentId = null;
      let claimedPostId = null;
      try {
        const title = normalizeTextInput(req.body?.title);
        const content = normalizeTextInput(req.body?.content);
        if (!title || !content)
          return res.status(400).json({ error: "title and content required" });
        if (title.length > POST_TITLE_MAX_LENGTH)
          return res.status(400).json({ error: tooLongError("title", POST_TITLE_MAX_LENGTH) });
        if (content.length > POST_CONTENT_MAX_LENGTH)
          return res.status(400).json({ error: tooLongError("content", POST_CONTENT_MAX_LENGTH) });

        const effectiveOwner = req.userAddress;
        const mediaIntentId = typeof req.body?.mediaIntentId === "string"
          ? req.body.mediaIntentId.trim()
          : "";
        if (req.file && mediaIntentId) {
          return res.status(400).json({ error: "Send either a buffered media file or a verified media intent, not both" });
        }

        let mediaKey = null, mediaUrl = null, mediaType = null, mediaMime = null;
        if (mediaIntentId) {
          if (process.env.ENABLE_DIRECT_R2_UPLOADS !== "true") {
            return res.status(503).json({ error: "Direct uploads are not enabled yet" });
          }
          if (!/^[0-9a-f-]{36}$/i.test(mediaIntentId)) {
            return res.status(400).json({ error: "Invalid media upload intent ID" });
          }
          claimedPostId = uuidv4();
          const claimed = await claimCompletedMediaUploadIntent({
            id: mediaIntentId,
            userAddress: effectiveOwner,
            category: "post",
            attachmentId: claimedPostId,
          });
          if (!claimed) {
            return res.status(409).json({ error: "This verified upload is unavailable, already attached, or not a completed post upload" });
          }
          claimedIntentId = mediaIntentId;
          mediaKey = claimed.objectKey;
          mediaUrl = r2MediaUrl(mediaKey);
          mediaType = claimed.mediaType;
          mediaMime = claimed.contentType;
        } else if (req.file) {
          mediaMime = req.file.mimetype;
          mediaType = detectMediaType(mediaMime);
          if (!mediaType)
            return res.status(400).json({ error: "Only image/* or video/* media is allowed" });
          const sniffed = sniffMime(req.file.buffer);
          if (sniffed && !["image/", "video/"].some((p) => sniffed.startsWith(p))) {
            return res.status(400).json({ error: "Only image/* or video/* media is allowed" });
          }
          const maxBytes = mediaType === "video"
            ? req.membershipPlan.maxVideoBytes
            : req.membershipPlan.maxImageBytes;
          if (req.file.size > maxBytes) {
            const maxMiB = Math.floor(maxBytes / (1024 * 1024));
            return res.status(413).json({
              error: `Your ${req.membershipPlan.name} plan allows post ${mediaType} files up to ${maxMiB} MiB`,
              code: "MEMBERSHIP_MEDIA_SIZE_LIMIT",
              planId: req.membershipPlan.id,
              maxBytes,
            });
          }
          const ext = mediaMime.split("/")[1]?.replace("+xml", "") || "bin";
          mediaKey = `posts/${uuidv4()}.${ext}`;
          const r2 = await uploadToR2(mediaKey, req.file.buffer, mediaMime);
          mediaUrl = r2.url;
        }

        const postId = claimedPostId || uuidv4();
        const saved = await savePost({
          id: postId,
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
        if (mediaKey && req.file) {
          try {
            await recordMediaUsage({
              id: uuidv4(),
              userAddress: effectiveOwner,
              objectKey: mediaKey,
              category: "post",
              mediaType,
              sizeBytes: req.file.size,
            });
          } catch (usageErr) {
            console.error("[membership] post media usage recording failed:", usageErr);
          }
        }
        res.json(saved);
      } catch (err) {
        if (claimedIntentId && claimedPostId) {
          await releaseMediaUploadIntentClaim({
            id: claimedIntentId,
            userAddress: req.userAddress,
            attachmentId: claimedPostId,
          }).catch((releaseError) => {
            console.error("[media-upload] failed to release intent claim:", releaseError.message);
          });
        }
        console.error("create_post error:", err);
        res.status(500).json({ error: err.message || "Failed to create post" });
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

      // Posts use soft deletion so feeds can hide them immediately and the
      // database can retain its existing moderation/history behavior. R2
      // objects, however, must not remain orphaned after their last reference
      // is removed. Only delete keys generated by the post-media pipeline.
      let mediaDeleted = false;
      let mediaCleanupPending = false;
      const mediaKey = typeof post.mediaBlobId === "string" ? post.mediaBlobId : "";
      if (/^posts\/[a-zA-Z0-9_./-]+$/.test(mediaKey) && !mediaKey.includes("..")) {
        const { rows: references } = await pool.query(
          "SELECT 1 FROM posts WHERE media_blob_id = $1 AND id <> $2 AND is_deleted = false LIMIT 1",
          [mediaKey, req.params.id],
        );
        // A media object may only be removed when no other live post points
        // to it. This also protects against accidental shared-media deletion.
        if (references.length === 0) {
          try {
            await deleteFromR2(mediaKey);
            await markMediaUsageDeleted(mediaKey);
            mediaDeleted = true;
          } catch (cleanupError) {
            mediaCleanupPending = true;
            console.error("[post-delete] R2 media cleanup failed:", {
              postId: req.params.id,
              error: cleanupError.message,
            });
          }
        }
      }
      res.json({ success: true, mediaDeleted, mediaCleanupPending });
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
        const previousProfile = await getProfile(effectiveAddress);
        const profile = await saveProfile(effectiveAddress, update);

        // Replaced profile images are no longer referenced by the profile.
        // Delete them immediately; persist failures for the cron retry worker.
        const getManagedKey = (value, folder) => {
          if (typeof value !== "string" || !value) return null;
          try {
            const pathname = new URL(value).pathname;
            const marker = `/${folder}/`;
            const index = pathname.indexOf(marker);
            return index >= 0 ? pathname.slice(index + 1) : null;
          } catch {
            return value.startsWith(`${folder}/`) ? value : null;
          }
        };
        const replacedProfileMedia = [
          {
            key: getManagedKey(previousProfile?.avatarUrl, "avatars"),
            nextKey: req.files?.avatar?.[0]
              ? update.avatarBlobId
              : getManagedKey(previousProfile?.avatarUrl, "avatars"),
            category: "avatar",
          },
          {
            key: getManagedKey(previousProfile?.bannerUrl, "banners"),
            nextKey: req.files?.banner?.[0]
              ? update.bannerBlobId
              : getManagedKey(previousProfile?.bannerUrl, "banners"),
            category: "banner",
          },
        ];
        for (const item of replacedProfileMedia) {
          if (!item.key || item.key === item.nextKey) continue;
          try {
            await deleteFromR2(item.key);
            await markMediaUsageDeleted(item.key);
          } catch (cleanupError) {
            try {
              await enqueueMediaDeletion({
                objectKey: item.key,
                userAddress: effectiveAddress,
                category: item.category,
              });
            } catch (queueError) {
              console.error("[profile-media] cleanup and retry scheduling failed:", cleanupError.message, queueError.message);
            }
          }
        }

        for (const item of [
          { file: req.files?.avatar?.[0], key: update.avatarBlobId, category: "avatar" },
          { file: req.files?.banner?.[0], key: update.bannerBlobId, category: "banner" },
        ]) {
          if (!item.file || !item.key) continue;
          try {
            await recordMediaUsage({
              id: uuidv4(),
              userAddress: effectiveAddress,
              objectKey: item.key,
              category: item.category,
              mediaType: "image",
              sizeBytes: item.file.size,
            });
          } catch (usageErr) {
            console.error(`[membership] ${item.category} media usage recording failed:`, usageErr);
          }
        }
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
      // Existing Firebase subscriptions must lose access as soon as a block is
      // created. New membership requests also check the block relationship.
      await revokeFirebaseConversationMembers(req.userAddress, target);
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
      await writeFirebasePresence(req.userAddress);
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
      const replyToMessageId = normalizeTextInput(req.body?.replyToMessageId);
      if (!receiver || !content) return res.status(400).json({ error: "receiver and content required" });
      if (content.length > MESSAGE_CONTENT_MAX_LENGTH) return res.status(400).json({ error: tooLongError("content", MESSAGE_CONTENT_MAX_LENGTH) });
      const sender = req.userAddress;
      if (receiver === sender) return res.status(400).json({ error: "You cannot message yourself" });
      const receiverExists = await pool.query("SELECT 1 FROM users WHERE address = $1 LIMIT 1", [receiver]);
      if (!receiverExists.rowCount) return res.status(404).json({ error: "User not found" });
      if (await isBlockedEitherWay(sender, receiver)) return res.status(403).json({ error: "This conversation is unavailable because one of these users has blocked the other" });
      if (replyToMessageId) {
        const target = await pool.query(
          "SELECT id FROM messages WHERE id = $1 AND deleted_at IS NULL AND ((sender = $2 AND receiver = $3) OR (sender = $3 AND receiver = $2)) LIMIT 1",
          [replyToMessageId, sender, receiver],
        );
        if (!target.rowCount) return res.status(400).json({ error: "The message you are replying to is unavailable" });
      }
      const message = await saveMessage({ id: uuidv4(), sender, receiver, content, replyToMessageId: replyToMessageId || null, createdAt: new Date().toISOString() });
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
      await publishMessageToFirebase(message);
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
      const attachmentKey = existing.rows[0].attachment_key;
      const message = await deleteMessageForEveryone(req.params.id, req.userAddress);
      if (!message) return res.status(409).json({ error: "This message has already been deleted" });
      let attachmentCleanupPending = false;
      if (attachmentKey) {
        try {
          await deleteFromR2(attachmentKey);
          await markMediaUsageDeleted([attachmentKey]);
        } catch (cleanupError) {
          attachmentCleanupPending = true;
          try {
            await enqueueMediaDeletion({
              objectKey: attachmentKey,
              userAddress: req.userAddress,
              category: "message",
            });
          } catch (queueError) {
            console.error("[message-media] cleanup retry scheduling failed:", cleanupError.message, queueError.message);
          }
        }
      }
      await publishMessageToFirebase(message);
      res.json({ ...message, attachmentCleanupPending });
    } catch (err) {
      console.error("delete_message error:", err);
      res.status(500).json({ error: "Could not delete message" });
    }
  });

  const allowedMessageReactionEmojis = new Set(["👍", "❤️", "😂", "😮", "😢", "🔥"]);
  app.post("/api/message/:id/reaction", requireAuth, async (req, res) => {
    try {
      const messageId = String(req.params.id || "");
      const emoji = String(req.body?.emoji || "");
      if (!allowedMessageReactionEmojis.has(emoji)) {
        return res.status(400).json({ error: "Choose a supported reaction" });
      }
      const sender = req.userAddress;
      const found = await pool.query(
        "SELECT id, sender, receiver, deleted_at FROM messages WHERE id = $1 AND (sender = $2 OR receiver = $2) LIMIT 1",
        [messageId, sender],
      );
      if (!found.rowCount || found.rows[0].deleted_at) {
        return res.status(404).json({ error: "Message not found or unavailable" });
      }
      const messageRow = found.rows[0];
      const otherAddress = messageRow.sender === sender ? messageRow.receiver : messageRow.sender;
      if (await isBlockedEitherWay(sender, otherAddress)) {
        return res.status(403).json({ error: "This conversation is unavailable because one of these users has blocked the other" });
      }
      const current = await pool.query(
        "SELECT emoji FROM message_reactions WHERE message_id = $1 AND user_address = $2 LIMIT 1",
        [messageId, sender],
      );
      if (current.rows[0]?.emoji === emoji) {
        await pool.query("DELETE FROM message_reactions WHERE message_id = $1 AND user_address = $2", [messageId, sender]);
      } else {
        await pool.query(
          "INSERT INTO message_reactions (message_id, user_address, emoji) VALUES ($1, $2, $3) ON CONFLICT (message_id, user_address) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = NOW()",
          [messageId, sender, emoji],
        );
      }
      const result = await pool.query(
        `SELECT m.*,
          COALESCE((SELECT json_agg(json_build_object('emoji', mr.emoji, 'userAddress', mr.user_address) ORDER BY mr.created_at)
                    FROM message_reactions mr WHERE mr.message_id = m.id), '[]'::json) AS reactions
         FROM messages m WHERE m.id = $1 LIMIT 1`,
        [messageId],
      );
      const message = rowToMessage(result.rows[0]);
      publishMessageToFirebase(message);
      res.json(message);
    } catch (err) {
      console.error("message_reaction error:", err);
      res.status(500).json({ error: "Could not update message reaction" });
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
      const replyToMessageId = normalizeTextInput(req.body?.replyToMessageId);
      const file = req.file;
      if (!receiver || !file) return res.status(400).json({ error: "receiver and file are required" });
      if (content.length > MESSAGE_CONTENT_MAX_LENGTH) return res.status(400).json({ error: tooLongError("content", MESSAGE_CONTENT_MAX_LENGTH) });
      const sender = req.userAddress;
      if (receiver === sender) return res.status(400).json({ error: "You cannot message yourself" });
      const receiverExists = await pool.query("SELECT 1 FROM users WHERE address = $1 LIMIT 1", [receiver]);
      if (!receiverExists.rowCount) return res.status(404).json({ error: "User not found" });
      if (await isBlockedEitherWay(sender, receiver)) return res.status(403).json({ error: "This conversation is unavailable because one of these users has blocked the other" });
      if (replyToMessageId) {
        const target = await pool.query(
          "SELECT id FROM messages WHERE id = $1 AND deleted_at IS NULL AND ((sender = $2 AND receiver = $3) OR (sender = $3 AND receiver = $2)) LIMIT 1",
          [replyToMessageId, sender, receiver],
        );
        if (!target.rowCount) return res.status(400).json({ error: "The message you are replying to is unavailable" });
      }
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
        attachmentMime: mimeType, attachmentSize: file.size, replyToMessageId: replyToMessageId || null, createdAt: new Date().toISOString(),
      });
      try {
        const mediaType = mimeType.startsWith("image/")
          ? "image"
          : mimeType.startsWith("audio/")
            ? "audio"
            : "other";
        await recordMediaUsage({
          id: uuidv4(),
          userAddress: sender,
          objectKey: stored.key,
          category: "message",
          mediaType,
          sizeBytes: file.size,
        });
      } catch (usageErr) {
        console.error("[membership] message attachment usage recording failed:", usageErr);
      }
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

  async function publishMessageToFirebase(message) {
    if (await isBlockedEitherWay(message.sender, message.receiver)) return false;
    const membersReady = await ensureFirebaseConversationMembers(
      message.sender,
      message.receiver,
    );
    if (!membersReady) return false;
    return firebaseWrite(
      `conversations/${fbConvId(message.sender, message.receiver)}/messages/${message.id}`,
      {
        id: message.id, sender: message.sender, receiver: message.receiver, content: message.content || "",
        createdAt: message.createdAt, readAt: message.readAt || null,
        attachmentUrl: message.attachmentUrl || null, attachmentKey: message.attachmentKey || null,
        attachmentName: message.attachmentName || null, attachmentMime: message.attachmentMime || null,
        attachmentSize: message.attachmentSize || null,
        editedAt: message.editedAt || null, deletedAt: message.deletedAt || null, replyToMessageId: message.replyToMessageId || null,
        ...(Array.isArray(message.reactions) ? { reactions: message.reactions } : {}),
      },
    );
  }

  async function notifyMessageReceiver(receiver, sender, content) {
    if (receiver === sender) return;
    const preview = String(content || "Sent an attachment");
    await createNotificationAndPush({ recipient: receiver, type: "message", actorAddress: sender, excerpt: preview.slice(0, 80) });
    fireEmailNotif({ type: "message", recipientAddress: receiver, actorAddress: sender, extra: { messagePreview: preview.slice(0, 200) } });
  }

  // Prepare realtime membership for inbox/chat listeners. The helper only
  // grants membership in conversation IDs that include the verified caller.
  app.post("/api/conversations/realtime", requireAuth, async (req, res) => {
    try {
      const rawAddresses = req.body?.otherAddresses;
      if (!Array.isArray(rawAddresses)) {
        return res.status(400).json({ error: "otherAddresses must be an array" });
      }
      if (rawAddresses.length > 100) {
        return res.status(400).json({ error: "No more than 100 conversations can be prepared at once" });
      }
      const addresses = [...new Set(rawAddresses
        .filter((address) => typeof address === "string")
        .map((address) => address.trim())
        .filter((address) => address && address !== req.userAddress))];
      const allowedAddresses = [];
      for (const address of addresses) {
        if (!(await isBlockedEitherWay(req.userAddress, address))) {
          allowedAddresses.push(address);
        }
      }
      const ok = await ensureFirebaseConversationMemberships(req.userAddress, allowedAddresses);
      if (!ok) {
        return res.status(503).json({ error: "Realtime conversation access is temporarily unavailable" });
      }
      res.set("Cache-Control", "private, no-store");
      res.json({
        ok: true,
        prepared: allowedAddresses.length,
        skipped: addresses.length - allowedAddresses.length,
      });
    } catch (err) {
      console.error("prepare_realtime_conversations error:", err);
      res.status(500).json({ error: "Could not prepare realtime conversations" });
    }
  });

  app.get("/api/conversations/pinned", requireAuth, async (req, res) => {
    try {
      const pinned = await getPinnedConversations(req.userAddress);
      res.set("Cache-Control", "private, no-store");
      res.json({ pinned });
    } catch (err) {
      console.error("get_pinned_conversations error:", err);
      res.status(500).json({ error: "Failed to load pinned conversations" });
    }
  });

  app.put("/api/conversation/pin", requireAuth, async (req, res) => {
    try {
      const otherAddress = normalizeTextInput(req.body?.otherAddress);
      if (!otherAddress || otherAddress === req.userAddress) {
        return res.status(400).json({ error: "A valid conversation partner is required" });
      }
      if (await isBlockedEitherWay(req.userAddress, otherAddress)) {
        return res.status(403).json({ error: "This conversation is unavailable because one of these users has blocked the other" });
      }
      const pinned = req.body?.pinned;
      if (typeof pinned !== "boolean") {
        return res.status(400).json({ error: "pinned must be a boolean" });
      }
      const result = await setConversationPinned(req.userAddress, otherAddress, pinned);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("set_conversation_pinned error:", err);
      res.status(500).json({ error: "Failed to update pinned conversation" });
    }
  });

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
      await ensureFirebaseConversationMembers(String(a), String(b));
      const requestedLimit = Number.parseInt(req.query.limit, 10) || 100;
      const beforeCreatedAt = typeof req.query.beforeCreatedAt === "string" ? req.query.beforeCreatedAt : null;
      const beforeId = typeof req.query.beforeId === "string" ? req.query.beforeId : null;
      if ((beforeCreatedAt && !beforeId) || (!beforeCreatedAt && beforeId))
        return res.status(400).json({ error: "beforeCreatedAt and beforeId must be supplied together" });
      const page = await getConversation(a, b, {
        limit: Math.min(100, Math.max(1, requestedLimit)),
        beforeCreatedAt,
        beforeId,
      });
      res.set("Cache-Control", "private, no-store");
      res.json(page);
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
        await ensureFirebaseConversationMembers(req.userAddress, otherAddress);
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
      await ensureFirebaseConversationMembers(req.userAddress, otherAddress);

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
