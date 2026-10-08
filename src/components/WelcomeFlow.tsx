"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { markOnboarded } from "@/lib/actions/account";
import { followMany, toggleFollow, type FollowStatus } from "@/lib/actions/social";
import { installPlatform, type InstallPlatform } from "@/lib/pushClient";
import { HomeScreenStep, needsHomeScreenStep } from "./HomeScreenStep";
import { GuideCover } from "./GuideCover";
import { CameraIcon, HeartIcon, MapIcon, PinIcon } from "./Icons";
import { Logo } from "./Logo";
import { UsernameForm } from "./UsernameForm";
import { Avatar, Spinner, cx } from "./ui";

type MiniUser = { id: string; username: string; displayName: string; avatarMediaId?: string | null };
export type WelcomePerson = MiniUser & { guideCount: number; status: FollowStatus };
export type WelcomeSample = {
  guide: { id: string; title: string; city: string; country: string; coverMediaId?: string | null; coverUrl?: string | null };
  owner: MiniUser;
  placeCount: number;
};

const SLIDES = [
  { title: "Guides from people you trust", body: "Follow friends and see the places they actually love — not ads or top-10 lists." },
  { title: "Save places you like", body: "Tap ♥ on any place and it’s kept for your next trip." },
  { title: "Share your own in seconds", body: "Bring in your Google Maps saved lists, screenshots or WhatsApp recommendations." },
];

type Stage = "username" | "slides" | "follow" | "home";

const bigButton = "h-14 w-full rounded-full text-[17px] font-semibold inline-flex items-center justify-center transition-colors disabled:opacity-60";

/**
 * New-user intro: (username for Google/Apple sign-ups) → three swipeable slides → people to follow
 * → add to home screen + alerts (phones only; skipped when already installed with alerts on).
 * `tour` replays the slides and the home-screen step (from the You page) and never touches onboarding state.
 */
export function WelcomeFlow({
  firstName,
  askUsername,
  currentUsername,
  tour,
  exitHref,
  people,
  samples,
  finish,
  pushPublicKey,
  initialStep,
}: {
  firstName: string;
  askUsername: boolean;
  currentUsername: string;
  tour: boolean;
  exitHref: string;
  people: WelcomePerson[];
  samples: WelcomeSample[];
  /** Marks onboarding done and redirects to `next` (bound server action). */
  finish: () => Promise<void>;
  pushPublicKey: string | null;
  /** From ?step= — so going back (or returning from Safari's Share sheet) lands on the same step, not slide 1. */
  initialStep?: string;
}) {
  const router = useRouter();
  const [stage, setStageRaw] = useState<Stage>(() => {
    if (initialStep === "follow" && !tour) return "follow";
    if (initialStep === "home") return "home";
    if (initialStep === "slides") return "slides";
    return askUsername && !tour ? "username" : "slides";
  });
  // Keep the step in the address so back/refresh returns here instead of restarting the intro.
  const setStage = (s: Stage) => {
    setStageRaw(s);
    // Through the router (not history.replaceState) so a server-action refresh doesn't drop it.
    const params = new URLSearchParams(window.location.search);
    params.set("step", s);
    router.replace(`/welcome?${params.toString()}`, { scroll: false });
    window.scrollTo({ top: 0 });
  };
  const [platform, setPlatform] = useState<InstallPlatform>("desktop");
  const [showHome, setShowHome] = useState(false);
  useEffect(() => {
    const p = installPlatform();
    needsHomeScreenStep(p, pushPublicKey)
      .then((show) => {
        setPlatform(p);
        setShowHome(show);
      })
      .catch(() => {});
  }, [pushPublicKey]);

  // After following: phones get the home-screen step (onboarding is saved first, since iPhone users leave Safari for it).
  const afterFollow = async () => {
    if (!showHome) return finish();
    await markOnboarded().catch(() => {});
    setStage("home");
  };
  const [index, setIndex] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  const goTo = (i: number) => {
    const el = scroller.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setIndex(i);
  };
  const last = index === SLIDES.length - 1;

  if (stage === "username") {
    return (
      <Screen>
        <Header />
        <div className="flex-1 flex flex-col justify-center gap-5">
          <div className="text-center">
            <h1 className="font-display text-[30px] leading-[1.15] font-semibold">Welcome, {firstName}.</h1>
            <p className="mt-2 text-[17px] leading-normal text-ink-muted">First, check the name friends will find you by.</p>
          </div>
          <UsernameForm current={currentUsername} />
        </div>
        <button type="button" onClick={() => setStage("slides")} className={cx(bigButton, "mt-6 bg-terracotta text-white hover:bg-terracotta-deep")}>
          Continue
        </button>
      </Screen>
    );
  }

  const total = tour ? 2 : showHome ? 3 : 2;
  if (stage === "follow") return <FollowStep people={people} finish={afterFollow} stepLabel={`Step 2 of ${total}`} />;
  if (stage === "home")
    return (
      <HomeScreenStep
        platform={platform}
        publicKey={pushPublicKey}
        stepLabel={`Step ${total} of ${total}`}
        onDone={tour ? () => router.push(exitHref) : finish}
      />
    );

  return (
    <Screen>
      <Header
        right={
          tour ? (
            <Link href={exitHref} className="min-h-11 min-w-11 flex items-center justify-end text-[16px] font-medium text-ink-muted hover:text-ink">Close</Link>
          ) : (
            <button type="button" onClick={() => setStage("follow")} className="min-h-11 min-w-11 flex items-center justify-end text-[15px] font-medium text-ink-muted hover:text-ink whitespace-nowrap">Skip intro</button>
          )
        }
      />
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (i !== index) setIndex(i);
        }}
        className="-mx-6 flex-1 flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
        aria-roledescription="carousel"
      >
        {SLIDES.map((s, i) => (
          <section key={s.title} aria-label={`${i + 1} of ${SLIDES.length}`} className="w-full shrink-0 snap-center px-6 flex flex-col gap-6">
            <div className="flex-1 min-h-[300px] flex items-center justify-center py-2">
              {i === 0 ? <TrustArt samples={samples} /> : i === 1 ? <SaveArt /> : <ShareArt />}
            </div>
            <div className="flex flex-col gap-2.5 text-center">
              <h2 className="font-display text-[30px] leading-[1.15] font-semibold">{s.title}</h2>
              <p className="text-[17px] leading-normal text-ink-muted">{s.body}</p>
            </div>
          </section>
        ))}
      </div>
      <div className="mt-6 flex gap-2 items-center justify-center" aria-hidden>
        {SLIDES.map((s, i) => (
          <span key={s.title} className={cx("h-2 rounded-full transition-all", i === index ? "w-6 bg-terracotta" : "w-2 bg-cream-line")} />
        ))}
      </div>
      {last && tour && !showHome ? (
        <Link href={exitHref} className={cx(bigButton, "mt-6 bg-terracotta text-white hover:bg-terracotta-deep")}>Done</Link>
      ) : (
        <button type="button" onClick={() => (last ? setStage(tour ? "home" : "follow") : goTo(index + 1))} className={cx(bigButton, "mt-6 bg-terracotta text-white hover:bg-terracotta-deep")}>
          {last ? (tour ? "Next" : "Find people to follow") : "Next"}
        </button>
      )}
    </Screen>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return <div className="flex-1 flex flex-col px-6 pt-12 pb-[max(2rem,env(safe-area-inset-bottom))] overflow-hidden">{children}</div>;
}

/** Logo centred, with an optional action (Skip / Close) on the right. */
function Header({ right }: { right?: ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center min-h-11">
      <span />
      <Logo />
      <span className="flex justify-end">{right}</span>
    </div>
  );
}

const cardShadow = "shadow-[0_10px_30px_oklch(22%_0.02_60/0.12)]";

function MiniGuideCard({ sample, className }: { sample: WelcomeSample; className?: string }) {
  return (
    <div className={cx("absolute w-[264px] rounded-[20px] bg-paper overflow-hidden", cardShadow, className)}>
      <GuideCover guide={sample.guide} ownerUsername={sample.owner.username} bare className="h-[88px]" />
      <div className="px-4 py-3.5 flex gap-3 items-center">
        <Avatar user={sample.owner} size={40} />
        <div className="min-w-0">
          <div className="text-[16px] font-semibold truncate">{sample.guide.title}</div>
          <div className="text-[13px] text-ink-muted truncate">
            {sample.owner.displayName} · {sample.placeCount} place{sample.placeCount === 1 ? "" : "s"}
          </div>
        </div>
      </div>
    </div>
  );
}

const FALLBACK_SAMPLES: WelcomeSample[] = [
  { guide: { id: "intro-a", title: "Weekend favourites", city: "", country: "" }, owner: { id: "a", username: "a.friend", displayName: "A friend" }, placeCount: 10 },
  { guide: { id: "intro-b", title: "Coffee & breakfast", city: "", country: "" }, owner: { id: "b", username: "someone.you.know", displayName: "Someone you know" }, placeCount: 8 },
];

function TrustArt({ samples }: { samples: WelcomeSample[] }) {
  const [a, b] = samples.length >= 2 ? samples : FALLBACK_SAMPLES;
  return (
    <div className="relative w-[304px] h-[326px]" aria-hidden>
      <MiniGuideCard sample={a} className="top-0 left-0 -rotate-3" />
      <MiniGuideCard sample={b} className="top-[164px] left-[40px] rotate-2" />
    </div>
  );
}

function SaveArt() {
  return (
    <div className={cx("w-[296px] rounded-[20px] bg-paper overflow-hidden", cardShadow)} aria-hidden>
      <div className="relative h-[150px] bg-[linear-gradient(135deg,oklch(86%_0.07_75),oklch(78%_0.09_45))]">
        <span className="absolute top-3 right-3 w-12 h-12 rounded-full bg-paper text-terracotta flex items-center justify-center shadow-md">
          <span className="pulse-ring absolute inset-0 rounded-full" />
          <HeartIcon size={24} filled />
        </span>
      </div>
      <div className="px-4 py-3.5 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-semibold">Ettore Gelato</div>
          <div className="text-[13px] text-ink-muted">Gelato · Canggu</div>
        </div>
        <span className="rounded-full bg-terracotta-tint text-terracotta px-3 py-1 text-[13px] font-semibold inline-flex items-center gap-1">
          <HeartIcon size={14} filled /> Saved
        </span>
      </div>
    </div>
  );
}

function ShareArt() {
  const tiles = [
    { icon: <MapIcon size={30} />, title: "Google Maps lists", tone: "bg-sage text-white" },
    { icon: <CameraIcon size={30} />, title: "Screenshots", tone: "bg-ochre text-ink" },
    { icon: <PinIcon size={30} />, title: "Add a place", tone: "bg-terracotta text-white" },
  ];
  return (
    <div className="w-full grid grid-cols-3 gap-3" aria-hidden>
      {tiles.map((t) => (
        <div key={t.title} className={cx("rounded-[20px] bg-paper px-2 pt-5 pb-4 flex flex-col items-center gap-3", cardShadow)}>
          <span className={cx("w-16 h-16 rounded-[18px] flex items-center justify-center", t.tone)}>{t.icon}</span>
          <span className="text-[14px] font-semibold text-center leading-tight">{t.title}</span>
        </div>
      ))}
    </div>
  );
}

function FollowStep({ people, finish, stepLabel }: { people: WelcomePerson[]; finish: () => Promise<void>; stepLabel: string }) {
  const [status, setStatus] = useState<Record<string, FollowStatus>>(() => Object.fromEntries(people.map((p) => [p.id, p.status])));
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [allPending, startAll] = useTransition();
  const [finishing, startFinish] = useTransition();
  const count = people.filter((p) => status[p.id] !== "none").length;
  const anyLeft = people.some((p) => status[p.id] === "none");

  const toggle = async (id: string) => {
    const prev = status[id];
    setBusy((b) => ({ ...b, [id]: true }));
    setStatus((s) => ({ ...s, [id]: prev === "none" ? "accepted" : "none" })); // optimistic
    try {
      const r = await toggleFollow(id, "/welcome");
      setStatus((s) => ({ ...s, [id]: r.status }));
    } catch {
      setStatus((s) => ({ ...s, [id]: prev }));
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  const followAll = () =>
    startAll(async () => {
      const ids = people.filter((p) => status[p.id] === "none").map((p) => p.id);
      const r = await followMany(ids);
      setStatus((s) => ({ ...s, ...r }));
    });

  return (
    <div className="flex-1 flex flex-col px-6 pt-12">
      <Header />
      <div className="mt-6 flex flex-col gap-2 text-center">
        <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-terracotta">{stepLabel}</span>
        <h1 className="font-display text-[30px] leading-[1.15] font-semibold">Follow people you know</h1>
        <p className="text-[17px] leading-normal text-ink-muted">Their guides show up on your Home, and you&apos;ll hear when they add something new.</p>
      </div>

      {people.length > 0 ? (
        <>
          <div className="mt-5 flex items-center justify-between min-h-11">
            <span className="text-[14px] font-medium text-ink-muted">On MyGuide</span>
            {anyLeft && (
              <button type="button" onClick={followAll} disabled={allPending} className="min-h-11 px-1 text-[15px] font-semibold text-terracotta disabled:opacity-60">
                {allPending ? <Spinner /> : "Follow all"}
              </button>
            )}
          </div>
          <ul className="mt-1 flex flex-col gap-2.5 pb-4">
            {people.map((p) => {
              const s = status[p.id];
              return (
                <li key={p.id} className="rounded-[18px] bg-paper px-3.5 py-3 flex gap-3 items-center">
                  {/* Tapping a name follows/unfollows — it doesn't leave the intro (going back used to restart it). */}
                  <button type="button" onClick={() => toggle(p.id)} disabled={busy[p.id] || allPending} className="flex gap-3 items-center flex-1 min-w-0 text-left">
                    <Avatar user={p} size={48} />
                    <div className="min-w-0">
                      <div className="text-[16px] font-semibold truncate">{p.displayName}</div>
                      <div className="text-[13px] text-ink-muted truncate">
                        @{p.username} · {p.guideCount ? `${p.guideCount} guide${p.guideCount === 1 ? "" : "s"}` : "New on MyGuide"}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(p.id)}
                    disabled={busy[p.id] || allPending}
                    aria-pressed={s !== "none"}
                    className={cx(
                      "h-10 min-w-[104px] px-3.5 rounded-full text-[14px] font-semibold border-[1.5px] transition-colors disabled:opacity-70",
                      s === "none" ? "bg-terracotta border-terracotta text-white hover:bg-terracotta-deep" : "bg-paper border-cream-line text-ink",
                    )}
                  >
                    {s === "accepted" ? "Following" : s === "pending" ? "Requested" : "Follow"}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="mt-6 rounded-2xl bg-cream-deep/60 px-4 py-3.5 text-[14px] text-ink-muted leading-relaxed text-center">
          You&rsquo;re one of the first here. You can find people any time from Search.
        </p>
      )}

      <div className="sticky bottom-0 mt-auto -mx-6 px-6 pt-3 pb-[max(2rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-cream from-70% to-transparent">
        <form action={() => startFinish(() => finish())}>
          <button type="submit" disabled={finishing} className={cx(bigButton, "bg-ink text-cream hover:bg-ink/90")}>
            {finishing ? <Spinner /> : count > 0 ? `Done · following ${count}` : "Skip for now"}
          </button>
        </form>
      </div>
    </div>
  );
}
