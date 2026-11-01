export const DEFAULT_EMAIL_NOTIFICATION_PREFERENCES = Object.freeze({
  emailEnabled: true,
  unreadMessageReminders: false,
  activityDigest: false,
  reengagementEmails: false,
});

export const EMAIL_NOTIFICATION_PREFERENCE_FIELDS = Object.freeze([
  "emailEnabled",
  "unreadMessageReminders",
  "activityDigest",
  "reengagementEmails",
]);

const EMAIL_TYPE_PREFERENCE = Object.freeze({
  unread_message_reminder: "unreadMessageReminders",
  activity_digest: "activityDigest",
  reengagement: "reengagementEmails",
});

export function normalizeEmailNotificationPreferences(input = {}) {
  return Object.fromEntries(
    EMAIL_NOTIFICATION_PREFERENCE_FIELDS.map((field) => [
      field,
      typeof input[field] === "boolean"
        ? input[field]
        : DEFAULT_EMAIL_NOTIFICATION_PREFERENCES[field],
    ]),
  );
}

export function validateEmailNotificationPreferencePatch(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Email preferences must be an object" };
  }

  const entries = Object.entries(input);
  if (!entries.length) {
    return { ok: false, error: "Choose at least one email preference to update" };
  }

  const patch = {};
  for (const [field, value] of entries) {
    if (!EMAIL_NOTIFICATION_PREFERENCE_FIELDS.includes(field)) {
      return { ok: false, error: `Unsupported email preference: ${field}` };
    }
    if (typeof value !== "boolean") {
      return { ok: false, error: `${field} must be true or false` };
    }
    patch[field] = value;
  }
  return { ok: true, patch };
}

export function isEmailNotificationEnabled(preferences, emailType) {
  const field = EMAIL_TYPE_PREFERENCE[emailType];
  if (!field) return false;
  const normalized = normalizeEmailNotificationPreferences(preferences);
  return normalized.emailEnabled && normalized[field];
}

export function isEmailCooldownElapsed(lastSentAt, {
  now = new Date(),
  cooldownMs,
} = {}) {
  if (lastSentAt == null) return true;
  if (!Number.isFinite(cooldownMs) || cooldownMs < 0) return false;

  const lastSent = new Date(lastSentAt).getTime();
  const current = new Date(now).getTime();
  if (!Number.isFinite(lastSent) || !Number.isFinite(current)) return false;
  return current - lastSent >= cooldownMs;
}

export function createEmailDeliveryKey(emailType, date = new Date()) {
  if (!Object.prototype.hasOwnProperty.call(EMAIL_TYPE_PREFERENCE, emailType)) {
    throw new Error("Unsupported email notification type");
  }
  const timestamp = new Date(date).getTime();
  if (!Number.isFinite(timestamp)) throw new Error("A valid delivery date is required");
  return `${emailType}:${new Date(timestamp).toISOString().slice(0, 10)}`;
}
