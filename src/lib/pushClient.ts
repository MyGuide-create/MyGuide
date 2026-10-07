"use client";

/** Browser-side helpers shared by PushToggle, the welcome "home screen" step and the first-open alerts nudge. */

export type PushState = "unsupported" | "ios-install" | "denied" | "off" | "on";

/** Which "add to home screen" instructions fit this browser. */
export type InstallPlatform = "standalone" | "ios-safari" | "ios-chrome" | "ios-other" | "android" | "desktop";

export function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch points give it away.
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function installPlatform(): InstallPlatform {
  if (isStandalone()) return "standalone";
  const ua = navigator.userAgent;
  if (isIOS()) {
    if (/CriOS/i.test(ua)) return "ios-chrome";
    // Firefox, Edge, and in-app browsers (Instagram, Facebook, LinkedIn…) can't add web apps reliably.
    if (/FxiOS|EdgiOS|OPiOS|Instagram|FBAN|FBAV|LinkedInApp|Snapchat|Line\//i.test(ua)) return "ios-other";
    return "ios-safari";
  }
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

export async function pushState(publicKey: string | null): Promise<PushState> {
  if (!publicKey || !("serviceWorker" in navigator)) return "unsupported";
  if (!("PushManager" in window)) return isIOS() && !isStandalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Asks for permission and saves the subscription. Must run from a tap (iOS requires a user gesture). */
export async function subscribePush(publicKey: string): Promise<PushState> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "off";
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource });
  await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
  return "on";
}

export async function unsubscribePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
    await sub.unsubscribe();
  }
}

/** Android/desktop Chrome's install prompt, captured as early as possible (it fires once, soon after load). */
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let deferredInstall: InstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstall = e as InstallPromptEvent;
    installListeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    installListeners.forEach((fn) => fn());
  });
}
export function canPromptInstall(): boolean {
  return deferredInstall !== null;
}
export function onInstallPromptChange(fn: () => void): () => void {
  installListeners.add(fn);
  return () => {
    installListeners.delete(fn);
  };
}
export async function promptInstall(): Promise<boolean> {
  const e = deferredInstall;
  if (!e) return false;
  await e.prompt();
  const { outcome } = await e.userChoice;
  deferredInstall = null;
  installListeners.forEach((fn) => fn());
  return outcome === "accepted";
}
