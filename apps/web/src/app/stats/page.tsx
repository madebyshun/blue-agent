/**
 * /stats — public traction page.
 *
 * Server component: reads the sanitized aggregate from buildPublicStats() (no
 * per-user data), then hands it to the <StatsView> client island which renders
 * the animated count-ups, scroll reveals, and bar charts. ISR: revalidate 60s.
 */

import Navbar from "@/components/Navbar";
import { buildPublicStats } from "@/lib/public-stats";
import StatsView from "./StatsView";

export const revalidate = 60;

export const metadata = {
  title: "Traction — Blue Agent",
  description:
    "Live, on-chain-verifiable traction for Blue Agent on Base: tokens launched, tool runs, active wallets, and product surface.",
};

export default async function StatsPage() {
  // Was `Promise.all([buildPublicStats(), getBankrUsage()])`. getBankrUsage and
  // lib/bankr-usage.ts are deleted — the Bankr account is banned (403 on the
  // usage read, measured 2026-09-18) and Bankr has not served an inference call
  // here since 2026-07-20, so the panel it fed was publishing $0.00 as a measured
  // figure. Full reasoning in the block comment in StatsView.tsx.
  const stats = await buildPublicStats();

  return (
    <div className="min-h-screen bg-[#050508] text-white">
      <Navbar />
      <StatsView stats={stats} />
    </div>
  );
}
