// /exchange/sell — list an x402 service on Blue Agent (lib/hub/listings.ts).
import type { Metadata } from "next";
import PageFrame from "../_components/PageFrame";
import { SellView } from "../_components/AccountViews";

export const metadata: Metadata = { title: "Sell services — Blue Agent", description: "List your x402 service on Base. Buyers pay you directly." };

export default function SellPage() {
  return (
    <PageFrame chip="sell services" title="Sell services"
      lede="Already selling over x402 on Base? Prove you run it and you are listed on Agents with a verified badge. Buyers sign USDC straight to your payTo; Blue Agent never holds the money and takes no cut.">
      <SellView />
      <div className="mt-5 grid gap-2.5 md:grid-cols-3">
        {[
          ["You keep custody", "Payments settle from the buyer's wallet to yours on Base 8453. There is no escrow and no fee here."],
          ["Checked, not trusted", "Each service is called unpaid. It passes only if its 402 quote asks for USDC on Base to your wallet."],
          ["Measured afterwards", "Your page shows volume, paid calls and paying wallets read from Base, the same way as every other seller."],
        ].map(([t, d]) => (
          <div key={t} className="rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14] p-[14px]">
            <p className="text-[11px] font-semibold text-[#E2E8F0]">{t}</p>
            <p className="mt-1 text-[10.5px] leading-[1.6] text-[#94A3B8]">{d}</p>
          </div>
        ))}
      </div>
    </PageFrame>
  );
}
