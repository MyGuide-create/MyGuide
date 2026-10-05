"use client";

import { useActionState, useState } from "react";
import { changePassword, type ChangePasswordState } from "@/lib/actions/account";
import { Button, Input, Spinner } from "./ui";

/** Collapsed "Change password…" on the You page (password accounts only). */
export function ChangePasswordForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ChangePasswordState, FormData>(changePassword, {});
  if (state.done) return <p className="text-[13px] font-medium text-sage">Password changed. Use the new one next time you log in.</p>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start text-[13px] font-medium text-ink-muted hover:text-terracotta">
        Change password…
      </button>
    );
  }
  return (
    <form action={action} className="rounded-2xl border border-line bg-paper px-4 py-3.5 flex flex-col gap-2.5">
      <Input name="current" type="password" autoComplete="current-password" placeholder="Current (or temporary) password" required />
      <Input name="password" type="password" autoComplete="new-password" placeholder="New password, 8+ characters" minLength={8} required />
      <Input name="confirm" type="password" autoComplete="new-password" placeholder="New password again" minLength={8} required />
      {state.error && <p className="text-[12.5px] text-danger">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? <Spinner /> : "Change password"}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="border border-line">Cancel</Button>
      </div>
    </form>
  );
}
