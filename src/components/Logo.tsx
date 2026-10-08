import { cx } from "./ui";

/** The app icon + "MyGuide" wordmark, used at the top of the intro screens. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <img src="/icons/icon-192.png" alt="" width={32} height={32} className="w-8 h-8 rounded-[8px]" />
      <span className="font-display text-[22px] leading-none tracking-tight">
        My<span className="text-terracotta">Guide</span>
      </span>
    </span>
  );
}
