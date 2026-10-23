# Firebase Realtime Database security and setup

myWorld uses Neon/Postgres as its durable message store and Firebase Realtime Database for live message, typing, read-receipt, and presence delivery.

## Server environment

Set these in the **backend/API deployment** (for example, the Vercel project that runs `myworld-api`):

- `FIREBASE_DB_URL=https://fascoin-app-default-rtdb.firebaseio.com`
- `FIREBASE_SERVICE_ACCOUNT_JSON`: the complete JSON key for a Firebase service account in the `fascoin-app` project. Store it as one compact JSON value if the deployment UI expects a single line.

Do not put the service-account JSON in any `VITE_*` variable, frontend environment, repository, or mobile app. Do not commit the downloaded service-account file.

The service account needs access to Firebase Authentication custom-token signing and Realtime Database. Enable Firebase Authentication in the Firebase console if it is not already enabled. Add the deployed frontend domain (and `localhost` for local development) to Authentication's authorized domains if the console requires it.

The frontend uses the existing public Firebase app configuration in `frontend/src/lib/firebase.js`. No new frontend secret is required. Keep `VITE_API_URL` pointing to the deployed myWorld API as it does today.

## Rules deployment

The rules in `database.rules.json` allow authenticated users to read only conversation nodes where the server-maintained `conversationMembers` index includes their Firebase UID. Client writes are denied. The backend writes through a service-account OAuth token, so it can persist new messages and update typing/read receipts even though client writes are denied. Authenticated users may read individual presence records; clients cannot write presence.

Review the rules before applying them. From a trusted development machine with Firebase CLI installed and access to the project, run:

```bash
firebase login
firebase deploy --only database --project fascoin-app
```

Alternatively, copy the contents of `database.rules.json` into Realtime Database **Rules** in the Firebase console and publish them.

Do not restore public `.read` or `.write` rules. Existing conversations get membership records as authenticated users open the inbox/conversation and the backend synchronizes their messages. Keep the Neon polling fallback enabled until two-account tests confirm that incoming messages and receipts arrive live.

## Smoke tests

1. Sign in with two existing accounts on separate browser sessions/devices.
2. Keep account B's conversation with account A open; send a message from A. B should receive it without leaving/reopening the conversation.
3. Check typing indicators, message edits/deletes, and read receipts.
4. Sign out, then try reading a conversation path directly from the Firebase client. Access should be denied.
5. Confirm an authenticated user who is not a participant cannot subscribe to another pair's conversation.
