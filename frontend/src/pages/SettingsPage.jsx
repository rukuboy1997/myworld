import React from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import EmailPreferencesPanel from "../components/EmailPreferencesPanel.jsx";
import { useAuth } from "../lib/auth.jsx";
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  LifeBuoy,
  Lock,
  Mail,
  Shield,
  Trash2,
  UserRound,
} from "../components/icons.jsx";

function SettingsLink({ to, icon: Icon, title, description, tone = "primary" }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/35 hover:bg-secondary/50"
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
        <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
    </Link>
  );
}

function SectionTitle({ children, description, id }) {
  return (
    <div className="mb-3">
      <h2 id={id} className="text-sm font-bold tracking-wide text-foreground">{children}</h2>
      {description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  );
}

export default function SettingsPage() {
  const { address, isAuthenticated, openAuthModal } = useAuth();

  return (
    <Layout>
      <main className="mx-auto w-full max-w-3xl px-4 pb-12 pt-5 sm:px-6 sm:pt-8">
        <Link to={address ? `/profile/${address}` : "/"} className="mb-5 inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground">
          <ArrowLeft size={16} aria-hidden="true" />
          Back
        </Link>

        <header className="mb-7 overflow-hidden rounded-3xl border border-border bg-card">
          <div className="relative overflow-hidden p-5 sm:p-7">
            <div className="pointer-events-none absolute -right-12 -top-20 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Lock size={23} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Your account, your choices</p>
                <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">Settings &amp; Privacy</h1>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Manage your email preferences, review myWorld policies, and find help whenever you need it.
                </p>
              </div>
            </div>
          </div>
        </header>

        {!isAuthenticated ? (
          <section className="rounded-3xl border border-border bg-card p-7 text-center sm:p-9">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <UserRound size={22} aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-lg font-bold">Sign in to manage your settings</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">Your preferences are private and are saved to your myWorld account.</p>
            <button type="button" onClick={() => openAuthModal("signin")} className="mt-5 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition hover:brightness-95">Sign in</button>
          </section>
        ) : (
          <div className="space-y-8">
            <section aria-labelledby="settings-email-title" id="email-preferences" className="scroll-mt-6">
              <SectionTitle id="settings-email-title" description="Choose which optional emails you'd like to receive. You can change these choices at any time.">Email preferences</SectionTitle>
              <EmailPreferencesPanel />
            </section>

            <section aria-labelledby="settings-privacy-title">
              <SectionTitle id="settings-privacy-title" description="Review how your account and personal information are handled.">Privacy &amp; account</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-2">
                <SettingsLink to={`/profile/${address}`} icon={UserRound} title="Profile details" description="Update your public profile information and private contact details." />
                <SettingsLink to="/privacy-policy" icon={Shield} title="Privacy policy" description="Learn what information myWorld handles and how it is used." />
                <SettingsLink to="/child-safety" icon={Lock} title="Safety & child protection" description="Read our safety commitments and reporting guidance." />
                <SettingsLink to="/delete-account" icon={Trash2} title="Delete account" description="Review the steps and consequences of deleting your account." tone="danger" />
              </div>
            </section>

            <section aria-labelledby="settings-legal-title">
              <SectionTitle id="settings-legal-title" description="Important information about using myWorld.">Legal</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-2">
                <SettingsLink to="/terms" icon={FileText} title="Terms of use" description="Read the rules and conditions for using myWorld." />
                <SettingsLink to="/privacy-policy" icon={Shield} title="Privacy policy" description="Understand your privacy rights and our data practices." />
              </div>
            </section>

            <section aria-labelledby="settings-support-title">
              <SectionTitle description="Need help or have a question? Our contact details are here.">Help &amp; support</SectionTitle>
              <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <LifeBuoy size={20} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold">Contact myWorld support</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">For account, privacy, safety, or technical questions, send our team an email.</p>
                    <a href="mailto:contact@dakta.name.ng" className="mt-3 inline-flex items-center gap-2 break-all text-sm font-semibold text-primary hover:underline">
                      <Mail size={15} aria-hidden="true" />
                      contact@dakta.name.ng
                    </a>
                  </div>
                </div>
              </div>
            </section>

            <footer className="border-t border-border pt-4 text-center text-xs text-muted-foreground">
              myWorld · Your space, your settings.
            </footer>
          </div>
        )}
      </main>
    </Layout>
  );
}
