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
  id          TEXT PRIMARY KEY,
  sender      TEXT NOT NULL,
  receiver    TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS follows (
  follower    TEXT NOT NULL,
  following   TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower, following)
);

CREATE TABLE IF NOT EXISTS reports (
  id              TEXT PRIMARY KEY,
  post_id         TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reporter        TEXT NOT NULL,
  reason          TEXT NOT NULL,
  description     TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, reporter)
);

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
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profession TEXT DEFAULT '';
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

function rowToMessage(r) {
  if (!r) return null;
  return {
    id: r.id,
    sender: r.sender,
    receiver: r.receiver,
    content: r.content,
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
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
export async function getPostsPage({ limit = 20, beforeCreatedAt = null, beforeId = null } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 51);
  const { rows } = await pool.query(
    `SELECT *
     FROM posts
     WHERE is_deleted = false
       AND (
         $1::timestamptz IS NULL
         OR (created_at, id) < ($1::timestamptz, $2::text)
       )
     ORDER BY created_at DESC, id DESC
     LIMIT $3`,
    [beforeCreatedAt, beforeId, safeLimit],
  );
  return rows.map(rowToPost);
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

// ─── Messages ────────────────────────────────────────────────────────────────
export async function getMessages(address) {
  const { rows } = await pool.query(
    `SELECT * FROM messages WHERE sender = $1 OR receiver = $1 ORDER BY created_at ASC`,
    [address],
  );
  return rows.map(rowToMessage);
}

export async function getConversation(a, b) {
  const { rows } = await pool.query(
    `SELECT * FROM messages WHERE (sender=$1 AND receiver=$2) OR (sender=$2 AND receiver=$1) ORDER BY created_at ASC`,
    [a, b],
  );
  return rows.map(rowToMessage);
}

export async function saveMessage(message) {
  const id = message.id || uuidv4();
  await pool.query(
    `INSERT INTO messages (id, sender, receiver, content, created_at) VALUES ($1,$2,$3,$4,$5)`,
    [
      id,
      message.sender,
      message.receiver,
      message.content,
      message.createdAt || new Date().toISOString(),
    ],
  );
  return { ...message, id };
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


// ─── Post Reports ─────────────────────────────────────────────────────────────
export async function saveReport({ postId, reporter, reason, description }) {
  const id = uuidv4();
  const { rows } = await pool.query(
    `INSERT INTO reports (id, post_id, reporter, reason, description, created_at)
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (post_id, reporter)
     DO UPDATE SET reason = EXCLUDED.reason,
                   description = EXCLUDED.description,
                   created_at = NOW()
     RETURNING id, post_id, reporter, reason, description, created_at`,
    [id, postId, reporter, reason, description || ""],
  );
  return rows[0];
}

// ─── Notifications ────────────────────────────────────────────────────────────
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

