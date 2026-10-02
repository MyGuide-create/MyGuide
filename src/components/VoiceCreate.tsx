"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSpeech } from "@/hooks/useSpeech";
import { createGuide } from "@/lib/actions/guides";
import type { ParsedPlacesResponse } from "@/app/api/ai/parse-places/route";
import { CheckIcon, KeyboardIcon, ListIcon, MicIcon, PinIcon, StopIcon, XIcon } from "./Icons";
import { PlaceSearch } from "./PlaceSearch";
import { ScreenshotImport } from "./ScreenshotImport";
import { Button, Input, Label, Spinner, Textarea, cx } from "./ui";

type Stage = "talk" | "structuring" | "review" | "typed" | "paste";
type DraftPlace = ParsedPlacesResponse["places"][number] & { key: string; removed?: boolean };

/**
 * Create a Guide by voice: name the places you want in one go, we structure
 * them and pull in Maps data. Only the places you name, never suggestions.
 */
export function VoiceCreate({ initialMode }: { initialMode: "voice" | "type" }) {
  const router = useRouter();
  const speech = useSpeech({ continuous: true });
  const [stage, setStage] = useState<Stage>(initialMode === "type" ? "typed" : "talk");
  const [typed, setTyped] = useState("");
  const [pastedList, setPastedList] = useState("");
  const [result, setResult] = useState<ParsedPlacesResponse | null>(null);
  const [draft, setDraft] = useState<DraftPlace[]>([]);
  const [title, setTitle] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [fixingKey, setFixingKey] = useState<string | null>(null);
  const [showTyped, setShowTyped] = useState(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const transcript = [speech.text, speech.interim].filter(Boolean).join(" ");
  useEffect(() => { transcriptRef.current?.scrollTo({ top: 1e6 }); }, [transcript]);

  const structure = async (text: string, from: Stage = "talk") => {
    if (!text.trim()) { setError("Name at least one place first."); return; }
    setStage("structuring");
    setError(null);
    try {
      const res = await fetch("/api/ai/parse-places", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: text }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Couldn't structure that.");
      const data = (await res.json()) as ParsedPlacesResponse;
      setResult(data);
      setDraft(data.places.map((p, i) => ({ ...p, key: `${i}-${p.name}` })));
      setTitle(data.title);
      setCity(data.city);
      setStage("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't structure that.");
      setStage(from);
    }
  };

  const finish = async () => {
    const kept = draft.filter((p) => !p.removed);
    if (!kept.length) { setError("Keep at least one place."); return; }
    setCreating(true);
    try {
      const slug = await createGuide({
        title: title.trim() || result?.title || "My Guide",
        city: city || result?.city,
        country: result?.country,
        places: kept.map((p) => ({ name: p.resolved?.name ?? p.name, providerId: p.resolved?.providerId ?? null, cityHint: p.cityHint })),
      });
      router.push(`/g/${slug}/edit?created=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the guide.");
      setCreating(false);
    }
  };

  const createTyped = async () => {
    if (!title.trim()) { setError("Give your guide a title."); return; }
    setCreating(true);
    try {
      const slug = await createGuide({ title: title.trim(), city });
      router.push(`/g/${slug}/edit`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the guide.");
      setCreating(false);
    }
  };

  /* ---------- typed flow ---------- */
  if (stage === "typed") {
    return (
      <div className="px-6 pt-4 pb-10 flex flex-col gap-5">
        <div>
          <h1 className="font-display text-[34px] leading-[1.05]">Name your guide.</h1>
          <p className="mt-2 text-[13.5px] text-ink-muted">Then add places one by one with Maps autocomplete.</p>
        </div>
        <div>
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Lisbon for a Long Weekend" autoFocus />
        </div>
        <div>
          <Label>City (optional)</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lisbon" />
        </div>
        {error && <p className="text-[12.5px] text-danger">{error}</p>}
        <Button size="lg" onClick={createTyped} disabled={creating}>{creating ? <Spinner /> : "Continue to add places"}</Button>
        <div className="mt-2 flex items-center gap-3 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-faint">
          <span className="h-px flex-1 bg-line" /> Or start faster <span className="h-px flex-1 bg-line" />
        </div>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => { setStage("paste"); setError(null); }}
            className="text-left rounded-3xl border border-line bg-paper p-4 flex gap-4 items-start hover:border-terracotta-soft active:scale-[0.99] transition-transform"
          >
            <span className="w-12 h-12 rounded-2xl bg-sage text-white flex items-center justify-center shrink-0"><ListIcon size={22} /></span>
            <span className="min-w-0">
              <span className="block font-semibold text-[16px]">Import a list</span>
              <span className="block mt-0.5 text-[13px] text-ink-muted leading-snug">Turn places you&apos;ve already saved into a guide in seconds.</span>
              <span className="mt-2 flex flex-wrap gap-1.5">
                {["Google Maps lists", "Screenshots", "WhatsApp", "Notes"].map((t) => (
                  <span key={t} className="rounded-full bg-sage-tint px-2.5 py-0.5 text-[11.5px] font-medium text-sage">{t}</span>
                ))}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => { setStage("talk"); setError(null); }}
            className="text-left rounded-3xl border border-line bg-paper p-4 flex gap-4 items-start hover:border-terracotta-soft active:scale-[0.99] transition-transform"
          >
            <span className="w-12 h-12 rounded-2xl bg-terracotta text-white flex items-center justify-center shrink-0"><MicIcon size={22} /></span>
            <span className="min-w-0">
              <span className="block font-semibold text-[16px]">Say your places</span>
              <span className="block mt-0.5 text-[13px] text-ink-muted leading-snug">Just talk — &ldquo;Shelter for dinner, Ettore for gelato, Times Beach for sunset&rdquo; — and we&apos;ll build it.</span>
            </span>
          </button>
        </div>
      </div>
    );
  }

  /* ---------- paste-a-list import (Google Maps saved lists, etc.) ---------- */
  if (stage === "paste") {
    return (
      <div className="px-6 pt-4 pb-10 flex flex-col gap-5">
        <div>
          <h1 className="font-display text-[34px] leading-[1.05]">Import your places.</h1>
          <p className="mt-2 text-[13.5px] text-ink-muted leading-relaxed">
            Bring in places you&apos;ve already saved — screenshots of a Google Maps list, links, a WhatsApp message, your Notes. We&apos;ll find each place and build the guide.
          </p>
        </div>
        <ScreenshotImport onPlaces={(lines) => setPastedList((v) => [v.trim(), ...lines].filter(Boolean).join("\n"))} />
        <div className="flex items-center gap-3 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-faint">
          <span className="h-px flex-1 bg-line" /> Or paste text or links <span className="h-px flex-1 bg-line" />
        </div>
        <div className="grid grid-cols-1 gap-2">
          {[
            { t: "Google Maps — one place", d: "Open the place → Share → Copy link. Paste one link per line." },
            { t: "Google Maps — a whole saved list", d: "Easiest: use Add screenshots above. On a computer you can also select the whole list panel, copy and paste it here — we keep the names and skip ratings, prices and closed places." },
            { t: "WhatsApp", d: "Long-press the message → Copy. Dates, names, emojis and “try these” are cleaned up for you." },
            { t: "Notes or anywhere", d: "One place per line works best. Add the area if it helps: “Ichiran in Shinjuku”." },
          ].map((x) => (
            <div key={x.t} className="rounded-2xl border border-line/70 bg-paper px-3.5 py-2.5">
              <div className="text-[13px] font-semibold">{x.t}</div>
              <div className="text-[12px] text-ink-muted leading-snug">{x.d}</div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              const clip = await navigator.clipboard.readText();
              if (clip.trim()) setPastedList((v) => (v.trim() ? `${v.trim()}\n${clip}` : clip));
            } catch {
              setError("Couldn't read your clipboard — long-press the box below and choose Paste.");
            }
          }}
          className="rounded-2xl border-2 border-dashed border-sage/60 bg-sage-tint/50 px-4 py-3 text-[14px] font-semibold text-sage"
        >
          Paste what I copied
        </button>
        <Textarea
          value={pastedList}
          onChange={(e) => setPastedList(e.target.value)}
          rows={10}
          placeholder={"Tsuta ramen\nhttps://maps.app.goo.gl/…\n• Yanaka Coffee Ten 🙌\n[12/03, 10:15] Omar: try Ichiran in Shinjuku\n…"}
        />
        {error && <p className="text-[12.5px] text-danger">{error}</p>}
        <Button size="lg" onClick={() => structure(pastedList, "paste")} disabled={!pastedList.trim()}>Build my guide</Button>
        <button type="button" onClick={() => { setStage("typed"); setError(null); }} className="text-[13px] text-ink-muted text-center">Back</button>
      </div>
    );
  }

  /* ---------- structuring ---------- */
  if (stage === "structuring") {
    return (
      <div className="px-6 pt-24 flex flex-col items-center text-center gap-4">
        <Spinner className="text-terracotta w-8 h-8" />
        <p className="font-display text-[28px] leading-tight">Finding your places…</p>
        <p className="text-[13.5px] text-ink-muted">Splitting the list, pulling in photos, pins, hours.</p>
      </div>
    );
  }

  /* ---------- review ---------- */
  if (stage === "review" && result) {
    const kept = draft.filter((p) => !p.removed);
    return (
      <div className="px-5 pt-3 pb-28 flex flex-col gap-4">
        <div>
          <Label>Suggested title</Label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-transparent font-display text-[32px] leading-[1.05] outline-none border-b border-line focus:border-terracotta-soft" />
          <div className="mt-2 flex items-center gap-2">
            <Label className="mb-0">City</Label>
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Where is this guide?" className="flex-1 bg-transparent text-[14px] outline-none border-b border-line focus:border-terracotta-soft py-1" />
          </div>
        </div>
        <p className="text-[12.5px] text-ink-muted">We only added the places you named{result.ai ? "" : " (structured with the built-in parser)"}. Remove any mistakes, fix a mismatch, or add one you forgot.</p>
        <ul className="flex flex-col gap-2">
          {draft.map((p) => (
            <li key={p.key} className={cx("rounded-2xl border bg-paper px-3.5 py-3", p.removed ? "opacity-40 border-line" : p.resolved ? "border-line" : "border-ochre")}>
              <div className="flex items-start gap-3">
                <span className={cx("mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0", p.resolved ? "bg-sage-tint text-sage" : "bg-ochre-soft text-ink")}>
                  {p.resolved ? <CheckIcon size={15} /> : <PinIcon size={15} />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px] leading-snug">{p.resolved?.name ?? p.name}</div>
                  <div className="text-[11.5px] text-ink-muted truncate">
                    {p.resolved ? `${p.resolved.category} · ${p.resolved.address || p.resolved.city}` : `Heard “${p.name}” — couldn't match it to a place`}
                  </div>
                  {!p.removed && (
                    <button type="button" onClick={() => setFixingKey(fixingKey === p.key ? null : p.key)} className="mt-1 text-[11.5px] font-medium text-terracotta">
                      {p.resolved ? "Wrong place?" : "Find it"}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={p.removed ? "Restore" : "Remove"}
                  onClick={() => setDraft((d) => d.map((x) => (x.key === p.key ? { ...x, removed: !x.removed } : x)))}
                  className="text-ink-faint hover:text-danger p-1"
                >
                  {p.removed ? <span className="text-[11px] font-medium">Undo</span> : <XIcon size={16} />}
                </button>
              </div>
              {fixingKey === p.key && (
                <div className="mt-3">
                  <PlaceSearch
                    cityHint={city || undefined}
                    placeholder={`Search for ${p.name}…`}
                    autoFocus
                    onPick={async (pick) => {
                      setDraft((d) => d.map((x) => x.key === p.key ? { ...x, name: pick.name, resolved: pick.providerId ? { ...(x.resolved ?? emptyResolved(pick.name, city)), providerId: pick.providerId, name: pick.name } : null } : x));
                      setFixingKey(null);
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
        <div>
          <Label>Forgot one?</Label>
          <PlaceSearch
            cityHint={city || undefined}
            onPick={(pick) => setDraft((d) => [...d, { key: `${Date.now()}`, name: pick.name, cityHint: city, resolved: pick.providerId ? { ...emptyResolved(pick.name, city), providerId: pick.providerId } : null }])}
          />
        </div>
        {error && <p className="text-[12.5px] text-danger">{error}</p>}
        <div className="fixed bottom-0 inset-x-0 z-30 flex justify-center pointer-events-none">
          <div className="pointer-events-auto w-full max-w-[480px] safe-bottom bg-paper/95 backdrop-blur border-t border-line px-4 py-3 flex items-center gap-2">
            <button type="button" onClick={() => { setStage("talk"); speech.reset(); }} className="text-[13px] font-medium text-ink-muted px-3 py-2">Start over</button>
            <div className="flex-1" />
            <Button onClick={finish} disabled={creating || kept.length === 0}>{creating ? <Spinner /> : `Create guide · ${kept.length} place${kept.length === 1 ? "" : "s"}`}</Button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- talk ---------- */
  return (
    <div className="px-6 pt-4 pb-10 flex flex-col min-h-[calc(100dvh-56px)]">
      <h1 className="font-display text-[34px] leading-[1.05]">Say the places you want in your guide.</h1>
      <p className="mt-2 text-[13.5px] text-ink-muted leading-relaxed">
        All in one go, like you&apos;d tell a friend: <span className="italic text-ink">“Tsuta ramen, Yanaka Coffee Ten, Ichiran in Shinjuku…”</span>
      </p>

      <div ref={transcriptRef} className={cx("mt-5 flex-1 min-h-[140px] max-h-[38dvh] overflow-y-auto rounded-3xl border px-4 py-3 text-[16px] leading-relaxed", speech.listening ? "border-terracotta bg-paper" : "border-line bg-paper/60")}>
        {transcript ? (
          <p>{speech.text}{speech.interim && <span className="text-ink-faint"> {speech.interim}</span>}</p>
        ) : (
          <p className="text-ink-faint">{speech.listening ? "Listening…" : "Your list will appear here."}</p>
        )}
      </div>
      {speech.error && <p className="mt-2 text-[12.5px] text-ink-muted">{speech.error}</p>}
      {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}

      {(!speech.supported || showTyped) && (
        <div className="mt-3">
          <Textarea value={typed} onChange={(e) => setTyped(e.target.value)} rows={3} autoFocus={showTyped} placeholder={speech.supported ? "Type your places, separated by commas." : "Voice isn't available in this browser. Type your places, separated by commas."} />
        </div>
      )}

      <div className="mt-6 flex flex-col items-center gap-4">
        {speech.supported ? (
          <button
            type="button"
            onClick={() => (speech.listening ? speech.stop() : speech.start())}
            aria-label={speech.listening ? "Stop listening" : "Start listening"}
            className={cx("relative w-[84px] h-[84px] rounded-full text-white flex items-center justify-center transition-transform active:scale-95 shadow-float", speech.listening ? "bg-danger pulse-ring" : "bg-terracotta")}
          >
            {speech.listening ? <StopIcon size={30} /> : <MicIcon size={34} />}
          </button>
        ) : null}
        <p className="text-[12.5px] text-ink-muted">{speech.listening ? "Tap to stop when you're done." : speech.supported ? "Tap to talk." : ""}</p>
        <Button size="lg" onClick={() => structure([speech.text || transcript, typed].filter((t) => t.trim()).join(", "), "talk")} disabled={speech.listening || !(transcript.trim() || typed.trim())} className="w-full">
          Build my guide
        </Button>
        <div className="flex items-center gap-4 text-[13px] text-ink-muted">
          {speech.supported && transcript && !speech.listening && <button type="button" onClick={speech.reset} className="underline">Clear</button>}
          {speech.supported && !showTyped && <button type="button" onClick={() => setShowTyped(true)} className="inline-flex items-center gap-1.5"><KeyboardIcon size={15} /> Type your list</button>}
          <button type="button" onClick={() => setStage("typed")} className="inline-flex items-center gap-1.5">Add places one by one</button>
        </div>
      </div>
      <p className="mt-6 text-[11.5px] text-ink-faint text-center">
        Voice is handled by your browser. <Link href="/" className="underline">Cancel</Link>
      </p>
    </div>
  );
}

function emptyResolved(name: string, city: string): NonNullable<ParsedPlacesResponse["places"][number]["resolved"]> {
  return { providerId: "", name, address: "", city, country: "", lat: 0, lng: 0, category: "Food & Drinks", photoUrl: null, photoUrls: [], phone: null, website: null, instagram: null, hours: null, businessStatus: null, source: "mock" };
}
