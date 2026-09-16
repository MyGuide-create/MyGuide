"use client";

import { useEffect, useState, useTransition } from "react";
import type { PublicUser } from "@/lib/auth";
import { shareGuideWithUser, unshareGuideWithUser } from "@/lib/actions/guides";
import { CheckIcon, LinkIcon, ShareIcon, XIcon } from "./Icons";
import { Avatar, Button, Input, Spinner, cx } from "./ui";

export function ShareSheet({
  guideId,
  shareUrl,
  isPrivate,
  isOwner,
  sharedWith,
  onClose,
}: {
  guideId: string;
  shareUrl: string;
  isPrivate: boolean;
  isOwner: boolean;
  sharedWith: PublicUser[];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PublicUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [shared, setShared] = useState<PublicUser[]>(sharedWith);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    if (!isOwner || q.trim().length < 1) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as { users: PublicUser[] };
        setResults(data.users.filter((u) => !shared.some((s) => s.id === u.id)));
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q, isOwner, shared]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link", shareUrl);
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title: "A guide on MyGuide", url: shareUrl });
    } catch { /* user cancelled */ }
  };

  const shareWith = (u: PublicUser) =>
    start(async () => {
      const r = await shareGuideWithUser(guideId, u.username);
      if (r.ok) {
        setShared((s) => [...s, u]);
        setResults((rs) => rs.filter((x) => x.id !== u.id));
        setQ("");
        setMsg(`Shared with ${r.user.displayName}. It's in their Notification Centre.`);
      } else setMsg(r.error);
    });

  const unshare = (u: PublicUser) =>
    start(async () => {
      await unshareGuideWithUser(guideId, u.id);
      setShared((s) => s.filter((x) => x.id !== u.id));
    });

  return (
    <Sheet onClose={onClose} title="Share this guide">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={copy}
          className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-line bg-paper px-3 py-3 text-[13.5px] font-medium hover:border-terracotta-soft"
        >
          {copied ? <CheckIcon size={16} className="text-sage" /> : <LinkIcon size={16} />}
          {copied ? "Copied" : "Copy link"}
        </button>
        {canNativeShare && (
          <button type="button" onClick={nativeShare} className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-ink text-cream px-3 py-3 text-[13.5px] font-medium">
            <ShareIcon size={16} /> Share…
          </button>
        )}
      </div>
      <p className="mt-2 text-[11.5px] text-ink-faint leading-relaxed">
        {isPrivate
          ? "This guide is private. Anyone with this exact link can open it; it won't appear in the feed or search."
          : "This guide is public, so the link works for everyone."}
      </p>

      {isOwner && (
        <div className="mt-5">
          <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted mb-1.5">Share with a person</div>
          <div className="relative">
            <Input value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value.trim()) setResults([]); }} placeholder="Search by name or @username" autoComplete="off" />
            {searching && <Spinner className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-faint" />}
          </div>
          {results.length > 0 && (
            <ul className="mt-2 rounded-2xl border border-line bg-paper overflow-hidden divide-y divide-line/70">
              {results.map((u) => (
                <li key={u.id}>
                  <button type="button" disabled={pending} onClick={() => shareWith(u)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-cream-deep/50">
                    <Avatar user={u} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-medium truncate">{u.displayName}</div>
                      <div className="text-[11.5px] text-ink-muted">@{u.username}</div>
                    </div>
                    <span className="text-[12px] text-terracotta font-medium">Share</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {msg && <p className="mt-2 text-[12.5px] text-sage">{msg}</p>}
          {shared.length > 0 && (
            <div className="mt-4">
              <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted mb-1.5">Shared with</div>
              <ul className="flex flex-col gap-1.5">
                {shared.map((u) => (
                  <li key={u.id} className="flex items-center gap-3 rounded-2xl bg-paper border border-line/70 px-3 py-2">
                    <Avatar user={u} size={28} />
                    <div className="flex-1 min-w-0 text-[13px] truncate">{u.displayName} <span className="text-ink-muted">@{u.username}</span></div>
                    <button type="button" aria-label="Remove" onClick={() => unshare(u)} className="text-ink-faint hover:text-danger p-1"><XIcon size={14} /></button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

/** Bottom sheet used for share / publish dialogs. */
export function Sheet({ title, children, onClose, className }: { title: string; children: React.ReactNode; onClose: () => void; className?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40" />
      <div className={cx("relative w-full max-w-[480px] rounded-t-[28px] bg-cream px-5 pt-3 pb-8 safe-bottom max-h-[88dvh] overflow-y-auto fade-up", className)}>
        <div className="mx-auto w-10 h-1.5 rounded-full bg-line mb-3" />
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-[24px]">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close"><XIcon size={18} /></Button>
        </div>
        {children}
      </div>
    </div>
  );
}
