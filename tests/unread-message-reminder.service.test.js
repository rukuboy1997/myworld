import test from "node:test";
import assert from "node:assert/strict";
import { runUnreadMessageReminderBatch } from "../services/unread-message-reminder.service.js";

const candidate = {
  userAddress: "0xrecipient",
  username: "Faruk",
  email: "faruk@example.com",
};

function eligibleDependencies(overrides = {}) {
  const calls = [];
  const deps = {
    isEmailConfigured: () => true,
    getCandidates: async (options) => {
      calls.push(["candidates", options]);
      return [candidate];
    },
    isEligible: async () => true,
    reserveDelivery: async () => ({ reserved: true, id: "delivery-1" }),
    markSent: async (id, providerId) => {
      calls.push(["sent", id, providerId]);
      return true;
    },
    markFailed: async (id, reason) => {
      calls.push(["failed", id, reason]);
      return true;
    },
    sendReminder: async (payload) => {
      calls.push(["send", payload]);
      return { id: "provider-1" };
    },
    ...overrides,
  };
  return { deps, calls };
}

test("does not scan or send when the email provider is not configured", async () => {
  const { deps, calls } = eligibleDependencies({
    isEmailConfigured: () => false,
  });
  const result = await runUnreadMessageReminderBatch({}, deps);
  assert.equal(result.configured, false);
  assert.equal(result.reason, "email_provider_not_configured");
  assert.equal(calls.length, 0);
});

test("re-checks eligibility twice and sends one reminder per eligible user", async () => {
  const { deps, calls } = eligibleDependencies();
  const result = await runUnreadMessageReminderBatch({
    now: new Date("2026-11-01T10:00:00.000Z"),
  }, deps);

  assert.deepEqual(result, {
    configured: true,
    candidateCount: 1,
    sent: 1,
    failed: 0,
    skipped: 0,
  });
  assert.equal(calls.filter(([name]) => name === "send").length, 1);
  assert.equal(calls.filter(([name]) => name === "sent").length, 1);
  assert.deepEqual(calls[0][1], {
    inactiveDays: 3,
    minUnreadAgeHours: 2,
    cooldownHours: 72,
    limit: 100,
  });
  assert.equal(calls.find(([name]) => name === "send")[1].recipientEmail, candidate.email);
});

test("skips a user who becomes active after the delivery reservation", async () => {
  let eligibilityChecks = 0;
  const { deps, calls } = eligibleDependencies({
    isEligible: async () => {
      eligibilityChecks += 1;
      return eligibilityChecks === 1;
    },
  });
  const result = await runUnreadMessageReminderBatch({}, deps);
  assert.equal(result.sent, 0);
  assert.equal(result.skipped, 1);
  assert.equal(calls.some(([name]) => name === "send"), false);
  assert.deepEqual(calls.find(([name]) => name === "failed").slice(1), [
    "delivery-1",
    "eligibility_changed",
  ]);
});

test("records provider errors without reporting a successful send", async () => {
  const { deps, calls } = eligibleDependencies({
    sendReminder: async () => {
      throw new Error("resend_unavailable");
    },
  });
  const result = await runUnreadMessageReminderBatch({}, deps);
  assert.equal(result.sent, 0);
  assert.equal(result.failed, 1);
  assert.deepEqual(calls.find(([name]) => name === "failed").slice(1), [
    "delivery-1",
    "resend_unavailable",
  ]);
});

test("does not reserve or send if a candidate is no longer eligible", async () => {
  let reservationCalls = 0;
  const { deps, calls } = eligibleDependencies({
    isEligible: async () => false,
    reserveDelivery: async () => {
      reservationCalls += 1;
      return { reserved: true, id: "delivery-1" };
    },
  });
  const result = await runUnreadMessageReminderBatch({}, deps);
  assert.equal(result.skipped, 1);
  assert.equal(reservationCalls, 0);
  assert.equal(calls.some(([name]) => name === "send"), false);
});
