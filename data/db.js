import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { v4 as uuidv4 } from "uuid";
import { r2MediaUrl } from "../services/r2.service.js";

neonConfig.webSocketConstructor = ws;

const connectionString =
  process.env.NEON_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "";

if (!connectionString) {
  throw new Error(
    "Database connection string is missing. Set NEON_DATABASE_URL or DATABASE_URL in Vercel."
  );
}

export const pool = new Pool({ connectionString });

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  username        TEXT UNIQUE NOT NULL,
  email           TEXT UNIQUE,
  password_hash   TEXT NOT NULL,
  address         TEXT UNIQUE NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rate_limit_events (
  id              SERIAL PRIMARY KEY,
  bucket_key      TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_key_time
  ON rate_limit_events (bucket_key, created_at);

CREATE TABLE IF NOT EXISTS password_resets (
  id              SERIAL PRIMARY KEY,
  email           TEXT NOT NULL,
  code_hash       TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_resets_email ON password_resets (LOWER(email));

CREATE TABLE IF NOT EXISTS push_tokens (
  id              SERIAL PRIMARY KEY,
  user_address    TEXT NOT NULL,
  token           TEXT NOT NULL,
  platform        TEXT DEFAULT 'unknown',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_address, token)
);

CREATE TABLE IF NOT EXISTS profiles (
  address         TEXT PRIMARY KEY,
  username        TEXT NOT NULL,
  bio             TEXT DEFAULT '',
  display_name    TEXT DEFAULT '',
  avatar_blob_id  TEXT,
  avatar_url      TEXT,
  banner_blob_id  TEXT,
  banner_url      TEXT,
  website         TEXT DEFAULT '',
  location        TEXT DEFAULT '',
  twitter         TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS posts (
  id              TEXT PRIMARY KEY,
  media_blob_id   TEXT,
  media_url       TEXT,
  media_type      TEXT,
  media_mime      TEXT,
  owner           TEXT NOT NULL,
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  is_deleted      BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS likes (
  id          TEXT PRIMARY KEY,
  post_id     TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  owner       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, owner)
);

CREATE TABLE IF NOT EXISTS comments (
  id          TEXT PRIMARY KEY,
  post_id     TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  owner       TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, sender TEXT NOT NULL, receiver TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW(), read_at TIMESTAMPTZ,
  attachment_url TEXT, attachment_key TEXT, attachment_name TEXT, attachment_mime TEXT, attachment_size BIGINT,
  edited_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ, reply_to_message_id TEXT
);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_message_id TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_key TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_name TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_mime TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_size BIGINT;
ALTER TABLE messages ALTER COLUMN content SET DEFAULT '';

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_address TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_address)
);
CREATE INDEX IF NOT EXISTS idx_message_reactions_message
  ON message_reactions (message_id, created_at);

CREATE TABLE IF NOT EXISTS conversation_preferences (
  owner_address TEXT NOT NULL,
  other_address TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_address, other_address),
  CHECK (owner_address <> other_address)
);
CREATE INDEX IF NOT EXISTS idx_conversation_preferences_pinned
  ON conversation_preferences (owner_address, is_pinned);

CREATE TABLE IF NOT EXISTS message_typing (
  sender      TEXT NOT NULL,
  receiver    TEXT NOT NULL,
  is_typing   BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sender, receiver)
);
ALTER TABLE message_typing ADD COLUMN IF NOT EXISTS is_typing BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_message_typing_receiver
  ON message_typing (receiver, updated_at DESC);

CREATE TABLE IF NOT EXISTS follows (
  follower    TEXT NOT NULL,
  following   TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower, following)
);

CREATE TABLE IF NOT EXISTS blocked_users (
  blocker     TEXT NOT NULL,
  blocked     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker, blocked),
  CHECK (blocker <> blocked)
);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users (blocked);

CREATE TABLE IF NOT EXISTS reports (
  id              TEXT PRIMARY KEY,
  post_id         TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reporter        TEXT NOT NULL,
  reason          TEXT NOT NULL,
  description     TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, reporter)
);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS target_address TEXT;
ALTER TABLE reports ALTER COLUMN post_id DROP NOT NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS triage_priority TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS escalated_by TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS escalation_note TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_target_reporter ON reports (target_address, reporter) WHERE target_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_priority_status_created ON reports (triage_priority, moderation_status, created_at DESC);
UPDATE reports
SET triage_priority = CASE
  WHEN LOWER(reason) IN ('child-safety', 'violence') THEN 'critical'
  WHEN LOWER(reason) IN ('harassment', 'hate') THEN 'urgent'
  ELSE 'standard'
END
WHERE triage_priority = 'standard'
  AND LOWER(reason) IN ('child-safety', 'violence', 'harassment', 'hate');
UPDATE reports
SET escalated_at = COALESCE(escalated_at, created_at),
    escalation_note = COALESCE(escalation_note, 'Automatically prioritized for urgent human review from the report reason.')
WHERE triage_priority IN ('critical', 'urgent') AND escalated_at IS NULL;

CREATE TABLE IF NOT EXISTS statuses (
  id              TEXT PRIMARY KEY,
  owner           TEXT NOT NULL,
  content         TEXT DEFAULT '',
  media_key       TEXT,
  media_url       TEXT,
  media_type      TEXT,
  media_mime      TEXT,
  audience        TEXT NOT NULL DEFAULT 'followers' CHECK (audience IN ('everyone', 'followers')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_statuses_active_owner
  ON statuses (owner, expires_at, created_at DESC);

CREATE TABLE IF NOT EXISTS status_views (
  status_id       TEXT NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
  viewer          TEXT NOT NULL,
  viewed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (status_id, viewer)
);
CREATE INDEX IF NOT EXISTS idx_status_views_viewer ON status_views (viewer, viewed_at DESC);

CREATE TABLE IF NOT EXISTS reel_watch_sessions (
  session_id      TEXT PRIMARY KEY,
  post_id         TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  viewer          TEXT NOT NULL,
  watched_ms      INTEGER NOT NULL DEFAULT 0 CHECK (watched_ms >= 0),
  duration_ms     INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  completed       BOOLEAN NOT NULL DEFAULT FALSE,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reel_watch_viewer_updated
  ON reel_watch_sessions (viewer, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_reel_watch_post
  ON reel_watch_sessions (post_id);

CREATE TABLE IF NOT EXISTS notifications (
  id            TEXT PRIMARY KEY,
  recipient     TEXT NOT NULL,
  type          TEXT NOT NULL,
  actor_address TEXT NOT NULL,
  post_id       TEXT,
  excerpt       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  read_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_posts_owner    ON posts(owner);
CREATE INDEX IF NOT EXISTS idx_posts_created  ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_feed_cursor ON posts (created_at DESC, id DESC) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_likes_post     ON likes(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_post  ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_messages_pair  ON messages(sender, receiver);
CREATE INDEX IF NOT EXISTS idx_follows_follower   ON follows(follower);
CREATE INDEX IF NOT EXISTS idx_follows_following  ON follows(following);
CREATE INDEX IF NOT EXISTS idx_notifications_rec  ON notifications(recipient, created_at DESC);

CREATE TABLE IF NOT EXISTS presence (
  address      TEXT PRIMARY KEY,
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_by TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS restored_by TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profession TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS moderation_audit_log (
  id TEXT PRIMARY KEY,
  actor_address TEXT NOT NULL,
  action TEXT NOT NULL,
  target_address TEXT,
  report_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_moderation_audit_created ON moderation_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_audit_target ON moderation_audit_log (target_address, created_at DESC);

CREATE TABLE IF NOT EXISTS moderation_alert_deliveries (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  priority TEXT NOT NULL CHECK (priority IN ('critical')),
  delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  UNIQUE (report_id, priority)
);
CREATE INDEX IF NOT EXISTS idx_moderation_alerts_status_updated
  ON moderation_alert_deliveries (delivery_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS moderation_incidents (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL UNIQUE REFERENCES reports(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'in_progress', 'escalated', 'resolved')),
  assigned_to TEXT,
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  last_updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_moderation_incidents_status_updated
  ON moderation_incidents (status, updated_at DESC);

INSERT INTO moderation_incidents (id, report_id, status, created_at, updated_at)
SELECT gen_random_uuid()::text, r.id, 'open', NOW(), NOW()
FROM reports r
WHERE r.triage_priority = 'critical'
ON CONFLICT (report_id) DO NOTHING;



`;

// ─── Row → object mapping ────────────────────────────────────────────────────
function rowToPost(r) {
  if (!r) return null;

  const isR2Key =
    typeof r.media_blob_id === "string" &&
    /^posts\//.test(r.media_blob_id);

  return {
    id: r.id,
    mediaBlobId: r.media_blob_id,
    mediaUrl: isR2Key ? r2MediaUrl(r.media_blob_id) : r.media_url,
    mediaType: r.media_type,
    mediaMime: r.media_mime,
    owner: r.owner,
    title: r.title,
    content: r.content,
    isDeleted: r.is_deleted,
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  };
}

function rowToProfile(r) {
  if (!r) return null;

  const r2KeyFromValue = (value, folder) => {
    if (typeof value !== "string" || !value) return null;
    if (new RegExp(`^${folder}/`).test(value)) return value;

    try {
      const url = new URL(value);
      const marker = `/${folder}/`;
      const index = url.pathname.indexOf(marker);
      if (index !== -1) return url.pathname.slice(index + 1);
    } catch {}

    return null;
  };

  const avatarKey =
    r2KeyFromValue(r.avatar_blob_id, "avatars") ||
    r2KeyFromValue(r.avatar_url, "avatars");
  const bannerKey =
    r2KeyFromValue(r.banner_blob_id, "banners") ||
    r2KeyFromValue(r.banner_url, "banners");

  return {
    address: r.address,
    username: r.username,
    bio: r.bio || "",
    displayName: r.display_name || "",
    avatarUrl: avatarKey ? r2MediaUrl(avatarKey) : null,
    bannerUrl: bannerKey ? r2MediaUrl(bannerKey) : null,
    website: r.website || "",
    location: r.location || "",
    twitter: r.twitter || "",
    profession: r.profession || "",
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  };
}

function rowToComment(r) {
  if (!r) return null;
  return {
    id: r.id,
    postId: r.post_id,
    owner: r.owner,
    content: r.content,
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  };
}

function rowToLike(r) {
  if (!r) return null;
  return {
    id: r.id,
    postId: r.post_id,
    owner: r.owner,
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  };
}

export function rowToMessage(r) {
  if (!r) return null;
  return {
    id: r.id,
    sender: r.sender,
    receiver: r.receiver,
    content: r.content || "",
    attachmentUrl: r.attachment_url || null, attachmentKey: r.attachment_key || null,
    attachmentName: r.attachment_name || null, attachmentMime: r.attachment_mime || null,
    attachmentSize: r.attachment_size == null ? null : Number(r.attachment_size),
    editedAt: r.edited_at ? (r.edited_at instanceof Date ? r.edited_at.toISOString() : r.edited_at) : null,
    deletedAt: r.deleted_at ? (r.deleted_at instanceof Date ? r.deleted_at.toISOString() : r.deleted_at) : null,
    replyToMessageId: r.reply_to_message_id || null,
    reactions: Array.isArray(r.reactions) ? r.reactions : (typeof r.reactions === "string" ? JSON.parse(r.reactions || "[]") : []),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    readAt: r.read_at
      ? r.read_at instanceof Date
        ? r.read_at.toISOString()
        : r.read_at
      : null,
  };
}

function rowToUser(r) {
  if (!r) return null;
  return {
    id: r.id,
    username: r.username,
    email: r.email,
    passwordHash: r.password_hash,
    address: r.address,
    emailVerified: !!r.email_verified_at,
    emailVerifyToken: r.email_verify_token,
    accountStatus: r.account_status || "active",
    suspendedAt: r.suspended_at || null,
    suspensionReason: r.suspension_reason || null,
    suspendedBy: r.suspended_by || null,
    restoredAt: r.restored_at || null,
    restoredBy: r.restored_by || null,
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  };
}

function rowToNotification(r) {
  if (!r) return null;
  return {
    id: r.id,
    recipient: r.recipient,
    type: r.type,
    actorAddress: r.actor_address,
    postId: r.post_id,
    excerpt: r.excerpt,
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    readAt: r.read_at
      ? r.read_at instanceof Date
        ? r.read_at.toISOString()
        : r.read_at
      : null,
  };
}

// ─── Posts ───────────────────────────────────────────────────────────────────
export async function getPostsPage({ limit = 20, beforeCreatedAt = null, beforeId = null, viewer = null } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 51);
  const { rows } = await pool.query(
    `SELECT *
     FROM posts
     WHERE is_deleted = false
       AND (
         $1::timestamptz IS NULL
         OR (created_at, id) < ($1::timestamptz, $2::text)
       )
       AND ($4::text IS NULL OR NOT EXISTS (SELECT 1 FROM blocked_users b WHERE (b.blocker = $4 AND b.blocked = posts.owner) OR (b.blocker = posts.owner AND b.blocked = $4)))
     ORDER BY created_at DESC, id DESC
     LIMIT $3`,
    [beforeCreatedAt, beforeId, safeLimit, viewer],
  );
  return rows.map(rowToPost);
}

// Relevance-ranked Home feed. Fresh posts lead, meaningful engagement helps,
// and followed creators receive a modest boost. Latest remains chronological.
export async function getRankedPostsPage({ viewer = null, limit = 20, beforeScore = null, beforeCreatedAt = null, beforeId = null } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 51);
  const { rows } = await pool.query(
    `WITH engagement AS (
       SELECT p.id AS post_id,
         COUNT(DISTINCT l.id)::int AS likes,
         COUNT(DISTINCT c.id)::int AS comment_count
       FROM posts p
       LEFT JOIN likes l ON l.post_id = p.id
       LEFT JOIN comments c ON c.post_id = p.id
       WHERE p.is_deleted = false
       GROUP BY p.id
     ), ranked AS (
       SELECT p.*, COALESCE(e.likes, 0)::int AS likes,
         COALESCE(e.comment_count, 0)::int AS comment_count,
         (45.0 * EXP(-GREATEST(EXTRACT(EPOCH FROM (NOW() - p.created_at)), 0) / 172800.0)
          + 7.0 * LN(1.0 + COALESCE(e.likes, 0))
          + 11.0 * LN(1.0 + COALESCE(e.comment_count, 0))
          + CASE WHEN EXISTS (SELECT 1 FROM follows f WHERE f.follower = $1 AND f.following = p.owner) THEN 16.0 ELSE 0.0 END
          + CASE WHEN p.owner = $1 THEN 5.0 ELSE 0.0 END) AS feed_score
       FROM posts p
       LEFT JOIN engagement e ON e.post_id = p.id
       WHERE p.is_deleted = false
          AND ($1::text IS NULL OR NOT EXISTS (SELECT 1 FROM blocked_users b WHERE (b.blocker = $1 AND b.blocked = p.owner) OR (b.blocker = p.owner AND b.blocked = $1)))
     )
     SELECT * FROM ranked
     WHERE $2::double precision IS NULL
        OR (feed_score, created_at, id) < ($2::double precision, $3::timestamptz, $4::text)
     ORDER BY feed_score DESC, created_at DESC, id DESC
     LIMIT $5`,
    [viewer, beforeScore, beforeCreatedAt, beforeId, safeLimit],
  );
  return rows.map((row) => ({ ...rowToPost(row), score: Number(row.feed_score) }));
}

// Dedicated video-only feed for the Reels experience.
export async function getReelsPage({ limit = 10, beforeCreatedAt = null, beforeId = null, viewer = null } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 10, 1), 31);
  const { rows } = await pool.query(
    `SELECT *
     FROM posts
     WHERE is_deleted = false
       AND media_type = 'video'
       AND ((media_url IS NOT NULL AND media_url <> '') OR media_blob_id LIKE 'posts/%')
       AND (
         $1::timestamptz IS NULL
         OR (created_at, id) < ($1::timestamptz, $2::text)
       )
        AND ($4::text IS NULL OR NOT EXISTS (SELECT 1 FROM blocked_users b WHERE (b.blocker = $4 AND b.blocked = posts.owner) OR (b.blocker = posts.owner AND b.blocked = $4)))
     ORDER BY created_at DESC, id DESC
     LIMIT $3`,
    [beforeCreatedAt, beforeId, safeLimit, viewer],
  );
  return rows.map(rowToPost);
}

export async function recordReelWatch({ sessionId, postId, viewer, watchedMs, durationMs, completed }) {
  const { rows } = await pool.query(
    `INSERT INTO reel_watch_sessions
       (session_id, post_id, viewer, watched_ms, duration_ms, completed)
     SELECT $1, p.id, $3, $4, $5, $6
     FROM posts p
     WHERE p.id = $2
       AND p.is_deleted = false
       AND p.media_type = 'video'
       AND ((p.media_url IS NOT NULL AND p.media_url <> '') OR p.media_blob_id LIKE 'posts/%')
     ON CONFLICT (session_id) DO UPDATE SET
       watched_ms = GREATEST(reel_watch_sessions.watched_ms, EXCLUDED.watched_ms),
       duration_ms = GREATEST(reel_watch_sessions.duration_ms, EXCLUDED.duration_ms),
       completed = reel_watch_sessions.completed OR EXCLUDED.completed,
       updated_at = NOW()
     WHERE reel_watch_sessions.viewer = EXCLUDED.viewer
       AND reel_watch_sessions.post_id = EXCLUDED.post_id
     RETURNING session_id, watched_ms, duration_ms, completed`,
    [sessionId, postId, viewer, watchedMs, durationMs, completed],
  );
  return rows[0] || null;
}

// Personalized ranking blends freshness, engagement, follows, creator affinity,
// and a penalty for videos the viewer has already watched.
export async function getRankedReelsPage({ viewer = null, limit = 10, beforeScore = null, beforeCreatedAt = null, beforeId = null } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 10, 1), 31);
  const { rows } = await pool.query(
    `WITH engagement AS (
       SELECT p.id AS post_id,
         COUNT(DISTINCT l.id)::int AS likes,
         COUNT(DISTINCT c.id)::int AS comment_count
       FROM posts p
       LEFT JOIN likes l ON l.post_id = p.id
       LEFT JOIN comments c ON c.post_id = p.id
       WHERE p.is_deleted = false AND p.media_type = 'video'
       GROUP BY p.id
     ),
     viewer_post_watch AS (
       SELECT post_id, MAX(watched_ms)::int AS max_watched_ms,
         BOOL_OR(completed) AS completed
       FROM reel_watch_sessions
       WHERE viewer = $1
       GROUP BY post_id
     ),
     creator_affinity AS (
       SELECT p.owner,
         SUM(LEAST(w.watched_ms, 120000))::bigint AS watched_ms,
         COUNT(*) FILTER (WHERE w.completed)::int AS completed_views
       FROM reel_watch_sessions w
       JOIN posts p ON p.id = w.post_id
       WHERE w.viewer = $1
       GROUP BY p.owner
     ),
     watch_performance AS (
       SELECT post_id,
         COUNT(DISTINCT viewer)::int AS unique_viewers,
         SUM(watched_ms)::bigint AS total_watched_ms,
         CASE WHEN COUNT(*) > 0
           THEN COUNT(*) FILTER (WHERE completed)::double precision / COUNT(*)
           ELSE 0.0 END AS completion_rate
       FROM reel_watch_sessions
       GROUP BY post_id
     ),
     base_ranked AS (
       SELECT p.*,
         (
           35.0 * EXP(-GREATEST(EXTRACT(EPOCH FROM (NOW() - p.created_at)), 0) / 259200.0)
           + 4.5 * LN(1.0 + COALESCE(e.likes, 0))
           + 7.0 * LN(1.0 + COALESCE(e.comment_count, 0))
           + CASE WHEN EXISTS (
               SELECT 1 FROM follows f WHERE f.follower = $1 AND f.following = p.owner
             ) THEN 14.0 ELSE 0.0 END
           + LEAST(15.0,
               3.0 * LN(1.0 + COALESCE(ca.watched_ms, 0) / 30000.0)
               + 2.0 * LN(1.0 + COALESCE(ca.completed_views, 0))
             )
           + 2.5 * LN(1.0 + COALESCE(wp.unique_viewers, 0))
           + 3.0 * COALESCE(wp.completion_rate, 0)
           + 1.5 * LN(1.0 + COALESCE(wp.total_watched_ms, 0) / 60000.0)
           + CASE WHEN p.owner = $1 THEN -12.0 ELSE 0.0 END
           + CASE WHEN COALESCE(vw.max_watched_ms, 0) > 0 THEN
               CASE WHEN COALESCE(vw.completed, false) THEN -18.0 ELSE -7.0 END
             ELSE 0.0 END
         )::double precision AS base_score
       FROM posts p
       LEFT JOIN engagement e ON e.post_id = p.id
       LEFT JOIN viewer_post_watch vw ON vw.post_id = p.id
       LEFT JOIN creator_affinity ca ON ca.owner = p.owner
       LEFT JOIN watch_performance wp ON wp.post_id = p.id
       WHERE p.is_deleted = false
         AND p.media_type = 'video'
         AND ((p.media_url IS NOT NULL AND p.media_url <> '') OR p.media_blob_id LIKE 'posts/%')
          AND ($1::text IS NULL OR NOT EXISTS (SELECT 1 FROM blocked_users b WHERE (b.blocker = $1 AND b.blocked = p.owner) OR (b.blocker = p.owner AND b.blocked = $1)))
     ),
     creator_diversity AS (
       SELECT base_ranked.*,
         ROW_NUMBER() OVER (
           PARTITION BY owner
           ORDER BY base_score DESC, created_at DESC, id DESC
         ) AS creator_position
       FROM base_ranked
     ),
     ranked AS (
       SELECT creator_diversity.*,
         (base_score - LEAST(12.0, GREATEST(creator_position - 1, 0) * 2.5))::double precision AS reel_score
       FROM creator_diversity
     )
     SELECT * FROM ranked
     WHERE $2::double precision IS NULL
        OR (reel_score, created_at, id) < ($2::double precision, $3::timestamptz, $4::text)
     ORDER BY reel_score DESC, created_at DESC, id DESC
     LIMIT $5`,
    [viewer, beforeScore, beforeCreatedAt, beforeId, safeLimit],
  );
  return rows.map((row) => ({ ...rowToPost(row), score: Number(row.reel_score) }));
}
export async function getPosts() {
  const { rows } = await pool.query(
    `SELECT * FROM posts WHERE is_deleted = false ORDER BY created_at DESC, id DESC`,
  );
  return rows.map(rowToPost);
}

export async function getFeedEngagement(postIds, viewer = null) {
  if (!Array.isArray(postIds) || postIds.length === 0) return {};

  const { rows } = await pool.query(
    `SELECT
       p.id AS post_id,
       COUNT(DISTINCT l.id)::int AS likes,
       COUNT(DISTINCT c.id)::int AS comment_count,
       COALESCE(BOOL_OR(l.owner = $2), FALSE) AS user_liked
     FROM posts p
     LEFT JOIN likes l ON l.post_id = p.id
     LEFT JOIN comments c ON c.post_id = p.id
     WHERE p.id = ANY($1::text[])
     GROUP BY p.id`,
    [postIds, viewer],
  );

  return Object.fromEntries(
    rows.map((row) => [
      row.post_id,
      {
        likes: row.likes,
        commentCount: row.comment_count,
        userLiked: row.user_liked,
      },
    ]),
  );
}

export async function getPostById(id) {
  const { rows } = await pool.query(`SELECT * FROM posts WHERE id = $1`, [id]);
  return rowToPost(rows[0]);
}

export async function savePost(post) {
  const id = post.id || uuidv4();
  await pool.query(
    `INSERT INTO posts (id, media_blob_id, media_url, media_type, media_mime,
       owner, title, content, is_deleted, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (id) DO UPDATE SET
       media_blob_id = EXCLUDED.media_blob_id, media_url = EXCLUDED.media_url,
       media_type = EXCLUDED.media_type, media_mime = EXCLUDED.media_mime,
       title = EXCLUDED.title, content = EXCLUDED.content,
       is_deleted = EXCLUDED.is_deleted`,
    [
      id,
      post.mediaBlobId || null,
      post.mediaUrl || null,
      post.mediaType || null,
      post.mediaMime || null,
      post.owner,
      post.title,
      post.content,
      post.isDeleted || false,
      post.createdAt || new Date().toISOString(),
    ],
  );
  return getPostById(id);
}

export async function updatePost(id, fields) {
  const map = {
    title: "title",
    content: "content",
    mediaBlobId: "media_blob_id",
    mediaUrl: "media_url",
    mediaType: "media_type",
    mediaMime: "media_mime",
    isDeleted: "is_deleted",
  };
  const sets = [];
  const vals = [];
  let i = 1;
  for (const [k, v] of Object.entries(fields)) {
    if (map[k]) {
      sets.push(`${map[k]} = $${i++}`);
      vals.push(v);
    }
  }
  if (!sets.length) return getPostById(id);
  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE posts SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    vals,
  );
  return rowToPost(rows[0]);
}

// ─── Profiles ────────────────────────────────────────────────────────────────
export async function getProfile(address) {
  const { rows } = await pool.query(
    `SELECT * FROM profiles WHERE address = $1`,
    [address],
  );
  return rowToProfile(rows[0]);
}

export async function saveProfile(address, profile) {
  const existing = await getProfile(address);
  const merged = { ...(existing || {}), ...profile, address };
  await pool.query(
    `INSERT INTO profiles (address, username, bio, display_name, avatar_blob_id, avatar_url,
       banner_blob_id, banner_url, website, location, twitter, profession, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
     ON CONFLICT (address) DO UPDATE SET
       username = EXCLUDED.username, bio = EXCLUDED.bio, display_name = EXCLUDED.display_name,
       avatar_blob_id = COALESCE(EXCLUDED.avatar_blob_id, profiles.avatar_blob_id),
       avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
       banner_blob_id = COALESCE(EXCLUDED.banner_blob_id, profiles.banner_blob_id),
       banner_url = COALESCE(EXCLUDED.banner_url, profiles.banner_url),
       website = EXCLUDED.website, location = EXCLUDED.location, twitter = EXCLUDED.twitter,
       profession = EXCLUDED.profession, updated_at = NOW()`,
    [
      address,
      merged.username || "",
      merged.bio || "",
      merged.displayName || "",
      merged.avatarBlobId || null,
      merged.avatarUrl || null,
      merged.bannerBlobId || null,
      merged.bannerUrl || null,
      merged.website || "",
      merged.location || "",
      merged.twitter || "",
      merged.profession || "",
    ],
  );
  return getProfile(address);
}

export async function getAllProfiles() {
  const { rows } = await pool.query(`SELECT * FROM profiles`);
  const map = {};
  for (const r of rows) map[r.address] = rowToProfile(r);
  return map;
}

export async function getProfileStats() {
  const { rows } = await pool.query(`
    SELECT
      p.owner AS address,
      COUNT(DISTINCT p.id)::int AS post_count,
      COUNT(l.id)::int AS total_likes
    FROM posts p
    LEFT JOIN likes l ON l.post_id = p.id
    WHERE p.is_deleted = false
    GROUP BY p.owner
  `);
  const map = {};
  for (const r of rows) {
    map[r.address] = {
      postCount: r.post_count,
      totalLikes: r.total_likes,
    };
  }
  return map;
}

// ─── Comments ────────────────────────────────────────────────────────────────
export async function getComments(postId) {
  const { rows } = await pool.query(
    `SELECT * FROM comments WHERE post_id = $1 ORDER BY created_at ASC`,
    [postId],
  );
  return rows.map(rowToComment);
}

export async function saveComment(comment) {
  const id = comment.id || uuidv4();
  await pool.query(
    `INSERT INTO comments (id, post_id, owner, content, created_at) VALUES ($1,$2,$3,$4,$5)`,
    [
      id,
      comment.postId,
      comment.owner,
      comment.content,
      comment.createdAt || new Date().toISOString(),
    ],
  );
  return { ...comment, id };
}

// ─── Likes ───────────────────────────────────────────────────────────────────
export async function getLikes(postId) {
  const { rows } = await pool.query(`SELECT * FROM likes WHERE post_id = $1`, [
    postId,
  ]);
  return rows.map(rowToLike);
}

export async function hasLiked(postId, owner) {
  const { rows } = await pool.query(
    `SELECT 1 FROM likes WHERE post_id = $1 AND owner = $2`,
    [postId, owner],
  );
  return rows.length > 0;
}

export async function saveLike(like) {
  const id = like.id || uuidv4();
  await pool.query(
    `INSERT INTO likes (id, post_id, owner, created_at) VALUES ($1,$2,$3,$4) ON CONFLICT (post_id, owner) DO NOTHING`,
    [id, like.postId, like.owner, like.createdAt || new Date().toISOString()],
  );
  return { ...like, id };
}

export async function removeLike(postId, owner) {
  await pool.query(`DELETE FROM likes WHERE post_id = $1 AND owner = $2`, [
    postId,
    owner,
  ]);
}

// Per-account conversation settings. A user's pin state is private to that user.
export async function getPinnedConversations(ownerAddress) {
  const { rows } = await pool.query(
    "SELECT other_address FROM conversation_preferences WHERE owner_address = $1 AND is_pinned = TRUE ORDER BY updated_at DESC",
    [ownerAddress],
  );
  return rows.map((row) => row.other_address);
}

export async function setConversationPinned(ownerAddress, otherAddress, pinned) {
  if (pinned) {
    await pool.query(
      `INSERT INTO conversation_preferences (owner_address, other_address, is_pinned, updated_at)
       VALUES ($1, $2, TRUE, NOW())
       ON CONFLICT (owner_address, other_address)
       DO UPDATE SET is_pinned = TRUE, updated_at = NOW()`,
      [ownerAddress, otherAddress],
    );
  } else {
    await pool.query(
      "UPDATE conversation_preferences SET is_pinned = FALSE, updated_at = NOW() WHERE owner_address = $1 AND other_address = $2",
      [ownerAddress, otherAddress],
    );
  }
  return { otherAddress, isPinned: pinned };
}

// ─── Messages ────────────────────────────────────────────────────────────────
export async function getMessages(address) {
  const { rows } = await pool.query(
    `SELECT m.*,
       COALESCE((SELECT json_agg(json_build_object('emoji', mr.emoji, 'userAddress', mr.user_address) ORDER BY mr.created_at)
                 FROM message_reactions mr WHERE mr.message_id = m.id), '[]'::json) AS reactions
     FROM messages m
     WHERE (m.sender = $1 OR m.receiver = $1)
       AND NOT EXISTS (
         SELECT 1
         FROM blocked_users b
         WHERE (b.blocker = $1 AND b.blocked = CASE WHEN m.sender = $1 THEN m.receiver ELSE m.sender END)
            OR (b.blocker = CASE WHEN m.sender = $1 THEN m.receiver ELSE m.sender END AND b.blocked = $1)
       )
     ORDER BY m.created_at ASC`,
    [address],
  );
  return rows.map(rowToMessage);
}

export async function getConversation(a, b, { limit = 100, beforeCreatedAt = null, beforeId = null } = {}) {
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 100));
  const params = [a, b];
  let cursorClause = "";
  if (beforeCreatedAt && beforeId) {
    params.push(beforeCreatedAt, beforeId);
    cursorClause = ` AND (m.created_at < $3 OR (m.created_at = $3 AND m.id::text < $4))`;
  }
  params.push(pageSize + 1);
  const limitParam = `${params.length}`;
  const { rows } = await pool.query(
    `SELECT m.*,
       COALESCE((SELECT json_agg(json_build_object('emoji', mr.emoji, 'userAddress', mr.user_address) ORDER BY mr.created_at)
                 FROM message_reactions mr WHERE mr.message_id = m.id), '[]'::json) AS reactions
     FROM messages m
     WHERE ((m.sender=$1 AND m.receiver=$2) OR (m.sender=$2 AND m.receiver=$1))${cursorClause}
     ORDER BY m.created_at DESC, m.id::text DESC
     LIMIT ${limitParam}`,
    params,
  );
  const hasMore = rows.length > pageSize;
  const messages = rows.slice(0, pageSize).reverse().map(rowToMessage);
  return { messages, hasMore };
}

export async function saveMessage(message) {
  const id = message.id || uuidv4();
  await pool.query(
    `INSERT INTO messages (id, sender, receiver, content, created_at, attachment_url, attachment_key, attachment_name, attachment_mime, attachment_size, reply_to_message_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, message.sender, message.receiver, message.content || "", message.createdAt || new Date().toISOString(),
      message.attachmentUrl || null, message.attachmentKey || null, message.attachmentName || null,
      message.attachmentMime || null, message.attachmentSize ?? null, message.replyToMessageId || null],
  );
  return { ...message, id, content: message.content || "", readAt: message.readAt || null, replyToMessageId: message.replyToMessageId || null };
}

export async function updateMessageContent(id, sender, content) {
  const { rows } = await pool.query(
    `UPDATE messages
     SET content = $3, edited_at = NOW()
     WHERE id = $1 AND sender = $2 AND deleted_at IS NULL
       AND created_at >= NOW() - INTERVAL '15 minutes'
       AND content <> ''
     RETURNING *`,
    [id, sender, content],
  );
  return rowToMessage(rows[0]);
}

export async function deleteMessageForEveryone(id, sender) {
  const { rows } = await pool.query(
    `UPDATE messages
     SET content = '', attachment_url = NULL, attachment_key = NULL,
         attachment_name = NULL, attachment_mime = NULL, attachment_size = NULL,
         deleted_at = NOW()
     WHERE id = $1 AND sender = $2 AND deleted_at IS NULL
     RETURNING *`,
    [id, sender],
  );
  return rowToMessage(rows[0]);
}

export async function markConversationMessagesRead(reader, otherAddress) {
  const { rows } = await pool.query(
    `UPDATE messages
     SET read_at = NOW()
     WHERE sender = $1 AND receiver = $2 AND read_at IS NULL
     RETURNING id, read_at`,
    [otherAddress, reader],
  );
  return rows.map((row) => ({
    id: row.id,
    readAt:
      row.read_at instanceof Date ? row.read_at.toISOString() : row.read_at,
  }));
}

export async function getUnreadMessageCounts(address) {
  const { rows } = await pool.query(
    `SELECT m.sender, COUNT(*)::int AS unread_count
     FROM messages m
     WHERE m.receiver = $1
       AND m.read_at IS NULL
       AND m.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1
         FROM blocked_users b
         WHERE (b.blocker = $1 AND b.blocked = m.sender)
            OR (b.blocker = m.sender AND b.blocked = $1)
       )
     GROUP BY m.sender`,
    [address],
  );

  const conversations = Object.fromEntries(
    rows.map((row) => [row.sender, Number(row.unread_count) || 0]),
  );
  const count = Object.values(conversations).reduce((sum, unread) => sum + unread, 0);
  return { count, conversations };
}

export async function setMessageTyping(sender, receiver, typing) {
  await pool.query(
    `INSERT INTO message_typing (sender, receiver, is_typing, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (sender, receiver)
     DO UPDATE SET is_typing = EXCLUDED.is_typing, updated_at = NOW()`,
    [sender, receiver, typing === true],
  );
}

export async function getMessageTyping(sender, receiver) {
  const { rows } = await pool.query(
    `SELECT updated_at
     FROM message_typing
     WHERE sender = $1 AND receiver = $2
       AND is_typing = TRUE
       AND updated_at > NOW() - INTERVAL '8 seconds'
     LIMIT 1`,
    [sender, receiver],
  );
  const updatedAt = rows[0]?.updated_at;
  return {
    isTyping: rows.length > 0,
    updatedAt: updatedAt
      ? updatedAt instanceof Date
        ? updatedAt.toISOString()
        : updatedAt
      : null,
  };
}

export async function getMessageTypingBatch(receiver, senderAddresses = []) {
  const addresses = [...new Set(senderAddresses.filter(
    (address) => typeof address === "string" && address && address !== receiver,
  ))].slice(0, 100);
  if (!addresses.length) return {};

  const { rows } = await pool.query(
    `SELECT mt.sender, mt.updated_at
     FROM message_typing mt
     WHERE mt.receiver = $1
       AND mt.sender = ANY($2::text[])
       AND mt.is_typing = TRUE
       AND mt.updated_at > NOW() - INTERVAL '8 seconds'
       AND NOT EXISTS (
         SELECT 1
         FROM blocked_users b
         WHERE (b.blocker = $1 AND b.blocked = mt.sender)
            OR (b.blocker = mt.sender AND b.blocked = $1)
       )`,
    [receiver, addresses],
  );

  return Object.fromEntries(rows.map((row) => [
    row.sender,
    {
      isTyping: true,
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : row.updated_at,
    },
  ]));
}

// ─── Follows ─────────────────────────────────────────────────────────────────
export async function createFollow(follower, following) {
  await pool.query(
    `INSERT INTO follows (follower, following) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [follower, following],
  );
}

export async function deleteFollow(follower, following) {
  await pool.query(`DELETE FROM follows WHERE follower=$1 AND following=$2`, [
    follower,
    following,
  ]);
}

export async function isFollowing(follower, following) {
  const { rows } = await pool.query(
    `SELECT 1 FROM follows WHERE follower=$1 AND following=$2`,
    [follower, following],
  );
  return rows.length > 0;
}

export async function getFollowerCount(address) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM follows WHERE following=$1`,
    [address],
  );
  return rows[0].c;
}

export async function getFollowingCount(address) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM follows WHERE follower=$1`,
    [address],
  );
  return rows[0].c;
}

export async function getFollowers(address) {
  const { rows } = await pool.query(
    `SELECT follower AS address, created_at FROM follows WHERE following=$1 ORDER BY created_at DESC`,
    [address],
  );
  return rows;
}

export async function getFollowing(address) {
  const { rows } = await pool.query(
    `SELECT following AS address, created_at FROM follows WHERE follower=$1 ORDER BY created_at DESC`,
    [address],
  );
  return rows;
}


// ─── User blocking ────────────────────────────────────────────────────────────
export async function blockUser(blocker, blocked) {
  await pool.query(
    `INSERT INTO blocked_users (blocker, blocked) VALUES ($1, $2)
     ON CONFLICT (blocker, blocked) DO NOTHING`,
    [blocker, blocked],
  );
  // A block removes the follow relationship in both directions.
  await pool.query(
    `DELETE FROM follows
     WHERE (follower = $1 AND following = $2)
        OR (follower = $2 AND following = $1)`,
    [blocker, blocked],
  );
  return { blocked: true };
}

export async function unblockUser(blocker, blocked) {
  await pool.query(
    "DELETE FROM blocked_users WHERE blocker = $1 AND blocked = $2",
    [blocker, blocked],
  );
  return { blocked: false };
}

export async function getBlockStatus(viewer, target) {
  const { rows } = await pool.query(
    `SELECT
       EXISTS(SELECT 1 FROM blocked_users WHERE blocker = $1 AND blocked = $2) AS blocked_by_me,
       EXISTS(SELECT 1 FROM blocked_users WHERE blocker = $2 AND blocked = $1) AS has_blocked_me`,
    [viewer, target],
  );
  return {
    blockedByMe: !!rows[0]?.blocked_by_me,
    hasBlockedMe: !!rows[0]?.has_blocked_me,
  };
}

export async function getBlockedUsers(blocker) {
  const { rows } = await pool.query(
    `SELECT b.blocked AS address, b.created_at,
            COALESCE(p.username, u.username, b.blocked) AS username,
            COALESCE(p.display_name, '') AS display_name,
            p.avatar_url
     FROM blocked_users b
     LEFT JOIN profiles p ON p.address = b.blocked
     LEFT JOIN users u ON u.address = b.blocked
     WHERE b.blocker = $1
     ORDER BY b.created_at DESC`,
    [blocker],
  );
  return rows;
}

export async function isBlockedEitherWay(a, b) {
  if (!a || !b) return false;
  const { rows } = await pool.query(
    "SELECT EXISTS(SELECT 1 FROM blocked_users WHERE (blocker = $1 AND blocked = $2) OR (blocker = $2 AND blocked = $1)) AS blocked",
    [a, b],
  );
  return !!rows[0]?.blocked;
}

function getTriagePriority(reason) {
  if (reason === "child-safety" || reason === "violence") return "critical";
  if (reason === "harassment" || reason === "hate") return "urgent";
  return "standard";
}

function escalationNoteForPriority(priority) {
  return priority === "critical" || priority === "urgent"
    ? "Automatically prioritized for urgent human review from the report reason."
    : null;
}

export async function saveAccountReport({ targetAddress, reporter, reason, description }) {
  const id = uuidv4();
  const priority = getTriagePriority(reason);
  const escalationNote = escalationNoteForPriority(priority);
  const { rows } = await pool.query(
    `INSERT INTO reports
       (id, post_id, target_address, reporter, reason, description, triage_priority,
        escalated_at, escalation_note, created_at)
     VALUES ($1, NULL, $2, $3, $4, $5, $6,
       CASE WHEN $6 IN ('critical', 'urgent') THEN NOW() ELSE NULL END,
       $7, NOW())
     ON CONFLICT (target_address, reporter) WHERE target_address IS NOT NULL
     DO UPDATE SET reason = EXCLUDED.reason,
       description = EXCLUDED.description,
       triage_priority = CASE
         WHEN reports.triage_priority = 'critical' THEN 'critical'
         ELSE EXCLUDED.triage_priority
       END,
       escalated_at = COALESCE(reports.escalated_at, EXCLUDED.escalated_at),
       escalation_note = COALESCE(reports.escalation_note, EXCLUDED.escalation_note),
       created_at = NOW()
     RETURNING id, target_address, reporter, reason, description, triage_priority,
       escalated_at, escalated_by, escalation_note, created_at`,
    [id, targetAddress, reporter, reason, description || "", priority, escalationNote],
  );
  return rows[0];
}

// ─── Post Reports ─────────────────────────────────────────────────────────────
export async function saveReport({ postId, reporter, reason, description }) {
  const id = uuidv4();
  const priority = getTriagePriority(reason);
  const escalationNote = escalationNoteForPriority(priority);
  const { rows } = await pool.query(
    `INSERT INTO reports
       (id, post_id, reporter, reason, description, triage_priority, escalated_at, escalation_note, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,
       CASE WHEN $6 IN ('critical', 'urgent') THEN NOW() ELSE NULL END,
       $7, NOW())
     ON CONFLICT (post_id, reporter)
     DO UPDATE SET reason = EXCLUDED.reason,
       description = EXCLUDED.description,
       triage_priority = CASE
         WHEN reports.triage_priority = 'critical' THEN 'critical'
         ELSE EXCLUDED.triage_priority
       END,
       escalated_at = COALESCE(reports.escalated_at, EXCLUDED.escalated_at),
       escalation_note = COALESCE(reports.escalation_note, EXCLUDED.escalation_note),
       created_at = NOW()
     RETURNING id, post_id, reporter, reason, description, triage_priority,
       escalated_at, escalated_by, escalation_note, created_at`,
    [id, postId, reporter, reason, description || "", priority, escalationNote],
  );
  return rows[0];
}

// ─── Notifications ────────────────────────────────────────────────────────────
export async function getAdminReports({ status = "pending", priority = "all", limit = 100 } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 100, 1), 200);
  const validStatus = ["pending", "reviewed", "dismissed", "removed"].includes(status)
    ? status
    : "pending";
  const validPriority = ["critical", "urgent", "standard"].includes(priority) ? priority : "all";
  const { rows } = await pool.query(
    `SELECT r.id, r.post_id, r.target_address, r.reporter, r.reason,
       r.description, r.created_at, r.moderation_status, r.reviewed_by,
       r.reviewed_at, r.triage_priority, r.escalated_at, r.escalated_by,
       r.escalation_note, p.title AS post_title, p.content AS post_content,
       p.owner AS post_owner, p.is_deleted AS post_is_deleted,
       target.username AS target_username, reporter_profile.username AS reporter_username
     FROM reports r
     LEFT JOIN posts p ON p.id = r.post_id
     LEFT JOIN profiles target ON target.address = COALESCE(r.target_address, p.owner)
     LEFT JOIN profiles reporter_profile ON reporter_profile.address = r.reporter
     WHERE ($1 = 'all' OR r.moderation_status = $1)
       AND ($2 = 'all'
         OR ($2 = 'urgent' AND r.triage_priority IN ('critical', 'urgent'))
         OR r.triage_priority = $2)
     ORDER BY CASE r.triage_priority WHEN 'critical' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END,
       CASE WHEN r.moderation_status = 'pending' THEN 0 ELSE 1 END,
       r.created_at DESC
     LIMIT $3`,
    [status === "all" ? "all" : validStatus, priority === "all" || priority === "urgent" ? priority : validPriority, safeLimit],
  );
  return rows;
}

export async function updateAdminReport(reportId, action, reviewer) {
  if (!["reviewed", "dismissed", "removed"].includes(action)) {
    throw new Error("Invalid moderation action");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT r.id, r.post_id, r.target_address, r.reason, p.owner AS post_owner
       FROM reports r LEFT JOIN posts p ON p.id = r.post_id
       WHERE r.id = $1 FOR UPDATE OF r`,
      [reportId],
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    if (action === "removed" && rows[0].post_id) {
      await client.query("UPDATE posts SET is_deleted = TRUE WHERE id = $1", [rows[0].post_id]);
    }
    const updated = await client.query(
      `UPDATE reports SET moderation_status = $2, reviewed_by = $3,
         reviewed_at = NOW() WHERE id = $1
       RETURNING id, post_id, target_address, moderation_status, reviewed_by, reviewed_at`,
      [reportId, action, reviewer],
    );
    await client.query(
      `INSERT INTO moderation_audit_log
         (id, actor_address, action, target_address, report_id, details)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [uuidv4(), reviewer, `report_${action}`, rows[0].target_address || rows[0].post_owner || null, reportId,
       JSON.stringify({ reason: rows[0].reason, postId: rows[0].post_id || null })],
    );
    await client.query("COMMIT");
    return updated.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateAdminReportPriority(reportId, priority, note, reviewer) {
  if (!["standard", "urgent", "critical"].includes(priority)) {
    throw new Error("Invalid triage priority");
  }
  const safeNote = String(note || "").trim().slice(0, 1000);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query(
      `SELECT r.id, r.post_id, r.target_address, r.reason, r.triage_priority,
         p.owner AS post_owner
       FROM reports r LEFT JOIN posts p ON p.id = r.post_id
       WHERE r.id = $1 FOR UPDATE OF r`,
      [reportId],
    );
    const report = selected.rows[0];
    if (!report) {
      await client.query("ROLLBACK");
      return null;
    }
    const updated = await client.query(
      `UPDATE reports
       SET triage_priority = $2,
           escalated_at = CASE WHEN $2 IN ('critical', 'urgent') THEN NOW() ELSE NULL END,
           escalated_by = CASE WHEN $2 IN ('critical', 'urgent') THEN $3 ELSE NULL END,
           escalation_note = CASE WHEN $2 IN ('critical', 'urgent') THEN NULLIF($4, '') ELSE NULL END
       WHERE id = $1
       RETURNING id, triage_priority, escalated_at, escalated_by, escalation_note`,
      [reportId, priority, reviewer, safeNote],
    );
    await client.query(
      `INSERT INTO moderation_audit_log
         (id, actor_address, action, target_address, report_id, details)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [uuidv4(), reviewer, priority === "standard" ? "report_priority_lowered" : "report_escalated",
       report.target_address || report.post_owner || null, reportId,
       JSON.stringify({ reason: report.reason, previousPriority: report.triage_priority,
         newPriority: priority, note: safeNote || null })],
    );
    await client.query("COMMIT");
    return updated.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function claimModerationAlert(reportId, priority = "critical") {
  if (priority !== "critical") throw new Error("Only critical alerts can be dispatched here");
  const { rows } = await pool.query(
    `INSERT INTO moderation_alert_deliveries
       (id, report_id, priority, delivery_status, attempts, created_at, updated_at)
     VALUES ($1, $2, $3, 'sending', 1, NOW(), NOW())
     ON CONFLICT (report_id, priority) DO UPDATE SET
       delivery_status = 'sending',
       attempts = moderation_alert_deliveries.attempts + 1,
       last_error = NULL,
       updated_at = NOW()
     WHERE moderation_alert_deliveries.delivery_status <> 'sent'
       AND (moderation_alert_deliveries.delivery_status <> 'sending'
         OR moderation_alert_deliveries.updated_at < NOW() - INTERVAL '5 minutes')
     RETURNING id, attempts`,
    [uuidv4(), reportId, priority],
  );
  return rows[0] || null;
}

export async function finishModerationAlert(alertId, {
  success,
  recipientCount = 0,
  error = null,
} = {}) {
  const status = success ? "sent" : "failed";
  const safeError = error ? String(error).slice(0, 500) : null;
  const { rows } = await pool.query(
    `UPDATE moderation_alert_deliveries
     SET delivery_status = $2,
         recipient_count = $3,
         last_error = $4,
         sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE NULL END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, report_id, delivery_status, attempts, recipient_count, last_error, sent_at, updated_at`,
    [alertId, status, recipientCount, safeError],
  );
  return rows[0] || null;
}

export async function getAdminAlertDeliveries({ limit = 100 } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 100, 1), 200);
  const { rows } = await pool.query(
    `SELECT d.id, d.report_id, d.priority, d.delivery_status, d.attempts,
       d.recipient_count, d.last_error, d.created_at, d.updated_at, d.sent_at,
       r.reason, r.moderation_status, r.target_address, p.owner AS post_owner,
       target.username AS target_username
     FROM moderation_alert_deliveries d
     JOIN reports r ON r.id = d.report_id
     LEFT JOIN posts p ON p.id = r.post_id
     LEFT JOIN profiles target ON target.address = COALESCE(r.target_address, p.owner)
     ORDER BY CASE d.delivery_status WHEN 'failed' THEN 0 WHEN 'sending' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
       d.updated_at DESC
     LIMIT $1`,
    [safeLimit],
  );
  return rows;
}


export async function ensureModerationIncident(reportId) {
  const { rows } = await pool.query(
    `INSERT INTO moderation_incidents (id, report_id, status, created_at, updated_at)
     VALUES ($1, $2, 'open', NOW(), NOW())
     ON CONFLICT (report_id) DO UPDATE SET updated_at = moderation_incidents.updated_at
     RETURNING *`,
    [uuidv4(), reportId],
  );
  return rows[0] || null;
}

export async function getAdminIncidents({ status = "active", limit = 100 } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 100, 1), 200);
  const validStatus = ["open", "acknowledged", "in_progress", "escalated", "resolved"].includes(status) ? status : "active";
  const { rows } = await pool.query(
    `SELECT i.id, i.report_id, i.status, i.assigned_to, i.acknowledged_by,
       i.acknowledged_at, i.resolved_by, i.resolved_at, i.resolution_note,
       i.last_updated_by, i.created_at, i.updated_at,
       r.reason, r.triage_priority, r.moderation_status, r.target_address,
       r.post_id, p.owner AS post_owner, target.username AS target_username,
       assignee.username AS assigned_username, updater.username AS updated_by_username
     FROM moderation_incidents i
     JOIN reports r ON r.id = i.report_id
     LEFT JOIN posts p ON p.id = r.post_id
     LEFT JOIN profiles target ON target.address = COALESCE(r.target_address, p.owner)
     LEFT JOIN profiles assignee ON assignee.address = i.assigned_to
     LEFT JOIN profiles updater ON updater.address = i.last_updated_by
     WHERE ($1 = 'active' AND i.status <> 'resolved') OR i.status = $1
     ORDER BY CASE i.status WHEN 'escalated' THEN 0 WHEN 'open' THEN 1 WHEN 'acknowledged' THEN 2 WHEN 'in_progress' THEN 3 ELSE 4 END,
       i.updated_at DESC
     LIMIT $2`,
    [validStatus, safeLimit],
  );
  return rows;
}

export async function updateAdminIncident(reportId, action, note, reviewer, assignedTo = null) {
  const actions = ["acknowledge", "start", "escalate", "resolve", "reopen", "assign"];
  if (!actions.includes(action)) throw new Error("Invalid incident action");
  const safeNote = String(note || "").trim().slice(0, 1000);
  if (["resolve", "escalate"].includes(action) && safeNote.length < 3) {
    throw new Error("A short note is required for this incident action");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query(
      `SELECT i.*, r.reason, r.target_address, p.owner AS post_owner
       FROM moderation_incidents i
       JOIN reports r ON r.id = i.report_id
       LEFT JOIN posts p ON p.id = r.post_id
       WHERE i.report_id = $1 FOR UPDATE OF i`,
      [reportId],
    );
    const incident = selected.rows[0];
    if (!incident) {
      await client.query("ROLLBACK");
      return null;
    }
    let status = incident.status;
    let nextAssigned = incident.assigned_to;
    let ackBy = incident.acknowledged_by;
    let ackAt = incident.acknowledged_at;
    let resolvedBy = incident.resolved_by;
    let resolvedAt = incident.resolved_at;
    let resolutionNote = incident.resolution_note;
    if (action === "acknowledge") {
      if (status === "resolved") throw new Error("Reopen a resolved incident before acknowledging it");
      status = "acknowledged";
      ackBy = reviewer;
      ackAt = new Date();
      if (!nextAssigned) nextAssigned = reviewer;
    } else if (action === "start") {
      if (status === "resolved") throw new Error("Reopen a resolved incident before starting work");
      status = "in_progress";
      if (!nextAssigned) nextAssigned = reviewer;
    } else if (action === "escalate") {
      if (status === "resolved") throw new Error("Reopen a resolved incident before escalating it");
      status = "escalated";
      if (!nextAssigned) nextAssigned = reviewer;
    } else if (action === "resolve") {
      status = "resolved";
      resolvedBy = reviewer;
      resolvedAt = new Date();
      resolutionNote = safeNote;
    } else if (action === "reopen") {
      status = "open";
      resolvedBy = null;
      resolvedAt = null;
      resolutionNote = null;
    } else if (action === "assign") {
      if (status === "resolved") throw new Error("Reopen a resolved incident before assigning it");
      if (!assignedTo || !String(assignedTo).trim()) throw new Error("Choose an administrator to assign this incident to");
      nextAssigned = String(assignedTo).trim();
    }
    const updated = await client.query(
      `UPDATE moderation_incidents
       SET status = $2, assigned_to = $3, acknowledged_by = $4,
           acknowledged_at = $5, resolved_by = $6, resolved_at = $7,
           resolution_note = $8, last_updated_by = $9, updated_at = NOW()
       WHERE report_id = $1 RETURNING *`,
      [reportId, status, nextAssigned, ackBy, ackAt, resolvedBy, resolvedAt, resolutionNote, reviewer],
    );
    await client.query(
      `INSERT INTO moderation_audit_log (id, actor_address, action, target_address, report_id, details)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [uuidv4(), reviewer, "incident_" + action, incident.target_address || incident.post_owner || null,
       reportId, JSON.stringify({ previousStatus: incident.status, newStatus: status,
         assignedTo: nextAssigned, note: safeNote || null })],
    );
    await client.query("COMMIT");
    return updated.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getAdminUsers({ status = "all", search = "", limit = 100 } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 100, 1), 200);
  const validStatus = ["active", "suspended"].includes(status) ? status : "all";
  const safeSearch = String(search || "").trim().slice(0, 100);
  const { rows } = await pool.query(
    `SELECT u.address, u.username, u.email, u.account_status, u.created_at,
       u.suspended_at, u.suspension_reason, u.suspended_by,
       u.restored_at, u.restored_by,
       p.display_name
     FROM users u
     LEFT JOIN profiles p ON p.address = u.address
     WHERE ($1 = 'all' OR u.account_status = $1)
       AND ($2 = '' OR u.username ILIKE '%' || $2 || '%'
         OR COALESCE(u.email, '') ILIKE '%' || $2 || '%'
         OR u.address ILIKE '%' || $2 || '%')
     ORDER BY CASE WHEN u.account_status = 'suspended' THEN 0 ELSE 1 END,
       u.created_at DESC
     LIMIT $3`,
    [validStatus, safeSearch, safeLimit],
  );
  return rows;
}

export async function updateAdminUserStatus(targetAddress, action, reason, reviewer) {
  if (!["suspend", "restore"].includes(action)) {
    throw new Error("Invalid account moderation action");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query(
      `SELECT address, username, email, account_status, suspended_at,
         suspension_reason, suspended_by, restored_at, restored_by
       FROM users WHERE address = $1 FOR UPDATE`,
      [targetAddress],
    );
    const user = selected.rows[0];
    if (!user) {
      await client.query("ROLLBACK");
      return null;
    }
    const alreadyInState = action === "suspend"
      ? user.account_status === "suspended"
      : user.account_status !== "suspended";
    if (alreadyInState) {
      await client.query("ROLLBACK");
      return { ...user, unchanged: true };
    }

    const updated = action === "suspend"
      ? await client.query(
          `UPDATE users
           SET account_status = 'suspended', suspended_at = NOW(),
               suspension_reason = $2, suspended_by = $3,
               restored_at = NULL, restored_by = NULL
           WHERE address = $1
           RETURNING address, username, email, account_status, created_at,
             suspended_at, suspension_reason, suspended_by, restored_at, restored_by`,
          [targetAddress, reason, reviewer],
        )
      : await client.query(
          `UPDATE users SET account_status = 'active',
             restored_at = NOW(), restored_by = $2
           WHERE address = $1
           RETURNING address, username, email, account_status, created_at,
             suspended_at, suspension_reason, suspended_by, restored_at, restored_by`,
          [targetAddress, reviewer],
        );

    await client.query(
      `INSERT INTO moderation_audit_log
         (id, actor_address, action, target_address, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [uuidv4(), reviewer, action === "suspend" ? "account_suspended" : "account_restored",
       targetAddress, JSON.stringify({ reason: action === "suspend" ? reason : (reason || "") })],
    );
    await client.query("COMMIT");
    return { ...updated.rows[0], unchanged: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getModerationAuditLog({ limit = 100 } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 100, 1), 200);
  const { rows } = await pool.query(
    `SELECT a.id, a.actor_address, a.action, a.target_address, a.report_id,
       a.details, a.created_at,
       actor.username AS actor_username,
       target.username AS target_username
     FROM moderation_audit_log a
     LEFT JOIN profiles actor ON actor.address = a.actor_address
     LEFT JOIN profiles target ON target.address = a.target_address
     ORDER BY a.created_at DESC
     LIMIT $1`,
    [safeLimit],
  );
  return rows;
}

export async function createNotification({
  recipient,
  type,
  actorAddress,
  postId,
  excerpt,
}) {
  if (recipient === actorAddress) return; // don't notify yourself
  const id = uuidv4();
  await pool.query(
    `INSERT INTO notifications (id, recipient, type, actor_address, post_id, excerpt) VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, recipient, type, actorAddress, postId || null, excerpt || null],
  );
}

export async function getNotifications(recipient) {
  const { rows } = await pool.query(
    `SELECT * FROM notifications WHERE recipient=$1 ORDER BY created_at DESC LIMIT 50`,
    [recipient],
  );
  return rows.map(rowToNotification);
}

export async function markNotificationsRead(recipient) {
  await pool.query(
    `UPDATE notifications SET read_at=NOW() WHERE recipient=$1 AND read_at IS NULL`,
    [recipient],
  );
}

export async function getUnreadNotificationCount(recipient) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM notifications WHERE recipient=$1 AND read_at IS NULL`,
    [recipient],
  );
  return rows[0].c;
}

// ─── Presence ─────────────────────────────────────────────────────────────────
export async function upsertPresence(address) {
  await pool.query(
    `INSERT INTO presence (address, last_seen_at) VALUES ($1, NOW())
     ON CONFLICT (address) DO UPDATE SET last_seen_at = NOW()`,
    [address],
  );
}

export async function getBatchPresence(addresses) {
  if (!addresses || !addresses.length) return {};
  const { rows } = await pool.query(
    `SELECT address, last_seen_at FROM presence WHERE address = ANY($1)`,
    [addresses],
  );
  const map = {};
  for (const r of rows) map[r.address] = r.last_seen_at;
  return map;
}

// ─── Users (auth) ─────────────────────────────────────────────────────────────
export async function getUserByUsername(username) {
  const { rows } = await pool.query(
    `SELECT * FROM users WHERE LOWER(username) = LOWER($1)`,
    [username],
  );
  return rowToUser(rows[0]);
}

export async function getUserByEmail(email) {
  if (!email) return null;
  const { rows } = await pool.query(
    `SELECT * FROM users WHERE LOWER(email) = LOWER($1)`,
    [email],
  );
  return rowToUser(rows[0]);
}

export async function getUserByAddress(address) {
  const { rows } = await pool.query(`SELECT * FROM users WHERE address = $1`, [
    address,
  ]);
  return rowToUser(rows[0]);
}

export async function getUserByVerifyToken(token) {
  const { rows } = await pool.query(
    `SELECT * FROM users WHERE email_verify_token = $1`,
    [token],
  );
  return rowToUser(rows[0]);
}

export async function createUser({
  id,
  username,
  email,
  passwordHash,
  address,
}) {
  await pool.query(
    `INSERT INTO users (id, username, email, password_hash, address) VALUES ($1,$2,$3,$4,$5)`,
    [id, username, email || null, passwordHash, address],
  );
  return getUserByAddress(address);
}

export async function setEmailVerifyToken(userId, token) {
  await pool.query(`UPDATE users SET email_verify_token=$1 WHERE id=$2`, [
    token,
    userId,
  ]);
}

export async function verifyEmailToken(token) {
  const { rowCount } = await pool.query(
    `UPDATE users SET email_verified_at=NOW(), email_verify_token=NULL WHERE email_verify_token=$1 AND email_verified_at IS NULL`,
    [token],
  );
  return rowCount === 1;
}

export async function createPasswordReset({ email, codeHash, expiresAt }) {
  await pool.query(
    `UPDATE password_resets SET used_at=NOW() WHERE LOWER(email)=LOWER($1) AND used_at IS NULL`,
    [email],
  );
  await pool.query(
    `INSERT INTO password_resets (email, code_hash, expires_at) VALUES ($1,$2,$3)`,
    [email, codeHash, expiresAt],
  );
}

export async function findActiveResetByEmail(email) {
  const { rows } = await pool.query(
    `SELECT * FROM password_resets WHERE LOWER(email)=LOWER($1) AND used_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
    [email],
  );
  return rows[0] || null;
}

export async function claimReset(id) {
  const { rowCount } = await pool.query(
    `UPDATE password_resets SET used_at=NOW() WHERE id=$1 AND used_at IS NULL AND expires_at > NOW()`,
    [id],
  );
  return rowCount === 1;
}

export async function recordAndCheckRate(key, max, windowMs) {
  const cutoff = new Date(Date.now() - windowMs);
  const { rows } = await pool.query(
    `WITH pruned AS (DELETE FROM rate_limit_events WHERE bucket_key=$1 AND created_at<=$2),
     inserted AS (INSERT INTO rate_limit_events (bucket_key) VALUES ($1) RETURNING 1)
     SELECT COUNT(*)::int AS c FROM rate_limit_events WHERE bucket_key=$1 AND created_at>$2`,
    [key, cutoff],
  );
  return rows[0].c <= max;
}

export async function updateUserPassword(userId, passwordHash) {
  await pool.query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [
    passwordHash,
    userId,
  ]);
}

// ─── Status ───────────────────────────────────────────────────────────────────
function rowToStatus(row) {
  if (!row) return null;
  return {
    id: row.id,
    owner: row.owner,
    content: row.content || "",
    hasMedia: Boolean(row.media_key),
    mediaUrl: null,
    mediaType: row.media_type || null,
    mediaMime: row.media_mime || null,
    audience: row.audience,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at,
    viewCount: Number(row.view_count || 0),
    viewedByMe: Boolean(row.viewed_by_me),
    profile: row.profile_address ? {
      address: row.profile_address,
      username: row.profile_username,
      displayName: row.profile_display_name || row.profile_username,
      avatarUrl: row.profile_avatar_url || null,
    } : null,
  };
}

export async function createStatus(status) {
  const { rows } = await pool.query(
    `INSERT INTO statuses
      (id, owner, content, media_key, media_url, media_type, media_mime, audience, created_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW() + INTERVAL '24 hours')
     RETURNING *`,
    [status.id, status.owner, status.content || "", status.mediaKey || null,
      status.mediaUrl || null, status.mediaType || null, status.mediaMime || null,
      status.audience || "followers"],
  );
  return rowToStatus(rows[0]);
}

export async function getActiveStatusesForViewer(viewer) {
  const { rows } = await pool.query(
    `SELECT s.*,
       COUNT(DISTINCT sv.viewer)::int AS view_count,
       COALESCE(BOOL_OR(sv.viewer = $1), FALSE) AS viewed_by_me,
       p.address AS profile_address, p.username AS profile_username,
       p.display_name AS profile_display_name, p.avatar_url AS profile_avatar_url
     FROM statuses s
     LEFT JOIN status_views sv ON sv.status_id = s.id
     LEFT JOIN profiles p ON p.address = s.owner
     WHERE s.expires_at > NOW()
       AND NOT EXISTS (
         SELECT 1 FROM blocked_users b
         WHERE (b.blocker = $1 AND b.blocked = s.owner)
            OR (b.blocker = s.owner AND b.blocked = $1)
       )
       AND (
         s.owner = $1
         OR s.audience = 'everyone'
         OR (s.audience = 'followers' AND EXISTS (
           SELECT 1 FROM follows f WHERE f.follower = s.owner AND f.following = $1
         ))
       )
     GROUP BY s.id, p.address
     ORDER BY s.created_at ASC`,
    [viewer],
  );
  return rows.map(rowToStatus);
}

export async function getActiveStatusById(statusId, viewer) {
  const { rows } = await pool.query(
    `SELECT s.*,
       COUNT(DISTINCT sv.viewer)::int AS view_count,
       COALESCE(BOOL_OR(sv.viewer = $2), FALSE) AS viewed_by_me,
       p.address AS profile_address, p.username AS profile_username,
       p.display_name AS profile_display_name, p.avatar_url AS profile_avatar_url
     FROM statuses s
     LEFT JOIN status_views sv ON sv.status_id = s.id
     LEFT JOIN profiles p ON p.address = s.owner
     WHERE s.id = $1 AND s.expires_at > NOW()
       AND NOT EXISTS (
         SELECT 1 FROM blocked_users b
         WHERE (b.blocker = $2 AND b.blocked = s.owner)
            OR (b.blocker = s.owner AND b.blocked = $2)
       )
       AND (
         s.owner = $2
         OR s.audience = 'everyone'
         OR (s.audience = 'followers' AND EXISTS (
           SELECT 1 FROM follows f WHERE f.follower = $2 AND f.following = s.owner
         ))
       )
     GROUP BY s.id, p.address`,
    [statusId, viewer],
  );
  return rowToStatus(rows[0]);
}

export async function getActiveStatusMediaKey(statusId, viewer) {
  const { rows } = await pool.query(
    `SELECT s.media_key, s.media_mime
     FROM statuses s
     WHERE s.id = $1 AND s.expires_at > NOW() AND s.media_key IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM blocked_users b
         WHERE (b.blocker = $2 AND b.blocked = s.owner)
            OR (b.blocker = s.owner AND b.blocked = $2)
       )
       AND (
         s.owner = $2
         OR s.audience = 'everyone'
         OR (s.audience = 'followers' AND EXISTS (
           SELECT 1 FROM follows f WHERE f.follower = s.owner AND f.following = $2
         ))
       )
     LIMIT 1`,
    [statusId, viewer],
  );
  return rows[0] || null;
}

export async function recordStatusView(statusId, viewer) {
  const { rowCount } = await pool.query(
    `INSERT INTO status_views (status_id, viewer)
     SELECT id, $2 FROM statuses
     WHERE id = $1 AND owner <> $2 AND expires_at > NOW()
     ON CONFLICT (status_id, viewer) DO NOTHING`,
    [statusId, viewer],
  );
  // Only the first view by a given account counts; repeat opens are idempotent.
  return (rowCount || 0) > 0;
}

export async function getStatusViewers(statusId, owner) {
  const { rows } = await pool.query(
    `SELECT sv.viewer, sv.viewed_at, p.username, p.display_name, p.avatar_url
     FROM status_views sv
     JOIN statuses s ON s.id = sv.status_id
     LEFT JOIN profiles p ON p.address = sv.viewer
     WHERE sv.status_id = $1 AND s.owner = $2 AND s.expires_at > NOW()
     ORDER BY sv.viewed_at DESC`,
    [statusId, owner],
  );
  return rows.map((row) => ({
    address: row.viewer,
    username: row.username || row.viewer,
    displayName: row.display_name || row.username || row.viewer,
    avatarUrl: row.avatar_url || null,
    viewedAt: row.viewed_at instanceof Date ? row.viewed_at.toISOString() : row.viewed_at,
  }));
}

export async function getExpiredStatuses() {
  const { rows } = await pool.query(
    `SELECT id, media_key FROM statuses WHERE expires_at <= NOW() ORDER BY expires_at ASC LIMIT 500`,
  );
  return rows;
}

export async function deleteExpiredStatusIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const { rowCount } = await pool.query(
    `DELETE FROM statuses WHERE id = ANY($1::text[]) AND expires_at <= NOW()`,
    [ids],
  );
  return rowCount || 0;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function purgeLegacyData() {
  const postColumns = new Set(
    (
      await pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'posts'`,
      )
    ).rows.map((r) => r.column_name),
  );

  const legacyPostConditions = [];
  if (postColumns.has("media_url"))
    legacyPostConditions.push("media_url ILIKE '%walrus%'");
  if (postColumns.has("blob_url"))
    legacyPostConditions.push("blob_url ILIKE '%walrus%'");
  for (const col of ["post_object_id", "tx_digest", "blob_id", "blob_object_id"]) {
    if (postColumns.has(col)) legacyPostConditions.push(`${col} IS NOT NULL`);
  }

  if (legacyPostConditions.length) {
    await pool.query(
      `DELETE FROM posts WHERE ${legacyPostConditions.join(" OR ")}`,
    );
  }

  const profileColumns = new Set(
    (
      await pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'profiles'`,
      )
    ).rows.map((r) => r.column_name),
  );

  const legacyProfileConditions = [];
  if (profileColumns.has("avatar_url"))
    legacyProfileConditions.push("avatar_url ILIKE '%walrus%'");
  if (profileColumns.has("banner_url"))
    legacyProfileConditions.push("banner_url ILIKE '%walrus%'");

  if (legacyProfileConditions.length) {
    const { rows: legacyUsers } = await pool.query(
      `SELECT address FROM profiles WHERE ${legacyProfileConditions.join(" OR ")}`,
    );

    for (const { address } of legacyUsers) {
      await pool.query("DELETE FROM posts WHERE owner = $1", [address]);
      await pool.query("DELETE FROM notifications WHERE actor_address = $1 OR recipient = $1", [address]);
      await pool.query("DELETE FROM messages WHERE sender = $1 OR receiver = $1", [address]);
      await pool.query("DELETE FROM follows WHERE follower = $1 OR following = $1", [address]);
      await pool.query("DELETE FROM push_tokens WHERE user_address = $1", [address]);
      await pool.query("DELETE FROM presence WHERE address = $1", [address]);
      await pool.query("DELETE FROM profiles WHERE address = $1", [address]);
      await pool.query("DELETE FROM users WHERE address = $1", [address]);
    }
  }

  await pool.query(`
    ALTER TABLE posts
      DROP COLUMN IF EXISTS post_object_id,
      DROP COLUMN IF EXISTS tx_digest,
      DROP COLUMN IF EXISTS blob_id,
      DROP COLUMN IF EXISTS blob_object_id,
      DROP COLUMN IF EXISTS blob_url
  `);
}

export async function initDb() {
  await pool.query(SCHEMA_SQL);
  await purgeLegacyData();
  console.log("[db] Postgres ready");
}



// Creator-facing analytics. A view is a distinct authenticated viewer per Reel;
// watch time and completion use the recorded playback sessions.
export async function getReelCreatorAnalytics(owner) {
  const { rows } = await pool.query(
    `WITH owned_reels AS (
       SELECT p.id, p.title, p.content, p.media_url, p.media_blob_id, p.created_at
       FROM posts p
       WHERE p.owner = $1 AND p.is_deleted = false AND p.media_type = 'video'
     ),
     watch_stats AS (
       SELECT w.post_id,
         COUNT(DISTINCT w.viewer)::int AS views,
         COALESCE(SUM(w.watched_ms), 0)::bigint AS watch_time_ms,
         COALESCE(SUM(w.watched_ms) FILTER (WHERE w.updated_at >= NOW() - INTERVAL '7 days'), 0)::bigint AS watch_time_7d_ms,
         COUNT(*)::int AS play_sessions,
         COUNT(*) FILTER (WHERE w.completed)::int AS completions,
         CASE WHEN COUNT(*) > 0
           THEN COUNT(*) FILTER (WHERE w.completed)::double precision / COUNT(*)
           ELSE 0.0 END AS completion_rate,
         CASE WHEN SUM(w.duration_ms) > 0
           THEN LEAST(1.0, SUM(w.watched_ms)::double precision / SUM(w.duration_ms))
           ELSE 0.0 END AS average_watch_ratio
       FROM reel_watch_sessions w
       JOIN owned_reels p ON p.id = w.post_id
       GROUP BY w.post_id
     ),
     like_stats AS (
       SELECT l.post_id, COUNT(*)::int AS likes
       FROM likes l JOIN owned_reels p ON p.id = l.post_id
       GROUP BY l.post_id
     ),
     comment_stats AS (
       SELECT c.post_id, COUNT(*)::int AS comments
       FROM comments c JOIN owned_reels p ON p.id = c.post_id
       GROUP BY c.post_id
     )
     SELECT p.*,
       COALESCE(w.views, 0)::int AS views,
       COALESCE(w.watch_time_ms, 0)::bigint AS watch_time_ms,
       COALESCE(w.watch_time_7d_ms, 0)::bigint AS watch_time_7d_ms,
       COALESCE(w.play_sessions, 0)::int AS play_sessions,
       COALESCE(w.completions, 0)::int AS completions,
       COALESCE(w.completion_rate, 0)::double precision AS completion_rate,
       COALESCE(w.average_watch_ratio, 0)::double precision AS average_watch_ratio,
       COALESCE(l.likes, 0)::int AS likes,
       COALESCE(c.comments, 0)::int AS comments
     FROM owned_reels p
     LEFT JOIN watch_stats w ON w.post_id = p.id
     LEFT JOIN like_stats l ON l.post_id = p.id
     LEFT JOIN comment_stats c ON c.post_id = p.id
     ORDER BY p.created_at DESC, p.id DESC`,
    [owner],
  );
  const reels = rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    mediaUrl: r.media_url,
    mediaBlobId: r.media_blob_id,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    views: Number(r.views || 0),
    watchTimeMs: Number(r.watch_time_ms || 0),
    watchTime7dMs: Number(r.watch_time_7d_ms || 0),
    playSessions: Number(r.play_sessions || 0),
    completions: Number(r.completions || 0),
    completionRate: Number(r.completion_rate || 0),
    averageWatchRatio: Number(r.average_watch_ratio || 0),
    likes: Number(r.likes || 0),
    comments: Number(r.comments || 0),
  }));
  return {
    summary: reels.reduce((sum, reel) => ({
      reelCount: sum.reelCount + 1,
      views: sum.views + reel.views,
      watchTimeMs: sum.watchTimeMs + reel.watchTimeMs,
      watchTime7dMs: sum.watchTime7dMs + reel.watchTime7dMs,
      completions: sum.completions + reel.completions,
      playSessions: sum.playSessions + reel.playSessions,
      likes: sum.likes + reel.likes,
      comments: sum.comments + reel.comments,
    }), { reelCount: 0, views: 0, watchTimeMs: 0, watchTime7dMs: 0, completions: 0, playSessions: 0, likes: 0, comments: 0 }),
    reels,
  };
}

export async function getTrendingReelsPage({ limit = 10, beforeScore = null, beforeCreatedAt = null, beforeId = null, viewer = null } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 10, 1), 31);
  const { rows } = await pool.query(
    `WITH engagement AS (
       SELECT p.id AS post_id,
         COUNT(DISTINCT l.id)::int AS likes,
         COUNT(DISTINCT c.id)::int AS comments
       FROM posts p
       LEFT JOIN likes l ON l.post_id = p.id
       LEFT JOIN comments c ON c.post_id = p.id
       WHERE p.is_deleted = false AND p.media_type = 'video'
       GROUP BY p.id
     ),
     performance AS (
       SELECT post_id, COUNT(DISTINCT viewer)::int AS views,
         COALESCE(SUM(watched_ms), 0)::bigint AS watch_ms,
         COUNT(*) FILTER (WHERE completed)::int AS completions,
         COUNT(*)::int AS sessions
       FROM reel_watch_sessions
       WHERE updated_at >= NOW() - INTERVAL '7 days'
       GROUP BY post_id
     ),
     ranked AS (
       SELECT p.*,
         (30.0 * EXP(-GREATEST(EXTRACT(EPOCH FROM (NOW() - p.created_at)), 0) / 604800.0)
          + 5.0 * LN(1.0 + COALESCE(e.likes, 0))
          + 7.0 * LN(1.0 + COALESCE(e.comments, 0))
          + 4.0 * LN(1.0 + COALESCE(perf.views, 0))
          + 3.0 * LN(1.0 + COALESCE(perf.watch_ms, 0) / 60000.0)
          + 4.0 * CASE WHEN COALESCE(perf.sessions, 0) > 0
               THEN COALESCE(perf.completions, 0)::double precision / perf.sessions ELSE 0.0 END
         )::double precision AS reel_score
       FROM posts p
       LEFT JOIN engagement e ON e.post_id = p.id
       LEFT JOIN performance perf ON perf.post_id = p.id
       WHERE p.is_deleted = false AND p.media_type = 'video'
         AND ((p.media_url IS NOT NULL AND p.media_url <> '') OR p.media_blob_id LIKE 'posts/%')
          AND ($5::text IS NULL OR NOT EXISTS (SELECT 1 FROM blocked_users b WHERE (b.blocker = $5 AND b.blocked = p.owner) OR (b.blocker = p.owner AND b.blocked = $5)))
     )
     SELECT * FROM ranked
     WHERE $1::double precision IS NULL
        OR (reel_score, created_at, id) < ($1::double precision, $2::timestamptz, $3::text)
     ORDER BY reel_score DESC, created_at DESC, id DESC
     LIMIT $4`,
    [beforeScore, beforeCreatedAt, beforeId, safeLimit, viewer],
  );
  return rows.map((row) => ({ ...rowToPost(row), score: Number(row.reel_score) }));
}
