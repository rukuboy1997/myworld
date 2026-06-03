import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import { createPost } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_VIDEO_DURATION_S = 180; // 3 minutes

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function checkVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const url = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read video duration"));
    };
    video.src = url;
  });
}

export default function CreatePostPage() {
  const { address, isAuthenticated, openAuthModal } = useAuth();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [media, setMedia] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [mediaType, setMediaType] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [uploadPct, setUploadPct] = useState(null);
  const fileRef = useRef(null);
  const navigate = useNavigate();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImg = file.type.startsWith("image/");
    const isVid = file.type.startsWith("video/");

    if (!isImg && !isVid) {
      setError("Only images or videos are allowed.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(
        `File too large. Maximum size is 100 MB (your file is ${formatBytes(file.size)}).`,
      );
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    if (isVid) {
      try {
        const duration = await checkVideoDuration(file);
        if (duration > MAX_VIDEO_DURATION_S) {
          const mins = Math.floor(duration / 60);
          const secs = Math.floor(duration % 60);
          setError(
            `Video too long (${mins}m ${secs}s). Maximum video length is 3 minutes. Please trim your video and try again.`,
          );
          if (fileRef.current) fileRef.current.value = "";
          return;
        }
      } catch {
        setError(
          "Could not verify video duration. Please try a different file.",
        );
        if (fileRef.current) fileRef.current.value = "";
        return;
      }
    }

    setError(null);
    setMedia(file);
    setMediaType(isImg ? "image" : "video");
    setMediaPreview(URL.createObjectURL(file));
  };

  const clearMedia = () => {
    setMedia(null);
    setMediaPreview(null);
    setMediaType(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setIsSubmitting(true);
    setError(null);
    setUploadPct(media ? 0 : null);
    try {
      await createPost({
        title: title.trim(),
        content: content.trim(),
        owner: address,
        media,
        onUploadProgress: (frac) => setUploadPct(Math.round(frac * 100)),
      });
      navigate("/feed");
    } catch (err) {
      setError(err.message || "Failed to create post. Please try again.");
      setIsSubmitting(false);
      setUploadPct(null);
    }
  };

  const isUploading =
    isSubmitting && media && uploadPct !== null && uploadPct < 100;
  const isProcessing = isSubmitting && (!media || uploadPct === 100);

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="max-w-md mx-auto w-full px-4 py-20 text-center flex flex-col items-center gap-4">
          <h2 className="text-2xl font-bold">Sign in to post</h2>
          <p className="text-muted-foreground">
            Create a free account to start sharing your world.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => openAuthModal("signin")}
              className="bg-primary text-primary-foreground px-6 py-3 rounded-full font-bold hover:bg-primary/90"
            >
              Sign in
            </button>
            <button
              onClick={() => openAuthModal("signup")}
              className="bg-secondary border border-white/10 px-6 py-3 rounded-full font-bold hover:bg-secondary/80"
            >
              Sign up
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full px-4 py-10 animate-fade-in">
        <h1 className="text-4xl font-bold tracking-tight mb-8">
          Share your world
        </h1>

        <form
          onSubmit={handleSubmit}
          className="glass-panel p-6 md:p-8 rounded-3xl flex flex-col gap-6"
        >
          {error && (
            <div className="p-4 bg-destructive/20 border border-destructive/50 rounded-2xl text-destructive-foreground text-sm flex items-start gap-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 mt-0.5"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label
              htmlFor="title"
              className="text-sm font-bold text-muted-foreground uppercase tracking-wider pl-1"
            >
              Title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's happening?"
              className="w-full bg-secondary/30 border border-white/10 rounded-2xl px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-primary focus:bg-secondary/50 transition-all font-medium"
              disabled={isSubmitting}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="content"
              className="text-sm font-bold text-muted-foreground uppercase tracking-wider pl-1"
            >
              Content
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Tell your story..."
              rows={6}
              className="w-full bg-secondary/30 border border-white/10 rounded-2xl px-5 py-4 text-base focus:outline-none focus:ring-2 focus:ring-primary focus:bg-secondary/50 transition-all resize-none"
              disabled={isSubmitting}
              required
            />
          </div>

          {/* Media Upload */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider pl-1">
              Media{" "}
              <span className="text-xs normal-case font-normal opacity-70">
                (optional — image or video up to 100 MB · videos max 3 minutes)
              </span>
            </label>

            {!mediaPreview ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={isSubmitting}
                className="w-full border-2 border-dashed border-white/10 rounded-2xl py-10 flex flex-col items-center justify-center gap-3 hover:border-primary/50 hover:bg-primary/5 transition-all"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-muted-foreground"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground">
                    Click to upload an image or video
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Max 100 MB · Videos up to 3 minutes
                  </p>
                </div>
              </button>
            ) : (
              <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/20">
                {mediaType === "image" ? (
                  <img
                    src={mediaPreview}
                    alt="preview"
                    className="w-full max-h-96 object-contain"
                  />
                ) : (
                  <video
                    src={mediaPreview}
                    controls
                    className="w-full max-h-96"
                  />
                )}
                <button
                  type="button"
                  onClick={clearMedia}
                  disabled={isSubmitting}
                  className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center backdrop-blur"
                  title="Remove media"
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
                </button>
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Upload Progress Bar */}
          {isUploading && (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground font-medium">
                  Uploading {mediaType === "video" ? "video" : "image"}…
                </span>
                <span className="text-primary font-bold tabular-nums">
                  {uploadPct}%
                </span>
              </div>
              <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-200 ease-out"
                  style={{ width: `${uploadPct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground/60 text-center">
                Please keep this page open until the upload finishes
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-white/10 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting || !title.trim() || !content.trim()}
              className="bg-primary text-primary-foreground px-8 py-3 rounded-full font-bold text-lg disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center gap-2"
            >
              {isUploading ? (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="animate-spin"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Uploading… {uploadPct}%
                </>
              ) : isProcessing ? (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="animate-spin"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Publishing…
                </>
              ) : (
                "Post to myWorld"
              )}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
