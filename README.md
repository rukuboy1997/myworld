# myWorld — Sui-Native Decentralized Social Platform

> Connect athletes, celebrities, and fans on the Sui blockchain. Posts, profiles, likes, comments, and messages are anchored on-chain (Sui) and stored on decentralized storage (Walrus).

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Architecture](#architecture)
4. [Project Structure](#project-structure)
5. [Database Schema](#database-schema)
6. [Smart Contract](#smart-contract)
7. [Services](#services)
8. [API Reference](#api-reference)
9. [Frontend](#frontend)
10. [Authentication](#authentication)
11. [Email Notifications](#email-notifications)
12. [Presence System](#presence-system)
13. [Environment Variables](#environment-variables)
14. [Local Development](#local-development)
15. [Deployment — Vercel](#deployment--vercel)
16. [GitHub Integration](#github-integration)

---

## Overview

myWorld is a decentralized social network built for the **Sui x ONE Samurai Hackathon (Tokyo, April 2026)**. It allows athletes and celebrities to connect directly with their fans through on-chain content ownership. Every post is linked to a Walrus blob and optionally anchored to a Sui object, giving users verifiable proof of authorship.

**Key capabilities:**
- Create and own posts with on-chain Sui objects + Walrus decentralized storage
- Like, comment, follow, and message — all with on-chain event anchoring
- Email/password accounts with auto-generated Sui wallet addresses
- Real-time presence (online / last seen), unread message badges, notification bell
- Email notifications (Resend) for likes, comments, messages, and follows
- Invite friends + post/profile sharing with native Web Share API support

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18 + Vite 5 + Tailwind CSS 3 | Social app UI |
| Backend | Node.js + Express (ESM) | REST API + blockchain transaction signer |
| Database | Neon Postgres (serverless) | Off-chain index: users, posts, profiles, messages |
| Blockchain | Sui Move (Testnet) | On-chain ownership and social events |
| Storage | Walrus (Testnet) | Decentralized blob storage for post content + media |
| Email | Resend API | Transactional emails + social notifications |
| Deployment | Vercel | Separate frontend and backend projects |

---

## Architecture

```
Browser (Vite :5000)
    │
    │  /api/* proxy (dev) — direct VITE_API_URL (prod)
    ▼
Express API (:3001)
    ├── services/auth.service.js                JWT auth + bcrypt + email verify
    ├── services/sui.service.js                 Sui @mysten/sui SDK — signs txns
    ├── services/walrus.service.js              Walrus HTTP publish/aggregate API
    ├── services/email.service.js               Resend API wrapper
    ├── services/notification-email.service.js  Branded HTML email templates
    └── data/db.js                              Neon Postgres (schema DDL + all CRUD)
```

**Data flow for a new post:**
1. Frontend sends `POST /api/post` with title, content, optional media file
2. Backend uploads content text to **Walrus** → receives `blobId`
3. Backend calls **Sui** `create_post(blobId, title)` → receives `postObjectId` + `txDigest`
4. Backend stores all references in **Neon Postgres** `posts` table
5. Frontend renders the post with On-Chain + Walrus proof badges

---

## Project Structure

```
myworld/                                  ← Sui Move contract source
  Move.toml                               ← Package manifest
  sources/social.move                     ← Move contract (myworld::social)

services/
  auth.service.js                         ← Signup/login/JWT/password-reset/email-verify
  sui.service.js                          ← Sui transaction helpers
  walrus.service.js                       ← Walrus upload + read + blob URL helpers
  email.service.js                        ← Thin Resend API wrapper (dev console fallback)
  notification-email.service.js           ← Branded HTML email templates

data/
  db.js                                   ← Neon Postgres pool, schema DDL, all CRUD exports

utils/
  clientIp.js                             ← IP extraction for rate limiting

frontend/
  vite.config.js                          ← Port 5000, host: true, /api proxy → :3001
  tailwind.config.js                      ← Dark theme design tokens
  src/
    App.jsx                               ← React Router v6 routes
    main.jsx
    index.css                             ← Tailwind base + custom utilities
    lib/
      api.js                              ← All fetch calls to the backend
      auth.jsx                            ← AuthContext + useAuth() hook
    components/
      Layout.jsx                          ← Top nav, mobile bottom nav, invite, heartbeat
      PostCard.jsx                        ← Post with like/comment/share, liked-state sync
      AuthModal.jsx                       ← Sign in / Sign up / Forgot password modal
      InviteModal.jsx                     ← Invite friends modal (copy + social share)
    pages/
      LandingPage.jsx                     ← Marketing hero
      FeedPage.jsx                        ← Social feed (viewer-aware liked state)
      CreatePostPage.jsx                  ← Post creation form with media upload
      ExplorePage.jsx                     ← Discover creators
      ProfilePage.jsx                     ← User profile, follow, edit, share button
      MessagesPage.jsx                    ← DM chat with presence indicators
      NotificationsPage.jsx               ← Notification inbox
      VerifyEmailPage.jsx                 ← Email verification landing

app.js                                    ← Express app factory (all routes registered here)
server.js                                 ← Entry point — imports app.js, listens on :3001
config.js                                 ← Contract addresses, RPC, Walrus URLs, wallet
start.sh                                  ← Starts backend (:3001) then Vite (:5000)
push-github.sh                            ← Push to GitHub using GITHUB_TOKEN secret
vercel.json                               ← Backend Vercel config (api/[...path].js catchall)
frontend/vercel.json                      ← Frontend Vercel config (SPA rewrites)
walrus.js                                 ← Standalone Walrus upload + Sui link test
read.js                                   ← Standalone blob retrieval verification
```

---

## Database Schema

All tables are created automatically on first boot via `initDb()` in `data/db.js` using `CREATE TABLE IF NOT EXISTS`. Migrations use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` so they are safe to re-run.

```sql
-- Auth accounts
users (
  id TEXT PK, username TEXT UNIQUE, email TEXT UNIQUE,
  password_hash TEXT, address TEXT UNIQUE,
  email_verify_token TEXT, email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)

-- Public social identity
profiles (
  address TEXT PK, username TEXT, bio TEXT, display_name TEXT,
  avatar_blob_id TEXT, avatar_url TEXT,
  banner_blob_id TEXT, banner_url TEXT,
  website TEXT, location TEXT, twitter TEXT, profession TEXT,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)

-- Posts (text + optional media)
posts (
  id TEXT PK, post_object_id TEXT, tx_digest TEXT,
  blob_id TEXT, blob_object_id TEXT, blob_url TEXT,
  media_blob_id TEXT, media_url TEXT, media_type TEXT, media_mime TEXT,
  owner TEXT, title TEXT, content TEXT,
  is_deleted BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ
)

-- Likes  (unique per post + owner)
likes (id TEXT PK, post_id → posts, owner TEXT, created_at TIMESTAMPTZ)

-- Comments
comments (id TEXT PK, post_id → posts, owner TEXT, content TEXT, created_at TIMESTAMPTZ)

-- Direct messages
messages (id TEXT PK, sender TEXT, receiver TEXT, content TEXT, created_at TIMESTAMPTZ)

-- Follow graph
follows (follower TEXT, following TEXT, created_at TIMESTAMPTZ)  ← composite PK

-- In-app notifications
notifications (
  id TEXT PK, recipient TEXT, type TEXT,   -- type: like | comment | follow | message
  actor_address TEXT, post_id TEXT?, excerpt TEXT?,
  created_at TIMESTAMPTZ, read_at TIMESTAMPTZ?
)

-- Online presence
presence (address TEXT PK, last_seen_at TIMESTAMPTZ)

-- Rate limiting
rate_limit_events (id SERIAL PK, bucket_key TEXT, created_at TIMESTAMPTZ)

-- Password resets
password_resets (id SERIAL PK, email TEXT, code_hash TEXT, expires_at TIMESTAMPTZ, used_at TIMESTAMPTZ?)
```

**Indexes:** `posts(owner)`, `posts(created_at DESC)`, `likes(post_id)`, `comments(post_id)`, `messages(sender, receiver)`, `follows(follower)`, `follows(following)`, `notifications(recipient, created_at DESC)`, `rate_limit_events(bucket_key, created_at)`

---

## Smart Contract

### Active Contract — v3

| Property | Value |
|---|---|
| Module | `myworld::social` |
| Package ID | `0x96fdc5b12ac04491d2cd1ab5b97b2404d585382da2650bef7e1bb604cd895324` |
| Network | Sui Testnet |
| Deploy Txn | `FCkpUmAjMPnPsRKjQBQLR2kthaPF36hFh8SDMM4oVAWK` |
| Upgrade Cap | `0x5534b7a7774d2cba668a47f66114e15655396d09b8811ae4acff87e893d51fb4` |
| Signer Wallet | `0x2598d09dd5113dc4c2abd298c3c08597eb4d1848d5633667854a05535f4d66ed` |
| RPC | `https://fullnode.testnet.sui.io:443` |

**Move Structs:**
```move
Profile  { id: UID, owner: address, username: String, bio: String }
Post     { id: UID, owner: address, blob_id: String, title: String, created_at: u64, is_deleted: bool }
Comment  { id: UID, post_id: ID, owner: address, content: String }
Like     { id: UID, post_id: ID, owner: address }
Message  { id: UID, sender: address, receiver: address, content: String, created_at: u64 }
```

**Entry Functions:**
```move
create_profile(username: String, bio: String)
create_post(blob_id: String, title: String)            // links to Walrus blob
update_post(post: &mut Post, new_blob_id, new_title)   // owner only
delete_post(post: &mut Post)                            // soft delete, owner only
add_comment(post_id: ID, content: String)
like_post(post_id: ID)
send_message(receiver: address, content: String)
```

**Previous contracts:**
- v1: `0x0232fe5b5497cec87f0ad865a7058ae1cc716bba553d66e0262cd59bbb75fc0c`
- v2: `0x819e6957458af4807b87732fa20e7df59b748c4318ded45f8685a09e28f40de1`

> The backend wallet signs all chain transactions — the frontend is entirely wallet-agnostic. All Sui calls are wrapped in `try/catch` so the app remains fully functional even when the chain is slow or unavailable.

> **Redeploying the contract** requires the Sui CLI. Download for Ubuntu x86_64:
> ```
> https://github.com/MystenLabs/sui/releases/download/testnet-v1.68.1/sui-testnet-v1.68.1-ubuntu-x86_64.tgz
> ```

---

## Services

### `services/sui.service.js`
Uses `@mysten/sui` SDK with a keypair derived from the mnemonic in `config.js`.

| Export | Description |
|---|---|
| `suiCreateProfile(username, bio)` | Calls `create_profile` entry function |
| `suiCreatePost(blobId, title)` | Calls `create_post`, returns `{ postObjectId, txDigest }` |
| `suiAddComment(postObjectId, content)` | Calls `add_comment` |
| `suiLikePost(postObjectId)` | Calls `like_post` |
| `suiSendMessage(receiver, content)` | Calls `send_message` |
| `senderAddress` | Wallet address derived from the mnemonic |

### `services/walrus.service.js`
HTTP client for Walrus testnet publisher/aggregator.

| Export | Description |
|---|---|
| `uploadToWalrus(data, mimeType)` | PUT to publisher, returns `{ blobId, blobObjectId }` |
| `readFromWalrus(blobId)` | GET from aggregator, returns raw content string |
| `walrusBlobUrl(blobId)` | Returns the public aggregator URL for a blob |
| `validateWalrusBlob(blobId)` | HEAD request to confirm blob availability |

Config (from `config.js`):
- Publisher: `https://publisher.walrus-testnet.walrus.space`
- Aggregator: `https://aggregator.walrus-testnet.walrus.space`
- Epochs: `5`

### `services/auth.service.js`

| Export | Description |
|---|---|
| `signup({ username, email, password })` | Creates user + default profile, sends verification email |
| `login({ username, password })` | Validates credentials, returns `{ token, user }` |
| `getCurrentUser(req)` | Decodes JWT from `Authorization: Bearer` header |
| `requireAuth` | Express middleware — 401 if not authenticated |
| `requestPasswordReset({ email, ip })` | Rate-limited (5/15 min/email), emails 6-digit code |
| `resetPassword({ email, code, newPassword })` | Rate-limited (10/15 min/email), atomic single-use claim |
| `verifyEmail({ token })` | Sets `email_verified_at` |
| `resendVerification(req)` | Re-sends the verification email |

JWT config: 30-day expiry, signed with `JWT_SECRET` env var (warns and uses dev fallback if unset).

### `services/email.service.js`
Thin wrapper around the Resend API.

```js
sendEmail({ to, subject, html, text })
isEmailConfigured()   // true if RESEND_API_KEY is set
```

If `RESEND_API_KEY` is missing, emails are printed to the server console (safe dev fallback, no crash).  
From address is set via `EMAIL_FROM` env var (default: `myWorld <myworld@dakta.name.ng>`).

### `services/notification-email.service.js`
Generates and sends branded HTML notification emails. Called fire-and-forget (no `await`) after every `createNotification()` in `app.js` so it never delays API responses.

```js
sendNotificationEmail({ type, recipientEmail, recipientName, actorProfile, extra })
// type: 'like' | 'comment' | 'message' | 'follow'
```

Design: dark navy background (`#080D1A`), Sui teal CTA button (`#00C2FF`), gold gradient accent bar, quoted text bubbles for messages/comments, actor info card with wallet address.

---

## API Reference

All routes are registered in `app.js` and served by Express on `:3001`.  
In development, Vite proxies all `/api/*` requests to `http://localhost:3001`.

`(auth)` = requires `Authorization: Bearer <jwt>` header.

### Auth

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | `{ username, email, password }` | Create account, sends verify email |
| POST | `/api/auth/login` | `{ username, password }` | Returns `{ token, user }` |
| GET | `/api/auth/me` | — (auth) | Returns current user object |
| POST | `/api/auth/forgot-password` | `{ email }` | Emails 6-digit reset code |
| POST | `/api/auth/reset-password` | `{ email, code, newPassword }` | Claims reset, updates password |
| POST | `/api/auth/verify-email` | `{ token }` | Marks email as verified |
| POST | `/api/auth/resend-verify` | — (auth) | Resends verification email |

### Feed & Posts

| Method | Path | Params / Body | Description |
|---|---|---|---|
| GET | `/api/feed` | `?viewer=address` | All posts, includes `userLiked: bool` for viewer |
| GET | `/api/stats` | — | Platform-level counts |
| POST | `/api/post` | (auth) `{ title, content }` + optional `media` file | Create post (Walrus + Sui + Postgres) |
| GET | `/api/post/:id` | — | Single post with full comments array |
| PUT | `/api/post/:id` | `{ title, content }` | Update post content (re-uploads to Walrus) |
| DELETE | `/api/post/:id` | — | Soft-delete post |
| POST | `/api/post/:id/like` | (auth) | Toggle like — notification + email |
| GET | `/api/post/:id/likes` | — | `{ count, likes[] }` |
| POST | `/api/post/:id/comment` | (auth) `{ content }` | Add comment — notification + email |
| GET | `/api/post/:id/comments` | — | Comments with author profiles |

### Profiles

| Method | Path | Params / Body | Description |
|---|---|---|---|
| POST | `/api/profile` | (auth) multipart: `username, bio, displayName, website, location, twitter, profession` + optional `avatar` / `banner` files | Create or update profile |
| GET | `/api/profile/:address` | `?viewer=address` | Profile + posts with `userLiked`, follower/following counts |
| GET | `/api/profiles` | — | All profiles as `{ [address]: profile }` map |

### Follows

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/api/follow` | (auth) `{ following }` | Follow user — notification + email |
| DELETE | `/api/follow/:address` | (auth) | Unfollow |
| GET | `/api/follow/status/:address` | (auth) | `{ following: bool }` |
| GET | `/api/profile/:address/followers` | — | Followers list with profiles |
| GET | `/api/profile/:address/following` | — | Following list with profiles |

### Messages

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/api/message` | (auth) `{ receiver, content }` | Send DM — notification + email |
| GET | `/api/messages/:address` | — | All conversations for address |
| GET | `/api/conversation` | `?a=addr&b=addr` | Messages between two addresses |

### Notifications

| Method | Path | Description |
|---|---|---|
| GET | `/api/notifications` | (auth) Last 50 notifications with `actorProfile` attached |
| PUT | `/api/notifications/read` | (auth) Mark all notifications read |
| GET | `/api/notifications/unread-count` | (auth) Returns `{ count }` |

### Presence

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/api/presence/heartbeat` | (auth) | Upserts `last_seen_at = NOW()` for authenticated user |
| POST | `/api/presence/batch` | `{ addresses: string[] }` | Returns `{ [address]: lastSeenAt }` map |

---

## Frontend

### Routes (`src/App.jsx`)

| Path | Page | Notes |
|---|---|---|
| `/` | `LandingPage` | Marketing hero, redirects to `/feed` if authenticated |
| `/feed` | `FeedPage` | All posts, passes wallet as `viewer` for liked state |
| `/create` | `CreatePostPage` | Requires auth |
| `/explore` | `ExplorePage` | Browse all creators |
| `/profile/:address` | `ProfilePage` | Public profile + follow + edit (own) + share |
| `/messages` | `MessagesPage` | DM inbox with presence dots + online/last-seen header |
| `/notifications` | `NotificationsPage` | Notification inbox with type icons |
| `/verify-email` | `VerifyEmailPage` | Token verification landing page |

### `src/lib/auth.jsx` — `useAuth()` hook

```js
const {
  user,              // { id, username, email, address, emailVerified }
  address,           // wallet address (auto-generated 0x... per user at signup)
  isAuthenticated,
  isLoading,
  signIn(username, password),
  signUp(username, email, password),
  signOut(),
  openAuthModal(tab),  // tab: 'signin' | 'signup' | 'forgot'
} = useAuth();
```

Token stored in `localStorage` as `mw_token`. Guest users can browse feed, explore, and profiles. Likes, comments, posts, DMs, and profile edits require sign-in (enforced by `requireAuth` on the backend and `openAuthModal()` on the frontend).

### Key Components

**`PostCard.jsx`**
- `isLiked` initializes from `post.userLiked` (server-provided) — persists correctly after page reload
- Optimistic like toggle, confirmed/corrected via `res.liked` from the server response
- Debounce guard (`isLiking` flag) prevents double-tap race conditions
- `ShareMenu` dropdown: Copy Link, Share on X, Share on WhatsApp, native Web Share API (mobile)
- Comment thread with lazy loading on first open

**`MessagesPage.jsx`**
- Per-conversation unread tracking via `localStorage` timestamps (`msgs_read_${wallet}_${otherAddress}`)
- Presence dots (green = online within 2 min, grey = offline) on all sidebar avatars
- Chat header shows "Online" in green or "Last seen X ago" in grey
- Unread conversations: bold text, highlighted background, count badge, "Unread messages" separator
- Marks conversation read after 1.5 s delay; presence refreshes every 30 s

**`Layout.jsx`**
- Sticky top nav: Feed · Explore · Messages (unread badge) · Notifications (unread badge) · **Invite** button
- **Invite Friends** accessible from desktop nav button and user account dropdown
- Presence heartbeat fires every 30 s from every page via `sendHeartbeat()`
- Email verification banner for accounts with unverified email
- Mobile: fixed bottom nav — Home / + Create / Notifications / Messages / Profile
- `AuthModal` and `InviteModal` rendered here at the root level

**`InviteModal.jsx`**
- Pre-written invite message with app URL
- Copy link button with "Copied!" feedback
- Share on X (Twitter), Share on WhatsApp
- "More ways to share…" button (triggers native OS share sheet on mobile)

**`ProfilePage.jsx`**
- `ShareProfileButton` on every profile (own + others) — native share on mobile, clipboard copy on desktop
- Banner image rendered as a separate card below the profile header (prevents avatar clipping)

---

## Authentication

myWorld uses a custom email/password auth system — no OAuth or third-party wallets needed:

1. **Signup** — user picks `username` + `email` + `password`
2. Backend creates a `users` row (bcrypt-hashed password, auto-generated `0x...` address as identity), a default `profiles` row, and emails a verification link
3. **JWT** (30-day expiry) is returned immediately — app is usable before email verification
4. **Email verification** — link in email hits `/verify-email?token=...` which sets `email_verified_at`
5. **Forgot password** — 6-digit code emailed with a 15-minute TTL, single-use, rate-limited to 5 requests/15 min/email. Reset is atomic (`UPDATE ... WHERE used_at IS NULL`) — codes cannot be reused
6. Both forgot-password and reset endpoints return identical generic responses to prevent user enumeration
7. `requireAuth` middleware validates the `Authorization: Bearer <token>` header on all protected routes

---

## Email Notifications

After every social action, a fire-and-forget call sends a branded email to the recipient (if they have an email address). API responses are never delayed.

| Action | Email Subject | Content |
|---|---|---|
| Post liked | `❤️ @user liked your post on myWorld` | Actor info, post title, link to post |
| Comment posted | `💬 @user commented on your post` | Comment quoted, post title, link to post |
| New DM | `✉️ New message from @user on myWorld` | Message preview quoted, link to /messages |
| New follower | `🔔 @user is now following you on myWorld` | Follower info, link to their profile |

Emails only send when the recipient has an email on file. Wallet-only users are skipped silently. Errors are caught and logged without breaking anything.

---

## Presence System

| Detail | Value |
|---|---|
| Heartbeat interval | Every 30 seconds (from `Layout.jsx`) |
| Online threshold | 2 minutes since last heartbeat |
| Heartbeat endpoint | `POST /api/presence/heartbeat` (auth) |
| Batch query endpoint | `POST /api/presence/batch` → `{ [address]: lastSeenAt }` |
| Refresh on messages page | Every 30 seconds while page is open |

The `presence` table stores one row per address (`address PK, last_seen_at`). A user is considered **online** if `last_seen_at > NOW() - INTERVAL '2 minutes'`.

---

## Environment Variables

### Required

| Variable | Where set | Description |
|---|---|---|
| `NEON_DATABASE_URL` | Replit Secret / Vercel | Neon Postgres connection string |
| `JWT_SECRET` | Replit Secret / Vercel | Long random string for signing JWTs |
| `RESEND_API_KEY` | Replit Secret / Vercel | Resend API key for email sending |
| `GITHUB_TOKEN` | Replit Secret | GitHub PAT for `push-github.sh` |

### Optional

| Variable | Default | Description |
|---|---|---|
| `EMAIL_FROM` | `myWorld <myworld@dakta.name.ng>` | From address for all outgoing emails |
| `CORS_ORIGIN` | `*` | Allowed frontend origin (set to Vercel frontend URL in production) |
| `APP_URL` | `https://myworld.dakta.name.ng` | Base URL used in email notification links |
| `VITE_API_URL` | *(empty)* | Backend URL for production frontend build |

---

## Local Development

### Prerequisites
- Node.js 18+
- A Neon Postgres database (free tier works)
- Environment variables set in Replit Secrets or a `.env` file

### Setup

```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..
```

### Start the app

```bash
bash start.sh
```

This starts the Express backend on `:3001`, then Vite on `:5000`. Vite proxies all `/api/*` requests to the backend — no CORS configuration needed in development.

The database schema is created automatically on first boot. All `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements run safely every time, so there is no separate migration step.

### Other commands

```bash
bash push-github.sh    # Push latest commits to GitHub (uses GITHUB_TOKEN secret)
node walrus.js         # Test a Walrus upload and Sui object link (standalone)
node read.js           # Verify blob retrieval from Walrus
```

---

## Deployment — Vercel

Frontend and backend are deployed as **two separate Vercel projects** from the same GitHub repository (`rukuboy1997/myworld-app`).

### Backend Vercel Project

- **Root directory:** `/` (repo root)
- **Install command:** `npm install`
- **Build command:** *(none — serverless functions only)*
- **Vercel function entry:** `api/[...path].js` (catchall that imports `app.js`)

`vercel.json`:
```json
{
  "functions": { "api/[...path].js": { "maxDuration": 60, "memory": 1024 } },
  "routes": [{ "src": "/api/(.*)", "dest": "/api/[...path].js" }]
}
```

**Environment variables to set in Vercel (backend project):**

| Variable | Value |
|---|---|
| `NEON_DATABASE_URL` | Your Neon Postgres connection string |
| `JWT_SECRET` | Long random secret |
| `RESEND_API_KEY` | Your Resend API key |
| `EMAIL_FROM` | `myWorld <myworld@dakta.name.ng>` |
| `CORS_ORIGIN` | Your frontend Vercel URL (e.g. `https://myworld-app.vercel.app`) |
| `APP_URL` | Your backend Vercel URL (e.g. `https://myworld-api.vercel.app`) |

### Frontend Vercel Project

- **Root directory:** `frontend/`
- **Install command:** `npm install`
- **Build command:** `npm run build`
- **Output directory:** `dist`

**Environment variable to set in Vercel (frontend project):**

| Variable | Value |
|---|---|
| `VITE_API_URL` | Your backend Vercel URL (e.g. `https://myworld-api.vercel.app`) |

### How dev vs. production routing works

| Environment | `/api/*` requests route to |
|---|---|
| Local development | `http://localhost:3001` via Vite proxy |
| Production (Vercel) | `VITE_API_URL` (the deployed backend domain) |

`VITE_API_URL` is injected at build time. When empty, requests use relative paths (`/api/...`) handled by the Vite proxy. In production, `src/lib/api.js` prepends the backend URL to every request.

---

## GitHub Integration

All pushes go out under the **rukuboy1997** account so Vercel recognises the correct deploying user and triggers automatic deployments.

```bash
bash push-github.sh
```

The script reads `GITHUB_TOKEN` from the Replit Secrets store and pushes the `main` branch to `https://github.com/rukuboy1997/myworld-app.git`. Vercel auto-deploys both projects on every push.

---

## Walrus Test Blob

- **Blob ID:** `edezrmgxXdEXcGjKWnI-NWYOVBjFCAHXX5deNIbiT2k`
- **URL:** `https://aggregator.walrus-testnet.walrus.space/v1/blobs/edezrmgxXdEXcGjKWnI-NWYOVBjFCAHXX5deNIbiT2k`

