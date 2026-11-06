import React, { useEffect, useRef, useState } from "react";

const VIDEO_TYPES = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
const MIN_CROP_SIZE = 0.08;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "Unknown size";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
}

function makeFile(blob, original, mimeType) {
  const extension = mimeType.includes("webm") ? "webm"
    : mimeType.includes("png") ? "png"
      : mimeType.includes("gif") ? "gif"
        : mimeType.includes("jpeg") ? "jpg" : "webp";
  const base = original.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${base}-edited.${extension}`, {
    type: mimeType,
    lastModified: Date.now(),
  });
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Could not process this image.")),
      type,
      quality,
    );
  });
}

async function cropImage(file, crop, imageSize) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();

    const sx = crop.x * image.naturalWidth;
    const sy = crop.y * image.naturalHeight;
    const sw = crop.w * image.naturalWidth;
    const sh = crop.h * image.naturalHeight;
    const scale = Math.min(1, 2560 / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image editing is unavailable on this device.");
    context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    const outputType = file.type === "image/png" ? "image/png"
      : file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
    const blob = await canvasBlob(canvas, outputType, outputType === "image/png" ? undefined : 0.98);
    return makeFile(blob, file, outputType);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function compressImage(file, maxBytes, quality) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();

    let scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
    let outputQuality = quality / 100;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image compression is unavailable on this device.");

    for (let attempt = 0; attempt < 16; attempt += 1) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await canvasBlob(canvas, "image/webp", outputQuality);
      if (blob.size <= maxBytes) return makeFile(blob, file, "image/webp");

      if (outputQuality > 0.35) {
        outputQuality = Math.max(0.35, outputQuality - 0.08);
      } else {
        scale *= 0.82;
        outputQuality = quality / 100;
      }
    }
    throw new Error(`The compressed image is still larger than ${formatBytes(maxBytes)}. Lower the quality and try again.`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function recordVideo(file, start, end, videoBitrate, onProgress) {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Video processing is not supported by this browser. Try the latest Chrome or myWorld Android app.");
  }

  const video = document.createElement("video");
  const url = URL.createObjectURL(file);
  let canvasStream = null;
  let sourceStream = null;
  let animationFrame = null;
  let recorder = null;
  video.src = url;
  video.playsInline = true;
  video.preload = "auto";

  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error("Could not read this video. Try an MP4 or WebM file."));
    });

    const capture = video.captureStream || video.mozCaptureStream;
    if (!capture || !HTMLCanvasElement.prototype.captureStream) {
      throw new Error("Video processing is not available in this browser yet. Try the latest Chrome or myWorld Android app.");
    }

    const duration = Math.max(0.25, end - start);
    const scale = Math.min(1, 1920 / video.videoWidth, 1080 / video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(video.videoWidth * scale / 2) * 2);
    canvas.height = Math.max(2, Math.round(video.videoHeight * scale / 2) * 2);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Video processing is unavailable on this device.");

    canvasStream = canvas.captureStream(30);
    sourceStream = capture.call(video);
    const tracks = [
      ...canvasStream.getVideoTracks(),
      ...sourceStream.getAudioTracks(),
    ];
    const stream = new MediaStream(tracks);
    const mimeType = VIDEO_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || "";
    recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: videoBitrate,
      audioBitsPerSecond: 128000,
    });

    const chunks = [];
    const recording = new Promise((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      recorder.onerror = () => reject(new Error("Video processing failed. Please try another video."));
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "video/webm";
        resolve(new Blob(chunks, { type }));
      };
    });

    if (start > 0.03) {
      await new Promise((resolve) => {
        video.onseeked = resolve;
        video.currentTime = start;
      });
    }

    await video.play();
    recorder.start(500);

    const drawFrame = () => {
      if (video.currentTime >= end || video.ended) {
        if (animationFrame !== null) cancelAnimationFrame(animationFrame);
        animationFrame = null;
        video.pause();
        if (recorder.state !== "inactive") recorder.stop();
        onProgress?.(1);
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      onProgress?.(clamp((video.currentTime - start) / duration, 0, 0.99));
      animationFrame = requestAnimationFrame(drawFrame);
    };
    drawFrame();

    const blob = await recording;
    if (!blob.size) throw new Error("The browser returned an empty video. Please try another file.");
    return makeFile(blob, file, blob.type || "video/webm");
  } finally {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch {}
    }
    canvasStream?.getTracks().forEach((track) => track.stop());
    sourceStream?.getTracks().forEach((track) => track.stop());
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

function createAspectCrop(aspect, imageSize) {
  if (aspect === "free" || !imageSize.width || !imageSize.height) {
    return { x: 0, y: 0, w: 1, h: 1 };
  }

  const imageAspect = imageSize.width / imageSize.height;
  const normalizedAspect = Number(aspect) / imageAspect;
  let w = 0.92;
  let h = w / normalizedAspect;
  if (h > 0.92) {
    h = 0.92;
    w = h * normalizedAspect;
  }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

function resizeCrop(initial, dx, dy, mode, aspectRatio) {
  if (mode === "move") {
    return {
      ...initial,
      x: clamp(initial.x + dx, 0, 1 - initial.w),
      y: clamp(initial.y + dy, 0, 1 - initial.h),
    };
  }

  const left = mode.includes("w");
  const right = mode.includes("e");
  const top = mode.includes("n");
  const bottom = mode.includes("s");
  let w = initial.w + (right ? dx : left ? -dx : 0);
  let h = initial.h + (bottom ? dy : top ? -dy : 0);

  if (aspectRatio) {
    if (left || right) {
      if (!top && !bottom) h = w / aspectRatio;
    }
    if (top || bottom) {
      if (!left && !right) w = h * aspectRatio;
    }
    if ((left || right) && (top || bottom)) {
      if (Math.abs(dx) >= Math.abs(dy) * aspectRatio) h = w / aspectRatio;
      else w = h * aspectRatio;
    }
  }

  w = Math.max(MIN_CROP_SIZE, w);
  h = Math.max(MIN_CROP_SIZE, h);
  let x = left ? initial.x + initial.w - w
    : right ? initial.x : initial.x + (initial.w - w) / 2;
  let y = top ? initial.y + initial.h - h
    : bottom ? initial.y : initial.y + (initial.h - h) / 2;

  x = clamp(x, 0, 1 - MIN_CROP_SIZE);
  y = clamp(y, 0, 1 - MIN_CROP_SIZE);
  w = clamp(w, MIN_CROP_SIZE, 1 - x);
  h = clamp(h, MIN_CROP_SIZE, 1 - y);

  if (aspectRatio) {
    const actual = w / h;
    if (actual > aspectRatio) {
      w = h * aspectRatio;
      if (left) x = initial.x + initial.w - w;
      else if (!right) x = clamp(x + (actual - aspectRatio) * h / 2, 0, 1 - w);
    } else if (actual < aspectRatio) {
      h = w / aspectRatio;
      if (top) y = initial.y + initial.h - h;
      else if (!bottom) y = clamp(y + (h - w / actual) / 2, 0, 1 - h);
    }
  }

  return { x: clamp(x, 0, 1 - w), y: clamp(y, 0, 1 - h), w, h };
}

export default function MediaEditor({
  file,
  onChange,
  onRemove,
  maxBytes,
  maxDurationSeconds,
  disabled = false,
}) {
  const isVideo = file?.type?.startsWith("video/");
  const [preview, setPreview] = useState("");
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 1, h: 1 });
  const [cropAspect, setCropAspect] = useState("free");
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [quality, setQuality] = useState(72);
  const [processing, setProcessing] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const stageRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    if (!file) {
      setPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    setImageSize({ width: 0, height: 0 });
    setCrop({ x: 0, y: 0, w: 1, h: 1 });
    setCropAspect("free");
    setError("");
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!isVideo || !preview) return undefined;
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = preview;
    video.onloadedmetadata = () => {
      const length = Number.isFinite(video.duration) ? video.duration : 0;
      setDuration(length);
      setStart(0);
      setEnd(Math.min(length, maxDurationSeconds || length));
    };
    return () => {
      video.removeAttribute("src");
      video.load();
    };
  }, [isVideo, preview, maxDurationSeconds]);

  const oversized = Boolean(file && maxBytes && file.size > maxBytes);
  const trimNeeded = Boolean(isVideo && duration && (start > 0.05 || end < duration - 0.05));
  const cropChanged = crop.x > 0.002 || crop.y > 0.002 || crop.w < 0.998 || crop.h < 0.998;
  const imageAspect = imageSize.width && imageSize.height
    ? imageSize.width / imageSize.height
    : 1;
  const normalizedCropAspect = cropAspect === "free" ? null : Number(cropAspect) / imageAspect;
  const stageWidth = Math.min(560, 340 * imageAspect);
  const startPercent = duration ? (start / duration) * 100 : 0;
  const endPercent = duration ? (end / duration) * 100 : 100;

  const beginCropDrag = (event, mode) => {
    if (disabled || processing || !stageRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = stageRef.current.getBoundingClientRect();
    dragRef.current = {
      mode,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width: rect.width,
      height: rect.height,
      crop: { ...crop },
    };
    stageRef.current.setPointerCapture?.(event.pointerId);
  };

  const moveCropPointer = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = (event.clientX - drag.x) / drag.width;
    const dy = (event.clientY - drag.y) / drag.height;
    setCrop(resizeCrop(drag.crop, dx, dy, drag.mode, normalizedCropAspect));
  };

  const endCropPointer = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
  };

  const applyCrop = async () => {
    if (!file || !imageSize.width || !cropChanged) return;
    setProcessing("crop");
    setError("");
    try {
      const edited = await cropImage(file, crop, imageSize);
      onChange(edited);
    } catch (err) {
      setError(err.message || "Could not crop this image.");
    } finally {
      setProcessing("");
    }
  };

  const compress = async () => {
    if (!file || !maxBytes) return;
    setProcessing("compress");
    setProgress(0);
    setError("");
    try {
      let edited;
      if (isVideo) {
        const length = Math.max(0.25, end - start);
        const targetBytes = Math.max(180 * 1024, Math.floor(maxBytes * (quality / 100)));
        const totalBitrate = Math.max(220000, Math.min(8000000, Math.floor((targetBytes * 8 / length) * 0.86)));
        edited = await recordVideo(file, 0, duration || end, Math.max(140000, totalBitrate - 128000), setProgress);
      } else {
        edited = await compressImage(file, maxBytes, quality);
      }
      if (edited.size > maxBytes) {
        throw new Error(`The result is ${formatBytes(edited.size)}. Lower the quality and compress again to fit ${formatBytes(maxBytes)}.`);
      }
      onChange(edited);
    } catch (err) {
      setError(err.message || "Could not compress this media.");
    } finally {
      setProcessing("");
      setProgress(0);
    }
  };

  const applyTrim = async () => {
    if (!file || !duration || !trimNeeded) return;
    setProcessing("trim");
    setProgress(0);
    setError("");
    try {
      const edited = await recordVideo(file, start, end, 6500000, setProgress);
      onChange(edited);
    } catch (err) {
      setError(err.message || "Could not trim this video.");
    } finally {
      setProcessing("");
      setProgress(0);
    }
  };

  const selectAspect = (value) => {
    setCropAspect(value);
    setCrop(createAspectCrop(value, imageSize));
  };

  if (!file || !preview) return null;

  return (
    <section className="mt-3 space-y-3 rounded-2xl border border-border bg-card p-3 text-card-foreground sm:p-4" aria-label="Media editor">
      <style>{`
        .mw-dual-range input[type="range"] { position:absolute; inset:0; width:100%; height:32px; margin:0; appearance:none; background:transparent; pointer-events:none; }
        .mw-dual-range input[type="range"]::-webkit-slider-runnable-track { height:4px; background:transparent; }
        .mw-dual-range input[type="range"]::-moz-range-track { height:4px; background:transparent; }
        .mw-dual-range input[type="range"]::-webkit-slider-thumb { appearance:none; width:20px; height:20px; margin-top:-8px; border:3px solid white; border-radius:50%; background:var(--color-primary, #7c3aed); box-shadow:0 1px 5px #0005; pointer-events:auto; cursor:ew-resize; }
        .mw-dual-range input[type="range"]::-moz-range-thumb { width:14px; height:14px; border:3px solid white; border-radius:50%; background:var(--color-primary, #7c3aed); box-shadow:0 1px 5px #0005; pointer-events:auto; cursor:ew-resize; }
        .mw-crop-stage { touch-action:none; user-select:none; }
      `}</style>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold">Media editor</p>
          <p className="text-xs text-muted-foreground">{formatBytes(file.size)} selected · {formatBytes(maxBytes)} upload limit</p>
        </div>
        {onRemove && (
          <button type="button" onClick={onRemove} disabled={disabled || Boolean(processing)} className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-secondary">
            Remove
          </button>
        )}
      </div>

      {isVideo ? (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl bg-black">
            <video src={preview} controls playsInline className="max-h-64 w-full object-contain" />
          </div>
          <div className="rounded-xl border border-border bg-secondary/40 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Trim video</p>
                <p className="text-xs text-muted-foreground">Drag either handle to choose the part to keep.</p>
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{formatTime(end - start)}</span>
            </div>
            <div className="mw-dual-range relative mx-2 h-8" style={{ touchAction: "pan-y" }}>
              <div className="absolute inset-x-0 top-3.5 h-1.5 rounded-full bg-border" />
              <div className="absolute top-3.5 h-1.5 rounded-full bg-primary" style={{ left: `${startPercent}%`, width: `${Math.max(0, endPercent - startPercent)}%` }} />
              <input
                aria-label="Trim start"
                type="range"
                min="0"
                max={Math.max(0.1, duration)}
                step="0.1"
                value={start}
                onChange={(event) => setStart(Math.min(Number(event.target.value), end - 0.25))}
                style={{ zIndex: start > duration * 0.85 ? 3 : 2 }}
              />
              <input
                aria-label="Trim end"
                type="range"
                min="0"
                max={Math.max(0.1, duration)}
                step="0.1"
                value={end}
                onChange={(event) => setEnd(Math.max(Number(event.target.value), start + 0.25))}
                style={{ zIndex: 2 }}
              />
            </div>
            <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
              <span>{formatTime(start)}</span><span>{formatTime(duration)}</span>
            </div>
            {duration > maxDurationSeconds && (
              <p className="mt-2 text-xs text-amber-600">Your plan allows up to {formatTime(maxDurationSeconds)}. The selected section must fit this limit.</p>
            )}
            <button type="button" onClick={applyTrim} disabled={disabled || Boolean(processing) || !trimNeeded} className="mt-3 w-full rounded-full border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-bold text-primary transition hover:bg-primary/15 disabled:opacity-45">
              {processing === "trim" ? `Trimming video · ${Math.round(progress * 100)}%` : "Apply trim"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-border bg-secondary/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Crop photo</p>
              <p className="text-xs text-muted-foreground">Drag inside to move. Pull the edges or corners to resize.</p>
            </div>
            <button type="button" onClick={() => selectAspect("free")} className="text-xs font-semibold text-primary">Reset crop</button>
          </div>

          {imageSize.width > 0 && (
            <div
              ref={stageRef}
              className="mw-crop-stage relative mx-auto w-full overflow-hidden rounded-lg bg-black"
              style={{ aspectRatio: `${imageSize.width} / ${imageSize.height}`, maxWidth: `${stageWidth}px` }}
              onPointerMove={moveCropPointer}
              onPointerUp={endCropPointer}
              onPointerCancel={endCropPointer}
            >
              <img
                src={preview}
                alt="Crop preview"
                draggable="false"
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  setImageSize({ width: naturalWidth, height: naturalHeight });
                }}
                className="pointer-events-none absolute inset-0 h-full w-full object-fill"
              />
              <div
                className="absolute border-2 border-white shadow-[0_0_0_999px_rgba(0,0,0,0.58)]"
                style={{
                  left: `${crop.x * 100}%`,
                  top: `${crop.y * 100}%`,
                  width: `${crop.w * 100}%`,
                  height: `${crop.h * 100}%`,
                  cursor: "move",
                }}
                onPointerDown={(event) => beginCropDrag(event, "move")}
              >
                <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                  {[0, 1, 2].map((item) => <span key={item} className="border-r border-white/45 last:border-r-0" />)}
                </div>
                {["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((handle) => (
                  <button
                    key={handle}
                    type="button"
                    aria-label={`Resize crop ${handle}`}
                    onPointerDown={(event) => beginCropDrag(event, handle)}
                    className={`absolute z-10 block rounded-full border-2 border-primary bg-white shadow-md ${handle.length === 2 ? "h-3.5 w-3.5" : "h-2 w-5"} `}
                    style={{
                      ...(handle.includes("n") ? { top: -5 } : handle.includes("s") ? { bottom: -5 } : { top: "50%", transform: "translateY(-50%)" }),
                      ...(handle.includes("w") ? { left: -5 } : handle.includes("e") ? { right: -5 } : { left: "50%", transform: "translateX(-50%)" }),
                      ...(handle.length === 2 ? {} : { borderRadius: 999 }),
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2" role="group" aria-label="Crop aspect ratio">
            {[
              ["free", "Original"],
              ["1", "Square"],
              ["0.8", "Portrait"],
              ["1.7777778", "Landscape"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => selectAspect(value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${cropAspect === value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={applyCrop}
            disabled={disabled || Boolean(processing) || !cropChanged || !imageSize.width}
            className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:brightness-95 disabled:opacity-45"
          >
            {processing === "crop" ? "Applying crop…" : "Apply crop"}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-border bg-secondary/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Compression <span className="font-normal text-muted-foreground">(optional)</span></p>
            <p className="text-xs text-muted-foreground">{oversized ? "This file needs to be smaller before upload." : "Keep the original quality unless you need a smaller file."}</p>
          </div>
          {oversized && <span className="rounded-full bg-destructive/10 px-2 py-1 text-[11px] font-semibold text-destructive">Over limit</span>}
        </div>
        <label className="mt-3 block text-xs font-medium">
          Compression quality · {quality}%
          <input
            aria-label="Compression quality"
            type="range"
            min="35"
            max="95"
            step="5"
            value={quality}
            onChange={(event) => setQuality(Number(event.target.value))}
            className="mt-2 w-full accent-primary"
          />
        </label>
        <button
          type="button"
          onClick={compress}
          disabled={disabled || Boolean(processing) || !maxBytes}
          className="mt-3 w-full rounded-full border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground transition hover:bg-secondary disabled:opacity-45"
        >
          {processing === "compress" ? `Compressing · ${Math.round(progress * 100)}%` : `Compress ${isVideo ? "video" : "image"} · Apply separately`}
        </button>
      </div>

      {processing && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          {processing === "crop" ? "Applying your crop…" : processing === "trim" ? "Preparing trimmed video…" : "Compressing media…"}
        </div>
      )}
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
    </section>
  );
}
