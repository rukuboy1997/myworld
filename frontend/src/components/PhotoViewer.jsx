import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function PhotoViewer({ src, alt = "Photo", caption, onClose }) {
  const closeButtonRef = useRef(null);
  const closedRef = useRef(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    // A real history entry makes Android/WebView Back close the viewer first,
    // instead of navigating away from the feed underneath it.
    window.history.pushState({ myWorldPhotoViewer: true }, "");
    const closeFromHistory = () => {
      closedRef.current = true;
      onClose();
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        window.history.back();
      }
    };

    window.addEventListener("popstate", closeFromHistory);
    window.addEventListener("keydown", handleKeyDown);
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("popstate", closeFromHistory);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.style.touchAction = previousTouchAction;
      // If the viewer was dismissed by some other unmount, remove its history
      // entry so the next Back press does not land on a stale overlay state.
      if (!closedRef.current && window.history.state?.myWorldPhotoViewer) {
        window.history.back();
      }
    };
  }, [onClose]);

  const closeViewer = () => {
    if (window.history.state?.myWorldPhotoViewer) {
      window.history.back();
    } else {
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label={caption ? `Photo viewer: ${caption}` : "Photo viewer"}
    >
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-4 bg-gradient-to-b from-black/75 to-transparent px-4 pb-8 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-white/65">Photo</p>
          {caption && <p className="mt-1 truncate text-sm font-semibold sm:text-base">{caption}</p>}
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={closeViewer}
          aria-label="Close photo viewer"
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-md transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m18 6-12 12M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto px-2 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6">
        <img
          src={src}
          alt={alt}
          draggable="false"
          className="max-h-full max-w-full select-none object-contain"
          style={{ maxHeight: "calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 6rem)" }}
        />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/35 to-transparent" />
    </div>,
    document.body,
  );
}
