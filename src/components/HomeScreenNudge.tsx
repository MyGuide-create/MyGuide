"use client";

import { useState, useSyncExternalStore } from "react";
import { canPromptInstall, installPlatform, onInstallPromptChange, promptInstall, type InstallPlatform } from "@/lib/pushClient";
import { HomeScreenStep } from "./HomeScreenStep";
import { XIcon } from "./Icons";

/** "Not now" (or skipping the intro's home-screen step) hides the card for this long. */
const HIDE_DAYS = 4;
export const INSTALL_NUDGE_KEY = "mg.installNudgeHidden";

/** Call when the person has just seen the home-screen steps (intro), so Home doesn't ask again straight away. */
export function snoozeInstallNudge() {
  try {
    localStorage.setItem(INSTALL_NUDGE_KEY, String(Date.now()));
  } catch {
    /* private mode */
  }
  for (const fn of listeners) fn();
}

function snoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(INSTALL_NUDGE_KEY) || 0);
    return at > 0 && Date.now() - at < HIDE_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/**
 * On Home, for someone using MyGuide in a phone browser instead of from its home-screen icon:
 * a small card that opens the same steps as the intro (13 Oct 2026). Never on a computer, never in
 * the home-screen app, never for someone who has opened it from the icon before (they just tapped
 * a link), and "Not now" hides it for a few days.
 */
export function HomeScreenNudge({ hasIcon, publicKey }: { hasIcon: boolean; publicKey: string | null }) {
  // Server render and first paint: nothing (platform and storage are browser-only).
  const platform = useSyncExternalStore<InstallPlatform | null>(subscribe, installPlatform, () => null);
  const hidden = useSyncExternalStore(subscribe, snoozed, () => true);
  const canInstall = useSyncExternalStore(onInstallPromptChange, canPromptInstall, () => false);
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState(false);

  if (!platform || platform === "desktop" || platform === "standalone" || hasIcon || installed) return null;
  if (hidden && !open) return null;
  const inApp = platform === "ios-other";

  return (
    <>
      <div className="mx-4 mt-5 rounded-2xl bg-ink text-cream px-4 py-3.5 flex gap-3 items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={44} height={44} className="w-11 h-11 rounded-[11px] shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[14.5px] font-semibold leading-snug">{inApp ? "Open MyGuide in Safari" : "Add MyGuide to your home screen"}</p>
          <p className="text-[12.5px] text-cream/75 leading-snug">{inApp ? "Then add it to your home screen — it opens like an app." : "It opens like an app, one tap away."}</p>
          <div className="mt-2.5 flex items-center gap-2">
            {platform === "android" && canInstall ? (
              <button
                type="button"
                onClick={async () => setInstalled(await promptInstall())}
                className="h-9 px-4 rounded-full bg-cream text-ink text-[13.5px] font-semibold"
              >
                Install
              </button>
            ) : (
              <button type="button" onClick={() => setOpen(true)} className="h-9 px-4 rounded-full bg-cream text-ink text-[13.5px] font-semibold">
                Show me how
              </button>
            )}
            <button type="button" onClick={snoozeInstallNudge} className="h-9 px-3 text-[13px] text-cream/80">
              Not now
            </button>
          </div>
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-cream overflow-y-auto flex flex-col" role="dialog" aria-modal="true" aria-label="Add MyGuide to your home screen">
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute right-4 top-4 z-10 w-9 h-9 rounded-full border border-line bg-paper flex items-center justify-center">
            <XIcon size={15} />
          </button>
          <HomeScreenStep
            platform={platform}
            publicKey={publicKey}
            onDone={() => {
              setOpen(false);
              snoozeInstallNudge();
            }}
          />
        </div>
      )}
    </>
  );
}
