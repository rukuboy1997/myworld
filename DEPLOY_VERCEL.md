# Deploying myWorld to Vercel

myWorld uses two Vercel projects:

1. **Frontend** — Vite + React in `frontend/`
2. **Backend** — Express API from the repository root

## Backend architecture

```
Browser / Mobile WebView
        │
        ▼
Vercel
        │
        ▼
Express API
   ├── Neon Postgres
   ├── Cloudflare R2
   ├── Firebase Realtime Database
   └── Email service
```

The backend entrypoint is `index.js`. The local development entrypoint is `server.js`.

## Backend environment variables

Set these in Vercel:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEON_DATABASE_URL` | yes | PostgreSQL connection |
| `JWT_SECRET` | yes | JWT signing secret |
| `CORS_ORIGIN` | yes | API CORS configuration |
| `CF_ACCOUNT_ID` | yes | Cloudflare account |
| `CF_API_TOKEN` | yes | R2 API token |
| `CF_R2_BUCKET` | yes | R2 bucket name |
| `CF_R2_PUBLIC_BASE` | yes | Public R2 media base URL |
| `BACKEND_URL` | optional | Public API origin |
| `FIREBASE_DB_URL` | yes | Firebase Realtime Database URL |
| `RESEND_API_KEY` | recommended | Email delivery |
| `EMAIL_FROM` | optional | Email sender |

## Frontend environment variables

The frontend Vercel project uses:

```
VITE_API_URL=https://myworld-api.vercel.app
```

Set the Vercel project root directory to:

```
frontend/
```

## Build

Frontend:

```bash
cd frontend
npm install
npm run build
```

Backend:

```bash
npm install
```

## Media

All new media is uploaded through the Express API to Cloudflare R2.

Current R2 folders:

```
posts/
avatars/
banners/
```

The public R2 domain is configured through `CF_R2_PUBLIC_BASE`.

## Database

Neon PostgreSQL stores the application's durable social data:

- Accounts
- Profiles
- Posts
- Likes
- Comments
- Follows
- Notifications
- Reports
- Messages
- Presence fallback
- Password-reset records

Firebase Realtime Database provides realtime delivery for messaging and presence.

## Production testing

Health check:

```
curl https://myworld-api.vercel.app/api/health
```

Feed:

```
curl https://myworld-api.vercel.app/api/feed
```

The production application is a conventional social platform and does not require blockchain or decentralized-storage services.
