"use client";

import { useState } from "react";
import { AudioClip } from "./AudioClip";
import { SparkleIcon, TrashIcon } from "./Icons";
import { Button, Spinner, Textarea } from "./ui";

/**
 * "My Recommendation" editor: type the note (phones' own keyboard dictation works too).
 * In-app voice recording was removed on 8 Oct 2026; older notes keep their voice clip,
 * which can still be played or removed here.
 */
export function NoteEditor({
  placeName,
  note,
  clipMediaId,
  onSave,
}: {
  placeName: string;
  note: string;
  clipMediaId: string | null;
  onSave: (patch: { note?: string; noteClipMediaId?: string | null }) => Promise<void>;
}) {
  const [text, setText] = useState(note);
  const [clip, setClip] = useState<string | null>(clipMediaId);
  const [saving, setSaving] = useState(false);
  const [polishing, setPolishing] = useState(false);
  /** The note as it was before "Tidy up", so it can be put back. */
  const [beforeTidy, setBeforeTidy] = useState<string | null>(null);
  const dirty = text !== note;

  const save = async (override?: string) => {
    const value = (override ?? text).trim();
    setSaving(true);
    try {
      await onSave({ note: value });
    } finally {
      setSaving(false);
    }
  };

  const polish = async () => {
    if (!text.trim()) return;
    setPolishing(true);
    try {
      const res = await fetch("/api/ai/polish-note", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: text, placeName }) });
      const data = (await res.json()) as { note: string };
      if (data.note && data.note !== text) {
        setBeforeTidy(text);
        setText(data.note);
        await save(data.note);
      }
    } finally {
      setPolishing(false);
    }
  };

  const removeClip = async () => {
    setClip(null);
    await onSave({ noteClipMediaId: null });
  };

  return (
    <div>
      <Textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setBeforeTidy(null); }}
        onBlur={() => { if (dirty) void save(); }}
        rows={3}
        placeholder={`Why ${placeName}? What should a friend order, when should they go…`}
      />
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="ghost" onClick={polish} disabled={polishing || !text.trim()} className="border border-line">
          {polishing ? <Spinner /> : <SparkleIcon size={14} />} Tidy up
        </Button>
        {beforeTidy !== null && (
          <button
            type="button"
            onClick={async () => {
              const prev = beforeTidy;
              setBeforeTidy(null);
              setText(prev);
              await save(prev);
            }}
            className="text-[12px] font-medium text-terracotta underline underline-offset-2"
          >
            Undo tidy
          </button>
        )}
        {dirty && (
          <Button size="sm" variant="secondary" onClick={() => save()} disabled={saving}>{saving ? <Spinner /> : "Save note"}</Button>
        )}
        {clip && (
          <span className="inline-flex items-center gap-2">
            <AudioClip mediaId={clip} />
            <button type="button" onClick={removeClip} aria-label="Remove voice clip" className="text-ink-muted hover:text-danger w-8 h-8 flex items-center justify-center"><TrashIcon size={17} /></button>
          </span>
        )}
      </div>
    </div>
  );
}
