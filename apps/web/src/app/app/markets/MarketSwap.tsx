"use client";

// Swap on a Markets token page — the wallet's own swap cards, opened on THIS
// chain and THIS contract (never a ticker). Base: the 0x Convert card buying the
// token. Robinhood Chain: USDG → token through the RH router. The user's wallet
// signs; nothing here holds or routes funds. Same split as hood/HoodSwap.tsx.
import { useState } from "react";
import { useAccount } from "wagmi";
import BankSwapCard from "@/app/app/bank/SwapCard";
import { RobinhoodSwapCard } from "@/app/chat/components/RobinhoodSwapCard";
import { WALLET_CHAINS } from "@/lib/wallet/chains";

export default function MarketSwap({ chain, contract, symbol }: { chain: "base" | "robinhood"; contract: string; symbol: string }) {
  const { address } = useAccount();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="text-[13px] font-semibold text-[#050508] bg-[#4FC3F7] hover:bg-[#29ABE2] rounded-[8px] px-[13px] py-2">
        {open ? "Close swap" : `Swap ${symbol} on ${chain === "base" ? "Base" : "Robinhood Chain"}`}
      </button>
      {open && (
        <div className="mt-3 max-w-md">
          {chain === "base" ? (
            <BankSwapCard account={address} initialBuy={contract} />
          ) : (
            <RobinhoodSwapCard result={{
              kind: "robinhood_swap", direction: "buy",
              token_address: contract, token_symbol: symbol,
              token_in_address: WALLET_CHAINS.robinhood.stable,
              token_in_symbol: WALLET_CHAINS.robinhood.stableSymbol,
              note: `From Markets: ${symbol} on Robinhood Chain 4663. Review the amount and route before signing.`,
            }} />
          )}
        </div>
      )}
    </div>
  );
}
