"use client";

import { useActionState } from "react";
import { createTrip, type TripState } from "@/lib/actions/trips";
import { Button, Input, Label, Spinner } from "./ui";

export function TripForm({ defaultCity }: { defaultCity?: string }) {
  const [state, action, pending] = useActionState<TripState, FormData>(createTrip, {});
  return (
    <form action={action} className="flex flex-col gap-3 rounded-3xl border border-line bg-paper p-4">
      <div>
        <Label>Where are you going?</Label>
        <Input name="city" defaultValue={defaultCity} placeholder="Lisbon, Bali, Tokyo…" required />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>From</Label>
          <Input name="start" type="date" />
        </div>
        <div>
          <Label>To</Label>
          <Input name="end" type="date" />
        </div>
      </div>
      {state.error && <p className="text-[12.5px] text-danger">{state.error}</p>}
      <Button type="submit" disabled={pending}>{pending ? <Spinner /> : "Plan my trip"}</Button>
    </form>
  );
}
