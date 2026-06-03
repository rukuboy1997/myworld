import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  likePost,
  getComments,
  addComment,
  truncateAddress,
} from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import PostActionsMenu from "./PostActionsMenu.jsx";

const CONTENT_LIMIT = 200;
const APP_URL = window.location.origin;

function ShareMenu({ postId, postTitle, onClose }) {
  const menuRef = useRef(null);
  const url = `${APP_URL}/post/${postId}`;
  const text = postTitle
    ? `"${postTitle}" on myWorld`
    : "Check this out on myWorld";
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {}
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      onClose();
    }, 1500);
  };

  const shareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: text, url });
      } catch {}
      onClose();
    }
  };

  const options = [
    {
      label: copied ? "Copied!" : "Copy link",
      icon: copied ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
      ),
      action: copyLink,
      highlight: copied,
    },
    {
      label: "Share on X",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.258 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
      action: () => {
        window.open(
          `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
          "_blank",
        );
        onClose();
      },
    },
    {
      label: "Share on WhatsApp",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      ),
      action: () => {
        window.open(
          `https://wa.me/?text=${encodeURIComponent(text + " " + url)}`,
          "_blank",
        );
        onClose();
      },
    },
    ...(navigator.share
      ? [
          {
            label: "More options…",
            icon: (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" />
                <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
              </svg>
            ),
            action: shareNative,
          },
        ]
      : []),
  ];

  return (
    <div
      ref={menuRef}
      className="absolute bottom-8 right-0 z-50 bg-card border border-white/10 rounded-2xl shadow-2xl py-1.5 min-w-[180px] animate-fade-in"
      style={{ backdropFilter: "blur(12px)" }}
    >
      {options.map((o, i) => (
        <button
          key={i}
          onClick={o.action}
          className={`flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-left transition-colors hover:bg-white/5 ${o.highlight ? "text-green-400" : "text-foreground"}`}
        >
          <span
            className={o.highlight ? "text-green-400" : "text-muted-foreground"}
          >
            {o.icon}
          </span>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function PostCard({ post, onLikeUpdate }) {
  const { address: wallet, isAuthenticated, openAuthModal } = useAuth();
  const [isLiked, setIsLiked] = useState(!!post.userLiked);
  const [likesCount, setLikesCount] = useState(post.likes || 0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [showActions, setShowActions] = useState(false);

  // Sync liked state when the prop changes (e.g. feed re-fetches)
  useEffect(() => {
    setIsLiked(!!post.userLiked);
  }, [post.userLiked]);

  const requireAuth = async () => {
    if (isAuthenticated) return true;
    openAuthModal("signin");
    return false;
  };

  const handleLike = async () => {
    if (isLiking) return;
    if (!(await requireAuth())) return;
    const prevLiked = isLiked;
    const prevCount = likesCount;
    // Optimistic update
    setIsLiked(!prevLiked);
    setLikesCount((c) => (prevLiked ? c - 1 : c + 1));
    setIsLiking(true);
    try {
      const res = await likePost(post.id, wallet);
      // Sync with server truth
      setIsLiked(res.liked);
      setLikesCount(res.likes);
      if (onLikeUpdate) onLikeUpdate(post.id, res.likes);
    } catch {
      // Rollback on error
      setIsLiked(prevLiked);
      setLikesCount(prevCount);
    } finally {
      setIsLiking(false);
    }
  };

  const toggleComments = async () => {
    if (!showComments && comments.length === 0 && post.commentCount > 0) {
      setIsLoadingComments(true);
      try {
        const fetched = await getComments(post.id);
        setComments(fetched);
      } catch {
      } finally {
        setIsLoadingComments(false);
      }
    }
    setShowComments((s) => !s);
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    if (!(await requireAuth())) return;
    setIsSubmitting(true);
    try {
      const comment = await addComment(post.id, wallet, newComment.trim());
      setComments((prev) => [...prev, comment]);
      setNewComment("");
      if (onLikeUpdate) onLikeUpdate(post.id, undefined, post.commentCount + 1);
    } catch {
    } finally {
      setIsSubmitting(false);
    }
  };

  const timeAgo = post.createdAt
    ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })
    : "just now";
  const avatarUrl = post.profile?.avatarUrl;
  const initial = post.profile?.username
    ? post.profile.username.charAt(0).toUpperCase()
    : truncateAddress(post.owner).charAt(0);

  const content = post.content || "";
  const isTruncatable = content.length > CONTENT_LIMIT;
  const displayContent =
    isTruncatable && !expanded
      ? content.slice(0, CONTENT_LIMIT).trimEnd() + "…"
      : content;

  return (
    <div className="glass-panel rounded-3xl p-4 md:p-6 flex flex-col gap-3 md:gap-4 animate-slide-up overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <Link
          to={`/profile/${post.owner}`}
          className="flex items-center gap-3 group min-w-0"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={post.profile?.username || "avatar"}
              className="w-10 h-10 md:w-12 md:h-12 rounded-full object-cover shadow-lg flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-brand flex items-center justify-center text-white font-bold text-base md:text-lg shadow-lg flex-shrink-0">
              {initial}
            </div>
          )}
          <div className="min-w-0">
            <h3 className="font-bold text-sm md:text-base group-hover:text-primary transition-colors truncate">
              {post.profile?.username || truncateAddress(post.owner)}
            </h3>
            <p className="text-xs text-muted-foreground">{timeAgo}</p>
          </div>
        </Link>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="relative">
            <button
              onClick={() => setShowActions(!showActions)}
              title="Post actions"
              className="p-2 rounded-full hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>
            {showActions && (
              <PostActionsMenu
                post={post}
                onClose={() => setShowActions(false)}
                onPostDelete={() => {
                  // Handle post deletion (remove from feed)
                  onLikeUpdate?.(post.id, undefined, undefined, "delete");
                }}
                onPostEdit={(updatedPost) => {
                  // Handle post edit (update in feed)
                  onLikeUpdate?.(
                    post.id,
                    undefined,
                    undefined,
                    "edit",
                    updatedPost,
                  );
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-2 min-w-0">
        <h2 className="text-base md:text-xl font-bold text-foreground leading-tight break-words">
          {post.title}
        </h2>
        <p className="text-muted-foreground whitespace-pre-wrap text-sm md:text-base leading-relaxed break-words">
          {displayContent}
        </p>
        {isTruncatable && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-xs text-primary font-semibold hover:underline self-start"
          >
            {expanded ? "Show less" : "Read more"}
          </button>
        )}

        {post.mediaUrl && post.mediaType === "image" && (
          <a
            href={post.mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-2xl overflow-hidden border border-white/5 bg-black/20 mt-1"
          >
            <img
              src={post.mediaUrl}
              alt={post.title}
              className="w-full max-h-[400px] md:max-h-[600px] object-contain"
              loading="lazy"
            />
          </a>
        )}
        {post.mediaUrl && post.mediaType === "video" && (
          <video
            src={post.mediaUrl}
            controls
            className="w-full max-h-[400px] md:max-h-[600px] rounded-2xl border border-white/5 bg-black mt-1"
          />
        )}
      </div>

      {/* Actions */}
      <div className="pt-3 mt-1 border-t border-white/5 flex items-center gap-5">
        {/* Like */}
        <button
          onClick={handleLike}
          disabled={isLiking}
          className={`flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 disabled:opacity-70
            ${isLiked ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill={isLiked ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={
              isLiked ? "drop-shadow-[0_0_6px_rgba(0,194,255,0.6)]" : ""
            }
          >
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          </svg>
          <span
            className={`font-medium text-sm tabular-nums ${isLiked ? "text-primary" : ""}`}
          >
            {likesCount}
          </span>
        </button>

        {/* Comment */}
        <button
          onClick={toggleComments}
          className={`flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 ${showComments ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" />
          </svg>
          <span className="font-medium text-sm">{post.commentCount || 0}</span>
        </button>

        {/* Share */}
        <div className="relative ml-auto">
          <button
            onClick={() => setShowShare((s) => !s)}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-all hover:scale-105 active:scale-95"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="17"
              height="17"
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
            </svg>
            <span className="font-medium text-sm">Share</span>
          </button>
          {showShare && (
            <ShareMenu
              postId={post.id}
              postTitle={post.title}
              onClose={() => setShowShare(false)}
            />
          )}
        </div>
      </div>

      {/* Comments Section */}
      {showComments && (
        <div className="pt-3 border-t border-white/5 flex flex-col gap-3 animate-fade-in">
          {isLoadingComments ? (
            <div className="flex justify-center p-4">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {comments.length > 0 ? (
                comments.map((comment) => {
                  const cAvatar = comment.profile?.avatarUrl;
                  const cInitial = comment.profile?.username
                    ? comment.profile.username.charAt(0).toUpperCase()
                    : truncateAddress(comment.owner).charAt(0);
                  return (
                    <div
                      key={comment.id}
                      className="flex gap-3 bg-white/5 p-3 rounded-2xl"
                    >
                      {cAvatar ? (
                        <img
                          src={cAvatar}
                          alt=""
                          className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-secondary flex-shrink-0 flex items-center justify-center font-bold text-xs">
                          {cInitial}
                        </div>
                      )}
                      <div className="flex flex-col flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2 flex-wrap">
                          <Link
                            to={`/profile/${comment.owner}`}
                            className="font-bold text-xs hover:text-primary transition-colors truncate"
                          >
                            {comment.profile?.username ||
                              truncateAddress(comment.owner)}
                          </Link>
                          <span className="text-[10px] text-muted-foreground">
                            {comment.createdAt
                              ? formatDistanceToNow(
                                  new Date(comment.createdAt),
                                  { addSuffix: true },
                                )
                              : "just now"}
                          </span>
                        </div>
                        <p className="text-xs md:text-sm mt-0.5 break-words">
                          {comment.content}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No comments yet. Be the first!
                </p>
              )}
            </div>
          )}

          <form onSubmit={handleAddComment} className="flex gap-2 mt-1">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 min-w-0 bg-secondary/50 border border-white/10 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              disabled={isSubmitting}
            />
            <button
              type="submit"
              disabled={!newComment.trim() || isSubmitting}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-bold disabled:opacity-50 transition-colors flex-shrink-0"
            >
              Post
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
