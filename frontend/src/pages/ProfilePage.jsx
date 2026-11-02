import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import PostCard from "../components/PostCard.jsx";
import {
  getProfile,
  createProfile,
  followUser,
  unfollowUser,
  getFollowStatus,
  getBlockStatus,
  blockUser,
  unblockUser,
  reportUser,
  truncateAddress,
} from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

function ShareProfileButton({ address, username }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/profile/${address}`;
  const text = `Check out ${username ? "@" + username : "this profile"} on myWorld — a social network!`;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "myWorld Profile", text, url });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleShare}
      title="Share profile"
      className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-colors
        ${copied ? "border-green-500/30 text-green-400 bg-green-500/10" : "border-white/10 text-muted-foreground bg-secondary hover:bg-secondary/80 hover:text-foreground"}`}
    >
      {copied ? (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>{" "}
          Copied!
        </>
      ) : (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" x2="12" y1="2" y2="15" />
          </svg>{" "}
          Share
        </>
      )}
    </button>
  );
}

const PROFESSIONS = [
  "Actor / Actress",
  "Athlete / Sports Competitor",
  "Author / Publisher",
  "Business Man / Tycoon",
  "Celebrity Chef",
  "Coach / Manager",
  "Comedian",
  "Content Creator",
  "Cybersecurity Expert",
  "Dancer / Choreographer",
  "Fashion Designer",
  "Film Director",
  "Footballer",
  "Grappler",
  "Influencer",
  "Journalist / Broadcaster",
  "Makeup Artist",
  "Model",
  "Musician / Singer",
  "Photographer",
  "Podcaster",
  "Race Car Driver",
  "Screenwriter",
  "Streamer",
  "Student",
  "Tech Entrepreneur",
  "Voice Actor",
  "YouTuber",
];

const EMPTY_FORM = {
  username: "",
  bio: "",
  displayName: "",
  website: "",
  location: "",
  twitter: "",
  profession: "",
  country: "",
  stateProvince: "",
};

export default function ProfilePage() {
  const { address } = useParams();
  const navigate = useNavigate();
  const { address: currentWallet, isAuthenticated } = useAuth();
  const isOwnProfile = !!currentWallet && address === currentWallet;

  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [bannerFile, setBannerFile] = useState(null);
  const [bannerPreview, setBannerPreview] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  // Follow state
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [blockStatus, setBlockStatus] = useState({ blockedByMe: false, hasBlockedMe: false });
  const [isBlockLoading, setIsBlockLoading] = useState(false);
  const [safetyMessage, setSafetyMessage] = useState("");
  const [safetyError, setSafetyError] = useState("");
  const [showMoreActions, setShowMoreActions] = useState(false);

  const avatarRef = useRef(null);
  const bannerRef = useRef(null);

  const fetchProfile = async () => {
    setIsLoading(true);
    try {
      const data = await getProfile(address, currentWallet);
      setProfile(data);
      if (data) {
        setEditForm({
          username: data.username || "",
          bio: data.bio || "",
          displayName: data.displayName || "",
          website: data.website || "",
          location: data.location || "",
          twitter: data.twitter || "",
          profession: data.profession || "",
          country: data.country || "",
          stateProvince: data.stateProvince || "",
        });
      }
    } catch (err) {
      console.error("Failed to load profile", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFollowStatus = async () => {
    if (!isAuthenticated || isOwnProfile) return;
    try {
      const { following } = await getFollowStatus(address);
      setIsFollowing(following);
    } catch {}
  };

  useEffect(() => {
    fetchProfile();
  }, [address, currentWallet]);
  useEffect(() => {
    fetchFollowStatus();
  }, [address, isAuthenticated, currentWallet, isOwnProfile]);

  useEffect(() => {
    let active = true;
    if (!isAuthenticated || isOwnProfile) {
      setBlockStatus({ blockedByMe: false, hasBlockedMe: false });
      return () => { active = false; };
    }
    getBlockStatus(address)
      .then((status) => { if (active) setBlockStatus(status); })
      .catch(() => { if (active) setBlockStatus({ blockedByMe: false, hasBlockedMe: false }); });
    return () => { active = false; };
  }, [address, isAuthenticated, currentWallet, isOwnProfile]);

  const handleFollowToggle = async () => {
    if (!isAuthenticated) return;
    setIsFollowLoading(true);
    try {
      if (isFollowing) {
        await unfollowUser(address);
        setIsFollowing(false);
        setProfile((p) =>
          p
            ? { ...p, followerCount: Math.max(0, (p.followerCount || 1) - 1) }
            : p,
        );
      } else {
        await followUser(address);
        setIsFollowing(true);
        setProfile((p) =>
          p ? { ...p, followerCount: (p.followerCount || 0) + 1 } : p,
        );
      }
    } catch (err) {
      console.error("Follow toggle failed", err);
    } finally {
      setIsFollowLoading(false);
    }
  };

  const handleBlockToggle = async () => {
    if (!isAuthenticated || isOwnProfile || isBlockLoading) return;
    const shouldUnblock = blockStatus.blockedByMe;
    const confirmed = window.confirm(
      shouldUnblock
        ? "Unblock this user? They may be able to follow or message you again."
        : "Block this user? You will both be prevented from following each other or sending new messages."
    );
    if (!confirmed) return;
    setIsBlockLoading(true);
    setSafetyError("");
    setSafetyMessage("");
    try {
      if (shouldUnblock) {
        await unblockUser(address);
        setBlockStatus((s) => ({ ...s, blockedByMe: false }));
        setSafetyMessage("User unblocked.");
      } else {
        await blockUser(address);
        setBlockStatus((s) => ({ ...s, blockedByMe: true }));
        setIsFollowing(false);
        setProfile((p) => p ? { ...p, followerCount: Math.max(0, (p.followerCount || 0) - (isFollowing ? 1 : 0)) } : p);
        setSafetyMessage("User blocked. You can unblock them at any time.");
      }
    } catch (err) {
      setSafetyError(err.message || "Could not update block settings.");
    } finally {
      setIsBlockLoading(false);
    }
  };

  const handleReportUser = async () => {
    if (!isAuthenticated || isOwnProfile) return;
    const selection = window.prompt(
      "Why are you reporting this account? Enter a number:\n1. Spam or scam\n2. Harassment or bullying\n3. Impersonation\n4. Inappropriate content\n5. Child safety concern\n6. Other",
      "1"
    );
    if (selection === null) return;
    const reasons = {
      "1": "spam",
      "2": "harassment",
      "3": "impersonation",
      "4": "inappropriate",
      "5": "child-safety",
      "6": "other",
    };
    const reason = reasons[selection.trim()];
    if (!reason) {
      setSafetyError("Please enter a number from 1 to 6.");
      return;
    }
    const description = window.prompt("Add details (optional, up to 1000 characters):", "") || "";
    if (description.length > 1000) {
      setSafetyError("Details must be 1000 characters or fewer.");
      return;
    }
    setSafetyError("");
    setSafetyMessage("");
    try {
      const result = await reportUser(address, reason, description);
      setSafetyMessage(result.message || "Account report submitted.");
    } catch (err) {
      setSafetyError(err.message || "Could not submit report.");
    }
  };

  const handleFile = (kind) => (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please pick an image");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be under 10 MB");
      return;
    }
    setError(null);
    const url = URL.createObjectURL(file);
    if (kind === "avatar") {
      setAvatarFile(file);
      setAvatarPreview(url);
    } else {
      setBannerFile(file);
      setBannerPreview(url);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const updated = await createProfile({
        address: currentWallet,
        username: editForm.username.trim(),
        bio: editForm.bio.trim(),
        displayName: editForm.displayName.trim(),
        website: editForm.website.trim(),
        location: editForm.location.trim(),
        twitter: editForm.twitter.trim(),
        profession: editForm.profession,
        country: editForm.country.trim(),
        stateProvince: editForm.stateProvince.trim(),
        ...(avatarFile ? { avatar: avatarFile } : {}),
        ...(bannerFile ? { banner: bannerFile } : {}),
      });
      setProfile((prev) => ({ ...prev, ...updated }));
      setIsEditing(false);
      setAvatarFile(null);
      setAvatarPreview(null);
      setBannerFile(null);
      setBannerPreview(null);
    } catch (err) {
      setError(err.message || "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePostDelete = (postId) => {
    setProfile((current) => {
      if (!current) return current;
      return {
        ...current,
        posts: (current.posts || []).filter((post) => post.id !== postId),
      };
    });
  };

  const handleLikeUpdate = (postId, newLikes, newCommentCount) => {
    if (!profile) return;
    setProfile((current) => ({
      ...current,
      posts: current.posts.map((post) =>
        post.id === postId
          ? {
              ...post,
              likes: newLikes !== undefined ? newLikes : post.likes,
              commentCount:
                newCommentCount !== undefined
                  ? newCommentCount
                  : post.commentCount,
            }
          : post,
      ),
    }));
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto w-full px-4 py-10">
          <div className="glass-panel rounded-3xl p-8 h-64 animate-pulse mb-8"></div>
          <div className="flex flex-col gap-6">
            <div className="glass-panel rounded-3xl p-6 h-48 animate-pulse"></div>
            <div className="glass-panel rounded-3xl p-6 h-48 animate-pulse"></div>
          </div>
        </div>
      </Layout>
    );
  }

  const avatarSrc = avatarPreview || profile?.avatarUrl;
  const bannerSrc = bannerPreview || profile?.bannerUrl;
  const initial = profile?.username
    ? profile.username.charAt(0).toUpperCase()
    : truncateAddress(address).charAt(0);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto w-full px-4 py-6 md:py-10 animate-fade-in">
        <div className="glass-panel rounded-3xl mb-8 overflow-hidden">
          {/* Cover first: the avatar deliberately overlaps it on every screen size. */}
          {!isEditing && (
            <div className="relative h-32 sm:h-44 md:h-56 bg-gradient-brand">
              {bannerSrc && (
                <img
                  src={bannerSrc}
                  alt=""
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-background/35 to-transparent" />
            </div>
          )}

          <div className="px-4 md:px-8 pb-6">
            {!isEditing && (
              <>
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                  <div className="flex items-end gap-4 min-w-0 -mt-10 md:-mt-14">
                    {avatarSrc ? (
                      <img
                        src={avatarSrc}
                        alt={profile?.username || "Profile"}
                        className="w-24 h-24 md:w-32 md:h-32 rounded-full object-cover border-4 border-background shadow-xl flex-shrink-0"
                      />
                    ) : (
                      <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-gradient-brand flex items-center justify-center text-white font-bold text-3xl md:text-5xl shadow-xl border-4 border-background flex-shrink-0">
                        {initial}
                      </div>
                    )}

                    <div className="min-w-0 pb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <h1 className="text-xl md:text-3xl font-bold tracking-tight truncate">
                          {profile?.displayName || profile?.username || "Anonymous"}
                        </h1>
                        {profile?.membership?.badge && profile.membership.planId !== "free" && (
                          <span
                            title={profile.membership.name}
                            className="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/15 border border-primary/25 px-2 py-1 text-[10px] font-bold text-primary"
                          >
                            ★ {profile.membership.name}
                          </span>
                        )}
                      </div>
                      {profile?.username && profile?.displayName && (
                        <p className="text-muted-foreground text-sm">@{profile.username}</p>
                      )}
                      {profile?.profession && (
                        <span className="inline-block mt-1.5 text-xs font-medium bg-primary/10 text-primary px-2.5 py-1 rounded-full border border-primary/20">
                          {profile.profession}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                    {!isOwnProfile && isAuthenticated && !blockStatus.blockedByMe && !blockStatus.hasBlockedMe && (
                      <>
                        <button
                          onClick={handleFollowToggle}
                          disabled={isFollowLoading}
                          className={`px-5 py-2.5 rounded-full font-semibold text-sm transition-colors border disabled:opacity-60 ${
                            isFollowing
                              ? "bg-secondary border-white/10 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400"
                              : "bg-primary text-primary-foreground border-transparent hover:bg-primary/90"
                          }`}
                        >
                          {isFollowLoading ? "…" : isFollowing ? "Following" : "Follow"}
                        </button>
                        <button
                          onClick={() => navigate(`/messages?with=${encodeURIComponent(address)}`)}
                          className="px-5 py-2.5 rounded-full font-semibold text-sm bg-secondary text-secondary-foreground border border-white/10 hover:bg-secondary/80 transition-colors"
                        >
                          Message
                        </button>
                      </>
                    )}
                    {isOwnProfile && (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="bg-secondary text-secondary-foreground px-5 py-2.5 rounded-full font-semibold hover:bg-secondary/80 transition-colors border border-white/10 text-sm"
                      >
                        Edit Profile
                      </button>
                    )}
                    {!isOwnProfile && isAuthenticated && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowMoreActions((value) => !value)}
                          aria-expanded={showMoreActions}
                          aria-label="More profile actions"
                          className="w-10 h-10 rounded-full border border-white/10 bg-secondary hover:bg-secondary/80 transition-colors text-lg"
                        >
                          ⋯
                        </button>
                        {showMoreActions && (
                          <div className="absolute right-0 top-12 z-20 w-44 rounded-2xl border border-white/10 bg-background/95 backdrop-blur shadow-2xl p-1.5">
                            {!blockStatus.hasBlockedMe && (
                              <button
                                onClick={() => { setShowMoreActions(false); handleBlockToggle(); }}
                                disabled={isBlockLoading}
                                className="w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-red-500/10 hover:text-red-400 disabled:opacity-60"
                              >
                                {isBlockLoading ? "Working…" : blockStatus.blockedByMe ? "Unblock user" : "Block user"}
                              </button>
                            )}
                            <button
                              onClick={() => { setShowMoreActions(false); handleReportUser(); }}
                              className="w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-amber-500/10 hover:text-amber-300"
                            >
                              Report user
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <ShareProfileButton address={address} username={profile?.username} />
                  </div>
                </div>

                {(safetyMessage || safetyError || blockStatus.hasBlockedMe || blockStatus.blockedByMe) && (
                  <div className="mt-4 space-y-2" aria-live="polite">
                    {safetyMessage && <p className="text-sm text-green-400">{safetyMessage}</p>}
                    {safetyError && <p className="text-sm text-red-400">{safetyError}</p>}
                    {blockStatus.blockedByMe && <p className="text-sm text-amber-300">You blocked this account. New follows and messages are disabled.</p>}
                    {blockStatus.hasBlockedMe && <p className="text-sm text-muted-foreground">Some interactions with this account are unavailable.</p>}
                  </div>
                )}

                <div className="flex flex-wrap gap-x-5 gap-y-2 mt-5">
                  <div><span className="font-bold text-sm">{profile?.followerCount ?? 0}</span><span className="text-xs text-muted-foreground ml-1">Followers</span></div>
                  <div><span className="font-bold text-sm">{profile?.followingCount ?? 0}</span><span className="text-xs text-muted-foreground ml-1">Following</span></div>
                  {profile?.totalLikes > 0 && <div className="text-teal-400 text-xs font-medium">♥ {profile.totalLikes} likes</div>}
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  {profile?.bio ? (
                    <p className="text-sm md:text-base leading-relaxed max-w-2xl text-foreground/90">{profile.bio}</p>
                  ) : isOwnProfile ? (
                    <p className="text-muted-foreground italic text-sm">No bio yet. <button onClick={() => setIsEditing(true)} className="text-primary hover:underline">Add one</button></p>
                  ) : <p className="text-muted-foreground italic text-sm">No bio yet.</p>}

                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    {profile?.location && <span>📍 {profile.location}</span>}
                    {profile?.stateProvince && <span>{profile.stateProvince}</span>}
                    {profile?.country && <span>🌍 {profile.country}</span>}
                    {profile?.website && (
                      <a href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
                        ↗ {profile.website.replace(/^https?:\/\//, "")}
                      </a>
                    )}
                    {profile?.twitter && (
                      <a href={`https://x.com/${profile.twitter.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
                        @{profile.twitter.replace("@", "")}
                      </a>
                    )}
                  </div>
                  <span className="text-muted-foreground text-[11px] font-mono">{truncateAddress(address)}</span>
                </div>
              </>
            )}

            {/* Edit Form */}
            {isEditing && (
              <form
                onSubmit={handleSaveProfile}
                className="flex flex-col gap-4 animate-fade-in p-4 md:p-5 bg-background/50 rounded-2xl border border-white/10 mt-5"
              >
                <h3 className="font-bold text-sm md:text-base">
                  Edit your profile
                </h3>
                {error && <p className="text-sm text-red-400">{error}</p>}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase mb-2 block">
                      Profile Picture
                    </label>
                    <div className="flex items-center gap-3">
                      {avatarSrc ? (
                        <img
                          src={avatarSrc}
                          alt=""
                          className="w-14 h-14 rounded-full object-cover border-2 border-white/10"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-gradient-brand flex items-center justify-center text-white font-bold text-xl">
                          {initial}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => avatarRef.current?.click()}
                        className="bg-secondary px-3 py-1.5 rounded-full text-xs hover:bg-secondary/80 border border-white/10"
                      >
                        Change
                      </button>
                      <input
                        ref={avatarRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFile("avatar")}
                        className="hidden"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase mb-2 block">
                      Banner
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-10 rounded-lg bg-gradient-brand overflow-hidden border-2 border-white/10 flex-shrink-0">
                        {bannerSrc && (
                          <img
                            src={bannerSrc}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => bannerRef.current?.click()}
                        className="bg-secondary px-3 py-1.5 rounded-full text-xs hover:bg-secondary/80 border border-white/10"
                      >
                        Change
                      </button>
                      <input
                        ref={bannerRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFile("banner")}
                        className="hidden"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase mb-1 block">
                      Username *
                    </label>
                    <input
                      type="text"
                      required
                      value={editForm.username}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, username: e.target.value }))
                      }
                      className="w-full bg-secondary/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase mb-1 block">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={editForm.displayName}
                      onChange={(e) =>
                        setEditForm((p) => ({
                          ...p,
                          displayName: e.target.value,
                        }))
                      }
                      className="w-full bg-secondary/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase mb-1 block">
                    Profession
                  </label>
                  <select
                    value={editForm.profession}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, profession: e.target.value }))
                    }
                    className="w-full bg-secondary/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select your profession…</option>
                    {PROFESSIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase mb-1 block">
                    Bio
                  </label>
                  <textarea
                    rows={3}
                    value={editForm.bio}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, bio: e.target.value }))
                    }
                    placeholder="Tell the world about you..."
                    className="w-full bg-secondary/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase mb-1 block">
                      Location
                    </label>
                    <input
                      type="text"
                      value={editForm.location}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, location: e.target.value }))
                      }
                      placeholder="Earth"
                      className="w-full bg-secondary/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase mb-1 block">
                      Country
                    </label>
                    <input
                      type="text"
                      value={editForm.country}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, country: e.target.value }))
                      }
                      placeholder="Nigeria"
                      className="w-full bg-secondary/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase mb-1 block">
                      State / Province
                    </label>
                    <input
                      type="text"
                      value={editForm.stateProvince}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, stateProvince: e.target.value }))
                      }
                      placeholder="FCT"
                      className="w-full bg-secondary/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase mb-1 block">
                      Website
                    </label>
                    <input
                      type="text"
                      value={editForm.website}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, website: e.target.value }))
                      }
                      placeholder="myworld.app"
                      className="w-full bg-secondary/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase mb-1 block">
                      X / Twitter
                    </label>
                    <input
                      type="text"
                      value={editForm.twitter}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, twitter: e.target.value }))
                      }
                      placeholder="@handle"
                      className="w-full bg-secondary/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setAvatarFile(null);
                      setAvatarPreview(null);
                      setBannerFile(null);
                      setBannerPreview(null);
                    }}
                    className="px-5 py-2 rounded-full font-medium text-sm hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="bg-primary text-primary-foreground px-5 py-2 rounded-full font-medium text-sm disabled:opacity-50"
                  >
                    {isSaving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Posts */}
        <h2 className="text-lg md:text-2xl font-bold mb-5 tracking-tight flex items-center gap-3">
          Posts
          <span className="text-sm bg-secondary px-3 py-1 rounded-full text-muted-foreground font-medium">
            {profile?.posts?.length || 0}
          </span>
        </h2>

        <div className="flex flex-col gap-5">
          {!profile?.posts || profile.posts.length === 0 ? (
            <div className="glass-panel rounded-3xl p-12 text-center text-muted-foreground text-sm">
              This creator hasn't posted anything yet.
            </div>
          ) : (
            profile.posts.map((post) => (
              <PostCard
                key={post.id}
                post={{ ...post, profile }}
                onLikeUpdate={handleLikeUpdate}
                onPostDelete={handlePostDelete}
              />
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
