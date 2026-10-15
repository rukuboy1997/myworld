import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import { getReels, likePost, truncateAddress } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

function ReelCard({ post, address, isAuthenticated, openAuthModal }) {
  const cardRef = useRef(null);
  const videoRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [liked, setLiked] = useState(Boolean(post.userLiked));
  const [likes, setLikes] = useState(Number(post.likes || 0));
  const [isLiking, setIsLiking] = useState(false);
  const [mediaError, setMediaError] = useState(false);

  useEffect(() => {
    const node = cardRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting && entry.intersectionRatio >= 0.6),
      { threshold: [0, 0.3, 0.6, 0.85, 1] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isVisible) {
      video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [isVisible]);

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
    <article ref={cardRef} className="reel-card relative mx-auto h-[calc(100svh-9.5rem)] min-h-[430px] max-h-[900px] w-full max-w-[560px] snap-start overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl">
      {!mediaError && post.mediaUrl ? (
        <video
          ref={videoRef}
          src={post.mediaUrl}
          className="absolute inset-0 h-full w-full cursor-pointer object-contain bg-black"
          playsInline
          loop
          muted={isMuted}
          preload="metadata"
          onClick={togglePlayback}
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

      <div className="absolute left-4 right-4 top-4 flex items-center justify-between">
        <span className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs font-semibold text-white backdrop-blur">REELS</span>
        <button
          type="button"
          onClick={() => setIsMuted((current) => !current)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur transition hover:bg-black/70"
          aria-label={isMuted ? "Unmute video" : "Mute video"}
        >
          {isMuted ? (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6m0-6-5 6"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13"/></svg>
          )}
        </button>
      </div>

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

        <div className="flex shrink-0 flex-col items-center gap-5 pb-1">
          <button type="button" onClick={handleLike} disabled={isLiking} className="flex flex-col items-center gap-1 text-white transition active:scale-90 disabled:opacity-60" aria-label={liked ? "Unlike Reel" : "Like Reel"}>
            <span className={"flex h-12 w-12 items-center justify-center rounded-full bg-black/40 backdrop-blur " + (liked ? "text-rose-400" : "text-white")}>
              <svg viewBox="0 0 24 24" width="25" height="25" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>
            </span>
            <span className="text-xs font-bold">{likes}</span>
          </button>
          <Link to={"/post/" + encodeURIComponent(post.id)} className="flex flex-col items-center gap-1 text-white transition hover:scale-105" aria-label="View comments">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 backdrop-blur">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></svg>
            </span>
            <span className="text-xs font-bold">{Number(post.commentCount || 0)}</span>
          </Link>
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
        </div>
      </div>
    </article>
  );
}

export default function ReelsPage() {
  const { address, isAuthenticated, openAuthModal } = useAuth();
  const [reels, setReels] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  const loadInitial = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const result = await getReels(address, { limit: 10 });
      setReels(result.items || []);
      setNextCursor(result.nextCursor || null);
      setHasMore(Boolean(result.hasMore));
    } catch (err) {
      setError(err.message || "Couldn't load Reels.");
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  const loadMore = async () => {
    if (!hasMore || !nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const result = await getReels(address, { cursor: nextCursor, limit: 10 });
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
    <Layout>
      <div className="mx-auto flex w-full max-w-5xl flex-col px-3 pb-5 pt-4 sm:px-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Reels</h1>
            <p className="mt-1 text-sm text-muted-foreground">Short videos from the myWorld community.</p>
          </div>
          <Link to="/create" className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90">Create post</Link>
        </div>

        {isLoading ? (
          <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">Loading Reels…</div>
        ) : error && reels.length === 0 ? (
          <div className="rounded-2xl border border-white/10 p-6 text-center">
            <p className="mb-4 text-sm text-muted-foreground">{error}</p>
            <button onClick={loadInitial} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Try again</button>
          </div>
        ) : reels.length === 0 ? (
          <div className="flex min-h-[55vh] flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 px-6 text-center">
            <span className="mb-4 text-5xl">🎬</span>
            <h2 className="text-xl font-bold">Your Reels feed starts here</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Videos shared as posts will appear here automatically. Upload a video with a caption to publish your first Reel.</p>
            <Link to="/create" className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Create a video post</Link>
          </div>
        ) : (
          <div ref={scrollRef} className="flex flex-col snap-y snap-mandatory gap-4 overflow-y-auto pb-4">
            {reels.map((post) => <ReelCard key={post.id} post={post} address={address} isAuthenticated={isAuthenticated} openAuthModal={openAuthModal} />)}
            {hasMore && (
              <div className="flex justify-center py-5">
                <button onClick={loadMore} disabled={isLoadingMore} className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold transition hover:bg-white/5 disabled:opacity-60">
                  {isLoadingMore ? "Loading more videos…" : "Load more Reels"}
                </button>
              </div>
            )}
            {!hasMore && <p className="py-5 text-center text-xs text-muted-foreground">You're all caught up 🎉</p>}
            {error && <p className="py-2 text-center text-sm text-rose-400">{error}</p>}
          </div>
        )}
      </div>
    </Layout>
  );
}
