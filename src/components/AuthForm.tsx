"use client";

import Link from "next/link";
import { useActionState } from "react";
import { logIn, signUp, type AuthState } from "@/lib/actions/auth";
import { Button, Input, Label, Spinner } from "./ui";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? logIn : signUp, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      {mode === "signup" && (
        <>
          <div>
            <Label>Display name</Label>
            <Input name="displayName" autoComplete="name" placeholder="Yara Haddad" required />
          </div>
          <div>
            <Label>Username</Label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint">@</span>
              <Input name="username" autoComplete="username" placeholder="yara" required className="pl-8" pattern="[A-Za-z0-9_.]{3,24}" title="3–24 letters, numbers, dots or underscores" />
            </div>
          </div>
        </>
      )}
      <div>
        <Label>{mode === "login" ? "Email or username" : "Email"}</Label>
        <Input name="email" type={mode === "login" ? "text" : "email"} autoComplete={mode === "login" ? "username" : "email"} placeholder="you@example.com" required />
      </div>
      <div>
        <Label>Password</Label>
        <Input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"} required minLength={mode === "signup" ? 8 : undefined} />
      </div>
      {state.error && <p className="text-[13px] text-danger bg-danger-tint rounded-xl px-3 py-2">{state.error}</p>}
      <Button type="submit" size="lg" disabled={pending} className="mt-1">
        {pending ? <Spinner /> : mode === "login" ? "Log in" : "Create account"}
      </Button>
      <p className="text-center text-[13px] text-ink-muted">
        {mode === "login" ? (
          <>New here? <Link className="text-terracotta font-medium" href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Create an account</Link></>
        ) : (
          <>Already have an account? <Link className="text-terracotta font-medium" href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Log in</Link></>
        )}
      </p>
    </form>
  );
}
