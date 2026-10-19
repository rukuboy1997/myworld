import { claimModerationAlert, finishModerationAlert } from "../data/db.js";
import { isEmailConfigured, sendEmail } from "./email.service.js";

const APP_URL = (process.env.APP_URL || process.env.FRONTEND_URL || "https://myworld-app.vercel.app").replace(/\/$/, "");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function configuredRecipients() {
  const raw = process.env.ADMIN_ALERT_EMAILS || "";
  const recipients = [...new Set(raw.split(/[;,]/).map((item) => item.trim().toLowerCase()).filter(Boolean))];
  const invalid = recipients.filter((email) => !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email));
  if (invalid.length) {
    throw new Error("ADMIN_ALERT_EMAILS contains an invalid email address");
  }
  return recipients;
}

function reasonLabel(reason) {
  return ({
    "child-safety": "Child-safety concern",
    violence: "Violence or credible threat",
  })[reason] || "Critical safety concern";
}

function shortAddress(address) {
  if (!address) return "Unavailable";
  return address.length > 18 ? address.slice(0, 8) + "…" + address.slice(-6) : address;
}

// Sends only case metadata. Reporter identity, descriptions, post text, and media
// are deliberately excluded from email notifications.
export async function sendCriticalModerationAlert({
  reportId,
  reason,
  targetAddress,
  reportType = "account",
}) {
  if (!reportId || !["child-safety", "violence"].includes(reason)) {
    return { skipped: true, reason: "not_critical" };
  }

  let claim;
  try {
    claim = await claimModerationAlert(reportId, "critical");
  } catch (error) {
    console.error("[moderation-alert] failed to claim alert delivery", error?.message || error);
    return { sent: false, reason: "claim_failed" };
  }

  // A previous successful send or a concurrent in-flight attempt should not
  // generate another copy of the same critical alert.
  if (!claim) return { skipped: true, reason: "already_sent_or_in_progress" };

  try {
    const recipients = configuredRecipients();
    if (!recipients.length) {
      throw new Error("ADMIN_ALERT_EMAILS is not configured");
    }
    if (!isEmailConfigured()) {
      throw new Error("RESEND_API_KEY is not configured; critical email alert was not sent");
    }

    const label = reasonLabel(reason);
    const reference = String(reportId);
    const target = shortAddress(targetAddress);
    const dashboardUrl = APP_URL + "/admin/moderation";
    const subject = "[myWorld CRITICAL SAFETY ALERT] " + label;
    const text = [
      "A critical myWorld safety report requires prompt human review.",
      "",
      "Priority: CRITICAL",
      "Concern: " + label,
      "Report type: " + (reportType === "post" ? "Post" : "Account"),
      "Report reference: " + reference,
      "Reported account: " + target,
      "",
      "No conclusion has been made about the allegation. Review it through the administrator dashboard and follow the documented incident process.",
      "",
      "Open moderation dashboard: " + dashboardUrl,
      "",
      "This alert intentionally omits reporter identity and user-submitted report details.",
    ].join("\n");

    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#080d1a;color:#f0f4ff;font-family:Arial,sans-serif;padding:24px">
  <main style="max-width:600px;margin:0 auto;background:#0f1729;border:1px solid #7f1d1d;border-radius:16px;padding:24px">
    <p style="font-size:12px;font-weight:bold;letter-spacing:2px;color:#fca5a5">CRITICAL SAFETY ALERT</p>
    <h1 style="font-size:24px;margin:8px 0 12px">Prompt human review needed</h1>
    <p style="line-height:1.6;color:#cbd5e1">A new myWorld report has been prioritized as critical. This is a triage signal, not a conclusion that the allegation is proven.</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:20px 0">
      <tr><td style="padding:10px 0;color:#94a3b8">Concern</td><td style="padding:10px 0;font-weight:bold">${escapeHtml(label)}</td></tr>
      <tr><td style="padding:10px 0;color:#94a3b8">Report type</td><td style="padding:10px 0">${reportType === "post" ? "Post" : "Account"}</td></tr>
      <tr><td style="padding:10px 0;color:#94a3b8">Reference</td><td style="padding:10px 0;word-break:break-all">${escapeHtml(reference)}</td></tr>
      <tr><td style="padding:10px 0;color:#94a3b8">Reported account</td><td style="padding:10px 0">${escapeHtml(target)}</td></tr>
    </table>
    <p style="font-size:13px;line-height:1.6;color:#94a3b8">Reporter identity and report details are intentionally omitted. Review the case in the authenticated dashboard and follow your incident-handling procedures.</p>
    <p style="margin:28px 0"><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#00c2ff;color:#07111f;text-decoration:none;font-weight:bold;padding:13px 22px;border-radius:10px">Open moderation dashboard</a></p>
  </main>
</body></html>`;

    await sendEmail({ to: recipients, subject, text, html });
    await finishModerationAlert(claim.id, { success: true, recipientCount: recipients.length });
    console.info("[moderation-alert] critical email alert sent", {
      reportId: reference,
      recipientCount: recipients.length,
    });
    return { sent: true, recipientCount: recipients.length };
  } catch (error) {
    const message = error?.message || "Unknown alert delivery error";
    try {
      await finishModerationAlert(claim.id, {
        success: false,
        recipientCount: 0,
        error: message,
      });
    } catch (recordError) {
      console.error("[moderation-alert] failed to record delivery failure", recordError?.message || recordError);
    }
    console.error("[moderation-alert] critical email alert failed", {
      reportId: String(reportId),
      error: message,
    });
    return { sent: false, reason: message };
  }
}
