import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const databaseSource = await readFile(
  new URL("../data/db.js", import.meta.url),
  "utf8",
);

const cleanupStart = databaseSource.indexOf(
  "export async function getAbandonedMediaUploadIntents",
);
const cleanupEnd = databaseSource.indexOf(
  "export async function deleteCleanedMediaUploadIntents",
  cleanupStart,
);
const cleanupSource = databaseSource.slice(cleanupStart, cleanupEnd);

test("abandoned upload cleanup protects every live media owner", () => {
  assert.notEqual(cleanupStart, -1, "cleanup function should exist");
  assert.notEqual(cleanupEnd, -1, "cleanup function should have a clear boundary");

  // Buffered uploads are marked completed before their owning row is saved.
  // They are intentionally unclaimed, so age alone cannot prove abandonment.
  assert.match(cleanupSource, /const liveReferenceGuard/);
  assert.match(cleanupSource, /UPDATE media_upload_intents i[\s\S]*\$\{liveReferenceGuard\}/);
  assert.match(cleanupSource, /SELECT i\.id, i\.object_key, i\.status[\s\S]*\$\{liveReferenceGuard\}/);

  for (const liveTable of ["posts", "statuses", "messages", "comments", "profiles"]) {
    assert.match(
      cleanupSource,
      new RegExp(`NOT EXISTS \\(\\s*SELECT 1 FROM ${liveTable}\\b`),
      `cleanup must preserve media referenced by ${liveTable}`,
    );
  }
});

test("profile media references are checked by both key and legacy URL", () => {
  assert.match(cleanupSource, /pr\.avatar_blob_id = i\.object_key/);
  assert.match(cleanupSource, /pr\.banner_blob_id = i\.object_key/);
  assert.match(cleanupSource, /pr\.avatar_url LIKE/);
  assert.match(cleanupSource, /pr\.banner_url LIKE/);
});

test("status cleanup protects unexpired status media", () => {
  assert.match(cleanupSource, /s\.expires_at > NOW\(\)/);
  assert.match(cleanupSource, /s\.media_key = i\.object_key/);
  assert.match(cleanupSource, /s\.media_url LIKE/);
});

test("cron repeats live-reference checks immediately before R2 deletion", async () => {
  const appSource = await readFile(
    new URL("../app.js", import.meta.url),
    "utf8",
  );
  const cleanupStart = appSource.indexOf("const abandoned = await getAbandonedMediaUploadIntents");
  const cleanupEnd = appSource.indexOf("if (cleanedIds.length)", cleanupStart);
  const cronCleanup = appSource.slice(cleanupStart, cleanupEnd);

  assert.notEqual(cleanupStart, -1);
  assert.notEqual(cleanupEnd, -1);
  assert.match(cronCleanup, /const liveReference = await pool\.query/);
  assert.match(cronCleanup, /if \(liveReference\.rows\[0\]\?\.referenced\)/);
  assert.match(cronCleanup, /await deleteFromR2\(intent\.object_key\)/);

  for (const liveTable of ["posts", "statuses", "messages", "comments", "profiles"]) {
    assert.match(
      cronCleanup,
      new RegExp(`EXISTS \\\\(SELECT 1 FROM ${liveTable}\\\\b`),
      `the cron must protect media referenced by ${liveTable} before deletion`,
    );
  }
});
