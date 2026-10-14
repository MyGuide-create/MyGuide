"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { removePlace } from "@/lib/actions/guides";
import { EditIcon, TrashIcon } from "./Icons";
import { EDIT_DESCRIPTION_EVENT } from "./DescriptionEditor";

const pill = "inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-line text-[12.5px] font-medium text-ink-muted hover:text-ink disabled:opacity-50";

/**
 * On your own place's page: Edit (a guide's place opens in the guide editor; a My places spot edits its
 * description right on the page, never in a guide editor) and Remove
 * (same action as the editor's remove, then back to My places or the guide).
 */
export function PlaceOwnerActions({
  guideId,
  placeId,
  name,
  editHref,
  backHref,
  from,
}: {
  guideId: string;
  placeId: string;
  name: string;
  /** Guide editor link; null = edit on the page (My places). */
  editHref: string | null;
  backHref: string;
  /** "My places" or the guide's title, for the confirm line. */
  from: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    if (!confirm(`Remove ${name} from ${from}? Your notes and tips on it go too.`)) return;
    setBusy(true);
    setError(null);
    try {
      await removePlace(guideId, placeId);
      router.replace(backHref);
      router.refresh();
    } catch {
      setError("Couldn’t remove it. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap">
      {editHref ? (
        <Link href={editHref} className={pill}>
          <EditIcon size={13} /> Edit
        </Link>
      ) : (
        <button type="button" onClick={() => window.dispatchEvent(new Event(EDIT_DESCRIPTION_EVENT))} className={pill}>
          <EditIcon size={13} /> Edit
        </button>
      )}
      <button type="button" onClick={remove} disabled={busy} className={pill}>
        <TrashIcon size={13} /> {busy ? "Removing…" : "Remove"}
      </button>
      {error && <span className="text-[12px] text-terracotta-deep">{error}</span>}
    </div>
  );
}
