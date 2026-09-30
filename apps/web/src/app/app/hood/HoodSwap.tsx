"use client";

/**
 * A neutral Swap on every Hood board row (G0, 2026-09-30 — plan §0b "Board
 * Hood"). NOT the arrow's Review & Sign, which is off (ARROW_TRADE_ENABLED):
 * that one turned a published signal into "trade this now". This is the same
 * control the wallet has, opened on the row the user expanded — its chain and
 * its CONTRACT, never its ticker (NVDA exists on both desks as two contracts).
 *
 *   Base 8453          → the Convert card (0x), buying the B20 token.
 *   Robinhood Ch. 4663 → USDG → token. The RH desk prices stock tokens only
 *                        from dollar-anchored pools (#231), so USDG is the
 *                        quote their liquidity actually sits against.
 */
import { useState } from "react";
import { useAccount } from "wagmi";
import BankSwapCard from "@/app/app/bank/SwapCard";
import { RobinhoodSwapCard } from "@/app/chat/components/RobinhoodSwapCard";
import { WALLET_CHAINS } from "@/lib/wallet/chains";
import type { HoodChain } from "@/lib/blue-hood/types";

const ADDR = /^0x[a-fA-F0-9]{40}$/;

/** The asset, in the issuer's terms (plan §1 table) — never "shares". */
export function hoodAssetLabel(chain: HoodChain, ticker: string): string {
  return chain === "base"
    ? `B20 tokenized stock (Coinbase) · tracks ${ticker}`
    : `Stock token (Robinhood, Jersey) · tracks ${ticker}`;
}

export default function HoodSwap({ ticker, chain, contract }: { ticker: string; chain: HoodChain; contract: string | null | undefined }) {
  const { address } = useAccount();
  const [open, setOpen] = useState(false);
  if (!contract || !ADDR.test(contract)) return null;
  const label = hoodAssetLabel(chain, ticker);

  return (
    <div className="mb-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded border px-3 py-1 font-mono text-[11px]"
          style={{ borderColor: "#334155", color: "#cbd5e1" }}
        >
          {open ? "Close swap" : `Swap ${ticker}`}
        </button>
        <span className="font-mono text-[10px]" style={{ color: "#64748B" }}>{label}</span>
      </div>
      {open && (
        <div className="mt-2 max-w-md">
          {chain === "base" ? (
            <BankSwapCard account={address} initialBuy={contract} />
          ) : (
            <RobinhoodSwapCard result={{
              kind: "robinhood_swap", direction: "buy",
              token_address: contract, token_symbol: ticker,
              token_in_address: WALLET_CHAINS.robinhood.stable,
              token_in_symbol: WALLET_CHAINS.robinhood.stableSymbol,
              note: `From the Hood board — ${label}. Review the amount and route before signing.`,
            }} />
          )}
        </div>
      )}
    </div>
  );
}
