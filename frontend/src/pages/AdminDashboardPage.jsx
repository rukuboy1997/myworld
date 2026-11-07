import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import { useAuth } from "../lib/auth.jsx";
import { getAdminAccess } from "../lib/api.js";
import { ArrowLeft, ChevronRight, ShieldCheck, Users, Image, HardDrive } from "../components/icons.jsx";

const ADMIN_TOOLS = [
  { to: "/admin/moderation", title: "Moderation", description: "Review reports, manage accounts, investigate incidents, and inspect moderation activity.", icon: Users },
  { to: "/admin/media-diagnostics", title: "Media diagnostics", description: "Investigate recent media upload verification failures.", icon: Image },
  { to: "/admin/media-storage", title: "Media storage", description: "Audit storage integrity, inspect inventory, and review safe cleanup candidates.", icon: HardDrive },
];

export default function AdminDashboardPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [access, setAccess] = useState("checking");

  useEffect(() => {
    let active = true;
    if (authLoading) return undefined;
    if (!isAuthenticated) {
      setAccess("denied");
      return undefined;
    }
    setAccess("checking");
    getAdminAccess()
      .then((result) => { if (active) setAccess(result?.isAdmin === true ? "allowed" : "denied"); })
      .catch(() => { if (active) setAccess("denied"); });
    return () => { active = false; };
  }, [authLoading, isAuthenticated]);

  return (
    <Layout>
      <main className="mx-auto w-full max-w-5xl px-4 pb-12 pt-5 sm:px-6 sm:pt-8">
        <Link to="/settings" className="mb-5 inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground">
          <ArrowLeft size={16} aria-hidden="true" /> Settings
        </Link>
        <header className="mb-7 rounded-3xl border border-border bg-card p-5 sm:p-7">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShieldCheck size={24} aria-hidden="true" />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Restricted area</p>
              <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">Admin Dashboard</h1>
              <p className="mt-2 text-sm text-muted-foreground">Manage myWorld operations and safety tools.</p>
            </div>
          </div>
        </header>

        {access === "checking" ? (
          <p role="status" className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">Verifying administrator access…</p>
        ) : access !== "allowed" ? (
          <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
            <h2 className="font-semibold">Administrator access required</h2>
            <p className="mt-1 text-sm text-muted-foreground">This area is available only to accounts configured as myWorld administrators.</p>
            <Link to="/settings" className="mt-4 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Back to Settings</Link>
          </section>
        ) : (
          <section aria-label="Administrator tools" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ADMIN_TOOLS.map(({ to, title, description, icon: Icon }) => (
              <Link key={to} to={to} className="group rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-secondary/40">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon size={21} aria-hidden="true" /></span>
                  <ChevronRight size={18} className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                </div>
                <h2 className="mt-4 font-semibold">{title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
              </Link>
            ))}
          </section>
        )}
      </main>
    </Layout>
  );
}
