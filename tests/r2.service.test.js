import test from "node:test";
import assert from "node:assert/strict";
import { sniffMime } from "../services/r2.service.js";

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
