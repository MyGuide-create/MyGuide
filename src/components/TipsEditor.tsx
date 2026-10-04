"use client";

import { useState } from "react";
import type { PlaceTip } from "@/lib/db/schema";
import { addPlaceTip, removePlaceTip, updatePlaceTip } from "@/lib/actions/guides";
import { CheckIcon, EditIcon, SparkleIcon, TrashIcon, XIcon } from "./Icons";
import { Button, Label, Spinner, Textarea } from "./ui";

/**
 * As-many-as-you-want expert tips for a place: add, inline-edit, remove.
 * Used both in the guide editor and (for the owner) directly on the place page.
 */
export function TipsEditor({
  guideId,
  placeId,
  initial,
  variant = "form",
}: {
  guideId: string;
  placeId: string;
  initial: PlaceTip[];
  /** "form" (default): bare label above an add box, for the guide editor. "card": terracotta callout with heading, for the place page. */
  variant?: "form" | "card";
}) {
  const [tips, setTips] = useState(initial);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    const body = draft.trim();
    if (!body) return;
    setAdding(true);
    setError(null);
    try {
      const tip = await addPlaceTip(guideId, placeId, body);
      setTips((ts) => [...ts, tip]);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that tip.");
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (t: PlaceTip) => {
    setEditingId(t.id);
    setEditText(t.body);
  };

  const saveEdit = async (id: string) => {
    const body = editText.trim();
    if (!body) return;
    const prev = tips;
    setTips((ts) => ts.map((t) => (t.id === id ? { ...t, body } : t)));
    setEditingId(null);
    try {
      await updatePlaceTip(guideId, id, body);
    } catch (e) {
      setTips(prev);
      setError(e instanceof Error ? e.message : "Couldn't save that tip.");
    }
  };

  const remove = async (id: string) => {
    const prev = tips;
    setTips((ts) => ts.filter((t) => t.id !== id));
    try {
      await removePlaceTip(guideId, id);
    } catch (e) {
      setTips(prev);
      setError(e instanceof Error ? e.message : "Couldn't remove that tip.");
    }
  };

  const isCard = variant === "card";

  return (
    <div className={isCard ? "rounded-2xl bg-terracotta-tint px-4 py-3.5" : undefined}>
      {isCard ? (
        <p className="text-[11.5px] font-semibold text-terracotta-deep inline-flex items-center gap-1.5 mb-1.5">
          <SparkleIcon size={13} /> Expert tip{tips.length === 1 ? "" : "s"}
        </p>
      ) : (
        <Label>Expert tips</Label>
      )}
      {tips.length > 0 && (
        <ul className="flex flex-col gap-1.5 mb-2">
          {tips.map((t) => (
            <li key={t.id} className={isCard ? "flex items-start gap-2 rounded-2xl bg-paper/70 px-3 py-2" : "flex items-start gap-2 rounded-2xl bg-cream px-3 py-2"}>
              {editingId === t.id ? (
                <>
                  <input
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); void saveEdit(t.id); }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                    className="flex-1 min-w-0 rounded-full border border-line bg-paper px-2.5 py-1 text-[12.5px] outline-none focus:border-terracotta-soft"
                  />
                  <button type="button" aria-label="Save tip" onClick={() => saveEdit(t.id)} className="text-terracotta shrink-0 w-8 h-8 -my-1 flex items-center justify-center"><CheckIcon size={17} /></button>
                  <button type="button" aria-label="Cancel edit" onClick={() => setEditingId(null)} className="text-ink-muted shrink-0 w-8 h-8 -my-1 flex items-center justify-center"><XIcon size={17} /></button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-[12.5px] leading-snug">{t.body}</span>
                  <button type="button" aria-label="Edit tip" onClick={() => startEdit(t)} className="text-ink-muted hover:text-terracotta shrink-0 w-8 h-8 -my-1 flex items-center justify-center"><EditIcon size={16} /></button>
                  <button type="button" aria-label="Remove tip" onClick={() => remove(t.id)} className="text-ink-muted hover:text-danger shrink-0 w-8 h-8 -my-1 flex items-center justify-center"><TrashIcon size={17} /></button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-start gap-2">
        <Textarea
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What to order, where to sit, best time to go…"
          className="flex-1"
        />
        <Button type="button" size="sm" variant="outline" disabled={adding || !draft.trim()} onClick={add} className="shrink-0">
          {adding ? <Spinner /> : "Add"}
        </Button>
      </div>
      {!isCard && <p className="mt-1 text-[10.5px] text-ink-faint">Add as many as you want.</p>}
      {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
    </div>
  );
}
