"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellIcon, CompassIcon, PinIcon, PlusIcon, UserIcon } from "./Icons";
import { cx } from "./ui";

export function BottomNav({ signedIn, username, unread }: { signedIn: boolean; username: string | null; unread: number }) {
  const path = usePathname();
  const is = (p: string) => (p === "/" ? path === "/" : path.startsWith(p));
  const youHref = username ? `/u/${username}` : "/signup";
  // Tabs (16 Oct 2026): Explore · My spots · + · Activity · Profile. Search lives in Explore's header.
  const youActive = (username && (is(`/u/${username}`) || is("/me"))) || false;
  const spotsHref = signedIn ? "/my-places" : "/signup?next=/my-places&why=save";
  const spotsActive = is("/my-places") || is("/saved");
  const exploreActive = is("/") || is("/search") || is("/cities");
  const item = "flex flex-col items-center justify-center gap-0.5 w-16 h-12 rounded-2xl transition-colors";
  const label = "text-[10px] leading-none font-medium";
  // Like other apps: tapping the tab you're already on scrolls back to the top instead of reloading.
  const toTopIfHere = (href: string) => (e: React.MouseEvent) => {
    if (path !== href.split("?")[0]) return;
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: window.scrollY > 4000 ? "auto" : "smooth" });
    // Explore on Home (17 Oct 2026): the cities reel slides back to its first city too.
    document.querySelectorAll<HTMLElement>("[data-reel]").forEach((el) => el.scrollTo({ left: 0, behavior: "smooth" }));
  };
  return (
    <>
      {/* + goes straight to Add a place (12 Oct 2026); guides are made from My spots, a city page or your profile. */}
      <nav className="fixed bottom-0 inset-x-0 z-40 flex justify-center pointer-events-none">
        <div className="pointer-events-auto w-full max-w-[480px] safe-bottom bg-paper/95 backdrop-blur border-t border-line flex items-end justify-around px-2 pt-2 pb-2">
          <Link href="/" onClick={toTopIfHere("/")} aria-label="Explore" className={cx(item, exploreActive ? "text-ink" : "text-ink-muted")}>
            <CompassIcon size={22} />
            <span className={label}>Explore</span>
          </Link>
          <Link href={spotsHref} onClick={signedIn ? toTopIfHere("/my-places") : undefined} aria-label="My spots" className={cx(item, spotsActive ? "text-ink" : "text-ink-muted")}>
            <PinIcon size={22} />
            <span className={label}>My spots</span>
          </Link>
          {signedIn ? (
            <Link
              href="/record"
              aria-label="Add a place"
              className={cx(
                "-mt-8 w-[54px] h-[54px] rounded-full bg-terracotta text-white flex items-center justify-center shadow-float active:scale-95 transition-transform",
                is("/record") && "ring-4 ring-terracotta-tint",
              )}
            >
              <PlusIcon size={26} />
            </Link>
          ) : (
            <Link
              href="/signup?next=/record&why=record"
              aria-label="Add a place"
              className="-mt-8 w-[54px] h-[54px] rounded-full bg-terracotta text-white flex items-center justify-center shadow-float active:scale-95 transition-transform"
            >
              <PlusIcon size={26} />
            </Link>
          )}
          <Link href={signedIn ? "/notifications" : "/signup?next=/notifications&why=notifications"} onClick={signedIn ? toTopIfHere("/notifications") : undefined} aria-label="Activity" className={cx(item, "relative", is("/notifications") ? "text-ink" : "text-ink-muted")}>
            <BellIcon size={22} />
            <span className={label}>Activity</span>
            {unread > 0 && (
              <span className="absolute -top-0.5 right-3 min-w-[18px] h-[18px] px-1 rounded-full bg-terracotta text-white text-[10.5px] font-semibold flex items-center justify-center">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
          <Link href={youHref} onClick={toTopIfHere(youHref)} aria-label={signedIn ? "Profile" : "Sign up"} className={cx(item, youActive ? "text-ink" : "text-ink-muted")}>
            <UserIcon size={22} />
            <span className={label}>{signedIn ? "Profile" : "Sign up"}</span>
          </Link>
        </div>
      </nav>
    </>
  );
}
