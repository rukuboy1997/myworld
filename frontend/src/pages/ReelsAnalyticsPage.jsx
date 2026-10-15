import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import { getReelAnalytics } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

function formatDuration(ms = 0) {
  const minutes = Math.floor(Number(ms || 0) / 60000);
  if (minutes < 60) return minutes + " min";
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? hours + "h " + remaining + "m" : hours + "h";
}

function formatPercent(value = 0) {
  return Math.round(Math.max(0, Math.min(1, Number(value || 0))) * 100) + "%";
}

function Metric({ label, value, note }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{value}</p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

export default function ReelsAnalyticsPage() {
  const { isAuthenticated, openAuthModal } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated) {
      setLoading(false);
      return () => { cancelled = true; };
    }
    setLoading(true);
    getReelAnalytics()
      .then((result) => { if (!cancelled) setData(result); })
      .catch((err) => { if (!cancelled) setError(err.message || "Couldn't load creator analytics."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const summary = data?.summary || {};

  return (
    <Layout>
      <main className="mx-auto w-full max-w-5xl px-3 pb-10 pt-5 sm:px-5">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Creator tools</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Reels analytics</h1>
            <p className="mt-2 text-sm text-muted-foreground">Understand your reach, watch time, and audience engagement.</p>
          </div>
          <Link to="/reels" className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold transition hover:bg-white/5">Back to Reels</Link>
        </div>

        {!isAuthenticated ? (
          <div className="rounded-3xl border border-white/10 p-8 text-center">
            <h2 className="text-lg font-bold">Sign in to view your analytics</h2>
            <p className="mt-2 text-sm text-muted-foreground">Your creator dashboard is private to your account.</p>
            <button onClick={openAuthModal} className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Sign in</button>
          </div>
        ) : loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading your Reel insights…</div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-400/20 p-6 text-center">
            <p className="text-sm text-rose-300">{error}</p>
            <button onClick={() => window.location.reload()} className="mt-4 rounded-full border border-white/10 px-4 py-2 text-sm font-semibold">Try again</button>
          </div>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric label="Reels published" value={summary.reelCount || 0} />
              <Metric label="Total views" value={Number(summary.views || 0).toLocaleString()} note="Unique viewers per Reel" />
              <Metric label="Watch time" value={formatDuration(summary.watchTimeMs)} note={formatDuration(summary.watchTime7dMs) + " in the last 7 days"} />
              <Metric label="Likes + comments" value={(Number(summary.likes || 0) + Number(summary.comments || 0)).toLocaleString()} note={Number(summary.likes || 0).toLocaleString() + " likes · " + Number(summary.comments || 0).toLocaleString() + " comments"} />
            </section>

            <section className="mt-8">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">Performance by Reel</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Views count distinct signed-in viewers. Watch time and completion come from recorded playback sessions.</p>
                </div>
              </div>
              {!data?.reels?.length ? (
                <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center">
                  <p className="font-semibold">No video Reels yet</p>
                  <p className="mt-2 text-sm text-muted-foreground">Publish a video post and your performance will appear here as people watch it.</p>
                  <Link to="/create" className="mt-4 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Create a video post</Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.reels.map((reel) => (
                    <article key={reel.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="line-clamp-2 font-semibold">{reel.title || reel.content || "Untitled Reel"}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">{reel.createdAt ? new Date(reel.createdAt).toLocaleDateString() : ""}</p>
                        </div>
                        <Link to={"/post/" + encodeURIComponent(reel.id)} className="shrink-0 text-sm font-semibold text-primary hover:underline">Open post</Link>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div><p className="text-xs text-muted-foreground">Views</p><p className="mt-1 text-lg font-bold">{Number(reel.views || 0).toLocaleString()}</p></div>
                        <div><p className="text-xs text-muted-foreground">Watch time</p><p className="mt-1 text-lg font-bold">{formatDuration(reel.watchTimeMs)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Completion rate</p><p className="mt-1 text-lg font-bold">{formatPercent(reel.completionRate)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Engagement</p><p className="mt-1 text-lg font-bold">{Number(reel.likes || 0) + Number(reel.comments || 0)}</p><p className="text-xs text-muted-foreground">{reel.likes || 0} likes · {reel.comments || 0} comments</p></div>
                      </div>
                      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10" aria-label={"Completion rate " + formatPercent(reel.completionRate)}>
                        <div className="h-full rounded-full bg-primary" style={{ width: formatPercent(reel.completionRate) }} />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </Layout>
  );
}
