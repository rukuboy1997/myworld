import React, { useCallback, useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import { getAdminMediaStorageAudit, getAdminMediaStorageInventory, queueAdminMediaStorageCleanup } from "../lib/api.js";
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
  orphaned: { label: "Orphaned · no live reference", tone: "border-red-500/30 bg-red-500/10 text-red-600" },
  legacy_untracked: { label: "Legacy · untracked", tone: "border-violet-500/30 bg-violet-500/10 text-violet-600" },
  unsupported_namespace: { label: "Outside managed media folders", tone: "border-slate-500/30 bg-slate-500/10 text-muted-foreground" },
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
  const [inventory, setInventory] = useState(null);
  const [inventoryCursor, setInventoryCursor] = useState(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState("");
  const [selectedOrphans, setSelectedOrphans] = useState([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueMessage, setQueueMessage] = useState("");
  const [queueError, setQueueError] = useState("");

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


  const scanBucket = useCallback(async (cursor = null) => {
    setInventoryLoading(true);
    setInventoryError("");
    setQueueMessage("");
    setQueueError("");
    if (!cursor) setSelectedOrphans([]);
    try {
      const result = await getAdminMediaStorageInventory({ limit: 100, cursor });
      setInventory(result);
      setInventoryCursor(result.nextCursor || null);
    } catch (err) {
      setInventoryError(err.message || "Could not scan the R2 bucket.");
    } finally {
      setInventoryLoading(false);
    }
  }, []);

  const queueSelectedOrphans = useCallback(async () => {
    if (!selectedOrphans.length || queueLoading) return;
    const selectedItems = (inventory?.results || []).filter((item) => selectedOrphans.includes(item.objectKey));
    const totalBytes = selectedItems.reduce((sum, item) => sum + (Number(item.sizeBytes) || 0), 0);
    const confirmed = window.confirm(
      `Queue ${selectedOrphans.length} orphaned object(s) for deletion?\\n\\nCombined R2 size: ${formatBytes(totalBytes)}\\n\\nNothing is deleted now. The cleanup worker will recheck all live references before deleting each object.`
    );
    if (!confirmed) return;

    setQueueLoading(true);
    setQueueError("");
    setQueueMessage("");
    try {
      const result = await queueAdminMediaStorageCleanup(selectedOrphans);
      const queuedKeys = new Set((result.queued || []).map((item) => item.objectKey));
      setInventory((current) => current ? {
        ...current,
        results: (current.results || []).map((item) =>
          queuedKeys.has(item.objectKey) ? { ...item, queuedForDeletion: true } : item
        ),
      } : current);
      setSelectedOrphans((current) => current.filter((key) => !queuedKeys.has(key)));
      setQueueMessage(
        `Queued ${result.summary?.queued || 0} object(s) (${formatBytes(result.summary?.queuedSizeBytes || 0)}). ${result.summary?.skipped || 0} skipped after fresh safety checks.`
      );
    } catch (err) {
      setQueueError(err.message || "Could not queue selected media.");
    } finally {
      setQueueLoading(false);
    }
  }, [selectedOrphans, queueLoading, inventory]);

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


        <section className="mb-8 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Full R2 bucket inventory</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Lists actual objects directly from Cloudflare R2, then compares each key with live database references, deleted records, usage history, and the cleanup queue.</p>
            </div>
            <button type="button" onClick={() => void scanBucket(null)} disabled={inventoryLoading || !isAuthenticated} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-50">
              {inventoryLoading ? "Scanning…" : inventory ? "Restart bucket scan" : "Scan R2 bucket"}
            </button>
          </div>
          <p className="mt-3 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-muted-foreground">Scanning is read-only. You may explicitly queue selected orphaned objects for cleanup; queued objects are not deleted immediately. The scheduled cleanup worker performs another live-reference check immediately before deletion.</p>
          {selectedOrphans.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
              <p className="text-sm font-semibold">{selectedOrphans.length} orphaned object(s) selected</p>
              <button type="button" onClick={() => void queueSelectedOrphans()} disabled={queueLoading || inventoryLoading} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {queueLoading ? "Queueing…" : "Queue selected for deletion"}
              </button>
            </div>
          )}
          {queueMessage && <p role="status" className="mt-3 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700">{queueMessage}</p>}
          {queueError && <p role="alert" className="mt-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-600">{queueError}</p>}
          {inventoryError && <p role="alert" className="mt-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-600">{inventoryError}</p>}
          {inventory && (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryCard label="Objects scanned" value={inventory.summary?.scanned ?? 0} />
                <SummaryCard label="Orphaned" value={inventory.summary?.orphaned ?? 0} tone="border-red-500/30" />
                <SummaryCard label="Healthy" value={inventory.summary?.healthy ?? 0} tone="border-emerald-500/30" />
                <SummaryCard label="Legacy / untracked" value={inventory.summary?.legacy_untracked ?? 0} tone="border-violet-500/30" />
                <SummaryCard label="Page size" value={formatBytes(inventory.summary?.totalSizeBytes)} detail="Combined size of this page" />
                <SummaryCard label="Outside managed folders" value={inventory.summary?.unsupported_namespace ?? 0} />
              </div>
              <p className="mt-4 text-xs text-muted-foreground">Inventory page generated {formatDate(inventory.generatedAt)} · {inventory.hasMore ? "More objects are available." : "End of bucket reached."}</p>
              <div className="mt-3 space-y-3">
                {(inventory.results || []).map((item) => {
                  const meta = STATUS_META[item.status] || STATUS_META.check_failed;
                  return (
                    <article key={item.objectKey} className="rounded-xl border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {item.status === "orphaned" && !item.queuedForDeletion && (
                            <input
                              type="checkbox"
                              aria-label={`Select orphaned object ${item.objectKey}`}
                              checked={selectedOrphans.includes(item.objectKey)}
                              onChange={(event) => setSelectedOrphans((current) =>
                                event.target.checked
                                  ? [...current, item.objectKey]
                                  : current.filter((key) => key !== item.objectKey)
                              )}
                              className="h-4 w-4 accent-red-600"
                            />
                          )}
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${meta.tone}`}>{item.queuedForDeletion ? "Pending deletion" : meta.label}</span>
                        </div>
                        <span className="text-xs capitalize text-muted-foreground">{item.category || "unknown"}</span>
                      </div>
                      <p className="mt-2 break-all font-mono text-xs">{item.objectKey}</p>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                        <span>R2 size: {formatBytes(item.sizeBytes)}</span>
                        <span>Usage record: {item.hasUsageRecord ? "Yes" : "No"}</span>
                        <span>Live reference: {item.referenced ? "Yes" : "No"}</span>
                        <span>Cleanup queued: {item.queuedForDeletion ? "Yes" : "No"}</span>
                      </div>
                      {item.reasons?.length > 0 && <p className="mt-2 text-xs text-amber-600">Findings: {item.reasons.join(", ").replaceAll("_", " ")}</p>}
                      {item.lastModified && <p className="mt-1 text-xs text-muted-foreground">Last modified: {formatDate(item.lastModified)}</p>}
                    </article>
                  );
                })}
              </div>
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={() => void scanBucket(inventoryCursor)} disabled={inventoryLoading || !inventoryCursor} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold disabled:opacity-40">
                  {inventoryLoading ? "Scanning…" : "Scan next bucket page"}
                </button>
              </div>
            </>
          )}
        </section>

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
