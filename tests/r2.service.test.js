import test from "node:test";
import assert from "node:assert/strict";
import { sniffMime, matchesR2UploadMetadata, matchesR2UploadSignature } from "../services/r2.service.js";

test("detects PNG image signatures", () => {
  assert.equal(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47])), "image/png");
});

test("detects JPEG image signatures", () => {
  assert.equal(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0x00])), "image/jpeg");
});

test("detects GIF image signatures", () => {
  assert.equal(sniffMime(Buffer.from([0x47, 0x49, 0x46, 0x38])), "image/gif");
});

test("detects WebP image signatures", () => {
  assert.equal(sniffMime(Buffer.from("RIFFxxxxWEBP")), "image/webp");
});

test("detects MP4 video signatures", () => {
  assert.equal(
    sniffMime(Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])),
    "video/mp4",
  );
});

test("detects WebM video signatures", () => {
  assert.equal(
    sniffMime(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
    "video/webm",
  );
});

test("returns null for missing, short, and unknown signatures", () => {
  assert.equal(sniffMime(null), null);
  assert.equal(sniffMime(Buffer.from([0x89, 0x50, 0x4e])), null);
  assert.equal(sniffMime(Buffer.from("not a media file")), null);
});


test("R2 upload metadata must match the reserved byte size and content type", () => {
  const intent = { expectedBytes: 1024, expectedContentType: "image/jpeg" };
  assert.equal(matchesR2UploadMetadata(intent, {
    sizeBytes: 1024,
    contentType: "image/jpeg",
  }), true);
  assert.equal(matchesR2UploadMetadata(intent, {
    sizeBytes: 1023,
    contentType: "image/jpeg",
  }), false);
  assert.equal(matchesR2UploadMetadata(intent, {
    sizeBytes: 1024,
    contentType: "image/png",
  }), false);
  assert.equal(matchesR2UploadMetadata(intent, null), false);
  assert.equal(matchesR2UploadMetadata({
    expectedBytes: Number.MAX_SAFE_INTEGER + 1,
    expectedContentType: "image/jpeg",
  }, {
    sizeBytes: Number.MAX_SAFE_INTEGER + 1,
    contentType: "image/jpeg",
  }), false);
});


test("media signatures must match the reserved content type", () => {
  assert.equal(matchesR2UploadSignature("image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])), true);
  assert.equal(matchesR2UploadSignature("image/jpeg", Buffer.from("RIFFxxxxWEBP")), false);
  assert.equal(matchesR2UploadSignature("video/mp4", Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])), true);
  assert.equal(matchesR2UploadSignature("video/quicktime", Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20])), true);
  assert.equal(matchesR2UploadSignature("video/webm", Buffer.from("not a video file")), false);
  assert.equal(matchesR2UploadSignature("image/png", null), false);
});
