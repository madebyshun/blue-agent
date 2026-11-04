"use client";

// Swap on a Markets token page — the wallet's own swap cards, opened on THIS
// chain and THIS contract (never a ticker). Base: the 0x Convert card buying the
// token. Robinhood Chain: USDG → token through the RH router. The user's wallet
// signs; nothing here holds or routes funds. Same split as hood/HoodSwap.tsx.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import BankSwapCard from "@/app/app/bank/SwapCard";
import { RobinhoodSwapCard } from "@/app/chat/components/RobinhoodSwapCard";
import { WALLET_CHAINS } from "@/lib/wallet/chains";

type Props = { chain: "base" | "robinhood"; contract: string; symbol: string };

/** The swap card alone: used inline on a token page and inside the Markets Trade popup. */
export function SwapPanel({ chain, contract, symbol }: Props) {
  const { address } = useAccount();
  return chain === "base" ? (
    <BankSwapCard account={address} initialBuy={contract} />
  ) : (
    <RobinhoodSwapCard result={{
      kind: "robinhood_swap", direction: "buy",
      token_address: contract, token_symbol: symbol,
      token_in_address: WALLET_CHAINS.robinhood.stable,
      token_in_symbol: WALLET_CHAINS.robinhood.stableSymbol,
      note: `From Markets: ${symbol} on Robinhood Chain 4663. Review the amount and route before signing.`,
    }} />
  );
}

/** A Trade popup for one Markets row: this chain, this contract, the wallet signs. */
export function TradeModal({ chain, contract, symbol, name, onClose }: Props & { name: string; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-10" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Trade ${symbol}`} className="w-full max-w-md rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14] p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold text-[#E2E8F0]">Trade {symbol}</p>
            <p className="text-[12px] text-[#64748B]">{name} · {chain === "base" ? "Base 8453" : "Robinhood Chain 4663"} · {contract.slice(0, 6)}…{contract.slice(-4)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md px-2 py-1 text-[16px] leading-none text-[#94A3B8] hover:text-[#E2E8F0]">×</button>
        </div>
        <SwapPanel chain={chain} contract={contract} symbol={symbol} />
        <Link href={`/markets/${chain}/${contract}`} className="mt-3 inline-block text-[13px] text-[#4FC3F7]">Chart and details →</Link>
      </div>
    </div>
  );
}

export default function MarketSwap({ chain, contract, symbol }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="text-[13px] font-semibold text-[#050508] bg-[#4FC3F7] hover:bg-[#29ABE2] rounded-[8px] px-[13px] py-2">
        {open ? "Close swap" : `Swap ${symbol} on ${chain === "base" ? "Base" : "Robinhood Chain"}`}
      </button>
      {open && (
        <div className="mt-3 max-w-md">
          <SwapPanel chain={chain} contract={contract} symbol={symbol} />
        </div>
      )}
    </div>
  );
}
