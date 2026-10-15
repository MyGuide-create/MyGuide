/**
 * How recent a recommendation is (14 Oct 2026): the last time its owner shared it, or wrote or changed
 * its description or a tip. Places added before fresh_at existed fall back to shared/added dates.
 */
export function freshOf(p: { freshAt?: Date | null; sharedAt?: Date | null; createdAt: Date }): Date {
  const t = Math.max(p.freshAt?.getTime() ?? 0, p.sharedAt?.getTime() ?? 0, p.createdAt.getTime());
  return new Date(t);
}

/** "Oct 2026" */
export function sharedLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "Asia/Dubai" });
}
