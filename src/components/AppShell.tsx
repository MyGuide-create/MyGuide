import Link from "next/link";
import type { ReactNode } from "react";
import type { PublicUser } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";
import { unreadNotificationCount } from "@/lib/guides";
import { BottomNav } from "./BottomNav";
import { ChevronLeft } from "./Icons";
import { Avatar, cx } from "./ui";

/**
 * Phone-first shell: content is capped at ~480px and centred on larger
 * screens, with the bottom navigation pinned.
 */
export async function AppShell({
  children,
  nav = true,
  className,
}: {
  children: ReactNode;
  nav?: boolean;
  className?: string;
}) {
  const user = await getCurrentUser();
  const unread = user ? await unreadNotificationCount(user.id) : 0;
  return (
    <div className="flex-1 flex flex-col items-center">
      <div className={cx("w-full max-w-[480px] flex-1 flex flex-col relative min-h-dvh", nav && "pb-24", className)}>
        {children}
      </div>
      {nav && <BottomNav signedIn={!!user} unread={unread} />}
    </div>
  );
}

export function TopBar({
  title,
  back,
  right,
  transparent,
  avatarUser,
}: {
  title?: ReactNode;
  back?: string;
  right?: ReactNode;
  transparent?: boolean;
  /** Shown top-right, linking to the user's profile, when `right` isn't already occupied. */
  avatarUser?: PublicUser | null;
}) {
  return (
    <div
      className={cx(
        "sticky top-0 z-30 flex items-center gap-2 px-3 h-14",
        !transparent && "bg-cream/90 backdrop-blur border-b border-line/70",
      )}
    >
      {back ? (
        <Link href={back} aria-label="Back" className="w-10 h-10 -ml-1 flex items-center justify-center rounded-full hover:bg-cream-deep/60 text-ink">
          <ChevronLeft size={22} />
        </Link>
      ) : (
        <div className="w-2" />
      )}
      <div className="flex-1 min-w-0">
        {typeof title === "string" ? <h1 className="font-display text-[22px] leading-none truncate">{title}</h1> : title}
      </div>
      {right ?? (avatarUser ? (
        <Link href={`/u/${avatarUser.username}`} aria-label="Your profile">
          <Avatar user={avatarUser} size={32} />
        </Link>
      ) : null)}
    </div>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("font-display text-[26px] leading-none tracking-tight", className)}>
      My<span className="text-terracotta">Guide</span>
    </span>
  );
}
