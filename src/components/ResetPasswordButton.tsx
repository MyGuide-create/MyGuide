"use client";

import { useState, useTransition } from "react";
import { resetUserPassword, type ResetPasswordResult } from "@/lib/actions/admin";
import { CheckIcon } from "./Icons";
import { Sheet } from "./ShareSheet";
import { Button, Input, Spinner } from "./ui";

/**
 * Admin › Users: set a temporary password and show it once to copy and send.
 * `disabledReason` (Google/Apple-only accounts) shows instead of the button.
 */
export function ResetPasswordButton({ userId, username, displayName, disabledReason }: { userId: string; username: string; displayName: string; disabledReason?: string | null }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [result, setResult] = useState<ResetPasswordResult | null>(null);
  const [copied, setCopied] = useState<"password" | "message" | null>(null);
  const [pending, start] = useTransition();

  if (disabledReason) {
    return <span className="text-[11.5px] text-ink-faint" title="Google/Apple accounts have no password">{disabledReason}</span>;
  }

  const close = () => {
    setOpen(false);
    // Forget the password as soon as the sheet closes — it's only ever shown once.
    setResult(null);
    setCustom("");
    setCopied(null);
  };
  const firstName = displayName.trim().split(/\s+/)[0] || username;
  const message = result?.ok
    ? `Hi ${firstName} — I've reset your MyGuide password. Log in with @${result.username} (or ${result.email}) and this temporary password:\n\n${result.password}\n\nThen change it under You › Change password.`
    : "";
  const copy = async (what: "password" | "message", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setCopied(null);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-full border border-line px-3 py-1 text-[12px] font-medium text-ink-muted hover:border-terracotta-soft hover:text-ink">
        Reset password
      </button>
      {open && (
        <Sheet title="Reset password" onClose={close}>
          {!result?.ok ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => setResult(await resetUserPassword(userId, custom)));
              }}
            >
              <p className="text-[13.5px] leading-relaxed">
                Give <b>{displayName}</b> (@{username}) a temporary password. Their current password stops working straight away.
              </p>
              <label className="text-[12.5px] text-ink-muted">
                Temporary password
                <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Leave blank to make one up" autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} className="mt-1 font-mono text-[14px]" />
              </label>
              {result && !result.ok && <p className="text-[12.5px] text-danger">{result.error}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>{pending ? <Spinner /> : "Set temporary password"}</Button>
                <Button type="button" variant="ghost" onClick={close} className="border border-line">Cancel</Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] text-sage font-medium inline-flex items-center gap-1.5"><CheckIcon size={14} /> Done — @{result.username} can log in with this now.</p>
              <div className="rounded-2xl border border-line bg-paper px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.08em] text-ink-muted">Temporary password</div>
                <div className="mt-1 font-mono text-[18px] break-all select-all" data-testid="temp-password">{result.password}</div>
              </div>
              <p className="text-[12px] text-ink-muted leading-snug">
                Shown only this once — copy it before closing. Send it privately (WhatsApp, text). They can change it under You › Change password.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => copy("message", message)}>{copied === "message" ? "Message copied" : "Copy message to send"}</Button>
                <Button type="button" variant="outline" onClick={() => copy("password", result.password)}>{copied === "password" ? "Copied" : "Copy password"}</Button>
              </div>
              <Button type="button" variant="ghost" onClick={close} className="border border-line">Done</Button>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}
