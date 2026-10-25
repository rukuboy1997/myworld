/**
 * Central, server-authoritative myWorld membership catalogue.
 * Prices are NGN. Limits are product defaults and must be enforced server-side.
 */
export const MEMBERSHIP_PLANS = Object.freeze({
  free: Object.freeze({
    id: "free",
    name: "Free",
    prices: { monthly: 0, yearly: 0 },
    badge: null,
    reelDurationSeconds: 180,
    maxImageBytes: 10 * 1024 * 1024,
    maxVideoBytes: 25 * 1024 * 1024,
    storageBytes: 1 * 1024 * 1024 * 1024,
    uploadsPerDay: 10,
    uploadsPerMonth: 100,
    analytics: false,
    reducedPlatformAds: false,
    identityVerificationRequired: false,
  }),
  premium: Object.freeze({
    id: "premium",
    name: "Premium",
    prices: { monthly: 300, yearly: 3000 },
    badge: "blue",
    reelDurationSeconds: 300,
    maxImageBytes: 15 * 1024 * 1024,
    maxVideoBytes: 100 * 1024 * 1024,
    storageBytes: 5 * 1024 * 1024 * 1024,
    uploadsPerDay: 30,
    uploadsPerMonth: 500,
    analytics: true,
    reducedPlatformAds: true,
    identityVerificationRequired: false,
  }),
  business: Object.freeze({
    id: "business",
    name: "Business & Creators",
    prices: { monthly: 3000, yearly: 30000 },
    badge: "gold",
    reelDurationSeconds: 900,
    maxImageBytes: 20 * 1024 * 1024,
    maxVideoBytes: 250 * 1024 * 1024,
    storageBytes: 25 * 1024 * 1024 * 1024,
    uploadsPerDay: 100,
    uploadsPerMonth: 2000,
    analytics: true,
    reducedPlatformAds: false,
    identityVerificationRequired: true,
  }),
  elite: Object.freeze({
    id: "elite",
    name: "Elite",
    prices: { monthly: 10000, yearly: 120000 },
    badge: "green",
    reelDurationSeconds: 1800,
    maxImageBytes: 25 * 1024 * 1024,
    maxVideoBytes: 500 * 1024 * 1024,
    storageBytes: 100 * 1024 * 1024 * 1024,
    uploadsPerDay: 300,
    uploadsPerMonth: 5000,
    analytics: true,
    reducedPlatformAds: false,
    identityVerificationRequired: true,
  }),
});

export const MEMBERSHIP_STATUSES = Object.freeze([
  "active",
  "past_due",
  "canceled",
  "expired",
  "pending",
]);

export function getMembershipPlan(planId = "free") {
  return MEMBERSHIP_PLANS[planId] || MEMBERSHIP_PLANS.free;
}

export function getPublicMembershipPlan(planId = "free") {
  const plan = getMembershipPlan(planId);
  return {
    ...plan,
    prices: { ...plan.prices },
  };
}

export function isMembershipEntitled(subscription, now = new Date()) {
  if (!subscription || subscription.status !== "active") return false;
  if (!subscription.currentPeriodEnd) return false;
  const end = new Date(subscription.currentPeriodEnd);
  return Number.isFinite(end.getTime()) && end.getTime() > now.getTime();
}
