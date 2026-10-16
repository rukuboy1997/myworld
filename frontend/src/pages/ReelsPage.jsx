import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import { getReels, likePost, recordReelWatch, truncateAddress } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import CommentSheet from "../components/CommentSheet.jsx";

function createPlaybackSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function ReelCard({ post, address, isAuthenticated, openAuthModal, shouldPreload, onVisibilityChange }) {
  const cardRef = useRef(null);
  const videoRef = useRef(null);
  const watchRef = useRef({
    sessionId: createPlaybackSessionId(),
    watchedMs: 0,
    durationMs: 0,
    completed: false,
    lastTickAt: null,
    lastSentMs: 0,
    sending: false,
  });
  const [isVisible, setIsVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [liked, setLiked] = useState(Boolean(post.userLiked));
  const [likes, setLikes] = useState(Number(post.likes || 0));
  const [commentCount, setCommentCount] = useState(Number(post.commentCount || 0));
  const [showComments, setShowComments] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [mediaError, setMediaError] = useState(false);

  useEffect(() => {
    const node = cardRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting && entry.intersectionRatio >= 0.6;
        setIsVisible(visible);
        onVisibilityChange?.(post.id, visible);
      },
      { threshold: [0, 0.3, 0.6, 0.85, 1] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onVisibilityChange, post.id]);

  const flushWatch = useCallback(async (force = false) => {
    if (!isAuthenticated) return;
    const watch = watchRef.current;
    if (watch.sending || watch.watchedMs < 1000) return;
    if (!force && watch.watchedMs - watch.lastSentMs < 5000) return;
    watch.sending = true;
    try {
      await recordReelWatch(post.id, {
        sessionId: watch.sessionId,
        watchedMs: Math.floor(watch.watchedMs),
        durationMs: Math.floor(watch.durationMs),
        completed: watch.completed,
      });
      watch.lastSentMs = watch.watchedMs;
    } catch (err) {
      // Analytics must never interrupt playback; a later progress event retries.
      console.debug("Reel watch tracking skipped", err?.message || err);
    } finally {
      watch.sending = false;
    }
  }, [isAuthenticated, post.id]);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const watch = watchRef.current;
    if (Number.isFinite(video.duration) && video.duration > 0) {
      watch.durationMs = Math.min(video.duration * 1000, 4 * 60 * 60 * 1000);
    }
    const now = performance.now();
    if (!video.paused && !video.seeking && watch.lastTickAt !== null) {
      const elapsed = now - watch.lastTickAt;
      // Cap intervals so tab suspension or stalls don't inflate watch time.
      if (elapsed > 0 && elapsed <= 2000) watch.watchedMs += elapsed;
    }
    watch.lastTickAt = now;
    if (watch.durationMs > 0 && watch.watchedMs >= watch.durationMs * 0.9) {
      watch.completed = true;
    }
    if (watch.watchedMs - watch.lastSentMs >= 5000) flushWatch();
  };

  const handleVideoPlay = () => {
    watchRef.current.lastTickAt = performance.now();
    setIsPlaying(true);
  };

  const handleVideoPause = () => {
    watchRef.current.lastTickAt = null;
    setIsPlaying(false);
    flushWatch(true);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isVisible) {
      video.play().catch(() => setIsPlaying(false));
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [isVisible]);

  useEffect(() => () => { flushWatch(true); }, [flushWatch]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleLike = async () => {
    if (!isAuthenticated) {
      openAuthModal("signin");
      return;
    }
    if (isLiking) return;
    setIsLiking(true);
    try {
      const result = await likePost(post.id, address);
      setLiked(Boolean(result.liked));
      setLikes(Number(result.likes || 0));
    } catch (err) {
      console.error("Failed to like Reel", err);
    } finally {
      setIsLiking(false);
    }
  };

  const profile = post.profile || {};
  const creator = profile.displayName || profile.username || truncateAddress(post.owner);
  const caption = [post.title, post.content].filter(Boolean).join(" — ");

  return (
    <article ref={cardRef} className="reel-card relative h-[100dvh] min-h-[430px] w-full flex-shrink-0 snap-start snap-always overflow-hidden bg-black sm:mx-auto sm:max-w-[560px] sm:rounded-3xl sm:border sm:border-white/10 sm:shadow-2xl">
      {!mediaError && post.mediaUrl ? (
        <video
          ref={videoRef}
          src={post.mediaUrl}
          className="absolute inset-0 h-full w-full cursor-pointer object-contain bg-black"
          playsInline
          loop
          muted={isMuted}
          preload={isVisible || shouldPreload ? "auto" : "metadata"}
          onClick={togglePlayback}
          onPlay={handleVideoPlay}
          onPause={handleVideoPause}
          onTimeUpdate={handleTimeUpdate}
          onError={() => setMediaError(true)}
          aria-label={caption || "myWorld Reel"}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black p-6 text-center text-white">
          <span className="text-4xl">🎬</span>
          <p className="font-semibold">This video is unavailable</p>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/25" />



      {!isPlaying && isVisible && !mediaError && (
        <button type="button" onClick={togglePlayback} className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur" aria-label="Play video">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </button>
      )}

      <div className="absolute bottom-0 left-0 right-0 flex items-end gap-3 p-4 pb-5 text-white sm:p-5">
        <div className="min-w-0 flex-1">
          <Link to={post.owner ? "/profile/" + encodeURIComponent(post.owner) : "/reels"} className="mb-3 inline-flex max-w-full items-center gap-2.5 rounded-full bg-black/35 pr-3 backdrop-blur transition hover:bg-black/55">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" className="h-10 w-10 rounded-full border border-white/30 object-cover" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/10 font-bold">{creator.slice(0, 1).toUpperCase()}</span>
            )}
            <span className="min-w-0 text-left">
              <span className="block max-w-[230px] truncate text-sm font-bold">{creator}</span>
              <span className="block max-w-[230px] truncate text-xs text-white/65">@{profile.username || truncateAddress(post.owner)}</span>
            </span>
          </Link>
          {caption && <p className="mb-3 line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed drop-shadow">{caption}</p>}
          <div className="flex items-center gap-4 text-xs text-white/75">
            <span>▶ Video</span>
            <Link to={"/post/" + encodeURIComponent(post.id)} className="underline decoration-white/40 underline-offset-2 hover:text-white">Open post & comments</Link>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-4 pb-1">
          <button
            type="button"
            onClick={() => setIsMuted((current) => !current)}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label={isMuted ? "Unmute video" : "Mute video"}
            title={isMuted ? "Unmute video" : "Mute video"}
          >
            {isMuted ? (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6m0-6-5 6"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13"/></svg>
            )}
          </button>
          <button type="button" onClick={handleLike} disabled={isLiking} className="flex flex-col items-center gap-1 text-white transition active:scale-90 disabled:opacity-60" aria-label={liked ? "Unlike Reel" : "Like Reel"}>
            <span className={"flex h-12 w-12 items-center justify-center rounded-full bg-black/40 backdrop-blur " + (liked ? "text-rose-400" : "text-white")}>
              <svg viewBox="0 0 24 24" width="25" height="25" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>
            </span>
            <span className="text-xs font-bold">{likes}</span>
          </button>
          <button type="button" onClick={() => setShowComments(true)} className="flex flex-col items-center gap-1 text-white transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-xl" aria-label="View comments">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 backdrop-blur">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></svg>
            </span>
            <span className="text-xs font-bold">{commentCount}</span>
          </button>
          <button type="button" onClick={async () => {
            const url = window.location.origin + "/post/" + post.id;
            try {
              if (navigator.share) await navigator.share({ title: creator + " on myWorld", text: caption, url });
              else { await navigator.clipboard.writeText(url); }
            } catch {}
          }} className="flex flex-col items-center gap-1 text-white transition hover:scale-105" aria-label="Share Reel">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 backdrop-blur">
              <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.7 6.8-4.4m-6.8 9 6.8 4.1"/></svg>
            </span>
            <span className="text-xs font-bold">Share</span>
          </button>
          {isAuthenticated && (
            <Link
              to="/reels/analytics"
              className="flex flex-col items-center gap-1 text-white transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-xl"
              aria-label="Reels analytics"
              title="Analytics"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 backdrop-blur">
                <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 3 6-7"/></svg>
              </span>
              <span className="text-[10px] font-bold">Analytics</span>
            </Link>
          )}
        </div>
      </div>
      <CommentSheet
        post={{ ...post, commentCount }}
        isOpen={showComments}
        onClose={() => setShowComments(false)}
        onCommentAdded={(_comment, nextCount) => setCommentCount(nextCount)}
      />
    </article>
  );
}

export default function ReelsPage() {
  const { address, isAuthenticated, openAuthModal } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [reels, setReels] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [sort, setSort] = useState("for-you");
  const [activeReelId, setActiveReelId] = useState(null);
  const scrollRef = useRef(null);
  const activeIndex = Math.max(0, reels.findIndex((item) => item.id === activeReelId));
  const [canPreloadAhead] = useState(() => {
    if (typeof navigator === "undefined") return false;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return !connection?.saveData && !/^(slow-2g|2g)$/.test(connection?.effectiveType || "");
  });
  const handleVisibilityChange = useCallback((id, visible) => {
    if (visible) setActiveReelId(id);
  }, []);

  const closeReels = useCallback(() => {
    // React Router records the in-app history index. Use Back when there is
    // an in-app destination; direct links safely fall back to the feed.
    const historyIndex = window.history.state?.idx;
    if (typeof historyIndex === "number" && historyIndex > 0) {
      navigate(-1);
    } else {
      navigate("/feed", { replace: true });
    }
  }, [navigate]);

  const loadInitial = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const result = await getReels({ limit: 10, sort });
      setReels(result.items || []);
      setActiveReelId(null);
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      setNextCursor(result.nextCursor || null);
      setHasMore(Boolean(result.hasMore));
    } catch (err) {
      setError(err.message || "Couldn't load Reels.");
    } finally {
      setIsLoading(false);
    }
  }, [address, sort]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  // On route changes, begin at the top and let the active card's visibility
  // observer decide which video should play. The route's natural Back action
  // remains intact; we do not add fake history entries.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [location.key]);

  const loadMore = async () => {
    if (!hasMore || !nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const result = await getReels({ cursor: nextCursor, limit: 10, sort });
      setReels((current) => {
        const existing = new Set(current.map((item) => item.id));
        return [...current, ...(result.items || []).filter((item) => !existing.has(item.id))];
      });
      setNextCursor(result.nextCursor || null);
      setHasMore(Boolean(result.hasMore));
    } catch (err) {
      setError(err.message || "Couldn't load more Reels.");
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <Layout immersive>
      <section className="relative h-[100dvh] min-h-0 w-full overflow-hidden bg-black text-white">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-40 bg-gradient-to-b from-black/85 via-black/35 to-transparent" />
        <header className="absolute inset-x-0 top-0 z-40 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] sm:px-5">
          <div className="mx-auto grid w-full max-w-[560px] grid-cols-[40px_minmax(0,1fr)_40px] items-center gap-2">
            <Link
              to="/create"
              aria-label="Create a post"
              title="Create"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur-md transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </Link>

            <div className="mx-auto flex min-w-0 max-w-[300px] items-center gap-0.5 rounded-full border border-white/15 bg-black/50 p-1 backdrop-blur-md">
              {[
                ["for-you", "For You"],
                ["trending", "Trending"],
                ["latest", "Latest"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSort(value)}
                  aria-pressed={sort === value}
                  className={"min-w-0 flex-1 whitespace-nowrap rounded-full px-2 py-2 text-[11px] font-bold transition sm:px-3 sm:text-xs " + (sort === value ? "bg-white text-black shadow" : "text-white/75 hover:bg-white/10 hover:text-white")}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={closeReels}
              aria-label="Close Reels and return"
              title="Back"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur-md transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m15 18-6-6 6-6M9 12h12" />
              </svg>
            </button>
          </div>
        </header>
        {isLoading ? (
          <div className="flex h-full items-center justify-center bg-black px-6 pt-24 text-center text-sm text-white/65">
            <div>
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              Loading Reels…
            </div>
          </div>
        ) : error && reels.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center bg-black px-6 pt-24 text-center">
            <span className="mb-3 text-4xl">📡</span>
            <p className="max-w-sm text-sm text-white/75">{error}</p>
            <button onClick={loadInitial} className="mt-4 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black">Try again</button>
          </div>
        ) : reels.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center bg-black px-6 pt-24 text-center">
            <span className="mb-4 text-5xl">🎬</span>
            <h2 className="text-xl font-bold">Your Reels feed starts here</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-white/65">Videos shared as posts will appear here automatically. Upload a video with a caption to publish your first Reel.</p>
            <Link to="/create" className="mt-5 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black">Create a video post</Link>
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="absolute inset-0 flex h-full snap-y snap-mandatory flex-col overflow-y-auto overscroll-y-contain bg-black [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Reels video feed"
          >
            {reels.map((post, index) => (
              <ReelCard
                key={post.id}
                post={post}
                address={address}
                isAuthenticated={isAuthenticated}
                openAuthModal={openAuthModal}
                onVisibilityChange={handleVisibilityChange}
                shouldPreload={canPreloadAhead && (index === activeIndex || index === activeIndex + 1)}
              />
            ))}
            {hasMore && (
              <div className="flex min-h-24 flex-shrink-0 items-center justify-center bg-black pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3">
                <button onClick={loadMore} disabled={isLoadingMore} className="rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15 disabled:opacity-60">
                  {isLoadingMore ? "Loading more videos…" : "Load more Reels"}
                </button>
              </div>
            )}
            {!hasMore && <p className="flex min-h-16 flex-shrink-0 items-center justify-center bg-black pb-[calc(env(safe-area-inset-bottom)+1rem)] text-xs text-white/55">You're all caught up 🎉</p>}
            {error && <p className="flex-shrink-0 bg-black py-3 text-center text-sm text-rose-300">{error}</p>}
          </div>
        )}
      </section>
    </Layout>
  );
}
