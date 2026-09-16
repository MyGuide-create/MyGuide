"use client";

import { useEffect, useRef, useState } from "react";
import { useRecorder, uploadMedia } from "@/hooks/useRecorder";
import { useSpeech } from "@/hooks/useSpeech";
import { formatDuration } from "@/lib/utils";
import { AudioClip } from "./AudioClip";
import { MicIcon, SparkleIcon, StopIcon, TrashIcon } from "./Icons";
import { Button, Spinner, Textarea, cx } from "./ui";

/**
 * "My Recommendation" editor: type it, or dictate it. Dictation records the
 * raw clip *and* transcribes it, so both the words and the voice are kept.
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
  const [uploading, setUploading] = useState(false);
  const speech = useSpeech({ continuous: true });
  const recorder = useRecorder();
  const baseRef = useRef(note);
  const dirty = text !== note;

  // Stream the transcript into the textarea while dictating.
  useEffect(() => {
    if (!speech.listening && !speech.text) return;
    const live = [speech.text, speech.interim].filter(Boolean).join(" ").trim();
    if (live) setText((baseRef.current ? `${baseRef.current.trim()} ` : "") + live);
  }, [speech.text, speech.interim, speech.listening]);

  // When the recording stops, upload the clip and attach it.
  useEffect(() => {
    if (!recorder.clip) return;
    const c = recorder.clip;
    (async () => {
      setUploading(true);
      try {
        const ext = c.mime.includes("mp4") ? "m4a" : c.mime.includes("ogg") ? "ogg" : "webm";
        const up = await uploadMedia(c.blob, `note.${ext}`, c.durationSec);
        setClip(up.id);
        await onSave({ noteClipMediaId: up.id });
      } catch (e) {
        console.warn(e);
      } finally {
        setUploading(false);
        recorder.discard();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.clip]);

  const startDictation = async () => {
    baseRef.current = text;
    speech.reset();
    speech.start();
    if (recorder.supported) await recorder.start();
  };
  const stopDictation = async () => {
    speech.stop();
    recorder.stop();
    // Persist the transcript once recognition settles.
    setTimeout(() => void save(), 400);
  };

  const save = async (override?: string) => {
    const value = (override ?? text).trim();
    setSaving(true);
    try {
      await onSave({ note: value });
      baseRef.current = value;
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
      if (data.note) { setText(data.note); await save(data.note); }
    } finally {
      setPolishing(false);
    }
  };

  const removeClip = async () => {
    setClip(null);
    await onSave({ noteClipMediaId: null });
  };

  const active = speech.listening || recorder.recording;

  return (
    <div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (dirty && !active) void save(); }}
        rows={3}
        placeholder={`Why ${placeName}? What should a friend order, when should they go…`}
        className={cx(active && "border-terracotta ring-2 ring-terracotta/20")}
      />
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {active ? (
          <Button size="sm" variant="danger" onClick={stopDictation}>
            <StopIcon size={14} /> Stop {recorder.recording ? `· ${formatDuration(recorder.elapsed)}` : ""}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={startDictation} disabled={uploading}>
            <MicIcon size={14} /> Say it
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={polish} disabled={polishing || !text.trim() || active} className="border border-line">
          {polishing ? <Spinner /> : <SparkleIcon size={14} />} Tidy up
        </Button>
        {dirty && !active && (
          <Button size="sm" variant="secondary" onClick={() => save()} disabled={saving}>{saving ? <Spinner /> : "Save note"}</Button>
        )}
        {uploading && <span className="text-[11.5px] text-ink-muted inline-flex items-center gap-1"><Spinner /> Saving clip…</span>}
        {clip && !uploading && (
          <span className="inline-flex items-center gap-2">
            <AudioClip mediaId={clip} />
            <button type="button" onClick={removeClip} aria-label="Remove voice clip" className="text-ink-faint hover:text-danger"><TrashIcon size={13} /></button>
          </span>
        )}
      </div>
      {(speech.error || recorder.error) && <p className="mt-1.5 text-[11.5px] text-ink-muted">{speech.error ?? recorder.error}</p>}
      {active && speech.supported && <p className="mt-1.5 text-[11.5px] text-terracotta">Listening… speak naturally, then tap Stop.</p>}
      {active && !speech.supported && <p className="mt-1.5 text-[11.5px] text-terracotta">Recording your voice clip (live transcription isn&apos;t supported in this browser — type the note too).</p>}
    </div>
  );
}
