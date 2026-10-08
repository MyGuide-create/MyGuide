"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { answerAskWithGuide, declineAsk } from "@/lib/actions/requests";
import { errorText } from "@/lib/errorText";
import { Button, LinkButton, Spinner } from "./ui";

/** What the person asked can do: make the guide, send one they've made, or say they can't help. */
export function AskActions({
  requestId,
  firstName,
  city,
  makeHref,
  myGuides,
  declined,
}: {
  requestId: string;
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
      {saidNo && <p className="rounded-2xl bg-cream-deep/60 px-4 py-3 text-[13.5px] text-ink-muted">You told {firstName} you can’t help with {city}. Changed your mind? You can still make the guide.</p>}
      <LinkButton href={makeHref} size="lg">Make {firstName} a {city} guide</LinkButton>
      <p className="-mt-1 text-center text-[12.5px] text-ink-muted">Paste a list from Google Maps or WhatsApp, or add places one by one.</p>

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
