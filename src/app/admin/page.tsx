import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell, TopBar } from "@/components/AppShell";
import { isAdmin } from "@/lib/admin";
import { requireUser, toPublicUser } from "@/lib/auth";
import { pilotStats } from "@/lib/stats";
import { timeAgo } from "@/lib/utils";
import { adminUsers, type AdminUserFilter } from "@/lib/adminUsers";
import { Avatar, cx } from "@/components/ui";
import { ResetPasswordButton } from "@/components/ResetPasswordButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const user = await requireUser("/admin");
  if (!isAdmin(user)) notFound();
  const sp = await searchParams;
  const tab = sp.tab === "users" ? "users" : "stats";
  const filter: AdminUserFilter = sp.filter === "new" || sp.filter === "never" ? sp.filter : "all";
  return (
    <AppShell>
      <TopBar back="/me" title="Admin" avatarUser={toPublicUser(user)} />
      <nav className="px-4 pt-3 flex gap-2" aria-label="Admin sections">
        <TabLink href="/admin" active={tab === "stats"}>Pilot stats</TabLink>
        <TabLink href="/admin?tab=users" active={tab === "users"}>Users</TabLink>
      </nav>
      {tab === "users" ? <UsersTab filter={filter} /> : <StatsTab />}
    </AppShell>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cx("rounded-full px-4 py-[7px] text-[13px] font-medium", active ? "bg-ink text-cream" : "border border-line text-ink-muted hover:text-ink")}>
      {children}
    </Link>
  );
}

const METHOD_LABEL = { email: "Email", google: "Google", apple: "Apple" } as const;

async function UsersTab({ filter }: { filter: AdminUserFilter }) {
  const { summary, rows } = await adminUsers(filter);
  const filters: Array<{ key: AdminUserFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "new", label: "New (7 days)" },
    { key: "never", label: "Never posted" },
  ];
  return (
    <div className="px-4 pt-4 pb-10 flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-2">
        <Tile label="Users" value={summary.total} />
        <Tile label="New today" value={summary.newToday} hint="Since midnight, UAE time" />
        <Tile label="This week" value={summary.newThisWeek} hint="Last 7 days" />
        <Tile label="Published a guide" value={summary.publishers} />
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/admin?tab=users" : `/admin?tab=users&filter=${f.key}`}
            aria-current={filter === f.key ? "page" : undefined}
            className={cx("shrink-0 rounded-full px-[15px] py-[7px] text-[12.5px] font-medium whitespace-nowrap", filter === f.key ? "bg-terracotta text-white" : "border border-line text-ink-muted hover:text-ink")}
          >
            {f.label}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="px-1 text-[12.5px] text-ink-faint">{filter === "new" ? "Nobody new in the last 7 days." : filter === "never" ? "Everyone has published a guide." : "No users yet."}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const method = METHOD_LABEL[r.signUp.method];
            const linked = r.signUp.linked.map((p) => METHOD_LABEL[p]).join(" + ");
            return (
              <li key={r.user.id} className="rounded-2xl bg-paper border border-line/70 px-3 py-2.5">
                <Link href={`/u/${r.user.username}`} className="flex gap-3 items-start">
                  <Avatar user={r.user} size={40} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-baseline gap-2">
                      <span className="flex-1 min-w-0 font-semibold text-[14px] truncate">{r.user.displayName}</span>
                      <span className="shrink-0 text-[11.5px] text-ink-muted tabular-nums">{timeAgo(r.createdAt)}</span>
                    </span>
                    <span className="block text-[12px] text-ink-muted truncate">
                      @{r.user.username} · {method}{linked ? ` (+ ${linked})` : ""}
                    </span>
                    <span className="block text-[12px] text-ink-muted tabular-nums">
                      <b className={cx("font-semibold", r.guidesPublished ? "text-ink" : "text-ink-faint")}>{r.guidesPublished}</b> {r.guidesPublished === 1 ? "guide" : "guides"} published · {r.followers} {r.followers === 1 ? "follower" : "followers"} · {r.following} following
                    </span>
                  </span>
                </Link>
                <div className="mt-2 pl-[52px] flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[11px] text-ink-faint">{r.email.endsWith(".invalid") ? "No email shared" : r.email}</span>
                  <ResetPasswordButton
                    userId={r.user.id}
                    username={r.user.username}
                    displayName={r.user.displayName}
                    disabledReason={r.signUp.method === "email" ? null : `${method} sign-in · no password`}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

async function StatsTab() {
  const s = await pilotStats();
  const maxViews = Math.max(1, ...s.weekly.map((w) => w.views));
  return (
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
