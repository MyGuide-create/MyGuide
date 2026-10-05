"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BellIcon, HomeIcon, MicIcon, PinIcon, PlusIcon, SearchIcon, UserIcon, XIcon } from "./Icons";
import { cx } from "./ui";

export function BottomNav({ signedIn, username, unread }: { signedIn: boolean; username: string | null; unread: number }) {
  const path = usePathname();
  const [creating, setCreating] = useState(false);
  const is = (p: string) => (p === "/" ? path === "/" : path.startsWith(p));
  const youHref = username ? `/u/${username}` : "/login";
  const youActive = (username && (is(`/u/${username}`) || is("/me") || is("/saved"))) || false;
  const item = "flex flex-col items-center justify-center gap-0.5 w-16 h-12 rounded-2xl transition-colors";
  const label = "text-[10px] leading-none font-medium";
  // Like other apps: tapping the tab you're already on scrolls back to the top instead of reloading.
  const toTopIfHere = (href: string) => (e: React.MouseEvent) => {
    if (path !== href.split("?")[0]) return;
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: window.scrollY > 4000 ? "auto" : "smooth" });
  };
  return (
    <>
      {creating && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Create">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-ink/30" onClick={() => setCreating(false)} />
          <div className="relative w-full max-w-[480px] rounded-t-3xl bg-cream px-5 pt-3 pb-8 safe-bottom shadow-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-[24px]">Add to MyGuide</h2>
              <button type="button" aria-label="Close" onClick={() => setCreating(false)} className="p-1 text-ink-muted"><XIcon size={18} /></button>
            </div>
            <div className="flex flex-col gap-2.5">
              <Link href="/create" onClick={() => setCreating(false)} className="flex items-center gap-3 rounded-2xl border border-line bg-paper px-4 py-3.5 hover:border-terracotta-soft">
                <span className="w-10 h-10 rounded-full bg-terracotta text-white flex items-center justify-center shrink-0"><MicIcon size={19} /></span>
                <span className="min-w-0">
                  <span className="block font-semibold text-[14.5px]">Create a guide</span>
                  <span className="block text-[12px] text-ink-muted">Say or type the places you love in a city — we&apos;ll build the guide.</span>
                </span>
              </Link>
              <Link href="/record" onClick={() => setCreating(false)} className="flex items-center gap-3 rounded-2xl border border-line bg-paper px-4 py-3.5 hover:border-terracotta-soft">
                <span className="w-10 h-10 rounded-full bg-sage text-white flex items-center justify-center shrink-0"><PinIcon size={19} /></span>
                <span className="min-w-0">
                  <span className="block font-semibold text-[14.5px]">Record a place</span>
                  <span className="block text-[12px] text-ink-muted">At a spot right now? Add it to one of your guides in a few taps.</span>
                </span>
              </Link>
            </div>
          </div>
        </div>
      )}
      <nav className="fixed bottom-0 inset-x-0 z-40 flex justify-center pointer-events-none">
        <div className="pointer-events-auto w-full max-w-[480px] safe-bottom bg-paper/95 backdrop-blur border-t border-line flex items-end justify-around px-2 pt-2 pb-2">
          <Link href="/" onClick={toTopIfHere("/")} aria-label="Home" className={cx(item, is("/") ? "text-ink" : "text-ink-muted")}>
            <HomeIcon size={22} />
            <span className={label}>Home</span>
          </Link>
          <Link href="/search" onClick={toTopIfHere("/search")} aria-label="Search" className={cx(item, is("/search") ? "text-ink" : "text-ink-muted")}>
            <SearchIcon size={22} />
            <span className={label}>Search</span>
          </Link>
          {signedIn ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              aria-label="Create"
              className={cx(
                "-mt-8 w-[54px] h-[54px] rounded-full bg-terracotta text-white flex items-center justify-center shadow-float active:scale-95 transition-transform",
                (is("/create") || is("/record")) && "ring-4 ring-terracotta-tint",
              )}
            >
              <PlusIcon size={26} />
            </button>
          ) : (
            <Link
              href="/signup?next=/create&why=create"
              aria-label="Create a guide"
              className="-mt-8 w-[54px] h-[54px] rounded-full bg-terracotta text-white flex items-center justify-center shadow-float active:scale-95 transition-transform"
            >
              <PlusIcon size={26} />
            </Link>
          )}
          <Link href={signedIn ? "/notifications" : "/login?next=/notifications&why=notifications"} onClick={signedIn ? toTopIfHere("/notifications") : undefined} aria-label="Activity" className={cx(item, "relative", is("/notifications") ? "text-ink" : "text-ink-muted")}>
            <BellIcon size={22} />
            <span className={label}>Activity</span>
            {unread > 0 && (
              <span className="absolute -top-0.5 right-3 min-w-[18px] h-[18px] px-1 rounded-full bg-terracotta text-white text-[10.5px] font-semibold flex items-center justify-center">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
          <Link href={youHref} onClick={toTopIfHere(youHref)} aria-label="You" className={cx(item, youActive ? "text-ink" : "text-ink-muted")}>
            <UserIcon size={22} />
            <span className={label}>{signedIn ? "You" : "Log in"}</span>
          </Link>
        </div>
      </nav>
    </>
  );
}
