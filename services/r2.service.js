/**
 * Cloudflare R2 storage service.
 * Uses the Cloudflare REST API with a CF API Token.
 * Set CF_ACCOUNT_ID, CF_API_TOKEN, CF_R2_BUCKET env vars.
 * Optionally set CF_R2_PUBLIC_BASE to a public R2 URL (e.g. a custom domain or
 * r2.dev subdomain) for direct media access; otherwise the backend proxy is used.
 */

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || '';
const CF_API_TOKEN  = process.env.CF_API_TOKEN  || '';
const CF_R2_BUCKET  = process.env.CF_R2_BUCKET  || 'myworld';
// Optional: If you enable public access on your R2 bucket, set this to the public base URL
// e.g. "https://pub-abc123.r2.dev" or "https://media.yoursite.com"
const CF_R2_PUBLIC_BASE = (process.env.CF_R2_PUBLIC_BASE || '').replace(/\/$/, '');
// Backend URL used for the media proxy fallback (empty = relative path, works via Vite proxy in dev)
const BACKEND_URL = (process.env.BACKEND_URL || '').replace(/\/$/, '');

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
export async function uploadToR2(key, buffer, contentType = 'application/octet-stream') {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new Error('R2 not configured: set CF_ACCOUNT_ID and CF_API_TOKEN env vars');
  }
  const url = r2ObjectUrl(key);
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': contentType,
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
 * Stream an object from R2 — used by the /api/media/:key proxy endpoint.
 * Returns the raw fetch Response so the caller can pipe headers + body.
 */
export async function getFromR2(key) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new Error('R2 not configured');
  }
  const url = r2ObjectUrl(key);
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${CF_API_TOKEN}` },
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
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'video/mp4';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';
  return null;
}
