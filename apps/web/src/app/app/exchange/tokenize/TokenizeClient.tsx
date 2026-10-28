"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useSendTransaction, useSwitchChain } from "wagmi";
import { base } from "wagmi/chains";
import { createPublicClient, encodeFunctionData, http, isAddress, parseEther, parseEventLogs } from "viem";
import { ConnectButton } from "@/components/ConnectModal";
import ExchangeHeader from "../ExchangeHeader";
import {
  QUADRA_FACTORY_V3 as FACTORY, QUADRA_V3_ABI as ABI, QUADRA_V3_EXPECTS as EXPECT, BLUE_REFERRER, ETH_QUOTE,
  coinProblem, coinContractUri, newSalt, type CoinDraft,
} from "@/lib/agent-coin";

const pub = createPublicClient({ chain: base, transport: http() });
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const input = "w-full rounded-lg border border-[#1A1A2E] bg-[#050508] px-3 py-2 text-[11px] text-[#E2E8F0] outline-none focus:border-[#4FC3F7]/40";
const label = "text-[10px] text-[#94A3B8]";
const card = "rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14] px-4 py-3.5";
const H = ({ children }: { children: string }) => <h2 className="mb-2 text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">{children}</h2>;

type Step = { s: "idle" | "busy" | "done" | "error"; msg?: string; hash?: string };
interface Check { ok: boolean; why: string[]; referrerOk: boolean }

/** Every constant the page states is read back from the deployed factory first (Quadra's rule 16). */
async function preflight(): Promise<Check> {
  const why: string[] = [];
  const [low, high, creator, ref, eth, approved] = await Promise.all([
    pub.readContract({ address: FACTORY, abi: ABI, functionName: "FEE_LOW" }),
    pub.readContract({ address: FACTORY, abi: ABI, functionName: "FEE_HIGH" }),
    pub.readContract({ address: FACTORY, abi: ABI, functionName: "CREATOR_SHARE_BPS" }),
    pub.readContract({ address: FACTORY, abi: ABI, functionName: "REFERRER_SHARE_BPS" }),
    pub.readContract({ address: FACTORY, abi: ABI, functionName: "quotes", args: [ETH_QUOTE] }),
    pub.readContract({ address: FACTORY, abi: ABI, functionName: "approvedReferrers", args: [BLUE_REFERRER] }),
  ]);
  if (low !== EXPECT.feeLow || high !== EXPECT.feeHigh) why.push(`fees read ${low}/${high}, expected ${EXPECT.feeLow}/${EXPECT.feeHigh}`);
  if (creator !== EXPECT.creatorShareBps) why.push(`creator share reads ${creator} bps, expected ${EXPECT.creatorShareBps}`);
  if (ref !== EXPECT.referrerShareBps) why.push(`referrer share reads ${ref} bps, expected ${EXPECT.referrerShareBps}`);
  if (!eth[0]) why.push("the ETH pair is not enabled for new launches");
  return { ok: why.length === 0, why, referrerOk: approved };
}

export default function TokenizeClient() {
  const { address, chainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const [d, setD] = useState<CoinDraft>({ name: "", symbol: "", description: "", image: "", agentId: "" });
  const [fee, setFee] = useState<10_000 | 30_000>(10_000);
  const [buy, setBuy] = useState("0");
  const [check, setCheck] = useState<Check | null>(null);
  const [launch, setLaunch] = useState<Step & { token?: string }>({ s: "idle" });
  const [recip, setRecip] = useState("");
  const [route, setRoute] = useState<Step>({ s: "idle" });
  const [agentOwner, setAgentOwner] = useState<string | null>(null);

  useEffect(() => { preflight().then(setCheck).catch(() => setCheck({ ok: false, why: ["could not read the factory on Base"], referrerOk: false })); }, []);
  useEffect(() => {
    setAgentOwner(null);
    const id = d.agentId.trim();
    if (!/^\d+$/.test(id)) return;
    pub.readContract({ address: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432", abi: [{ type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "address" }] }] as const, functionName: "ownerOf", args: [BigInt(id)] })
      .then((o) => setAgentOwner(o.toLowerCase())).catch(() => setAgentOwner("none"));
  }, [d.agentId]);

  const set = (k: keyof CoinDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });
  const problem = coinProblem(d);
  let buyWei = 0n;
  let buyBad = false;
  try { buyWei = parseEther(buy || "0"); } catch { buyBad = true; }
  const agentNotMine = !!agentOwner && agentOwner !== "none" && !!address && agentOwner !== address.toLowerCase();

  async function onLaunch() {
    setLaunch({ s: "busy", msg: "Confirm in your wallet…" });
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      const data = encodeFunctionData({ abi: ABI, functionName: "launch", args: [d.name.trim(), d.symbol.trim(), coinContractUri(d), newSalt(), ETH_QUOTE, buyWei, fee, BLUE_REFERRER] });
      const hash = await sendTransactionAsync({ to: FACTORY, data, value: buyWei, chainId: base.id });
      const rc = await pub.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error(`launch reverted (${hash})`);
      const ev = parseEventLogs({ abi: ABI, logs: rc.logs, eventName: "Launched" })[0];
      setLaunch({ s: "done", hash, token: ev?.args.token, msg: ev ? `${d.symbol.trim()} is live.` : "Launched. Read the token from the transaction." });
    } catch (e) {
      setLaunch({ s: "error", msg: (e as Error).message.split("\n")[0].slice(0, 200) });
    }
  }

  async function onRoute() {
    if (!launch.token || !isAddress(recip)) return setRoute({ s: "error", msg: "Not an address." });
    setRoute({ s: "busy", msg: "Confirm in your wallet…" });
    try {
      const hash = await sendTransactionAsync({ to: FACTORY, data: encodeFunctionData({ abi: ABI, functionName: "setCreatorRecipient", args: [launch.token as `0x${string}`, recip] }), chainId: base.id });
      const rc = await pub.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("reverted");
      setRoute({ s: "done", hash, msg: `The coin's 80% now goes to ${short(recip)}.` });
    } catch (e) { setRoute({ s: "error", msg: (e as Error).message.split("\n")[0].slice(0, 200) }); }
  }

  const Status = ({ s }: { s: Step }) => s.s === "idle" ? null : (
    <p className={`text-[10.5px] ${s.s === "error" ? "text-[#F87171]" : s.s === "done" ? "text-[#34D399]" : "text-[#94A3B8]"}`}>
      {s.msg}{s.hash && <> · <a className="text-[#4FC3F7]" href={`https://basescan.org/tx/${s.hash}`} target="_blank" rel="noreferrer">Basescan ↗</a></>}
    </p>
  );

  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden font-mono [&_button]:font-mono [&_a]:font-mono [&_input]:font-mono [&_textarea]:font-mono">
      <ExchangeHeader active="tokenize" chip="Quadra launchpad v3 · Base 8453" />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-5 py-[18px] grid gap-5 mx-auto w-full max-w-6xl">
          <div>
            <h1 className="text-[15px] font-semibold text-[#E2E8F0]">Tokenize an agent</h1>
            <p className="mt-1.5 max-w-[860px] text-[11px] leading-[1.7] text-[#94A3B8]">
              Launch a coin for your agent on Quadra&apos;s launchpad on Base 8453. The coin has no admin and a fixed supply, and its whole supply sits
              in a Uniswap v4 pool as liquidity nobody can pull. Every trade pays the pool fee, and 80% of it can go straight to your agent&apos;s wallet
              to fund its work. You sign every step from your own wallet.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start">
            <section className={`${card} grid gap-3`}>
              <H>THE COIN</H>
              <label className="grid gap-1"><span className={label}>Name *</span><input className={input} value={d.name} onChange={set("name")} maxLength={32} /></label>
              <label className="grid gap-1"><span className={label}>Symbol *</span><input className={input} value={d.symbol} onChange={set("symbol")} maxLength={11} placeholder="AGENT" /></label>
              <label className="grid gap-1"><span className={label}>Description</span><textarea className={`${input} min-h-[70px]`} value={d.description} onChange={set("description")} maxLength={280} /></label>
              <label className="grid gap-1"><span className={label}>Image URL (https)</span><input className={input} value={d.image} onChange={set("image")} placeholder="https://…/logo.png" /></label>
              <label className="grid gap-1"><span className={label}>ERC-8004 agent id (optional)</span><input className={input} value={d.agentId} onChange={set("agentId")} placeholder="e.g. 1137821" /></label>
              {agentOwner === "none" && <p className="text-[10px] text-[#F87171]">No agent #{d.agentId} on Base.</p>}
              {agentNotMine && <p className="text-[10px] text-[#FBBF24]">Agent #{d.agentId} is owned by {short(agentOwner!)}, not the connected wallet. The coin will point at it anyway; make sure it is yours.</p>}
              <div className="grid gap-1">
                <span className={label}>Pool fee (chosen once, forever)</span>
                <div className="flex gap-1.5">
                  {([[10_000, "1%"], [30_000, "3%"]] as const).map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setFee(v)} className="rounded-full border px-[11px] py-1 text-[9.5px]"
                      style={fee === v ? { color: "#050508", background: "#4FC3F7", borderColor: "#4FC3F7", fontWeight: 600 } : { color: "#94A3B8", borderColor: "#1A1A2E" }}>{l}</button>
                  ))}
                </div>
              </div>
              <label className="grid gap-1"><span className={label}>Your first buy, in ETH (0 = none), at the opening price, before anyone else</span><input className={input} value={buy} onChange={(e) => setBuy(e.target.value.trim())} /></label>
              {buyBad && <p className="text-[10px] text-[#F87171]">Not an ETH amount.</p>}
              {problem && d.name && <p className="text-[10px] text-[#F87171]">{problem}</p>}
            </section>

            <div className="grid gap-5">
              <section className={card}>
                <H>WHERE THE FEES GO</H>
                <ul className="grid gap-1 text-[10.5px] text-[#94A3B8]">
                  <li><span className="text-[#E2E8F0]">80%</span> to the launcher, or to the agent&apos;s wallet once you route it (step 2)</li>
                  <li><span className="text-[#E2E8F0]">5%</span> to Blue Agent as the referrer {check && !check.referrerOk && <span className="text-[#FBBF24]">(not approved right now: recorded as none)</span>}</li>
                  <li><span className="text-[#E2E8F0]">15%</span> to Quadra</li>
                </ul>
                <p className="mt-2 text-[10px] leading-[1.6] text-[#64748B]">
                  Holders are not paid: the launchpad has one fee recipient per coin and no holder distribution. Anyone can call collect() to push the fees out.
                </p>
              </section>

              <section className={`${card} grid gap-2.5`}>
                <H>1 · LAUNCH</H>
                {check === null ? <p className="text-[10.5px] text-[#64748B]">Reading the factory on Base…</p>
                  : !check.ok ? <p className="text-[10.5px] text-[#F87171]">Not sending: the factory did not answer as expected ({check.why.join("; ")}).</p>
                  : !isConnected ? <ConnectButton label="Connect wallet" />
                  : <button type="button" onClick={onLaunch} disabled={!!problem || buyBad || launch.s === "busy" || launch.s === "done"}
                      className="rounded-[8px] bg-[#4FC3F7] px-[13px] py-2 text-[10.5px] font-semibold text-[#050508] hover:bg-[#29ABE2] disabled:opacity-40">
                      {launch.s === "busy" ? "Launching…" : `Launch ${d.symbol.trim() || "the coin"}${buyWei > 0n ? ` and buy ${buy} ETH` : ""}`}
                    </button>}
                <Status s={launch} />
                {launch.token && (
                  <p className="text-[10.5px] text-[#94A3B8]">
                    Token <a className="text-[#4FC3F7]" href={`https://basescan.org/token/${launch.token}`} target="_blank" rel="noreferrer">{short(launch.token)} ↗</a> ·{" "}
                    <a className="text-[#4FC3F7]" href={`https://dexscreener.com/base/${launch.token}`} target="_blank" rel="noreferrer">chart ↗</a>
                  </p>
                )}
                <p className="text-[9.5px] text-[#475569]">Factory <a className="text-[#4FC3F7]" href={`https://basescan.org/address/${FACTORY}`} target="_blank" rel="noreferrer">{short(FACTORY)}</a> · Quadra v3 is not audited.</p>
              </section>

              <section className={`${card} grid gap-2.5`}>
                <H>2 · SEND THE 80% TO THE AGENT</H>
                <p className="text-[10px] leading-[1.6] text-[#64748B]">Point the launcher&apos;s share at the agent&apos;s own wallet, so its coin funds its work. Only the current recipient can change it.</p>
                <input className={input} value={recip} onChange={(e) => setRecip(e.target.value.trim())} placeholder="Agent wallet 0x…" disabled={!launch.token} />
                <button type="button" onClick={onRoute} disabled={!launch.token || !recip || route.s === "busy" || route.s === "done"}
                  className="rounded-[8px] border border-[#1A1A2E] bg-[#0F121A] px-[13px] py-2 text-[10.5px] text-[#E2E8F0] disabled:opacity-40">
                  Route fees to this wallet
                </button>
                <Status s={route} />
              </section>
            </div>
          </div>

          <p className="text-[9.5px] leading-relaxed text-[#475569]">
            A coin is not a share in the agent and pays no dividends. Launching one is your decision and your transaction; Blue Agent builds the calls and never holds your keys or funds.
            {" "}<Link className="text-[#4FC3F7]" href="/exchange/create">No agent yet? Create one first →</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
