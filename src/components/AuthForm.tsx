"use client";

import Link from "next/link";
import { useActionState, useState, type InputHTMLAttributes } from "react";
import { logIn, signUp, type AuthState } from "@/lib/actions/auth";
import { authHref, SUPPORT_CONTACT, type AuthReason } from "@/lib/authContext";
import { EyeIcon, EyeOffIcon } from "./Icons";
import { Button, Input, Label, Spinner } from "./ui";

function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-12" />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full text-ink-faint hover:text-ink"
      >
        {show ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
      </button>
    </div>
  );
}

export function AuthForm({ mode, next, why }: { mode: "login" | "signup"; next?: string; why?: AuthReason | null }) {
  const [forgot, setForgot] = useState(false);
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
        <PasswordInput name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} required minLength={mode === "signup" ? 8 : undefined} />
        {mode === "login" && (
          <div className="mt-1.5 text-right">
            <button type="button" onClick={() => setForgot((v) => !v)} className="text-[12.5px] text-ink-muted hover:text-terracotta">Forgot password?</button>
          </div>
        )}
        {mode === "login" && forgot && (
          <p className="mt-1 text-[12.5px] text-ink-muted bg-cream-deep/60 rounded-xl px-3 py-2 leading-relaxed">
            No problem — message {SUPPORT_CONTACT} with your email or username and he&apos;ll reset it for you.
          </p>
        )}
      </div>
      {mode === "signup" && (
        <div>
          <Label>Confirm password</Label>
          <PasswordInput name="confirmPassword" autoComplete="new-password" placeholder="Type it again" required minLength={8} />
        </div>
      )}
      {state.error && <p className="text-[13px] text-danger bg-danger-tint rounded-xl px-3 py-2">{state.error}</p>}
      {mode === "signup" && (
        <p className="text-[11.5px] text-ink-faint leading-relaxed">
          By creating an account you agree to the <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy notice</Link>.
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="mt-1">
        {pending ? <Spinner /> : mode === "login" ? "Log in" : "Create account"}
      </Button>
      <p className="text-center text-[13px] text-ink-muted">
        {mode === "login" ? (
          <>New here? <Link className="text-terracotta font-medium" href={authHref("signup", next, why)}>Create an account</Link></>
        ) : (
          <>Already have an account? <Link className="text-terracotta font-medium" href={authHref("login", next, why)}>Log in</Link></>
        )}
      </p>
    </form>
  );
}
