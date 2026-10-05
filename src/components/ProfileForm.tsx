"use client";

import { useActionState, useState, type ReactNode } from "react";
import { updateProfile, type ProfileState } from "@/lib/actions/social";
import { EditIcon } from "./Icons";
import { PhotoPicker } from "./PhotoPicker";
import { Avatar, Button, Input, Label, Spinner, Textarea } from "./ui";

type ProfileFields = { displayName: string; bio: string | null; avatarMediaId: string | null; instagram?: string | null; website?: string | null };

/**
 * Your profile details on the You page. Shown as plain text; "Edit profile" turns them into boxes,
 * and saving turns them back into text — the change you see is the confirmation (like expert tips).
 */
export function ProfileForm({ user }: { user: ProfileFields & { username: string } }) {
  const [saved, setSaved] = useState<ProfileFields>(user);
  const [editing, setEditing] = useState(false);
  const [avatar, setAvatar] = useState(user.avatarMediaId);
  const [state, action, pending] = useActionState<ProfileState, FormData>(async (prev, fd) => {
    const r = await updateProfile(prev, fd);
    if (r.ok && r.saved) {
      setSaved(r.saved);
      setAvatar(r.saved.avatarMediaId);
      setEditing(false);
    }
    return r;
  }, {});

  if (!editing) {
    const site = saved.website?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
    return (
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Avatar user={{ username: user.username, displayName: saved.displayName, avatarMediaId: saved.avatarMediaId }} size={64} />
          <div className="flex-1 min-w-0">
            <div className="font-display text-[24px] leading-[1.05] break-words">{saved.displayName}</div>
            <div className="text-[12.5px] text-ink-muted">@{user.username}</div>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)} className="shrink-0">
            <EditIcon size={14} /> Edit profile
          </Button>
        </div>
        <Field label="Bio">
          {saved.bio ? <p className="text-[14.5px] leading-relaxed italic whitespace-pre-line">{saved.bio}</p> : <Empty>No bio yet</Empty>}
        </Field>
        <Field label="Instagram">
          {saved.instagram ? <p className="text-[14.5px]">@{saved.instagram}</p> : <Empty>Not added</Empty>}
        </Field>
        <Field label="Website">
          {site ? <p className="text-[14.5px] break-all">{site}</p> : <Empty>Not added</Empty>}
        </Field>
      </section>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="avatarMediaId" value={avatar ?? ""} />
      <div className="flex items-center gap-4">
        <Avatar user={{ username: user.username, displayName: saved.displayName, avatarMediaId: avatar }} size={64} />
        <PhotoPicker onUploaded={(id) => setAvatar(id)} label="Change photo" className="text-[13px] font-medium text-terracotta" />
      </div>
      <div>
        <Label>Display name</Label>
        <Input name="displayName" defaultValue={saved.displayName} required autoFocus />
      </div>
      <div>
        <Label>Bio</Label>
        <Textarea name="bio" rows={3} defaultValue={saved.bio ?? ""} placeholder="Where you're from, where you keep going back to." maxLength={240} />
      </div>
      <div>
        <Label>Instagram</Label>
        <Input name="instagram" defaultValue={saved.instagram ? `@${saved.instagram}` : ""} placeholder="@yourhandle" autoCapitalize="none" autoCorrect="off" />
      </div>
      <div>
        <Label>Website</Label>
        <Input name="website" defaultValue={saved.website ?? ""} placeholder="yoursite.com" inputMode="url" autoCapitalize="none" autoCorrect="off" />
      </div>
      {state.error && <p className="text-[13px] text-danger">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="flex-1">{pending ? <Spinner /> : "Save profile"}</Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => { setAvatar(saved.avatarMediaId); setEditing(false); }}
          className="border border-line"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted mb-1">{label}</div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[14px] text-ink-faint">{children}</p>;
}
