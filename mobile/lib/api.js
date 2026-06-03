let _authToken = null;

export function setApiToken(token) {
  _authToken = token;
}

export function getApiToken() {
  return _authToken;
}

export function getApiUrl() {
  return "https://myworld-api.vercel.app".replace(/\/$/, "");
}

const BASE = () => `${getApiUrl()}/api`;

function authHeaders() {
  return _authToken ? { Authorization: `Bearer ${_authToken}` } : {};
}

async function request(method, path, body) {
  const res = await fetch(`${BASE()}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

async function requestForm(method, path, form) {
  const res = await fetch(`${BASE()}${path}`, {
    method,
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authSignup = (data) => request("POST", "/auth/signup", data);

export const authLogin = (data) => request("POST", "/auth/login", data);

export const authMe = () => request("GET", "/auth/me");

export const authForgotPassword = (email) =>
  request("POST", "/auth/forgot-password", { email });

export const authResetPassword = (data) =>
  request("POST", "/auth/reset-password", data);

// ─── Push Tokens ───────────────────────────────────────────────────────────────
export const registerPushToken = (token, platform) =>
  request("POST", "/push-token", { token, platform });

// ─── Feed ─────────────────────────────────────────────────────────────────────
export const getFeed = (viewer) =>
  request(
    "GET",
    `/feed${viewer ? `?viewer=${encodeURIComponent(viewer)}` : ""}`,
  );

// ─── Posts ────────────────────────────────────────────────────────────────────
export const getPost = (id) => request("GET", `/post/${id}`);

export const createPost = (data) => request("POST", "/post", data);

export const deletePost = (id) => request("DELETE", `/post/${id}`);

// ─── Likes ────────────────────────────────────────────────────────────────────
export const likePost = (id) => request("POST", `/post/${id}/like`, {});

// ─── Comments ─────────────────────────────────────────────────────────────────
export const getComments = (id) => request("GET", `/post/${id}/comments`);
export const addComment = (id, content) =>
  request("POST", `/post/${id}/comment`, { content });

// ─── Profiles ─────────────────────────────────────────────────────────────────
export const getProfile = (address, viewer) =>
  request(
    "GET",
    `/profile/${address}${viewer ? `?viewer=${encodeURIComponent(viewer)}` : ""}`,
  );

export const getAllProfiles = () => request("GET", "/profiles");

export const updateProfile = (data) => request("POST", "/profile", data);

export const uploadProfileMedia = (field, uri, filename) => {
  const form = new FormData();
  form.append(field, {
    uri,
    name: filename || "image.jpg",
    type: "image/jpeg",
  });
  return requestForm("POST", `/profile/${field}`, form);
};

// ─── Follows ──────────────────────────────────────────────────────────────────
export const followUser = (address) =>
  request("POST", "/follow", { following: address });

export const unfollowUser = (address) =>
  request("DELETE", `/follow/${address}`);

export const getFollowStatus = (address) =>
  request("GET", `/follow/status/${address}`);

// ─── Messages ─────────────────────────────────────────────────────────────────
export const getMessages = (address) => request("GET", `/messages/${address}`);
export const sendMessage = (receiver, content) =>
  request("POST", "/message", { receiver, content });
export const getConversation = (a, b) =>
  request(
    "GET",
    `/conversation?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`,
  );

// ─── Notifications ────────────────────────────────────────────────────────────
export const getNotifications = () => request("GET", "/notifications");
export const markNotificationsRead = () =>
  request("PUT", "/notifications/read", {});
export const getUnreadCount = () =>
  request("GET", "/notifications/unread-count");

// ─── Presence ─────────────────────────────────────────────────────────────────
export const sendHeartbeat = () => request("POST", "/presence/heartbeat", {});
export const getPresenceBatch = (addresses) =>
  request(
    "GET",
    `/presence/batch?addresses=${addresses.map(encodeURIComponent).join(",")}`,
  );

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function truncateAddress(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

export function timeAgo(date) {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return `${Math.floor(diff / 604800)}w`;
}
