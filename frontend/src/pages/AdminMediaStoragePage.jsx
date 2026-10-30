import React, { useCallback, useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import { getAdminMediaStorageAudit } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

const PAGE_SIZE = 50;

const formatBytes = (value) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = bytes / 1024;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(amount >= 10 ? 1 : 2)} ${units[unit]}`;
};

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};

const STATUS_META = {
  healthy: { label: "Healthy", tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" },
  missing_in_r2: { label: "Missing in R2", tone: "border-red-500/30 bg-red-500/10 text-red-600" },
  size_mismatch: { label: "Size mismatch", tone: "border-amber-500/30 bg-amber-500/10 text-amber-600" },
  unreferenced_usage: { label: "No live reference", tone: "border-orange-500/30 bg-orange-500/10 text-orange-600" },
  untracked_reference: { label: "Legacy · no usage record", tone: "border-violet-500/30 bg-violet-500/10 text-violet-600" },
  check_failed: { label: "Check failed", tone: "border-slate-500/30 bg-slate-500/10 text-muted-foreground" },
};

function SummaryCard({ label, value, detail, tone = "border-border" }) {
  return (
    <div className={`rounded-2xl border ${tone} bg-card p-4`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value ?? "—"}</p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

export default function AdminMediaStoragePage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [audit, setAudit] = useState(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (nextOffset = offset) => {
    setLoading(true);
    setError("");
    try {
      const result = await getAdminMediaStorageAudit({ limit: PAGE_SIZE, offset: nextOffset });
      setAudit(result);
      setOffset(nextOffset);
    } catch (err) {
      setError(err.message || "Could not run the media storage audit.");
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) void refresh(0);
    else if (!authLoading) setLoading(false);
  }, [authLoading, isAuthenticated, refresh]);

  const summary = audit?.summary || {};
  const pagination = audit?.pagination || {};
  const results = Array.isArray(audit?.results) ? audit.results : [];

  return (
    <Layout>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <header className="mb-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">Admin tools · Storage</p>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight">Media storage integrity</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Compare the usage ledger with live database media references, including older uploads that predate usage tracking.</p>
            </div>
            <button type="button" onClick={() => void refresh(offset)} disabled={loading || !isAuthenticated} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-50">
              {loading ? "Checking…" : "Run audit"}
            </button>
          </div>
        </header>

        <div className="mb-5 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm">
          <p className="font-semibold">Read-only inspection</p>
          <p className="mt-1 text-muted-foreground">This audit does not delete R2 objects or modify usage records. Review flagged records before taking any repair action.</p>
        </div>

        {!authLoading && !isAuthenticated && <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">Sign in with an administrator account to inspect storage health.</p>}
        {error && <div role="alert" className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm">{error}</div>}
        {loading && <p className="py-10 text-center text-sm text-muted-foreground">Checking media records against R2…</p>}

        {!loading && audit && (
          <>
            <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SummaryCard label="Checked" value={summary.checked} detail={`of ${pagination.total ?? 0} active records`} />
              <SummaryCard label="Healthy" value={summary.healthy} tone="border-emerald-500/30" />
              <SummaryCard label="Missing in R2" value={summary.missingInR2} tone="border-red-500/30" />
              <SummaryCard label="Size mismatches" value={summary.sizeMismatches} tone="border-amber-500/30" />
              <SummaryCard label="No live reference" value={summary.unreferencedUsage} tone="border-orange-500/30" />
              <SummaryCard label="Legacy / untracked" value={summary.untrackedReferences} tone="border-violet-500/30" />
              <SummaryCard label="Check failures" value={summary.checkFailures} />
              <SummaryCard label="Pending deletions" value={summary.pendingDeletionJobs} />
              <SummaryCard label="Expired uploads" value={summary.expiredPendingUploads} />
            </section>

            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Audit generated {formatDate(audit.generatedAt)}</span>
              <span>Showing {results.length ? offset + 1 : 0}–{offset + results.length} of {pagination.total ?? 0}</span>
            </div>

            {results.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center">
                <h2 className="font-semibold">No active media records on this page</h2>
                <p className="mt-2 text-sm text-muted-foreground">There are no records to inspect at this position.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((item) => {
                  const meta = STATUS_META[item.status] || STATUS_META.check_failed;
                  return (
                    <article key={item.objectKey} className="rounded-2xl border border-border bg-card p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${meta.tone}`}>{meta.label}</span>
                        <span className="rounded-lg bg-secondary px-2.5 py-1 text-xs capitalize">{item.category || "unknown"}</span>
                      </div>
                      <p className="mt-3 break-all font-mono text-xs">{item.objectKey}</p>
                      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                        <div><dt className="text-xs text-muted-foreground">Recorded size</dt><dd className="mt-1 font-semibold">{formatBytes(item.recordedSizeBytes)}</dd></div>
                        <div><dt className="text-xs text-muted-foreground">Actual R2 size</dt><dd className="mt-1 font-semibold">{formatBytes(item.actualSizeBytes)}</dd></div>
                        <div><dt className="text-xs text-muted-foreground">Live reference</dt><dd className="mt-1 font-semibold">{item.referenced ? "Yes" : "No"}</dd></div>
                        <div><dt className="text-xs text-muted-foreground">Content type</dt><dd className="mt-1 break-all text-xs">{item.contentType || "—"}</dd></div>
                      </dl>
                      {item.source && <p className="mt-3 text-xs text-muted-foreground">Database source: <span className="font-mono">{item.source}</span> · No active usage-ledger record was found.</p>}
                      {item.error && <p className="mt-3 break-words rounded-lg bg-secondary/60 p-3 text-xs text-muted-foreground">{item.error}</p>}
                    </article>
                  );
                })}
              </div>
            )}

            <footer className="mt-6 flex items-center justify-between gap-3">
              <button type="button" onClick={() => void refresh(Math.max(0, offset - PAGE_SIZE))} disabled={loading || offset === 0} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold disabled:opacity-40">Previous</button>
              <button type="button" onClick={() => void refresh(offset + PAGE_SIZE)} disabled={loading || !pagination.hasMore} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold disabled:opacity-40">Next</button>
            </footer>
          </>
        )}
      </main>
    </Layout>
  );
}
