import Link from "next/link";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { AppShell, Wordmark } from "@/components/AppShell";
import { AskActions } from "@/components/AskActions";
import { AskForGuideButton } from "@/components/AskForGuide";
import { CheckIcon, SparkleIcon } from "@/components/Icons";
import { Avatar, LinkButton } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { guides } from "@/lib/db/schema";
import { claimRequest, getRequestByToken, STATUS_LABEL, type RequestStatus } from "@/lib/requests";

export const dynamic = "force-dynamic";
export const metadata = { title: "A guide request" };

/**
 * Where an ask lands — the WhatsApp link, or "Hisham asked you for a Tashkent guide" in Activity.
 * Signed out: who's asking and one button that signs you up straight into making the guide.
 * Signed in: make the guide, send one you've already made, or say you can't help.
 */
export default async function AskPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await getRequestByToken(token);
  const viewer = await getCurrentUser();

  if (!found) {
    return (
      <AppShell nav={!!viewer}>
        <div className="px-6 py-24 text-center">
          <p className="font-display text-[30px]">This ask isn’t here any more.</p>
          <p className="mt-2 text-[13.5px] text-ink-muted">The person who sent it may have removed it, or the link is cut short — ask them to send it again.</p>
          <div className="mt-6"><LinkButton href="/">Go to MyGuide</LinkButton></div>
        </div>
      </AppShell>
    );
  }

  const { requester } = found;
  const first = requester.displayName.split(" ")[0];
  const self = `/ask/${token}`;
  let req = found.req;

  // The asker opening their own link: where it stands, and a way to send it again.
  if (viewer?.id === requester.id) {
    return (
      <AppShell>
        <div className="px-6 pt-10 pb-10 flex flex-col gap-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-terracotta">Your ask</p>
          <h1 className="font-display text-[32px] leading-[1.05]">A {req.city} guide</h1>
          {req.note && <p className="text-[14px] italic text-ink-muted">“{req.note}”</p>}
          <p className="text-[14px]">Status: <b>{req.recipientId ? STATUS_LABEL[req.status as RequestStatus] : "not opened yet"}</b></p>
          <p className="text-[13px] text-ink-muted">This is the link your friend gets. Follow every ask on your wish list.</p>
          <div className="flex gap-2.5">
            <LinkButton href={`/u/${requester.username}#wishes`} variant="outline">Your wish list</LinkButton>
            <AskForGuideButton city={{ city: req.city, country: req.country, lat: req.lat, lng: req.lng }} label="Ask someone else" variant="primary" size="md" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (viewer) {
    const claimed = await claimRequest(req, viewer);
    if (!claimed) {
      return (
        <AppShell>
          <div className="px-6 py-24 text-center">
            <p className="font-display text-[28px]">This ask was for someone else.</p>
            <p className="mt-2 text-[13.5px] text-ink-muted">{first} sent it to another friend. Know {req.city} well? You can still make {first} a guide from their wish list.</p>
            <div className="mt-6"><LinkButton href={`/u/${requester.username}#wishes`}>See {first}’s wish list</LinkButton></div>
          </div>
        </AppShell>
      );
    }
    req = claimed;
  }

  const db = await getDb();
  const [guide, mine] = viewer
    ? await Promise.all([
        req.guideId ? db.query.guides.findFirst({ where: eq(guides.id, req.guideId) }) : Promise.resolve(undefined),
        db
          .select({ id: guides.id, title: guides.title })
          .from(guides)
          .where(and(eq(guides.ownerId, viewer.id), isNotNull(guides.publishedAt), sql`lower(${guides.city}) = ${req.city.toLowerCase()}`)),
      ])
    : [undefined, []];

  const makeHref = `/create?ask=${req.id}`;

  return (
    <AppShell nav={!!viewer}>
      <div className="px-6 pt-10 pb-12 flex flex-col">
        {!viewer && <Wordmark />}
        <div className={viewer ? "" : "mt-8"}>
          <div className="flex items-center gap-3">
            <Avatar user={requester} size={56} />
            <div className="min-w-0">
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-terracotta inline-flex items-center gap-1.5"><SparkleIcon size={12} /> Guide request</p>
              <p className="text-[15px] font-semibold truncate">{requester.displayName}</p>
            </div>
          </div>
          <h1 className="mt-5 font-display text-[32px] leading-[1.08]">
            {first} is going to {req.city} and asked for your recommendations.
          </h1>
          {req.note && <p className="mt-3 rounded-2xl bg-paper border border-line px-4 py-3 text-[14.5px] italic leading-relaxed">“{req.note}”</p>}
        </div>

        {!viewer ? (
          <div className="mt-7 flex flex-col gap-3">
            <p className="text-[14px] text-ink-muted leading-relaxed">
              MyGuide is where friends share the places they actually love. Make {first} a {req.city} guide — paste a list from Google Maps or WhatsApp, or add places one by one. It takes a few minutes, and {first} gets it the moment you publish.
            </p>
            <LinkButton href={`/signup?why=ask&next=${encodeURIComponent(self)}`} size="lg" className="mt-2">Make {first} a guide</LinkButton>
            <p className="text-center text-[13px] text-ink-muted">
              Already on MyGuide? <Link href={`/login?next=${encodeURIComponent(self)}`} className="font-semibold text-terracotta">Log in</Link>
            </p>
          </div>
        ) : req.status === "done" && guide ? (
          <div className="mt-7 rounded-2xl bg-sage-tint px-4 py-4 flex gap-3 items-start">
            <CheckIcon size={20} className="text-sage shrink-0 mt-0.5" />
            <div className="text-[14px] leading-snug">
              You sent {first} <Link href={`/g/${guide.slug}`} className="font-semibold underline underline-offset-2">{guide.title}</Link>. Thank you!
            </div>
          </div>
        ) : req.status === "making" && guide ? (
          <div className="mt-7 flex flex-col gap-3">
            <p className="text-[14px] text-ink-muted">You started <b className="text-ink">{guide.title}</b> for {first}. It’s sent to them as soon as you publish.</p>
            <LinkButton href={`/g/${guide.slug}/edit`} size="lg">Carry on with the guide</LinkButton>
          </div>
        ) : (
          <AskActions requestId={req.id} firstName={first} city={req.city} makeHref={makeHref} myGuides={mine} declined={req.status === "declined"} />
        )}
      </div>
    </AppShell>
  );
}
