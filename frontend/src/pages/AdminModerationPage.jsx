import React, { useCallback, useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import {
  getAdminReports,
  moderateReport,
  getAdminUsers,
  moderateAdminUser,
  getAdminAuditLog,
} from "../lib/api.js";

const REPORT_FILTERS = [
  { value: "pending", label: "Pending" },
  { value: "all", label: "All reports" },
  { value: "reviewed", label: "Reviewed" },
  { value: "dismissed", label: "Dismissed" },
  { value: "removed", label: "Removed" },
];

const ACCOUNT_FILTERS = [
  { value: "all", label: "All accounts" },
  { value: "active", label: "Active accounts" },
  { value: "suspended", label: "Suspended accounts" },
];

function displayDate(value) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
}

function shortAddress(value) {
  if (!value) return "Unknown account";
  return value.length > 20 ? value.slice(0, 8) + "…" + value.slice(-6) : value;
}

function statusLabel(value) {
  return String(value || "pending").replaceAll("_", " ");
}

export default function AdminModerationPage() {
  const [view, setView] = useState("reports");
  const [status, setStatus] = useState("pending");
  const [accountStatus, setAccountStatus] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [reports, setReports] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [auditItems, setAuditItems] = useState([]);
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

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getAdminUsers({ status: accountStatus, search: appliedSearch });
      setAccounts(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err.message || "Couldn't load accounts.");
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [accountStatus, appliedSearch]);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getAdminAuditLog(100);
      setAuditItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err.message || "Couldn't load the audit log.");
      setAuditItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "reports") loadReports();
    else if (view === "accounts") loadAccounts();
    else loadAudit();
  }, [view, loadReports, loadAccounts, loadAudit]);

  const refreshCurrentView = () => {
    setNotice("");
    if (view === "reports") void loadReports();
    else if (view === "accounts") void loadAccounts();
    else void loadAudit();
  };

  const actOnReport = async (report, action) => {
    const actionLabel = action === "removed" ? "remove the reported post" : action === "dismissed" ? "dismiss this report" : "mark this report as reviewed";
    if (!window.confirm("Are you sure you want to " + actionLabel + "?")) return;
    setBusyId(report.id);
    setError("");
    setNotice("");
    try {
      await moderateReport(report.id, action);
      setNotice(action === "removed" ? "Reported post removed and action recorded in the audit log." : action === "dismissed" ? "Report dismissed and action recorded." : "Report marked as reviewed and action recorded.");
      await loadReports();
    } catch (err) {
      setError(err.message || "Moderation action failed.");
    } finally {
      setBusyId("");
    }
  };

  const actOnAccount = async (account, action) => {
    const isSuspend = action === "suspend";
    const promptText = isSuspend
      ? "Enter the reason for suspending @" + account.username + ". This reason will be stored in the moderation audit log."
      : "Optional note for restoring @" + account.username + " (leave blank if not needed):";
    const entered = window.prompt(promptText, isSuspend ? "" : "");
    if (entered === null) return;
    const reason = entered.trim();
    if (isSuspend && reason.length < 3) {
      setError("Please enter a suspension reason of at least 3 characters.");
      return;
    }
    if (reason.length > 1000) {
      setError("The note must be 1000 characters or fewer.");
      return;
    }
    const actionLabel = isSuspend ? "suspend" : "restore";
    if (!window.confirm("Confirm you want to " + actionLabel + " @" + account.username + "?")) return;

    setBusyId(account.address);
    setError("");
    setNotice("");
    try {
      const result = await moderateAdminUser(account.address, action, reason);
      setNotice(result.unchanged
        ? "No change: this account was already " + (isSuspend ? "suspended." : "active.")
        : "Account " + (isSuspend ? "suspended." : "restored.") + " The action was written to the audit log.");
      await loadAccounts();
    } catch (err) {
      setError(err.message || "Account moderation failed.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <Layout>
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <header className="mb-7">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">Trust &amp; safety</p>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Moderation dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Review reports, manage account restrictions, and inspect a chronological audit trail. Every moderation endpoint is protected by the API administrator allowlist.
          </p>
        </header>

        <nav aria-label="Moderation sections" className="mb-5 flex flex-wrap gap-2">
          {[
            { value: "reports", label: "Reports" },
            { value: "accounts", label: "Accounts" },
            { value: "audit", label: "Audit log" },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => { setView(item.value); setNotice(""); setError(""); }}
              aria-pressed={view === item.value}
              className={"rounded-xl border px-4 py-2 text-sm font-semibold " + (view === item.value ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-secondary")}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <section className="mb-5 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
          {view === "reports" && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Report queue
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="min-w-48 rounded-xl border border-border bg-background px-3 py-2 text-sm">
                {REPORT_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          )}
          {view === "accounts" && (
            <form className="flex w-full flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); setAppliedSearch(searchInput.trim()); }}>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Account status
                <select value={accountStatus} onChange={(event) => setAccountStatus(event.target.value)} className="min-w-44 rounded-xl border border-border bg-background px-3 py-2 text-sm">
                  {ACCOUNT_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium">
                Search username, email, or address
                <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} maxLength={100} placeholder="Search accounts…" className="min-w-0 rounded-xl border border-border bg-background px-3 py-2 text-sm" />
              </label>
              <button type="submit" className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary">Search</button>
            </form>
          )}
          {view === "audit" && (
            <div>
              <h2 className="font-semibold">Recent moderation actions</h2>
              <p className="mt-1 text-sm text-muted-foreground">Showing the latest 100 actions.</p>
            </div>
          )}
          <button type="button" onClick={refreshCurrentView} disabled={loading} className="shrink-0 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-50">
            {loading ? "Loading…" : "Refresh"}
          </button>
        </section>

        {error && (
          <div role="alert" className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
            <p className="font-semibold">{error}</p>
            {error.toLowerCase().includes("admin") && (
              <p className="mt-2 text-muted-foreground">Check the Vercel API environment variable ADMIN_USER_ADDRESSES and redeploy the API if you have just changed it.</p>
            )}
          </div>
        )}
        {notice && <p role="status" className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">{notice}</p>}

        {loading && <p className="py-8 text-center text-sm text-muted-foreground">Loading moderation data…</p>}

        {!loading && !error && view === "reports" && reports.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <h2 className="font-display text-lg font-semibold">No reports in this queue</h2>
            <p className="mt-2 text-sm text-muted-foreground">New reports will appear here when users report accounts or posts.</p>
          </div>
        )}

        {!loading && view === "reports" && (
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
                    <span className="rounded-full border border-border px-3 py-1 text-xs capitalize">{statusLabel(report.moderation_status)}</span>
                  </div>
                  {report.description && <p className="mt-4 whitespace-pre-wrap rounded-xl bg-secondary/50 p-3 text-sm">{report.description}</p>}
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">Reported account</dt>
                      <dd className="mt-1 break-all font-medium">{report.target_username ? "@" + report.target_username : shortAddress(reportedAddress)}</dd>
                      {reportedAddress && <dd className="mt-1 break-all text-xs text-muted-foreground">{shortAddress(reportedAddress)}</dd>}
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Reporter</dt>
                      <dd className="mt-1 break-all font-medium">{report.reporter_username ? "@" + report.reporter_username : shortAddress(report.reporter)}</dd>
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
        )}

        {!loading && !error && view === "accounts" && accounts.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <h2 className="font-display text-lg font-semibold">No matching accounts</h2>
            <p className="mt-2 text-sm text-muted-foreground">Try another search or account status filter.</p>
          </div>
        )}

        {!loading && view === "accounts" && (
          <div className="space-y-3">
            {accounts.map((account) => {
              const suspended = account.account_status === "suspended";
              const isBusy = busyId === account.address;
              return (
                <article key={account.address} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="break-all text-lg font-semibold">{account.display_name || "@" + account.username}</h2>
                        <span className={"rounded-full border px-2.5 py-1 text-xs font-semibold capitalize " + (suspended ? "border-red-500/30 bg-red-500/10 text-red-600" : "border-border")}>{statusLabel(account.account_status)}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">@{account.username}</p>
                      {account.email && <p className="mt-2 break-all text-sm">{account.email}</p>}
                      <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{account.address}</p>
                      <p className="mt-2 text-xs text-muted-foreground">Joined {displayDate(account.created_at)}</p>
                      {suspended && (
                        <div className="mt-3 rounded-xl bg-secondary/60 p-3 text-sm">
                          <p><span className="font-semibold">Reason:</span> {account.suspension_reason || "No reason recorded"}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Suspended {displayDate(account.suspended_at)} by {shortAddress(account.suspended_by)}</p>
                        </div>
                      )}
                      {!suspended && account.restored_at && <p className="mt-2 text-xs text-muted-foreground">Last restored {displayDate(account.restored_at)} by {shortAddress(account.restored_by)}</p>}
                    </div>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => actOnAccount(account, suspended ? "restore" : "suspend")}
                      className={"shrink-0 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50 " + (suspended ? "border border-border hover:bg-secondary" : "bg-red-600 text-white hover:bg-red-700")}
                    >
                      {isBusy ? "Saving…" : suspended ? "Restore account" : "Suspend account"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {!loading && !error && view === "audit" && auditItems.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <h2 className="font-display text-lg font-semibold">No moderation actions recorded yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">Report decisions and account status changes will appear here.</p>
          </div>
        )}

        {!loading && view === "audit" && (
          <div className="space-y-3">
            {auditItems.map((item) => (
              <article key={item.id} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="font-semibold">{statusLabel(item.action)}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{displayDate(item.created_at)}</p>
                  </div>
                  <span className="rounded-full border border-border px-3 py-1 text-xs">{item.report_id ? "Report #" + shortAddress(item.report_id) : "Account action"}</span>
                </div>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Administrator</dt>
                    <dd className="mt-1 break-all">{item.actor_username ? "@" + item.actor_username : shortAddress(item.actor_address)}</dd>
                    <dd className="text-xs text-muted-foreground">{shortAddress(item.actor_address)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Target account</dt>
                    <dd className="mt-1 break-all">{item.target_username ? "@" + item.target_username : shortAddress(item.target_address)}</dd>
                    {item.target_address && <dd className="text-xs text-muted-foreground">{shortAddress(item.target_address)}</dd>}
                  </div>
                </dl>
                {item.details && (item.details.reason || item.details.postId) && (
                  <div className="mt-3 rounded-xl bg-secondary/50 p-3 text-sm">
                    {item.details.reason && <p><span className="font-semibold">Note / report reason:</span> {item.details.reason}</p>}
                    {item.details.postId && <p className="mt-1 break-all text-xs text-muted-foreground">Post ID: {item.details.postId}</p>}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </main>
    </Layout>
  );
}
