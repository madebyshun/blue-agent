// /exchange/coin/<token> — stake an agent coin into its RevenueShare contract
// (Quadra, deployer 0xfBd4…8141) and claim the trading fees it streams to
// stakers. Share contracts are found from the deployer's Created events, never
// hard-coded; the client re-checks isActive() before offering to stake.
import type { Metadata } from "next";
import { createPublicClient, http, isAddress } from "viem";
import { base } from "viem/chains";
import { notFound } from "next/navigation";
import { REVENUE_SHARE_DEPLOYER, REVENUE_SHARE_DEPLOYER_ABI, REVENUE_SHARE_DEPLOY_BLOCK } from "@/lib/agent-coin";
import ExchangeHeader from "../../ExchangeHeader";
import CoinClient from "./CoinClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Stake an agent coin — Blue Agent" };

async function sharesOf(token: `0x${string}`): Promise<{ share: string; agent: string; agentBps: number }[] | null> {
  try {
    const c = createPublicClient({ chain: base, transport: http(process.env.HUB_RPC_URL || "https://base-rpc.publicnode.com") });
    const ev = REVENUE_SHARE_DEPLOYER_ABI.find((x) => x.type === "event" && x.name === "Created")!;
    // Chunked: publicnode refuses more than 50,000 blocks per getLogs.
    const head = await c.getBlockNumber();
    const logs: unknown[] = [];
    for (let a = REVENUE_SHARE_DEPLOY_BLOCK; a <= head; a += 49_000n) {
      logs.push(...(await c.getLogs({ address: REVENUE_SHARE_DEPLOYER, event: ev as never, args: { token } as never, fromBlock: a, toBlock: a + 48_999n < head ? a + 48_999n : head })));
    }
    return logs.map((l) => {
      const a = (l as unknown as { args: { share: string; agent: string; agentBps: number } }).args;
      return { share: a.share, agent: a.agent, agentBps: Number(a.agentBps) };
    });
  } catch {
    return null;
  }
}

export default async function CoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isAddress(token)) notFound();
  const shares = await sharesOf(token as `0x${string}`);
  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden font-mono [&_button]:font-mono [&_a]:font-mono [&_input]:font-mono">
      <ExchangeHeader active="tokenize" chip="Quadra RevenueShare · Base 8453" />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-5 py-[18px] w-full">
          <CoinClient token={token} shares={shares} />
        </div>
      </div>
    </div>
  );
}
