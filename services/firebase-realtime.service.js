import { createSign } from "node:crypto";

const DEFAULT_DATABASE_URL = "https://fascoin-app-default-rtdb.firebaseio.com";
const CUSTOM_TOKEN_AUDIENCE =
  "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DATABASE_SCOPE =
  "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email";

let parsedAccountRaw = null;
let parsedAccount = null;
let accessTokenCache = null;
let warnedMissingConfig = false;

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function signJwt(payload, privateKey, keyId) {
  const header = base64Url(JSON.stringify({
    alg: "RS256",
    typ: "JWT",
    ...(keyId ? { kid: keyId } : {}),
  }));
  const body = base64Url(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${signer.sign(privateKey).toString("base64url")}`;
}

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || !raw.trim()) {
    if (!warnedMissingConfig) {
      console.warn(
        "[firebase] FIREBASE_SERVICE_ACCOUNT_JSON is not configured; realtime writes/token issuance are disabled.",
      );
      warnedMissingConfig = true;
    }
    throw new Error("Firebase service credentials are not configured");
  }

  if (raw === parsedAccountRaw && parsedAccount) return parsedAccount;

  let account;
  try {
    account = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON");
  }

  if (
    account?.type !== "service_account" ||
    typeof account.project_id !== "string" ||
    typeof account.client_email !== "string" ||
    typeof account.private_key !== "string"
  ) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON must include type, project_id, client_email, and private_key",
    );
  }

  parsedAccountRaw = raw;
  parsedAccount = {
    projectId: account.project_id,
    clientEmail: account.client_email,
    privateKeyId: typeof account.private_key_id === "string" ? account.private_key_id : "",
    privateKey: account.private_key.replace(/\\n/g, "\n"),
  };
  accessTokenCache = null;
  warnedMissingConfig = false;
  return parsedAccount;
}

function signedServiceAssertion(account, { scope, audience, subject, uid, claims } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: account.clientEmail,
    aud: audience,
    iat: now,
    exp: now + 3600,
  };
  if (subject) payload.sub = subject;
  if (scope) payload.scope = scope;
  if (uid) {
    payload.uid = uid;
    if (claims && Object.keys(claims).length) payload.claims = claims;
    payload.aud = CUSTOM_TOKEN_AUDIENCE;
  }
  return signJwt(payload, account.privateKey, account.privateKeyId);
}

/**
 * Creates a Firebase Auth custom token for an already-authenticated myWorld
 * account. The UID is server-derived from the verified account, never from
 * request-body data.
 */
export function createFirebaseCustomToken(user) {
  const account = getServiceAccount();
  const uid = String(user?.address || "");
  if (!uid || uid.length > 128) {
    throw new Error("A valid authenticated myWorld address is required");
  }

  const claims = {
    address: uid,
    ...(typeof user?.username === "string" && user.username
      ? { username: user.username.slice(0, 32) }
      : {}),
  };

  return signedServiceAssertion(account, {
    audience: CUSTOM_TOKEN_AUDIENCE,
    uid,
    claims,
  });
}

async function getGoogleAccessToken() {
  const account = getServiceAccount();
  if (
    accessTokenCache &&
    accessTokenCache.clientEmail === account.clientEmail &&
    accessTokenCache.expiresAt > Date.now() + 60_000
  ) {
    return accessTokenCache.token;
  }

  const assertion = signedServiceAssertion(account, {
    scope: DATABASE_SCOPE,
    audience: OAUTH_TOKEN_URL,
  });
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.access_token !== "string") {
    throw new Error(`Google OAuth token request failed (${response.status})`);
  }

  accessTokenCache = {
    clientEmail: account.clientEmail,
    token: result.access_token,
    expiresAt: Date.now() + Math.max(60, Number(result.expires_in) || 3600) * 1000,
  };
  return accessTokenCache.token;
}

function databaseUrl(path) {
  const base = (
    process.env.FIREBASE_DB_URL || DEFAULT_DATABASE_URL
  ).replace(/\/$/, "");
  const normalizedPath = String(path || "")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/${normalizedPath ? `${normalizedPath}.json` : ".json"}`;
}

async function firebaseRequest(method, path, data) {
  const accessToken = await getGoogleAccessToken();
  const response = await fetch(databaseUrl(path), {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });

  if (!response.ok) {
    // Do not log response bodies: service errors may contain project details.
    throw new Error(`Realtime Database ${method} failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json().catch(() => null);
}

export async function firebaseWrite(path, data) {
  try {
    await firebaseRequest("PUT", path, data);
    return true;
  } catch (error) {
    console.warn(`[firebase] write to ${path} failed: ${error.message}`);
    return false;
  }
}

export async function firebasePatch(path, data) {
  try {
    await firebaseRequest("PATCH", path, data);
    return true;
  } catch (error) {
    console.warn(`[firebase] patch to ${path || "/"} failed: ${error.message}`);
    return false;
  }
}

function conversationId(addressA, addressB) {
  return [addressA, addressB].sort().join("_");
}

/**
 * Registers membership only in conversations containing the authenticated
 * account. Rules use this server-maintained index to authorize client reads.
 */
export async function ensureFirebaseConversationMemberships(userAddress, otherAddresses) {
  const user = String(userAddress || "");
  if (!user) return false;

  const updates = {};
  const uniqueOthers = [...new Set(
    (Array.isArray(otherAddresses) ? otherAddresses : [otherAddresses])
      .filter((address) => typeof address === "string")
      .map((address) => address.trim())
      .filter((address) => address && address !== user),
  )].slice(0, 100);

  for (const other of uniqueOthers) {
    const id = conversationId(user, other);
    updates[`conversationMembers/${id}/${user}`] = true;
    updates[`conversationMembers/${id}/${other}`] = true;
  }

  if (!Object.keys(updates).length) return true;
  return firebasePatch("", updates);
}

export async function ensureFirebaseConversationMembers(addressA, addressB) {
  if (
    typeof addressA !== "string" ||
    typeof addressB !== "string" ||
    !addressA ||
    !addressB ||
    addressA === addressB
  ) {
    return false;
  }
  return ensureFirebaseConversationMemberships(addressA, [addressB]);
}

export async function writeFirebasePresence(address, lastSeenAt = new Date().toISOString()) {
  if (typeof address !== "string" || !address) return false;
  return firebaseWrite(`presence/${address}`, { lastSeenAt });
}
