import { getAuth, signInWithCustomToken, signOut } from "firebase/auth";
import { firebaseApp } from "./firebase.js";

const API_ORIGIN = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const firebaseAuth = getAuth(firebaseApp);

let activeApiToken = null;
let sessionVersion = 0;
let pendingPromise = null;
let pendingApiToken = null;

/**
 * Exchange the currently authenticated myWorld API session for a Firebase
 * custom token. All Firebase listeners should await this before subscribing.
 */
export async function syncFirebaseAuth(apiToken) {
  if (!apiToken) return false;

  if (activeApiToken !== apiToken) {
    activeApiToken = apiToken;
    sessionVersion += 1;
    pendingPromise = null;
    pendingApiToken = null;
  }

  if (pendingPromise && pendingApiToken === apiToken) {
    return pendingPromise;
  }

  const currentVersion = sessionVersion;
  pendingApiToken = apiToken;
  const currentPromise = (async () => {
    const response = await fetch(`${API_ORIGIN}/api/firebase/custom-token`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || "Firebase authentication could not be established");
    }

    if (currentVersion !== sessionVersion || activeApiToken !== apiToken) {
      return false;
    }
    if (!result.firebaseToken || !result.uid) {
      throw new Error("The API returned an incomplete Firebase token response");
    }

    if (firebaseAuth.currentUser?.uid !== result.uid) {
      await signInWithCustomToken(firebaseAuth, result.firebaseToken);
    }

    // Do not let an older session finish signing in after an account switch.
    if (currentVersion !== sessionVersion || activeApiToken !== apiToken) {
      if (firebaseAuth.currentUser?.uid === result.uid) {
        await signOut(firebaseAuth).catch(() => {});
      }
      return false;
    }
    return firebaseAuth.currentUser?.uid === result.uid;
  })();

  pendingPromise = currentPromise;
  try {
    return await currentPromise;
  } finally {
    if (pendingPromise === currentPromise) {
      pendingPromise = null;
      pendingApiToken = null;
    }
  }
}

export async function clearFirebaseAuth() {
  activeApiToken = null;
  sessionVersion += 1;
  pendingPromise = null;
  pendingApiToken = null;
  try {
    await signOut(firebaseAuth);
  } catch {
    // Signing out an already signed-out Firebase session is harmless.
  }
}
