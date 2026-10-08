import { AppShell, TopBar } from "@/components/AppShell";
import { VoiceCreate } from "@/components/VoiceCreate";
import { requireUser } from "@/lib/auth";
import { wishesForMaking } from "@/lib/wishes";
import { SparkleIcon } from "@/components/Icons";
import { namesSentence } from "@/lib/utils";

export const dynamic = "force-dynamic";
// createGuide runs as this page's server action; an imported Google Maps list can have 100+ places.
export const maxDuration = 60;
export const metadata = { title: "Create a guide" };

export default async function CreatePage({ searchParams }: PageProps<"/create">) {
  const sp = await searchParams;
  const wishParam = typeof sp.wish === "string" ? sp.wish : "";
  const user = await requireUser(`/create${wishParam ? `?wish=${encodeURIComponent(wishParam)}` : ""}`);
  // "Make this guide" from someone's wish list: who it's for, sent to them when published.
  const wanted = wishParam ? await wishesForMaking(wishParam.split(","), user.id) : [];
  const forWish = wanted.length
    ? { ids: wanted.map((w) => w.wish.id), city: wanted[0].wish.city, names: wanted.map((w) => w.user.displayName.split(" ")[0]) }
    : null;
  return (
    <AppShell nav={false}>
      <TopBar back={forWish ? "/wishes" : "/"} title="Create a guide" />
      {forWish && (
        <div className="mx-4 mt-3 rounded-2xl bg-terracotta-tint/70 px-4 py-3 text-[13px] leading-snug flex gap-2.5 items-start">
          <SparkleIcon size={16} className="shrink-0 mt-0.5 text-terracotta" />
          <span>
            <b className="font-semibold">A {forWish.city} guide for {namesSentence(forWish.names, 2)}</b> — from their wish list. It&apos;s shared with {forWish.names.length === 1 ? "them" : "them all"} the moment you publish.
          </span>
        </div>
      )}
      <VoiceCreate forWish={forWish} />
    </AppShell>
  );
}
