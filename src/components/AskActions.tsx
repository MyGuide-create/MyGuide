"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { answerAskWithGuide, declineAsk } from "@/lib/actions/requests";
import { errorText } from "@/lib/errorText";
import Link from "next/link";
import { SendSpotsButton } from "./SendSpotsButton";
import { Button, LinkButton, Spinner } from "./ui";

/** What the person asked can do: send their spots (adding some first if needed), send a guide, or say they can't help. */
export function AskActions({
  requestId,
  wishId,
  firstName,
  city,
  makeHref,
  myGuides,
  mySpots,
  declined,
}: {
  requestId: string;
  wishId: string | null;
  mySpots: number;
  firstName: string;
  city: string;
  makeHref: string;
  myGuides: Array<{ id: string; title: string }>;
  declined: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saidNo, setSaidNo] = useState(declined);

  const act = (fn: () => Promise<void>, fallback: string) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(errorText(e, fallback));
      }
    });

  return (
    <div className="mt-7 flex flex-col gap-3">
      {saidNo && <p className="rounded-2xl bg-cream-deep/60 px-4 py-3 text-[13.5px] text-ink-muted">You told {firstName} you can’t help with {city}. Changed your mind? You can still send your spots.</p>}
      {mySpots > 0 && wishId ? (
        <>
          <SendSpotsButton wishIds={[wishId]} dark label={`Send ${firstName} your ${mySpots} ${city} spot${mySpots === 1 ? "" : "s"}`} className="w-full h-12 text-[15px]" onSent={() => router.refresh()} />
          <LinkButton href={`/record?wish=${wishId}`} variant="outline">Add more {city} spots first</LinkButton>
        </>
      ) : (
        <>
          <LinkButton href={wishId ? `/record?wish=${wishId}` : "/record"} size="lg">Add your {city} spots</LinkButton>
          <p className="-mt-1 text-center text-[12.5px] text-ink-muted">One at a time, or <Link href="/create?import=1" className="font-medium text-terracotta">paste a Google Maps list</Link>. Then send them to {firstName}.</p>
        </>
      )}
      <Link href={makeHref} className="text-center text-[13px] font-medium text-ink-muted hover:text-terracotta">Or make {firstName} a guide →</Link>

      {myGuides.length > 0 && (
        <div className="mt-2 rounded-2xl border border-line bg-paper p-3.5">
          <p className="text-[13px] font-semibold">Already made one?</p>
          <div className="mt-2 flex flex-col gap-2">
            {myGuides.map((g) => (
              <Button key={g.id} variant="outline" size="sm" disabled={pending} onClick={() => act(() => answerAskWithGuide(requestId, g.id), "Couldn't send that guide.")}>
                {pending ? <Spinner /> : `Send ${firstName} “${g.title}”`}
              </Button>
            ))}
          </div>
        </div>
      )}

      {!saidNo && (
        <button
          type="button"
          disabled={pending}
          onClick={() => act(async () => { await declineAsk(requestId); setSaidNo(true); }, "Couldn't send your reply.")}
          className="mt-2 text-[13.5px] font-medium text-ink-muted hover:text-ink"
        >
          I don’t know {city} well enough
        </button>
      )}
      {error && <p className="text-[12.5px] text-danger text-center">{error}</p>}
    </div>
  );
}
