import React, { useEffect, useState } from "react";
import {
  getEmailNotificationPreferences,
  updateEmailNotificationPreferences,
} from "../lib/api.js";

const DEFAULT_PREFERENCES = {
  emailEnabled: true,
  unreadMessageReminders: false,
  activityDigest: false,
  reengagementEmails: false,
};

const PREFERENCE_FIELDS = Object.keys(DEFAULT_PREFERENCES);

function normalizePreferences(value = {}) {
  return Object.fromEntries(
    PREFERENCE_FIELDS.map((field) => [
      field,
      typeof value[field] === "boolean" ? value[field] : DEFAULT_PREFERENCES[field],
    ]),
  );
}

function hasChanges(left, right) {
  return PREFERENCE_FIELDS.some((field) => left?.[field] !== right?.[field]);
}

function PreferenceSwitch({
  id,
  label,
  description,
  checked,
  disabled = false,
  onChange,
}) {
  return (
    <label
      htmlFor={id}
      className={`flex items-center justify-between gap-4 py-3.5 ${disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer"}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">
          {label}
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
      <span className="relative inline-flex h-6 w-11 flex-shrink-0 items-center">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-white/15 transition-colors peer-checked:bg-primary peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5"
        />
      </span>
    </label>
  );
}

export default function EmailPreferencesPanel() {
  const [savedPreferences, setSavedPreferences] = useState(null);
  const [draftPreferences, setDraftPreferences] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError("");

    getEmailNotificationPreferences()
      .then((data) => {
        if (!active) return;
        const normalized = normalizePreferences(data);
        setSavedPreferences(normalized);
        setDraftPreferences(normalized);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || "Could not load email preferences.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [loadAttempt]);

  const changed = hasChanges(savedPreferences, draftPreferences);

  const updateDraft = (field, value) => {
    setDraftPreferences((current) => ({ ...current, [field]: value }));
    setNotice("");
    setError("");
  };

  const handleSave = async () => {
    if (!draftPreferences || !changed || isSaving) return;
    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      const updated = normalizePreferences(
        await updateEmailNotificationPreferences(draftPreferences),
      );
      setSavedPreferences(updated);
      setDraftPreferences(updated);
      setNotice("Your email preferences have been saved.");
    } catch (saveError) {
      setError(saveError.message || "Could not save your email preferences. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="email-preferences-title"
      className="glass-panel mb-6 rounded-3xl border border-white/10 p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="email-preferences-title" className="text-base font-bold">
            Email preferences
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Choose the optional updates myWorld can send to help you keep up with your conversations and community.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-5 space-y-4" aria-label="Loading email preferences">
          <div className="h-12 animate-pulse rounded-xl bg-white/5" />
          <div className="h-12 animate-pulse rounded-xl bg-white/5" />
        </div>
      ) : error && !draftPreferences ? (
        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-3" role="alert">
          <p className="text-sm text-red-300">{error}</p>
          <button
            type="button"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            className="mt-2 text-xs font-semibold text-primary hover:underline"
          >
            Reload preferences
          </button>
        </div>
      ) : draftPreferences ? (
        <>
          <div className="mt-4 divide-y divide-white/10">
            <PreferenceSwitch
              id="email-enabled"
              label="Allow optional emails"
              description="Turn off reminders and community roundups from myWorld."
              checked={draftPreferences.emailEnabled}
              disabled={isSaving}
              onChange={(value) => updateDraft("emailEnabled", value)}
            />

            <div className="pl-3 sm:pl-4">
              <PreferenceSwitch
                id="unread-message-reminders"
                label="Unread message reminders"
                description="A private reminder when unread messages are waiting after you have been away. Maximum one every 72 hours."
                checked={draftPreferences.unreadMessageReminders}
                disabled={!draftPreferences.emailEnabled || isSaving}
                onChange={(value) => updateDraft("unreadMessageReminders", value)}
              />
              <PreferenceSwitch
                id="activity-digest"
                label="Following activity digest"
                description="A periodic roundup of updates and Reels shared by people you follow."
                checked={draftPreferences.activityDigest}
                disabled={!draftPreferences.emailEnabled || isSaving}
                onChange={(value) => updateDraft("activityDigest", value)}
              />
              <PreferenceSwitch
                id="reengagement-emails"
                label="Occasional catch-up emails"
                description="A thoughtful note after a longer break, only when there is something worth catching up on."
                checked={draftPreferences.reengagementEmails}
                disabled={!draftPreferences.emailEnabled || isSaving}
                onChange={(value) => updateDraft("reengagementEmails", value)}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Account verification, password reset and essential security emails are managed separately.
            </p>
            <button
              type="button"
              onClick={handleSave}
              disabled={!changed || isSaving}
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isSaving ? "Saving…" : "Save preferences"}
            </button>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Unread-message reminders are sent only to verified email accounts when you have been inactive
            for at least 3 days and unread messages have been waiting for at least 2 hours. A reminder is
            limited to once every 72 hours. Following-activity digests and catch-up emails are not active yet.
          </p>
          <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
            {notice}
          </p>
          {error && (
            <p className="mt-2 text-xs text-red-300" role="alert">
              {error}
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
