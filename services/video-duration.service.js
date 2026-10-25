/**
 * Bounded, best-effort container metadata parsing for uploaded video duration.
 * The caller supplies a bounded sample from the beginning and end of the object.
 * Unsupported or incomplete metadata returns null and must be rejected by callers.
 */
function findMp4Duration(buffer) {
  let offset = 0;
  while ((offset = buffer.indexOf("mvhd", offset, "ascii")) !== -1) {
    const typeOffset = offset;
    const boxOffset = typeOffset - 4;
    if (boxOffset < 0 || typeOffset + 24 > buffer.length) {
      offset += 4;
      continue;
    }
    const boxSize = buffer.readUInt32BE(boxOffset);
    if (boxSize < 24) {
      offset += 4;
      continue;
    }
    const version = buffer[typeOffset + 4];
    try {
      if (version === 0 && typeOffset + 24 <= buffer.length) {
        const timescale = buffer.readUInt32BE(typeOffset + 16);
        const duration = buffer.readUInt32BE(typeOffset + 20);
        if (timescale > 0 && duration > 0 && duration !== 0xffffffff) return duration / timescale;
      }
      if (version === 1 && typeOffset + 32 <= buffer.length) {
        const timescale = buffer.readUInt32BE(typeOffset + 20);
        const duration = buffer.readBigUInt64BE(typeOffset + 24);
        if (timescale > 0 && duration > 0n && duration < 0xffffffffffffffffn) {
          const seconds = Number(duration) / timescale;
          if (Number.isFinite(seconds) && seconds > 0) return seconds;
        }
      }
    } catch {}
    offset += 4;
  }
  return null;
}

function readEbmlVint(buffer, offset, keepMarker = false) {
  if (offset >= buffer.length) return null;
  const first = buffer[offset];
  let length = 1;
  let mask = 0x80;
  while (length <= 8 && !(first & mask)) {
    mask >>= 1;
    length += 1;
  }
  if (length > 8 || offset + length > buffer.length) return null;
  let value = keepMarker ? BigInt(first) : BigInt(first & (mask - 1));
  for (let i = 1; i < length; i++) value = (value << 8n) | BigInt(buffer[offset + i]);
  return { length, value };
}

function findWebmDuration(buffer) {
  const scaleId = Buffer.from([0x2a, 0xd7, 0xb1]);
  const durationId = Buffer.from([0x44, 0x89]);
  let timecodeScale = 1_000_000;
  const scaleAt = buffer.indexOf(scaleId);
  if (scaleAt >= 0) {
    const size = readEbmlVint(buffer, scaleAt + scaleId.length);
    if (size && size.value >= 1n && size.value <= 4n) {
      const start = scaleAt + scaleId.length + size.length;
      const length = Number(size.value);
      if (start + length <= buffer.length) {
        timecodeScale = 0;
        for (let i = 0; i < length; i++) timecodeScale = timecodeScale * 256 + buffer[start + i];
      }
    }
  }
  let at = 0;
  while ((at = buffer.indexOf(durationId, at)) >= 0) {
    const size = readEbmlVint(buffer, at + durationId.length);
    if (size && (size.value === 4n || size.value === 8n)) {
      const start = at + durationId.length + size.length;
      const length = Number(size.value);
      if (start + length <= buffer.length) {
        const value = length === 4 ? buffer.readFloatBE(start) : buffer.readDoubleBE(start);
        const seconds = value * timecodeScale / 1_000_000_000;
        if (Number.isFinite(seconds) && seconds > 0) return seconds;
      }
    }
    at += durationId.length;
  }
  return null;
}

export function parseVideoDurationSeconds(contentType, samples) {
  if (!Array.isArray(samples) || !samples.length || samples.some((sample) => !Buffer.isBuffer(sample))) return null;
  for (const buffer of samples) {
    let seconds = null;
    if (contentType === "video/mp4" || contentType === "video/quicktime") seconds = findMp4Duration(buffer);
    else if (contentType === "video/webm") seconds = findWebmDuration(buffer);
    if (Number.isFinite(seconds) && seconds > 0) return seconds;
  }
  return null;
}
