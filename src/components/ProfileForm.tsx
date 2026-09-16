"use client";

import { useActionState, useState } from "react";
import { updateProfile, type ProfileState } from "@/lib/actions/social";
import { PhotoPicker } from "./PhotoPicker";
import { Avatar, Button, Input, Label, Spinner, Textarea } from "./ui";

export function ProfileForm({ user }: { user: { username: string; displayName: string; bio: string | null; avatarMediaId: string | null } }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateProfile, {});
  const [avatar, setAvatar] = useState(user.avatarMediaId);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="avatarMediaId" value={avatar ?? ""} />
      <div className="flex items-center gap-4">
        <Avatar user={{ ...user, avatarMediaId: avatar }} size={64} />
        <PhotoPicker onUploaded={(id) => setAvatar(id)} label="Change photo" className="text-[13px] font-medium text-terracotta" />
      </div>
      <div>
        <Label>Display name</Label>
        <Input name="displayName" defaultValue={user.displayName} required />
      </div>
      <div>
        <Label>Bio</Label>
        <Textarea name="bio" rows={3} defaultValue={user.bio ?? ""} placeholder="Where you're from, where you keep going back to." maxLength={240} />
      </div>
      {state.error && <p className="text-[13px] text-danger">{state.error}</p>}
      {state.ok && <p className="text-[13px] text-sage">Saved.</p>}
      <Button type="submit" disabled={pending}>{pending ? <Spinner /> : "Save profile"}</Button>
    </form>
  );
}
