# myWorld — Decentralized Social Platform

## Overview
myWorld connects celebrities with their fans on the Sui blockchain. Posts, comments, and profiles are stored in Neon Postgres. Media (avatars, banners, post images/video) is stored in Cloudflare R2. Real-time chat uses Firebase Realtime Database. Sui blockchain is reserved for future tokenomics.

## Stack
| Layer | Tech | Role |
|---|---|---|
| Frontend (Web) | Vite + React + Tailwind CSS | Social app UI |
| Mobile | Expo + React Native | iOS & Android app |
| Backend | Node.js + Express | API server + wallet signer |
| Database | Neon Postgres | Posts, profiles, likes, comments, follows |
| Media Storage | Cloudflare R2 | Avatar, banner, post media uploads |
| Real-time Chat | Firebase Realtime Database | Live message delivery |
| Blockchain | Sui Move (Testnet) | Reserved for future tokenomics |

## Cloudflare R2 Setup
- **Bucket:** `myworld`
- **Account ID:** stored as `CF_ACCOUNT_ID` env var
- **API Token:** stored as `CF_API_TOKEN` env var (CF API token with R2 read+write permissions)
- **Public access (optional):** Set `CF_R2_PUBLIC_BASE` env var to your R2 public URL (e.g. `https://pub-xxx.r2.dev`) to bypass the backend proxy. Without it, media is served via the `/api/media/:key` proxy endpoint.
- **Backend URL (optional):** Set `BACKEND_URL` env var (e.g. `https://myworld-api.vercel.app`) so media URLs stored in the DB are absolute. Leave empty for local dev (Vite proxy handles relative `/api/media/...` URLs).

## Firebase Realtime Database Setup
- **Project:** `fascoin-app`
- **Database URL:** `https://fascoin-app-default-rtdb.firebaseio.com` (stored as `FIREBASE_DB_URL` env var)
- **Rules:** Must be set to **open** in the Firebase Console for messages to work:
  ```json
  {
    "rules": {
      ".read": true,
      ".write": true
    }
  }
  ```
  Go to Firebase Console → Realtime Database → Rules → paste the above → Publish.
- **Message path:** `conversations/{[addrA,addrB].sort().join('_')}/messages/{messageId}`
- The backend writes to Firebase after saving to Postgres (fire-and-forget). The frontend subscribes via `onValue` for real-time updates.

## Mobile App (Expo React Native)

**Directory:** `mobile/`  
**Workflow:** `myWorld Mobile` — runs `cd mobile && ./node_modules/.bin/expo start --port 8081`  
**API URL:** Configured via `EXPO_PUBLIC_API_URL` env var (set to backend port 3001)

### Features
- Full parity with web app: Feed, Explore, Create, Messages, Notifications, Profiles
- **Light + Dark mode** — automatically follows system preference
- **Push notifications** — requests permission on sign-in, registers Expo push token with backend (`POST /api/push-token`)
- Auth: sign in / sign up / forgot password (same JWT backend as web)
- Post likes, comments, media viewing
- Follow/unfollow users, DM conversations
- Plus Jakarta Sans font (matching web typography)

### Testing on Physical Device
1. Open the `myWorld Mobile` workflow console in Replit
2. A QR code appears in the terminal
3. Install **Expo Go** on your phone (Android or iOS)
4. Scan the QR code — the app loads instantly

### Publishing Note
- **iOS App Store**: Supported via Replit's Expo Launch (click Publish)
- **Google Play Store**: Requires EAS Build outside of Replit — export the project and run `eas build --platform android` locally

### Mobile Files
> All source files are JavaScript/JSX (no TypeScript). `babel-preset-expo` handles JSX transforms.

```
mobile/
  app.json                   # Expo config (bundle IDs, permissions, plugins)
  package.json               # Dependencies (Expo SDK 52)
  babel.config.js
  assets/images/             # Icon, splash, adaptive icon
  constants/colors.js        # Full light + dark theme tokens
  hooks/useColors.js         # Theme hook
  lib/api.js                 # All API calls to backend
  lib/queryClient.js         # React Query client
  context/
    AuthContext.jsx           # JWT auth + SecureStore persistence
    NotificationContext.jsx   # Push token registration + listeners
  components/
    PostCard.jsx              # Post with like/comment/share
    Avatar.jsx                # User avatar with online indicator
    EmptyState.jsx            # Empty/error state component
    SkeletonLoader.jsx        # Animated loading skeleton
    ErrorBoundary.jsx         # App crash recovery
  app/
    _layout.jsx               # Root layout + all providers
    (tabs)/
      _layout.jsx             # Bottom tab bar (5 tabs)
      index.jsx               # Feed
      explore.jsx             # Explore / search creators
      create.jsx              # Create post (with image picker)
      messages.jsx            # Conversations list
      notifications.jsx       # Notification feed
    profile/[address].jsx     # User profile + follow/unfollow
    profile/edit.jsx          # In-app profile editor (displayName, bio, profession, location, website, twitter, avatar, banner)
    post/[id].jsx             # Post detail + comments
    conversation/[address].jsx # Chat screen
    auth.jsx                  # Sign in / Sign up modal
```

## Architecture
```
Browser (Vite :5000)
    ↕ /api proxy
Express API (:3001)
    ├── services/walrus.service.js  → Walrus HTTP API
    ├── services/sui.service.js     → Sui @mysten/sui SDK
    └── Neon Postgres               → Off-chain index (posts, profiles, likes, comments, messages)
```

---

## Active Contract

### Contract v3 (current)
**Module:** `myworld::social`

| Package ID | `0x96fdc5b12ac04491d2cd1ab5b97b2404d585382da2650bef7e1bb604cd895324` |
|---|---|
| Network | Sui Testnet |
| Deploy Txn | `FCkpUmAjMPnPsRKjQBQLR2kthaPF36hFh8SDMM4oVAWK` |
| Upgrade Cap | `0x5534b7a7774d2cba668a47f66114e15655396d09b8811ae4acff87e893d51fb4` |

**Move Structs:**
- `Profile { id, owner, username, bio }` 
- `Post { id, owner, blob_id, title, created_at, is_deleted }`
- `Comment { id, post_id, owner, content }`
- `Like { id, post_id, owner }`
- `Message { id, sender, receiver, content, created_at }`

**Entry Functions:**
- `create_profile(username, bio)`
- `create_post(blob_id, title)` — links to Walrus blob
- `update_post(post, new_blob_id, new_title)` — owner only
- `delete_post(post)` — soft delete, owner only
- `add_comment(post_id, content)`
- `like_post(post_id)`
- `send_message(receiver, content)`

---

## Wallet
- **Address:** `0x2598d09dd5113dc4c2abd298c3c08597eb4d1848d5633667854a05535f4d66ed`
- **Network:** Sui Testnet

---

## Project Structure
```
myworld/
  Move.toml              # Package manifest
  sources/social.move    # Move contract v3

services/
  walrus.service.js      # Walrus upload/read functions
  sui.service.js         # Sui transaction functions

data/
  db.js                  # Neon Postgres client (schema + async CRUD; seeds on first boot)

frontend/
  package.json           # Vite React deps (Tailwind, React Router)
  vite.config.js         # Vite config (proxy /api → :3001)
  tailwind.config.js     # Tailwind v3 config (dark theme tokens)
  src/
    App.jsx              # Router (/, /feed, /create, /profile, /messages, /explore)
    index.css            # Global styles + Tailwind
    lib/api.js           # Fetch wrapper for all backend endpoints
    components/
      Layout.jsx         # Navbar + bottom nav + wallet management
      PostCard.jsx       # Post with likes, comments, chain proof badges
    pages/
      LandingPage.jsx    # Hero landing
      FeedPage.jsx       # Social feed
      CreatePostPage.jsx # Create post form
      ProfilePage.jsx    # User profile + stats
      MessagesPage.jsx   # Chat interface
      ExplorePage.jsx    # Discover creators

config.js                # PACKAGE_ID, mnemonic, RPC endpoints
server.js                # Express API (:3001)
start.sh                 # Starts backend + frontend
walrus.js                # Legacy upload+link script (standalone test)
read.js                  # Legacy blob retrieval verification script
```

---

## Run Commands
```bash
bash start.sh        # Start full app (backend + frontend)
# Schema + seed are auto-run on first server boot (data/db.js → initDb)
node walrus.js       # Test upload to Walrus + link to Sui
node read.js         # Verify blob retrieval from Walrus
```

## API Endpoints (Express :3001)
```
GET  /api/health
GET  /api/feed
GET  /api/stats
POST /api/post                { title, content, owner? }
GET  /api/post/:id
PUT  /api/post/:id
DEL  /api/post/:id
POST /api/post/:id/like       (requireAuth) — toggles like + creates notification
GET  /api/post/:id/likes
POST /api/post/:id/comment    (requireAuth) { content } — creates notification
GET  /api/post/:id/comments
POST /api/profile             (requireAuth) { username, bio?, profession?, ... }
GET  /api/profile/:address    — includes followerCount, followingCount
GET  /api/profiles
POST /api/message             (requireAuth) { receiver, content }
GET  /api/messages/:address
GET  /api/conversation?a=&b=
POST /api/follow              (requireAuth) { following } — follow user + notify
DEL  /api/follow/:address     (requireAuth) — unfollow
GET  /api/follow/status/:address (requireAuth)
GET  /api/profile/:address/followers
GET  /api/profile/:address/following
GET  /api/notifications       (requireAuth) — last 50, with actorProfile
PUT  /api/notifications/read  (requireAuth) — mark all read
GET  /api/notifications/unread-count (requireAuth)
POST /api/auth/verify-email   { token }
POST /api/auth/resend-verify  (requireAuth)
```

## Workflow
**Name:** myWorld App  
**Command:** `bash start.sh`  
**Port:** 5000 (Vite frontend) + 3001 (Express backend, internal)

---

## Deployment (Separated Frontend + Backend)

Frontend and backend are deployed as **two independent Vercel projects**.
Each has its own `vercel.json`. A problem in one does not affect the other.

### Backend Vercel Project
- **Root directory**: `/` (repo root)
- **Config file**: `vercel.json` (root)
- **CORS**: Handled at Vercel edge level via `headers` in `vercel.json` — allows `https://myworld-app.vercel.app`. Update the `Access-Control-Allow-Origin` value there if your frontend URL changes.
- **Environment variables to set in Vercel:**
  | Variable | Value |
  |---|---|
  | `NEON_DATABASE_URL` | Your Neon Postgres connection string |
  | `JWT_SECRET` | A long random secret string |
  | `CORS_ORIGIN` | Your frontend Vercel URL (e.g. `https://myworld-app.vercel.app`) |

### Frontend Vercel Project
- **Root directory**: `frontend/`
- **Config file**: `frontend/vercel.json`
- **Environment variables to set in Vercel:**
  | Variable | Value |
  |---|---|
  | `VITE_API_URL` | Your backend Vercel URL (e.g. `https://myworld-api.vercel.app`) |

### How it works
- In **local dev**, `VITE_API_URL` is empty so all `/api/...` calls go through Vite's proxy to `localhost:3001`. No change needed.
- In **production**, `VITE_API_URL` points to the backend domain. The frontend calls `https://myworld-api.vercel.app/api/...` directly.
- `CORS_ORIGIN` on the backend allows the frontend domain to make cross-origin requests.

## Walrus Test Blob
- **Blob ID:** `edezrmgxXdEXcGjKWnI-NWYOVBjFCAHXX5deNIbiT2k`
- **URL:** https://aggregator.walrus-testnet.walrus.space/v1/blobs/edezrmgxXdEXcGjKWnI-NWYOVBjFCAHXX5deNIbiT2k

## Key Notes
- The backend wallet signs all blockchain transactions — frontend is wallet-agnostic
- Comments/likes/messages are stored in Neon Postgres and (if possible) on-chain via Sui
- Posts can include rich media (image/video) uploaded to Walrus alongside the text content
- Profiles support avatar/banner upload to Walrus + displayName, bio, location, website, twitter
- Auth: simple username + password stored in Postgres `users` table (bcrypt hashed). Backend issues JWTs (signed with `JWT_SECRET`, defaults to dev fallback). Frontend `AuthProvider` in `frontend/src/lib/auth.jsx` exposes `useAuth()` → `{user, address, isAuthenticated, signIn, signUp, signOut, openAuthModal}`. Each new user is auto-assigned a random 0x address as their owner identifier and gets a default profile row. Guests can browse feed/explore/profiles; likes, comments, posts, profile edits, and messages require sign-in (enforced via `requireAuth` middleware reading `Authorization: Bearer <jwt>`).
- API endpoints: `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`.
- Forgot-password flow: user requests a 6-digit code by email → backend stores a bcrypt-hashed code in `password_resets` (15min TTL) and emails it via `services/email.service.js`. If `RESEND_API_KEY` is not set, the email is logged to the server console (dev fallback). Reset is atomic (single SQL UPDATE with WHERE used_at IS NULL clause) so codes can't be reused. Both endpoints are rate-limited (5 forgot/15min/email, 10 reset/15min/email) and return identical generic responses to avoid user enumeration. Email is required at signup for recovery.
- Profile page (`frontend/src/pages/ProfilePage.jsx`): banner image is rendered as a card BELOW the profile info (avatar + name + bio + meta), not above. This prevents the avatar from being clipped or visually fighting with the banner.
- Sui transactions use try/catch — app works even when chain is slow
- Contract redeployment requires Sui CLI reinstall (binary not persisted between sessions)
  - Download from: https://github.com/MystenLabs/sui/releases/download/testnet-v1.68.1/sui-testnet-v1.68.1-ubuntu-x86_64.tgz

## Hackathon Pitch Video
- **Route:** `/pitch` — full-screen cinematic 5-scene pitch video for Sui x ONE Samurai hackathon (Tokyo, Apr 2026)
- **File:** `frontend/src/pages/PitchVideoPage.jsx`
- Scene 1 (Hook): "1,000,000,000 FANS · ZERO REAL CONNECTION"
- Scene 2 (Problem): Centralized platforms own the fan relationship
- Scene 3 (Solution): myWorld intro + Sui/Walrus/ONE badges
- Scene 4 (Demo): Animated athlete profile/post/follow/notify UI mockups
- Scene 5 (Close): "Every like. Every follow. Every message. On Sui. Forever." + logos
- Controls: dot navigation (bottom-left), PAUSE/RESTART buttons, loops continuously
- Fonts: Bebas Neue (display), Space Grotesk (body) via Google Fonts
- Colors: Sui teal #00C8FF, ONE red #FF3B30, gold #FFD700 on #060610 ultra-dark bg

## Previous Contracts
- v1: `0x0232fe5b5497cec87f0ad865a7058ae1cc716bba553d66e0262cd59bbb75fc0c`
- v2: `0x819e6957458af4807b87732fa20e7df59b748c4318ded45f8685a09e28f40de1` (current, deployed)
