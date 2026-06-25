"use client";

import { useConnect, useAccount, useDisconnect } from "wagmi";
import { useState } from "react";

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
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={isPending}
        className={className ?? "font-mono text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50"}
        style={style ?? { borderColor: "#4FC3F7", color: "#4FC3F7", background: "#4FC3F710" }}
      >
        {isPending ? "Connecting…" : label}
      </button>

      {/* Full-screen overlay — never clipped by overflow:hidden ancestors */}
      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-[#1A1A2E] bg-[#0D0D1A] shadow-2xl shadow-black/80 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <p className="font-mono text-[10px] text-slate-600 px-4 pt-4 pb-2 tracking-widest uppercase">
              Select Wallet
            </p>
            {connectors.map((connector) => (
              <button
                key={connector.uid}
                onClick={() => { connect({ connector }); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#1A1A2E] transition-colors"
              >
                <span className="w-7 h-7 rounded-lg bg-[#1A1A2E] flex items-center justify-center text-base shrink-0">
                  {getWalletIcon(connector.name)}
                </span>
                <div>
                  <p className="font-mono text-xs text-white">{connector.name}</p>
                  <p className="font-mono text-[10px] text-slate-600">{getWalletSubtitle(connector.name)}</p>
                </div>
              </button>
            ))}
            <div className="px-4 pb-4 pt-1">
              <button
                onClick={() => setOpen(false)}
                className="w-full font-mono text-[10px] text-slate-600 hover:text-slate-400 py-2 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
