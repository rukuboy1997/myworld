# myWorld Google Play Billing implementation plan

Status: architecture baseline only. This document does not enable purchases, change entitlements, or alter production database state.

## Product and account contract

- Android application ID: `com.dakta.myworld`.
- Membership catalogue remains server-authoritative in `services/membership.service.js`.
- Paid plans and existing NGN target prices remain unchanged:
  - Premium: ₦300 monthly / ₦3,000 yearly.
  - Business & Creators: ₦3,000 monthly / ₦30,000 yearly.
  - Elite: ₦10,000 monthly / ₦120,000 yearly.
- Free remains free.
- Google Play is the payment provider for membership purchases made inside the Play-distributed Android app. Do not add Flutterwave checkout to this Android flow.
- Google Play's returned localized product price is what the Android purchase screen should display. Do not trust a client-supplied amount or use it to grant a plan.
- Existing media quotas, analytics, identity-verification rules, and Reel limits remain attached to the same plan IDs.

## Proposed Play Console catalogue

Create three subscription products, each with two auto-renewing base plans:

| Product ID | Base plan IDs | myWorld plan |
| --- | --- | --- |
| `myworld_premium` | `monthly`, `yearly` | `premium` |
| `myworld_business` | `monthly`, `yearly` | `business` |
| `myworld_elite` | `monthly`, `yearly` | `elite` |

Configure the NGN price points to match the existing catalogue. Product IDs and base-plan IDs become stable API contracts once created; do not rename them casually. The API must maintain an explicit allowlist mapping product ID + base plan ID to a plan ID + billing interval. Never infer a plan from a price supplied by the device.

## Target architecture

1. The authenticated web UI requests the native Android layer to start a purchase.
2. The React Native WebView bridge passes only the selected product/base-plan identifiers to the native layer.
3. The native layer uses an Expo-compatible Google Play Billing module (evaluate `expo-iap` against this repository's Expo SDK 54 toolchain before installation). It loads product details from Google Play and displays the store-provided localized price.
4. The native layer sends the purchase token, product ID, and base-plan ID to the authenticated API. It must not send a user address as authority.
5. The API verifies the token using Google Play Developer API `purchases.subscriptionsv2.get`, validates package name, product/base-plan mapping, subscription state, expiry, and account association, then updates the user's subscription in a database transaction.
6. The API acknowledges a verified purchase server-side when Google reports that acknowledgement is pending.
7. Google Play Real-time Developer Notifications (RTDN) are delivered through authenticated Pub/Sub push. The API verifies the push identity, fetches the latest subscription state from Google, and applies an idempotent update. RTDN message contents are a signal to re-fetch, not the source of truth.
8. The app can restore/synchronize purchases by submitting current purchase tokens for server verification. Cancellation and plan management should open Google Play's subscription-management UI.

## Account binding and replay protection

- Generate an opaque, stable obfuscated account identifier on the server (HMAC of the authenticated myWorld account identifier using a server-only secret). Return it to the authenticated Android client before purchase and set it through the billing library's account-identification field.
- Verify any returned external account identifier against the authenticated account when present.
- A purchase token must not be claimable by two myWorld accounts. Store a SHA-256 token fingerprint with a unique constraint for lookup/replay protection; protect any raw token needed for later Google API calls at rest using authenticated encryption and a server-only key.
- Handle `linkedPurchaseToken` during upgrades/downgrades and resubscriptions. Link/revoke the old token relationship safely; never let a stale notification overwrite a newer subscription state.
- Make verification and RTDN processing idempotent. Persist event/message identifiers and provider state before acknowledging Pub/Sub delivery.

## Google subscription state mapping

Always re-fetch the authoritative `SubscriptionPurchaseV2` resource before changing entitlements.

- `SUBSCRIPTION_STATE_ACTIVE`: active.
- `SUBSCRIPTION_STATE_IN_GRACE_PERIOD`: retain access as active until Google reports a different state.
- `SUBSCRIPTION_STATE_CANCELED`: retain access only through the verified expiry time; represent cancellation-at-period-end.
- `SUBSCRIPTION_STATE_PENDING`: pending; no paid entitlement.
- `SUBSCRIPTION_STATE_ON_HOLD`, `SUBSCRIPTION_STATE_PAUSED`, `SUBSCRIPTION_STATE_EXPIRED`, and revoked/invalid purchases: no paid entitlement.
- A canceled subscription is not immediately expired. The verified expiry timestamp remains decisive for access.
- Existing `isMembershipEntitled` requires status `active` and a future period end. The implementation must map Google states into that contract deliberately; do not weaken this entitlement check.

## Data model direction

The current schema has a single `membership_subscriptions` row per user and Flutterwave-specific columns, plus a generic `membership_payment_events` table. Keep existing records intact during the transition.

Add a provider-neutral store-purchase ledger rather than putting a single purchase token on the subscription row. It needs, at minimum:

- provider/store, user address, product ID, base-plan ID, mapped plan ID and billing interval;
- unique token fingerprint and encrypted token value;
- Google order ID, latest subscription state, expiry, auto-renew flag, acknowledgement state;
- linked/previous token fingerprint, last RTDN message ID, verified payload metadata, and timestamps.

Use additive, restart-safe SQL in the existing schema initialization/migration approach. Do not rename/drop Flutterwave columns or rewrite existing subscriptions as part of the first migration. Existing users must remain on their current effective plan until a verified Google purchase is applied or the existing subscription naturally expires.

## Server-only configuration (names are proposed)

- `GOOGLE_PLAY_PACKAGE_NAME=com.dakta.myworld`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (or a securely mounted service-account credential)
- `GOOGLE_PLAY_TOKEN_ENCRYPTION_KEY` (dedicated 32-byte key)
- `GOOGLE_PLAY_ACCOUNT_ID_HMAC_KEY` (separate server-only key)
- `GOOGLE_PLAY_RTDN_AUDIENCE`
- `GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL`

Enable the Google Play Android Developer API and grant the service account the minimum Play Console permissions needed to read and acknowledge subscriptions. Never place service-account JSON or encryption/HMAC keys in the frontend, WebView, Expo config, or Git.

## Delivery sequence

### Phase 5A — Google Play setup and secure backend foundation
- Confirm Play Console app/package ownership, create the three subscription products and six base plans, and configure NGN prices.
- Enable Android Publisher API and service-account access.
- Add provider-neutral purchase ledger and indexes with a safe additive migration.
- Add product/base-plan allowlist, token fingerprint/encryption helpers, and unit tests.
- No purchase can grant membership until server verification is implemented and configured.

### Phase 5B — Server verification and entitlement updates
- Add authenticated purchase-verification and restore endpoints.
- Implement Google OAuth/service-account access and `subscriptionsv2.get`.
- Validate package, product/base plan, token ownership, account binding, state, and expiry.
- Persist verified state transactionally and acknowledge pending purchases.
- Test forged product IDs, replayed tokens, cross-account token claims, expired/pending purchases, and plan changes.

### Phase 5C — Android native billing and WebView bridge
- Add the selected Expo-compatible billing library and its config plugin.
- Implement product loading, localized pricing, purchase, restore, pending/error handling, and subscription-management deep link.
- Bridge purchase tokens to the authenticated web session; do not trust a plan ID returned by the client.

### Phase 5D — RTDN, lifecycle, rollout
- Configure Pub/Sub RTDN and authenticated push delivery.
- Re-fetch subscription state from Google on every notification and process idempotently.
- Test renewals, cancellation, grace period, account hold, pause, expiry, refund/revoke, upgrade/downgrade, and resubscribe.
- Roll out only after internal Play testing confirms end-to-end purchase and entitlement behavior.

## Explicit non-goals for the first implementation

- No Flutterwave integration in the Android purchase flow.
- No manual client-side membership activation.
- No production entitlement changes from unverified receipts.
- No destructive migration or removal of historical payment records.
- No hard-coded Android checkout price where Play supplies localized pricing.
