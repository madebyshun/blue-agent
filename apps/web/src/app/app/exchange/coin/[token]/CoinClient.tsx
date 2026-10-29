"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useSendTransaction, useSwitchChain } from "wagmi";
import { base } from "wagmi/chains";
import { createPublicClient, encodeFunctionData, formatUnits, http, parseUnits } from "viem";
import { ConnectButton } from "@/components/ConnectModal";
import { REVENUE_SHARE_ABI as RS, ERC20_MIN_ABI as ERC20, QUADRA_FACTORY_V3, stakerWording } from "@/lib/agent-coin";
import { useSpendableBalance } from "@/lib/wallet/useSpendableBalance";
import { resolveSpend } from "@/lib/wallet/read-state";
import { UnverifiedBalance } from "@/components/wallet/UnverifiedBalance";

const pub = createPublicClient({ chain: base, transport: http() });
const ZERO = "0x0000000000000000000000000000000000000000";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const card = "rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14] p-[14px]";
const input = "w-full rounded-lg border border-[#1A1A2E] bg-[#050508] px-3 py-2 text-[14px] text-[#E2E8F0] outline-none focus:border-[#4FC3F7]/40";
const btn = "rounded-[8px] px-[13px] py-2 text-[13px] disabled:opacity-40";
const L = ({ t, s }: { t: string; s?: string }) => (
  <div className="flex items-baseline gap-2.5 mt-[24px] mb-3 flex-wrap">
    <span className="text-[12px] font-medium tracking-[0.14em] text-[#64748B]">{t}</span>
    {s && <span className="text-[13px] text-[#64748B]">{s}</span>}
  </div>
);

interface Cur { addr: string; symbol: string; decimals: number }
interface State {
  active: boolean; launchpadOk: boolean; agent: string; agentBps: number; total: bigint;
  c0: Cur; c1: Cur; coin: Cur; mine: bigint; allowance: bigint; claim0: bigint; claim1: bigint;
}

async function cur(addr: string): Promise<Cur> {
  if (addr.toLowerCase() === ZERO) return { addr, symbol: base.nativeCurrency.symbol, decimals: base.nativeCurrency.decimals };
  const [symbol, decimals] = await Promise.all([
    pub.readContract({ address: addr as `0x${string}`, abi: ERC20, functionName: "symbol" }),
    pub.readContract({ address: addr as `0x${string}`, abi: ERC20, functionName: "decimals" }),
  ]);
  return { addr, symbol, decimals };
}

export default function CoinClient({ token, shares }: { token: string; shares: { share: string; agent: string; agentBps: number }[] | null }) {
  const { address, chainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const [active, setActive] = useState<string | null | undefined>(undefined);
  const [st, setSt] = useState<State | null>(null);
  const [amt, setAmt] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; hash?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // The coin balance that gates Stake: one hook, three-outcome verdict (spend-gate-check).
  const bal = useSpendableBalance({ holder: address ?? "", native: false, token, chainId: base.id });

  // Of all share contracts made for this coin, the one that is its creator recipient now.
  useEffect(() => {
    if (!shares) return setActive(null);
    Promise.all(shares.map((s) => pub.readContract({ address: s.share as `0x${string}`, abi: RS, functionName: "isActive" }).then((a) => (a ? s.share : null)).catch(() => null)))
      .then((r) => setActive(r.find(Boolean) ?? null));
  }, [shares]);

  const load = useCallback(async () => {
    if (!active) return;
    const S = active as `0x${string}`;
    const r = (fn: string, args: unknown[] = []) => pub.readContract({ address: S, abi: RS, functionName: fn as never, args: args as never });
    const [isA, lp, agent, bps, total, a0, a1] = await Promise.all([r("isActive"), r("launchpad"), r("agent"), r("agentBps"), r("totalStaked"), r("currency0"), r("currency1")]) as [boolean, string, string, number, bigint, string, string];
    const [c0, c1, coin] = await Promise.all([cur(a0), cur(a1), cur(token)]);
    let mine = 0n, allowance = 0n, claim0 = 0n, claim1 = 0n;
    if (address) {
      [mine, allowance] = await Promise.all([
        r("stakedOf", [address]) as Promise<bigint>,
        pub.readContract({ address: token as `0x${string}`, abi: ERC20, functionName: "allowance", args: [address, S] }),
      ]);
      [claim0, claim1] = (await r("claimable", [address])) as [bigint, bigint];
    }
    setSt({ active: isA, launchpadOk: lp.toLowerCase() === QUADRA_FACTORY_V3.toLowerCase(), agent, agentBps: Number(bps), total, c0, c1, coin, mine, allowance, claim0, claim1 });
  }, [active, address, token]);
  useEffect(() => { load().catch(() => setSt(null)); }, [load]);

  async function tx(to: `0x${string}`, data: `0x${string}`, label: string) {
    setBusy(true); setMsg({ ok: true, text: `${label}: confirm in your wallet…` });
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      const hash = await sendTransactionAsync({ to, data, chainId: base.id });
      const rc = await pub.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("reverted");
      setMsg({ ok: true, text: `${label}: done.`, hash });
      await load();
    } catch (e) { setMsg({ ok: false, text: `${label}: ${(e as Error).message.split("\n")[0].slice(0, 160)}` }); }
    finally { setBusy(false); }
  }

  if (shares === null) return <p className="text-[13px] text-[#64748B]">Could not read the share contracts from Base right now.</p>;
  if (active === undefined) return <p className="text-[13px] text-[#64748B]">Reading the chain…</p>;
  if (!active) return (
    <div className={card}>
      <p className="text-[15px] text-[#E2E8F0]">No active share contract for {short(token)}.</p>
      <p className="mt-1 text-[13px] text-[#64748B]">Its launcher&apos;s fees are not shared with stakers. The launcher can set that up on <Link className="text-[#4FC3F7]" href="/exchange/tokenize">Tokenize</Link>, step 2.</p>
    </div>
  );
  if (!st) return <p className="text-[13px] text-[#64748B]">Reading the share contract…</p>;
  if (!st.launchpadOk) return <p className="text-[13px] text-[#F87171]">This share contract is not bound to Quadra&apos;s launchpad; not offering it.</p>;

  const f = (v: bigint, c: Cur) => Number(formatUnits(v, c.decimals)).toLocaleString("en-US", { maximumFractionDigits: 6 });
  let want = 0n;
  try { want = amt ? parseUnits(amt, st.coin.decimals) : 0n; } catch { want = 0n; }
  const gate = resolveSpend({ loading: bal.loading, received: bal.received, failed: bal.failed, over: bal.raw != null && want > bal.raw });
  const S = active as `0x${string}`;

  return (
    <div>
      <h1 className="text-[18px] font-semibold text-[#E2E8F0]">Stake ${st.coin.symbol}</h1>
      <p className="mt-1.5 max-w-[860px] text-[14px] leading-[1.7] text-[#94A3B8]">{stakerWording(st.coin.symbol, st.c0.symbol === st.coin.symbol ? st.c1.symbol : st.c0.symbol)}</p>
      <p className="mt-1 text-[13px] text-[#64748B]">
        Share contract <a className="text-[#4FC3F7]" href={`https://basescan.org/address/${S}`} target="_blank" rel="noreferrer">{short(S)}</a> ·{" "}
        {st.agentBps > 0 ? <>{short(st.agent)} receives {st.agentBps / 100}% of the launcher&apos;s fee share; stakers share the rest</> : "stakers share all of the launcher's fee share"} ·
        released over 7 days · no owner · not audited
      </p>

      <div className="mt-4 grid gap-2.5 grid-cols-2 md:grid-cols-4">
        {[
          ["TOTAL STAKED", `${f(st.total, st.coin)} ${st.coin.symbol}`],
          ["YOUR STAKE", isConnected ? `${f(st.mine, st.coin)} ${st.coin.symbol}` : "—"],
          [`CLAIMABLE ${st.c0.symbol}`, isConnected ? f(st.claim0, st.c0) : "—"],
          [`CLAIMABLE ${st.c1.symbol}`, isConnected ? f(st.claim1, st.c1) : "—"],
        ].map(([l, v]) => (
          <div key={l} className={card}><p className="text-[12px] tracking-[0.12em] text-[#64748B]">{l}</p><p className="mt-1.5 text-[19px] font-semibold text-[#E2E8F0] tabular-nums">{v}</p></div>
        ))}
      </div>

      <L t="STAKE · UNSTAKE · CLAIM" s="unstake any time, no lock, no fee" />
      <div className={`${card} grid gap-2.5`}>
        {!isConnected ? <ConnectButton label="Connect wallet" /> : (
          <>
            {gate === "unverified"
              ? <UnverifiedBalance symbol={st.coin.symbol} onRetry={() => { void bal.refetch(); }} busy={bal.refetching} />
              : <p className="text-[13px] text-[#64748B]">Wallet balance: {bal.raw != null ? f(bal.raw, st.coin) : "reading…"} {st.coin.symbol}{gate === "insufficient" ? " · not enough for this amount" : ""}</p>}
            <input className={`${input} max-w-[320px]`} value={amt} onChange={(e) => setAmt(e.target.value.trim())} placeholder={`Amount of ${st.coin.symbol}`} />
            <div className="flex flex-wrap gap-2">
              {st.allowance < want ? (
                <button type="button" disabled={busy || want === 0n} className={`${btn} border border-[#1A1A2E] bg-[#0F121A] text-[#E2E8F0]`}
                  onClick={() => tx(token as `0x${string}`, encodeFunctionData({ abi: ERC20, functionName: "approve", args: [S, want] }), "Approve")}>1 · Approve {amt || "0"} {st.coin.symbol}</button>
              ) : null}
              <button type="button" disabled={busy || want === 0n || st.allowance < want || gate !== "ok" || !st.active} className={`${btn} bg-[#4FC3F7] font-semibold text-[#050508]`}
                onClick={() => tx(S, encodeFunctionData({ abi: RS, functionName: "stake", args: [want] }), "Stake")}>Stake</button>
              <button type="button" disabled={busy || want === 0n || want > st.mine} className={`${btn} border border-[#1A1A2E] bg-[#0F121A] text-[#E2E8F0]`}
                onClick={() => tx(S, encodeFunctionData({ abi: RS, functionName: "unstake", args: [want] }), "Unstake")}>Unstake</button>
              <button type="button" disabled={busy || (st.claim0 === 0n && st.claim1 === 0n)} className={`${btn} border border-[#34D399]/40 text-[#34D399]`}
                onClick={() => tx(S, encodeFunctionData({ abi: RS, functionName: "claim", args: [address!] }), "Claim")}>Claim to this wallet</button>
            </div>
            {!st.active && <p className="text-[13px] text-[#FBBF24]">This contract is no longer the coin&apos;s fee recipient; staking is off. You can still unstake and claim.</p>}
          </>
        )}
        {msg && <p className={`text-[13px] ${msg.ok ? "text-[#94A3B8]" : "text-[#F87171]"}`}>{msg.text}{msg.hash && <> · <a className="text-[#4FC3F7]" href={`https://basescan.org/tx/${msg.hash}`} target="_blank" rel="noreferrer">Basescan ↗</a></>}</p>}
      </div>

      <L t="ANYONE CAN" s="public calls, they move nothing to the caller" />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !isConnected} className={`${btn} border border-[#1A1A2E] bg-[#0F121A] text-[#E2E8F0]`}
          onClick={() => tx(S, encodeFunctionData({ abi: RS, functionName: "harvest" }), "Harvest")}>Harvest fees from the pool</button>
        {st.agentBps > 0 && (
          <button type="button" disabled={busy || !isConnected} className={`${btn} border border-[#1A1A2E] bg-[#0F121A] text-[#E2E8F0]`}
            onClick={() => tx(S, encodeFunctionData({ abi: RS, functionName: "payAgent" }), "Pay agent")}>Pay the agent its share</button>
        )}
      </div>
      <p className="mt-4 text-[12px] leading-relaxed text-[#64748B]">
        Fees reach stakers over 7 days after they arrive. Holders who do not stake receive nothing. This contract has no owner, cannot be upgraded or paused,
        and is not audited. Blue Agent builds these calls; your wallet signs every one.
      </p>
    </div>
  );
}
