import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { uploadToR2, getFromR2, r2MediaUrl, sniffMime } from './services/r2.service.js';
import {
  initDb,
  getPosts, getPostById, savePost, updatePost,
  getProfile, saveProfile, getAllProfiles, getProfileStats,
  getComments, saveComment,
  getLikes, hasLiked, saveLike, removeLike,
  getMessages, getConversation, saveMessage,
  createFollow, deleteFollow, isFollowing, getFollowerCount, getFollowingCount, getFollowers, getFollowing,
  createNotification, getNotifications, markNotificationsRead, getUnreadNotificationCount,
  upsertPresence, getBatchPresence,
  getUserByAddress,
} from './data/db.js';
import {
  requireAuth, signup, login, getCurrentUser,
  requestPasswordReset, resetPassword, verifyEmail, resendVerification,
} from './services/auth.service.js';
import { getClientIp } from './utils/clientIp.js';
import { sendNotificationEmail } from './services/notification-email.service.js';
import { asyncWrapProviders } from 'async_hooks';
import { timeStamp } from 'console';

// ─── Firebase Realtime Database (fire-and-forget write) ───────────────────────
const FIREBASE_DB_URL = (process.env.FIREBASE_DB_URL || 'https://fascoin-app-default-rtdb.firebaseio.com').replace(/\/$/, '');
function fbConvId(a, b) { return [a, b].sort().join('_'); }
async function firebaseWrite(path, data) {
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/${path}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) console.warn(`[firebase] write to ${path} failed: ${res.status}`);
  } catch (err) {
    console.warn('[firebase] write error:', err.message);
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
    console.warn('[email-notif] failed:', err.message);
  }
}

let dbReady = null;
export function ensureDb() {
  if (!dbReady) dbReady = initDb().catch((e) => { dbReady = null; throw e; });
  return dbReady;
}

export function buildApp() {
  const app = express();

  const PROFILE_USERNAME_MAX_LENGTH = 32;
  const PROFILE_DISPLAY_NAME_MAX_LENGTH = 80;
  const PROFILE_BIO_MAX_LENGTH = 500;
  const PROFILE_WEBSITE_MAX_LENGTH = 200;
  const PROFILE_LOCATION_MAX_LENGTH = 80;
  const PROFILE_TWITTER_MAX_LENGTH = 50;
  const PROFILE_PROFESSION_MAX_LENGTH = 80;

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  const corsOptions = {
    origin: true, credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  };

  app.options(/.*/, cors(corsOptions));
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '10mb' }));

  app.use(async (req, res, next) => {
    try { await ensureDb(); next(); }
    catch (err) { next(err); }
  });

  // ─── Auth ──────────────────────────────────────────────────────────────────
  app.post('/api/auth/signup', async (req, res) => {
    try {
      const { username, email, password } = req.body || {};
      const result = await signup({ username, email, password });
      res.json(result);
    } catch (err) { res.status(400).json({ error: err.message || 'Signup failed' }); }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body || {};
      const result = await login({ username, password });
      res.json(result);
    } catch (err) { res.status(400).json({ error: err.message || 'Login failed' }); }
  });

  app.get('/api/auth/me', getCurrentUser);

  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const { email } = req.body || {};
      const ip = getClientIp(req);
      const result = await requestPasswordReset({ email, ip });
      res.json(result);
    } catch (err) { res.status(400).json({ error: err.message || 'Request failed' }); }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { email, code, newPassword } = req.body || {};
      const ip = getClientIp(req);
      const result = await resetPassword({ email, code, newPassword, ip });
      res.json(result);
    } catch (err) { res.status(400).json({ error: err.message || 'Reset failed' }); }
  });

  app.post('/api/auth/verify-email', async (req, res) => {
    try {
      const { token } = req.body || {};
      const result = await verifyEmail({ token });
      res.json(result);
    } catch (err) { res.status(400).json({ error: err.message || 'Verification failed' }); }
  });

  app.post('/api/auth/resend-verify', requireAuth, async (req, res) => {
    try {
      const result = await resendVerification({ userId: req.userAddress });
      res.json(result);
    } catch (err) { res.status(400).json({ error: err.message || 'Resend failed' }); }
  });

  // ─── Health ────────────────────────────────────────────────────────────────
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/config', (req, res) => {
    res.json({ status: 'ok', storage: 'r2' });
  });

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function truncateAddr(addr) {
    if (!addr) return 'Unknown';
    return addr.slice(0, 6) + '...' + addr.slice(-4);
  }
  function defaultProfile(addr) {
    return { address: addr, username: truncateAddr(addr), bio: '', displayName: '', avatarUrl: null, profession: '' };
  }
  function detectMediaType(mime) {
    if (!mime) return null;
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    return null;
  }
  function normalizeTextInput(value) {
    return typeof value === 'string' ? value.trim() : '';
  }
  function tooLongError(field, maxLength) {
    return `${field} too long (max ${maxLength} characters)`;
  }
  function validateMaxLength(res, field, value, maxLength) {
    if (value.length <= maxLength) return false;
    res.status(400).json({ error: tooLongError(field, maxLength) });
    return true;
  }

  // ─── Feed ──────────────────────────────────────────────────────────────────
  app.get('/api/feed', async (req, res) => {
    try {
      const viewer = req.query.viewer || null;
      const posts = await getPosts();
      const profiles = await getAllProfiles();
      const enriched = await Promise.all(posts.map(async p => {
        const likes = await getLikes(p.id);
        const comments = await getComments(p.id);
        const profile = profiles[p.owner] || defaultProfile(p.owner);
        const userLiked = viewer ? likes.some(l => l.owner === viewer) : false;
        return { ...p, likes: likes.length, commentCount: comments.length, profile, userLiked };
      }));
      res.json(enriched);
    } catch (err) {
      console.error('feed error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Post CRUD ─────────────────────────────────────────────────────────────
  app.post('/api/post', requireAuth, upload.single('media'), async (req, res) => {
    try {
      const title = normalizeTextInput(req.body?.title);
      const content = normalizeTextInput(req.body?.content);
      if (!title || !content) return res.status(400).json({ error: 'title and content required' });
      if (title.length > POST_TITLE_MAX_LENGTH) return res.status(400).json({ error: tooLongError('title', POST_TITLE_MAX_LENGTH) });
      if (content.length > POST_CONTENT_MAX_LENGTH) return res.status(400).json({ error: tooLongError('content', POST_CONTENT_MAX_LENGTH) });
      const effectiveOwner = req.userAddress;
      let mediaKey = null, mediaUrl = null, mediaType = null, mediaMime = null;
      if (req.file) {
        mediaMime = req.file.mimetype;
        mediaType = detectMediaType(mediaMime);
        if (!mediaType) return res.status(400).json({ error: 'Only image/* or video/* media is allowed' });
        const sniffed = sniffMime(req.file.buffer);
        if (sniffed && !['image/', 'video/'].some(p => sniffed.startsWith(p))) {
          return res.status(400).json({ error: 'Only image/* or video/* media is allowed' });
        }
        const ext = mediaMime.split('/')[1]?.replace('+xml', '') || 'bin';
        mediaKey = `posts/${uuidv4()}.${ext}`;
        const r2 = await uploadToR2(mediaKey, req.file.buffer, mediaMime);
        mediaUrl = r2.url;
      }
      const saved = await savePost({
        id: uuidv4(),
        mediaBlobId: mediaKey, mediaUrl, mediaType, mediaMime,
        owner: effectiveOwner, title, content,
        isDeleted: false,
        createdAt: new Date().toISOString(),
      });
      res.json(saved);
    } catch (err) {
      console.error('create_post error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/post/:id', async (req, res) => {
    const post = await getPostById(req.params.id);
    if (isPostUnavailable(post)) return res.status(404).json({ error: 'Not found' });
    const content = post.content || '';
    const likes = await getLikes(post.id);
    const comments = await getComments(post.id);
    const profile = (await getProfile(post.owner)) || defaultProfile(post.owner);
    res.json({ ...post, content, likes: likes.length, comments, profile });
  });

  app.put('/api/post/:id', requireAuth, async (req, res) => {
    try {
      const title = normalizeTextInput(req.body?.title);
      const content = normalizeTextInput(req.body?.content);
      if (!title || !content) return res.status(400).json({ error: 'title and content required' });
      if (title.length > POST_TITLE_MAX_LENGTH) return res.status(400).json({ error: tooLongError('title', POST_TITLE_MAX_LENGTH) });
      if (content.length > POST_CONTENT_MAX_LENGTH) return res.status(400).json({ error: tooLongError('content', POST_CONTENT_MAX_LENGTH) });
      const post = await getPostById(req.params.id);
      if (!post) return res.status(404).json({ error: 'Not found' });
      if (post.owner !== req.userAddress) return res.status(403).json({ error: 'Forbidden' });
      const updated = await updatePost(req.params.id, { title, content });
      res.json(updated);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/post/:id', requireAuth, async (req, res) => {
    try {
      const post = await getPostById(req.params.id);
      if (!post) return res.status(404).json({ error: 'Not found' });
      if (post.owner !== req.userAddress) return res.status(403).json({ error: 'Forbidden' });
      const updated = await updatePost(req.params.id, { isDeleted: true });
      if (!updated) return res.status(404).json({ error: 'Not found' });
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ─── Like ──────────────────────────────────────────────────────────────────
  app.post('/api/post/:id/like', requireAuth, async (req, res) => {
    try {
      const effectiveOwner = req.userAddress;
      const postId = req.params.id;
      const post = await getPostById(postId);
      if (isPostUnavailable(post)) return res.status(404).json({ error: 'Not found' });
      if (await hasLiked(postId, effectiveOwner)) {
        await removeLike(postId, effectiveOwner);
        const likes = await getLikes(postId);
        res.json({ liked: false, likes: likes.length });
      } else {
        await saveLike({ id: uuidv4(), postId, owner: effectiveOwner, createdAt: new Date().toISOString() });
        // Notify post owner (skip self-notification)
        if (post.owner !== effectiveOwner) {
          await createNotification({
            recipient: post.owner, type: 'like', actorAddress: effectiveOwner,
            postId, excerpt: `liked your post "${post.title.slice(0, 50)}"`,
          });
          fireEmailNotif({
            type: 'like', recipientAddress: post.owner, actorAddress: effectiveOwner,
            extra: { postId, postTitle: post.title?.slice(0, 60) },
          });
        }
        const likes = await getLikes(postId);
        res.json({ liked: true, likes: likes.length });
      }
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/post/:id/likes', async (req, res) => {
    const post = await getPostById(req.params.id);
    if (isPostUnavailable(post)) return res.status(404).json({ error: 'Not found' });
    const likes = await getLikes(req.params.id);
    res.json({ count: likes.length, likes });
  });

  // ─── Comment ───────────────────────────────────────────────────────────────
  app.post('/api/post/:id/comment', requireAuth, async (req, res) => {
    try {
      const content = normalizeTextInput(req.body?.content);
      if (!content) return res.status(400).json({ error: 'content required' });
      if (content.length > COMMENT_CONTENT_MAX_LENGTH) return res.status(400).json({ error: tooLongError('content', COMMENT_CONTENT_MAX_LENGTH) });
      const effectiveOwner = req.userAddress;
      const postId = req.params.id;
      const post = await getPostById(postId);
      if (isPostUnavailable(post)) return res.status(404).json({ error: 'Not found' });
      const comment = await saveComment({ id: uuidv4(), postId, owner: effectiveOwner, content, createdAt: new Date().toISOString() });
      // Notify post owner (skip self-notification)
      if (post.owner !== effectiveOwner) {
        await createNotification({
          recipient: post.owner, type: 'comment', actorAddress: effectiveOwner,
          postId, excerpt: content.slice(0, 80),
        });
        fireEmailNotif({
          type: 'comment', recipientAddress: post.owner, actorAddress: effectiveOwner,
          extra: { postId, postTitle: post.title?.slice(0, 60), commentText: content.slice(0, 200) },
        });
      }
      const profile = (await getProfile(effectiveOwner)) || defaultProfile(effectiveOwner);
      res.json({ ...comment, profile });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/post/:id/comments', async (req, res) => {
    const post = await getPostById(req.params.id);
    if (isPostUnavailable(post)) return res.status(404).json({ error: 'Not found' });
    const profiles = await getAllProfiles();
    const comments = await getComments(req.params.id);
    res.json(comments.map(c => ({ ...c, profile: profiles[c.owner] || defaultProfile(c.owner) })));
  });

  // ─── Profile ───────────────────────────────────────────────────────────────
  app.post('/api/profile', requireAuth, upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
  ]), async (req, res) => {
    try {
      const username = normalizeTextInput(req.body?.username);
      const bio = normalizeTextInput(req.body?.bio);
      const displayName = normalizeTextInput(req.body?.displayName);
      const website = normalizeTextInput(req.body?.website);
      const location = normalizeTextInput(req.body?.location);
      const twitter = normalizeTextInput(req.body?.twitter);
      const profession = normalizeTextInput(req.body?.profession);
      if (!username) return res.status(400).json({ error: 'username required' });
      if (validateMaxLength(res, 'username', username, PROFILE_USERNAME_MAX_LENGTH)) return;
      if (validateMaxLength(res, 'displayName', displayName, PROFILE_DISPLAY_NAME_MAX_LENGTH)) return;
      if (validateMaxLength(res, 'bio', bio, PROFILE_BIO_MAX_LENGTH)) return;
      if (validateMaxLength(res, 'website', website, PROFILE_WEBSITE_MAX_LENGTH)) return;
      if (validateMaxLength(res, 'location', location, PROFILE_LOCATION_MAX_LENGTH)) return;
      if (validateMaxLength(res, 'twitter', twitter, PROFILE_TWITTER_MAX_LENGTH)) return;
      if (validateMaxLength(res, 'profession', profession, PROFILE_PROFESSION_MAX_LENGTH)) return;
      const effectiveAddress = req.userAddress;
      const update = {
        username, bio, displayName,
        website, location, twitter,
        profession,
      };
      if (req.files?.avatar?.[0]) {
        const f = req.files.avatar[0];
        if (!f.mimetype.startsWith('image/')) return res.status(400).json({ error: 'Avatar must be an image' });
        const ext = f.mimetype.split('/')[1] || 'jpg';
        const key = `avatars/${effectiveAddress}-${Date.now()}.${ext}`;
        const r2 = await uploadToR2(key, f.buffer, f.mimetype);
        update.avatarUrl = r2.url;
      } else if (req.body.avatarUrl) {
        update.avatarUrl = String(req.body.avatarUrl);
      }
      if (req.files?.banner?.[0]) {
        const f = req.files.banner[0];
        if (!f.mimetype.startsWith('image/')) return res.status(400).json({ error: 'Banner must be an image' });
        const ext = f.mimetype.split('/')[1] || 'jpg';
        const key = `banners/${effectiveAddress}-${Date.now()}.${ext}`;
        const r2 = await uploadToR2(key, f.buffer, f.mimetype);
        update.bannerUrl = r2.url;
      } else if (req.body.bannerUrl) {
        update.bannerUrl = String(req.body.bannerUrl);
      }
      const profile = await saveProfile(effectiveAddress, update);
      res.json(profile);
    } catch (err) {
      console.error('profile error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/profile/:address', async (req, res) => {
    const targetAddr = req.params.address;
    const viewer = req.query.viewer || null;
    const profile = await getProfile(targetAddr);
    const allPosts = await getPosts();
    const posts = allPosts.filter(p => p.owner === targetAddr);
    const enrichedPosts = await Promise.all(posts.map(async p => {
      const likes = await getLikes(p.id);
      const comments = await getComments(p.id);
      const userLiked = viewer ? likes.some(l => l.owner === viewer) : false;
      return { ...p, likes: likes.length, commentCount: comments.length, userLiked };
    }));
    const totalLikes = enrichedPosts.reduce((acc, p) => acc + p.likes, 0);
    const [followerCount, followingCount] = await Promise.all([
      getFollowerCount(targetAddr),
      getFollowingCount(targetAddr),
    ]);
    res.json({
      address: targetAddr,
      ...(profile || defaultProfile(targetAddr)),
      posts: enrichedPosts, totalLikes, postCount: enrichedPosts.length,
      followerCount, followingCount,
    });
  });

  app.get('/api/profiles', async (req, res) => {
    const [profiles, stats] = await Promise.all([
      getAllProfiles(),
      getProfileStats(),
    ]);
    res.json(Object.values(profiles).map(profile => ({
      ...profile,
      postCount: stats[profile.address]?.postCount || 0,
      totalLikes: stats[profile.address]?.totalLikes || 0,
    })));
  });

  // ─── Follows ───────────────────────────────────────────────────────────────
  app.post('/api/follow', requireAuth, async (req, res) => {
    try {
      const follower = req.userAddress;
      const following = normalizeTextInput(req.body?.following);
      if (!following) return res.status(400).json({ error: 'following address required' });
      if (follower === following) return res.status(400).json({ error: 'Cannot follow yourself' });
      await createFollow(follower, following);
      await createNotification({
        recipient: following, type: 'follow', actorAddress: follower,
        excerpt: 'started following you',
      });
      fireEmailNotif({ type: 'follow', recipientAddress: following, actorAddress: follower, extra: {} });
      res.json({ ok: true, following: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/follow/:address', requireAuth, async (req, res) => {
    try {
      const follower = req.userAddress;
      const following = normalizeTextInput(req.params.address);
      if (!following) return res.status(400).json({ error: 'following address required' });
      await deleteFollow(follower, following);
      res.json({ ok: true, following: false });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/follow/status/:address', requireAuth, async (req, res) => {
    try {
      const target = normalizeTextInput(req.params.address);
      if (!target) return res.status(400).json({ error: 'following address required' });
      const following = await isFollowing(req.userAddress, target);
      res.json({ following });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/profile/:address/followers', async (req, res) => {
    try {
      const followers = await getFollowers(req.params.address);
      const profiles = await getAllProfiles();
      res.json(followers.map(f => ({ ...f, profile: profiles[f.address] || defaultProfile(f.address) })));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/profile/:address/following', async (req, res) => {
    try {
      const following = await getFollowing(req.params.address);
      const profiles = await getAllProfiles();
      res.json(following.map(f => ({ ...f, profile: profiles[f.address] || defaultProfile(f.address) })));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ─── Notifications ─────────────────────────────────────────────────────────
  app.get('/api/notifications', requireAuth, async (req, res) => {
    try {
      const notifications = await getNotifications(req.userAddress);
      const profiles = await getAllProfiles();
      res.json(notifications.map(n => ({
        ...n,
        actorProfile: profiles[n.actorAddress] || defaultProfile(n.actorAddress),
      })));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.put('/api/notifications/read', requireAuth, async (req, res) => {
    try {
      await markNotificationsRead(req.userAddress);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/notifications/unread-count', requireAuth, async (req, res) => {
    try {
      const count = await getUnreadNotificationCount(req.userAddress);
      res.json({ count });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ─── Presence ──────────────────────────────────────────────────────────────
  app.post('/api/presence/heartbeat', requireAuth, async (req, res) => {
    try {
      await upsertPresence(req.userAddress);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/presence/batch', async (req, res) => {
    try {
      const addresses = (req.query.addresses || '').split(',').filter(Boolean);
      const presence = await getBatchPresence(addresses);
      res.json(presence);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ─── Messages ──────────────────────────────────────────────────────────────
  app.post('/api/message', requireAuth, async (req, res) => {
    try {
      const receiver = normalizeTextInput(req.body?.receiver);
      const content = normalizeTextInput(req.body?.content);
      if (!receiver || !content) return res.status(400).json({ error: 'receiver and content required' });
      if (content.length > MESSAGE_CONTENT_MAX_LENGTH) return res.status(400).json({ error: tooLongError('content', MESSAGE_CONTENT_MAX_LENGTH) });
      const effectiveSender = req.userAddress;
      const message = await saveMessage({
        id: uuidv4(), sender: effectiveSender, receiver, content,
        createdAt: new Date().toISOString(),
      });
      // Write to Firebase Realtime DB for real-time delivery (fire-and-forget)
      firebaseWrite(
        `conversations/${fbConvId(effectiveSender, receiver)}/messages/${message.id}`,
        { id: message.id, sender: effectiveSender, receiver, content, createdAt: message.createdAt }
      );
      // Notify the receiver of the new message
      if (receiver !== effectiveSender) {
        await createNotification({
          recipient: receiver, type: 'message', actorAddress: effectiveSender,
          excerpt: content.slice(0, 80),
        });
        fireEmailNotif({
          type: 'message', recipientAddress: receiver, actorAddress: effectiveSender,
          extra: { messagePreview: content.slice(0, 200) },
        });
      }
      res.json(message);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/messages/:address', requireAuth, async (req, res) => {
    if (req.params.address !== req.userAddress) return res.status(403).json({ error: 'Forbidden' });
    const messages = await getMessages(req.userAddress);
    const profiles = await getAllProfiles();
    const enriched = messages.map(m => ({
      ...m,
      senderProfile: profiles[m.sender] || defaultProfile(m.sender),
      receiverProfile: profiles[m.receiver] || defaultProfile(m.receiver),
    }));
    res.json(enriched);
  });

  app.get('/api/conversation', requireAuth, async (req, res) => {
    const { a, b } = req.query;
    if (!a || !b) return res.status(400).json({ error: 'a and b addresses required' });
    if (a !== req.userAddress && b !== req.userAddress) return res.status(403).json({ error: 'Forbidden' });
    const messages = await getConversation(a, b);
    res.json(messages);
  });

  // ─── Push Tokens ───────────────────────────────────────────────────────────
  app.post('/api/push-token', requireAuth, async (req, res) => {
    try {
      const { token, platform = 'unknown' } = req.body;
      if (!token) return res.status(400).json({ error: 'token required' });
      await pool.query(
        `INSERT INTO push_tokens (user_address, token, platform)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_address, token) DO UPDATE SET platform = $3`,
        [req.userAddress, token, platform]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error('[push-token]', e.message);
      res.status(500).json({ error: 'Failed to register push token' });
    }
  });

  // ─── R2 Media Proxy ────────────────────────────────────────────────────────
  // Serves media stored in Cloudflare R2. Use CF_R2_PUBLIC_BASE env var to
  // bypass this proxy and serve directly from R2/CDN in production.
  app.get(/^\/api\/media\/(.+)$/, async (req, res) => {
    try {
      const key = req.params[0];
      if (!key) return res.status(400).json({ error: 'key required' });
      const r2Res = await getFromR2(key);
      const contentType = r2Res.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      const ct = r2Res.headers.get('content-length');
      if (ct) res.setHeader('Content-Length', ct);
      // Stream the R2 response body to the client
      const { Readable } = await import('stream');
      const nodeStream = Readable.fromWeb ? Readable.fromWeb(r2Res.body) : r2Res.body;
      nodeStream.pipe(res);
    } catch (err) {
      console.error('[media-proxy]', err.message);
      res.status(404).json({ error: 'Media not found' });
    }
  });

  // ─── Stats ─────────────────────────────────────────────────────────────────
  app.get('/api/stats', async (req, res) => {
    const posts = await getPosts();
    const profiles = await getAllProfiles();
    let totalLikes = 0, totalComments = 0;
    for (const p of posts) {
      totalLikes += (await getLikes(p.id)).length;
      totalComments += (await getComments(p.id)).length;
    }
    res.json({
      totalPosts: posts.length,
      totalProfiles: Object.keys(profiles).length,
      totalLikes, totalComments, walletAddress: senderAddress,
    });
  });

  return app;
}
