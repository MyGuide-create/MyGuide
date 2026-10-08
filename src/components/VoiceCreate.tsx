"use client";

import { useRouter } from "next/navigation";
import { UserError } from "@/lib/userError";
import { errorText } from "@/lib/errorText";
import { useState } from "react";
import { createGuide } from "@/lib/actions/guides";
import type { ParsedPlacesResponse } from "@/app/api/ai/parse-places/route";
import type { PlaceResult } from "@/lib/places";
import type { MapsListResult } from "@/lib/places/googleMapsList";
import { findMapsListLink, hasMapsLink, listTitleFromCaption, MAPS_LIST_FALLBACK } from "@/lib/places/importText";
import { formatCoords } from "@/lib/places/pins";
import { mapLimit } from "@/lib/utils";
import { CheckIcon, ListIcon, PinIcon, XIcon } from "./Icons";
import { CityPicker, type PickedCity } from "./CityPicker";
import { PlaceSearch } from "./PlaceSearch";
import { ScreenshotImport } from "./ScreenshotImport";
import { Button, Input, Label, Spinner, Textarea, cx } from "./ui";

type Stage = "structuring" | "importing" | "review" | "typed" | "paste";
type DraftPlace = ParsedPlacesResponse["places"][number] & {
  key: string;
  removed?: boolean;
  /** Dropped pin from a Google Maps list place we couldn't match to a listing. */
  pin?: { lat: number; lng: number; address?: string } | null;
  /** The list owner's note → "Description - What Makes It Special". */
  note?: string;
};

/** Google Maps list places per /api/import/match-places request, and requests in flight at once. */
const MATCH_BATCH = 20;
const MATCH_PARALLEL = 2;
const SINGLE_PLACE_MSG = "This looks like a single place, not a list. Paste it in the box below instead.";

export interface ForWish {
  ids: string[];
  city: string;
  /** First names of the people it's for. */
  names: string[];
}

/**
 * Create a guide: name it and add places one by one, or import a list
 * (Google Maps lists, screenshots, WhatsApp, notes) and we structure it.
 * Voice was removed on 8 Oct 2026 (unreliable; phones have their own dictation).
 */
/** A real-sounding example beats "What's this guide for?" (Raad's suggestion). */
const TITLE_EXAMPLE = "Weekend away with the boys";

export function VoiceCreate({ forWish, initialCity, startWithImport }: { forWish?: ForWish | null; initialCity?: PickedCity | null; /** Open straight on "Import your places" (+ → Import a Google Maps list). */ startWithImport?: boolean }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(startWithImport ? "paste" : "typed");
  const [picked, setPicked] = useState<PickedCity | null>(initialCity ?? null);
  const example = TITLE_EXAMPLE;
  const [pastedList, setPastedList] = useState("");
  const [result, setResult] = useState<ParsedPlacesResponse | null>(null);
  const [draft, setDraft] = useState<DraftPlace[]>([]);
  const [title, setTitle] = useState("");
  const [city, setCity] = useState(forWish?.city ?? "");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [fixingKey, setFixingKey] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState("");
  const [fromList, setFromList] = useState(false);
  const [listLink, setListLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const structure = async (text: string, from: Stage = "paste") => {
    if (!text.trim()) { setError("Name at least one place first."); return; }
    setStage("structuring");
    setError(null);
    try {
      const res = await fetch("/api/ai/parse-places", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: text }) });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string; code?: string; listUrls?: string[]; listTitle?: string; rest?: string };
        if (err.code === "maps_list" && err.listUrls?.length) {
          return await importMapsLists(err.listUrls, { from, fallbackTitle: err.listTitle, extraText: err.rest });
        }
        throw new UserError(err.error ?? "Couldn't read that list — try pasting it again, one place per line.");
      }
      const data = (await res.json()) as ParsedPlacesResponse;
      setFromList(false);
      setResult(data);
      setDraft(data.places.map((p, i) => ({ ...p, key: `${i}-${p.name}` })));
      // Keep a title the creator already typed; only fill in the suggestion when it's empty.
      setTitle((t) => t.trim() || data.title);
      setCity((c) => c.trim() || data.city);
      setStage("review");
    } catch (e) {
      setError(errorText(e, "Couldn't read that list."));
      setStage(from);
    }
  };

  /**
   * Read whole Google Maps saved lists, match each place on Google (or keep it as a pin), then review.
   * `extraText` is anything else pasted alongside the link, structured the normal way and added after.
   */
  const importMapsLists = async (
    urls: string[],
    opts: { from: Stage; fallbackTitle?: string; extraText?: string; fromLinkField?: boolean },
  ) => {
    const fail = (msg: string) => {
      if (opts.fromLinkField) setLinkError(msg);
      else setError(msg);
      setStage(opts.from);
    };
    setStage("importing");
    setError(null);
    setLinkError(null);
    setImportMsg("Reading your Google Maps list…");
    try {
      // Other pasted places are looked up while the list is read.
      const extra = opts.extraText?.trim()
        ? fetch("/api/ai/parse-places", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: opts.extraText }) })
            .then(async (r) => (r.ok ? ((await r.json()) as ParsedPlacesResponse).places : []))
            .catch(() => [])
        : Promise.resolve([]);
      let listTitle = "";
      const listPlaces: MapsListResult["places"] = [];
      const codes: string[] = [];
      for (const url of urls.slice(0, 5)) {
        const res = await fetch("/api/import/maps-list", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
        if (!res.ok) {
          codes.push(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "fetch_failed");
          continue;
        }
        const list = (await res.json()) as MapsListResult;
        listTitle ||= list.title ?? "";
        listPlaces.push(...list.places);
      }
      if (!listPlaces.length) {
        return fail(opts.fromLinkField && codes.length && codes.every((c) => c === "not_a_list") ? SINGLE_PLACE_MSG : MAPS_LIST_FALLBACK);
      }

      const batches: MapsListResult["places"][] = [];
      for (let i = 0; i < listPlaces.length; i += MATCH_BATCH) batches.push(listPlaces.slice(i, i + MATCH_BATCH));
      let done = 0;
      setImportMsg(`Matching ${listPlaces.length} places on Google…`);
      const matched = await mapLimit(batches, MATCH_PARALLEL, async (batch) => {
        let matches: (PlaceResult | null)[] = [];
        try {
          const res = await fetch("/api/import/match-places", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ places: batch.map(({ name, lat, lng }) => ({ name, lat, lng })) }),
          });
          if (res.ok) matches = ((await res.json()) as { matches: (PlaceResult | null)[] }).matches;
        } catch {
          /* a failed batch just becomes dropped pins */
        }
        done += batch.length;
        setImportMsg(`Matching places on Google… ${done} of ${listPlaces.length}`);
        return batch.map((_, i) => matches[i] ?? null);
      });

      const flat = matched.flat();
      const places = listPlaces.map((p, i) => ({ list: p, match: flat[i] ?? null }));
      const extraPlaces = await extra;
      const firstCity = places.find((p) => p.match?.city)?.match ?? extraPlaces.find((p) => p.resolved?.city)?.resolved;
      setDraft([
        ...places.map(({ list, match }, i) => ({
          key: `${i}-${list.name}`,
          name: list.name,
          resolved: match,
          pin: match ? null : { lat: list.lat, lng: list.lng, address: list.address },
          note: list.note,
        })),
        ...extraPlaces.map((p, i) => ({ ...p, key: `x${i}-${p.name}` })),
      ]);
      const guideTitle = listTitle || opts.fallbackTitle || "";
      setResult({ title: guideTitle, city: firstCity?.city ?? "", country: firstCity?.country ?? "", places: [], ai: true });
      setTitle((t) => t.trim() || guideTitle);
      setCity((c) => c.trim() || (firstCity?.city ?? ""));
      setFromList(true);
      setStage("review");
    } catch {
      fail(MAPS_LIST_FALLBACK);
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
        wishIds: forWish?.ids,
        places: kept.map((p) => ({
          name: p.resolved?.name ?? p.name,
          providerId: p.resolved?.providerId ?? null,
          cityHint: p.cityHint,
          pin: p.resolved ? null : p.pin,
          note: p.note,
        })),
      });
      router.push(`/g/${slug}/edit?created=1`);
    } catch (e) {
      setError(errorText(e, "Couldn't create the guide."));
      setCreating(false);
    }
  };

  const createTyped = async () => {
    if (!picked && !city.trim()) { setError("Pick the city this guide is for."); return; }
    if (!title.trim()) { setError("Give your guide a title — something friends will recognise, like “" + example + "”."); return; }
    setCreating(true);
    try {
      const slug = await createGuide({
        title: title.trim(),
        city: picked?.city ?? city,
        country: picked?.country,
        lat: picked && Number.isFinite(picked.lat) ? picked.lat : null,
        lng: picked && Number.isFinite(picked.lng) ? picked.lng : null,
        wishIds: forWish?.ids,
      });
      router.push(`/g/${slug}/edit?start=1`);
    } catch (e) {
      setError(errorText(e, "Couldn't create the guide."));
      setCreating(false);
    }
  };

  /* ---------- typed flow ---------- */
  if (stage === "typed") {
    return (
      <div className="px-6 pt-4 pb-10 flex flex-col gap-5">
        <h1 className="font-display text-[34px] leading-[1.05]">Where&apos;s this guide for?</h1>
        <div>
          <Label htmlFor="guide-city-pick">City</Label>
          <CityPicker
            id="guide-city-pick"
            initial={initialCity?.label ?? forWish?.city ?? ""}
            autoFocus={!initialCity && !forWish}
            onPick={(c) => { setPicked(c); setCity(c.city); setError(null); }}
            onFreeText={(t) => { setPicked(null); setCity(t); setError(null); }}
          />
        </div>
        <div>
          <Label htmlFor="guide-title">Title</Label>
          <Input id="guide-title" value={title} onChange={(e) => { setTitle(e.target.value); setError(null); }} placeholder={forWish ? `e.g. ${forWish.city} for ${forWish.names[0]}` : `e.g. ${example}`} autoFocus={!!initialCity || !!forWish} />
        </div>
        {error && <p className="text-[12.5px] text-danger">{error}</p>}
        <Button size="lg" onClick={createTyped} disabled={creating || !title.trim() || !(picked || city.trim())}>{creating ? <Spinner /> : "Start guide"}</Button>
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
              <span className="block font-semibold text-[16px]">Import a Google Maps list</span>
              <span className="block mt-0.5 text-[13px] text-ink-muted leading-snug">Turn a saved list into a guide in seconds — or bring places in from:</span>
              <span className="mt-2 flex flex-wrap gap-1.5">
                {["Screenshots", "WhatsApp", "Notes"].map((t) => (
                  <span key={t} className="rounded-full bg-sage-tint px-2.5 py-0.5 text-[11.5px] font-medium text-sage">{t}</span>
                ))}
              </span>
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
            Paste a Google Maps saved list&apos;s link and we&apos;ll bring in every place. Screenshots, links, a WhatsApp message or your Notes work too.
          </p>
        </div>
        {(() => {
          const found = findMapsListLink(listLink);
          const singlePlace = !found && hasMapsLink(listLink);
          const message = linkError ?? (singlePlace ? SINGLE_PLACE_MSG : null);
          return (
            <div className="rounded-3xl border border-line bg-paper p-4 flex flex-col gap-2.5">
              <div>
                <div className="text-[14px] font-semibold">Google Maps — a whole saved list</div>
                <p className="mt-0.5 text-[12px] text-ink-muted leading-snug">
                  Paste the list&apos;s link and we&apos;ll bring in every place, with your notes. Or add screenshots below, or paste copied list text or a Takeout CSV.
                </p>
              </div>
              <div>
                <Label htmlFor="maps-list-link">Google Maps list link</Label>
                <Input
                  id="maps-list-link"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={listLink}
                  onChange={(e) => { setListLink(e.target.value); setLinkError(null); }}
                  placeholder="https://maps.app.goo.gl/…"
                  aria-describedby="maps-list-link-help"
                  aria-invalid={!!message}
                />
                <p id="maps-list-link-help" className="mt-1.5 text-[11.5px] text-ink-muted leading-snug">
                  In Google Maps: Saved → open your list → Share → Copy link, then paste it here.
                </p>
              </div>
              {message && <p role="alert" className="text-[12.5px] text-danger leading-snug">{message}</p>}
              <Button
                variant="secondary"
                disabled={!found}
                onClick={() => found && importMapsLists([found.url], { from: "paste", fallbackTitle: listTitleFromCaption(found.caption), fromLinkField: true })}
              >
                Import list
              </Button>
            </div>
          );
        })()}
        <ScreenshotImport onPlaces={(lines) => setPastedList((v) => [v.trim(), ...lines].filter(Boolean).join("\n"))} />
        <div className="flex items-center gap-3 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-faint">
          <span className="h-px flex-1 bg-line" /> Or paste text or links <span className="h-px flex-1 bg-line" />
        </div>
        <div className="grid grid-cols-1 gap-2">
          {[
            { t: "Google Maps — one place", d: "Open the place → Share → Copy link. Paste one link per line." },
            { t: "Google Maps — copied list text", d: "On a computer you can also select the whole list panel, copy and paste it here — we keep the names and skip ratings, prices and closed places. A Google Takeout “Saved” CSV works too." },
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

  /* ---------- importing a Google Maps list ---------- */
  if (stage === "importing") {
    return (
      <div className="px-6 pt-24 flex flex-col items-center text-center gap-4">
        <Spinner className="text-terracotta w-8 h-8" />
        <p className="font-display text-[28px] leading-tight">{importMsg || "Reading your Google Maps list…"}</p>
        <p className="text-[13.5px] text-ink-muted">Big lists take a moment — we&apos;re finding each place on Google.</p>
      </div>
    );
  }

  /* ---------- review ---------- */
  if (stage === "review" && result) {
    const kept = draft.filter((p) => !p.removed);
    return (
      <div className="px-5 pt-3 pb-28 flex flex-col gap-4">
        <div>
          <Label>Title</Label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-transparent font-display text-[32px] leading-[1.05] outline-none border-b border-line focus:border-terracotta-soft" />
          <div className="mt-2 flex items-center gap-2">
            <Label className="mb-0">City</Label>
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Where is this guide?" className="flex-1 bg-transparent text-[14px] outline-none border-b border-line focus:border-terracotta-soft py-1" />
          </div>
        </div>
        {fromList ? (
          <p className="text-[12.5px] text-ink-muted">
            {(() => {
              const pins = draft.filter((p) => !p.resolved && p.pin).length;
              return `Imported ${draft.length} place${draft.length === 1 ? "" : "s"} from your Google Maps list.${pins ? ` ${pins} couldn't be matched to a Google listing, so they're added as dropped pins at the list's location — tap “Find on Google” if you know the right one.` : ""} Remove any you don't want.`;
            })()}
          </p>
        ) : (
          <p className="text-[12.5px] text-ink-muted">We only added the places you named{result.ai ? "" : " (structured with the built-in parser)"}. Remove any mistakes, fix a mismatch, or add one you forgot.</p>
        )}
        <ul className="flex flex-col gap-2">
          {draft.map((p) => (
            <li key={p.key} className={cx("rounded-2xl border bg-paper px-3.5 py-3", p.removed ? "opacity-40 border-line" : p.resolved || p.pin ? "border-line" : "border-ochre")}>
              <div className="flex items-start gap-3">
                <span className={cx("mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0", p.resolved ? "bg-sage-tint text-sage" : "bg-ochre-soft text-ink")}>
                  {p.resolved ? <CheckIcon size={15} /> : <PinIcon size={15} />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px] leading-snug">{p.resolved?.name ?? p.name}</div>
                  <div className="text-[11.5px] text-ink-muted truncate">
                    {p.resolved
                      ? `${p.resolved.category} · ${p.resolved.address || p.resolved.city}`
                      : p.pin
                        ? `Dropped pin · ${p.pin.address || formatCoords(p.pin.lat, p.pin.lng)}`
                        : `“${p.name}” — couldn't match it to a place`}
                  </div>
                  {p.note && <div className="mt-1 text-[12px] text-ink-muted italic line-clamp-2">“{p.note}”</div>}
                  {!p.removed && (
                    <button type="button" onClick={() => setFixingKey(fixingKey === p.key ? null : p.key)} className="mt-1 text-[11.5px] font-medium text-terracotta">
                      {p.resolved ? "Wrong place?" : p.pin ? "Find on Google" : "Find it"}
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
                      setDraft((d) => d.map((x) => x.key === p.key ? { ...x, name: pick.name, pin: pick.providerId ? null : x.pin, resolved: pick.providerId ? { ...(x.resolved ?? emptyResolved(pick.name, city)), providerId: pick.providerId, name: pick.name } : null } : x));
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
            <button type="button" onClick={() => { setStage("paste"); setFromList(false); setError(null); }} className="text-[13px] font-medium text-ink-muted px-3 py-2">Start over</button>
            <div className="flex-1" />
            <Button onClick={finish} disabled={creating || kept.length === 0}>{creating ? <Spinner /> : `Create guide · ${kept.length} place${kept.length === 1 ? "" : "s"}`}</Button>
          </div>
        </div>
      </div>
    );
  }

  /* Anything else (e.g. review without a result) falls back to the typed start. */
  return null;
}

function emptyResolved(name: string, city: string): NonNullable<ParsedPlacesResponse["places"][number]["resolved"]> {
  return { providerId: "", name, address: "", city, country: "", lat: 0, lng: 0, category: "Food & Drinks", photoUrl: null, photoUrls: [], phone: null, website: null, instagram: null, hours: null, businessStatus: null, source: "mock" };
}
