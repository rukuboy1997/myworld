import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { likePost, truncateAddress } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import PostActionsMenu from "./PostActionsMenu.jsx";
import PhotoViewer from "./PhotoViewer.jsx";
import CommentSheet from "./CommentSheet.jsx";
import {
  Check,
  Clock3,
  Copy,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Share2,
  ZoomIn,
} from "./icons.jsx";

const CONTENT_LIMIT = 240;
const APP_URL = window.location.origin;

function ShareMenu({ postId, postTitle, onClose }) {
  const menuRef = useRef(null);
  const url = `${APP_URL}/post/${postId}`;
  const text = postTitle
    ? `"${postTitle}" on myWorld`
    : "Check this out on myWorld";
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handler = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [onClose]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(onClose, 1200);
    } catch {
      // Keep the menu open so the user can still choose another share method.
    }
  };

  const shareNative = async () => {
    if (window.isNativeApp && window.ReactNativeWebView?.postMessage) {
      try {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: "native-share", payload: { title: text, text, url } }),
        );
      } catch {}
      onClose();
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({ title: text, text, url });
      } catch {}
      onClose();
    }
  };

  return (
    <div
      ref={menuRef}
      className="absolute bottom-12 right-0 z-50 min-w-[205px] overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-2xl animate-fade-in"
      role="menu"
      aria-label="Share post"
    >
      <button
        type="button"
        role="menuitem"
        onClick={copyLink}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-foreground transition hover:bg-secondary"
      >
        {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} className="text-muted-foreground" />}
        {copied ? "Link copied" : "Copy link"}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          window.open(
            `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
            "_blank",
            "noopener,noreferrer",
          );
          onClose();
        }}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-foreground transition hover:bg-secondary"
      >
        <Share2 size={16} className="text-muted-foreground" />
        Share on X
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          window.open(
            `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
            "_blank",
            "noopener,noreferrer",
          );
          onClose();
        }}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-foreground transition hover:bg-secondary"
      >
        <Share2 size={16} className="text-muted-foreground" />
        Share on WhatsApp
      </button>
      {(window.isNativeApp || navigator.share) && (
        <button
          type="button"
          role="menuitem"
          onClick={shareNative}
          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-foreground transition hover:bg-secondary"
        >
          <Share2 size={16} className="text-muted-foreground" />
          More options
        </button>
      )}
    </div>
  );
}

export default function PostCard({ post, onLikeUpdate, onPostDelete }) {
  const { address: wallet, isAuthenticated, openAuthModal } = useAuth();
  const [isLiked, setIsLiked] = useState(!!post.userLiked);
  const [likesCount, setLikesCount] = useState(post.likes || 0);
  const [showComments, setShowComments] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);

  useEffect(() => {
    setIsLiked(!!post.userLiked);
  }, [post.userLiked]);

  useEffect(() => {
    setLikesCount(post.likes || 0);
  }, [post.likes]);

  const requireAuth = async () => {
    if (isAuthenticated) return true;
    openAuthModal("signin");
    return false;
  };

  const handleLike = async () => {
    if (isLiking) return;
    if (!(await requireAuth())) return;

    const previousLiked = isLiked;
    const previousCount = likesCount;
    setIsLiked(!previousLiked);
    setLikesCount((count) => Math.max(0, previousLiked ? count - 1 : count + 1));
    setIsLiking(true);

    try {
      const result = await likePost(post.id, wallet);
      setIsLiked(result.liked);
      setLikesCount(result.likes);
      onLikeUpdate?.(post.id, result.likes);
    } catch {
      setIsLiked(previousLiked);
      setLikesCount(previousCount);
    } finally {
      setIsLiking(false);
    }
  };

  const timeAgo = post.createdAt
    ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })
    : "just now";
  const avatarUrl = post.profile?.avatarUrl;
  const username = post.profile?.username || truncateAddress(post.owner);
  const initial = username?.charAt(0)?.toUpperCase() || "M";
  const content = post.content || "";
  const isTruncatable = content.length > CONTENT_LIMIT;
  const displayContent =
    isTruncatable && !expanded
      ? `${content.slice(0, CONTENT_LIMIT).trimEnd()}…`
      : content;
  const hasText = Boolean(post.title || content);
  const isVideo = post.mediaType === "video";
  const isImage = post.mediaType === "image";

  return (
    <article className="group overflow-visible rounded-[1.6rem] border border-border bg-card shadow-sm transition duration-200 hover:border-border-strong hover:shadow-lg">
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
        <Link
          to={`/profile/${post.owner}`}
          className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`View ${username}'s profile`}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-11 w-11 shrink-0 rounded-full border border-border object-cover sm:h-12 sm:w-12"
            />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-base font-bold text-white shadow-sm sm:h-12 sm:w-12">
              {initial}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground transition group-hover:text-primary sm:text-[15px]">
              {username}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock3 size={12} aria-hidden="true" />
              <time dateTime={post.createdAt || undefined}>{timeAgo}</time>
            </p>
          </div>
        </Link>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setShowActions((current) => !current)}
            aria-label="Post options"
            aria-expanded={showActions}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <MoreHorizontal size={21} strokeWidth={2.2} />
          </button>
          {showActions && (
            <PostActionsMenu
              post={post}
              onClose={() => setShowActions(false)}
              onPostDelete={(deletedPostId) => onPostDelete?.(deletedPostId)}
              onPostEdit={(updatedPost) => {
                onLikeUpdate?.(post.id, undefined, undefined, "edit", updatedPost);
              }}
            />
          )}
        </div>
      </div>

      {hasText && (
        <div className="px-4 pb-4 sm:px-5">
          {post.title && (
            <h2 className="mb-1.5 break-words text-[17px] font-bold leading-snug tracking-tight text-foreground sm:text-lg">
              {post.title}
            </h2>
          )}
          {content && (
            <p className="whitespace-pre-wrap break-words text-sm leading-[1.75] text-foreground/85 sm:text-[15px]">
              {displayContent}
            </p>
          )}
          {isTruncatable && (
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              aria-expanded={expanded}
              className="mt-2 rounded-md text-sm font-semibold text-primary transition hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      )}

      {post.mediaUrl && isImage && (
        <>
          <button
            type="button"
            onClick={() => setIsPhotoViewerOpen(true)}
            aria-label={`Open photo: ${post.title || "Post image"}`}
            className="group/media relative block w-full overflow-hidden border-y border-border bg-black/[0.035] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          >
            <div className="relative flex max-h-[560px] min-h-36 items-center justify-center sm:max-h-[680px]">
              <img
                src={post.mediaUrl}
                alt={post.title || "Post image"}
                loading="lazy"
                decoding="async"
                className="block max-h-[560px] w-full object-contain sm:max-h-[680px]"
              />
            </div>
            <span className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/65 text-white opacity-0 shadow-lg backdrop-blur-sm transition group-hover/media:opacity-100 group-focus-visible/media:opacity-100">
              <ZoomIn size={18} aria-hidden="true" />
            </span>
          </button>
          {isPhotoViewerOpen && (
            <PhotoViewer
              src={post.mediaUrl}
              alt={post.title || "Post image"}
              caption={post.title}
              onClose={() => setIsPhotoViewerOpen(false)}
            />
          )}
        </>
      )}

      {post.mediaUrl && isVideo && (
        <div className="overflow-hidden border-y border-border bg-black">
          <video
            src={post.mediaUrl}
            controls
            playsInline
            preload="metadata"
            aria-label={post.title || "Post video"}
            className="mx-auto block max-h-[560px] w-full object-contain sm:max-h-[680px]"
          />
        </div>
      )}

      <div className="mx-4 flex items-center justify-between gap-3 border-t border-border/80 py-3 sm:mx-5 sm:py-3.5">
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={handleLike}
            disabled={isLiking}
            aria-pressed={isLiked}
            aria-label={isLiked ? `Unlike post, ${likesCount} likes` : `Like post, ${likesCount} likes`}
            className={`inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold transition active:scale-95 disabled:opacity-60 ${isLiked ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
          >
            <Heart size={18} strokeWidth={2} fill={isLiked ? "currentColor" : "none"} />
            <span className="tabular-nums">{likesCount}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowComments((current) => !current)}
            aria-expanded={showComments}
            className={`inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold transition active:scale-95 ${showComments ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
          >
            <MessageCircle size={18} strokeWidth={2} />
            <span className="tabular-nums">{post.commentCount || 0}</span>
            <span className="hidden sm:inline">Comment</span>
          </button>
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setShowShare((current) => !current)}
            aria-expanded={showShare}
            aria-label="Share post"
            className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground active:scale-95"
          >
            <Share2 size={18} strokeWidth={2} />
            <span>Share</span>
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

      <CommentSheet
        post={post}
        isOpen={showComments}
        onClose={() => setShowComments(false)}
        onCommentAdded={(_comment, nextCount) => {
          onLikeUpdate?.(post.id, undefined, nextCount);
        }}
      />
    </article>
  );
}
