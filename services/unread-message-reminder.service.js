import {
  getUnreadMessageReminderCandidates,
  isUnreadMessageReminderEligible,
  reserveEmailNotificationDelivery,
  markEmailNotificationDeliverySent,
  markEmailNotificationDeliveryFailed,
} from "../data/db.js";
import { createEmailDeliveryKey } from "./email-notification-policy.service.js";
import { isEmailConfigured } from "./email.service.js";
import { sendUnreadMessageReminderEmail } from "./notification-email.service.js";

export const UNREAD_MESSAGE_REMINDER_POLICY = Object.freeze({
  inactiveDays: 3,
  minUnreadAgeHours: 2,
  cooldownHours: 72,
  batchLimit: 100,
});

const defaultDependencies = {
  isEmailConfigured,
  getCandidates: getUnreadMessageReminderCandidates,
  isEligible: isUnreadMessageReminderEligible,
  reserveDelivery: reserveEmailNotificationDelivery,
  markSent: markEmailNotificationDeliverySent,
  markFailed: markEmailNotificationDeliveryFailed,
  sendReminder: sendUnreadMessageReminderEmail,
};

function safeLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return UNREAD_MESSAGE_REMINDER_POLICY.batchLimit;
  return Math.min(100, Math.max(1, parsed));
}

/**
 * Processes one bounded reminder batch.
 * The provider is checked first so the local email-log fallback can never
 * be mistaken for a real delivery.
 */
export async function runUnreadMessageReminderBatch(
  { now = new Date(), limit = UNREAD_MESSAGE_REMINDER_POLICY.batchLimit } = {},
  dependencyOverrides = {},
) {
  const deps = { ...defaultDependencies, ...dependencyOverrides };
  if (!deps.isEmailConfigured()) {
    return {
      configured: false,
      candidateCount: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      reason: "email_provider_not_configured",
    };
  }

  const policy = UNREAD_MESSAGE_REMINDER_POLICY;
  const candidates = await deps.getCandidates({
    inactiveDays: policy.inactiveDays,
    minUnreadAgeHours: policy.minUnreadAgeHours,
    cooldownHours: policy.cooldownHours,
    limit: safeLimit(limit),
  });
  const deliveryKey = createEmailDeliveryKey("unread_message_reminder", now);
  const summary = {
    configured: true,
    candidateCount: candidates.length,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  for (const candidate of candidates) {
    if (!candidate?.userAddress || !candidate?.email) {
      summary.skipped += 1;
      continue;
    }

    let reservationId = null;
    try {
      // Candidate selection is only a snapshot. Re-check activity, unread
      // messages, account status, blocks and preferences before claiming.
      const eligible = await deps.isEligible(candidate.userAddress, policy);
      if (!eligible) {
        summary.skipped += 1;
        continue;
      }

      const reservation = await deps.reserveDelivery({
        userAddress: candidate.userAddress,
        emailType: "unread_message_reminder",
        deliveryKey,
      });
      if (!reservation?.reserved || !reservation.id) {
        summary.skipped += 1;
        continue;
      }
      reservationId = reservation.id;

      // Narrow the race where the user returns after the first eligibility check.
      const stillEligible = await deps.isEligible(candidate.userAddress, policy);
      if (!stillEligible) {
        await deps.markFailed(reservationId, "eligibility_changed");
        summary.skipped += 1;
        continue;
      }

      const providerResult = await deps.sendReminder({
        recipientEmail: candidate.email,
        recipientName: candidate.username,
      });
      if (providerResult?.devMode) {
        throw new Error("email_provider_not_configured");
      }

      const markedSent = await deps.markSent(reservationId, providerResult?.id || null);
      if (!markedSent) throw new Error("delivery_record_not_finalized");
      summary.sent += 1;
    } catch (error) {
      summary.failed += 1;
      if (reservationId) {
        try {
          await deps.markFailed(reservationId, error?.message || "reminder_delivery_failed");
        } catch {
          // Continue the batch; stale reservations can be recovered on a later run.
        }
      }
    }
  }

  return summary;
}
