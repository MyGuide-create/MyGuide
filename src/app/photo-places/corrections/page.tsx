import { notFound } from "next/navigation";
import { AppShell, TopBar } from "@/components/AppShell";
import { recentPhotoFeedback, type PhotoFeedbackRow } from "@/lib/actions/photoPlaces";
import { isAdmin } from "@/lib/admin";
import { requireUser, toPublicUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Photo places corrections" };

const HOW: Record<string, string> = {
  kept: "Kept the guess",
  alt: "Picked a “Not it?” chip",
  list: "Picked in Find it",
  search: "Searched in Find it",
  none: "None of these",
};

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");

function Tally({ rows, label }: { rows: PhotoFeedbackRow[]; label: string }) {
  const kept = rows.filter((r) => r.how === "kept").length;
  const fixed = rows.filter((r) => r.how === "alt" || r.how === "list" || r.how === "search").length;
  const none = rows.filter((r) => r.how === "none").length;
  const total = kept + fixed + none;
  return (
    <div className="rounded-2xl border border-line/80 bg-paper p-3.5">
      <p className="text-[13px] text-ink-muted">{label}</p>
      <p className="font-display text-[26px] leading-tight">{pct(kept, total)} right</p>
      <p className="text-[12.5px] text-ink-muted">
        {kept} kept · {fixed} corrected · {none} none of these
      </p>
    </div>
  );
}

/** Photo places (team test, 15 Oct 2026): how often the guesses are right, and where they go wrong. */
export default async function PhotoCorrectionsPage() {
  const user = await requireUser("/photo-places/corrections");
  if (!isAdmin(user)) notFound();
  const rows = await recentPhotoFeedback(500);
  const sure = rows.filter((r) => r.confidence === "sure");
  const guess = rows.filter((r) => r.confidence !== "sure");
  const swaps = new Map<string, number>();
  for (const r of rows) {
    if (r.how === "kept") continue;
    const k = `${r.guessKind || "?"} → ${r.how === "none" ? "nothing" : r.chosenKind || "?"}`;
    swaps.set(k, (swaps.get(k) ?? 0) + 1);
  }
  const topSwaps = [...swaps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const when = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <AppShell nav={false}>
      <TopBar back="/photo-places" title="Corrections" avatarUser={toPublicUser(user)} />
      <div className="px-5 pt-4 pb-16 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[26px] leading-tight">How good are the guesses?</h1>
          <p className="text-[14px] text-ink-muted leading-relaxed">
            Every time someone on the team recommends a guess, swaps it, or says none of these. {rows.length ? `${rows.length} so far.` : "Nothing yet — try Photo places on a trip or two."}
          </p>
        </div>
        {rows.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Tally rows={sure} label="“Pretty sure”" />
              <Tally rows={guess} label="Best guesses" />
            </div>
            {topSwaps.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="font-display text-[20px]">Most common mix-ups</h2>
                <ul className="rounded-2xl border border-line/80 bg-paper divide-y divide-line/70 text-[14px]">
                  {topSwaps.map(([k, n]) => (
                    <li key={k} className="flex justify-between px-3.5 py-2.5">
                      <span>{k}</span>
                      <span className="text-ink-muted">{n}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="flex flex-col gap-2">
              <h2 className="font-display text-[20px]">Latest</h2>
              <ul className="flex flex-col gap-2">
                {rows.slice(0, 80).map((r, i) => {
                  const d = r.detail ?? {};
                  const metres = [d.guessMetres != null ? `guess ${d.guessMetres} m` : "", d.chosenMetres != null ? `picked ${d.chosenMetres} m` : ""].filter(Boolean).join(", ");
                  return (
                    <li key={i} className="rounded-2xl border border-line/80 bg-paper p-3 text-[13.5px] leading-snug">
                      <p className="text-[12px] text-ink-muted">
                        {when(r.at)} · @{r.who} · {r.confidence === "sure" ? "pretty sure" : "guess"} · {HOW[r.how] ?? r.how}
                      </p>
                      <p className="pt-0.5">
                        <b>{r.guessName}</b> <span className="text-ink-muted">({r.guessKind || "?"})</span>
                        {r.chosenName && (
                          <>
                            {" "}
                            → <b>{r.chosenName}</b> <span className="text-ink-muted">({r.chosenKind || "?"})</span>
                          </>
                        )}
                      </p>
                      <p className="text-[12px] text-ink-faint">
                        {[
                          `${d.photos ?? "?"} photos`,
                          d.dwell != null ? `${d.dwell} min` : "",
                          d.passing ? "walking past?" : "",
                          d.altRank ? `was option ${d.altRank}` : "",
                          metres,
                          typeof d.reason === "string" ? d.reason : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
