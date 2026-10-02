"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PublicUser } from "@/lib/auth";
import { addCollaborator, removeCollaborator } from "@/lib/actions/guides";
import { XIcon } from "./Icons";
import { Avatar, Input, Spinner } from "./ui";

/** Owner: invite people to edit this guide together. Co-editor: see who else edits, or leave. */
export function CollaboratorsEditor({
  guideId,
  initial,
  isOwner,
  viewerId,
  ownerName,
}: {
  guideId: string;
  initial: PublicUser[];
  isOwner: boolean;
  viewerId: string;
  ownerName: string;
}) {
  const [people, setPeople] = useState(initial);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PublicUser[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!isOwner || q.trim().length < 1) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as { users: PublicUser[] };
      setResults(data.users.filter((u) => u.id !== viewerId && !people.some((p) => p.id === u.id)));
    }, 200);
    return () => clearTimeout(t);
  }, [q, isOwner, people, viewerId]);

  if (!isOwner) {
    return (
      <div className="rounded-2xl border border-line bg-paper px-4 py-3 text-[13px] leading-relaxed">
        You&apos;re editing this guide with <b>{ownerName}</b>
        {people.filter((p) => p.id !== viewerId).length > 0 && <> and {people.filter((p) => p.id !== viewerId).map((p) => p.displayName).join(", ")}</>}. Only {ownerName.split(" ")[0]} can publish or delete it.
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm("Stop editing this guide? You can be invited again later.")) return;
            start(async () => {
              await removeCollaborator(guideId, viewerId);
              router.push("/");
            });
          }}
          className="block mt-1.5 text-[12px] text-danger font-medium"
        >
          Leave this guide
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-paper px-4 py-3.5">
      <div className="text-[14px] font-medium">Edit together</div>
      <div className="text-[11.5px] text-ink-muted">Invite a friend or partner to add places and notes with you. Only you can publish or delete.</div>
      {people.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {people.map((u) => (
            <li key={u.id} className="flex items-center gap-2.5">
              <Avatar user={u} size={26} />
              <span className="flex-1 min-w-0 text-[13px] truncate">{u.displayName} <span className="text-ink-muted">@{u.username}</span></span>
              <button
                type="button"
                aria-label={`Remove ${u.displayName}`}
                onClick={() => start(async () => { await removeCollaborator(guideId, u.id); setPeople((ps) => ps.filter((p) => p.id !== u.id)); })}
                className="text-ink-faint hover:text-danger p-1"
              >
                <XIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative mt-3">
        <Input value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value.trim()) setResults([]); }} placeholder="Add by name or @username" autoComplete="off" />
        {pending && <Spinner className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-faint" />}
      </div>
      {results.length > 0 && (
        <ul className="mt-2 rounded-2xl border border-line overflow-hidden divide-y divide-line/70">
          {results.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await addCollaborator(guideId, u.username);
                    if (r.ok) {
                      setPeople((ps) => [...ps, u]);
                      setResults([]);
                      setQ("");
                      setMsg(`${u.displayName} can now edit this guide. They've been notified.`);
                    } else setMsg(r.error);
                  })
                }
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-cream-deep/50"
              >
                <Avatar user={u} size={28} />
                <span className="flex-1 min-w-0 text-[13px] truncate">{u.displayName} <span className="text-ink-muted">@{u.username}</span></span>
                <span className="text-[12px] text-terracotta font-medium">Invite</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="mt-2 text-[12px] text-sage">{msg}</p>}
    </div>
  );
}
