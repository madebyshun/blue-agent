"use client";

import { useState } from "react";
import Link from "next/link";
import { useWallet } from "@/hooks/useWallet";
import { usePrivyIdentity } from "@/lib/privy/identity-bridge";
import { resolveIdentity } from "@/lib/identity/account-identity";
import Avatar from "@/components/Avatar";
import {
  PRIVY_ENABLED,
  PRIVY_LOGIN_METHODS,
  loginMethodLabel,
  type LoginMethod,
} from "@/lib/privy/config";
import { GUEST_DAILY, WALLET_DAILY } from "@/lib/credits";

const ACCENT = "#4FC3F7";
const EMAIL_METHOD: LoginMethod = "email";

function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export default function SignUpPage() {
  const { isConnected, address, basename, label, wallets, disconnect } = useWallet();
  const privy = usePrivyIdentity();
  const [email, setEmail] = useState("");

  const identity = resolveIdentity({
    social: privy?.social ?? null,
    basename: basename ?? null,
    address: address ?? null,
    shortAddress: address ? (label ?? null) : null,
  });

  const signedIn = isConnected || !!privy?.authenticated;
  const social = PRIVY_ENABLED ? PRIVY_LOGIN_METHODS.filter((m) => m !== EMAIL_METHOD) : [];
  const hasEmail = PRIVY_ENABLED && PRIVY_LOGIN_METHODS.includes(EMAIL_METHOD);
  const allowanceMultiplier = Math.round(WALLET_DAILY / GUEST_DAILY);

  function continueWithEmail(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    privy?.login(
      looksLikeEmail(value)
        ? { loginMethods: [EMAIL_METHOD], prefill: { type: "email", value } }
        : { loginMethods: [EMAIL_METHOD] },
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center px-5 sm:px-6 h-14 border-b border-[#1A1A2E] flex-shrink-0">
        <div className="min-w-0">
          <p className="font-mono text-xs tracking-widest truncate" style={{ color: ACCENT }}>
            // SIGN IN
          </p>
          <p className="font-mono text-[12px] text-slate-600 mt-0.5 truncate">
            One account for Blue Chat, Agents, and Markets
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-10 flex items-start sm:items-center justify-center">
        <div className="w-full max-w-[440px]">
          {signedIn ? (
            <SignedInCard
              identity={identity}
              viaSocial={!!privy?.social}
              onSignOut={() => {
                privy?.logout();
                disconnect();
              }}
            />
          ) : (
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#090910] overflow-hidden shadow-2xl shadow-black/60">
              {/* Header */}
              <div className="px-6 pt-6 pb-5 border-b border-[#141422]">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4FC3F7]">
                  BLUE AGENT ACCOUNT
                </p>
                <h1 className="font-mono text-[20px] font-bold text-white tracking-[-0.02em] mt-1.5">
                  Sign in to Blue Agent
                </h1>
                <p className="font-mono text-[13px] text-slate-500 mt-1.5 leading-relaxed">
                  New or returning — the same flow handles both. No password required.
                </p>
              </div>

              <div className="p-6">
                {/* Email */}
                {hasEmail && (
                  <form onSubmit={continueWithEmail}>
                    <label
                      htmlFor="signup-email"
                      className="font-mono text-[11px] text-slate-500 tracking-[0.14em] uppercase block mb-2"
                    >
                      Email
                    </label>
                    <input
                      id="signup-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-xl border border-[#1A1A2E] bg-[#0D0D16] px-3.5 py-2.5 font-mono text-[14px] text-white placeholder:text-slate-600 outline-none focus:border-[#4FC3F7]/60 transition-colors"
                    />
                    <button
                      type="submit"
                      className="mt-2.5 w-full rounded-xl px-4 py-3 font-mono text-[13px] font-bold transition-opacity hover:opacity-90"
                      style={{ background: ACCENT, color: "#050508" }}
                    >
                      Continue with email
                    </button>
                  </form>
                )}

                {/* Social providers */}
                {social.length > 0 && (
                  <>
                    {hasEmail && (
                      <div className="flex items-center gap-3 my-5">
                        <div className="h-px flex-1 bg-[#1A1A2E]" />
                        <span className="font-mono text-[11px] text-slate-600 uppercase tracking-[0.14em]">
                          or
                        </span>
                        <div className="h-px flex-1 bg-[#1A1A2E]" />
                      </div>
                    )}
                    <div className="space-y-2">
                      {social.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => privy?.login({ loginMethods: [m] })}
                          className="w-full flex items-center justify-between rounded-xl border border-[#1A1A2E] bg-[#0D0D16] px-3.5 py-3 text-left font-mono text-[14px] text-slate-200 transition-all hover:border-[#4FC3F7]/45 hover:bg-[#11111E] hover:text-white"
                        >
                          <span>Continue with {loginMethodLabel(m)}</span>
                          <span className="text-[12px] text-slate-600">Select</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* Inline wallet list — no second modal hop */}
                {(hasEmail || social.length > 0) && (
                  <div className="flex items-center gap-3 my-5">
                    <div className="h-px flex-1 bg-[#1A1A2E]" />
                    <span className="font-mono text-[11px] text-slate-600 uppercase tracking-[0.14em]">
                      or wallet
                    </span>
                    <div className="h-px flex-1 bg-[#1A1A2E]" />
                  </div>
                )}

                {!PRIVY_ENABLED && (
                  <p className="font-mono text-[11px] text-slate-500 uppercase tracking-[0.14em] mb-3">
                    Select wallet
                  </p>
                )}

                {wallets.length === 0 ? (
                  <div className="rounded-xl border border-[#1A1A2E] bg-[#0D0D16] p-4">
                    <p className="font-mono text-[13px] text-slate-300 font-medium">
                      No browser wallet detected
                    </p>
                    <p className="font-mono text-[12px] text-slate-500 mt-1 leading-relaxed">
                      Install Coinbase Wallet, Rabby, or MetaMask, then reload this page.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {wallets.map((w) => (
                      <button
                        key={w.key}
                        type="button"
                        onClick={() => w.select()}
                        className="group w-full flex items-center justify-between gap-3 rounded-xl border border-[#1A1A2E] bg-[#0D0D16] px-3.5 py-3 text-left transition-all hover:border-[#4FC3F7]/45 hover:bg-[#11111E]"
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-[14px] font-semibold text-slate-100 group-hover:text-white truncate">
                            {w.name}
                          </p>
                          <p className="font-mono text-[12px] text-slate-500 truncate mt-0.5">
                            {w.subtitle}
                          </p>
                        </div>
                        <span className="shrink-0 font-mono text-[12px] text-slate-600 group-hover:text-[#4FC3F7] transition-colors">
                          Connect
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Compact stats strip */}
                <div className="mt-6 grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-[#141422] bg-[#07070D] px-3 py-2.5">
                    <p className="font-mono text-[13px] font-bold text-white">
                      {WALLET_DAILY.toLocaleString()}/d
                    </p>
                    <p className="font-mono text-[11px] text-slate-500 mt-0.5">
                      {allowanceMultiplier}x guest limit
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#141422] bg-[#07070D] px-3 py-2.5">
                    <p className="font-mono text-[13px] font-bold text-white">USDC</p>
                    <p className="font-mono text-[11px] text-slate-500 mt-0.5">
                      Pay-as-you-go
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#141422] bg-[#07070D] px-3 py-2.5">
                    <p className="font-mono text-[13px] font-bold text-white">Self-custody</p>
                    <p className="font-mono text-[11px] text-slate-500 mt-0.5">
                      You hold keys
                    </p>
                  </div>
                </div>

                <p className="font-mono text-[11px] text-slate-600 mt-4 leading-relaxed">
                  {PRIVY_ENABLED
                    ? "Email or social sign-in provisions a non-custodial wallet for you. Every model and tool remains open to guests; signing in raises your daily allowance and enables USDC top-ups and sync."
                    : "Every model and tool remains open to guests; connecting a wallet raises your daily allowance, enables USDC top-ups, and unlocks optional sync."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SignedInCard({
  identity,
  viaSocial,
  onSignOut,
}: {
  identity: ReturnType<typeof resolveIdentity>;
  viaSocial: boolean;
  onSignOut: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#090910] overflow-hidden shadow-2xl shadow-black/60">
      <div className="px-6 pt-6 pb-5 border-b border-[#141422]">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4FC3F7]">
          ACTIVE SESSION
        </p>
        <h1 className="font-mono text-[20px] font-bold text-white tracking-[-0.02em] mt-1.5">
          You&apos;re signed in
        </h1>
      </div>

      <div className="p-6">
        <div className="flex items-center gap-3 rounded-xl border border-[#1A1A2E] bg-[#0D0D16] p-4">
          <Avatar
            photoUrl={identity.photoUrl}
            initials={identity.initials}
            colorSeed={identity.colorSeed}
            size={42}
          />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[15px] font-semibold text-white truncate">
              {identity.displayName ?? "Account"}
            </p>
            <p className="font-mono text-[12px] text-slate-500 truncate mt-0.5">
              {viaSocial ? "Social account" : "Wallet"}
              {identity.secondary ? ` · ${identity.secondary}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Row href="/chat" label="Blue Chat" hint="Ask and run onchain tools" />
          <Row href="/portfolio" label="Portfolio" hint="Balances on Base and Robinhood Chain" />
          <Row href="/usage" label="Usage" hint="Credits and agent spend" />
        </div>

        <button
          type="button"
          onClick={onSignOut}
          className="mt-5 w-full rounded-xl border border-[#1A1A2E] bg-[#0D0D16] px-4 py-2.5 font-mono text-[13px] text-slate-400 hover:border-red-500/40 hover:text-red-400 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function Row({ href, label, hint }: { href: string; label: string; hint: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 rounded-xl border border-[#1A1A2E] bg-[#0D0D16] px-3.5 py-3 transition-all hover:border-[#4FC3F7]/45 hover:bg-[#11111E]"
    >
      <div className="min-w-0">
        <span className="block font-mono text-[14px] font-semibold text-slate-200 group-hover:text-white">
          {label}
        </span>
        <span className="block font-mono text-[12px] text-slate-500 mt-0.5">{hint}</span>
      </div>
      <span className="font-mono text-[12px] text-slate-600 group-hover:text-[#4FC3F7] transition-colors">
        Open
      </span>
    </Link>
  );
}
