import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { AppShell, TopBar } from "@/components/AppShell";
import { TripForm } from "@/components/TripForm";
import { requireUser, toPublicUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { trips } from "@/lib/db/schema";
import { formatTripDates } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trips" };

export default async function TripsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser("/trips");
  const db = await getDb();
  const mine = await db.select().from(trips).where(eq(trips.userId, user.id)).orderBy(desc(trips.createdAt));
  return (
    <AppShell>
      <TopBar back={`/u/${user.username}`} title="Trips" avatarUser={toPublicUser(user)} />
      <div className="px-4 pt-4 pb-8 flex flex-col gap-6">
        <div>
          <h1 className="font-display text-[28px] leading-tight px-1">Going somewhere?</h1>
          <p className="mt-1 px-1 text-[13.5px] text-ink-muted">Tell us the city and we&apos;ll pull together your favourites, guides from people you follow, and the places people love most there.</p>
          <div className="mt-3">
            <TripForm defaultCity={typeof sp.city === "string" ? sp.city : undefined} />
          </div>
        </div>
        {mine.length > 0 && (
          <section>
            <h2 className="px-1 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted mb-2">Your trips</h2>
            <ul className="flex flex-col gap-2">
              {mine.map((t) => (
                <li key={t.id}>
                  <Link href={`/trips/${t.id}`} className="flex items-center justify-between rounded-2xl border border-line/70 bg-paper px-4 py-3 hover:border-terracotta-soft">
                    <span className="font-display text-[20px]">{t.city}</span>
                    <span className="text-[12px] text-ink-muted">{formatTripDates(t.startDate, t.endDate) || "No dates yet"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}
