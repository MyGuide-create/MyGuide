"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { replacePlace, setPlacePin } from "@/lib/actions/guides";
import { PlaceSearch } from "./PlaceSearch";
import { PinDropSheet } from "./PinDropSheet";
import { PinIcon } from "./Icons";

/**
 * On a place's own page, for its owner: "Wrong place?" searches Google again and swaps the match;
 * "Move pin" (or "Drop a pin instead") puts it exactly where it is. Same actions as the guide editor,
 * and the fix reaches the same spot in My places and your other guides.
 */
export function FixPlaceLocation({
  guideId,
  placeId,
  name,
  cityHint,
  droppedPin,
  at,
}: {
  guideId: string;
  placeId: string;
  name: string;
  cityHint?: string;
  droppedPin: boolean;
  at: { lat: number; lng: number } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const finish = () => {
    setOpen(false);
    setPinning(false);
    setDone(true);
    router.refresh();
  };

  const onPick = async (pick: { providerId?: string; name: string }) => {
    if (!pick.providerId) {
      // Typed a name with no match: put it on the map by hand instead.
      setPinning(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const p = await replacePlace(guideId, placeId, pick.providerId);
      if (!p) setError("Couldn't load that place. Try another, or drop a pin.");
      else finish();
    } catch {
      setError("Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2">
      {!open && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => (droppedPin ? setPinning(true) : setOpen(true))}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-line text-[12.5px] font-medium text-ink-muted hover:text-ink"
          >
            <PinIcon size={14} /> {at == null ? "Find it on the map" : droppedPin ? "Move pin" : "Wrong place? Fix location"}
          </button>
          {done && <span className="text-[12px] text-sage font-medium">Location updated ✓</span>}
        </div>
      )}
      {open && (
        <div className="rounded-2xl border border-line bg-paper p-3">
          <p className="text-[12.5px] text-ink-muted mb-2">Search for the right {name}. Your notes and tips stay.</p>
          <PlaceSearch cityHint={cityHint} onPick={onPick} busy={busy} placeholder={`Search for ${name}…`} autoFocus onDropPin={() => setPinning(true)} />
          <div className="mt-2 flex items-center justify-between gap-2">
            <button type="button" onClick={() => setPinning(true)} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-terracotta-deep">
              <PinIcon size={15} /> Not on Google? Drop a pin instead
            </button>
            <button type="button" onClick={() => { setOpen(false); setError(null); }} className="h-8 px-3 text-[12.5px] text-ink-muted">
              Cancel
            </button>
          </div>
          {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
        </div>
      )}
      {pinning && (
        <PinDropSheet
          title={`Pin ${name}`}
          initialName={name}
          askName={false}
          askCategory={false}
          saveLabel="Save pin"
          cityHint={cityHint}
          initialCenter={at}
          onClose={() => setPinning(false)}
          onSave={async (pick) => {
            await setPlacePin(guideId, placeId, { lat: pick.lat, lng: pick.lng });
            finish();
          }}
        />
      )}
    </div>
  );
}
