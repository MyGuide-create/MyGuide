"use client";

import Link from "next/link";
import { useState } from "react";
import { errorText } from "@/lib/errorText";
import { setClap, setClapNote } from "@/lib/actions/claps";
import { CLAP_NOTES, clapNames, type ClapKind, type ClapSummary } from "@/lib/clapTargets";
import { cx } from "./ui";

/**
 * 👏 under a friend's activity post (14 Oct 2026): a light "nice finds" that tells them, with an
 * optional one-tap note. Saves nothing. On your own post it only shows who clapped.
 */
export function ClapBar({
  kind,
  target,
  ownerId,
  ownerName,
  city,
  count,
  initial,
  signedIn,
  own,
}: {
  kind: ClapKind;
  target: string;
  ownerId: string;
  /** First name, for "Tell Isabella…" */
  ownerName: string;
  city?: string;
  /** Spots in the post. */
  count?: number;
  initial: ClapSummary | undefined;
  signedIn: boolean;
  own: boolean;
}) {
  const [s, setS] = useState<ClapSummary>(initial ?? { count: 0, mine: false, myNote: null, names: [] });
  const [justClapped, setJustClapped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = { kind, target, ownerId, city, count };

  const toggle = async () => {
    const on = !s.mine;
    const prev = s;
    setS(on ? { count: s.count + 1, mine: true, myNote: null, names: ["You", ...s.names] } : { count: s.count - 1, mine: false, myNote: null, names: s.names.filter((n) => n !== "You") });
    setJustClapped(on);
    setError(null);
    try {
      await setClap({ ...input, on });
    } catch (e) {
      setS(prev);
      setJustClapped(false);
      setError(errorText(e, "Couldn't clap."));
    }
  };

  const note = async (n: string) => {
    const next = s.myNote === n ? null : n;
    const prev = s;
    setS({ ...s, myNote: next });
    try {
      await setClapNote({ ...input, note: next });
    } catch (e) {
      setS(prev);
      setError(errorText(e, "Couldn't send that."));
    }
  };

  if (own) {
    return s.count > 0 ? <p className="text-[12.5px] text-ink-muted">👏 {clapNames(s)} clapped</p> : null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        {signedIn ? (
          <button
            type="button"
            onClick={toggle}
            aria-pressed={s.mine}
            className={cx(
              "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-[13px] font-semibold transition-colors",
              s.mine ? "bg-ochre-soft/70 border-ochre text-ink" : "border-line text-ink hover:border-ochre",
            )}
          >
            <span aria-hidden className={cx("text-[15px] leading-none", justClapped && "animate-[clap_0.4s_ease-out]")}>👏</span>
            {s.mine ? "Clapped" : "Clap"}
          </button>
        ) : (
          <Link href="/signup?why=clap&next=/" className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-line text-[13px] font-semibold">
            <span aria-hidden className="text-[15px] leading-none">👏</span> Clap
          </Link>
        )}
        {s.count > (s.mine ? 1 : 0) && <span className="text-[12.5px] text-ink-muted min-w-0 truncate">{clapNames(s)} clapped</span>}
      </div>
      {s.mine && !justClapped && s.myNote && <p className="text-[12px] text-ink-muted">You said “{s.myNote}”</p>}
      {s.mine && justClapped && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-ink-muted pr-0.5">{s.myNote ? "Sent:" : `Tell ${ownerName}:`}</span>
          {CLAP_NOTES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => note(n)}
              className={cx("rounded-full px-2.5 py-1 text-[12px] border", s.myNote === n ? "bg-ink text-cream border-ink" : "border-line bg-paper text-ink")}
            >
              {n}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}
