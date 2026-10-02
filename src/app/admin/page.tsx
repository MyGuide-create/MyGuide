import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell, TopBar } from "@/components/AppShell";
import { isAdmin } from "@/lib/admin";
import { requireUser, toPublicUser } from "@/lib/auth";
import { pilotStats } from "@/lib/stats";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pilot dashboard" };

export default async function AdminPage() {
  const user = await requireUser("/admin");
  if (!isAdmin(user)) notFound();
  const s = await pilotStats();
  const maxViews = Math.max(1, ...s.weekly.map((w) => w.views));
  return (
    <AppShell>
      <TopBar back="/me" title="Pilot dashboard" avatarUser={toPublicUser(user)} />
      <div className="px-4 pt-4 pb-10 flex flex-col gap-6">
        <section>
          <h2 className="px-1 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted mb-2">Last 7 days</h2>
          <div className="grid grid-cols-3 gap-2">
            <Tile label="Active members" value={s.activeUsers7d} />
            <Tile label="Visitors" value={s.visitors7d} hint="Signed-in + anonymous" />
            <Tile label="New sign-ups" value={s.newUsers7d} />
            <Tile label="Guide views" value={s.views7d} hint="Excludes creators' own" />
            <Tile label="Taps out" value={s.taps7d} hint="Directions, call, website, booking" />
            <Tile label="Shares" value={s.shares7d} />
          </div>
        </section>

        <section>
          <h2 className="px-1 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted mb-2">All time</h2>
          <div className="grid grid-cols-3 gap-2">
            <Tile label="Members" value={s.users} />
            <Tile label="Guides" value={s.guides} hint={`${s.publicGuides} public`} />
            <Tile label="Places" value={s.places} />
            <Tile label="Public guides" value={s.publicGuides} />
            <Tile label="Follows" value={s.follows} />
            <Tile label="Favourites" value={s.favourites} hint={`${s.savedGuides} whole guides saved`} />
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-paper p-4">
          <h2 className="text-[13px] font-semibold">Guide views per week</h2>
          <div className="mt-3 flex items-end gap-1.5 h-[120px]" role="img" aria-label="Guide views per week, last 8 weeks">
            {s.weekly.map((w) => (
              <div key={w.week} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <span className="text-[10px] text-ink-muted tabular-nums">{w.views}</span>
                <div className="w-full rounded-t-md bg-terracotta" style={{ height: `${Math.max(2, (w.views / maxViews) * 90)}%` }} title={`${w.views} views · ${w.visitors} visitors · ${w.signups} sign-ups`} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1.5">
            {s.weekly.map((w) => (
              <span key={w.week} className="flex-1 text-center text-[9.5px] text-ink-faint">{w.week}</span>
            ))}
          </div>
          <table className="mt-3 w-full text-[11.5px] tabular-nums">
            <thead className="text-ink-muted">
              <tr><th className="text-left font-normal">Week to</th><th className="text-right font-normal">Views</th><th className="text-right font-normal">Visitors</th><th className="text-right font-normal">Sign-ups</th></tr>
            </thead>
            <tbody>
              {s.weekly.map((w) => (
                <tr key={w.week}><td>{w.week}</td><td className="text-right">{w.views}</td><td className="text-right">{w.visitors}</td><td className="text-right">{w.signups}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        {s.topGuides.length > 0 && (
          <section>
            <h2 className="px-1 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted mb-2">Top guides this week</h2>
            <ol className="flex flex-col gap-1.5">
              {s.topGuides.map((g, i) => (
                <li key={g.slug} className="flex items-center gap-3 rounded-xl bg-paper border border-line/70 px-3 py-2 text-[13px]">
                  <span className="w-4 text-ink-faint tabular-nums">{i + 1}</span>
                  <Link href={`/g/${g.slug}`} className="flex-1 truncate font-medium hover:text-terracotta">{g.title}</Link>
                  <span className="tabular-nums text-ink-muted">{g.views}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section>
          <h2 className="px-1 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted mb-2">Feedback ({s.feedback.length})</h2>
          {s.feedback.length === 0 ? <p className="px-1 text-[12.5px] text-ink-faint">None yet.</p> : (
            <ul className="flex flex-col gap-2">
              {s.feedback.map((f) => (
                <li key={f.id} className="rounded-2xl bg-paper border border-line/70 px-3.5 py-2.5">
                  <p className="text-[13px] whitespace-pre-wrap">{f.message}</p>
                  <p className="mt-1 text-[11px] text-ink-faint">{f.who ?? "Signed out"} · {timeAgo(f.at)}{f.page ? ` · from ${f.page}` : ""}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="px-1 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted mb-2">Reports ({s.reports.length})</h2>
          {s.reports.length === 0 ? <p className="px-1 text-[12.5px] text-ink-faint">None yet.</p> : (
            <ul className="flex flex-col gap-2">
              {s.reports.map((r) => (
                <li key={r.id} className="rounded-2xl bg-danger-tint/40 border border-danger/30 px-3.5 py-2.5 text-[12.5px]">
                  <b>{r.reason}</b> · {r.targetType} <code className="text-[11px]">{r.targetId}</code>
                  {r.details && <p className="mt-1">{r.details}</p>}
                  <p className="mt-1 text-[11px] text-ink-faint">{r.who ?? "Signed out"} · {timeAgo(r.at)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Tile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-paper px-3 py-2.5" title={hint}>
      <div className="font-display text-[26px] leading-none tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] text-ink-muted leading-tight">{label}</div>
    </div>
  );
}
