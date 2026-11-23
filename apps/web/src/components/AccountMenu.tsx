"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { usePrivyIdentity } from "@/lib/privy/identity-bridge";
import { resolveIdentity, type IdentitySource } from "@/lib/identity/account-identity";
import { WalletPickerModal } from "@/components/WalletPicker";
import Avatar from "@/components/Avatar";
import { WALLET_DAILY } from "@/lib/credits";

/** Provenance line — says HOW you are signed in, so two sessions aren't confused. */
const SOURCE_LABEL: Record<IdentitySource, string> = {
  twitter: "X account",
  telegram: "Telegram",
  farcaster: "Farcaster",
  google: "Google",
  github: "GitHub",
  discord: "Discord",
  email: "Email",
  basename: "Basename",
  address: "Wallet",
};

const ITEMS: { href: string; label: string; hint: string }[] = [
  { href: "/usage", label: "Usage", hint: "Credits & agent spend" },
];

export default function AccountMenu({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const { address, isConnected, basename, label, disconnect } = useWallet();
  const privy = usePrivyIdentity();
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const identity = resolveIdentity({
    social: privy?.social ?? null,
    basename: basename ?? null,
    address: address ?? null,
    shortAddress: address ? (label ?? null) : null,
  });

  const signedIn = isConnected || !!privy?.authenticated;

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const signOut = useCallback(() => {
    privy?.logout();
    disconnect();
    close();
    onNavigate?.();
  }, [privy, disconnect, close, onNavigate]);

  // ── Signed out ────────────────────────────────────────────────────────────
  if (!signedIn) {
    return (
      <>
        <button
          type="button"
          onClick={() => setPicker(true)}
          title={collapsed ? "Sign in" : undefined}
          className={`w-full rounded-xl border border-[#4FC3F7]/35 bg-[#4FC3F7]/10 hover:bg-[#4FC3F7]/15 hover:border-[#4FC3F7]/55 transition-all flex items-center ${
            collapsed ? "justify-center h-9" : "justify-between px-3 h-10"
          }`}
        >
          {collapsed ? (
            <span className="font-mono text-[11px] font-bold tracking-wider text-[#4FC3F7]">
              IN
            </span>
          ) : (
            <>
              <span className="font-mono text-[13px] font-semibold text-[#4FC3F7]">
                Sign in
              </span>
              <span className="font-mono text-[11px] text-[#4FC3F7]/70">
                {WALLET_DAILY}/day
              </span>
            </>
          )}
        </button>
        <WalletPickerModal open={picker} onClose={() => setPicker(false)} />
      </>
    );
  }

  // ── Signed in ─────────────────────────────────────────────────────────────
  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={collapsed ? (identity.displayName ?? "Account") : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`group flex items-center rounded-xl h-11 w-full transition-colors hover:bg-[#ffffff06] ${
          collapsed ? "justify-center" : "gap-2.5 px-2"
        } ${open ? "bg-[#ffffff08]" : ""}`}
      >
        <Avatar
          photoUrl={identity.photoUrl}
          initials={identity.initials}
          colorSeed={identity.colorSeed}
          size={collapsed ? 24 : 28}
        />
        {!collapsed && (
          <span className="min-w-0 flex-1 text-left">
            <span className="block font-mono text-[14px] text-slate-200 truncate group-hover:text-white transition-colors">
              {identity.displayName ?? "Account"}
            </span>
            {identity.secondary && (
              <span className="block font-mono text-[11px] text-slate-500 truncate">
                {identity.secondary}
              </span>
            )}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} aria-hidden />
          <div
            role="menu"
            className={`absolute z-50 bottom-full mb-2 rounded-xl border border-[#1A1A2E] bg-[#090910] shadow-2xl shadow-black/90 overflow-hidden ${
              collapsed ? "left-0 w-[220px]" : "left-0 right-0"
            }`}
          >
            <div className="flex items-center gap-2.5 px-3 py-3 border-b border-[#141422]">
              <Avatar
                photoUrl={identity.photoUrl}
                initials={identity.initials}
                colorSeed={identity.colorSeed}
                size={30}
              />
              <div className="min-w-0">
                <p className="font-mono text-[14px] font-semibold text-white truncate">
                  {identity.displayName ?? "Account"}
                </p>
                <p className="font-mono text-[11px] text-slate-500 truncate">
                  {identity.source ? SOURCE_LABEL[identity.source] : "Signed in"}
                  {identity.secondary ? ` · ${identity.secondary}` : ""}
                </p>
              </div>
            </div>

            <div className="py-1">
              {ITEMS.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  role="menuitem"
                  onClick={() => {
                    close();
                    onNavigate?.();
                  }}
                  className="block px-3 py-2 hover:bg-[#141422] transition-colors"
                >
                  <span className="block font-mono text-[13px] text-slate-200">{it.label}</span>
                  <span className="block font-mono text-[11px] text-slate-500">{it.hint}</span>
                </Link>
              ))}
            </div>

            <div className="border-t border-[#141422]">
              <button
                type="button"
                role="menuitem"
                onClick={signOut}
                className="w-full text-left px-3 py-2.5 hover:bg-[#141422] transition-colors font-mono text-[13px] text-slate-400 hover:text-red-400"
              >
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
