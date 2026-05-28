# Deploying myWorld to Vercel

This project is set up for a single Vercel deployment that serves both the
React frontend and the Express API.

## Architecture on Vercel

```
Browser
   │
   ├── /            → static React build (frontend/dist)
   ├── /assets/*    → static assets
   └── /api/*       → api/index.js (the entire Express app, wrapped as a
                       serverless function via serverless-http)
```

- `api/index.js` — Vercel serverless entry. Imports the same Express `app`
  the local dev server uses.
- `app.js` — shared Express app builder.
- `server.js` — local-dev only entry (used by `npm run dev` / Replit).
- `vercel.json` — build config + URL rewrites.

## Required environment variables

Set these in **Vercel → Project Settings → Environment Variables** (mark
all as available in Production, Preview, and Development):

| Variable | Required | Description |
|---|---|---|
| `NEON_DATABASE_URL` | yes | Postgres connection string. Use Neon's *pooled* connection string. |
| `JWT_SECRET` | yes | Long random string used to sign auth JWTs. |
| `SUI_PRIVATE_KEY` | yes | Backend wallet that signs Sui transactions. |
| `RESEND_API_KEY` | recommended | API key for Resend (https://resend.com — free tier covers 100 emails/day). Without it, password-reset codes are only logged to the server console. |
| `EMAIL_FROM` | optional | From address for password-reset emails. Defaults to `myWorld <onboarding@resend.dev>`. |

## One-time setup

1. Push this repo to GitHub.
2. In Vercel, click **Add New → Project**, pick the repo.
3. Vercel will auto-detect `vercel.json`. Don't change the framework preset.
4. Add the environment variables above.
5. Deploy. Vercel will run `npm install && cd frontend && npm install &&
   npm run build`, then deploy the static assets and the `api/index.js`
   serverless function.

## Caveats / things to know

- **Body size cap.** Vercel functions have a 4.5MB request body limit.
  Image avatars and short-form posts are fine; large videos uploaded via
  the post form may be rejected. The cap can be raised on Pro by setting
  `bodyParser.sizeLimit` per route — but for big media you should upload
  to Walrus directly from the browser instead.
- **Function timeout.** `vercel.json` requests `maxDuration: 60` (Pro). On
  the Hobby plan this silently caps at 10s, which can be tight for Walrus
  uploads on slow connections.
- **Cold starts.** First request after idle takes ~1–2s extra. The Neon
  serverless driver is used so connections are cheap.
- **Rate limiter.** Backed by a Postgres table (`rate_limit_events`) so it
  works across cold starts and multiple function instances.
- **Sui wallet keys.** Treat `SUI_PRIVATE_KEY` like a production secret —
  never commit it.

## Testing the deployed API

```
curl https://your-app.vercel.app/api/health
curl https://your-app.vercel.app/api/feed
```
