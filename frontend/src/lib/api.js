import { getAuthToken } from './auth.jsx';

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';

function authHeaders() {
  const token = getAuthToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

async function requestForm(method, path, formData) {
  const res = await fetch(`${BASE}${path}`, {
    method, body: formData, headers: { ...authHeaders() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// ─── Feed ─────────────────────────────────────────────────────────────────────
export const getFeed = (viewer) => request('GET', `/feed${viewer ? `?viewer=${encodeURIComponent(viewer)}` : ''}`);

// ─── Stats ────────────────────────────────────────────────────────────────────
export const getStats = () => request('GET', '/stats');

// ─── Posts ────────────────────────────────────────────────────────────────────
export const getPost = (id) => request('GET', `/post/${id}`);

export const createPost = async ({ title, content, owner, media }) => {
  if (media) {
    const fd = new FormData();
    fd.append('title', title);
    fd.append('content', content);
    if (owner) fd.append('owner', owner);
    fd.append('media', media);
    return requestForm('POST', '/post', fd);
  }
  const payload = { title, content };
  if (owner) payload.owner = owner;
  return request('POST', '/post', payload);
};

export const updatePost = (id, data) => request('PUT', `/post/${id}`, data);
export const deletePost = (id) => request('DELETE', `/post/${id}`);

// ─── Likes ────────────────────────────────────────────────────────────────────
export const likePost = (id, owner) => request('POST', `/post/${id}/like`, { owner });
export const getPostLikes = (id) => request('GET', `/post/${id}/likes`);

// ─── Comments ─────────────────────────────────────────────────────────────────
export const getComments = (id) => request('GET', `/post/${id}/comments`);
export const addComment = (id, owner, content) =>
  request('POST', `/post/${id}/comment`, { owner, content });

// ─── Profiles ─────────────────────────────────────────────────────────────────
export const getProfile = (address, viewer) => request('GET', `/profile/${address}${viewer ? `?viewer=${encodeURIComponent(viewer)}` : ''}`);

export const createProfile = async (data) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    fd.append(k, v);
  }
  return requestForm('POST', '/profile', fd);
};

export const getAllProfiles = () => request('GET', '/profiles');

// ─── Follows ──────────────────────────────────────────────────────────────────
export const followUser = (address) => request('POST', '/follow', { following: address });
export const unfollowUser = (address) => request('DELETE', `/follow/${address}`);
export const getFollowStatus = (address) => request('GET', `/follow/status/${address}`);
export const getFollowers = (address) => request('GET', `/profile/${address}/followers`);
export const getFollowing = (address) => request('GET', `/profile/${address}/following`);

// ─── Notifications ────────────────────────────────────────────────────────────
export const getNotifications = () => request('GET', '/notifications');
export const markNotificationsRead = () => request('PUT', '/notifications/read', {});
export const getUnreadNotificationCount = () => request('GET', '/notifications/unread-count');

// ─── Presence ─────────────────────────────────────────────────────────────────
export const sendHeartbeat = () => request('POST', '/presence/heartbeat', {});
export const getPresenceBatch = (addresses) =>
  request('GET', `/presence/batch?addresses=${addresses.map(encodeURIComponent).join(',')}`);

// ─── Messages ─────────────────────────────────────────────────────────────────
export const getMessages = (address) => request('GET', `/messages/${address}`);
export const sendMessage = (data) => request('POST', '/message', data);
export const getConversation = (a, b) =>
  request('GET', `/conversation?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);

// ─── Email verification ───────────────────────────────────────────────────────
export const verifyEmail = (token) => request('POST', '/auth/verify-email', { token });
export const resendVerification = () => request('POST', '/auth/resend-verify', {});

// ─── Health ───────────────────────────────────────────────────────────────────
export const getHealth = () => request('GET', '/health');

// ─── Address helpers ──────────────────────────────────────────────────────────
export function truncateAddress(addr) {
  if (!addr) return '';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}
