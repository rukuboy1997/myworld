import React, { useCallback, useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import { getAdminMediaUploadDiagnostics } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
};

export default function AdminMediaDiagnosticsPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [diagnostics, setDiagnostics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getAdminMediaUploadDiagnostics(50);
      setDiagnostics(Array.isArray(result.diagnostics) ? result.diagnostics : []);
    } catch (err) {
      setDiagnostics([]);
      setError(err.message || "Could not load diagnostics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthenticated) void refresh();
    else if (!authLoading) setLoading(false);
  }, [authLoading, isAuthenticated, refresh]);

  return (
    <Layout>
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <header className="mb-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">Admin tools</p>
          <h1 className="font-display text-3xl font-bold tracking-tight">Media upload diagnostics</h1>
          <p className="mt-2 text-sm text-muted-foreground">Recent direct-R2 verification failures. Records are retained for up to seven days.</p>
        </header>

        <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-medium">Latest 50 records</p>
          <button type="button" onClick={() => void refresh()} disabled={loading || !isAuthenticated} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-50">
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {!authLoading && !isAuthenticated && <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">Sign in to myWorld to view administrator diagnostics.</p>}
        {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm">{error}</p>}
        {loading && <p className="py-8 text-center text-sm text-muted-foreground">Loading diagnostics…</p>}

        {!loading && !error && isAuthenticated && diagnostics.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <h2 className="font-semibold">No diagnostic records found</h2>
            <p className="mt-2 text-sm text-muted-foreground">No recorded failures were found in the last seven days.</p>
          </div>
        )}

        {!loading && !error && diagnostics.length > 0 && (
          <div className="space-y-4">
            {diagnostics.map((item) => (
              <article key={item.id} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold capitalize">{String(item.stage || "unknown").replaceAll("_", " ")}</span>
                    <p className="mt-2 text-xs text-muted-foreground">#{item.id} · {formatDate(item.created_at)}</p>
                  </div>
                  {item.http_status && <span className="rounded-lg bg-secondary px-3 py-1 text-xs font-bold">HTTP {item.http_status}</span>}
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-muted-foreground">Error</dt><dd className="mt-1 break-words">{item.error_name || "Unknown"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Error code</dt><dd className="mt-1 break-words font-mono text-xs">{item.error_code || "Not provided"}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Message</dt><dd className="mt-1 break-words rounded-xl bg-secondary/60 p-3">{item.error_message || "No message recorded"}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Upload intent</dt><dd className="mt-1 break-all font-mono text-xs">{item.intent_id}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </main>
    </Layout>
  );
}
