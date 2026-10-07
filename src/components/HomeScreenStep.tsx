"use client";

import { useEffect, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import {
  canPromptInstall,
  onInstallPromptChange,
  promptInstall,
  pushState,
  subscribePush,
  type InstallPlatform,
  type PushState,
} from "@/lib/pushClient";
import { BellIcon, CheckIcon, PlusIcon, ShareIcon } from "./Icons";
import { Spinner, cx } from "./ui";

const bigButton = "h-14 w-full rounded-full text-[17px] font-semibold inline-flex items-center justify-center transition-colors disabled:opacity-60";
const cardShadow = "shadow-[0_6px_20px_oklch(22%_0.02_60/0.08)]";

/**
 * Last step of the intro: get MyGuide onto the home screen and alerts on.
 * iPhone: step-by-step pictures (Share → Add to Home Screen → Open as Web App → turn on alerts from the new icon).
 * Android: Chrome's own install prompt when available, plus alerts right here (they work in the browser).
 * Already in the home-screen app: just the alerts button.
 */
export function HomeScreenStep({
  platform,
  publicKey,
  onDone,
}: {
  platform: InstallPlatform;
  publicKey: string | null;
  onDone: () => Promise<void> | void;
}) {
  const [finishing, startFinish] = useTransition();
  const done = () => startFinish(async () => onDone());
  const ios = platform === "ios-safari" || platform === "ios-chrome" || platform === "ios-other";

  return (
    <div className="flex-1 flex flex-col px-6 pt-12">
      <div className="flex items-center justify-between min-h-11">
        <span className="font-display text-[26px] font-semibold text-terracotta leading-none">M.</span>
      </div>

      {platform === "standalone" ? (
        <AlertsOnly publicKey={publicKey} />
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-2">
            <h1 className="font-display text-[30px] leading-[1.15] font-semibold">Add MyGuide to your home screen</h1>
            <p className="text-[17px] leading-normal text-ink-muted">
              {ios
                ? "It opens like a normal app — and it’s the only way your iPhone can alert you when friends add new places."
                : "It opens like a normal app, one tap from your home screen."}
            </p>
          </div>
          {ios ? <IOSSteps platform={platform} /> : <AndroidSteps publicKey={publicKey} />}
        </>
      )}

      <div className="sticky bottom-0 mt-auto -mx-6 px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-cream from-75% to-transparent flex flex-col gap-1">
        <button type="button" onClick={done} disabled={finishing} className={cx(bigButton, "bg-ink text-cream hover:bg-ink/90")}>
          {finishing ? <Spinner /> : platform === "standalone" ? "Continue" : ios ? "Done" : "Continue"}
        </button>
        {platform !== "standalone" && (
          <button type="button" onClick={done} disabled={finishing} className="min-h-11 text-[15px] font-medium text-ink-muted hover:text-ink">
            I’ll do it later
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- iPhone ---------- */

function IOSSteps({ platform }: { platform: InstallPlatform }) {
  const chrome = platform === "ios-chrome";
  return (
    <div className="mt-5 flex flex-col gap-3 pb-4">
      {platform === "ios-other" && <OpenInSafari />}
      <Step
        n={1}
        title={<>Tap the <b className="text-terracotta">Share</b> button</>}
        body={
          chrome
            ? "It’s the square with an arrow pointing up, at the top right next to the web address."
            : "It’s the square with an arrow pointing up. Don’t see it? Tap ⋯ at the bottom right of Safari first."
        }
        art={chrome ? <ChromeBarArt /> : <SafariBarArt />}
      />
      <Step
        n={2}
        title={<>Tap <b className="text-terracotta">Add to Home Screen</b></>}
        body="Scroll down the list if it’s not near the top."
        art={<ShareSheetArt />}
      />
      <Step
        n={3}
        title={<>Keep <b className="text-terracotta">Open as Web App</b> on, then tap <b className="text-terracotta">Add</b></>}
        body="MyGuide now sits on your home screen like any other app."
        art={<AddSheetArt />}
      />
      <Step
        n={4}
        title={<>Open MyGuide from your home screen and tap <b className="text-terracotta">Turn on alerts</b></>}
        body="You’ll hear when people you follow add guides, and when someone follows you or comments."
        art={<OpenAppArt />}
      />
    </div>
  );
}

function OpenInSafari() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/`);
      setCopied(true);
    } catch {}
  };
  return (
    <div className="rounded-[18px] bg-ochre-soft/60 px-4 py-3.5 flex gap-3 items-center">
      <div className="flex-1 min-w-0 text-[14px] leading-snug">
        <span className="block font-semibold text-[15px]">Open this in Safari first</span>
        This browser can’t add apps to your home screen. Copy the link and paste it into Safari.
      </div>
      <button type="button" onClick={copy} className="h-10 px-3.5 rounded-full bg-paper text-[14px] font-semibold border-[1.5px] border-cream-line shrink-0">
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}

function Step({ n, title, body, art }: { n: number; title: ReactNode; body: string; art: ReactNode }) {
  return (
    <section className={cx("rounded-[20px] bg-paper p-4 flex flex-col gap-3.5", cardShadow)}>
      <div className="flex gap-3 items-start">
        <span className="w-7 h-7 rounded-full bg-terracotta text-white text-[14px] font-semibold flex items-center justify-center shrink-0 mt-0.5">{n}</span>
        <div className="min-w-0">
          <h2 className="text-[17px] leading-snug font-semibold">{title}</h2>
          <p className="mt-1 text-[14px] leading-snug text-ink-muted">{body}</p>
        </div>
      </div>
      <div className="rounded-[14px] bg-cream-deep/70 px-3 py-3.5 flex items-center justify-center" aria-hidden>
        {art}
      </div>
    </section>
  );
}

/** The highlighted thing to tap: terracotta, with a soft pulse. */
function Hot({ children, round = true, className }: { children: ReactNode; round?: boolean; className?: string }) {
  return (
    <span className={cx("relative isolate inline-flex items-center justify-center", className)}>
      {round && <span className="pulse-ring absolute inset-0 rounded-full" />}
      {children}
    </span>
  );
}

function SafariBarArt() {
  return (
    <div className="w-full flex items-center gap-3">
      {/* iOS 26 Safari: address pill with ⋯ beside it */}
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <span className="w-9 h-9 rounded-full bg-paper flex items-center justify-center text-ink-muted text-[18px] shrink-0">‹</span>
        <span className="flex-1 min-w-0 h-9 rounded-full bg-paper px-3 flex items-center text-[12.5px] text-ink-muted truncate">myguide-sepia.vercel.app</span>
        <Hot className="shrink-0">
          <span className="w-9 h-9 rounded-full bg-paper ring-2 ring-terracotta text-ink flex items-center justify-center text-[18px] font-bold leading-none pb-1.5">⋯</span>
        </Hot>
      </div>
      <span className="text-ink-muted text-[18px]">→</span>
      <Hot className="shrink-0">
        <span className="w-12 h-12 rounded-full bg-terracotta text-white flex items-center justify-center">
          <ShareIcon size={24} strokeWidth={2} />
        </span>
      </Hot>
    </div>
  );
}

function ChromeBarArt() {
  return (
    <div className="w-full flex items-center gap-2">
      <span className="flex-1 min-w-0 h-9 rounded-full bg-paper px-3 flex items-center text-[12.5px] text-ink-muted truncate">myguide-sepia.vercel.app</span>
      <Hot className="shrink-0">
        <span className="w-10 h-10 rounded-full bg-terracotta text-white flex items-center justify-center">
          <ShareIcon size={20} strokeWidth={2} />
        </span>
      </Hot>
    </div>
  );
}

function ShareSheetArt() {
  return (
    <div className="w-full max-w-[280px] rounded-[14px] bg-paper overflow-hidden text-[15px]">
      <div className="px-3.5 py-2.5 flex items-center justify-between text-ink-muted/70 border-b border-line">
        <span>Copy</span>
        <span className="w-5 h-5 rounded-[5px] border-[1.5px] border-current" />
      </div>
      <div className="px-3.5 py-2.5 flex items-center justify-between text-ink-muted/70 border-b border-line">
        <span>Add to Favourites</span>
        <span className="text-[16px] leading-none">☆</span>
      </div>
      <div className="px-3.5 py-2.5 flex items-center justify-between bg-terracotta-tint ring-2 ring-inset ring-terracotta rounded-[10px] font-semibold text-ink">
        <span>Add to Home Screen</span>
        <span className="w-6 h-6 rounded-[6px] border-[1.8px] border-ink flex items-center justify-center">
          <PlusIcon size={14} strokeWidth={2.4} />
        </span>
      </div>
    </div>
  );
}

function AddSheetArt() {
  return (
    <div className="w-full max-w-[280px] rounded-[14px] bg-paper overflow-hidden text-[15px]">
      <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-line">
        <span className="text-ink-muted/70">Cancel</span>
        <span className="font-semibold">Add to Home Screen</span>
        <Hot round={false}>
          <span className="px-2 py-0.5 rounded-full ring-2 ring-terracotta text-terracotta font-semibold">Add</span>
        </Hot>
      </div>
      <div className="px-3.5 py-3 flex items-center gap-3 border-b border-line">
        <img src="/icons/icon-192.png" alt="" width={36} height={36} className="w-9 h-9 rounded-[9px]" />
        <span className="font-medium">MyGuide</span>
      </div>
      <div className="px-3.5 py-2.5 flex items-center justify-between">
        <span>Open as Web App</span>
        <span className="w-[46px] h-7 rounded-full bg-[#34c759] p-0.5 flex justify-end ring-2 ring-terracotta ring-offset-2 ring-offset-paper">
          <span className="w-6 h-6 rounded-full bg-white shadow" />
        </span>
      </div>
    </div>
  );
}

function OpenAppArt() {
  return (
    <div className="w-full flex items-center justify-center gap-4">
      <div className="flex flex-col items-center gap-1">
        <Hot round={false}>
          <img src="/icons/icon-192.png" alt="" width={56} height={56} className="w-14 h-14 rounded-[14px] ring-2 ring-terracotta ring-offset-2 ring-offset-cream-deep" />
        </Hot>
        <span className="text-[12px] font-medium">MyGuide</span>
      </div>
      <span className="text-ink-muted text-[18px]">→</span>
      <span className="h-11 px-4 rounded-full bg-terracotta text-white text-[15px] font-semibold inline-flex items-center gap-2">
        <BellIcon size={18} /> Turn on alerts
      </span>
    </div>
  );
}

/* ---------- Android ---------- */

function AndroidSteps({ publicKey }: { publicKey: string | null }) {
  const canInstall = useSyncExternalStore(onInstallPromptChange, canPromptInstall, () => false);
  const [installed, setInstalled] = useState(false);

  return (
    <div className="mt-5 flex flex-col gap-3 pb-4">
      {installed ? (
        <div className={cx("rounded-[20px] bg-paper p-4 flex gap-3 items-center", cardShadow)}>
          <span className="w-9 h-9 rounded-full bg-sage-soft text-ink flex items-center justify-center shrink-0"><CheckIcon size={18} /></span>
          <div className="text-[15px] leading-snug"><b>MyGuide is on your home screen.</b> Open it from there next time.</div>
        </div>
      ) : canInstall ? (
        <div className={cx("rounded-[20px] bg-paper p-4 flex flex-col gap-3.5", cardShadow)}>
          <div className="flex gap-3 items-center">
            <img src="/icons/icon-192.png" alt="" width={48} height={48} className="w-12 h-12 rounded-[12px]" />
            <div className="text-[15px] leading-snug text-ink-muted">One tap adds the MyGuide icon to your home screen.</div>
          </div>
          <button
            type="button"
            onClick={async () => setInstalled(await promptInstall())}
            className={cx(bigButton, "h-12 text-[16px] bg-terracotta text-white hover:bg-terracotta-deep")}
          >
            Install MyGuide
          </button>
        </div>
      ) : (
        <>
          <Step
            n={1}
            title={<>Tap <b className="text-terracotta">⋮</b> at the top right of Chrome</>}
            body="The three dots next to the web address."
            art={
              <div className="w-full flex items-center gap-2">
                <span className="flex-1 min-w-0 h-9 rounded-full bg-paper px-3 flex items-center text-[12.5px] text-ink-muted truncate">myguide-sepia.vercel.app</span>
                <Hot className="shrink-0">
                  <span className="w-10 h-10 rounded-full bg-terracotta text-white flex items-center justify-center text-[22px] font-bold leading-none">⋮</span>
                </Hot>
              </div>
            }
          />
          <Step
            n={2}
            title={<>Tap <b className="text-terracotta">Add to Home screen</b>, then <b className="text-terracotta">Install</b></>}
            body="Some phones call it “Install app”."
            art={
              <div className="w-full max-w-[280px] rounded-[14px] bg-paper overflow-hidden text-[15px]">
                <div className="px-3.5 py-2.5 text-ink-muted/70 border-b border-line">Bookmarks</div>
                <div className="px-3.5 py-2.5 bg-terracotta-tint ring-2 ring-inset ring-terracotta rounded-[10px] font-semibold">Add to Home screen</div>
              </div>
            }
          />
        </>
      )}
      <AlertsCard publicKey={publicKey} />
    </div>
  );
}

/* ---------- Alerts ---------- */

function useAlerts(publicKey: string | null) {
  const [state, setState] = useState<PushState | "loading">("loading");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    pushState(publicKey).then(setState).catch(() => setState("unsupported"));
  }, [publicKey]);
  const turnOn = async () => {
    if (!publicKey) return;
    setBusy(true);
    try {
      setState(await subscribePush(publicKey));
    } catch {
      setState("off");
    } finally {
      setBusy(false);
    }
  };
  return { state, busy, turnOn };
}

function AlertsCard({ publicKey }: { publicKey: string | null }) {
  const { state, busy, turnOn } = useAlerts(publicKey);
  if (state === "loading" || state === "unsupported" || state === "ios-install") return null;
  return (
    <div className={cx("rounded-[20px] bg-paper p-4 flex gap-3 items-center", cardShadow)}>
      <span className="w-10 h-10 rounded-full bg-terracotta-tint text-terracotta flex items-center justify-center shrink-0"><BellIcon size={20} /></span>
      <div className="flex-1 min-w-0 text-[14px] leading-snug text-ink-muted">
        <span className="block text-[16px] font-semibold text-ink">{state === "on" ? "Alerts are on" : "Turn on alerts"}</span>
        {state === "denied" ? "Blocked — allow notifications for this site in Chrome settings." : "New guides from people you follow, new followers and comments."}
      </div>
      {state === "off" && (
        <button type="button" onClick={turnOn} disabled={busy} className="h-10 px-4 rounded-full bg-terracotta text-white text-[14px] font-semibold shrink-0 disabled:opacity-60">
          {busy ? <Spinner /> : "Turn on"}
        </button>
      )}
      {state === "on" && <CheckIcon size={20} className="text-terracotta shrink-0" />}
    </div>
  );
}

/** Inside the home-screen app: one big button. */
function AlertsOnly({ publicKey }: { publicKey: string | null }) {
  const { state, busy, turnOn } = useAlerts(publicKey);
  return (
    <div className="flex-1 flex flex-col justify-center items-center text-center gap-5 py-6">
      <Hot className="w-24 h-24">
        <span className="w-24 h-24 rounded-full bg-terracotta text-white flex items-center justify-center"><BellIcon size={44} /></span>
      </Hot>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[30px] leading-[1.15] font-semibold">{state === "on" ? "Alerts are on" : "Turn on alerts"}</h1>
        <p className="text-[17px] leading-normal text-ink-muted">
          {state === "denied"
            ? "Alerts are blocked. Turn them on in Settings › Notifications › MyGuide."
            : "Hear when people you follow add guides, and when someone follows you or comments."}
        </p>
      </div>
      {state === "off" && (
        <button type="button" onClick={turnOn} disabled={busy} className={cx(bigButton, "bg-terracotta text-white hover:bg-terracotta-deep")}>
          {busy ? <Spinner /> : "Turn on alerts"}
        </button>
      )}
    </div>
  );
}

/** Whether the intro should show this step at all on this device. */
export async function needsHomeScreenStep(platform: InstallPlatform, publicKey: string | null): Promise<boolean> {
  if (platform === "desktop") return false;
  if (platform !== "standalone") return true;
  return (await pushState(publicKey).catch(() => "unsupported")) === "off";
}
