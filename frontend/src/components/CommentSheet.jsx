import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { addComment, getComments, truncateAddress } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

export default function CommentSheet({ post, isOpen, onClose, onCommentAdded }) {
  const { address, isAuthenticated, openAuthModal } = useAuth();
  const [comments, setComments] = useState([]);
  const [commentCount, setCommentCount] = useState(Number(post?.commentCount || 0));
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    setCommentCount(Number(post?.commentCount || 0));
  }, [post?.id, post?.commentCount]);

  useEffect(() => {
    if (!isOpen || !post?.id) return undefined;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setLoadError("");
      try {
        const result = await getComments(post.id);
        if (cancelled) return;
        const list = Array.isArray(result) ? result : [];
        setComments(list);
        setCommentCount(Math.max(Number(post.commentCount || 0), list.length));
      } catch (error) {
        if (!cancelled) setLoadError(error?.message || "Couldn't load comments. Please try again.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, post?.id, post?.commentCount]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !post) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isSubmitting) return;
    if (!isAuthenticated) {
      openAuthModal("signin");
      return;
    }

    setIsSubmitting(true);
    setLoadError("");
    try {
      const comment = await addComment(post.id, address, content);
      setComments((current) => [...current, comment]);
      setDraft("");
      if (inputRef.current) inputRef.current.style.height = "auto";
      const nextCount = commentCount + 1;
      setCommentCount(nextCount);
      onCommentAdded?.(comment, nextCount);
    } catch (error) {
      setLoadError(error?.message || "Couldn't post your comment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 backdrop-blur-[2px] sm:p-4" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="myworld-comments-title"
        className="animate-slide-up flex max-h-[min(86dvh,780px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-border bg-background shadow-2xl sm:rounded-3xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="shrink-0 border-b border-border px-4 pb-3 pt-3 sm:px-6">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/30 sm:hidden" />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 id="myworld-comments-title" className="text-base font-bold text-foreground sm:text-lg">Comments</h2>
              <p className="text-xs text-muted-foreground">{commentCount.toLocaleString()} {commentCount === 1 ? "comment" : "comments"}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close comments"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6" aria-live="polite">
          {isLoading ? (
            <div className="flex flex-col gap-4 py-2">
              {[0, 1, 2].map((item) => (
                <div key={item} className="flex animate-pulse gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-full bg-surface-soft" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-3 w-1/3 rounded bg-surface-soft" />
                    <div className="h-3 w-4/5 rounded bg-surface-soft" />
                    <div className="h-3 w-1/2 rounded bg-surface-soft" />
                  </div>
                </div>
              ))}
            </div>
          ) : loadError && comments.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">{loadError}</p>
              <button type="button" onClick={() => {
                setLoadError("");
                setIsLoading(true);
                getComments(post.id).then((result) => {
                  const list = Array.isArray(result) ? result : [];
                  setComments(list);
                  setCommentCount(Math.max(Number(post.commentCount || 0), list.length));
                }).catch((error) => setLoadError(error?.message || "Couldn't load comments. Please try again.")).finally(() => setIsLoading(false));
              }} className="rounded-full bg-surface-soft px-4 py-2 text-sm font-semibold text-foreground transition hover:opacity-80">
                Try again
              </button>
            </div>
          ) : comments.length ? (
            <div className="flex flex-col gap-5">
              {comments.map((comment) => {
                const avatar = comment.profile?.avatarUrl;
                const username = comment.profile?.username || truncateAddress(comment.owner);
                const initial = username?.charAt(0)?.toUpperCase() || "?";
                return (
                  <article key={comment.id} className="flex items-start gap-3">
                    <Link to={`/profile/${encodeURIComponent(comment.owner)}`} onClick={onClose} className="shrink-0">
                      {avatar ? (
                        <img src={avatar} alt="" className="h-10 w-10 rounded-full border border-border object-cover" />
                      ) : (
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-soft text-sm font-bold text-foreground">{initial}</span>
                      )}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <Link to={`/profile/${encodeURIComponent(comment.owner)}`} onClick={onClose} className="text-sm font-semibold text-foreground hover:text-primary">
                          {username}
                        </Link>
                        <time className="text-[11px] text-muted-foreground">
                          {comment.createdAt ? formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true }) : "just now"}
                        </time>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">{comment.content}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-44 flex-col items-center justify-center py-8 text-center">
              <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface-soft text-muted-foreground">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" /></svg>
              </span>
              <p className="font-semibold text-foreground">Start the conversation</p>
              <p className="mt-1 text-sm text-muted-foreground">Be the first to share your thoughts.</p>
            </div>
          )}
          {loadError && comments.length > 0 && <p className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{loadError}</p>}
        </div>

        <form onSubmit={handleSubmit} className="shrink-0 border-t border-border bg-background/95 px-3 pb-3 pt-3 backdrop-blur sm:px-5" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <label htmlFor="myworld-comment-input" className="sr-only">Write a comment</label>
              <textarea
                id="myworld-comment-input"
                ref={inputRef}
                rows={1}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  const element = event.target;
                  element.style.height = "auto";
                  element.style.height = Math.min(element.scrollHeight, 120) + "px";
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={isAuthenticated ? "Write a comment…" : "Sign in to join the conversation…"}
                className="max-h-[120px] min-h-[44px] w-full resize-none rounded-2xl border border-border bg-surface-soft px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                disabled={isSubmitting}
              />
            </div>
            <button type="submit" disabled={!draft.trim() || isSubmitting} aria-label="Post comment" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
              {isSubmitting ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
              )}
            </button>
          </div>
          <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">Enter to post · Shift + Enter for a new line</p>
        </form>
      </section>
    </div>,
    document.body,
  );
}
