import { sendEmail } from './email.service.js';

const APP_URL = process.env.APP_URL || 'https://myworld.dakta.name.ng';
const APP_NAME = 'myWorld';
const LOGO_URL = `${APP_URL}/logo.png`;

// ─── Brand tokens (inline — required for email clients) ───────────────────────
const C = {
  bg: '#080D1A',
  card: '#0F1729',
  cardBorder: '#1E2D4A',
  primary: '#00C2FF',
  primaryDark: '#0098CC',
  gold: '#F5A623',
  text: '#F0F4FF',
  muted: '#8B9DC3',
  bubble: '#162035',
  success: '#10B981',
  danger: '#EF4444',
  white: '#FFFFFF',
};

// ─── Base layout wrapper ──────────────────────────────────────────────────────
function baseTemplate({ preview, heroEmoji, heroTitle, bodyHtml, ctaLabel, ctaUrl }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>${APP_NAME}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<!-- preview text (hidden) -->
<div style="display:none;max-height:0;overflow:hidden;color:${C.bg};">${preview}&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌</div>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${C.bg};min-height:100vh;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" style="max-width:560px;" cellspacing="0" cellpadding="0" border="0">

        <!-- ── HEADER ───────────────────────────────────────────────── -->
        <tr>
          <td align="center" style="padding-bottom:32px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="background:linear-gradient(135deg,#0F1729 0%,#162645 100%);border-radius:20px;padding:20px 32px;border:1px solid ${C.cardBorder};">
                  <span style="font-size:26px;font-weight:900;letter-spacing:-0.5px;color:${C.white};">my<span style="color:${C.primary};">World</span></span>
                  <span style="font-size:11px;color:${C.muted};display:block;margin-top:2px;text-align:center;letter-spacing:2px;text-transform:uppercase;">Sui Social Network</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── HERO ────────────────────────────────────────────────── -->
        <tr>
          <td style="background:linear-gradient(160deg,#0F1729 0%,#0D2040 50%,#0F1729 100%);border-radius:24px;border:1px solid ${C.cardBorder};overflow:hidden;">

            <!-- top accent bar -->
            <div style="height:4px;background:linear-gradient(90deg,${C.primary} 0%,${C.gold} 100%);"></div>

            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="padding:48px 40px 40px;text-align:center;">
                  <!-- emoji icon -->
                  <div style="font-size:52px;line-height:1;margin-bottom:20px;">${heroEmoji}</div>

                  <!-- headline -->
                  <h1 style="margin:0 0 12px;font-size:26px;font-weight:800;color:${C.white};line-height:1.2;">${heroTitle}</h1>

                  <!-- body -->
                  ${bodyHtml}

                  <!-- CTA -->
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:32px auto 0;">
                    <tr>
                      <td style="border-radius:50px;background:linear-gradient(135deg,${C.primary} 0%,${C.primaryDark} 100%);box-shadow:0 0 24px rgba(0,194,255,0.35);">
                        <a href="${ctaUrl}" target="_blank" style="display:inline-block;padding:14px 40px;font-size:15px;font-weight:700;color:${C.white};text-decoration:none;letter-spacing:0.3px;">${ctaLabel} →</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── FOOTER ──────────────────────────────────────────────── -->
        <tr>
          <td style="padding:28px 0 0;text-align:center;">
            <p style="margin:0 0 8px;font-size:12px;color:${C.muted};">
              You're receiving this because someone interacted with you on
              <a href="${APP_URL}" style="color:${C.primary};text-decoration:none;">myWorld</a>.
            </p>
            <p style="margin:0;font-size:11px;color:#4A5568;">
              © ${new Date().getFullYear()} myWorld · Built on <span style="color:${C.primary};">Sui</span> &amp; Walrus
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// ─── Actor display name helper ────────────────────────────────────────────────
function actorName(actorProfile) {
  if (!actorProfile) return 'Someone';
  return actorProfile.displayName || actorProfile.username || 'Someone';
}

function truncAddr(addr) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ─── Info card (profile-style block inside emails) ───────────────────────────
function infoCard(lines) {
  const rows = lines.map(({ label, value, highlight }) =>
    `<tr>
      <td style="padding:8px 0;border-bottom:1px solid ${C.cardBorder};">
        <span style="font-size:12px;color:${C.muted};display:block;margin-bottom:2px;">${label}</span>
        <span style="font-size:14px;color:${highlight ? C.primary : C.text};font-weight:600;">${value}</span>
      </td>
    </tr>`
  ).join('');
  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
    style="background:${C.bubble};border-radius:16px;border:1px solid ${C.cardBorder};margin:24px 0;text-align:left;">
    <tr><td style="padding:20px 24px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        ${rows}
      </table>
    </td></tr>
  </table>`;
}

// ─── Quote block ──────────────────────────────────────────────────────────────
function quoteBlock(text) {
  if (!text) return '';
  return `
  <div style="background:${C.bubble};border-left:3px solid ${C.primary};border-radius:0 12px 12px 0;
    padding:16px 20px;margin:20px 0;text-align:left;">
    <p style="margin:0;font-size:14px;color:${C.text};line-height:1.6;font-style:italic;">"${text}"</p>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  PUBLIC: sendNotificationEmail
// ─────────────────────────────────────────────────────────────────────────────
export async function sendNotificationEmail({ type, recipientEmail, recipientName, actorProfile, extra }) {
  if (!recipientEmail) return;

  const actor = actorName(actorProfile);
  const actorAddr = actorProfile?.address ? truncAddr(actorProfile.address) : '';
  const appLink = `${APP_URL}/notifications`;

  let subject, preview, heroEmoji, heroTitle, bodyHtml, ctaLabel, ctaUrl;

  switch (type) {
    // ── LIKE ────────────────────────────────────────────────────────────────
    case 'like': {
      const postUrl = extra?.postId ? `${APP_URL}/post/${extra.postId}` : appLink;
      subject = `❤️ ${actor} liked your post on myWorld`;
      preview = `${actor} just gave your content a like! Come see who's loving your work.`;
      heroEmoji = '❤️';
      heroTitle = 'Your post got a like!';
      bodyHtml = `
        <p style="margin:0 0 4px;font-size:16px;color:${C.muted};">
          <strong style="color:${C.white};">${actor}</strong> just liked one of your posts.
        </p>
        ${infoCard([
          { label: 'From', value: `${actor} ${actorAddr ? `(${actorAddr})` : ''}`, highlight: true },
          { label: 'Post preview', value: extra?.postTitle || 'Your post', highlight: false },
        ])}
        <p style="margin:8px 0 0;font-size:13px;color:${C.muted};">
          You're building an audience on myWorld. Keep creating!
        </p>`;
      ctaLabel = 'View Your Post';
      ctaUrl = postUrl;
      break;
    }

    // ── COMMENT ─────────────────────────────────────────────────────────────
    case 'comment': {
      const postUrl = extra?.postId ? `${APP_URL}/post/${extra.postId}` : appLink;
      subject = `💬 ${actor} commented on your post`;
      preview = `${actor} left a comment on your post. See what they said!`;
      heroEmoji = '💬';
      heroTitle = 'New comment on your post!';
      bodyHtml = `
        <p style="margin:0 0 16px;font-size:16px;color:${C.muted};">
          <strong style="color:${C.white};">${actor}</strong> just commented on your post.
        </p>
        ${extra?.commentText ? quoteBlock(extra.commentText) : ''}
        ${infoCard([
          { label: 'From', value: `${actor} ${actorAddr ? `(${actorAddr})` : ''}`, highlight: true },
          { label: 'Post', value: extra?.postTitle || 'Your post', highlight: false },
        ])}
        <p style="margin:8px 0 0;font-size:13px;color:${C.muted};">
          Join the conversation and keep the discussion going!
        </p>`;
      ctaLabel = 'Read the Comment';
      ctaUrl = postUrl;
      break;
    }

    // ── MESSAGE ──────────────────────────────────────────────────────────────
    case 'message': {
      const msgUrl = `${APP_URL}/messages`;
      subject = `✉️ New message from ${actor} on myWorld`;
      preview = `${actor} sent you a private message. Don't leave them waiting!`;
      heroEmoji = '✉️';
      heroTitle = 'You have a new message!';
      bodyHtml = `
        <p style="margin:0 0 16px;font-size:16px;color:${C.muted};">
          <strong style="color:${C.white};">${actor}</strong> slid into your inbox.
        </p>
        ${extra?.messagePreview ? quoteBlock(extra.messagePreview) : ''}
        ${infoCard([
          { label: 'From', value: `${actor} ${actorAddr ? `(${actorAddr})` : ''}`, highlight: true },
          { label: 'When', value: 'Just now', highlight: false },
        ])}
        <p style="margin:8px 0 0;font-size:13px;color:${C.muted};">
          Conversations on myWorld are end-to-end on Sui. Reply now!
        </p>`;
      ctaLabel = 'Open Messages';
      ctaUrl = msgUrl;
      break;
    }

    // ── FOLLOW ───────────────────────────────────────────────────────────────
    case 'follow': {
      const profileUrl = actorProfile?.address
        ? `${APP_URL}/profile/${actorProfile.address}`
        : appLink;
      subject = `🔔 ${actor} is now following you on myWorld`;
      preview = `${actor} just followed you. You're growing your audience on myWorld!`;
      heroEmoji = '🌟';
      heroTitle = 'You have a new follower!';
      bodyHtml = `
        <p style="margin:0 0 16px;font-size:16px;color:${C.muted};">
          <strong style="color:${C.white};">${actor}</strong> just started following you on myWorld.
        </p>
        ${infoCard([
          { label: 'New follower', value: `${actor} ${actorAddr ? `(${actorAddr})` : ''}`, highlight: true },
          { label: 'Network', value: 'Sui Blockchain', highlight: false },
        ])}
        <p style="margin:8px 0 0;font-size:13px;color:${C.muted};">
          Your influence is growing. Follow them back and build your community!
        </p>`;
      ctaLabel = 'View Their Profile';
      ctaUrl = profileUrl;
      break;
    }

    default:
      return;
  }

  const html = baseTemplate({ preview, heroEmoji, heroTitle, bodyHtml, ctaLabel, ctaUrl });

  await sendEmail({
    to: recipientEmail,
    subject,
    html,
    text: `${heroTitle}\n\n${preview}\n\nOpen myWorld: ${ctaUrl}`,
  });
}
