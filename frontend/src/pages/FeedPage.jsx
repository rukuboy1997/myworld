import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import PostCard from "../components/PostCard.jsx";
import StatusTray from "../components/StatusTray.jsx";
import { getFeed } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { Plus, RefreshCw, Sparkles, Compass, Images } from "../components/icons.jsx";

export default function FeedPage() {
  const { address: wallet, isAuthenticated, openAuthModal } = useAuth();
  const navigate = useNavigate();
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

  const openPostComposer = () => {
    if (isAuthenticated) navigate("/create");
    else openAuthModal("signin");
  };

  return (
    <Layout>
      <main className="mx-auto w-full max-w-3xl px-3 pb-8 pt-3 sm:px-5 md:pt-6">
        {/* Status is intentionally the first content block on this page. */}
        <section aria-label="Status updates" className="mb-5">
          <StatusTray />
        </section>

        {/* Lightweight composer: the full create flow remains on its existing route. */}
        <button
          type="button"
          onClick={openPostComposer}
          aria-label="Create an update"
          className="surface-panel interactive-surface mb-7 flex w-full items-center gap-3 rounded-3xl border border-border/80 p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md sm:p-5"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Images size={23} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">Share something with your world</span>
            <span className="mt-1 block text-xs text-muted-foreground">A thought, photo, or moment…</span>
          </span>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Plus size={19} strokeWidth={2} aria-hidden="true" />
          </span>
        </button>

        {/* Updates feed */}
        <section aria-labelledby="updates-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="mb-1 flex items-center gap-2 text-primary">
                <Sparkles size={15} strokeWidth={1.9} aria-hidden="true" />
                <span className="text-[11px] font-bold uppercase tracking-[0.16em]">Your community</span>
              </div>
              <h1 id="updates-heading" className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                Updates
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                The latest moments from people in your world.
              </p>
            </div>
            <div className="flex items-center gap-2">
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
              <button
                type="button"
                onClick={fetchFeed}
                disabled={isLoading}
                aria-label="Refresh updates"
                title="Refresh updates"
                className="interactive-surface flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} aria-hidden="true" />
              </button>
            </div>
          </div>

          {isLoading && posts.length === 0 ? (
            <div className="flex flex-col gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="surface-panel h-64 animate-pulse rounded-3xl p-5">
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
            <div className="surface-panel flex flex-col items-center gap-4 rounded-3xl p-8 text-center sm:p-10">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <RefreshCw size={21} aria-hidden="true" />
              </div>
              <div>
                <h2 className="mb-2 text-lg font-bold">We couldn't load your updates</h2>
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
            <div className="surface-panel flex flex-col items-center gap-4 rounded-3xl p-8 text-center sm:p-12">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Compass size={29} strokeWidth={1.6} aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold">Your world is just getting started</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  There aren't any updates to show yet. Share a moment or explore people to find new voices in your community.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={openPostComposer}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition hover:brightness-95"
                >
                  Share a moment
                </button>
                <Link
                  to="/explore"
                  className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-semibold transition hover:bg-secondary"
                >
                  <Compass size={15} aria-hidden="true" />
                  Explore people
                </Link>
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
                  {isLoadingMore ? "Loading more updates…" : "Show more updates"}
                </button>
              )}
            </div>
          )}
        </section>
      </main>
    </Layout>
  );
}
