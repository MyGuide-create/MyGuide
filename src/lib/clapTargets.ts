/** Claps (14 Oct 2026): what a clap points at. Plain module, used by the page, the button and the actions. */

export type ClapKind = "spots" | "guide";

/** One-tap notes that can come with a clap. */
export const CLAP_NOTES = ["Looks great!", "Must try", "Saving for my trip"] as const;

/** Spots someone recommended in one city on one day (the same grouping as the Home activity post). */
export function spotsTarget(ownerId: string, city: string, at: Date): string {
  return `${ownerId}|${city.trim().toLowerCase()}|${at.toISOString().slice(0, 10)}`;
}

export const clapKey = (kind: ClapKind, target: string) => `${kind}:${target}`;

export interface ClapSummary {
  count: number;
  /** The viewer clapped. */
  mine: boolean;
  myNote: string | null;
  /** First names of who clapped, viewer first ("You"), most recent next. */
  names: string[];
  /** Up to 3 of them for the little faces on a post (17 Oct 2026), same order. */
  faces?: ClapFace[];
}

export interface ClapFace {
  username: string;
  displayName: string;
  avatarMediaId: string | null;
}

/** "You, Shaz and 2 others" */
export function clapNames(s: ClapSummary): string {
  const shown = s.names.slice(0, 2);
  const rest = s.count - shown.length;
  if (rest > 0) return `${shown.join(", ")} and ${rest} other${rest === 1 ? "" : "s"}`;
  return shown.length === 2 ? `${shown[0]} and ${shown[1]}` : shown[0] ?? "";
}
