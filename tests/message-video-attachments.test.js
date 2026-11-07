import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");
const messagesSource = await readFile(new URL("../frontend/src/pages/MessagesPage.jsx", import.meta.url), "utf8");
const settingsSource = await readFile(new URL("../frontend/src/pages/SettingsPage.jsx", import.meta.url), "utf8");
const dashboardSource = await readFile(new URL("../frontend/src/pages/AdminDashboardPage.jsx", import.meta.url), "utf8");

const attachmentStart = appSource.indexOf("const messageAttachmentUpload = multer");
const attachmentEnd = appSource.indexOf("async function publishMessageToFirebase", attachmentStart);
const attachmentRoute = appSource.slice(attachmentStart, attachmentEnd);

test("message attachment API accepts and verifies supported video formats", () => {
  assert.notEqual(attachmentStart, -1);
  for (const mime of ['"video/mp4"', '"video/webm"', '"video/quicktime"']) {
    assert.ok(attachmentRoute.includes(mime), `server allow-list should include ${mime}`);
  }
  assert.match(attachmentRoute, /mimeType\.startsWith\("video\/"\)/);
  assert.match(attachmentRoute, /sniffMime\(file\.buffer\)/);
  assert.match(attachmentRoute, /mimeType\.startsWith\("video\/"\)[\s\S]*?\? "video" :/);
  assert.match(attachmentRoute, /uploadBufferedMedia\([\s\S]*?category: "message"/);
});

test("message composer previews video and renders received video inline", () => {
  for (const mime of ["video/mp4", "video/webm", "video/quicktime"]) {
    assert.ok(messagesSource.includes(mime), `file picker should accept ${mime}`);
  }
  assert.match(messagesSource, /setAttachmentPreviewUrl\(file\.type\.startsWith\("image\/"\)[\s\S]*file\.type\.startsWith\("video\/"\)/);
  assert.match(messagesSource, /<video controls playsInline preload="metadata"/);
  assert.match(messagesSource, /aria-label="Preview video attachment"/);
});

test("admin dashboard access is checked by the protected server endpoint", () => {
  assert.match(appSource, /app\.get\("\/api\/admin\/access", requireAuth, requireAdmin/);
  assert.match(settingsSource, /getAdminAccess\(\)/);
  assert.match(settingsSource, /result\?\.isAdmin === true/);
  assert.match(dashboardSource, /getAdminAccess\(\)/);
  assert.match(dashboardSource, /Administrator access required/);
});
