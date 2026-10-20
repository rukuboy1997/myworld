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


import { useEffect } from "react";
import { registerPushToken } from "./lib/api.js";

export default function App() {
  useEffect(() => {
    const submitToken = (event) => {
      const token = event.detail?.token;
      const platform = event.detail?.platform || "unknown";
      if (token) registerPushToken(token, platform).catch((error) => console.warn("Push token registration failed:", error));
    };
    window.addEventListener("myworld-push-token", submitToken);
    if (window.__myWorldPushToken?.token) submitToken({ detail: window.__myWorldPushToken });
    return () => window.removeEventListener("myworld-push-token", submitToken);
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
      </Routes>
    </BrowserRouter>
  );
}
