import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { createStatus, getStatuses, getStatusMedia, getStatusViewers, recordStatusView } from "../lib/api.js";

function initials(status) {
  const label = status?.profile?.displayName || status?.profile?.username || status?.owner || "?";
  return label.slice(0, 1).toUpperCase();
}

function timeLeft(expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return hours ? `${hours}h left` : `${Math.max(1, minutes)}m left`;
}

export default function StatusTray() {
  const { address, isAuthenticated, openAuthModal } = useAuth();
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [viewerGroup, setViewerGroup] = useState(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [content, setContent] = useState("");
  const [audience, setAudience] = useState("followers");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [viewers, setViewers] = useState(null);
  const [mediaSrc, setMediaSrc] = useState(null);
  const [filePreview, setFilePreview] = useState(null);

  useEffect(() => {
    const handleNativeMedia = (event) => {
      try {
        const { base64, mimeType, fileName } = event.detail || {};
        if (!base64 || !mimeType || !fileName) throw new Error("The selected media could not be read.");
        const binary = window.atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        const selected = new File([bytes], fileName, { type: mimeType });
        const isVideo = mimeType.startsWith("video/");
        const maxBytes = isVideo ? 25 * 1024 * 1024 : 10 * 1024 * 1024;
        if (selected.size > maxBytes) { setError(isVideo ? "Videos must be 25 MB or smaller." : "Images must be 10 MB or smaller."); return; }
        setError(""); setFile(selected);
      } catch (err) { setError(err.message || "Could not use the selected media."); }
    };
    const handleNativeMediaError = (event) => setError(event.detail || "Could not open the media picker.");
    window.addEventListener("myworld-native-media-data", handleNativeMedia);
    window.addEventListener("myworld-native-media-error", handleNativeMediaError);
    return () => { window.removeEventListener("myworld-native-media-data", handleNativeMedia); window.removeEventListener("myworld-native-media-error", handleNativeMediaError); };
  }, []);

  useEffect(() => {
    if (!file) {
      setFilePreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleFileChange = (event) => {
    const selected = event.target.files?.[0] || null;
    setError("");
    if (!selected) {
      setFile(null);
      return;
    }
    const isImage = selected.type.startsWith("image/") ||
      /\.(png|jpe?g|gif|webp|avif|heic|heif|bmp)$/i.test(selected.name);
    const isVideo = selected.type.startsWith("video/") ||
      /\.(mp4|m4v|mov|webm|3gp|mkv)$/i.test(selected.name);
    if (!isImage && !isVideo) {
      setError("Choose an image or a video (MP4/WebM recommended).");
      event.target.value = "";
      setFile(null);
      return;
    }
    const maxBytes = isVideo ? 25 * 1024 * 1024 : 10 * 1024 * 1024;
    if (selected.size > maxBytes) {
      setError(isVideo ? "Videos must be 25 MB or smaller." : "Images must be 10 MB or smaller.");
      event.target.value = "";
      setFile(null);
      return;
    }
    setFile(selected);
  };

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setStatuses([]);
      return;
    }
    setLoading(true);
    try {
      const data = await getStatuses();
      setStatuses(data.items || []);
    } catch (err) {
      setError(err.message || "Couldn't load statuses");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const status of statuses) {
      if (!map.has(status.owner)) {
        map.set(status.owner, {
          owner: status.owner,
          profile: status.profile,
          statuses: [],
          hasUnseen: false,
        });
      }
      const group = map.get(status.owner);
      group.statuses.push(status);
      if (!status.viewedByMe) group.hasUnseen = true;
    }
    return [...map.values()].sort((a, b) => {
      if (a.owner === address) return -1;
      if (b.owner === address) return 1;
      if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
      return new Date(b.statuses[b.statuses.length - 1].createdAt) - new Date(a.statuses[a.statuses.length - 1].createdAt);
    });
  }, [statuses, address]);

  const openGroup = async (group) => {
    const index = group.statuses.findIndex((item) => !item.viewedByMe);
    const start = index >= 0 ? index : 0;
    setViewerGroup(group);
    setViewerIndex(start);
    setViewers(null);
    const status = group.statuses[start];
    // Owners can open their own statuses, but never count themselves as viewers.
    if (status && group.owner !== address && !status.viewedByMe) {
      try {
        const result = await recordStatusView(status.id);
        setStatuses((current) => current.map((item) => item.id === status.id
          ? { ...item, viewedByMe: true, viewCount: (item.viewCount || 0) + (result.recorded ? 1 : 0) }
          : item));
      } catch {}
    }
  };

  const moveViewer = async (direction) => {
    if (!viewerGroup) return;
    const next = viewerIndex + direction;
    if (next < 0 || next >= viewerGroup.statuses.length) {
      setViewerGroup(null);
      return;
    }
    setViewerIndex(next);
    setViewers(null);
    const status = viewerGroup.statuses[next];
    if (status && viewerGroup.owner !== address && !status.viewedByMe) {
      try {
        const result = await recordStatusView(status.id);
        setStatuses((current) => current.map((item) => item.id === status.id
          ? { ...item, viewedByMe: true, viewCount: (item.viewCount || 0) + (result.recorded ? 1 : 0) }
          : item));
      } catch {}
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!content.trim() && !file) {
      setError("Write something or choose a photo/video.");
      return;
    }
    const form = new FormData();
    form.append("content", content.trim());
    form.append("audience", audience);
    if (file) form.append("media", file);
    setSaving(true);
    try {
      await createStatus(form);
      setContent("");
      setFile(null);
      setAudience("followers");
      setError("");
      setComposerOpen(false);
      await refresh();
    } catch (err) {
      setError(err.message || "Couldn't publish status");
    } finally {
      setSaving(false);
    }
  };

  const ownGroup = groups.find((group) => group.owner === address);
  const currentStatus = viewerGroup?.statuses?.[viewerIndex];

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    setMediaSrc(null);
    if (!currentStatus?.mediaType) return undefined;
    getStatusMedia(currentStatus.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setMediaSrc(objectUrl);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Couldn't load status media");
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [currentStatus?.id, currentStatus?.mediaType]);

  return (
    <>
      <section className="glass-panel rounded-3xl border border-white/10 p-4 md:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-base md:text-lg">Status</h2>
            <p className="text-xs text-muted-foreground">Little moments, gone in 24 hours.</p>
          </div>
          <button type="button" onClick={refresh} disabled={loading} className="rounded-full px-3 py-2 text-xs font-semibold hover:bg-white/10 disabled:opacity-50">
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => {
              if (!isAuthenticated) return openAuthModal("signin");
              if (ownGroup) return openGroup(ownGroup);
              setComposerOpen(true);
            }}
            className="flex w-[76px] shrink-0 flex-col items-center gap-2 text-center"
            aria-label={ownGroup ? "View your status and viewers" : "Create your first status"}
          >
            <span className={`relative flex h-[66px] w-[66px] items-center justify-center rounded-full p-[3px] ${ownGroup ? "bg-gradient-to-tr from-fuchsia-500 via-pink-500 to-amber-300" : "border-2 border-dashed border-white/30 bg-white/5"}`}>
              <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-background bg-secondary text-2xl font-bold">
                {ownGroup?.profile?.avatarUrl ? <img src={ownGroup.profile.avatarUrl} alt="" className="h-full w-full object-cover" /> : ownGroup ? initials(ownGroup.statuses[0]) : "+"}
              </span>
              {ownGroup && <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-emerald-500 text-sm font-bold text-white">+</span>}
            </span>
            <span className="w-full truncate text-xs font-medium">{ownGroup ? "Your status" : "Add status"}</span>
          </button>
          {ownGroup && (
            <button type="button" onClick={() => setComposerOpen(true)} className="flex w-[50px] shrink-0 flex-col items-center gap-2 pt-2 text-center" aria-label="Add another status">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-xl">+</span>
              <span className="w-full truncate text-[10px]">Add</span>
            </button>
          )}

          {groups.filter((group) => group.owner !== address).map((group) => (
            <button key={group.owner} type="button" onClick={() => openGroup(group)} className="flex w-[76px] shrink-0 flex-col items-center gap-2 text-center">
              <span className={`flex h-[66px] w-[66px] items-center justify-center rounded-full p-[3px] ${group.hasUnseen ? "bg-gradient-to-tr from-fuchsia-500 via-pink-500 to-amber-300" : "border-2 border-white/20"}`}>
                <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-background bg-secondary text-lg font-bold">
                  {group.profile?.avatarUrl ? <img src={group.profile.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(group.statuses[0])}
                </span>
              </span>
              <span className="w-full truncate text-xs">{group.profile?.displayName || group.profile?.username || "myWorld user"}</span>
            </button>
          ))}
          {!groups.length && !loading && <p className="self-center py-3 text-xs text-muted-foreground">No active statuses yet. Be the first to share a moment.</p>}
        </div>
      </section>

      {error && !composerOpen && <p role="alert" className="text-sm text-rose-300">{error}</p>}

      {composerOpen && (
        <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setComposerOpen(false); }}>
          <form onSubmit={submit} className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-slate-950 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500/20 to-pink-500/20 text-xl">◉</span><div><h3 className="text-xl font-bold tracking-tight">Create a status</h3><p className="mt-1 text-xs text-muted-foreground">Share a moment. It disappears in 24 hours.</p></div></div>
              <button type="button" onClick={() => setComposerOpen(false)} className="rounded-full px-3 py-2 hover:bg-white/10" aria-label="Close">✕</button>
            </div>
            <textarea value={content} onChange={(e) => setContent(e.target.value.slice(0, 700))} rows={4} placeholder="What's happening?" className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 p-4 outline-none focus:border-pink-400" />
            <div className="mt-2 flex justify-end text-xs text-muted-foreground">{content.length}/700</div>
            <div className="mt-3 rounded-2xl border border-dashed border-white/20 bg-white/[0.03] p-3 transition hover:border-pink-400/60">
              {typeof window !== "undefined" && window.isNativeApp && (
                <button type="button" onClick={() => window.ReactNativeWebView?.postMessage(JSON.stringify({ type: "pick-status-media" }))} className="mb-2 rounded-full bg-pink-500/15 px-3 py-2 text-xs font-semibold text-pink-200 hover:bg-pink-500/25">
                  Open phone gallery
                </button>
              )}
              <label className="flex cursor-pointer items-center gap-3 rounded-xl p-2 text-sm">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-pink-500/20 text-xl" aria-hidden="true">
                  {file?.type?.startsWith("video/") || (file && /\.(mp4|m4v|mov|webm|3gp|mkv)$/i.test(file.name)) ? "▶" : "▧"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{file ? "Media selected" : "Add a photo or video"}</span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">{file ? file.name : "Photos up to 10 MB · Videos up to 25 MB"}</span>
                </span>
                <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold">{file ? "Change" : "Browse"}</span>
                <input key={file?.name || "status-media-input"} type="file" accept="image/*,video/*,.png,.jpg,.jpeg,.gif,.webp,.avif,.heic,.heif,.bmp,.mp4,.m4v,.mov,.webm,.3gp,.mkv" className="sr-only" onChange={handleFileChange} />
              </label>
              {file && filePreview && (
                <div className="relative mt-2 overflow-hidden rounded-xl border border-white/10 bg-black">
                  {file.type.startsWith("video/") || /\.(mp4|m4v|mov|webm|3gp|mkv)$/i.test(file.name) ? (
                    <video src={filePreview} controls muted playsInline className="max-h-64 w-full object-contain" />
                  ) : (
                    <img src={filePreview} alt="Status preview" className="max-h-64 w-full object-contain" />
                  )}
                  <button type="button" onClick={() => setFile(null)} className="absolute right-2 top-2 rounded-full bg-black/75 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/20">Remove media</button>
                </div>
              )}
            </div>
            <label className="mt-4 block text-sm"><span className="mb-2 block font-semibold">Who can see this?</span>
              <select value={audience} onChange={(e) => setAudience(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 p-3">
                <option value="followers">People who follow me</option>
                <option value="everyone">Everyone on myWorld</option>
              </select>
            </label>
            {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
            <button disabled={saving} className="mt-5 w-full rounded-full bg-gradient-to-r from-fuchsia-600 to-pink-500 px-5 py-3 font-bold text-white disabled:opacity-60">{saving ? "Publishing…" : "Share status"}</button>
          </form>
        </div>
      )}

      {currentStatus && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black p-3 sm:p-6" onClick={() => setViewerGroup(null)}>
          <div className="relative flex h-[min(88dvh,760px)] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="absolute left-3 right-3 top-3 z-20 flex gap-1">
              {viewerGroup.statuses.map((item, index) => <span key={item.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30"><span className={`block h-full ${index <= viewerIndex ? "bg-white" : "bg-transparent"}`} /></span>)}
            </div>
            <div className="absolute left-4 right-4 top-7 z-20 flex items-center justify-between gap-2 text-white">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/15 font-bold">{currentStatus.profile?.avatarUrl ? <img src={currentStatus.profile.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(currentStatus)}</span>
                <div className="min-w-0"><p className="truncate text-sm font-bold">{currentStatus.profile?.displayName || currentStatus.profile?.username || "myWorld user"}</p><p className="text-[11px] text-white/70">{timeLeft(currentStatus.expiresAt)}</p></div>
              </div>
              <button type="button" onClick={() => setViewerGroup(null)} className="rounded-full bg-black/30 px-3 py-2" aria-label="Close status">✕</button>
            </div>
            <button type="button" onClick={() => moveViewer(-1)} className="absolute inset-y-20 left-0 z-10 w-1/4" aria-label="Previous status" />
            <button type="button" onClick={() => moveViewer(1)} className="absolute inset-y-20 right-0 z-10 w-1/4" aria-label="Next status" />
            <div className="flex min-h-0 flex-1 items-center justify-center bg-black px-5 pb-8 pt-20 text-center text-white">
              {currentStatus.mediaType === "image" && mediaSrc ? <img src={mediaSrc} alt="Status" className="max-h-full max-w-full rounded-xl object-contain" /> :
               currentStatus.mediaType === "video" && mediaSrc ? <video src={mediaSrc} className="max-h-full max-w-full rounded-xl object-contain" controls autoPlay playsInline /> :
               <p className="whitespace-pre-wrap break-words text-2xl font-bold">{currentStatus.content}</p>}
            </div>
            {currentStatus.content && currentStatus.mediaType && <p className="absolute bottom-16 left-4 right-4 z-20 rounded-xl bg-black/45 px-3 py-2 text-center text-sm text-white">{currentStatus.content}</p>}
            <div className="relative z-20 flex items-center justify-between gap-3 border-t border-white/10 bg-slate-950 px-4 py-3 text-xs text-white/70">
              <span>{currentStatus.viewCount || 0} views</span>
              {currentStatus.owner === address && <button type="button" className="font-semibold text-white hover:text-pink-300" onClick={async () => { try { const data = await getStatusViewers(currentStatus.id); setViewers(data.viewers || []); } catch (err) { setError(err.message); } }}>Viewers</button>}
              {viewers && currentStatus.owner === address && <div className="absolute bottom-full left-0 right-0 max-h-44 overflow-y-auto border-t border-white/10 bg-slate-950 p-3">{viewers.length ? viewers.map((person) => <div key={person.address} className="py-1">{person.displayName || person.username}</div>) : "No views yet"}</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
