import Link from "next/link";
import { AppShell, TopBar } from "@/components/AppShell";
import { EmptyState, LinkButton } from "@/components/ui";
import { requireUser, toPublicUser } from "@/lib/auth";
import { creatorStats } from "@/lib/stats";

export const dynamic = "force-dynamic";
export const metadata = { title: "Guide stats" };

export default async function StatsPage() {
  const user = await requireUser("/stats");
  const stats = await creatorStats(user.id);
  const published = stats.filter((s) => s.published);
  const total = (k: "views" | "viewers" | "favourites" | "copies" | "taps" | "guideSaves") => published.reduce((a, s) => a + s[k], 0);
  return (
    <AppShell>
      <TopBar back={`/u/${user.username}`} title="Guide stats" avatarUser={toPublicUser(user)} />
      <div className="px-4 pt-4 pb-8 flex flex-col gap-5">
        {published.length === 0 ? (
          <EmptyState title="No published guides yet" body="Publish a guide and you'll see who's reading it, what they save and where they go." action={<LinkButton href="/create" size="sm">Create a guide</LinkButton>} />
        ) : (
          <>
            <p className="px-1 text-[12.5px] text-ink-muted">How other people use your guides. Your own visits aren&apos;t counted.</p>
            <div className="grid grid-cols-3 gap-2">
              <Tile label="Views" value={total("views")} />
              <Tile label="Readers" value={total("viewers")} />
              <Tile label="Favourites" value={total("favourites")} />
              <Tile label="Taps out" value={total("taps")} hint="Directions, call, website, booking" />
              <Tile label="Copies" value={total("copies")} hint="People who used your guide" />
              <Tile label="Guide saves" value={total("guideSaves")} hint="People who saved a whole guide" />
            </div>
            <ul className="flex flex-col gap-3">
              {published.map((s) => (
                <li key={s.id} className="rounded-2xl border border-line bg-paper p-4">
                  <Link href={`/g/${s.slug}`} className="font-display text-[20px] leading-tight hover:text-terracotta">{s.title}</Link>
                  <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                    <Mini label="views" value={s.views} sub={s.views7d ? `${s.views7d} this week` : undefined} />
                    <Mini label="readers" value={s.viewers} />
                    <Mini label="favourites" value={s.favourites} />
                    <Mini label="taps out" value={s.taps} />
                  </div>
                  <div className="mt-2 text-[11.5px] text-ink-muted">
                    {s.guideSaves} saved the guide · {s.placeViews} place views · {s.shares} shares · {s.copies} copies · {s.loved} “loved it”
                  </div>
                  {s.topPlaces.length > 0 && (
                    <div className="mt-2 text-[12px]">
                      <span className="text-ink-muted">Most popular: </span>
                      {s.topPlaces.map((p) => p.name).join(", ")}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Tile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-paper px-3 py-2.5" title={hint}>
      <div className="font-display text-[26px] leading-none tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] text-ink-muted">{label}</div>
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div>
      <div className="text-[17px] font-semibold tabular-nums">{value}</div>
      <div className="text-[10.5px] text-ink-muted">{label}</div>
      {sub && <div className="text-[10px] text-sage">{sub}</div>}
    </div>
  );
}
