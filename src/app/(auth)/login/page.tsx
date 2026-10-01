import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell, Wordmark } from "@/components/AppShell";
import { AuthForm } from "@/components/AuthForm";
import { XIcon } from "@/components/Icons";
import { getCurrentUser } from "@/lib/auth";
import { closeHref, parseReason, reasonText, safeNext } from "@/lib/authContext";
import { DEMO_PASSWORD } from "@/lib/seed";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const why = parseReason(sp.why);
  if (await getCurrentUser()) redirect(next ?? "/");
  const showDemo = process.env.SEED_DEMO !== "false" && process.env.NODE_ENV !== "production";
  const reason = reasonText(why);
  return (
    <AppShell nav={false}>
      <div className="px-6 pt-14 pb-10 flex-1 flex flex-col relative">
        <Link href={closeHref(next)} aria-label="Close" className="absolute right-4 top-4 w-10 h-10 flex items-center justify-center rounded-full text-ink-muted hover:bg-cream-deep/60">
          <XIcon size={20} />
        </Link>
        <Wordmark />
        <h1 className="mt-6 font-display text-[36px] leading-[1.02]">{next ? "Log in to continue." : "Welcome back."}</h1>
        <p className="mt-2 text-[14px] text-ink-muted">{reason ?? "Your guides and your people are where you left them."}</p>
        <div className="mt-8">
          <AuthForm mode="login" next={next} why={why} />
        </div>
        {showDemo && (
          <p className="mt-8 text-[12px] text-ink-faint text-center leading-relaxed">
            Demo accounts: <span className="text-ink-muted">yara@myguide.demo</span>, marco@, aiko@, leila@, tomas@, sam@ · password <span className="text-ink-muted">{DEMO_PASSWORD}</span>
          </p>
        )}
      </div>
    </AppShell>
  );
}
