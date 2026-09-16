import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { initials, hashInt } from "@/lib/utils";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg";

const variantClass: Record<Variant, string> = {
  primary: "bg-terracotta text-white hover:bg-terracotta-deep active:bg-terracotta-deep shadow-[0_2px_8px_oklch(62%_0.13_45/0.25)]",
  secondary: "bg-ink text-cream hover:bg-ink/90",
  ghost: "bg-transparent text-ink hover:bg-cream-deep/60",
  outline: "border border-terracotta text-terracotta hover:bg-terracotta-tint",
  danger: "bg-danger-tint text-danger hover:bg-danger/15",
};
const sizeClass: Record<Size, string> = {
  sm: "text-[12.5px] px-3.5 py-1.5 gap-1.5",
  md: "text-[14px] px-4.5 py-2.5 gap-2",
  lg: "text-[15px] px-6 py-3.5 gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center rounded-full font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none select-none",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  children,
  href,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; variant?: Variant; size?: Size }) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center justify-center rounded-full font-medium transition-colors select-none",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}

export function Chip({
  active,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cx(
        "shrink-0 rounded-full px-[15px] py-[7px] text-[12.5px] font-medium transition-colors whitespace-nowrap",
        active ? "bg-terracotta text-white" : "border border-line text-ink-muted hover:border-terracotta-soft hover:text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Tag({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "sage" | "terracotta" | "warn"; className?: string }) {
  const tones = {
    neutral: "bg-cream-deep text-ink-muted",
    sage: "bg-sage-tint text-sage",
    terracotta: "bg-terracotta-tint text-terracotta",
    warn: "bg-ochre-soft text-ink",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium", tones[tone], className)}>{children}</span>;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "w-full rounded-2xl border border-line bg-paper px-4 py-3 text-[15px] text-ink placeholder:text-ink-faint outline-none focus:border-terracotta-soft focus:ring-2 focus:ring-terracotta/15",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(
        "w-full rounded-2xl border border-line bg-paper px-4 py-3 text-[15px] leading-relaxed text-ink placeholder:text-ink-faint outline-none focus:border-terracotta-soft focus:ring-2 focus:ring-terracotta/15 resize-none",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <label className={cx("block text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted mb-1.5", className)}>{children}</label>;
}

const AVATAR_TONES = ["bg-terracotta", "bg-sage", "bg-ochre", "bg-terracotta-soft", "bg-sage-soft"];

export function Avatar({
  user,
  size = 36,
  className,
}: {
  user: { username: string; displayName: string; avatarMediaId?: string | null };
  size?: number;
  className?: string;
}) {
  const tone = AVATAR_TONES[hashInt(user.username, AVATAR_TONES.length)];
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)) };
  if (user.avatarMediaId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/media/${user.avatarMediaId}`}
        alt={user.displayName}
        style={style}
        className={cx("rounded-full object-cover shrink-0 bg-cream-deep", className)}
      />
    );
  }
  return (
    <div style={style} className={cx("rounded-full text-white font-semibold flex items-center justify-center shrink-0", tone, className)}>
      {initials(user.displayName || user.username)}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-display text-[24px] leading-tight text-ink">{title}</p>
      {body && <p className="mt-2 text-[13.5px] text-ink-muted leading-relaxed">{body}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className)} width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
