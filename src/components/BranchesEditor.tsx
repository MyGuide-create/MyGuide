"use client";

import { useEffect, useRef, useState } from "react";
import { errorText } from "@/lib/errorText";
import type { Place, PlaceLocation } from "@/lib/db/schema";
import { addBranches, findBranches, removeBranch, type BranchSuggestion } from "@/lib/actions/guides";
import { CheckIcon, PinIcon, TrashIcon } from "./Icons";
import { PlaceSearch } from "./PlaceSearch";
import { PinDropSheet } from "./PinDropSheet";
import { Button, Spinner, cx } from "./ui";

/**
 * "Locations" for a place with several branches: one entry, one description, several pins.
 * Offers to add other branches Google lists under the same name (ticked list), or one by search / pin.
 */
export function BranchesEditor({
  guideId,
  place,
  initial,
  cityHint,
  autoFind,
  onMerged,
}: {
  guideId: string;
  place: Place;
  initial: PlaceLocation[];
  cityHint?: string;
  /** Look for other branches straight away (the place was just added). */
  autoFind?: boolean;
  /** Separate entries in this guide that were merged into this place as branches. */
  onMerged: (mergedPlaceIds: string[], note: string) => void;
}) {
  const [branches, setBranches] = useState<PlaceLocation[]>(initial);
  const [suggestions, setSuggestions] = useState<BranchSuggestion[] | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [finding, setFinding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pinFor, setPinFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listed = !!place.googlePlaceId && place.lat != null;
  const autoRan = useRef(false);

  const find = async (auto = false) => {
    setFinding(true);
    setError(null);
    try {
      const found = await findBranches(guideId, place.id);
      setSuggestions(auto && !found.length ? null : found);
      setTicked(new Set(found.filter((f) => !f.existingPlaceId).map((f) => f.providerId)));
    } catch (e) {
      if (!auto) setError(errorText(e, "Couldn't look for branches."));
    } finally {
      setFinding(false);
    }
  };

  useEffect(() => {
    if (autoFind && listed && !autoRan.current) {
      autoRan.current = true;
      queueMicrotask(() => void find(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFind, listed]);

  const save = async (input: Parameters<typeof addBranches>[2]) => {
    setSaving(true);
    setError(null);
    try {
      const r = await addBranches(guideId, place.id, input);
      setBranches(r.branches);
      if (r.mergedPlaceIds.length) onMerged(r.mergedPlaceIds, r.note);
      return true;
    } catch (e) {
      setError(errorText(e, "Couldn't add that branch."));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addTicked = async () => {
    if (!ticked.size) return;
    if (await save({ providerIds: [...ticked] })) setSuggestions(null);
  };

  const remove = async (b: PlaceLocation) => {
    if (!confirm(`Remove the ${b.address || b.name} branch?`)) return;
    setBranches((bs) => bs.filter((x) => x.id !== b.id));
    await removeBranch(guideId, b.id).catch(() => setBranches((bs) => [...bs, b]));
  };

  const total = branches.length + 1;

  return (
    <div>
      {branches.length > 0 && (
        <>
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted mb-1.5">{total} locations</p>
          <ul className="mb-2 flex flex-col gap-1">
            <li className="flex items-center gap-2 text-[12.5px] text-ink-muted">
              <PinIcon size={14} className="text-terracotta shrink-0" />
              <span className="truncate flex-1">{place.address || place.name}</span>
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint shrink-0">Main</span>
            </li>
            {branches.map((b) => (
              <li key={b.id} className="flex items-center gap-2 text-[12.5px] text-ink-muted">
                <PinIcon size={14} className="text-terracotta-soft shrink-0" />
                <span className="truncate flex-1">{b.address || b.name}</span>
                <button type="button" onClick={() => remove(b)} aria-label="Remove branch" className="w-8 h-8 -my-1 flex items-center justify-center text-ink-muted hover:text-danger shrink-0">
                  <TrashIcon size={17} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {suggestions && (
        <div className="mb-2 rounded-2xl border border-terracotta-soft bg-terracotta-tint/50 p-3">
          {suggestions.length === 0 ? (
            <p className="text-[12.5px] text-ink-muted">No other branches found nearby. You can still add one by name or drop a pin.</p>
          ) : (
            <>
              <p className="text-[13px] font-semibold">
                {place.name} has {suggestions.length} other {suggestions.length === 1 ? "branch" : "branches"} nearby. Add {suggestions.length === 1 ? "it" : "them"} to this entry?
              </p>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">One entry, one description — readers see every location and the nearest one first.</p>
              <ul className="mt-2 flex flex-col gap-1">
                {suggestions.map((s) => {
                  const on = ticked.has(s.providerId);
                  return (
                    <li key={s.providerId}>
                      <button
                        type="button"
                        onClick={() => setTicked((t) => { const n = new Set(t); if (on) n.delete(s.providerId); else n.add(s.providerId); return n; })}
                        className="w-full text-left flex items-start gap-2.5 rounded-xl px-2 py-1.5 hover:bg-paper/70"
                      >
                        <span className={cx("mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0", on ? "bg-terracotta border-terracotta text-white" : "border-line bg-paper")}>
                          {on && <CheckIcon size={13} />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium truncate">{s.address || s.name}</span>
                          {s.name !== place.name && <span className="block text-[11.5px] text-ink-muted truncate">{s.name}</span>}
                          {s.existingPlaceId && <span className="block text-[11.5px] text-terracotta-deep">Already in this guide as its own entry — it&apos;ll be merged in (its description and tips come along).</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2 flex items-center gap-2">
                <Button size="sm" onClick={addTicked} disabled={!ticked.size || saving}>
                  {saving ? <Spinner /> : null} Add {ticked.size || ""} {ticked.size === 1 ? "branch" : "branches"}
                </Button>
                <button type="button" onClick={() => setSuggestions(null)} className="text-[12px] text-ink-muted underline">Not now</button>
              </div>
            </>
          )}
        </div>
      )}

      {adding && (
        <div className="mb-2">
          <PlaceSearch
            cityHint={cityHint}
            placeholder={`Search for another ${place.name}…`}
            autoFocus
            busy={saving}
            onPick={async (pick) => {
              if (!pick.providerId) { setPinFor(pick.name); return; }
              if (await save({ providerIds: [pick.providerId] })) setAdding(false);
            }}
            onDropPin={(name) => setPinFor(name)}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {listed && !suggestions && (
          <button type="button" onClick={() => find()} disabled={finding} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-terracotta-deep">
            {finding ? <Spinner /> : <PinIcon size={15} />} Find other branches
          </button>
        )}
        <button type="button" onClick={() => setAdding((a) => !a)} className="text-[12.5px] font-medium text-ink-muted hover:text-ink">
          {adding ? "Cancel" : "+ Add a branch"}
        </button>
      </div>
      {error && <p className="mt-1.5 text-[12px] text-danger">{error}</p>}

      {pinFor !== null && (
        <PinDropSheet
          title="Pin a branch"
          initialName={pinFor || place.name}
          askCategory={false}
          saveLabel="Add branch"
          cityHint={cityHint}
          initialCenter={place.lat != null && place.lng != null ? { lat: place.lat, lng: place.lng } : null}
          onClose={() => setPinFor(null)}
          onSave={async ({ name, lat, lng }) => {
            if (await save({ pin: { name, lat, lng } })) { setPinFor(null); setAdding(false); }
          }}
        />
      )}
    </div>
  );
}
