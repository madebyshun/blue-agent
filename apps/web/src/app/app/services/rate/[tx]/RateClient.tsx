"use client";

import { useState } from "react";
import { useAccount, useSendTransaction, useSwitchChain } from "wagmi";
import { base } from "wagmi/chains";
import { createPublicClient, encodeFunctionData, http, keccak256, toHex } from "viem";
import { ConnectButton } from "@/components/ConnectModal";
import { ERC8004_REPUTATION_ADDRESS as REP, ERC8004_FEEDBACK_ABI as ABI } from "@/lib/erc8004-draft";

const pub = createPublicClient({ chain: base, transport: http() });
const short = (a: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

export default function RateClient(p: { agentId: string; tool: string; tx: string; payer: string | null; units: number; at: string; feedbackURI: string }) {
  const { address, chainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const [score, setScore] = useState(80);
  const [st, setSt] = useState<{ s: "idle" | "busy" | "done" | "error"; msg?: string; hash?: string }>({ s: "idle" });
  const isPayer = !!address && !!p.payer && address.toLowerCase() === p.payer.toLowerCase();

  async function submit() {
    setSt({ s: "busy", msg: "Confirm in your wallet…" });
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      const data = encodeFunctionData({
        abi: ABI, functionName: "giveFeedback",
        args: [BigInt(p.agentId), BigInt(score), 0, "mcp", p.tool, "https://blueagent.dev/api/mcp", p.feedbackURI, keccak256(toHex(p.feedbackURI))],
      });
      const hash = await sendTransactionAsync({ to: REP, data, chainId: base.id });
      const rc = await pub.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("the registry refused it (the agent's owner cannot rate itself)");
      setSt({ s: "done", hash, msg: `Rated ${score}/100. It is on the ERC-8004 Reputation Registry now.` });
    } catch (e) {
      setSt({ s: "error", msg: (e as Error).message.split("\n")[0].slice(0, 200) });
    }
  }

  const card = "rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14] p-[14px]";
  return (
    <div className="grid gap-3">
      <h1 className="text-[18px] font-semibold text-[#E2E8F0]">Rate this call</h1>
      <div className={card}>
        <p className="text-[12px] font-medium tracking-[0.14em] text-[#64748B]">THE CALL</p>
        <p className="mt-2 text-[15px] text-[#E2E8F0]">{p.tool} · ${(p.units / 1e6).toFixed(2)} USDC · {p.at.slice(0, 16).replace("T", " ")}Z</p>
        <p className="mt-1 text-[13px] text-[#94A3B8]">
          Paid by {short(p.payer)} · <a className="text-[#4FC3F7]" href={`https://basescan.org/tx/${p.tx}`} target="_blank" rel="noreferrer">Base tx ↗</a> ·{" "}
          <a className="text-[#4FC3F7]" href={p.feedbackURI} target="_blank" rel="noreferrer">proof file ↗</a>
        </p>
      </div>
      <div className={card}>
        <p className="text-[12px] font-medium tracking-[0.14em] text-[#64748B]">YOUR SCORE</p>
        <div className="mt-3 flex items-center gap-3">
          <input type="range" min={0} max={100} value={score} onChange={(e) => setScore(Number(e.target.value))} className="flex-1 accent-[#4FC3F7]" />
          <span className="w-14 text-right text-[22px] font-semibold text-[#E2E8F0] tabular-nums">{score}</span>
        </div>
        <p className="mt-2 text-[13px] leading-[1.6] text-[#64748B]">
          Posted to the ERC-8004 Reputation Registry on Base 8453 for agent #{p.agentId}, tagged <span className="text-[#94A3B8]">mcp · {p.tool}</span>, pointing at the proof file above.
          Only the wallet that paid can rate it here, and you pay the gas. Blue Agent never signs ratings.
        </p>
        <div className="mt-3">
          {!isConnected ? <ConnectButton label="Connect the wallet that paid" /> : !isPayer ? (
            <p className="text-[13px] text-[#FBBF24]">Connected {short(address ?? null)}. This call was paid by {short(p.payer)}; connect that wallet to rate it.</p>
          ) : (
            <button type="button" onClick={submit} disabled={st.s === "busy" || st.s === "done"}
              className="rounded-[8px] bg-[#4FC3F7] px-[13px] py-2 text-[13px] font-semibold text-[#050508] hover:bg-[#29ABE2] disabled:opacity-40">
              {st.s === "busy" ? "Posting…" : `Post ${score}/100 on Base`}
            </button>
          )}
        </div>
        {st.s !== "idle" && (
          <p className={`mt-2 text-[13px] ${st.s === "error" ? "text-[#F87171]" : st.s === "done" ? "text-[#34D399]" : "text-[#94A3B8]"}`}>
            {st.msg}{st.hash && <> · <a className="text-[#4FC3F7]" href={`https://basescan.org/tx/${st.hash}`} target="_blank" rel="noreferrer">Basescan ↗</a></>}
          </p>
        )}
      </div>
    </div>
  );
}
