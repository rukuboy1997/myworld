import React, { useEffect, useMemo, useState } from "react";

const VIDEO_TYPES = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "Unknown size";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function makeFile(blob, original, mimeType) {
  const extension = mimeType.includes("webm") ? "webm" : mimeType.includes("png") ? "png" : "jpg";
  const base = original.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${base}-edited.${extension}`, { type: mimeType, lastModified: Date.now() });
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not process this image.")), type, quality);
  });
}

async function processImage(file, crop, maxBytes, quality) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const ratio = crop.ratio === "free" ? image.naturalWidth / image.naturalHeight : Number(crop.ratio);
    const zoom = crop.zoom;
    let width = Math.min(image.naturalWidth, image.naturalHeight * ratio) / zoom;
    let height = width / ratio;
    if (height > image.naturalHeight) {
      height = image.naturalHeight / zoom;
      width = height * ratio;
    }
    const maxX = Math.max(0, image.naturalWidth - width);
    const maxY = Math.max(0, image.naturalHeight - height);
    const sx = maxX * crop.x;
    const sy = maxY * crop.y;
    const scale = Math.min(1, 1920 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image editing is unavailable on this device.");
    context.drawImage(image, sx, sy, width, height, 0, 0, canvas.width, canvas.height);
    const outputType = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
    let outputQuality = quality;
    let blob = await canvasBlob(canvas, outputType, outputQuality);
    while (blob.size > maxBytes && outputQuality > 0.4) {
      outputQuality = Math.max(0.4, outputQuality - 0.1);
      blob = await canvasBlob(canvas, outputType, outputQuality);
    }
    if (blob.size > maxBytes) throw new Error(`Edited image is still too large (${formatBytes(blob.size)}). Try a smaller crop or lower quality.`);
    return makeFile(blob, file, outputType);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function processVideo(file, start, end, maxBytes, quality, onProgress) {
  if (typeof MediaRecorder === "undefined") throw new Error("Video compression is not supported by this browser. Try the latest Chrome or myWorld Android app.");
  const video = document.createElement("video");
  const url = URL.createObjectURL(file);
  video.src = url;
  video.muted = false;
  video.playsInline = true;
  video.preload = "auto";
  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error("Could not read this video. Try an MP4 or WebM file."));
    });
    const capture = video.captureStream || video.mozCaptureStream;
    if (!capture || !HTMLCanvasElement.prototype.captureStream) {
      throw new Error("Video editing is not available in this browser yet. Try the latest Chrome or myWorld Android app.");
    }
    const duration = Math.max(0.5, end - start);
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1280 / video.videoWidth, 720 / video.videoHeight);
    canvas.width = Math.max(2, Math.round(video.videoWidth * scale / 2) * 2);
    canvas.height = Math.max(2, Math.round(video.videoHeight * scale / 2) * 2);
    const context = canvas.getContext("2d");
    const canvasStream = canvas.captureStream(24);
    const sourceStream = capture.call(video);
    const tracks = [...canvasStream.getVideoTracks(), ...sourceStream.getAudioTracks()];
    const stream = new MediaStream(tracks);
    const preferredType = VIDEO_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || "";
    const targetBytes = Math.max(256 * 1024, Math.floor(maxBytes * quality));
    const totalBitrate = Math.max(180000, Math.min(5000000, Math.floor((targetBytes * 8) / duration * 0.88)));
    const audioBitrate = Math.min(96000, Math.floor(totalBitrate * 0.18));
    const videoBitrate = Math.max(120000, totalBitrate - audioBitrate);
    const recorder = new MediaRecorder(stream, {
      ...(preferredType ? { mimeType: preferredType } : {}),
      videoBitsPerSecond: videoBitrate,
      audioBitsPerSecond: audioBitrate,
    });
    const chunks = [];
    const result = new Promise((resolve, reject) => {
      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
      recorder.onerror = () => reject(new Error("Video compression failed. Please try another video."));
      recorder.onstop = () => {
        const mime = recorder.mimeType || preferredType || "video/webm";
        const blob = new Blob(chunks, { type: mime });
        resolve(blob);
      };
    });
    if (start > 0.05) {
      await new Promise((resolve) => { video.onseeked = resolve; video.currentTime = start; });
    }
    await video.play();
    recorder.start(500);
    let frameId;
    const draw = () => {
      if (video.currentTime >= end || video.ended) {
        cancelAnimationFrame(frameId);
        video.pause();
        if (recorder.state !== "inactive") recorder.stop();
        onProgress?.(1);
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      onProgress?.(Math.min(0.99, (video.currentTime - start) / duration));
      frameId = requestAnimationFrame(draw);
    };
    draw();
    const blob = await result;
    stream.getTracks().forEach((track) => track.stop());
    if (blob.size > maxBytes) throw new Error(`Compressed video is ${formatBytes(blob.size)}. Reduce the quality or trim it further to fit ${formatBytes(maxBytes)}.`);
    return makeFile(blob, file, blob.type);
  } finally {
    video.pause();
    URL.revokeObjectURL(url);
  }
}

export default function MediaEditor({ file, onChange, maxBytes, maxDurationSeconds, disabled = false }) {
  const isVideo = file?.type?.startsWith("video/");
  const [preview, setPreview] = useState("");
  const [ratio, setRatio] = useState("free");
  const [zoom, setZoom] = useState(1);
  const [cropX, setCropX] = useState(0.5);
  const [cropY, setCropY] = useState(0.5);
  const [quality, setQuality] = useState(0.8);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file) { setPreview(""); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
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
    return () => { video.src = ""; };
  }, [isVideo, preview, maxDurationSeconds]);

  const oversized = Boolean(file && maxBytes && file.size > maxBytes);
  const needsVideoEdit = Boolean(isVideo && maxDurationSeconds && duration > maxDurationSeconds);
  const canApply = Boolean(file && maxBytes > 0 && (isVideo ? end > start : true));

  const apply = async () => {
    if (!file || !canApply) return;
    setProcessing(true);
    setProgress(0);
    setError("");
    try {
      const edited = isVideo
        ? await processVideo(file, start, end, maxBytes, quality, setProgress)
        : await processImage(file, { ratio, zoom, x: cropX, y: cropY }, maxBytes, quality);
      onChange(edited);
      setError("");
    } catch (err) {
      setError(err.message || "Could not edit this media.");
    } finally {
      setProcessing(false);
      setProgress(0);
    }
  };

  const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  const aspect = useMemo(() => ratio === "free" ? "auto" : ratio === "1" ? "1 / 1" : ratio === "0.8" ? "4 / 5" : "16 / 9", [ratio]);

  if (!file || !preview) return null;
  return (
    <section className="mt-3 rounded-2xl border border-border bg-secondary/30 p-3" aria-label="Media editor">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Edit your {isVideo ? "video" : "photo"}</p>
          <p className="text-xs text-muted-foreground">{formatBytes(file.size)} · Limit {formatBytes(maxBytes)}</p>
        </div>
        {oversized && <span className="rounded-full bg-destructive/10 px-2 py-1 text-[11px] font-semibold text-destructive">Needs compression</span>}
      </div>
      <div className="overflow-hidden rounded-xl bg-black">
        {isVideo ? (
          <video src={preview} controls muted playsInline className="max-h-64 w-full object-contain" />
        ) : (
          <div className="flex max-h-72 items-center justify-center overflow-hidden p-2">
            <img src={preview} alt="Selected media preview" className="max-h-64 max-w-full object-contain" style={{ aspectRatio: aspect }} />
          </div>
        )}
      </div>
      {isVideo ? (
        <div className="mt-3 space-y-3">
          <div className="flex justify-between text-xs text-muted-foreground"><span>Trim video</span><span>{formatTime(end - start)} selected</span></div>
          <label className="block text-xs font-medium">Start · {formatTime(start)}
            <input aria-label="Video start time" type="range" min="0" max={Math.max(0, duration - 0.5)} step="0.1" value={start} onChange={(e) => setStart(Math.min(Number(e.target.value), end - 0.5))} className="mt-1 w-full accent-primary" />
          </label>
          <label className="block text-xs font-medium">End · {formatTime(end)}
            <input aria-label="Video end time" type="range" min={Math.min(duration, start + 0.5)} max={duration} step="0.1" value={end} onChange={(e) => setEnd(Number(e.target.value))} className="mt-1 w-full accent-primary" />
          </label>
          {needsVideoEdit && <p className="text-xs text-amber-600">This video exceeds your {Math.floor(maxDurationSeconds / 60)} minute duration limit. Trim it to fit.</p>}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Crop aspect ratio">
            {[["free", "Original"], ["1", "Square"], ["0.8", "Portrait"], ["1.7777778", "Landscape"]].map(([value, label]) => (
              <button key={value} type="button" onClick={() => setRatio(value)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${ratio === value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>{label}</button>
            ))}
          </div>
          <label className="block text-xs font-medium">Zoom
            <input aria-label="Image crop zoom" type="range" min="1" max="3" step="0.05" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="mt-1 w-full accent-primary" />
          </label>
          <label className="block text-xs font-medium">Horizontal position
            <input aria-label="Image crop horizontal position" type="range" min="0" max="1" step="0.01" value={cropX} onChange={(e) => setCropX(Number(e.target.value))} className="mt-1 w-full accent-primary" />
          </label>
          <label className="block text-xs font-medium">Vertical position
            <input aria-label="Image crop vertical position" type="range" min="0" max="1" step="0.01" value={cropY} onChange={(e) => setCropY(Number(e.target.value))} className="mt-1 w-full accent-primary" />
          </label>
        </div>
      )}
      <label className="mt-3 block text-xs font-medium">Compression quality · {Math.round(quality * 100)}%
        <input aria-label="Media compression quality" type="range" min="0.35" max="0.95" step="0.05" value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="mt-1 w-full accent-primary" />
      </label>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">{oversized || needsVideoEdit ? "Edit to meet your upload limits before publishing." : "You can crop or compress before publishing."}</p>
        <button type="button" onClick={apply} disabled={disabled || processing || !canApply} className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">
          {processing ? `Processing ${Math.round(progress * 100)}%` : "Apply edits"}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    </section>
  );
}
