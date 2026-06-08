"use client";

/**
 * Shared auth card used by /signin and /signup.
 *
 * Mirrors the Orbis hybrid pattern: OAuth (Google + GitHub) + email/password
 * + an extra "Or connect wallet" footer (web3-native option for builders
 * who plan to register APIs / claim USDC).
 *
 * Backend is not yet wired — all buttons render in "preview" mode and we
 * surface a small banner saying so.
 */

import Link from "next/link";
import { useState } from "react";

interface Props {
  mode: "signin" | "signup";
}

interface Fields {
  username:        string;
  email:           string;
  password:        string;
  confirmPassword: string;
}

export default function AuthCard({ mode }: Props) {
  const isSignup = mode === "signup";
  const [f, setF] = useState<Fields>({ username: "", email: "", password: "", confirmPassword: "" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const passwordsMatch = !isSignup || f.password === f.confirmPassword;
  const emailValid     = /^\S+@\S+\.\S+$/.test(f.email);
  const formOk         = emailValid && f.password.length >= 8
                        && (!isSignup || (f.username.trim().length >= 3 && passwordsMatch));

  function handle<K extends keyof Fields>(k: K, v: string) {
    setF(p => ({ ...p, [k]: v }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!formOk) return;
    setSubmitting(true);
    // UI preview — real OAuth + email/password auth lands with backend wiring.
    setTimeout(() => { setSubmitting(false); setDone(true); }, 800);
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-[#34D399]/30 bg-[#34D399]/5 p-8 text-center">
        <div className="text-3xl mb-3">✅</div>
        <p className="font-mono text-lg font-bold mb-2">
          {isSignup ? "Account created (preview)" : "Signed in (preview)"}
        </p>
        <p className="font-mono text-[12px] text-slate-400 mb-6">
          Backend auth ships next deploy. We&apos;ll persist sessions then — for now,
          this confirms the form works end-to-end.
        </p>
        <Link href="/" className="font-mono text-xs font-semibold px-4 py-2 rounded-lg border border-[#1A1A2E] text-slate-300 hover:text-white hover:border-slate-700 transition-all">
          Back to home →
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-6 sm:p-7 space-y-5">

      <h2 className="font-mono text-xl font-bold tracking-tight text-center">
        {isSignup ? "Create your account" : "Sign in to Blue Hub"}
      </h2>

      {/* OAuth */}
      <div className="space-y-2">
        <button disabled
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] hover:bg-white/[0.03] transition-colors disabled:opacity-70 disabled:cursor-not-allowed">
          <GoogleIcon />
          <span className="font-mono text-sm text-white">Continue with Google</span>
        </button>
        <button disabled
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] hover:bg-white/[0.03] transition-colors disabled:opacity-70 disabled:cursor-not-allowed">
          <GithubIcon />
          <span className="font-mono text-sm text-white">Continue with GitHub</span>
        </button>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-[#1A1A2E]" />
        <span className="font-mono text-[10px] text-slate-700 tracking-widest">OR</span>
        <div className="flex-1 h-px bg-[#1A1A2E]" />
      </div>

      {/* Email form */}
      <form onSubmit={submit} className="space-y-3">
        {isSignup && (
          <Field label="USERNAME" hint="3+ chars, lowercase, no spaces">
            <input
              value={f.username}
              onChange={e => handle("username", e.target.value.toLowerCase().replace(/\s/g, ""))}
              placeholder="yourname"
              autoComplete="username"
              minLength={3} maxLength={32}
              className={input(f.username.length === 0 || f.username.length >= 3)} />
          </Field>
        )}

        <Field label="EMAIL">
          <input
            type="email"
            value={f.email}
            onChange={e => handle("email", e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
            className={input(f.email.length === 0 || emailValid)} />
        </Field>

        <Field label="PASSWORD" hint={isSignup ? "8+ characters" : undefined}>
          <input
            type="password"
            value={f.password}
            onChange={e => handle("password", e.target.value)}
            placeholder="••••••••"
            autoComplete={isSignup ? "new-password" : "current-password"}
            minLength={8}
            required
            className={input(f.password.length === 0 || f.password.length >= 8)} />
        </Field>

        {isSignup && (
          <Field label="CONFIRM PASSWORD">
            <input
              type="password"
              value={f.confirmPassword}
              onChange={e => handle("confirmPassword", e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              required
              className={input(f.confirmPassword.length === 0 || passwordsMatch)} />
            {f.confirmPassword.length > 0 && !passwordsMatch && (
              <p className="font-mono text-[10px] text-red-400 mt-1">Passwords don&apos;t match.</p>
            )}
          </Field>
        )}

        {/* Submit row */}
        <div className="flex items-center gap-2 pt-2">
          <Link
            href={isSignup ? "/signin" : "/signup"}
            className="flex-1 font-mono text-xs font-semibold text-center px-4 py-2.5 rounded-xl border border-[#1A1A2E] text-slate-300 hover:text-white hover:border-slate-700 transition-all">
            {isSignup ? "Back to Sign In" : "Create new account"}
          </Link>
          <button
            type="submit"
            disabled={!formOk || submitting}
            className="flex-1 font-mono text-xs font-semibold px-4 py-2.5 rounded-xl bg-[#4FC3F7] text-[#050508] hover:bg-[#29ABE2] transition-colors disabled:opacity-40">
            {submitting ? "…" : isSignup ? "Create Account" : "Sign In"}
          </button>
        </div>

        <p className="font-mono text-[10px] text-slate-700 text-center">
          By continuing you agree to our{" "}
          <Link href="/terms" className="text-slate-500 hover:text-slate-300 underline">Terms</Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-slate-500 hover:text-slate-300 underline">Privacy Policy</Link>.
        </p>
      </form>

      {/* Wallet option (web3-native path for builders) */}
      <div className="pt-4 border-t border-[#1A1A2E]">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-px bg-[#1A1A2E]" />
          <span className="font-mono text-[10px] text-[#A78BFA] tracking-widest">OR — WEB3</span>
          <div className="flex-1 h-px bg-[#1A1A2E]" />
        </div>
        <button disabled
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border border-[#A78BFA]/30 bg-[#A78BFA]/5 hover:bg-[#A78BFA]/10 transition-colors disabled:opacity-70 disabled:cursor-not-allowed">
          <WalletIcon />
          <span className="font-mono text-sm text-white">Connect wallet on Base</span>
        </button>
        <p className="font-mono text-[10px] text-slate-700 text-center mt-2">
          Required for builders — register APIs and claim USDC revenue
        </p>
      </div>

      {/* Preview banner */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-center">
        <p className="font-mono text-[10px] text-amber-400">
          📝 Auth backend ships next deploy · all options preview UI
        </p>
      </div>
    </div>
  );
}

// ─── Small bits ───────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-mono text-[10px] text-slate-600 tracking-widest mb-1.5">{label}</label>
      {children}
      {hint && <p className="font-mono text-[10px] text-slate-700 mt-1">{hint}</p>}
    </div>
  );
}

function input(valid: boolean): string {
  return `w-full bg-[#050508] border ${valid ? "border-[#1A1A2E]" : "border-red-500/40"} rounded-lg px-3 py-2.5 font-mono text-sm text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/40 transition-colors`;
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18a10.99 10.99 0 0 0 0 9.86l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A10.99 10.99 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.1c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.6.3 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.7-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 0z"/>
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg className="w-4 h-4 text-[#A78BFA]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M16 12h6"/>
      <circle cx="16" cy="14" r="1" fill="currentColor" />
    </svg>
  );
}
