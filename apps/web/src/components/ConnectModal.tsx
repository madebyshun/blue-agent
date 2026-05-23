"use client";

import { useConnect, useAccount, useDisconnect } from "wagmi";
import { useState, useEffect, useRef } from "react";

/**
 * ConnectModal — shows all available wagmi connectors.
 * Drop-in replacement for bestConnector() one-shot connect.
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
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();
  const { connectors, connect, isPending } = useConnect();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className={className ?? "font-mono text-xs text-slate-400 hover:text-white border border-[#1A1A2E] hover:border-slate-600 px-3 py-1.5 rounded-lg transition-all"}
      >
        {address.slice(0, 6)}…{address.slice(-4)}
      </button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={isPending}
        className={className ?? "font-mono text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50"}
        style={style ?? { borderColor: "#4FC3F7", color: "#4FC3F7", background: "#4FC3F710" }}
      >
        {isPending ? "Connecting…" : label}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 z-50 rounded-xl border border-[#1A1A2E] bg-[#0D0D1A] shadow-xl shadow-black/60 overflow-hidden">
          <p className="font-mono text-[10px] text-slate-600 px-4 pt-3 pb-2 tracking-widest">
            SELECT WALLET
          </p>
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              onClick={() => {
                connect({ connector });
                setOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#1A1A2E] transition-colors"
            >
              {/* Icon */}
              <span className="w-7 h-7 rounded-lg bg-[#1A1A2E] flex items-center justify-center text-base shrink-0">
                {getWalletIcon(connector.name)}
              </span>
              <div>
                <p className="font-mono text-xs text-white">{connector.name}</p>
                <p className="font-mono text-[10px] text-slate-600">{getWalletSubtitle(connector.name)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getWalletIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("metamask"))  return "🦊";
  if (n.includes("coinbase"))  return "🔵";
  if (n.includes("rabby"))     return "🐰";
  if (n.includes("walletconnect")) return "🔗";
  return "💼";
}

function getWalletSubtitle(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("metamask"))  return "Browser extension";
  if (n.includes("coinbase"))  return "Extension or mobile app";
  if (n.includes("injected"))  return "Browser extension";
  if (n.includes("walletconnect")) return "QR code / mobile";
  return "Connect";
}
