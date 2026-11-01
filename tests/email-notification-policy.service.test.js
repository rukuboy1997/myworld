import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_EMAIL_NOTIFICATION_PREFERENCES,
  createEmailDeliveryKey,
  isEmailCooldownElapsed,
  isEmailNotificationEnabled,
  normalizeEmailNotificationPreferences,
  validateEmailNotificationPreferencePatch,
} from "../services/email-notification-policy.service.js";

test("marketing and digest email categories are opt-in by default", () => {
  assert.deepEqual(normalizeEmailNotificationPreferences(), DEFAULT_EMAIL_NOTIFICATION_PREFERENCES);
  assert.equal(isEmailNotificationEnabled(undefined, "unread_message_reminder"), false);
  assert.equal(isEmailNotificationEnabled(undefined, "activity_digest"), false);
  assert.equal(isEmailNotificationEnabled(undefined, "reengagement"), false);
});

test("master email switch disables every category", () => {
  assert.equal(isEmailNotificationEnabled({
    emailEnabled: false,
    unreadMessageReminders: true,
  }, "unread_message_reminder"), false);
});

test("preference patch accepts only known boolean values", () => {
  assert.deepEqual(
    validateEmailNotificationPreferencePatch({ activityDigest: true }),
    { ok: true, patch: { activityDigest: true } },
  );
  assert.equal(validateEmailNotificationPreferencePatch({ activityDigest: "yes" }).ok, false);
  assert.equal(validateEmailNotificationPreferencePatch({ unknown: true }).ok, false);
  assert.equal(validateEmailNotificationPreferencePatch({}).ok, false);
});

test("email cooldown allows first delivery and blocks recent repeats", () => {
  const now = new Date("2026-11-01T12:00:00.000Z");
  const cooldownMs = 24 * 60 * 60 * 1000;
  assert.equal(isEmailCooldownElapsed(null, { now, cooldownMs }), true);
  assert.equal(isEmailCooldownElapsed("2026-11-01T01:00:00.000Z", { now, cooldownMs }), false);
  assert.equal(isEmailCooldownElapsed("2026-10-30T12:00:00.000Z", { now, cooldownMs }), true);
  assert.equal(isEmailCooldownElapsed("not-a-date", { now, cooldownMs }), false);
});

test("delivery keys are stable for one UTC day and distinct across days", () => {
  assert.equal(
    createEmailDeliveryKey("activity_digest", "2026-11-01T02:00:00.000Z"),
    "activity_digest:2026-11-01",
  );
  assert.notEqual(
    createEmailDeliveryKey("activity_digest", "2026-11-01T23:59:59.000Z"),
    createEmailDeliveryKey("activity_digest", "2026-11-02T00:00:00.000Z"),
  );
  assert.throws(() => createEmailDeliveryKey("unknown", new Date()));
});
