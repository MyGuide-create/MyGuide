import Link from "next/link";
import type { GuideCard as GuideCardData } from "@/lib/guides";
import { timeAgo } from "@/lib/utils";
import { GuideCover } from "./GuideCover";
import { ForkIcon, LockIcon } from "./Icons";
import { Avatar, Tag, cx } from "./ui";

export function GuideCard({ data, showOwner = true }: { data: GuideCardData; showOwner?: boolean }) {
  const { guide, owner, placeCount, categories, forkedFrom } = data;
  const isDraft = !guide.publishedAt;
  const hasPhoto = !!(guide.coverMediaId || guide.coverUrl);
  return (
    <article className="fade-up rounded-[22px] bg-paper border border-line/80 overflow-hidden shadow-[0_1px_2px_oklch(22%_0.02_60/0.04)]">
      <Link href={`/g/${guide.slug}`} className="block">
        <GuideCover guide={guide} ownerUsername={owner.username} className="aspect-[16/9]" />
      </Link>
      <div className="px-4 pt-3 pb-4">
        <div className="flex items-start gap-3">
          {showOwner && (
            <Link href={`/u/${owner.username}`} className="shrink-0 mt-0.5">
              <Avatar user={owner} size={34} />
            </Link>
          )}
          <div className="min-w-0 flex-1">
            {hasPhoto ? (
              <Link href={`/g/${guide.slug}`} className="font-display text-[22px] leading-[1.05] block truncate">
                {guide.title}
              </Link>
            ) : (
              <Link href={`/g/${guide.slug}`} className="sr-only">{guide.title}</Link>
            )}
            <div className={cx("text-[12.5px] text-ink-muted flex flex-wrap items-center gap-x-1.5", hasPhoto ? "mt-1" : "mt-1.5")}>
              {showOwner && (
                <>
                  <Link href={`/u/${owner.username}`} className="font-medium text-ink hover:underline">
                    {owner.displayName}
                  </Link>
                  <span>·</span>
                </>
              )}
              <span>{placeCount} place{placeCount === 1 ? "" : "s"}</span>
              <span>·</span>
              <span>{isDraft ? "Draft" : `Updated ${timeAgo(guide.updatedAt)}`}</span>
            </div>
          </div>
        </div>
        {guide.description && <p className="mt-2.5 text-[13.5px] italic leading-relaxed text-ink line-clamp-2">{guide.description}</p>}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {guide.visibility === "private" && (
            <Tag tone="warn"><LockIcon size={11} /> Private</Tag>
          )}
          {forkedFrom && (
            <Tag tone="sage"><ForkIcon size={11} /> based on @{forkedFrom.username}</Tag>
          )}
          {categories.slice(0, 3).map((c) => (
            <Tag key={c}>{c}</Tag>
          ))}
          {categories.length > 3 && <Tag>+{categories.length - 3}</Tag>}
        </div>
      </div>
    </article>
  );
}
