"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { errorText } from "@/lib/errorText";
import { updatePlace } from "@/lib/actions/guides";
import { EditIcon } from "./Icons";
import { Button, Spinner, Textarea } from "./ui";

/** Fired by the place page's Edit button to open the description here. */
export const EDIT_DESCRIPTION_EVENT = "mg:edit-description";

/**
 * Your own place's description, edited right on the place page (14 Oct 2026): no trip to the guide
 * editor, so a My spots spot is never turned into a guide to change one line.
 */
export function DescriptionEditor({
  guideId,
  placeId,
  initial,
  author,
  credited,
}: {
  guideId: string;
  placeId: string;
  initial: string;
  /** Someone else wrote the current words (a copied place). */
  author?: string | null;
  /** Others' notes are shown above: the empty button says "Add your own note". */
  credited?: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState(initial);
  const [by, setBy] = useState(author ?? null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const open = () => {
      setDraft(note);
      setEditing(true);
      box.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    window.addEventListener(EDIT_DESCRIPTION_EVENT, open);
    return () => window.removeEventListener(EDIT_DESCRIPTION_EVENT, open);
  }, [note]);

  const save = async () => {
    const next = draft.trim();
    if (next === note.trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updatePlace(guideId, placeId, { note: next });
      setNote(next);
      setBy(null);
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(errorText(e, "Couldn't save the description."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={box} className="scroll-mt-24">
      {editing ? (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted">Description – what makes it special</p>
          <Textarea rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus placeholder="Why you love it, in your own words" />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Spinner /> : null} Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
          {error && <p className="text-[12px] text-danger">{error}</p>}
        </div>
      ) : note.trim() ? (
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted">Description – what makes it special</p>
            <button
              type="button"
              onClick={() => {
                setDraft(note);
                setEditing(true);
              }}
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-terracotta"
            >
              <EditIcon size={13} /> Edit
            </button>
          </div>
          <p className="text-[14px] italic leading-relaxed whitespace-pre-line">
            {note}
            {by && <span className="not-italic text-[11.5px] text-ink-faint"> — @{by}</span>}
          </p>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setDraft("");
            setEditing(true);
          }}
        >
          {credited ? "Add your own note" : "Add a description – what makes it special"}
        </Button>
      )}
    </div>
  );
}
