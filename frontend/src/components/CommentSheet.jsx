import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  addComment,
  getComments,
  likeComment,
  truncateAddress,
} from "../lib/api.js";
import { uploadCommentMediaDirectly } from "../lib/mediaUpload.js";
import { useAuth } from "../lib/auth.jsx";
import {
  Heart,
  ImagePlus,
  LoaderCircle,
  MessageCircle,
  Mic,
  Music2,
  Paperclip,
  Send,
  Square,
  Video,
  X,
} from "./icons.jsx";

const MAX_COMMENT_LENGTH = 1000;
const MAX_VOICE_NOTE_SECONDS = 180;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 1) return "";
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function mediaLabel(type) {
  if (type === "image") return "Image";
  if (type === "video") return "Video";
  if (type === "audio") return "Audio";
  return "Attachment";
}

function MediaAttachment({ comment }) {
  if (!comment.mediaUrl) return null;

  if (comment.mediaType === "image") {
    return (
      <a
        href={comment.mediaUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 block max-w-[min(100%,360px)] overflow-hidden rounded-2xl border border-border bg-surface-soft"
        aria-label="Open comment image"
      >
        <img
          src={comment.mediaUrl}
          alt="Comment attachment"
          loading="lazy"
          decoding="async"
          className="max-h-72 w-full object-contain"
        />
      </a>
    );
  }

  if (comment.mediaType === "video") {
    return (
      <video
        src={comment.mediaUrl}
        controls
        playsInline
        preload="metadata"
        aria-label="Comment video"
        className="mt-2 block max-h-72 w-full max-w-[min(100%,380px)] rounded-2xl bg-black"
      />
    );
  }

  if (comment.mediaType === "audio") {
    return (
      <div className="mt-2 flex max-w-[min(100%,380px)] items-center gap-3 rounded-2xl border border-border bg-surface-soft p-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Music2 size={19} aria-hidden="true" />
        </span>
        <audio
          src={comment.mediaUrl}
          controls
          preload="metadata"
          aria-label="Comment audio"
          className="min-w-0 w-full"
        />
      </div>
    );
  }

  return null;
}

function CommentAvatar({ comment, username, onClick }) {
  const avatar = comment.profile?.avatarUrl;
  const initial = username?.charAt(0)?.toUpperCase() || "?";
  return (
    <Link
      to={`/profile/${encodeURIComponent(comment.owner)}`}
      onClick={onClick}
      aria-label={`View ${username}'s profile`}
      className="shrink-0"
    >
      {avatar ? (
        <img src={avatar} alt="" className="h-9 w-9 rounded-full border border-border object-cover sm:h-10 sm:w-10" />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-soft text-sm font-bold text-foreground sm:h-10 sm:w-10">
          {initial}
        </span>
      )}
    </Link>
  );
}

export default function CommentSheet({ post, isOpen, onClose, onCommentAdded }) {
  const { isAuthenticated, openAuthModal } = useAuth();
  const [comments, setComments] = useState([]);
  const [commentCount, setCommentCount] = useState(Number(post?.commentCount || 0));
  const [draft, setDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [expandedReplies, setExpandedReplies] = useState({});
  const [attachment, setAttachment] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loadError, setLoadError] = useState("");

  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const recorderChunksRef = useRef([]);
  const discardRecordingRef = useRef(false);
  const attachmentUrlRef = useRef(null);

  const roots = useMemo(
    () => comments.filter((comment) => !comment.parentCommentId),
    [comments],
  );
  const repliesByParent = useMemo(() => {
    const grouped = new Map();
    for (const comment of comments) {
      if (!comment.parentCommentId) continue;
      if (!grouped.has(comment.parentCommentId)) grouped.set(comment.parentCommentId, []);
      grouped.get(comment.parentCommentId).push(comment);
    }
    return grouped;
  }, [comments]);

  const cleanupRecordingStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const stopRecording = useCallback((discard = false) => {
    discardRecordingRef.current = discard;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      cleanupRecordingStream();
      setIsRecording(false);
    }
  }, [cleanupRecordingStream]);

  const handleClose = useCallback(() => {
    stopRecording(true);
    onClose?.();
  }, [stopRecording, onClose]);

  const clearAttachment = useCallback(() => {
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  useEffect(() => {
    if (attachment?.previewUrl && attachmentUrlRef.current !== attachment.previewUrl) {
      attachmentUrlRef.current = attachment.previewUrl;
    }
  }, [attachment]);

  useEffect(() => {
    return () => {
      if (attachmentUrlRef.current) URL.revokeObjectURL(attachmentUrlRef.current);
      cleanupRecordingStream();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try { recorder.stop(); } catch {}
      }
    };
  }, [cleanupRecordingStream]);

  useEffect(() => {
    if (!attachmentUrlRef.current) return;
    const currentUrl = attachmentUrlRef.current;
    return () => {
      URL.revokeObjectURL(currentUrl);
      if (attachmentUrlRef.current === currentUrl) attachmentUrlRef.current = null;
    };
  }, [attachment?.previewUrl]);

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
    return () => { cancelled = true; };
  }, [isOpen, post?.id, post?.commentCount]);

  useEffect(() => {
    if (!isOpen && isRecording) {
      stopRecording(true);
      setRecordingSeconds(0);
    }
  }, [isOpen, isRecording, stopRecording]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, handleClose]);

  useEffect(() => {
    if (!isRecording) return undefined;
    const interval = window.setInterval(() => {
      setRecordingSeconds((seconds) => {
        if (seconds + 1 >= MAX_VOICE_NOTE_SECONDS) {
          window.clearInterval(interval);
          window.setTimeout(() => stopRecording(false), 0);
          return MAX_VOICE_NOTE_SECONDS;
        }
        return seconds + 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isRecording, stopRecording]);

  const openSignIn = () => openAuthModal("signin");

  const handleLoadRetry = async () => {
    if (!post?.id) return;
    setIsLoading(true);
    setLoadError("");
    try {
      const result = await getComments(post.id);
      const list = Array.isArray(result) ? result : [];
      setComments(list);
      setCommentCount(Math.max(Number(post.commentCount || 0), list.length));
    } catch (error) {
      setLoadError(error?.message || "Couldn't load comments. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const selectAttachment = (file, fromRecorder = false) => {
    if (!file) return;
    if (isRecording && !fromRecorder) stopRecording(true);
    if (attachmentUrlRef.current) {
      URL.revokeObjectURL(attachmentUrlRef.current);
      attachmentUrlRef.current = null;
    }
    const contentType = (file.type || "").toLowerCase().split(";")[0].trim();
    const allowedTypes = {
      image: new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]),
      video: new Set(["video/mp4", "video/webm", "video/quicktime"]),
      audio: new Set(["audio/webm", "audio/ogg", "audio/mpeg", "audio/wav", "audio/mp4"]),
    };
    const type = Object.keys(allowedTypes).find((kind) => allowedTypes[kind].has(contentType)) || null;
    if (!type) {
      setLoadError("Choose a supported image, video, or audio file.");
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    attachmentUrlRef.current = previewUrl;
    setAttachment({ file, type, previewUrl, name: file.name || mediaLabel(type), isVoiceNote: false });
    setLoadError("");
  };

  const startRecording = async () => {
    if (!isAuthenticated) {
      openSignIn();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setLoadError("Voice recording is not supported by this browser. You can attach an audio file instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
      const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported?.(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorderChunksRef.current = [];
      discardRecordingRef.current = false;
      setRecordingSeconds(0);
      setLoadError("");

      recorder.ondataavailable = (event) => {
        if (event.data?.size) recorderChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        cleanupRecordingStream();
        setIsRecording(false);
        setLoadError("The voice note could not be recorded. Please try again.");
      };
      recorder.onstop = () => {
        cleanupRecordingStream();
        setIsRecording(false);
        const chunks = recorderChunksRef.current;
        recorderChunksRef.current = [];
        if (discardRecordingRef.current || !chunks.length) return;
        const actualType = recorder.mimeType || chunks[0]?.type || "audio/webm";
        const extension = actualType.includes("ogg") ? "ogg" : actualType.includes("mp4") ? "m4a" : "webm";
        const blob = new Blob(chunks, { type: actualType });
        if (!blob.size) return;
        const voiceFile = new File([blob], `voice-note.${extension}`, { type: actualType });
        selectAttachment(voiceFile, true);
        setAttachment((current) => current ? { ...current, isVoiceNote: true } : current);
      };
      recorder.start(250);
      setIsRecording(true);
    } catch (error) {
      cleanupRecordingStream();
      setIsRecording(false);
      setLoadError(error?.name === "NotAllowedError"
        ? "Microphone access was denied. Allow microphone access to record a voice note."
        : "Couldn't start voice recording. You can attach an audio file instead.");
    }
  };

  const handleLike = async (comment) => {
    if (!isAuthenticated) {
      openSignIn();
      return;
    }
    const previousLiked = Boolean(comment.userLiked);
    const previousCount = Number(comment.likeCount || 0);
    setComments((current) => current.map((item) => item.id === comment.id
      ? { ...item, userLiked: !previousLiked, likeCount: Math.max(0, previousCount + (previousLiked ? -1 : 1)) }
      : item));
    try {
      const result = await likeComment(comment.id);
      setComments((current) => current.map((item) => item.id === comment.id
        ? { ...item, userLiked: Boolean(result.liked), likeCount: Number(result.likeCount || 0) }
        : item));
    } catch (error) {
      setComments((current) => current.map((item) => item.id === comment.id
        ? { ...item, userLiked: previousLiked, likeCount: previousCount }
        : item));
      setLoadError(error?.message || "Couldn't update that like. Please try again.");
    }
  };

  const beginReply = (comment) => {
    if (!isAuthenticated) {
      openSignIn();
      return;
    }
    const root = comment.parentCommentId
      ? comments.find((item) => item.id === comment.parentCommentId)
      : comment;
    if (!root) return;
    setReplyingTo(root);
    setDraft("");
    clearAttachment();
    inputRef.current?.focus();
  };

  const cancelReply = () => {
    setReplyingTo(null);
    setDraft("");
    clearAttachment();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const content = draft.trim();
    if ((!content && !attachment) || isSubmitting || isRecording) return;
    if (!isAuthenticated) {
      openSignIn();
      return;
    }
    if (content.length > MAX_COMMENT_LENGTH) {
      setLoadError(`Comments must be ${MAX_COMMENT_LENGTH} characters or fewer.`);
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(0);
    setLoadError("");
    try {
      let mediaIntentId;
      if (attachment?.file) {
        const upload = await uploadCommentMediaDirectly(attachment.file, (progress) => {
          setUploadProgress(Math.round(progress * 100));
        });
        mediaIntentId = upload.intentId;
      }
      const comment = await addComment(post.id, content, {
        parentCommentId: replyingTo?.id,
        mediaIntentId,
      });
      setComments((current) => [...current, comment]);
      if (replyingTo) {
        setExpandedReplies((current) => ({ ...current, [replyingTo.id]: true }));
      }
      setDraft("");
      setReplyingTo(null);
      clearAttachment();
      if (inputRef.current) inputRef.current.style.height = "auto";
      const nextCount = commentCount + 1;
      setCommentCount(nextCount);
      onCommentAdded?.(comment, nextCount);
    } catch (error) {
      setLoadError(error?.message || "Couldn't post your comment. Please try again.");
    } finally {
      setIsSubmitting(false);
      setUploadProgress(0);
    }
  };

  const renderComment = (comment, isReply = false) => {
    const username = comment.profile?.username || truncateAddress(comment.owner);
    const replies = repliesByParent.get(comment.id) || [];
    const isExpanded = Boolean(expandedReplies[comment.id]);
    const isLiked = Boolean(comment.userLiked);
    return (
      <article key={comment.id} className={isReply ? "flex items-start gap-2.5" : "flex items-start gap-3"}>
        <CommentAvatar comment={comment} username={username} onClick={onClose} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <Link to={`/profile/${encodeURIComponent(comment.owner)}`} onClick={onClose} className="text-sm font-semibold text-foreground hover:text-primary">
              {username}
            </Link>
            <time className="text-[11px] text-muted-foreground">
              {comment.createdAt ? formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true }) : "just now"}
            </time>
          </div>
          {comment.content && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">{comment.content}</p>
          )}
          <MediaAttachment comment={comment} />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => handleLike(comment)}
              aria-pressed={isLiked}
              aria-label={isLiked ? "Unlike comment" : "Like comment"}
              className={"inline-flex items-center gap-1.5 text-xs font-semibold transition " + (isLiked ? "text-rose-500" : "text-muted-foreground hover:text-rose-500")}
            >
              <Heart size={15} fill={isLiked ? "currentColor" : "none"} aria-hidden="true" />
              <span>{Number(comment.likeCount || 0)}</span>
            </button>
            {!isReply && (
              <button type="button" onClick={() => beginReply(comment)} className="text-xs font-semibold text-muted-foreground transition hover:text-primary">
                Reply
              </button>
            )}
            {!isReply && replies.length > 0 && (
              <button
                type="button"
                onClick={() => setExpandedReplies((current) => ({ ...current, [comment.id]: !current[comment.id] }))}
                aria-expanded={isExpanded}
                className="text-xs font-semibold text-primary hover:text-primary/80"
              >
                {isExpanded ? "Hide replies" : `View ${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
              </button>
            )}
          </div>
          {!isReply && isExpanded && replies.length > 0 && (
            <div className="mt-4 flex flex-col gap-4 border-l-2 border-border pl-3 sm:pl-4">
              {replies.map((reply) => renderComment(reply, true))}
            </div>
          )}
        </div>
      </article>
    );
  };

  if (!isOpen || !post) return null;

  const previewType = attachment?.type;
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 backdrop-blur-[2px] sm:p-4" onMouseDown={(event) => {
      if (event.target === event.currentTarget) handleClose();
    }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="myworld-comments-title"
        className="animate-slide-up flex max-h-[min(90dvh,820px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-border bg-background shadow-2xl sm:rounded-3xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="shrink-0 border-b border-border px-4 pb-3 pt-3 sm:px-6">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/30 sm:hidden" />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 id="myworld-comments-title" className="text-base font-bold text-foreground sm:text-lg">Comments</h2>
              <p className="text-xs text-muted-foreground">{commentCount.toLocaleString()} {commentCount === 1 ? "comment" : "comments"}</p>
            </div>
            <button type="button" onClick={handleClose} aria-label="Close comments" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <X size={20} aria-hidden="true" />
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
              <button type="button" onClick={handleLoadRetry} className="rounded-full bg-surface-soft px-4 py-2 text-sm font-semibold text-foreground transition hover:opacity-80">
                Try again
              </button>
            </div>
          ) : roots.length ? (
            <div className="flex flex-col gap-5">
              {roots.map((comment) => renderComment(comment))}
            </div>
          ) : (
            <div className="flex min-h-44 flex-col items-center justify-center py-8 text-center">
              <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface-soft text-muted-foreground">
                <MessageCircle size={26} strokeWidth={1.7} aria-hidden="true" />
              </span>
              <p className="font-semibold text-foreground">Start the conversation</p>
              <p className="mt-1 text-sm text-muted-foreground">Be the first to share your thoughts.</p>
            </div>
          )}
          {loadError && comments.length > 0 && <p className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{loadError}</p>}
        </div>

        <form onSubmit={handleSubmit} className="shrink-0 border-t border-border bg-background/95 px-3 pb-3 pt-3 backdrop-blur sm:px-5" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}>
          {replyingTo && (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-xl bg-primary/5 px-3 py-2">
              <p className="min-w-0 truncate text-xs text-muted-foreground">
                Replying to <span className="font-semibold text-foreground">{replyingTo.profile?.username || truncateAddress(replyingTo.owner)}</span>
              </p>
              <button type="button" onClick={cancelReply} aria-label="Cancel reply" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-soft">
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          )}
          {attachment && (
            <div className="mb-2 flex items-center gap-3 rounded-xl border border-border bg-surface-soft p-2.5">
              {previewType === "image" ? (
                <img src={attachment.previewUrl} alt="Selected comment attachment" className="h-14 w-14 rounded-lg object-cover" />
              ) : previewType === "video" ? (
                <video src={attachment.previewUrl} muted className="h-14 w-14 rounded-lg bg-black object-cover" />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Music2 size={24} aria-hidden="true" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{attachment.isVoiceNote ? "Voice note" : attachment.name}</p>
                <p className="text-xs text-muted-foreground">{mediaLabel(attachment.type)} · {formatBytes(attachment.file.size)}</p>
              </div>
              <button type="button" onClick={clearAttachment} aria-label="Remove attachment" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background">
                <X size={17} aria-hidden="true" />
              </button>
            </div>
          )}
          {isRecording && (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-rose-500">
                <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
                Recording voice note
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">
                {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, "0")} / 3:00
              </span>
            </div>
          )}
          {isSubmitting && attachment && (
            <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-surface-soft" role="progressbar" aria-label="Uploading comment attachment" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress}>
              <div className="h-full bg-primary transition-[width]" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}
          <div className="flex items-end gap-2">
            <div className="flex shrink-0 items-center gap-1 pb-0.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,audio/webm,audio/ogg,audio/mpeg,audio/wav,audio/mp4"
                className="hidden"
                aria-label="Attach image, audio, or video"
                onChange={(event) => selectAttachment(event.target.files?.[0])}
                disabled={isSubmitting || isRecording}
              />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isSubmitting || isRecording} aria-label="Attach media" title="Attach image, audio or video" className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-soft hover:text-primary disabled:opacity-40">
                <Paperclip size={19} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={isRecording ? () => stopRecording(false) : startRecording}
                disabled={isSubmitting}
                aria-label={isRecording ? "Stop voice note recording" : "Record voice note"}
                title={isRecording ? "Stop recording" : "Record voice note"}
                className={"flex h-10 w-10 items-center justify-center rounded-full transition disabled:opacity-40 " + (isRecording ? "bg-rose-500/10 text-rose-500" : "text-muted-foreground hover:bg-surface-soft hover:text-primary")}
              >
                {isRecording ? <Square size={18} fill="currentColor" aria-hidden="true" /> : <Mic size={19} aria-hidden="true" />}
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <label htmlFor="myworld-comment-input" className="sr-only">Write a comment</label>
              <textarea
                id="myworld-comment-input"
                ref={inputRef}
                rows={1}
                maxLength={MAX_COMMENT_LENGTH}
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
                placeholder={replyingTo ? "Write a reply…" : isAuthenticated ? "Write a comment…" : "Sign in to join the conversation…"}
                className="max-h-[120px] min-h-[44px] w-full resize-none rounded-2xl border border-border bg-surface-soft px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                disabled={isSubmitting || isRecording}
              />
            </div>
            <button type="submit" disabled={(!draft.trim() && !attachment) || isSubmitting || isRecording} aria-label={replyingTo ? "Post reply" : "Post comment"} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
              {isSubmitting ? <LoaderCircle size={19} className="animate-spin" aria-hidden="true" /> : <Send size={19} aria-hidden="true" />}
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
            <p className="text-[10px] text-muted-foreground">
              {isRecording ? "Tap the stop button to finish your voice note." : "Enter to post · Shift + Enter for a new line"}
            </p>
            <span className="text-[10px] tabular-nums text-muted-foreground">{draft.length}/{MAX_COMMENT_LENGTH}</span>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
