"use client";

import Link from "next/link";
import { useState } from "react";
import { errorText } from "@/lib/errorText";
import { setClap, setClapNote } from "@/lib/actions/claps";
import { CLAP_NOTES, clapNames, type ClapFace, type ClapKind, type ClapSummary } from "@/lib/clapTargets";
import { ChatIcon, HeartIcon, SendIcon } from "./Icons";
import { Avatar, cx } from "./ui";

/**
 * The action row under a Home post (17 Oct 2026, after LinkedIn's): ♥ count · 💬 count ·
 * Recommend · Send … Save, with the faces of who loved it above. The heart is the old 👏 clap
 * (same data, same one-tap note to the owner), now in terracotta instead of the yellow emoji.
 * Recommend and Save are passed in (they're per spot); Comment opens the spot's own thread.
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
  comments,
  recommend,
  share,
  save,
  alsoRecommend = 0,
  me,
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
  /** One-spot posts: comments on that spot and where they are. */
  comments?: { count: number; href: string };
  /** The Recommend button (or "✓ Your spot"). */
  recommend?: React.ReactNode;
  /** What Send shares: a path on MyGuide and its title. */
  share?: { path: string; title: string };
  /** The Save (Want to go) button, at the right end. */
  save?: React.ReactNode;
  /** Other friends who recommend this spot too. */
  alsoRecommend?: number;
  /** The viewer, for their face when they tap the heart. */
  me?: ClapFace;
}) {
  const [s, setS] = useState<ClapSummary>(initial ?? { count: 0, mine: false, myNote: null, names: [], faces: [] });
  const [justClapped, setJustClapped] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = { kind, target, ownerId, city, count };

  const toggle = async () => {
    const on = !s.mine;
    const prev = s;
    const others = (s.faces ?? []).filter((f) => f.username !== me?.username);
    setS(
      on
        ? { count: s.count + 1, mine: true, myNote: null, names: ["You", ...s.names], faces: (me ? [me, ...others] : others).slice(0, 3) }
        : { count: s.count - 1, mine: false, myNote: null, names: s.names.filter((n) => n !== "You"), faces: others },
    );
    setJustClapped(on);
    setError(null);
    try {
      await setClap({ ...input, on });
    } catch (e) {
      setS(prev);
      setJustClapped(false);
      setError(errorText(e, "Couldn't do that."));
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

  const send = async () => {
    if (!share) return;
    const url = new URL(share.path, window.location.origin).toString();
    if (navigator.share) {
      try {
        await navigator.share({ title: share.title, url });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy the link.");
    }
  };

  // "Lina, Sam and 10 others love this · 2 friends recommend it too"
  const lovers = s.count > 0 ? `${clapNames(s)} ${s.count === 1 && !s.mine ? "loves" : "love"} this` : "";
  const recs = alsoRecommend > 0 ? `${alsoRecommend} friend${alsoRecommend === 1 ? "" : "s"} recommend${alsoRecommend === 1 ? "s" : ""} it too` : "";
  const faces = (s.faces ?? []).slice(0, 3);

  const act = "inline-flex items-center gap-1.5 h-10 px-2 rounded-full text-[13.5px] font-medium tabular-nums transition-colors";
  const heart = (
    <>
      <HeartIcon size={22} filled={s.mine} className={cx(justClapped && "animate-[heart_0.35s_ease-out]")} />
      {s.count > 0 && s.count}
    </>
  );

  return (
    <div className="flex flex-col gap-2">
      {(lovers || recs) && (
        <div className="flex items-center gap-2 text-[12.5px] text-ink-muted leading-snug">
          {faces.length > 0 && (
            <span className="flex shrink-0">
              {faces.map((f, i) => (
                <Avatar key={`${f.username}-${i}`} user={f} size={20} className={cx("ring-2 ring-paper", i > 0 && "-ml-1.5")} />
              ))}
            </span>
          )}
          <span className="min-w-0">{[lovers, recs].filter(Boolean).join(" · ")}</span>
        </div>
      )}
      <div className="-mx-3.5 px-1.5 pt-1 -mb-1.5 border-t border-line/70 flex items-center">
        {!own &&
          (signedIn ? (
            <button type="button" onClick={toggle} aria-pressed={s.mine} aria-label={s.mine ? "Loved (tap to undo)" : `Love — tells ${ownerName}`} className={cx(act, s.mine ? "text-terracotta" : "text-ink-muted hover:text-terracotta")}>
              {heart}
            </button>
          ) : (
            <Link href="/signup?why=clap&next=/" aria-label="Love" className={cx(act, "text-ink-muted")}>
              {heart}
            </Link>
          ))}
        {comments && (
          <Link href={comments.href} aria-label={comments.count ? `${comments.count} comments` : "Comment"} className={cx(act, "text-ink-muted hover:text-ink")}>
            <ChatIcon size={21} />
            {comments.count > 0 && comments.count}
          </Link>
        )}
        {recommend && <span className="px-1">{recommend}</span>}
        {share && (
          <button type="button" onClick={send} aria-label="Send" className={cx(act, "text-ink-muted hover:text-ink")}>
            <SendIcon size={21} />
            {copied && <span className="text-[12px] font-normal">Link copied</span>}
          </button>
        )}
        <span className="flex-1" />
        {save && <span className="pr-1.5">{save}</span>}
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
