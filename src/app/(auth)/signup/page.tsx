import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell, Wordmark } from "@/components/AppShell";
import { AuthForm } from "@/components/AuthForm";
import { XIcon } from "@/components/Icons";
import { getCurrentUser } from "@/lib/auth";
import { closeHref, parseReason, reasonText, safeNext } from "@/lib/authContext";
import { enabledProviders } from "@/lib/oauth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const why = parseReason(sp.why);
  if (await getCurrentUser()) redirect(next ?? "/");
  return (
    <AppShell nav={false}>
      <div className="px-6 pt-14 pb-10 flex-1 flex flex-col relative">
        <Link href={closeHref(next)} aria-label="Close" className="absolute right-4 top-4 w-10 h-10 flex items-center justify-center rounded-full text-ink-muted hover:bg-cream-deep/60">
          <XIcon size={20} />
        </Link>
        <Wordmark />
        <h1 className="mt-6 font-display text-[36px] leading-[1.02]">Join MyGuide.</h1>
        <p className="mt-2 text-[14px] text-ink-muted">
          {reasonText(why) ?? "Follow people whose taste you trust, save their favourite places, and make guides of your own."}
        </p>
        <div className="mt-8">
          <AuthForm mode="signup" next={next} why={why} providers={enabledProviders()} notice={sp.oauth === "failed" ? "That didn\u2019t work \u2014 please try again, or use your email." : sp.oauth === "unavailable" ? "That sign-in option isn\u2019t available right now." : null} />
        </div>
      </div>
    </AppShell>
  );
}
