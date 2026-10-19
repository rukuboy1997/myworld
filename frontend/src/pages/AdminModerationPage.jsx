import React, { useCallback, useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import { getAdminReports, moderateReport } from "../lib/api.js";

const FILTERS = [
  { value: "pending", label: "Pending" },
  { value: "all", label: "All reports" },
  { value: "reviewed", label: "Reviewed" },
  { value: "dismissed", label: "Dismissed" },
  { value: "removed", label: "Removed" },
];

function displayDate(value) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
}

function shortAddress(value) {
  if (!value) return "Unknown account";
  return value.length > 20 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

export default function AdminModerationPage() {
  const [status, setStatus] = useState("pending");
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getAdminReports(status);
      setReports(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err.message || "Couldn't load reports.");
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const actOnReport = async (report, action) => {
    const actionLabel = action === "removed" ? "remove the reported post" : action === "dismissed" ? "dismiss this report" : "mark this report as reviewed";
    if (!window.confirm(`Are you sure you want to ${actionLabel}?`)) return;
    setBusyId(report.id);
    setError("");
    setNotice("");
    try {
      await moderateReport(report.id, action);
      setNotice(action === "removed" ? "Reported post removed and report recorded." : action === "dismissed" ? "Report dismissed." : "Report marked as reviewed.");
      await loadReports();
    } catch (err) {
      setError(err.message || "Moderation action failed.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <Layout>
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <header className="mb-7">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">Trust & safety</p>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Moderation dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Review user-submitted reports. Access is restricted by the API to addresses configured as administrators.
          </p>
        </header>

        <section className="mb-5 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Report queue
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="min-w-48 rounded-xl border border-border bg-background px-3 py-2 text-sm">
              {FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <button type="button" onClick={loadReports} disabled={loading} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-50">
            {loading ? "Loading…" : "Refresh reports"}
          </button>
        </section>

        {error && (
          <div role="alert" className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
            <p className="font-semibold">{error}</p>
            {error.toLowerCase().includes("admin") && (
              <p className="mt-2 text-muted-foreground">Set the Vercel environment variable ADMIN_USER_ADDRESSES to the administrator account address(es), comma-separated, then redeploy the API.</p>
            )}
          </div>
        )}
        {notice && <p role="status" className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">{notice}</p>}

        {!loading && !error && reports.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <h2 className="font-display text-lg font-semibold">No reports in this queue</h2>
            <p className="mt-2 text-sm text-muted-foreground">New reports will appear here when users report accounts or posts.</p>
          </div>
        )}

        <div className="space-y-4">
          {reports.map((report) => {
            const accountReport = !report.post_id;
            const reportedAddress = report.target_address || report.post_owner;
            return (
              <article key={report.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-semibold">{accountReport ? "Account report" : "Post report"}</span>
                    <h2 className="mt-3 text-lg font-semibold">{report.reason || "Unspecified reason"}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Submitted {displayDate(report.created_at)}</p>
                  </div>
                  <span className="rounded-full border border-border px-3 py-1 text-xs capitalize">{(report.moderation_status || "pending").replace("_", " ")}</span>
                </div>

                {report.description && <p className="mt-4 whitespace-pre-wrap rounded-xl bg-secondary/50 p-3 text-sm">{report.description}</p>}

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Reported account</dt>
                    <dd className="mt-1 break-all font-medium">{report.target_username ? `@${report.target_username}` : shortAddress(reportedAddress)}</dd>
                    {reportedAddress && <dd className="mt-1 break-all text-xs text-muted-foreground">{shortAddress(reportedAddress)}</dd>}
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Reporter</dt>
                    <dd className="mt-1 break-all font-medium">{report.reporter_username ? `@${report.reporter_username}` : shortAddress(report.reporter)}</dd>
                    <dd className="mt-1 text-xs text-muted-foreground">{shortAddress(report.reporter)}</dd>
                  </div>
                </dl>

                {!accountReport && (
                  <div className="mt-4 rounded-xl border border-border p-3">
                    <p className="text-xs font-semibold text-muted-foreground">Reported post</p>
                    <p className="mt-1 font-semibold">{report.post_title || "Untitled post"}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{report.post_content || "No text content."}</p>
                    {report.post_is_deleted && <p className="mt-2 text-xs font-semibold text-amber-600">This post is already deleted.</p>}
                  </div>
                )}

                {report.reviewed_at && <p className="mt-3 text-xs text-muted-foreground">Reviewed {displayDate(report.reviewed_at)} by {shortAddress(report.reviewed_by)}</p>}

                {report.moderation_status === "pending" && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {!accountReport && !report.post_is_deleted && (
                      <button type="button" disabled={busyId === report.id} onClick={() => actOnReport(report, "removed")} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                        {busyId === report.id ? "Saving…" : "Remove post"}
                      </button>
                    )}
                    <button type="button" disabled={busyId === report.id} onClick={() => actOnReport(report, "dismissed")} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-50">Dismiss</button>
                    <button type="button" disabled={busyId === report.id} onClick={() => actOnReport(report, "reviewed")} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-50">Mark reviewed</button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </main>
    </Layout>
  );
}
