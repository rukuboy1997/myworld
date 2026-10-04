# myWorld — Modern Social Media Platform

myWorld is a modern social media application focused on real people, real conversations, creator profiles, posts, media sharing, notifications, follows, and direct messaging.

The project is intentionally **not a blockchain application**. It uses a conventional web application architecture with PostgreSQL for core application data, Cloudflare R2 for media storage, Firebase Realtime Database for realtime features, and JWT authentication.

## Product direction

myWorld is being built as an addictive, polished social platform where users can:

- Create accounts and secure profiles
- Publish text, images, and videos
- Like and comment on posts
- Edit and delete their own posts
- Report inappropriate posts
- Follow other users
- Discover creators and profiles
- Send direct messages in realtime
- Receive notifications
- Edit avatars, banners, bios, locations, websites, and professions
- Use light and dark themes
- Use the web application or mobile application

## Stack

| Layer | Technology | Role |
| --- | --- | --- |
| Web | Vite + React + Tailwind CSS | Main social experience |
| Mobile | Expo + React Native | Android and iOS app |
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
avatars/
banners/
```

The application stores stable R2 object keys and builds public URLs from `CF_R2_PUBLIC_BASE`. This keeps media working even if the public delivery domain changes.

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
    CreatePostPage.jsx
    ProfilePage.jsx
    ExplorePage.jsx
    MessagesPage.jsx
    NotificationsPage.jsx
    PostPage.jsx
```

## Mobile

The mobile application lives in `mobile/` and uses Expo Router.

It provides:

- Feed
- Explore
- Create post
- Profiles
- Notifications
- Direct messages
- Post details
- Authentication
- Media upload and viewing
- Light and dark themes

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
