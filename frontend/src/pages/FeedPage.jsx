import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import PostCard from "../components/PostCard.jsx";
import StatusTray from "../components/StatusTray.jsx";
import { getFeed } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

function FeedNavLink({ to, children, active = false }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
    >
      {children}
    </Link>
  );
}

function NavIcon({ children }) {
  return (
    <span className="flex h-5 w-5 items-center justify-center" aria-hidden="true">
      {children}
    </span>
  );
}

export default function FeedPage() {
  const { address: wallet, user, isAuthenticated, openAuthModal } = useAuth();
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [sort, setSort] = useState("for-you");
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const fetchFeed = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getFeed(wallet, { sort });
      setPosts(data.items || []);
      setNextCursor(data.nextCursor || null);
      setHasMore(Boolean(data.hasMore));
    } catch (err) {
      setError(err.message || "Failed to load feed");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFeed();
  }, [wallet, sort]);

  const loadMore = async () => {
    if (!nextCursor || isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const data = await getFeed(wallet, { cursor: nextCursor, sort });
      setPosts((current) => {
        const existingIds = new Set(current.map((post) => post.id));
        return [...current, ...(data.items || []).filter((post) => !existingIds.has(post.id))];
      });
      setNextCursor(data.nextCursor || null);
      setHasMore(Boolean(data.hasMore));
    } catch (err) {
      setError(err.message || "Failed to load more posts");
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handlePostDelete = (postId) => {
    setPosts((current) => current.filter((post) => post.id !== postId));
  };

  const handleLikeUpdate = (postId, newLikes, newCommentCount) => {
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? {
              ...post,
              likes: newLikes !== undefined ? newLikes : post.likes,
              commentCount:
                newCommentCount !== undefined ? newCommentCount : post.commentCount,
            }
          : post,
      ),
    );
  };

  return (
    <Layout>
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-3 py-4 sm:px-5 md:py-7 lg:grid-cols-[220px_minmax(0,620px)] lg:gap-8 lg:px-6 xl:grid-cols-[220px_minmax(0,620px)_280px] xl:gap-10">
        {/* Desktop navigation rail */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 flex flex-col gap-5">
            <div className="surface-panel p-3">
              <p className="px-3 pb-2 pt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Your space
              </p>
              <nav className="flex flex-col gap-1" aria-label="Feed navigation">
                <FeedNavLink to="/feed" active>
                  <NavIcon>⌂</NavIcon> Home
                </FeedNavLink>
                <FeedNavLink to="/explore">
                  <NavIcon>⌕</NavIcon> Explore people
                </FeedNavLink>
                <FeedNavLink to="/reels">
                  <NavIcon>▷</NavIcon> Reels
                </FeedNavLink>
                <FeedNavLink to="/messages">
                  <NavIcon>▤</NavIcon> Messages
                </FeedNavLink>
                <FeedNavLink to="/notifications">
                  <NavIcon>♧</NavIcon> Notifications
                </FeedNavLink>
                {isAuthenticated && wallet && (
                  <FeedNavLink to={`/profile/${wallet}`}>
                    <NavIcon>◉</NavIcon> My profile
                  </FeedNavLink>
                )}
              </nav>
            </div>

            <div className="rounded-2xl border border-primary/15 bg-primary/[0.06] p-4">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-lg text-primary">
                ✦
              </div>
              <h2 className="font-display text-base font-semibold">A world of your own</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Share a moment, discover a new voice, and stay close to your community.
              </p>
              <Link
                to="/create"
                className="mt-3 inline-flex text-xs font-bold text-primary hover:underline"
              >
                Create a post →
              </Link>
            </div>
          </div>
        </aside>

        {/* Main social feed */}
        <section className="min-w-0">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-primary">
                Your community
              </p>
              <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                Your world
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Moments, people, and things worth sharing.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchFeed}
              disabled={isLoading}
              aria-label="Refresh feed"
              title="Refresh feed"
              className="interactive-surface flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground disabled:opacity-60"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={isLoading ? "animate-spin" : ""}
                aria-hidden="true"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          </div>

          <div className="mb-5 overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
            <div className="flex items-center gap-3">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-brand text-sm font-bold text-white">
                  {(user?.username || "Y").charAt(0).toUpperCase()}
                </div>
              )}
              <button
                type="button"
                onClick={() => (isAuthenticated ? (window.location.href = "/create") : openAuthModal("signin"))}
                className="interactive-surface min-w-0 flex-1 rounded-full border border-border bg-secondary/60 px-4 py-3 text-left text-sm text-muted-foreground hover:text-foreground"
              >
                What's happening in your world?
              </button>
              <Link
                to="/create"
                aria-label="Create a post"
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xl font-medium text-primary-foreground transition hover:brightness-95"
              >
                +
              </Link>
            </div>
          </div>

          <div className="mb-5">
            <StatusTray />
          </div>

          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold">Posts from your world</h2>
            <div className="flex rounded-full border border-border bg-secondary/60 p-1" role="group" aria-label="Feed sorting">
              <button
                type="button"
                onClick={() => setSort("for-you")}
                aria-pressed={sort === "for-you"}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition sm:px-4 sm:text-sm ${sort === "for-you" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                For You
              </button>
              <button
                type="button"
                onClick={() => setSort("latest")}
                aria-pressed={sort === "latest"}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition sm:px-4 sm:text-sm ${sort === "latest" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Latest
              </button>
            </div>
          </div>

          {isLoading && posts.length === 0 ? (
            <div className="flex flex-col gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="surface-panel h-64 animate-pulse p-5">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-secondary" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-1/3 rounded bg-secondary" />
                      <div className="h-2 w-1/4 rounded bg-secondary" />
                    </div>
                  </div>
                  <div className="h-28 rounded-xl bg-secondary/70" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="surface-panel flex flex-col items-center gap-4 p-8 text-center sm:p-10">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-2xl text-destructive">!</div>
              <div>
                <h3 className="mb-2 text-lg font-bold">We couldn't load your feed</h3>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
              <button
                type="button"
                onClick={fetchFeed}
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-95"
              >
                Try again
              </button>
            </div>
          ) : posts.length === 0 ? (
            <div className="surface-panel flex flex-col items-center gap-4 p-8 text-center sm:p-12">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-3xl text-primary">✦</div>
              <div>
                <h3 className="font-display text-2xl font-bold">Your world is just getting started</h3>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  There aren't any posts to show yet. Share something with the community or explore people to find new voices.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                <Link to="/create" className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition hover:brightness-95">Share a moment</Link>
                <Link to="/explore" className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold transition hover:bg-secondary">Explore people</Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:gap-5">
              {posts.map((post, i) => (
                <div key={post.id} style={{ animationDelay: `${i * 70}ms` }}>
                  <PostCard
                    post={post}
                    onLikeUpdate={handleLikeUpdate}
                    onPostDelete={handlePostDelete}
                  />
                </div>
              ))}
              {hasMore && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="w-full rounded-full border border-border bg-card px-5 py-3 text-sm font-semibold transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoadingMore ? "Loading more posts…" : "Show more posts"}
                </button>
              )}
            </div>
          )}
        </section>

        {/* Discovery rail appears on wide screens only */}
        <aside className="hidden xl:block">
          <div className="sticky top-24 flex flex-col gap-5">
            <div className="surface-panel p-4">
              <h2 className="font-display text-lg font-semibold">Find your people</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Discover creators, meet new people, and see what the community is sharing.
              </p>
              <Link
                to="/explore"
                className="mt-4 flex w-full items-center justify-center rounded-xl border border-border px-3 py-2.5 text-sm font-semibold transition hover:bg-secondary"
              >
                Explore myWorld
              </Link>
            </div>
            <div className="rounded-2xl border border-border bg-card/70 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">A little reminder</p>
              <p className="mt-2 text-sm leading-relaxed text-foreground">
                Your next favorite conversation could start with a simple post.
              </p>
            </div>
            <p className="px-2 text-[11px] leading-relaxed text-muted-foreground">
              myWorld · A place to share your world.
            </p>
          </div>
        </aside>
      </div>
    </Layout>
  );
}
