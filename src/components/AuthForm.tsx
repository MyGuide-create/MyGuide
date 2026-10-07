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

/** Terracotta star after required sign-up fields. */
const Req = () => (
  <span className="text-terracotta" aria-hidden>
    {" "}*
  </span>
);

function ProviderButtons({ providers, mode, next }: { providers: Array<"google" | "apple">; mode: "login" | "signup"; next?: string }) {
  if (!providers.length) return null;
  const href = (p: string) => `/api/auth/${p}?mode=${mode}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
  return (
    <div className="flex flex-col gap-2.5">
      {providers.includes("apple") && (
        <a href={href("apple")} className="h-12 rounded-full bg-ink text-cream text-[15px] font-medium flex items-center justify-center hover:opacity-90">
          Continue with Apple
        </a>
      )}
      {providers.includes("google") && (
        <a href={href("google")} className="h-12 rounded-full border border-line bg-paper text-ink text-[15px] font-medium flex items-center justify-center hover:border-ink-faint">
          Continue with Google
        </a>
      )}
      <div className="my-1 flex items-center gap-3 text-[12px] text-ink-faint">
        <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}

export function AuthForm({ mode, next, why, providers = [], notice }: { mode: "login" | "signup"; next?: string; why?: AuthReason | null; providers?: Array<"google" | "apple">; notice?: string | null }) {
  const [forgot, setForgot] = useState(false);
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? logIn : signUp, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {notice && <p className="text-[13px] text-danger bg-danger-tint rounded-xl px-3 py-2">{notice}</p>}
      <ProviderButtons providers={providers} mode={mode} next={next} />
      {next && <input type="hidden" name="next" value={next} />}
      {mode === "signup" && (
        <>
          <div>
            <Label>Your name<Req /></Label>
            <Input name="displayName" autoComplete="name" required />
          </div>
          <div>
            <Label>Username<Req /></Label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint">@</span>
              <Input name="username" autoComplete="username" required className="pl-8" pattern="[A-Za-z0-9_.]{3,24}" title="3–24 letters, numbers, dots or underscores" />
            </div>
          </div>
        </>
      )}
      <div>
        <Label>{mode === "login" ? "Email or username" : <>Email<Req /></>}</Label>
        <Input name="email" type={mode === "login" ? "text" : "email"} autoComplete={mode === "login" ? "username" : "email"} required />
      </div>
      <div>
        <Label>Password{mode === "signup" && <Req />}</Label>
        <PasswordInput name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "signup" ? 8 : undefined} />
        {mode === "signup" && <p className="mt-1.5 text-[12.5px] text-ink-muted">At least 8 characters.</p>}
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
          <Label>Confirm password<Req /></Label>
          <PasswordInput name="confirmPassword" autoComplete="new-password" required minLength={8} />
        </div>
      )}
      {state.error && <p className="text-[13px] text-danger bg-danger-tint rounded-xl px-3 py-2">{state.error}</p>}
      {mode === "signup" && (
        <p className="text-[11.5px] text-ink-faint leading-relaxed">
          By creating an account{providers.length ? ` or continuing with ${providers.map((p) => (p === "google" ? "Google" : "Apple")).join(" or ")}` : ""} you agree to the <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy notice</Link>.
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
