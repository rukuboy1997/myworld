import test from "node:test";
import assert from "node:assert/strict";
import {
  MEMBERSHIP_PLANS,
  getMembershipPlan,
  getMediaSizeLimit,
  isMembershipEntitled,
} from "../services/membership.service.js";

test("membership plans define the agreed prices and Reel limits", () => {
  assert.deepEqual(MEMBERSHIP_PLANS.free.prices, { monthly: 0, yearly: 0 });
  assert.deepEqual(MEMBERSHIP_PLANS.premium.prices, { monthly: 300, yearly: 3000 });
  assert.deepEqual(MEMBERSHIP_PLANS.business.prices, { monthly: 3000, yearly: 30000 });
  assert.deepEqual(MEMBERSHIP_PLANS.elite.prices, { monthly: 10000, yearly: 120000 });
  assert.deepEqual(
    Object.fromEntries(Object.entries(MEMBERSHIP_PLANS).map(([id, plan]) => [id, plan.reelDurationSeconds])),
    { free: 180, premium: 300, business: 900, elite: 1800 },
  );
});

test("membership plan lookup safely falls back to Free", () => {
  assert.equal(getMembershipPlan("unknown").id, "free");
});

test("only active subscriptions with a future period end are entitled", () => {
  const now = new Date("2026-10-25T12:00:00.000Z");
  assert.equal(isMembershipEntitled({ status: "active", currentPeriodEnd: "2026-11-25T12:00:00.000Z" }, now), true);
  assert.equal(isMembershipEntitled({ status: "active", currentPeriodEnd: "2026-10-25T11:59:59.000Z" }, now), false);
  assert.equal(isMembershipEntitled({ status: "past_due", currentPeriodEnd: "2026-11-25T12:00:00.000Z" }, now), false);
  assert.equal(isMembershipEntitled(null, now), false);
});


test("media upload limits follow the server-authoritative membership plan", () => {
  assert.equal(getMediaSizeLimit("free", "image"), 10 * 1024 * 1024);
  assert.equal(getMediaSizeLimit("premium", "video"), 100 * 1024 * 1024);
  assert.equal(getMediaSizeLimit("business", "video"), 250 * 1024 * 1024);
  assert.equal(getMediaSizeLimit("elite", "video"), 500 * 1024 * 1024);
  assert.equal(getMediaSizeLimit("unknown-plan", "image"), 10 * 1024 * 1024);
  assert.equal(getMediaSizeLimit("elite", "audio"), null);
});


import { createPresignedR2Upload } from "../services/r2.service.js";

test("R2 presigned upload URLs are short-lived and bind the content type", () => {
  const result = createPresignedR2Upload({
    key: "posts/user-1/hello world.jpg",
    contentType: "image/jpeg",
    expiresIn: 300,
    now: new Date("2026-10-25T12:34:56.000Z"),
    credentials: {
      accountId: "account123",
      bucket: "myworld",
      accessKeyId: "test-access",
      secretAccessKey: "test-secret",
    },
  });

  assert.match(result.url, /^https:\/\/account123\.r2\.cloudflarestorage\.com\/myworld\/posts\/user-1\/hello%20world\.jpg\?/);
  assert.match(result.url, /X-Amz-Algorithm=AWS4-HMAC-SHA256/);
  assert.match(result.url, /X-Amz-Expires=300/);
  assert.match(result.url, /X-Amz-SignedHeaders=content-type%3Bhost/);
  assert.match(result.url, /X-Amz-Signature=[a-f0-9]{64}$/);
  assert.deepEqual(result.requiredHeaders, { "Content-Type": "image/jpeg" });
  assert.equal(result.key, "posts/user-1/hello world.jpg");
});

test("R2 presigned upload URL rejects unsafe inputs and missing credentials", () => {
  const credentials = {
    accountId: "account123",
    bucket: "myworld",
    accessKeyId: "test-access",
    secretAccessKey: "test-secret",
  };
  assert.throws(() => createPresignedR2Upload({
    key: "../private.txt", contentType: "text/plain", credentials,
  }), /safe R2 object key/);
  assert.throws(() => createPresignedR2Upload({
    key: "posts/a.jpg", contentType: "image/jpeg", expiresIn: 901, credentials,
  }), /expiry must be between/);
  assert.throws(() => createPresignedR2Upload({
    key: "posts/a.jpg", contentType: "image/jpeg",
    credentials: { accountId: "account123", bucket: "myworld" },
  }), /not configured/);
});
