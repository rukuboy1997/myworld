import { getAuthToken } from "./auth.jsx";

const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "") + "/api";

function authHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readResponse(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || fallback);
  return data;
}

function putFile(url, headers, file, onUploadProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers || {})) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onUploadProgress) {
        onUploadProgress(event.loaded / event.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("Direct media upload failed. Please try again."));
    };
    xhr.onerror = () => reject(new Error("Network error during media upload"));
    xhr.onabort = () => reject(new Error("Media upload was interrupted"));
    xhr.send(file);
  });
}

/**
 * Upload a post's media directly to R2 using a short-lived, server-authorized
 * intent. The backend remains responsible for size/quota/signature/duration
 * verification before the post can attach the completed intent.
 */
export async function uploadPostMediaDirectly(file, onUploadProgress) {
  const contentType = (file.type || "").toLowerCase();
  const mediaType = contentType.startsWith("image/")
    ? "image"
    : contentType.startsWith("video/")
      ? "video"
      : null;
  const allowedTypes = new Set([
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "video/mp4", "video/webm", "video/quicktime",
  ]);
  if (!mediaType || !allowedTypes.has(contentType)) {
    throw new Error("Choose a supported image (JPEG, PNG, WebP, GIF) or video (MP4, WebM, MOV).");
  }

  const intentResponse = await fetch(`${BASE}/media/upload-intents`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      category: "post",
      mediaType,
      contentType,
      sizeBytes: file.size,
    }),
  });
  const intent = await readResponse(intentResponse, "Could not authorize media upload");
  if (!intent.intentId || !intent.uploadUrl || !intent.headers) {
    throw new Error("The server returned an incomplete upload authorization.");
  }

  await putFile(intent.uploadUrl, intent.headers, file, onUploadProgress);

  const completionResponse = await fetch(
    `${BASE}/media/upload-intents/${encodeURIComponent(intent.intentId)}/complete`,
    {
      method: "POST",
      headers: { ...authHeaders() },
    },
  );
  const completed = await readResponse(
    completionResponse,
    "The server could not verify the uploaded media",
  );
  if (completed.status !== "completed" && completed.completed !== true) {
    // Accept only the documented successful completion shapes; do not publish
    // against a merely pending intent.
    if (!completed.ok) throw new Error("Media upload verification did not complete.");
  }

  if (onUploadProgress) onUploadProgress(1);
  return { intentId: intent.intentId };
}
