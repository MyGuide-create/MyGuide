"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSpeech } from "@/hooks/useSpeech";
import { MicIcon, SearchIcon, StopIcon } from "./Icons";
import { cx } from "./ui";

/** Search box with true voice commands: "Show me guides to Athens by people I'm following". */
export function SearchBar({ initial }: { initial: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const speech = useSpeech({ continuous: false });
  const live = [speech.text, speech.interim].filter(Boolean).join(" ");
  const value = speech.listening ? live : q;

  // When a spoken command finishes, run it straight away.
  useEffect(() => {
    if (!speech.listening && speech.text) {
      const t = speech.text.trim();
      speech.reset();
      router.push(`/search?q=${encodeURIComponent(t)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.listening, speech.text]);

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`); }}
      className={cx("flex items-center gap-2 rounded-2xl border bg-paper pl-4 pr-2 py-2", speech.listening ? "border-terracotta ring-2 ring-terracotta/15" : "border-line")}
    >
      <SearchIcon size={18} className="text-ink-muted shrink-0" />
      <input
        value={value}
        onChange={(e) => setQ(e.target.value)}
        placeholder={speech.listening ? "Listening…" : "Search a city, place or person…"}
        className="flex-1 min-w-0 bg-transparent outline-none text-[15px] placeholder:text-ink-faint"
        enterKeyHint="search"
        autoFocus={!initial}
      />
      {speech.supported && (
        <button
          type="button"
          aria-label={speech.listening ? "Stop" : "Search by voice"}
          onClick={() => (speech.listening ? speech.stop() : speech.start())}
          className={cx("w-9 h-9 rounded-full text-white flex items-center justify-center shrink-0", speech.listening ? "bg-danger pulse-ring relative" : "bg-terracotta")}
        >
          {speech.listening ? <StopIcon size={16} /> : <MicIcon size={17} />}
        </button>
      )}
    </form>
  );
}
