import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { createStatus, getStatuses, getStatusViewers, recordStatusView } from "../lib/api.js";

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
    if (status && group.owner !== address) {
      try {
        await recordStatusView(status.id);
        setStatuses((current) => current.map((item) => item.id === status.id ? { ...item, viewedByMe: true, viewCount: (item.viewCount || 0) + 1 } : item));
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
        await recordStatusView(status.id);
        setStatuses((current) => current.map((item) => item.id === status.id ? { ...item, viewedByMe: true, viewCount: (item.viewCount || 0) + 1 } : item));
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
      setComposerOpen(false);
      await refresh();
    } catch (err) {
      setError(err.message || "Couldn't publish status");
    } finally {
      setSaving(false);
    }
  };

  const currentStatus = viewerGroup?.statuses?.[viewerIndex];

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
          <button type="button" onClick={() => isAuthenticated ? setComposerOpen(true) : openAuthModal("signin")} className="flex w-[76px] shrink-0 flex-col items-center gap-2 text-center">
            <span className="relative flex h-[66px] w-[66px] items-center justify-center rounded-full border-2 border-dashed border-white/30 bg-white/5 text-2xl">
              +
              {groups.some((group) => group.owner === address) && <span className="absolute -bottom-1 -right-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white">YOU</span>}
            </span>
            <span className="w-full truncate text-xs font-medium">Your status</span>
          </button>

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
          <form onSubmit={submit} className="w-full max-w-lg rounded-t-3xl border border-white/10 bg-slate-950 p-5 shadow-2xl sm:rounded-3xl">
            <div className="mb-4 flex items-center justify-between">
              <div><h3 className="text-xl font-bold">Create a status</h3><p className="mt-1 text-xs text-muted-foreground">It disappears after 24 hours.</p></div>
              <button type="button" onClick={() => setComposerOpen(false)} className="rounded-full px-3 py-2 hover:bg-white/10" aria-label="Close">✕</button>
            </div>
            <textarea value={content} onChange={(e) => setContent(e.target.value.slice(0, 700))} rows={4} placeholder="What's happening?" className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 p-4 outline-none focus:border-pink-400" />
            <div className="mt-2 flex justify-end text-xs text-muted-foreground">{content.length}/700</div>
            <label className="mt-3 block cursor-pointer rounded-2xl border border-dashed border-white/20 p-4 text-sm hover:bg-white/5">
              <span className="font-semibold">Add a photo or video</span>
              <span className="mt-1 block text-xs text-muted-foreground">{file ? file.name : "Images up to 10 MB · Videos up to 25 MB"}</span>
              <input type="file" accept="image/*,video/*" className="mt-3 block w-full text-xs" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
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
              {currentStatus.mediaType === "image" && currentStatus.mediaUrl ? <img src={currentStatus.mediaUrl} alt="Status" className="max-h-full max-w-full rounded-xl object-contain" /> :
               currentStatus.mediaType === "video" && currentStatus.mediaUrl ? <video src={currentStatus.mediaUrl} className="max-h-full max-w-full rounded-xl object-contain" controls autoPlay playsInline /> :
               <p className="whitespace-pre-wrap break-words text-2xl font-bold">{currentStatus.content}</p>}
            </div>
            {currentStatus.content && currentStatus.mediaUrl && <p className="absolute bottom-16 left-4 right-4 z-20 rounded-xl bg-black/45 px-3 py-2 text-center text-sm text-white">{currentStatus.content}</p>}
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
