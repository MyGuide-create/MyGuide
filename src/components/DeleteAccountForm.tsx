"use client";

import { useActionState, useState } from "react";
import { deleteAccount, type DeleteAccountState } from "@/lib/actions/account";
import { Button, Input, Spinner } from "./ui";

export function DeleteAccountForm({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<DeleteAccountState, FormData>(deleteAccount, {});
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[13px] font-medium text-danger">
        Delete my account…
      </button>
    );
  }
  return (
    <form action={action} className="rounded-2xl border border-danger/40 bg-danger-tint/40 px-4 py-3.5 flex flex-col gap-3">
      <p className="text-[13px] leading-relaxed">
        This permanently deletes your account, guides, places, photos, comments, favourites and trips. Copies other people made of your guides stay with them, without your name. <b>This can&apos;t be undone.</b>
      </p>
      <label className="text-[12.5px] text-ink-muted">
        Type <b>{username}</b> to confirm
        <Input name="confirm" autoCapitalize="none" autoCorrect="off" autoComplete="off" className="mt-1" />
      </label>
      {state.error && <p className="text-[12.5px] text-danger">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={pending}>{pending ? <Spinner /> : "Delete forever"}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="border border-line">Cancel</Button>
      </div>
    </form>
  );
}
