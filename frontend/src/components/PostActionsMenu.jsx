import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { deletePost, reportPost } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

function ConfirmDialog({
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  isDangerous,
}) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="glass-panel rounded-2xl p-6 max-w-sm w-full border border-white/10 shadow-2xl">
        <h2 className="text-lg font-bold mb-2">{title}</h2>
        <p className="text-sm text-muted-foreground mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 transition-colors font-medium text-sm"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${isDangerous ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportDialog({ postId, onClose, onSuccess }) {
  const [reason, setReason] = useState("inappropriate");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason) return;

    setIsSubmitting(true);
    try {
      await reportPost(postId, reason, description);
      onSuccess?.();
      onClose();
    } catch (err) {
      alert("Failed to report post: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="glass-panel rounded-2xl p-6 max-w-sm w-full border border-white/10 shadow-2xl">
        <h2 className="text-lg font-bold mb-4">Report Post</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-secondary/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="inappropriate">Inappropriate content</option>
              <option value="spam">Spam</option>
              <option value="hate">Hate speech</option>
              <option value="violence">Violence</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell us more about why you're reporting this post..."
              maxLength={500}
              rows={4}
              className="w-full bg-secondary/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 transition-colors font-medium text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !reason}
              className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium text-sm disabled:opacity-50"
            >
              {isSubmitting ? "Reporting..." : "Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PostActionsMenu({
  post,
  onClose,
  onPostDelete,
  onPostEdit,
}) {
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const { address } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isOwner = post.owner === address;

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deletePost(post.id);
      onPostDelete?.(post.id);
      onClose();
    } catch (err) {
      alert("Failed to delete post: " + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEdit = () => {
    navigate(`/edit/${post.id}`);
    onClose();
  };

  return (
    <>
      <div
        ref={menuRef}
        className="absolute top-0 right-0 z-50 bg-card border border-white/10 rounded-2xl shadow-2xl py-1.5 min-w-[200px] animate-fade-in"
        style={{ backdropFilter: "blur(12px)" }}
      >
        {isOwner ? (
          <>
            <button
              onClick={handleEdit}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left transition-colors hover:bg-white/5 text-foreground"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
              </svg>
              Edit Post
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left transition-colors hover:bg-red-500/10 text-red-400 hover:text-red-300 disabled:opacity-50"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" x2="10" y1="11" y2="17" />
                <line x1="14" x2="14" y1="11" y2="17" />
              </svg>
              {isDeleting ? "Deleting..." : "Delete Post"}
            </button>
          </>
        ) : (
          <button
            onClick={() => setShowReportDialog(true)}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left transition-colors hover:bg-amber-500/10 text-amber-400 hover:text-amber-300"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
            Report Post
          </button>
        )}

        <div className="border-t border-white/5 my-1.5" />

        <button
          onClick={onClose}
          className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left transition-colors hover:bg-white/5 text-muted-foreground"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
          Close
        </button>
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Post"
          message="Are you sure you want to delete this post? This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          isDangerous={true}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {showReportDialog && (
        <ReportDialog
          postId={post.id}
          onClose={() => setShowReportDialog(false)}
          onSuccess={() => alert("Post reported successfully")}
        />
      )}
    </>
  );
}
