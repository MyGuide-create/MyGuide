import { redirect } from "next/navigation";
import { AppShell, Wordmark } from "@/components/AppShell";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  if (await getCurrentUser()) redirect(next ?? "/");
  return (
    <AppShell nav={false}>
      <div className="px-6 pt-14 pb-10 flex-1 flex flex-col">
        <Wordmark />
        <h1 className="mt-6 font-display text-[36px] leading-[1.02]">Start your first guide.</h1>
        <p className="mt-2 text-[14px] text-ink-muted">Real places, your words, shared with people who trust your taste.</p>
        <div className="mt-8">
          <AuthForm mode="signup" next={next} />
        </div>
      </div>
    </AppShell>
  );
}
