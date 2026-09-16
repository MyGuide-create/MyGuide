"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GuideDetail } from "@/lib/guides";
import { forkGuide } from "@/lib/actions/guides";
import { timeAgo } from "@/lib/utils";
import { FollowButton } from "./FollowButton";
import { GuideCover } from "./GuideCover";
import { GuideMap } from "./GuideMap";
import { EditIcon, ForkIcon, ListIcon, LockIcon, MapIcon, ShareIcon } from "./Icons";
import { PlaceRow } from "./PlaceRow";
import { ShareSheet } from "./ShareSheet";
import { Avatar, Button, Chip, LinkButton, Spinner, Tag, cx } from "./ui";

export function GuideView({ detail, viewerId, shareUrl, shareKey }: { detail: GuideDetail; viewerId: string | null; shareUrl: string; shareKey?: string | null }) {
  const { guide, owner, places, noteAuthors, forkedFrom } = detail;
  const [mode, setMode] = useState<"list" | "map">("list");
  const [category, setCategory] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [flags, setFlags] = useState<Record<string, string>>({});
  const [forking, startFork] = useTransition();
  const [forkError, setForkError] = useState<string | null>(null);
  const router = useRouter();

  const categories = [...new Set(places.map((p) => p.category))];
  const visible = category ? places.filter((p) => p.category === category) : places;
  const isDraft = !guide.publishedAt;

  // Stretch feature: re-check business status on view (owner only, live Maps key only).
  useEffect(() => {
    if (!detail.viewerCanEdit) return;
    fetch("/api/places/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ guideId: guide.id }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { flagged?: Array<{ id: string; status: string }> } | null) => {
        if (d?.flagged?.length) setFlags(Object.fromEntries(d.flagged.map((f) => [f.id, f.status])));
      })
      .catch(() => {});
  }, [detail.viewerCanEdit, guide.id]);

  const fork = () => {
    setForkError(null);
    startFork(async () => {
      try {
        const slug = await forkGuide(guide.id, shareKey);
        router.push(`/g/${slug}/edit?forked=1`);
      } catch (e) {
        setForkError(e instanceof Error ? e.message : "Couldn't fork this guide.");
      }
    });
  };

  return (
    <>
      <GuideCover guide={guide} ownerUsername={owner.username} className="aspect-[390/220]" bare />

      <div className="px-5 pt-[18px]">
        <h1 className="font-display text-[34px] leading-[1.05]">{guide.title}</h1>
        <div className="mt-1.5 text-[12.5px] text-ink-muted flex flex-wrap items-center gap-x-1.5">
          {[guide.city, guide.country].filter(Boolean).join(", ") && <span>{[guide.city, guide.country].filter(Boolean).join(", ")} ·</span>}
          <span>{places.length} place{places.length === 1 ? "" : "s"}</span>
          <span>·</span>
          <span>{isDraft ? "Not published yet" : `Updated ${timeAgo(guide.updatedAt)}`}</span>
        </div>

        <div className="mt-4 flex items-center gap-2.5">
          <Link href={`/u/${owner.username}`}><Avatar user={owner} size={36} /></Link>
          <div className="flex-1 min-w-0 text-[13.5px] font-medium truncate">
            Guide by <Link href={`/u/${owner.username}`} className="hover:underline">{owner.displayName}</Link>
          </div>
          {detail.viewerCanEdit ? (
            <LinkButton href={`/g/${guide.slug}/edit`} size="sm" variant="outline"><EditIcon size={14} /> Edit</LinkButton>
          ) : (
            <FollowButton userId={owner.id} initial={detail.viewerIsFollowing} next={`/g/${guide.slug}`} />
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {guide.visibility === "private" && <Tag tone="warn"><LockIcon size={11} /> Private{isDraft ? " draft" : ""}</Tag>}
          {forkedFrom && (
            <Link href={`/u/${forkedFrom.username}`}>
              <Tag tone="sage"><ForkIcon size={11} /> based on @{forkedFrom.username}&apos;s guide</Tag>
            </Link>
          )}
          {!guide.allowFork && <Tag>Forking off</Tag>}
        </div>

        {guide.description && <p className="mt-3.5 text-[13.5px] leading-[1.5] italic">{guide.description}</p>}

        <div className="mt-4 flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setSharing(true)} className="flex-1"><ShareIcon size={15} /> Share</Button>
          {detail.viewerCanFork && (
            <Button size="sm" variant="outline" onClick={fork} disabled={forking} className="flex-1">
              {forking ? <Spinner /> : <ForkIcon size={15} />} Use this guide
            </Button>
          )}
          {!viewerId && guide.allowFork && (
            <LinkButton href={`/login?next=${encodeURIComponent(`/g/${guide.slug}${shareKey ? `?key=${shareKey}` : ""}`)}`} size="sm" variant="outline" className="flex-1"><ForkIcon size={15} /> Use this guide</LinkButton>
          )}
          <div className="flex rounded-full border border-line p-0.5">
            <button type="button" aria-label="List view" onClick={() => setMode("list")} className={cx("w-9 h-8 rounded-full flex items-center justify-center", mode === "list" ? "bg-ink text-cream" : "text-ink-muted")}><ListIcon size={17} /></button>
            <button type="button" aria-label="Map view" onClick={() => setMode("map")} className={cx("w-9 h-8 rounded-full flex items-center justify-center", mode === "map" ? "bg-ink text-cream" : "text-ink-muted")}><MapIcon size={17} /></button>
          </div>
        </div>
        {forkError && <p className="mt-2 text-[12.5px] text-danger">{forkError}</p>}

        {categories.length > 1 && (
          <div className="mt-[18px] -mx-5 px-5 flex gap-2 overflow-x-auto no-scrollbar">
            <Chip active={!category} onClick={() => setCategory(null)}>All</Chip>
            {categories.map((c) => (
              <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? null : c)}>{c}</Chip>
            ))}
          </div>
        )}
      </div>

      {mode === "map" ? (
        <div className="px-4 mt-4">
          <GuideMap
            places={visible.map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, category: p.category, note: p.note }))}
            height="min(58dvh, 520px)"
            onSelect={(id) => {
              setMode("list");
              setTimeout(() => document.getElementById(`place-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
            }}
          />
          <ol className="mt-3 flex flex-col gap-1.5 text-[12.5px]">
            {visible.map((p, i) => (
              <li key={p.id} className="flex gap-2"><span className="w-5 text-ink-faint tabular-nums">{i + 1}.</span><span className="font-medium">{p.name}</span></li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="px-5 mt-4 flex flex-col gap-[18px] pb-6">
          {visible.length === 0 && <p className="text-[13.5px] text-ink-muted">No places yet.</p>}
          {visible.map((p, i) => (
            <PlaceRow key={p.id} place={p} index={i} ownerId={guide.ownerId} noteAuthor={p.noteAuthorId ? noteAuthors[p.noteAuthorId] : null} flagged={flags[p.id]} expanded />
          ))}
        </div>
      )}

      {sharing && (
        <ShareSheet
          guideId={guide.id}
          shareUrl={shareUrl}
          isPrivate={guide.visibility === "private"}
          isOwner={detail.viewerCanEdit}
          sharedWith={detail.sharedWith}
          onClose={() => setSharing(false)}
        />
      )}
    </>
  );
}
