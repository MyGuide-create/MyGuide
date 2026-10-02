"use client";

import { useRef, useState } from "react";
import { CameraIcon } from "./Icons";
import { Spinner } from "./ui";

/** Shrink a screenshot to what the AI reads anyway (~1568px long side) and return base64 JPEG. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.85).replace(/^data:[^,]+,/, "");
}

/**
 * "Add screenshots": pick screenshots of a Google Maps list (or Instagram post, notes…),
 * read the place names off them, and hand them back as one-per-line text to review.
 */
export function ScreenshotImport({ onPlaces }: { onPlaces: (lines: string[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const run = async (files: File[]) => {
    if (!files.length) return;
    setMsg(null);
    const found: string[] = [];
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      setBusy({ done: i, total: files.length });
      try {
        const image = await shrink(files[i]);
        const res = await fetch("/api/ai/screenshot-places", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image, mediaType: "image/jpeg" }) });
        const data = (await res.json()) as { places?: Array<{ name: string; area: string }>; error?: string; code?: string };
        if (!res.ok) {
          if (data.code === "no_ai") {
            setBusy(null);
            setMsg({ tone: "error", text: data.error ?? "Screenshot reading isn't turned on yet." });
            return;
          }
          failed++;
          continue;
        }
        for (const p of data.places ?? []) found.push(p.area && !p.name.toLowerCase().includes(p.area.toLowerCase()) ? `${p.name} in ${p.area}` : p.name);
      } catch {
        failed++;
      }
    }
    setBusy(null);
    const unique = [...new Map(found.map((l) => [l.toLowerCase(), l])).values()];
    if (unique.length) onPlaces(unique);
    setMsg(
      unique.length
        ? { tone: "ok", text: `Found ${unique.length} place${unique.length === 1 ? "" : "s"} in ${files.length} screenshot${files.length === 1 ? "" : "s"}${failed ? ` (${failed} couldn't be read)` : ""}. Check the list below, then build your guide.` }
        : { tone: "error", text: "No place names found — try screenshots where the names are clearly visible." },
    );
  };

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])].slice(0, 10);
          e.target.value = "";
          void run(files);
        }}
      />
      <button
        type="button"
        disabled={!!busy}
        onClick={() => input.current?.click()}
        className="w-full rounded-3xl border border-line bg-paper p-4 flex gap-4 items-start text-left hover:border-terracotta-soft active:scale-[0.99] transition-transform disabled:opacity-80"
      >
        <span className="w-12 h-12 rounded-2xl bg-terracotta text-white flex items-center justify-center shrink-0">{busy ? <Spinner /> : <CameraIcon size={22} />}</span>
        <span className="min-w-0">
          <span className="block font-semibold text-[16px]">{busy ? `Reading screenshot ${busy.done + 1} of ${busy.total}…` : "Add screenshots"}</span>
          <span className="block mt-0.5 text-[13px] text-ink-muted leading-snug">
            Best for a saved Google Maps list on your phone: open the list, screenshot it as you scroll, and pick the screenshots here. Works for Instagram posts and notes too.
          </span>
        </span>
      </button>
      {msg && <p className={msg.tone === "ok" ? "mt-2 text-[12.5px] text-sage" : "mt-2 text-[12.5px] text-danger"}>{msg.text}</p>}
    </div>
  );
}
