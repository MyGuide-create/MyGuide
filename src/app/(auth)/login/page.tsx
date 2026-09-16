import { redirect } from "next/navigation";
import { AppShell, Wordmark } from "@/components/AppShell";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";
import { DEMO_PASSWORD } from "@/lib/seed";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  if (await getCurrentUser()) redirect(next ?? "/");
  const showDemo = process.env.SEED_DEMO !== "false" && process.env.NODE_ENV !== "production";
  return (
    <AppShell nav={false}>
      <div className="px-6 pt-14 pb-10 flex-1 flex flex-col">
        <Wordmark />
        <h1 className="mt-6 font-display text-[36px] leading-[1.02]">Welcome back.</h1>
        <p className="mt-2 text-[14px] text-ink-muted">Your guides and your people are where you left them.</p>
        <div className="mt-8">
          <AuthForm mode="login" next={next} />
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
