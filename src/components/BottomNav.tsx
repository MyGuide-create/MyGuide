"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellIcon, HomeIcon, PlusIcon, SearchIcon, UserIcon } from "./Icons";
import { cx } from "./ui";

export function BottomNav({ signedIn, username, unread }: { signedIn: boolean; username: string | null; unread: number }) {
  const path = usePathname();
  const is = (p: string) => (p === "/" ? path === "/" : path.startsWith(p));
  const profileHref = signedIn ? "/me" : "/login?next=/me";
  const item = "flex flex-col items-center justify-center w-14 h-12 rounded-2xl transition-colors";
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 flex justify-center pointer-events-none">
      <div className="pointer-events-auto w-full max-w-[480px] safe-bottom bg-paper/95 backdrop-blur border-t border-line flex items-end justify-around px-2 pt-2 pb-2">
        <Link href="/" aria-label="Home" className={cx(item, is("/") ? "text-ink" : "text-ink-muted")}>
          <HomeIcon size={24} />
        </Link>
        <Link href="/search" aria-label="Search" className={cx(item, is("/search") ? "text-ink" : "text-ink-muted")}>
          <SearchIcon size={24} />
        </Link>
        <Link
          href={signedIn ? "/create" : "/login?next=/create"}
          aria-label="Create a guide"
          className="-mt-8 w-[54px] h-[54px] rounded-full bg-terracotta text-white flex items-center justify-center shadow-float active:scale-95 transition-transform"
        >
          <PlusIcon size={26} />
        </Link>
        <Link href={signedIn ? "/notifications" : "/login?next=/notifications"} aria-label="Notifications" className={cx(item, "relative", is("/notifications") ? "text-ink" : "text-ink-muted")}>
          <BellIcon size={24} />
          {unread > 0 && (
            <span className="absolute top-1 right-3 min-w-[18px] h-[18px] px-1 rounded-full bg-terracotta text-white text-[10.5px] font-semibold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>
        <Link href={profileHref} aria-label="Profile" className={cx(item, is("/me") || (username && is(`/u/${username}`)) ? "text-ink" : "text-ink-muted")}>
          <UserIcon size={24} />
        </Link>
      </div>
    </nav>
  );
}
