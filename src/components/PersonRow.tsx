import Link from "next/link";
import type { PersonHit } from "@/lib/guides";
import { FollowButton } from "./FollowButton";
import { Avatar, LinkButton } from "./ui";

/** One person in Search: avatar, name, "@username · N guides", Follow. The row opens their profile. */
export function PersonRow({ hit, signedIn, next }: { hit: PersonHit; signedIn: boolean; next: string }) {
  const { user, guideCount } = hit;
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line/70 bg-paper px-3 py-2.5">
      <Link href={`/u/${user.username}`} className="flex flex-1 min-w-0 items-center gap-3">
        <Avatar user={user} size={44} />
        <span className="min-w-0">
          <span className="block font-semibold text-[14px] leading-tight truncate">{user.displayName}</span>
          <span className="block text-[12px] text-ink-muted truncate">
            @{user.username} · {guideCount} {guideCount === 1 ? "guide" : "guides"}
            {hit.followsViewer && hit.viewerStatus === "none" ? " · Follows you" : ""}
          </span>
        </span>
      </Link>
      <div className="shrink-0">
        {signedIn ? (
          <FollowButton userId={user.id} initial={hit.viewerStatus} next={next.split("?")[0]} followsYou={hit.followsViewer} />
        ) : (
          <LinkButton href={`/signup?why=follow&next=${encodeURIComponent(next)}`} size="sm" variant="outline">Follow</LinkButton>
        )}
      </div>
    </li>
  );
}
