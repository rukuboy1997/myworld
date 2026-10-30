import { BrowserRouter, Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage.jsx";
import FeedPage from "./pages/FeedPage.jsx";
import ReelsPage from "./pages/ReelsPage.jsx";
import ReelsAnalyticsPage from "./pages/ReelsAnalyticsPage.jsx";
import CreatePostPage from "./pages/CreatePostPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import MessagesPage from "./pages/MessagesPage.jsx";
import ExplorePage from "./pages/ExplorePage.jsx";
import NotificationsPage from "./pages/NotificationsPage.jsx";
import VerifyEmailPage from "./pages/VerifyEmailPage.jsx";
import PostPage from "./pages/PostPage.jsx";
import EditPostPage from "./pages/EditPostPage.jsx";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage.jsx";
import TermsOfServicePage from "./pages/TermsOfServicePage.jsx";
import DeleteAccountPage from "./pages/DeleteAccountPage.jsx";
import ChildSafetyPage from "./pages/ChildSafetyPage.jsx";
import AdminModerationPage from "./pages/AdminModerationPage.jsx";
import AdminMediaDiagnosticsPage from "./pages/AdminMediaDiagnosticsPage.jsx";
import AdminMediaStoragePage from "./pages/AdminMediaStoragePage.jsx";


import { useEffect } from "react";
import { registerPushToken } from "./lib/api.js";
import { getAuthToken } from "./lib/auth.jsx";

const PUSH_TOKEN_STORAGE_KEY = "myworld_push_token";

export default function App() {
  useEffect(() => {
    const submitStoredToken = (event) => {
      const detail = event?.detail || window.__myWorldPushToken || null;
      if (detail?.token) {
        window.__myWorldPushToken = {
          token: detail.token,
          platform: detail.platform || "unknown",
        };
        try {
          localStorage.setItem(
            PUSH_TOKEN_STORAGE_KEY,
            JSON.stringify(window.__myWorldPushToken),
          );
        } catch {}
      }

      let saved = window.__myWorldPushToken;
      if (!saved?.token) {
        try {
          saved = JSON.parse(localStorage.getItem(PUSH_TOKEN_STORAGE_KEY) || "null");
        } catch {
          saved = null;
        }
      }

      // Push-token registration requires authentication. Keep the token locally
      // and retry after sign-in instead of losing it when the app starts logged out.
      if (!saved?.token || !getAuthToken()) return;
      registerPushToken(saved.token, saved.platform || "unknown").catch((error) => {
        console.warn("Push token registration failed:", error);
      });
    };

    window.addEventListener("myworld-push-token", submitStoredToken);
    window.addEventListener("myworld:auth-changed", submitStoredToken);
    submitStoredToken();

    return () => {
      window.removeEventListener("myworld-push-token", submitStoredToken);
      window.removeEventListener("myworld:auth-changed", submitStoredToken);
    };
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MessagesPage />} />
        <Route path="/welcome" element={<LandingPage />} />
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/reels" element={<ReelsPage />} />
        <Route path="/reels/analytics" element={<ReelsAnalyticsPage />} />
        <Route path="/post/:id" element={<PostPage />} />
        <Route path="/create" element={<CreatePostPage />} />
        <Route path="/profile/:address" element={<ProfilePage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/edit/:id" element={<EditPostPage />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsOfServicePage />} />
        <Route path="/delete-account" element={<DeleteAccountPage />} />
        <Route path="/child-safety" element={<ChildSafetyPage />} />
        <Route path="/admin/moderation" element={<AdminModerationPage />} />
        <Route path="/admin/media-diagnostics" element={<AdminMediaDiagnosticsPage />} />
        <Route path="/admin/media-storage" element={<AdminMediaStoragePage />} />
      </Routes>
    </BrowserRouter>
  );
}
