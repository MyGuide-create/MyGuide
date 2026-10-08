"use client";

import { useRef, useState } from "react";
import { errorText } from "@/lib/errorText";
import { resizeImage, uploadMedia } from "@/hooks/useRecorder";
import { CameraIcon } from "./Icons";
import { Spinner, cx } from "./ui";

/** Pick a photo from the library (or camera on phones), downscale it, upload it. */
export function PhotoPicker({ onUploaded, label = "Add photo", className, children }: { onUploaded: (mediaId: string) => void | Promise<void>; label?: string; className?: string; children?: React.ReactNode }) {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          setError(null);
          try {
            const blob = await resizeImage(file);
            const up = await uploadMedia(blob, "photo.jpg");
            await onUploaded(up.id);
          } catch (err) {
            setError(errorText(err, "That photo didn't upload."));
          } finally {
            setBusy(false);
          }
        }}
      />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className={cx("inline-flex items-center gap-1.5", className)} aria-label={label}>
        {busy ? <Spinner /> : children ?? <><CameraIcon size={15} /> {label}</>}
      </button>
      {error && <span className="text-[11.5px] text-danger">{error}</span>}
    </>
  );
}
