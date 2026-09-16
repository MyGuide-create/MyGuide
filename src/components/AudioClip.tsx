"use client";

import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/utils";
import { PauseIcon, SpeakerIcon } from "./Icons";
import { cx } from "./ui";

/** "Voice note · 0:38" pill that plays a creator's recorded recommendation. */
export function AudioClip({ mediaId, duration, label = "Voice note", className }: { mediaId: string; duration?: number | null; label?: string; className?: string }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState<number | null>(duration ?? null);
  const [pos, setPos] = useState(0);

  useEffect(() => {
    const a = new Audio(`/api/media/${mediaId}`);
    a.preload = "metadata";
    a.onloadedmetadata = () => { if (isFinite(a.duration)) setDur(a.duration); };
    a.ontimeupdate = () => setPos(a.currentTime);
    a.onended = () => { setPlaying(false); setPos(0); };
    a.onpause = () => setPlaying(false);
    a.onplay = () => setPlaying(true);
    ref.current = a;
    return () => { a.pause(); ref.current = null; };
  }, [mediaId]);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => {});
    else a.pause();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={cx("inline-flex items-center gap-1.5 text-[11px] font-medium text-sage rounded-full px-1 -mx-1 py-0.5 hover:bg-sage-tint", className)}
      aria-label={playing ? "Pause voice note" : "Play voice note"}
    >
      {playing ? <PauseIcon size={14} /> : <SpeakerIcon size={14} />}
      <span>
        {label}
        {dur ? ` · ${playing ? formatDuration(pos) + " / " : ""}${formatDuration(dur)}` : ""}
      </span>
    </button>
  );
}
