import Link from "next/link";
import type { CreditedNote } from "@/lib/reuse";
import { AudioClip } from "./AudioClip";
import { LockIcon, SparkleIcon } from "./Icons";
import { cx } from "./ui";

/**
 * The original creator's note and tips on a copied place: their words, their name, read-only,
 * shown live from their guide. "compact" for list rows, full for the place page and editor.
 */
export function CreditedNotes({ notes, compact, locked, className }: { notes?: CreditedNote[]; compact?: boolean; locked?: boolean; className?: string }) {
  if (!notes?.length) return null;
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      {notes.map((n) =>
        compact ? (
          <div key={n.sourcePlaceId} className="text-[12.5px] leading-[1.45] text-ink-muted">
            {n.note.trim() && (
              <p className="whitespace-pre-line italic line-clamp-3">
                <span className="not-italic font-semibold text-ink">@{n.author.username}:</span> {n.note}
              </p>
            )}
            {n.tips.length > 0 && (
              <p className="mt-1 inline-flex items-start gap-1.5 rounded-xl bg-terracotta-tint/70 px-2.5 py-1.5 text-[12px] text-ink not-italic">
                <SparkleIcon size={12} className="text-terracotta mt-[2px] shrink-0" />
                <span className="line-clamp-2">
                  {n.tips[0]}
                  <span className="text-ink-muted"> — @{n.author.username}{n.tips.length > 1 ? ` · +${n.tips.length - 1} more` : ""}</span>
                </span>
              </p>
            )}
          </div>
        ) : (
          <div key={n.sourcePlaceId} className="rounded-2xl border border-line bg-cream-deep/40 px-4 py-3">
            <p className="text-[11.5px] font-semibold text-ink-muted flex items-center gap-1.5">
              {locked && <LockIcon size={11} />}
              <span className="min-w-0 truncate">
                From <Link href={`/u/${n.author.username}`} className="text-ink hover:text-terracotta">@{n.author.username}</Link>&apos;s{" "}
                <Link href={`/g/${n.guideSlug}/p/${n.sourcePlaceId}`} className="underline underline-offset-2 hover:text-terracotta">{n.guideTitle}</Link>
              </span>
            </p>
            {n.note.trim() && <p className="mt-1.5 text-[14px] italic leading-relaxed whitespace-pre-line">{n.note}</p>}
            {n.clipMediaId && <div className="mt-1.5"><AudioClip mediaId={n.clipMediaId} label={`@${n.author.username}'s voice note`} /></div>}
            {n.tips.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {n.tips.map((t, i) => (
                  <li key={i} className="text-[13px] leading-relaxed flex gap-2">
                    <SparkleIcon size={12} className="text-terracotta mt-[5px] shrink-0" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            )}
            {locked && <p className="mt-2 text-[11px] text-ink-faint">Their words stay theirs — add your own note below.</p>}
          </div>
        ),
      )}
    </div>
  );
}
