import { getAuthToken } from "./auth.jsx";

const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "") + "/api";

function authHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(method, path, body) {
  const headers = { ...authHeaders() };

  // Only send JSON Content-Type when a JSON body exists. Sending
  // Content-Type: application/json on a body-less GET forces an unnecessary
  // CORS preflight in the browser.
  if (body !== undefined && body !== null) {
    headers["Content-Type"] = "application/json";
  }

  const opts = {
    method,
    headers,
  };

  if (body !== undefined && body !== null) {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

async function requestForm(method, path, formData) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    body: formData,
    headers: { ...authHeaders() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

// ─── Feed ─────────────────────────────────────────────────────────────────────
export const getFeed = (viewer, { cursor = null, limit = 20, sort = "latest" } = {}) => {
  const params = new URLSearchParams({ limit: String(limit), sort });
  if (viewer) params.set("viewer", viewer);
  if (cursor) params.set("cursor", cursor);
  return request("GET", `/feed?${params.toString()}`);
};

export const getReels = ({ cursor = null, limit = 10, sort = "for-you" } = {}) => {
  const params = new URLSearchParams({ limit: String(limit), sort });
  if (cursor) params.set("cursor", cursor);
  return request("GET", `/reels?${params.toString()}`);
};

export const recordReelWatch = (postId, data) =>
  request("POST", `/reels/${encodeURIComponent(postId)}/watch`, data);

export const getReelAnalytics = () => request("GET", "/reels/analytics");

// ─── Membership ──────────────────────────────────────────────────────────────
export const getMyMembership = () => request("GET", "/membership/me");

// ─── Stats ────────────────────────────────────────────────────────────────────
export const getStats = () => request("GET", "/stats");

// ─── Posts ────────────────────────────────────────────────────────────────────
export const getPost = (id) => request("GET", `/post/${id}`);

export const createPost = async ({
  title,
  content,
  owner,
  media,
  onUploadProgress,
}) => {
  if (media && import.meta.env.VITE_ENABLE_DIRECT_R2_UPLOADS === "true") {
    const { uploadPostMediaDirectly } = await import("./mediaUpload.js");
    const completed = await uploadPostMediaDirectly(media, onUploadProgress);
    const payload = { title, content, mediaIntentId: completed.intentId };
    if (owner) payload.owner = owner;
    return request("POST", "/post", payload);
  }

  if (media) {
    const fd = new FormData();
    fd.append("title", title);
    fd.append("content", content);
    if (owner) fd.append("owner", owner);
    fd.append("media", media);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${BASE}/post`);
      const token = getAuthToken();
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onUploadProgress)
          onUploadProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) resolve(data);
          else reject(new Error(data.error || "Upload failed"));
        } catch {
          reject(new Error("Upload failed"));
        }
      };
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.send(fd);
    });
  }
  const payload = { title, content };
  if (owner) payload.owner = owner;
  return request("POST", "/post", payload);
};

export const updatePost = (id, data) => request("PUT", `/post/${id}`, data);
export const deletePost = (id) => request("DELETE", `/post/${id}`);
export const reportPost = (id, reason, description) =>
  request("POST", `/post/${id}/report`, { reason, description });
export const getPostOwner = (id) => request("GET", `/post/${id}/owner`);

// ─── Likes ────────────────────────────────────────────────────────────────────
export const likePost = (id, owner) =>
  request("POST", `/post/${id}/like`, { owner });
export const getPostLikes = (id) => request("GET", `/post/${id}/likes`);

// ─── Comments ─────────────────────────────────────────────────────────────────
export const getComments = (id) => request("GET", `/post/${id}/comments`);
export const addComment = (id, owner, content) =>
  request("POST", `/post/${id}/comment`, { owner, content });

// ─── Profiles ─────────────────────────────────────────────────────────────────
export const getProfile = (address, viewer) =>
  request(
    "GET",
    `/profile/${address}${viewer ? `?viewer=${encodeURIComponent(viewer)}` : ""}`,
  );

export const createProfile = async (data) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    fd.append(k, v);
  }
  return requestForm("POST", "/profile", fd);
};

export const getAllProfiles = () => request("GET", "/profiles");

// ─── Follows ──────────────────────────────────────────────────────────────────
export const followUser = (address) =>
  request("POST", "/follow", { following: address });
export const unfollowUser = (address) =>
  request("DELETE", `/follow/${address}`);
export const getFollowStatus = (address) =>
  request("GET", `/follow/status/${address}`);
export const getFollowers = (address) =>
  request("GET", `/profile/${address}/followers`);
export const getFollowing = (address) =>
  request("GET", `/profile/${address}/following`);

// ─── Admin moderation ─────────────────────────────────────────────────────────
export const getAdminReports = (status = "pending", priority = "all") =>
  request("GET", `/admin/reports?status=${encodeURIComponent(status)}&priority=${encodeURIComponent(priority)}`);
export const moderateReport = (id, action) =>
  request("PATCH", `/admin/reports/${encodeURIComponent(id)}`, { action });
export const moderateReportPriority = (id, priority, note = "") =>
  request("PATCH", `/admin/reports/${encodeURIComponent(id)}/priority`, { priority, note });

export const getAdminUsers = ({ status = "all", search = "", limit = 100 } = {}) => {
  const params = new URLSearchParams({ status, limit: String(limit) });
  if (search) params.set("search", search);
  return request("GET", `/admin/users?${params.toString()}`);
};
export const moderateAdminUser = (address, action, reason = "") =>
  request("PATCH", `/admin/users/${encodeURIComponent(address)}`, { action, reason });
export const getAdminAuditLog = (limit = 100) =>
  request("GET", `/admin/audit?limit=${encodeURIComponent(limit)}`);
export const getAdminAlertDeliveries = (limit = 100) =>
  request("GET", `/admin/alerts?limit=${encodeURIComponent(limit)}`);
export const getAdminIncidents = (status = "active", limit = 100) =>
  request("GET", `/admin/incidents?status=${encodeURIComponent(status)}&limit=${encodeURIComponent(limit)}`);
export const updateAdminIncident = (reportId, action, note = "", assignedTo = null) =>
  request("PATCH", `/admin/incidents/${encodeURIComponent(reportId)}`, { action, note, assignedTo });


// ─── Safety & Privacy ────────────────────────────────────────────────────────
export const getBlockStatus = (address) =>
  request("GET", `/users/${encodeURIComponent(address)}/block-status`);
export const getBlockedUsers = () => request("GET", "/blocks");
export const blockUser = (address) =>
  request("POST", `/users/${encodeURIComponent(address)}/block`, {});
export const unblockUser = (address) =>
  request("DELETE", `/users/${encodeURIComponent(address)}/block`);
export const reportUser = (address, reason, description = "") =>
  request("POST", `/users/${encodeURIComponent(address)}/report`, { reason, description });

// ─── Notifications ────────────────────────────────────────────────────────────
export const getNotifications = () => request("GET", "/notifications");
export const registerPushToken = (token, platform = "unknown") =>
  request("POST", "/push-token", { token, platform });
export const markNotificationsRead = () =>
  request("PUT", "/notifications/read", {});
export const getUnreadNotificationCount = () =>
  request("GET", "/notifications/unread-count");

// ─── Presence ─────────────────────────────────────────────────────────────────
export const sendHeartbeat = () => request("POST", "/presence/heartbeat", {});
export const getPresenceBatch = (addresses) =>
  request(
    "GET",
    `/presence/batch?addresses=${addresses.map(encodeURIComponent).join(",")}`,
  );

// ─── Messages ─────────────────────────────────────────────────────────────────
export const getMessages = (address) => request("GET", `/messages/${address}`);
export const getUnreadMessageCounts = () => request("GET", "/messages/unread-count");
export const getPinnedConversations = () => request("GET", "/conversations/pinned");
export const setConversationPinned = (otherAddress, pinned) =>
  request("PUT", "/conversation/pin", { otherAddress, pinned });
export const sendMessage = (data) => request("POST", "/message", data);
export const editMessage = (id, content) =>
  request("PUT", `/message/${encodeURIComponent(id)}`, { content });
export const deleteMessage = (id) =>
  request("DELETE", `/message/${encodeURIComponent(id)}`);
export const setMessageReaction = (id, emoji) =>
  request("POST", `/message/${encodeURIComponent(id)}/reaction`, { emoji });

export const uploadMessageAttachment = (receiver, file, content = "", onProgress, replyToMessageId = null) =>
  new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("receiver", receiver);
    form.append("content", content);
    if (replyToMessageId) form.append("replyToMessageId", replyToMessageId);
    form.append("file", file, file.name);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/message/attachment`);
    const token = getAuthToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(Math.round(event.loaded / event.total * 100));
    };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || "Attachment upload failed"));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading attachment"));
    xhr.onabort = () => reject(new Error("Attachment upload was cancelled"));
    xhr.send(form);
  });
export const getConversation = (a, b, { limit = 100, beforeCreatedAt = null, beforeId = null } = {}) => {
  const params = new URLSearchParams({
    a,
    b,
    limit: String(limit),
  });
  if (beforeCreatedAt && beforeId) {
    params.set("beforeCreatedAt", beforeCreatedAt);
    params.set("beforeId", beforeId);
  }
  return request("GET", `/conversation?${params.toString()}`);
};
export const markConversationRead = (otherAddress) =>
  request("PUT", "/conversation/read", { otherAddress });
export const setConversationTyping = (otherAddress, typing) =>
  request("POST", "/conversation/typing", { otherAddress, typing });
export const getConversationTyping = (otherAddress) =>
  request("GET", `/conversation/typing?otherAddress=${encodeURIComponent(otherAddress)}`);
export const getConversationsTyping = (addresses) =>
  request(
    "GET",
    `/conversations/typing?addresses=${addresses.map(encodeURIComponent).join(",")}`,
  );

export const prepareRealtimeConversations = (otherAddresses) =>
  request("POST", "/conversations/realtime", {
    otherAddresses: Array.isArray(otherAddresses) ? otherAddresses : [],
  });

// ─── Email verification ───────────────────────────────────────────────────────
export const verifyEmail = (token) =>
  request("POST", "/auth/verify-email", { token });
export const resendVerification = () =>
  request("POST", "/auth/resend-verify", {});

// ─── Health ───────────────────────────────────────────────────────────────────
export const getHealth = () => request("GET", "/health");

// ─── Address helpers ──────────────────────────────────────────────────────────
export function truncateAddress(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}


// ─── Status ────────────────────────────────────────────────────────────────────
export const getStatuses = () => request("GET", "/statuses");
export const createStatus = (formData) => requestForm("POST", "/statuses", formData);
export const recordStatusView = (statusId) => request("POST", `/statuses/${encodeURIComponent(statusId)}/view`, {});
export const getStatusViewers = (statusId) => request("GET", `/statuses/${encodeURIComponent(statusId)}/viewers`);

export async function getStatusMedia(statusId) {
  const res = await fetch(`${BASE}/statuses/${encodeURIComponent(statusId)}/media`, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Couldn't load status media");
  }
  return res.blob();
}
