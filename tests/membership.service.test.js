import test from "node:test";
import assert from "node:assert/strict";
import {
  MEMBERSHIP_PLANS,
  getMembershipPlan,
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
