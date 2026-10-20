# myWorld — Modern Social Media Platform

myWorld is a modern social media application focused on real people, real conversations, creator profiles, posts, media sharing, notifications, follows, and direct messaging.

The project is intentionally **not a blockchain application**. It uses a conventional web application architecture with PostgreSQL for core application data, Cloudflare R2 for media storage, Firebase Realtime Database for realtime features, and JWT authentication.

## Product direction

myWorld is being built as an addictive, polished social platform where users can:

- Create accounts and secure profiles
- Publish text, images, and videos
- Browse a dedicated vertical Reels feed with autoplay, likes, comments links, and sharing
- Share text, image, and video statuses that expire after 24 hours
- Control status audience and see unique viewers
- Like and comment on posts
- Edit and delete their own posts
- Report inappropriate posts
- Follow other users
- Discover creators and profiles
- Send direct messages in realtime
- Receive notifications
- Edit avatars, banners, bios, locations, websites, and professions
- Use light and dark themes
- Use the responsive web application, including through the mobile-WebView wrapper

## Stack

| Layer | Technology | Role |
| --- | --- | --- |
| Web | Vite + React + Tailwind CSS | Main social experience |
| Mobile WebView | Expo + React Native WebView | Wrapper for the responsive web application |
| API | Node.js + Express | Authentication and social API |
| Database | Neon Postgres | Users, posts, profiles, likes, comments, follows, notifications |
| Media | Cloudflare R2 | Images, videos, avatars, and banners |
| Realtime | Firebase Realtime Database | Live conversations and presence |
| Authentication | JWT + bcrypt | Account sessions and password security |
| Email | Resend-compatible email service | Verification and password recovery |

## Cloudflare R2

Media is uploaded by the backend directly to Cloudflare R2.

Environment variables:

- `CF_ACCOUNT_ID`
- `CF_API_TOKEN`
- `CF_R2_BUCKET`
- `CF_R2_PUBLIC_BASE` — public R2 custom-domain base
- `BACKEND_URL` — optional backend origin used for media URLs

Current media object folders:

```
posts/
statuses/
avatars/
banners/
```

The application stores stable R2 object keys and builds public URLs from `CF_R2_PUBLIC_BASE`. This keeps media working even if the public delivery domain changes.

## Status

Status v1 stores status metadata and unique viewer records in Neon PostgreSQL. Images and videos are stored in Cloudflare R2 under the `statuses/` prefix. Active statuses are filtered by their server-set 24-hour expiry, and the API enforces the audience setting.

The backend Vercel project must define `CRON_SECRET` as a strong random secret. A daily Vercel Cron job calls `/api/cron/status-cleanup` to delete expired status media from R2 and then remove the expired database records. If an R2 deletion fails, the record is retained so a later cleanup run can retry it.

Status API routes:
- `GET /api/statuses` — active statuses visible to the signed-in user
- `POST /api/statuses` — create a text, image, or video status
- `POST /api/statuses/:id/view` — record a unique view
- `GET /api/statuses/:id/viewers` — list viewers for the owner's active status

## Reels

The web Reels page (`/reels`) uses a dedicated video-only API feed. **For You** ranks videos using freshness, likes, comments, followed creators, creator affinity from watch history, and a penalty for videos already watched. It also applies a creator-diversity penalty to reduce consecutive recommendations from the same creator. **Latest** preserves chronological ordering. Both modes use cursor pagination separately from the Home feed. The player attempts muted inline autoplay while a Reel is in view, pauses videos out of view, and provides mute, like, share, creator profile, and post/comment navigation controls. The active Reel and the next Reel are preloaded opportunistically on connections that do not signal Data Saver or 2G, while other videos remain metadata-only to limit unnecessary data usage.

Authenticated playback sessions report cumulative watch duration and completion signals to PostgreSQL. Session IDs make repeated progress updates idempotent; the API derives viewer identity from the authenticated account rather than trusting client-supplied identity.

Reels API routes:
- `GET /api/reels?limit=10&sort=for-you|trending|latest&cursor=...` — paginated video posts with profile and engagement data; viewer identity is derived from the optional auth token
- `POST /api/reels/:id/watch` — authenticated playback-duration/completion updates used to improve recommendations
- `GET /api/reels/analytics` — private creator analytics for the signed-in account, including per-Reel distinct authenticated viewers, watch time, completion rate, likes, and comments

The Reels page also includes a **Trending** feed ranked using recent watch activity, completions, likes, comments, and freshness. For You now incorporates aggregate watch performance alongside the existing personalized signals. The private creator dashboard is available at `/reels/analytics`. View counts reflect distinct authenticated viewers recorded by the playback tracker; signed-out plays are not included in creator analytics.

Reels are existing video posts, so creators can publish a video through the normal Create Post flow. The Home feed continues to contain text, image, and video posts.

## Firebase Realtime Database

Firebase Realtime Database powers realtime social features.

Environment variable:

```
FIREBASE_DB_URL
```

Current realtime uses include:

- Direct-message delivery
- Conversation subscriptions
- User presence

The primary application records remain in PostgreSQL while Firebase provides the realtime delivery layer.

## Backend

The production API is an Express application exposed through the root Vercel entrypoint.

Important files:

```
index.js                    # Vercel entrypoint
app.js                      # Express application and API routes
data/db.js                  # PostgreSQL schema and data access
services/r2.service.js      # Cloudflare R2 integration
services/auth.service.js    # Authentication and password recovery
services/email.service.js   # Email delivery
services/notification-email.service.js
utils/clientIp.js
```

## Frontend

The web application lives in `frontend/`.

Important areas:

```
frontend/src/
  App.jsx
  components/
    Layout.jsx
    PostCard.jsx
    PostActionsMenu.jsx
    AuthModal.jsx
  lib/
    api.js
    auth.jsx
    firebase.js
    theme.jsx
  pages/
    FeedPage.jsx
    ReelsPage.jsx
    CreatePostPage.jsx
    ProfilePage.jsx
    ExplorePage.jsx
    MessagesPage.jsx
    NotificationsPage.jsx
    PostPage.jsx
```

## Mobile WebView

The active mobile wrapper lives in `mobile-webview/` and uses Expo. It loads the responsive web application inside a WebView, so the website's messaging, notifications, navigation, and visual design are the primary mobile experience.

The separate native React Native application previously stored in `mobile/` has been retired and removed from this repository. Mobile improvements should target the web frontend and the `mobile-webview/` wrapper.

## Core API

### Authentication

```
POST /api/auth/signup
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/forgot-password
POST /api/auth/reset-password
POST /api/auth/verify-email
POST /api/auth/resend-verify
```

### Posts

```
GET    /api/feed
POST   /api/post
GET    /api/post/:id
PUT    /api/post/:id
DELETE /api/post/:id
POST   /api/post/:id/like
GET    /api/post/:id/likes
POST   /api/post/:id/comment
GET    /api/post/:id/comments
POST   /api/post/:id/report
```

### Profiles and social graph

```
POST /api/profile
GET  /api/profile/:address
GET  /api/profiles

POST /api/follow
DELETE /api/follow/:address
GET /api/follow/status/:address
GET /api/profile/:address/followers
GET /api/profile/:address/following
```

### Notifications and messaging

```
GET /api/notifications
PUT /api/notifications/read
GET /api/notifications/unread-count

POST /api/message
GET  /api/messages/:address
GET  /api/conversation?a=&b=
```

## Local development

Install dependencies:

```bash
npm install
cd frontend && npm install
```

Run the backend:

```node
node server.js
```

Run the web frontend in another terminal:

```bash
cd frontend
npm run dev
```

The web frontend uses the Vite development proxy for local API requests.

## Production deployment

myWorld uses two Vercel projects:

### Frontend

- Root directory: `frontend/`
- Environment variable: `VITE_API_URL`

### Backend

- Root directory: repository root
- Environment variables:
  - `NEON_DATABASE_URL`
  - `JWT_SECRET`
  - `CORS_ORIGIN`
  - `CF_ACCOUNT_ID`
  - `CF_API_TOKEN`
  - `CF_R2_BUCKET`
  - `CF_R2_PUBLIC_BASE`
  - `BACKEND_URL`
  - `FIREBASE_DB_URL`
  - Email service variables used by `services/email.service.js`

## Data cleanup

The application no longer seeds old demonstration posts.

On the first startup after this migration, the backend removes legacy decentralized records and removes old user accounts whose profile media still points to legacy decentralized storage. Legacy decentralized post metadata columns are also removed from PostgreSQL.

New content is created using the current PostgreSQL + Cloudflare R2 architecture.

## Project philosophy

myWorld is now focused entirely on the social experience:

**Create. Share. Discover. Connect.**

The goal is a fast, beautiful, reliable social application that users genuinely enjoy opening every day.
