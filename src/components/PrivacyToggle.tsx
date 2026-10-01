"use client";

import { useState, useTransition } from "react";
import { setProfileVisibility } from "@/lib/actions/social";
import { GlobeIcon, LockIcon } from "./Icons";
import { cx } from "./ui";

export function PrivacyToggle({ initial }: { initial: "public" | "private" }) {
  const [visibility, setVisibility] = useState(initial);
  const [pending, start] = useTransition();

  const set = (v: "public" | "private") => {
    if (v === visibility || pending) return;
    const prev = visibility;
    setVisibility(v);
    start(async () => {
      try {
        await setProfileVisibility(v);
      } catch {
        setVisibility(prev);
      }
    });
  };

  return (
    <div>
      <div className="flex rounded-2xl border border-line p-1 gap-1">
        <button
          type="button"
          onClick={() => set("public")}
          className={cx("flex-1 rounded-xl py-2 text-[13px] font-medium inline-flex items-center justify-center gap-1.5", visibility === "public" ? "bg-ink text-cream" : "text-ink-muted")}
        >
          <GlobeIcon size={14} /> Public
        </button>
        <button
          type="button"
          onClick={() => set("private")}
          className={cx("flex-1 rounded-xl py-2 text-[13px] font-medium inline-flex items-center justify-center gap-1.5", visibility === "private" ? "bg-ink text-cream" : "text-ink-muted")}
        >
          <LockIcon size={14} /> Private
        </button>
      </div>
      <p className="mt-1.5 text-[11.5px] text-ink-muted leading-relaxed">
        {visibility === "private"
          ? "New followers need your approval before they can see your guides or comment on them."
          : "Anyone can follow you and see your published guides."}
      </p>
    </div>
  );
}
