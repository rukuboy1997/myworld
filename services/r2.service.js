import { createHash, createHmac } from "node:crypto";

/**
 * Cloudflare R2 storage service.
 * Uses the Cloudflare REST API with a CF API Token.
 * Set CF_ACCOUNT_ID, CF_API_TOKEN, CF_R2_BUCKET env vars.
 * Optionally set CF_R2_PUBLIC_BASE to a public R2 URL (e.g. a custom domain or
 * r2.dev subdomain) for direct media access; otherwise the backend proxy is used.
 */

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "";
const CF_API_TOKEN = process.env.CF_API_TOKEN || "";
const CF_R2_BUCKET = process.env.CF_R2_BUCKET || "myworld";
// Optional: If you enable public access on your R2 bucket, set this to the public base URL
// e.g. "https://pub-abc123.r2.dev" or "https://media.yoursite.com"
const CF_R2_PUBLIC_BASE = (process.env.CF_R2_PUBLIC_BASE || "").replace(
  /\/$/,
  "",
);
// Backend URL used for the media proxy fallback (empty = relative path, works via Vite proxy in dev)
const BACKEND_URL = (process.env.BACKEND_URL || "").replace(/\/$/, "");

function r2ObjectUrl(key) {
  if (!CF_ACCOUNT_ID || !CF_R2_BUCKET) return null;
  return `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/${encodeURIComponent(CF_R2_BUCKET)}/objects/${key}`;
}

/**
 * Upload a buffer/blob to Cloudflare R2.
 * @param {string} key  - object key e.g. "avatars/0x123.jpg"
 * @param {Buffer} buffer
 * @param {string} contentType - MIME type
 * @returns {{ key: string, url: string }}
 */
export async function uploadToR2(
  key,
  buffer,
  contentType = "application/octet-stream",
) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new Error(
      "R2 not configured: set CF_ACCOUNT_ID and CF_API_TOKEN env vars",
    );
  }
  const url = r2ObjectUrl(key);
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": contentType,
    },
    body: buffer,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`R2 upload failed (${res.status}): ${text}`);
  }
  return { key, url: r2MediaUrl(key) };
}

/**
 * Delete an object from R2 by its stable object key.
 */
export async function deleteFromR2(key) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new Error("R2 not configured");
  }
  const url = r2ObjectUrl(key);
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${CF_API_TOKEN}` },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`R2 delete failed (${res.status}): ${text}`);
  }
  return true;
}

/**
 * Stream an object from R2 — used by the /api/media/:key proxy endpoint.
 * Returns the raw fetch Response so the caller can pipe headers + body.
 */
export async function getFromR2(key) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new Error("R2 not configured");
  }
  const url = r2ObjectUrl(key);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${CF_API_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`R2 fetch failed (${res.status})`);
  }
  return res;
}

/**
 * Return the public URL for a given R2 key.
 * - If CF_R2_PUBLIC_BASE is set, use that (direct R2 public access / custom domain).
 * - Otherwise, proxy through the backend /api/media/:key endpoint.
 */
export function r2MediaUrl(key) {
  if (!key) return null;
  if (CF_R2_PUBLIC_BASE) return `${CF_R2_PUBLIC_BASE}/${key}`;
  return `${BACKEND_URL}/api/media/${key}`;
}

/**
 * Detect a simple MIME type from buffer magic bytes (for server-side validation).
 */
export function sniffMime(buf) {
  if (!buf || buf.length < 4) return null;
  const b = buf;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38)
    return "image/gif";
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return "image/webp";
  if (
    b.length >= 12 &&
    b[4] === 0x66 &&
    b[5] === 0x74 &&
    b[6] === 0x79 &&
    b[7] === 0x70
  )
    return "video/mp4";
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3)
    return "video/webm";
  return null;
}

const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const AWS_REGION = "auto";
const AWS_SERVICE = "s3";

function awsEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    "%" + char.charCodeAt(0).toString(16).toUpperCase(),
  );
}

function encodeObjectKey(key) {
  return String(key).split("/").map(awsEncode).join("/");
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key, value, encoding) {
  return createHmac("sha256", key).update(value).digest(encoding);
}

/**
 * Create a short-lived, content-type-bound R2 S3 presigned PUT URL.
 * Requires R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY (S3 API credentials),
 * separate from the Cloudflare REST API token used by existing uploads.
 *
 * The caller must send the returned requiredHeaders exactly as provided.
 */
export function createPresignedR2Upload({
  key,
  contentType,
  expiresIn = 300,
  now = new Date(),
  credentials = {
    accountId: CF_ACCOUNT_ID,
    bucket: CF_R2_BUCKET,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
} = {}) {
  if (!key || typeof key !== "string" || key.startsWith("/") || key.includes("..")) {
    throw new Error("A safe R2 object key is required");
  }
  if (!contentType || typeof contentType !== "string" || /[\r\n]/.test(contentType)) {
    throw new Error("A valid content type is required");
  }
  if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 900) {
    throw new Error("Presigned upload expiry must be between 1 and 900 seconds");
  }
  const { accountId, bucket, accessKeyId, secretAccessKey } = credentials || {};
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Direct R2 uploads are not configured: set CF_ACCOUNT_ID, CF_R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY",
    );
  }

  const host = accountId + ".r2.cloudflarestorage.com";
  const date = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const shortDate = date.slice(0, 8);
  const scope = shortDate + "/" + AWS_REGION + "/" + AWS_SERVICE + "/aws4_request";
  const canonicalUri = "/" + awsEncode(bucket) + "/" + encodeObjectKey(key);
  const signedHeaders = "content-type;host";
  const query = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": accessKeyId + "/" + scope,
    "X-Amz-Date": date,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((name) => awsEncode(name) + "=" + awsEncode(query[name]))
    .join("&");
  const canonicalHeaders = "content-type:" + contentType.trim() + "\n" + "host:" + host + "\n";
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    date,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const kDate = hmac("AWS4" + secretAccessKey, shortDate);
  const kRegion = hmac(kDate, AWS_REGION);
  const kService = hmac(kRegion, AWS_SERVICE);
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign, "hex");
  const url = "https://" + host + canonicalUri + "?" + canonicalQuery +
    "&X-Amz-Signature=" + signature;

  return {
    url,
    key,
    expiresIn,
    requiredHeaders: { "Content-Type": contentType.trim() },
  };
}
