import Link from "next/link";
import { BeenHere } from "./BeenHere";
import { ClapBar } from "./ClapBar";
import { FollowPill } from "./FollowPill";
import { GuideCover } from "./GuideCover";
import { ChatIcon, HeartIcon } from "./Icons";
import { PlaceTile } from "./PlaceTile";
import { SaveButton } from "./SaveButton";
import { Avatar } from "./ui";
import type { PublicUser } from "@/lib/auth";
import { spotKey } from "@/lib/citySpots";
import type { ClapFace } from "@/lib/clapTargets";
import type { Discovery, DiscoveryEvent } from "@/lib/discoveries";
import { findCity } from "@/lib/places/cities";
import { placeArea } from "@/lib/places/neighbourhood";
import { timeAgo } from "@/lib/utils";

export interface DiscoveryContext {
  viewerId?: string;
  signedIn: boolean;
  me?: ClapFace;
  following: Set<string>;
  savedIds: Set<string>;
  /** Spot keys of every place you have. */
  ownKeys: Set<string>;
  commentCounts: Map<string, number>;
  firstHeart: boolean;
}

const first = (u: { displayName: string }) => u.displayName.split(" ")[0];

/** "You", "Shaz", "Shaz and Lina", "Shaz and 2 others". */
function names(people: PublicUser[], viewerId?: string): string {
  const n = people.map((p) => (p.id === viewerId ? "You" : first(p)));
  if (n.length <= 1) return n[0] ?? "";
  if (n.length === 2) return `${n[0]} and ${n[1]}`;
  return `${n[0]} and ${n.length - 1} others`;
}

/** Why it's here beyond who made it: "Shaz commented · Shaz and 2 others liked this". */
function reasonLine(events: DiscoveryEvent[]): string {
  const of = (verb: DiscoveryEvent["verb"]) => events.filter((e) => e.verb === verb).map((e) => e.actor);
  const commenters = of("commented");
  const likers = of("liked");
  return [commenters.length ? `${names(commenters)} commented` : "", likers.length ? `${names(likers)} liked this` : ""].filter(Boolean).join(" · ");
}

function Reason({ events }: { events: DiscoveryEvent[] }) {
  const line = reasonLine(events);
  if (!line) return null;
  const liked = events.some((e) => e.verb === "liked");
  return (
    <p className="-mx-3.5 -mt-0.5 px-3.5 pb-2.5 border-b border-line/70 flex items-center gap-1.5 text-[12.5px] text-ink-muted">
      {liked ? <HeartIcon size={14} filled className="text-terracotta shrink-0" /> : <ChatIcon size={14} className="shrink-0" />}
      <span className="min-w-0 truncate">{line}</span>
    </p>
  );
}

/** The reason line already names every heart, so the faces line would only repeat it. */
const heartsNamed = (d: Discovery) => {
  const likers = d.events.filter((e) => e.verb === "liked").length;
  return likers > 0 && !d.claps.mine && d.claps.count === likers;
};

/** One Discoveries card: a spot or a guide, with who brought it here and the usual action row. */
export function DiscoveryCard({ d, ctx }: { d: Discovery; ctx: DiscoveryContext }) {
  const { viewerId, signedIn } = ctx;
  const followable = (u: PublicUser) => signedIn && u.id !== viewerId && !ctx.following.has(u.id);

  if (d.kind === "guide") {
    const g = d.card;
    return (
      <div className="rounded-2xl border border-line/80 bg-paper overflow-hidden">
        {reasonLine(d.events) && (
          <div className="px-3.5 pt-3">
            <Reason events={d.events} />
          </div>
        )}
        <Link href={`/g/${g.guide.slug}`} className="relative block">
          <GuideCover guide={g.guide} ownerUsername={g.owner.username} bare thumb className="h-[110px]" />
          <span className="absolute left-2.5 bottom-2.5 rounded-full bg-paper/95 px-2.5 py-1 text-[12px] font-semibold">
            Guide · {g.placeCount} place{g.placeCount === 1 ? "" : "s"}
          </span>
        </Link>
        <span className="flex items-center gap-2.5 px-3.5 py-3">
          <Link href={`/u/${g.owner.username}`} aria-label={`${g.owner.displayName}'s profile`} className="shrink-0"><Avatar user={g.owner} size={32} /></Link>
          <span className="flex-1 min-w-0 text-[13.5px] leading-snug">
            <Link href={`/u/${g.owner.username}`} className="font-semibold">{g.owner.id === viewerId ? "You" : first(g.owner)}</Link>{" "}
            <Link href={`/g/${g.guide.slug}`}>
              published <b className="font-semibold">{g.guide.title}</b>
              <span className="block text-[12px] text-ink-muted">{[g.guide.city, timeAgo(d.at)].filter(Boolean).join(" · ")}</span>
            </Link>
          </span>
          {followable(g.owner) && <FollowPill userId={g.owner.id} signedIn={signedIn} next="/" />}
        </span>
        <div className="px-3.5 pb-3 -mt-0.5">
          <ClapBar kind="guide" target={g.guide.id} ownerId={g.owner.id} ownerName={first(g.owner)} initial={d.claps} signedIn={signedIn} own={viewerId === g.owner.id} me={ctx.me} firstHeart={ctx.firstHeart} hideProof={heartsNamed(d)} share={{ path: `/g/${g.guide.slug}`, title: g.guide.title }} />
        </div>
      </div>
    );
  }

  const r = d.lead;
  const own = viewerId === r.owner.id;
  const yours = ctx.ownKeys.has(spotKey(r.place));
  const vouched = d.events.some((e) => e.verb === "vouched");
  const people = d.vouchers.length ? d.vouchers : [r.owner];
  const lead = people[0];
  const plural = people.length > 1 || lead.id === viewerId;
  const verb = vouched ? "vouched for" : plural ? "vouch for" : "vouches for";
  // "in Copenhagen, Denmark": the country spelled out, skipped for city-states.
  const country = d.city ? findCity(d.city)?.country || (r.place.country.length > 3 ? r.place.country : "") : "";
  const where = country && country.toLowerCase() !== d.city.toLowerCase() ? `${d.city}, ${country}` : d.city;
  const placeHref = `/g/${r.guide.slug}/p/${r.place.id}`;
  return (
    <div className="rounded-2xl border border-line/80 bg-paper p-3.5 flex flex-col gap-2.5">
      <Reason events={d.events} />
      <span className="flex items-center gap-2.5">
        <Link href={`/u/${lead.username}`} aria-label={`${lead.displayName}'s profile`} className="shrink-0"><Avatar user={lead} size={32} /></Link>
        <span className="flex-1 min-w-0 text-[13.5px] leading-snug">
          <Link href={`/u/${lead.username}`} className="font-semibold">{names(people, viewerId)}</Link>{" "}
          <Link href={placeHref}>
            {verb} a spot{d.city ? <> in <b className="font-semibold">{where}</b></> : null}
            <span className="block text-[12px] text-ink-muted">{timeAgo(d.at)}</span>
          </Link>
        </span>
        {people.length === 1 && followable(lead) && <FollowPill userId={lead.id} signedIn={signedIn} next="/" />}
      </span>
      <Link href={placeHref} className="flex gap-3 rounded-xl bg-cream-deep/40 p-2.5">
        <PlaceTile place={r.place} size={60} />
        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="font-semibold text-[15px] leading-snug">{r.place.name}</span>
          <span className="text-[12.5px] text-ink-muted truncate">{[r.place.category, placeArea(r.place)].filter(Boolean).join(" · ")}</span>
          {r.tip && <span className="text-[13px] leading-snug text-ink/85 line-clamp-2">&ldquo;{r.tip}&rdquo;{r.owner.id !== lead.id || people.length > 1 ? <span className="text-ink-muted"> — {r.owner.id === viewerId ? "you" : first(r.owner)}</span> : null}</span>}
        </span>
      </Link>
      <ClapBar
        kind="place"
        target={r.place.id}
        ownerId={r.owner.id}
        ownerName={first(r.owner)}
        city={d.city}
        initial={d.claps}
        signedIn={signedIn}
        own={own}
        me={ctx.me}
        firstHeart={ctx.firstHeart}
        hideProof={heartsNamed(d)}
        alsoTargets={d.legacyTargets}
        comments={{ count: ctx.commentCounts.get(r.place.id) ?? 0, href: `${placeHref}#comments` }}
        recommend={
          own
            ? undefined
            : yours
              ? <span className="inline-flex items-center gap-1 h-8 rounded-full bg-sage-tint px-3 text-[12.5px] font-semibold text-sage whitespace-nowrap">✓ In your list</span>
              : <BeenHere variant="bar" placeId={r.place.id} placeName={r.place.name} ownerFirst={first(r.owner)} signedIn={signedIn} youHaveIt={false} />
        }
        share={{ path: placeHref, title: r.place.name }}
        save={!own && !yours ? <SaveButton placeId={r.place.id} initial={ctx.savedIds.has(r.place.id)} signedIn={signedIn} city={d.city || undefined} /> : undefined}
      />
    </div>
  );
}
