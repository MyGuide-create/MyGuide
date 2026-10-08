"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/errorText";
import "./globals.css";

/** Last resort when even the app's frame fails to load. */
export default function GlobalError({ error, retry, reset }: { error: unknown; retry?: () => void; reset: () => void }) {
  useEffect(() => reportError(error, "The app couldn't load"), [error]);
  return (
    <html lang="en">
      <body className="min-h-full flex flex-col bg-cream text-ink">
        <div className="mx-auto w-full max-w-[480px] px-6 py-24 text-center">
          <p className="text-[30px] font-semibold leading-tight">MyGuide didn’t load.</p>
          <p className="mt-3 text-[14px] text-ink-muted leading-relaxed">Something on our side went wrong. Try again in a moment — if it keeps happening, message Hisham.</p>
          <button type="button" onClick={() => (retry ?? reset)()} className="mt-7 h-12 w-full max-w-[280px] rounded-full bg-terracotta text-white text-[15px] font-semibold">
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
