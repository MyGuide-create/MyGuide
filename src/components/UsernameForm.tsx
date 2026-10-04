"use client";

import { useActionState } from "react";
import { changeUsername, type ProfileState } from "@/lib/actions/social";
import { Button, Input, Spinner } from "./ui";

/** "You're @hisham.samawi — change it?" for accounts made with Google / Apple. */
export function UsernameForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(changeUsername, {});
  return (
    <form action={action} className="rounded-2xl border border-line/70 bg-paper px-4 py-3.5">
      <label htmlFor="username" className="block text-[13px] font-semibold">Your username</label>
      <p className="text-[12px] text-ink-muted mt-0.5">This is how friends find you and how your guides are credited. Change it now if you like.</p>
      <div className="mt-2.5 flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint">@</span>
          <Input id="username" name="username" defaultValue={current} autoCapitalize="none" autoCorrect="off" pattern="[A-Za-z0-9_.]{3,24}" title="3–24 letters, numbers, dots or underscores" className="pl-8" required />
        </div>
        <Button type="submit" variant="outline" disabled={pending}>{pending ? <Spinner /> : "Save"}</Button>
      </div>
      {state.error && <p className="mt-1.5 text-[12px] text-danger">{state.error}</p>}
      {state.ok && <p className="mt-1.5 text-[12px] text-sage">Saved.</p>}
    </form>
  );
}
