// /portfolio — Markets mode: the connected wallet's holdings on Base 8453 and
// Robinhood Chain 4663 (ETH, the stable, every verified stock token).
import type { Metadata } from "next";
import MarketsHeader from "../markets/MarketsHeader";
import PortfolioClient from "./PortfolioClient";

export const metadata: Metadata = { title: "Portfolio — Blue Agent" };

export default function PortfolioPage() {
  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden font-mono [&_a]:font-mono [&_button]:font-mono">
      <MarketsHeader active="portfolio" chip="read from both chains" />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-5 py-[18px] w-full">
          <h1 className="text-[18px] font-semibold text-[#E2E8F0]">Portfolio</h1>
          <p className="mt-1.5 mb-4 max-w-[900px] text-[14px] leading-[1.7] text-[#94A3B8]">
            What this wallet holds on Base and Robinhood Chain: ETH, the dollar stable on each chain, and every stock token in Blue Agent&apos;s verified registries. Balances are read from each chain; prices from GeckoTerminal.
          </p>
          <PortfolioClient />
        </div>
      </div>
    </div>
  );
}
