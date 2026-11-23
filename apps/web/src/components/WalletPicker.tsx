"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/hooks/useWallet";
import { usePrivyIdentity } from "@/lib/privy/identity-bridge";
import {
  PRIVY_ENABLED,
  PRIVY_LOGIN_METHODS,
  loginMethodLabel,
  type LoginMethod,
} from "@/lib/privy/config";
import { WALLET_DAILY } from "@/lib/credits";

const EMAIL_METHOD: LoginMethod = "email";

function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/**
 * WalletPickerModal — the unified Privy + external-wallet sign-in modal.
 *
 * Full-screen fixed overlay (z-200) so it's never clipped by an
 * `overflow:hidden` ancestor. Mirrors `/signup`:
 *   - Privy on  → direct Email + configured Social methods (one click, no
 *                 menu-inside-a-menu) above a compact external-wallet list.
 *   - Privy off → external-wallet list directly.
 */
export function WalletPickerModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { wallets } = useWallet();
  const privy = usePrivyIdentity();
  const [email, setEmail] = useState("");
  const [showAllWallets, setShowAllWallets] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const hasEmail = PRIVY_ENABLED && PRIVY_LOGIN_METHODS.includes(EMAIL_METHOD);
  const social = PRIVY_ENABLED
    ? PRIVY_LOGIN_METHODS.filter((m) => m !== EMAIL_METHOD)
    : [];
  const privyReady = !PRIVY_ENABLED || (privy?.ready ?? false);

  // When Privy is on, PRIVY_WALLET_LIST has 7 entries; collapse beyond 3 so
  // the modal always fits comfortably without scrolling on laptop viewports.
  const collapsible = PRIVY_ENABLED && wallets.length > 3;
  const visibleWallets =
    collapsible && !showAllWallets ? wallets.slice(0, 3) : wallets;

  function continueWithEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!privy) return;
    const value = email.trim();
    privy.login(
      looksLikeEmail(value)
        ? { loginMethods: [EMAIL_METHOD], prefill: { type: "email", value } }
        : { loginMethods: [EMAIL_METHOD] },
    );
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Sign in to Blue Agent"
    >
      <div
        className="w-full max-w-[400px] max-h-[88vh] flex flex-col rounded-2xl border border-[#1A1A2E] bg-[#090910] shadow-2xl shadow-black/90 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-[#141422] flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4FC3F7]">
              SIGN IN
            </p>
            <h2 className="font-mono text-[17px] font-bold text-white tracking-[-0.01em] mt-1">
              Connect to Blue Agent
            </h2>
            <p className="font-mono text-[12px] text-slate-500 mt-1">
              {WALLET_DAILY.toLocaleString()} credits/day · Non-custodial
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign-in modal"
            className="shrink-0 rounded-lg border border-[#1A1A2E] bg-[#0D0D16] px-2.5 py-1 font-mono text-[11px] text-slate-500 hover:text-slate-200 hover:border-slate-700 transition-colors"
          >
            Esc
          </button>
        </div>

        {/* Scrollable body */}
        <div className="p-5 overflow-y-auto min-h-0">
          {/* ── Privy: Email + Social ─────────────────────────────────────── */}
          {PRIVY_ENABLED && (
            <div>
              {hasEmail && (
                <form onSubmit={continueWithEmail}>
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={!privyReady}
                    className="w-full rounded-xl border border-[#1A1A2E] bg-[#0D0D16] px-3.5 py-2.5 font-mono text-[13px] text-white placeholder:text-slate-600 outline-none focus:border-[#4FC3F7]/60 transition-colors disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!privyReady}
                    className="mt-2 w-full rounded-xl px-4 py-2.5 font-mono text-[13px] font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ background: "#4FC3F7", color: "#050508" }}
                  >
                    {privyReady ? "Continue with email" : "Loading..."}
                  </button>
                </form>
              )}

              {social.length > 0 && (
                <div
                  className={`${hasEmail ? "mt-2.5" : ""} grid gap-2 ${
                    social.length >= 2 ? "grid-cols-2" : "grid-cols-1"
                  }`}
                >
                  {social.map((m) => (
                    <button
                      key={m}
                      type="button"
                      disabled={!privyReady}
                      onClick={() => {
                        privy?.login({ loginMethods: [m] });
                        onClose();
                      }}
                      className="rounded-xl border border-[#1A1A2E] bg-[#0D0D16] px-3 py-2.5 font-mono text-[13px] font-medium text-slate-200 hover:border-[#4FC3F7]/45 hover:bg-[#11111E] hover:text-white transition-all disabled:opacity-50 text-center truncate"
                    >
                      {loginMethodLabel(m)}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 my-4">
                <div className="h-px flex-1 bg-[#1A1A2E]" />
                <span className="font-mono text-[11px] text-slate-600 uppercase tracking-[0.14em]">
                  or wallet
                </span>
                <div className="h-px flex-1 bg-[#1A1A2E]" />
              </div>
            </div>
          )}

          {!PRIVY_ENABLED && (
            <p className="font-mono text-[11px] text-slate-500 uppercase tracking-[0.14em] mb-3">
              Select wallet
            </p>
          )}

          {/* ── External wallets ──────────────────────────────────────────── */}
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
            <div className="space-y-1.5">
              {visibleWallets.map((w) => (
                <button
                  key={w.key}
                  type="button"
                  onClick={() => {
                    w.select();
                    onClose();
                  }}
                  className="group w-full flex items-center justify-between gap-3 rounded-xl border border-[#1A1A2E] bg-[#0D0D16] px-3.5 py-2.5 text-left transition-all hover:border-[#4FC3F7]/45 hover:bg-[#11111E]"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-[13px] font-semibold text-slate-100 group-hover:text-white truncate">
                      {w.name}
                    </p>
                    <p className="font-mono text-[11px] text-slate-500 truncate mt-0.5">
                      {w.subtitle}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[12px] text-slate-600 group-hover:text-[#4FC3F7] transition-colors">
                    Connect
                  </span>
                </button>
              ))}

              {collapsible && (
                <button
                  type="button"
                  onClick={() => setShowAllWallets((v) => !v)}
                  className="w-full pt-1.5 font-mono text-[12px] text-slate-500 hover:text-slate-300 transition-colors text-center"
                >
                  {showAllWallets
                    ? "Show fewer wallets"
                    : `More wallets (${wallets.length - 3})`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#141422] bg-[#07070D] flex items-center justify-between gap-3 shrink-0">
          <span className="font-mono text-[11px] text-slate-600">
            Keys stay in your wallet
          </span>
          <Link
            href="/signup"
            onClick={onClose}
            className="font-mono text-[12px] text-slate-400 hover:text-[#4FC3F7] transition-colors"
          >
            Full sign-in page
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * ConnectButton — the canonical connect control.
 *   - Not connected → opens the shared picker.
 *   - Connected     → shows Basename / short address, signs out on click.
 */
export function ConnectButton({
  label = "Connect Wallet",
  className,
  style,
}: {
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { isConnected, label: walletLabel, disconnect, isPending } = useWallet();
  const privy = usePrivyIdentity();
  const [open, setOpen] = useState(false);

  if (isConnected) {
    return (
      <button
        type="button"
        onClick={() => {
          privy?.logout();
          disconnect();
        }}
        className={
          className ??
          "font-mono text-xs text-slate-300 hover:text-white border border-[#1A1A2E] hover:border-slate-600 bg-[#0D0D16] px-3 py-1.5 rounded-lg transition-all"
        }
      >
        {walletLabel}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={isPending}
        className={
          className ??
          "font-mono text-xs font-semibold px-3.5 py-2 rounded-xl border transition-all disabled:opacity-50"
        }
        style={
          style ?? {
            borderColor: "rgba(79,195,247,0.45)",
            color: "#4FC3F7",
            background: "rgba(79,195,247,0.10)",
          }
        }
      >
        {isPending ? "Connecting..." : label}
      </button>
      <WalletPickerModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
