"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};
const recorderSupported = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

export interface RecordedClip {
  blob: Blob;
  mime: string;
  durationSec: number;
  url: string;
}

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

/** Records a raw voice clip with MediaRecorder so a friend's actual voice can be played back later. */
export function useRecorder() {
  const supported = useSyncExternalStore(noopSubscribe, recorderSupported, () => false);
  const [recording, setRecording] = useState(false);
  const [clip, setClip] = useState<RecordedClip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<number | null>(null);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = r.mimeType || mime || "audio/webm";
        const blob = new Blob(chunks.current, { type });
        const durationSec = (Date.now() - startedAt.current) / 1000;
        setClip((old) => {
          if (old) URL.revokeObjectURL(old.url);
          return { blob, mime: type, durationSec, url: URL.createObjectURL(blob) };
        });
        setRecording(false);
        if (timer.current) window.clearInterval(timer.current);
      };
      rec.current = r;
      startedAt.current = Date.now();
      setElapsed(0);
      timer.current = window.setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 250);
      r.start(250);
      setRecording(true);
    } catch {
      setError("Microphone access was blocked, so the voice clip can't be saved. Your words will still be transcribed if speech recognition is available.");
    }
  }, []);

  const stop = useCallback(() => {
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
  }, []);

  const discard = useCallback(() => {
    setClip((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return null;
    });
  }, []);

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  return { supported, recording, clip, error, elapsed, start, stop, discard };
}

/** Upload a recorded clip or image; returns the media id. */
export async function uploadMedia(file: Blob, name: string, duration?: number): Promise<{ id: string; url: string }> {
  const fd = new FormData();
  fd.append("file", new File([file], name, { type: file.type }));
  if (duration) fd.append("duration", String(Math.round(duration * 10) / 10));
  const res = await fetch("/api/media", { method: "POST", body: fd });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Upload failed");
  return res.json();
}

/** Downscale an image on the client before upload (keeps the DB small and uploads quick on mobile). */
export async function resizeImage(file: File, maxEdge = 1400, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", quality));
}
