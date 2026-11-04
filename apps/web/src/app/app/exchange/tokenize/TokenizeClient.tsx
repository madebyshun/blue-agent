"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useSendTransaction, useSwitchChain } from "wagmi";
import { base } from "wagmi/chains";
import { createPublicClient, encodeFunctionData, http, isAddress, parseEventLogs, parseUnits } from "viem";
import { ConnectButton } from "@/components/ConnectModal";
import ExchangeHeader from "../ExchangeHeader";
import MarketsHeader from "../../markets/MarketsHeader";
import {
  QUADRA_FACTORY_V3 as FACTORY, QUADRA_V3_ABI as ABI, QUADRA_V3_EXPECTS as EXPECT, BLUE_REFERRER, ETH_QUOTE,
  REVENUE_SHARE_DEPLOYER as RSD, REVENUE_SHARE_DEPLOYER_ABI as RSD_ABI, MAX_AGENT_BPS, stakerWording,
  ERC20_MIN_ABI, coinProblem, coinContractUri, newSalt, type CoinDraft,
} from "@/lib/agent-coin";
import { COINBASE_BASE_STOCKS } from "@/lib/base-stocks/coinbase-list";
import { useSpendableBalance } from "@/lib/wallet/useSpendableBalance";
import { resolveSpend } from "@/lib/wallet/read-state";
import { UnverifiedBalance } from "@/components/wallet/UnverifiedBalance";

const pub = createPublicClient({ chain: base, transport: http() });
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const input = "w-full rounded-lg border border-[#1A1A2E] bg-[#050508] px-3 py-2 text-[14px] text-[#E2E8F0] outline-none focus:border-[#4FC3F7]/40";
const label = "text-[13px] text-[#94A3B8]";
const card = "rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14] px-4 py-3.5";

type Step = { s: "idle" | "busy" | "done" | "error"; msg?: string; hash?: string };
/** What a coin can pair with: ETH, or a Coinbase stock on Base the factory has enabled. */
interface Pair { address: `0x${string}`; symbol: string; decimals: number }
const ETH_PAIR: Pair = { address: ETH_QUOTE, symbol: "ETH", decimals: 18 };
interface Check { ok: boolean; why: string[]; referrerOk: boolean; pairs: Pair[] }

/** Every constant the page states is read back from the deployed factory first (Quadra's rule 16). */
async function preflight(): Promise<Check> {
  const why: string[] = [];
  const [low, high, creator, ref, eth, approved, stocks] = await Promise.all([
    pub.readContract({ address: FACTORY, abi: ABI, functionName: "FEE_LOW" }),
    pub.readContract({ address: FACTORY, abi: ABI, functionName: "FEE_HIGH" }),
    pub.readContract({ address: FACTORY, abi: ABI, functionName: "CREATOR_SHARE_BPS" }),
    pub.readContract({ address: FACTORY, abi: ABI, functionName: "REFERRER_SHARE_BPS" }),
    pub.readContract({ address: FACTORY, abi: ABI, functionName: "quotes", args: [ETH_QUOTE] }),
    pub.readContract({ address: FACTORY, abi: ABI, functionName: "approvedReferrers", args: [BLUE_REFERRER] }),
    // A stock is offered only when the factory itself answers that its pair is enabled (one Multicall3 read).
    pub.multicall({ contracts: COINBASE_BASE_STOCKS.map((st) => ({ address: FACTORY, abi: ABI, functionName: "quotes", args: [st.token] } as const)) }),
  ]);
  // Coinbase stocks on Base are B20 with 8 decimals (asserted on chain in coinbase-list.ts).
  const pairs: Pair[] = [
    ...(eth[0] ? [ETH_PAIR] : []),
    ...COINBASE_BASE_STOCKS.filter((_, i) => stocks[i].status === "success" && (stocks[i].result as readonly [boolean, number])[0])
      .map((st) => ({ address: st.token, symbol: st.symbol, decimals: 8 })),
  ];
  if (low !== EXPECT.feeLow || high !== EXPECT.feeHigh) why.push(`fees read ${low}/${high}, expected ${EXPECT.feeLow}/${EXPECT.feeHigh}`);
  if (creator !== EXPECT.creatorShareBps) why.push(`creator share reads ${creator} bps, expected ${EXPECT.creatorShareBps}`);
  if (ref !== EXPECT.referrerShareBps) why.push(`referrer share reads ${ref} bps, expected ${EXPECT.referrerShareBps}`);
  if (pairs.length === 0) why.push("no pair is enabled for new launches");
  return { ok: why.length === 0, why, referrerOk: approved, pairs };
}

/** What the page knows about a pair asset beyond the factory: its logo and USD price (GeckoTerminal, via lib/markets). */
export type AssetInfo = Record<string, { logo: string | null; priceUsd: number | null }>;

const usd = (n: number | null | undefined) => n == null ? null : n >= 1000 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toPrecision(3)}`;

/** A pair's mark: the token logo when we have one, else a monogram. ETH gets its glyph. */
function PairMark({ p, info, size = 28 }: { p: Pair; info?: AssetInfo; size?: number }) {
  const [bad, setBad] = useState(false);
  const logo = info?.[p.address.toLowerCase()]?.logo;
  if (logo && !bad) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt="" width={size} height={size} onError={() => setBad(true)} className="shrink-0 rounded-full bg-[#0F121A] object-cover" style={{ width: size, height: size }} />;
  }
  const t = p.address === ETH_QUOTE ? "Ξ" : p.symbol.replace(/c$/, "").slice(0, 2);
  return <span className="inline-flex shrink-0 items-center justify-center rounded-full border border-[#2a3350] bg-[#0F121A] font-semibold text-[#94A3B8]" style={{ width: size, height: size, fontSize: Math.round(size * (t === "Ξ" ? 0.5 : 0.34)) }}>{t}</span>;
}

/** The paired-asset picker: search, ETH or a stock, each with its mark and price. */
function PairPicker({ pairs, value, onPick, info }: { pairs: Pair[]; value: Pair; onPick: (p: Pair) => void; info?: AssetInfo }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"all" | "crypto" | "stocks">("all");
  const name = (p: Pair) => p.address === ETH_QUOTE ? "Ether" : COINBASE_BASE_STOCKS.find((s) => s.token === p.address)?.name ?? p.symbol;
  const shown = pairs.filter((p) => (cat === "all" || (cat === "crypto") === (p.address === ETH_QUOTE)) &&
    (!q.trim() || `${p.symbol} ${name(p)}`.toLowerCase().includes(q.trim().toLowerCase())));
  const stocks = pairs.filter((p) => p.address !== ETH_QUOTE).length;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 rounded-lg border border-[#1A1A2E] bg-[#050508] px-3 py-2 text-left hover:border-[#4FC3F7]/40">
        <PairMark p={value} info={info} />
        <span className="flex-1 leading-tight">
          <span className="block text-[14px] font-semibold text-[#E2E8F0]">{value.symbol}</span>
          <span className="block text-[12px] text-[#64748B]">{name(value)}{usd(info?.[value.address.toLowerCase()]?.priceUsd) ? ` · ${usd(info?.[value.address.toLowerCase()]?.priceUsd)}` : ""}</span>
        </span>
        <span className="text-[12px] text-[#64748B]">{pairs.length} assets ⌄</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1.5 w-full rounded-[12px] border border-[#1A1A2E] bg-[#0D0D14] p-2 shadow-2xl">
          <input autoFocus className={`${input} mb-2`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ETH, NVDA, Tesla…" />
          <div className="mb-2 flex gap-1.5">
            {([["all", `All ${pairs.length}`], ["crypto", "Crypto 1"], ["stocks", `Stocks ${stocks}`]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setCat(k)} className="rounded-full border px-[10px] py-0.5 text-[12px]"
                style={cat === k ? { color: "#050508", background: "#4FC3F7", borderColor: "#4FC3F7", fontWeight: 600 } : { color: "#94A3B8", borderColor: "#1A1A2E" }}>{l}</button>
            ))}
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {shown.map((p) => (
              <button key={p.address} type="button" onClick={() => { onPick(p); setOpen(false); setQ(""); }}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-[#0F121A] ${p.address === value.address ? "bg-[#4FC3F7]/10" : ""}`}>
                <PairMark p={p} info={info} size={26} />
                <span className="flex-1 leading-tight">
                  <span className="block text-[13px] font-semibold text-[#E2E8F0]">{p.symbol} <span className="ml-1 rounded-full border border-[#34D399]/30 px-1.5 text-[10px] font-normal text-[#34D399]">Launch enabled</span></span>
                  <span className="block text-[12px] text-[#64748B]">{name(p)}</span>
                </span>
                <span className="text-[12px] tabular-nums text-[#94A3B8]">{usd(info?.[p.address.toLowerCase()]?.priceUsd) ?? ""}</span>
              </button>
            ))}
            {!shown.length && <p className="px-2 py-3 text-[13px] text-[#64748B]">No enabled pair matches.</p>}
          </div>
          <p className="mt-1 px-2 text-[11px] text-[#64748B]">Only pairs the launchpad has enabled on Base 8453, read from the factory.</p>
        </div>
      )}
    </div>
  );
}

/** `markets`: rendered as Markets → Launch token (/markets/launch); otherwise the Exchange tab. */
export default function TokenizeClient({ markets = false, assets }: { markets?: boolean; assets?: AssetInfo } = {}) {
  const { address, chainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const [d, setD] = useState<CoinDraft>({ name: "", symbol: "", description: "", image: "", agentId: "" });
  const [fee, setFee] = useState<10_000 | 30_000>(10_000);
  const [buy, setBuy] = useState("0");
  const [pairAddr, setPairAddr] = useState<string>(ETH_QUOTE);
  const [check, setCheck] = useState<Check | null>(null);
  const [launch, setLaunch] = useState<Step & { token?: string }>({ s: "idle" });
  const [recip, setRecip] = useState("");
  const [route, setRoute] = useState<Step>({ s: "idle" });
  const [mode, setMode] = useState<"agent" | "stakers">("agent");
  const [coin, setCoin] = useState("");                  // an existing coin, or the one just launched
  const [agentPct, setAgentPct] = useState("20");
  const [ack, setAck] = useState(false);
  const [holder, setHolder] = useState<string | null>(null);   // the coin's creator recipient right now
  const token = (launch.token ?? coin).trim();
  const [agentOwner, setAgentOwner] = useState<string | null>(null);

  useEffect(() => { preflight().then(setCheck).catch(() => setCheck({ ok: false, why: ["could not read the factory on Base"], referrerOk: false, pairs: [] })); }, []);
  useEffect(() => {
    setAgentOwner(null);
    const id = d.agentId.trim();
    if (!/^\d+$/.test(id)) return;
    pub.readContract({ address: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432", abi: [{ type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "address" }] }] as const, functionName: "ownerOf", args: [BigInt(id)] })
      .then((o) => setAgentOwner(o.toLowerCase())).catch(() => setAgentOwner("none"));
  }, [d.agentId]);

  const set = (k: keyof CoinDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });
  const problem = coinProblem(d);
  const pair = check?.pairs.find((p) => p.address === pairAddr) ?? check?.pairs[0] ?? ETH_PAIR;
  const isEth = pair.address === ETH_QUOTE;
  let buyWei = 0n;
  let buyBad = false;
  try { buyWei = parseUnits(buy || "0", pair.decimals); } catch { buyBad = true; }
  // The first buy's balance: one hook, three-outcome verdict (spend-gate-check). ETH or the paired stock.
  const bal = useSpendableBalance({ holder: address ?? "", native: isEth, token: isEth ? undefined : pair.address, chainId: base.id });
  const gate = resolveSpend({ loading: bal.loading, received: bal.received, failed: bal.failed, over: bal.raw != null && buyWei > bal.raw });
  const agentNotMine = !!agentOwner && agentOwner !== "none" && !!address && agentOwner !== address.toLowerCase();

  async function onLaunch() {
    setLaunch({ s: "busy", msg: "Confirm in your wallet…" });
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      // A stock's first buy is pulled with transferFrom, so the factory needs an allowance for exactly that amount first.
      if (!isEth && buyWei > 0n && address) {
        const allowance = await pub.readContract({ address: pair.address, abi: ERC20_MIN_ABI, functionName: "allowance", args: [address, FACTORY] });
        if (allowance < buyWei) {
          setLaunch({ s: "busy", msg: `1 of 2 · allow the launchpad to take ${buy} ${pair.symbol}. Confirm in your wallet…` });
          const ah = await sendTransactionAsync({ to: pair.address, data: encodeFunctionData({ abi: ERC20_MIN_ABI, functionName: "approve", args: [FACTORY, buyWei] }), chainId: base.id });
          const arc = await pub.waitForTransactionReceipt({ hash: ah });
          if (arc.status !== "success") throw new Error(`approve reverted (${ah})`);
          setLaunch({ s: "busy", msg: "2 of 2 · launch. Confirm in your wallet…" });
        }
      }
      const data = encodeFunctionData({ abi: ABI, functionName: "launch", args: [d.name.trim(), d.symbol.trim(), coinContractUri(d), newSalt(), pair.address, buyWei, fee, BLUE_REFERRER] });
      const hash = await sendTransactionAsync({ to: FACTORY, data, value: isEth ? buyWei : 0n, chainId: base.id });
      const rc = await pub.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error(`launch reverted (${hash})`);
      const ev = parseEventLogs({ abi: ABI, logs: rc.logs, eventName: "Launched" })[0];
      setLaunch({ s: "done", hash, token: ev?.args.token, msg: ev ? `${d.symbol.trim()} is live.` : "Launched. Read the token from the transaction." });
    } catch (e) {
      setLaunch({ s: "error", msg: (e as Error).message.split("\n")[0].slice(0, 200) });
    }
  }

  useEffect(() => {
    setHolder(null);
    if (!isAddress(token)) return;
    pub.readContract({ address: FACTORY, abi: ABI, functionName: "launches", args: [token as `0x${string}`] })
      .then((l) => setHolder(l.creator === "0x0000000000000000000000000000000000000000" ? "none" : l.creatorRecipient.toLowerCase()))
      .catch(() => setHolder("none"));
  }, [token]);
  const canRoute = !!holder && holder !== "none" && !!address && holder === address.toLowerCase();

  async function send(to: `0x${string}`, data: `0x${string}`) {
    if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
    const hash = await sendTransactionAsync({ to, data, chainId: base.id });
    const rc = await pub.waitForTransactionReceipt({ hash });
    if (rc.status !== "success") throw new Error(`reverted (${hash})`);
    return hash;
  }

  async function onRoute() {
    if (!isAddress(token)) return setRoute({ s: "error", msg: "Enter the coin's address." });
    try {
      if (mode === "agent") {
        if (!isAddress(recip)) return setRoute({ s: "error", msg: "Not an address." });
        setRoute({ s: "busy", msg: "Confirm in your wallet…" });
        const hash = await send(FACTORY, encodeFunctionData({ abi: ABI, functionName: "setCreatorRecipient", args: [token as `0x${string}`, recip] }));
        return setRoute({ s: "done", hash, msg: `The coin's 80% now goes to ${short(recip)}.` });
      }
      // Stakers: create the share contract (or reuse it), then hand the 80% to it — for good.
      const bps = Math.round(Number(agentPct) * 100);
      const withAgent = bps > 0;
      if (withAgent && !isAddress(recip)) return setRoute({ s: "error", msg: "Enter the agent's wallet, or set its share to 0." });
      if (!Number.isFinite(bps) || bps < 0 || bps > MAX_AGENT_BPS) return setRoute({ s: "error", msg: "Agent share: 0 to 90%." });
      const agent = (withAgent ? recip : "0x0000000000000000000000000000000000000000") as `0x${string}`;
      const args = [token as `0x${string}`, agent, withAgent ? bps : 0] as const;
      const share = await pub.readContract({ address: RSD, abi: RSD_ABI, functionName: "predict", args });
      const exists = (await pub.getCode({ address: share }))?.length ? true : false;
      if (!exists) {
        setRoute({ s: "busy", msg: "1 of 2 · create the share contract. Confirm in your wallet…" });
        await send(RSD, encodeFunctionData({ abi: RSD_ABI, functionName: "create", args }));
      }
      setRoute({ s: "busy", msg: "2 of 2 · hand the launcher's share to it, for good. Confirm in your wallet…" });
      const hash = await send(FACTORY, encodeFunctionData({ abi: ABI, functionName: "setCreatorRecipient", args: [token as `0x${string}`, share] }));
      setRoute({ s: "done", hash, msg: `Done. Stakers now share the launcher's fees: ${share.slice(0, 6)}…${share.slice(-4)}.`, share } as Step);
    } catch (e) { setRoute({ s: "error", msg: (e as Error).message.split("\n")[0].slice(0, 200) }); }
  }

  const Status = ({ s }: { s: Step }) => s.s === "idle" ? null : (
    <p className={`text-[13px] ${s.s === "error" ? "text-[#F87171]" : s.s === "done" ? "text-[#34D399]" : "text-[#94A3B8]"}`}>
      {s.msg}{s.hash && <> · <a className="text-[#4FC3F7]" href={`https://basescan.org/tx/${s.hash}`} target="_blank" rel="noreferrer">Basescan ↗</a></>}
    </p>
  );

  const N = ({ n, children }: { n: string; children: string }) => (
    <h2 className="mb-3 flex items-center gap-2 text-[12px] font-medium tracking-[0.14em] text-[#64748B]"><span className="text-[#4FC3F7]">{n}</span>{children}</h2>
  );
  const sym = d.symbol.trim().toUpperCase() || "TOKEN";
  const [imgBad, setImgBad] = useState(false);
  useEffect(() => setImgBad(false), [d.image]);
  const CoinMark = ({ size }: { size: number }) => d.image.trim() && /^https:\/\//.test(d.image.trim()) && !imgBad
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={d.image.trim()} alt="" onError={() => setImgBad(true)} className="shrink-0 rounded-[14px] border border-[#1A1A2E] object-cover" style={{ width: size, height: size }} />
    : <span className="inline-flex shrink-0 items-center justify-center rounded-[14px] border border-dashed border-[#2a3350] bg-[#0F121A] font-semibold text-[#64748B]" style={{ width: size, height: size, fontSize: size * 0.36 }}>{sym.slice(0, 1)}</span>;
  const balText = bal.balance != null ? `${bal.balance.toLocaleString("en-US", { maximumFractionDigits: isEth ? 5 : 4 })} ${pair.symbol}` : null;

  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden font-mono [&_button]:font-mono [&_a]:font-mono [&_input]:font-mono [&_textarea]:font-mono">
      {markets ? <MarketsHeader active="launch" chip="Quadra launchpad v3 · Base 8453" /> : <ExchangeHeader active="tokenize" chip="Quadra launchpad v3 · Base 8453" />}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-5 py-[18px] grid gap-5 w-full">
          <div>
            <h1 className="text-[18px] font-semibold text-[#E2E8F0]">{markets ? "Launch a token" : "Tokenize an agent"}</h1>
            <p className="mt-1.5 max-w-[860px] text-[14px] leading-[1.7] text-[#94A3B8]">
              Mint a fixed-supply token on Base 8453 and seed its locked Uniswap v4 pool in one transaction, paired with ETH or a Coinbase stock.
              {markets ? " For yourself or for an agent." : " 80% of the pool fee can fund your agent's wallet."} You sign every step.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start">
            <div className="grid gap-5">
              <section className={card}>
                <N n="01">TOKEN IDENTITY</N>
                <div className="grid gap-3">
                  <div className="flex items-center gap-3">
                    <CoinMark size={64} />
                    <label className="grid flex-1 gap-1"><span className={label}>Logo (https image link)</span><input className={input} value={d.image} onChange={set("image")} placeholder="https://…/logo.png" /></label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
                    <label className="grid gap-1"><span className={label}>Token name *</span><input className={input} value={d.name} onChange={set("name")} maxLength={32} placeholder="My Agent" /></label>
                    <label className="grid gap-1"><span className={label}>Symbol *</span><input className={input} value={d.symbol} onChange={set("symbol")} maxLength={11} placeholder="AGENT" /></label>
                  </div>
                  <label className="grid gap-1"><span className={label}>Description</span><textarea className={`${input} min-h-[70px]`} value={d.description} onChange={set("description")} maxLength={280} placeholder="What it is, in a sentence or two." /></label>
                  <label className="grid gap-1"><span className={label}>ERC-8004 agent id (optional, links the token to its agent)</span><input className={input} value={d.agentId} onChange={set("agentId")} placeholder="e.g. 1137821" /></label>
                  {agentOwner === "none" && <p className="text-[13px] text-[#F87171]">No agent #{d.agentId} on Base.</p>}
                  {agentNotMine && <p className="text-[13px] text-[#FBBF24]">Agent #{d.agentId} is owned by {short(agentOwner!)}, not the connected wallet. The token will point at it anyway; make sure it is yours.</p>}
                  {problem && d.name && <p className="text-[13px] text-[#F87171]">{problem}</p>}
                </div>
              </section>

              <section className={card}>
                <N n="02">MARKET</N>
                <div className="grid gap-3">
                  <div className="grid gap-1">
                    <span className={label}>Paired asset * (chosen once, forever)</span>
                    {check === null ? <p className="text-[13px] text-[#64748B]">Reading enabled pairs from the factory on Base…</p>
                      : <PairPicker pairs={check.pairs.length ? check.pairs : [ETH_PAIR]} value={pair} info={assets} onPick={(p) => { setPairAddr(p.address); setBuy("0"); }} />}
                  </div>
                  <div className="grid gap-1">
                    <span className={label}>Pool fee (chosen once, forever)</span>
                    <div className="flex gap-1.5">
                      {([[10_000, "1%"], [30_000, "3%"]] as const).map(([v, l]) => (
                        <button key={v} type="button" onClick={() => setFee(v)} className="rounded-full border px-[11px] py-1 text-[12px]"
                          style={fee === v ? { color: "#050508", background: "#4FC3F7", borderColor: "#4FC3F7", fontWeight: 600 } : { color: "#94A3B8", borderColor: "#1A1A2E" }}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <ul className="grid gap-1 text-[13px] text-[#94A3B8]">
                    <li><span className="text-[#E2E8F0]">80%</span> of the pool fee to the launcher, or to the agent&apos;s wallet once you route it (below)</li>
                    <li><span className="text-[#E2E8F0]">5%</span> to Blue Agent as the referrer {check && !check.referrerOk && <span className="text-[#FBBF24]">(not approved right now: recorded as none)</span>}</li>
                    <li><span className="text-[#E2E8F0]">15%</span> to Quadra</li>
                  </ul>
                </div>
              </section>

              <section className={card}>
                <N n="03">LAUNCH OPTIONS</N>
                <label className="grid gap-1">
                  <span className={label}>First buy, in {pair.symbol} (0 = none): yours at the opening price, before anyone else, in the same transaction</span>
                  <div className="flex gap-2">
                    <input className={input} value={buy} onChange={(e) => setBuy(e.target.value.trim())} inputMode="decimal" />
                    {balText && <button type="button" onClick={() => setBuy(String(bal.balance))} className="shrink-0 rounded-lg border border-[#1A1A2E] px-3 text-[12px] text-[#94A3B8] hover:text-[#E2E8F0]">Max</button>}
                  </div>
                </label>
                {isConnected && balText && <p className="mt-1 text-[12px] text-[#64748B]">Wallet: {balText} on Base</p>}
                {buyBad && <p className="mt-1 text-[13px] text-[#F87171]">Not a {pair.symbol} amount.</p>}
                {!isEth && buyWei > 0n && <p className="mt-1 text-[12px] text-[#64748B]">A {pair.symbol} buy takes two signatures: approve exactly this amount, then launch.</p>}
              </section>
            </div>

            <div className="grid gap-5 lg:sticky lg:top-0">
              <section className={card}>
                <N n="">LIVE PREVIEW</N>
                <div className="flex items-center gap-3">
                  <CoinMark size={52} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-semibold text-[#E2E8F0]">{d.name.trim() || "Your token"}</p>
                    <p className="flex items-center gap-1.5 text-[13px] text-[#94A3B8]">{sym}/<PairMark p={pair} info={assets} size={16} />{pair.symbol}
                      <span className="ml-1 rounded-full bg-[#4FC3F7]/15 px-1.5 text-[10px] font-semibold text-[#4FC3F7]">NEW</span></p>
                  </div>
                </div>
                <p className="mt-2 text-[13px] leading-[1.6] text-[#94A3B8]">{d.description.trim() || "Fixed-supply token trading on a locked Uniswap v4 pool on Base."}</p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                  {[
                    ["Fixed supply", "1,000,000,000"],
                    ["Pool", "Uniswap v4, locked"],
                    ["Paired asset", pair.symbol],
                    ["Pool fee", fee === 10_000 ? "1%" : "3%"],
                    ["Admin", "None, ever"],
                    ["First buy", buyWei > 0n && !buyBad ? `${buy} ${pair.symbol}` : "None"],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg border border-[#1A1A2E] bg-[#050508] px-2.5 py-2">
                      <dt className="text-[#64748B]">{k}</dt><dd className="mt-0.5 text-[13px] text-[#E2E8F0]">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 grid gap-2.5">
                  {check === null ? <p className="text-[13px] text-[#64748B]">Reading the factory on Base…</p>
                    : !check.ok ? <p className="text-[13px] text-[#F87171]">Not sending: the factory did not answer as expected ({check.why.join("; ")}).</p>
                    : !isConnected ? <ConnectButton label="Connect wallet" />
                    : <button type="button" onClick={onLaunch} disabled={!!problem || buyBad || (buyWei > 0n && gate !== "ok") || launch.s === "busy" || launch.s === "done"}
                        className="rounded-[8px] bg-[#4FC3F7] px-[13px] py-2.5 text-[14px] font-semibold text-[#050508] hover:bg-[#29ABE2] disabled:opacity-40">
                        {launch.s === "busy" ? "Launching…" : `Launch ${d.symbol.trim() || "the token"} / ${pair.symbol}${buyWei > 0n ? ` and buy with ${buy} ${pair.symbol}` : ""}`}
                      </button>}
                  {isConnected && buyWei > 0n && (bal.failed
                    ? <UnverifiedBalance symbol={pair.symbol} onRetry={() => { void bal.refetch(); }} busy={bal.refetching} />
                    : gate === "insufficient" && <p className="text-[13px] text-[#F87171]">Your wallet holds less than {buy} {pair.symbol} on Base.</p>)}
                  <Status s={launch} />
                  {launch.token && (
                    <p className="text-[13px] text-[#94A3B8]">
                      Token <a className="text-[#4FC3F7]" href={`https://basescan.org/token/${launch.token}`} target="_blank" rel="noreferrer">{short(launch.token)} ↗</a> ·{" "}
                      <Link className="text-[#4FC3F7]" href={`/markets/base/${launch.token}`}>its Markets page</Link> ·{" "}
                      <a className="text-[#4FC3F7]" href={`https://dexscreener.com/base/${launch.token}`} target="_blank" rel="noreferrer">DexScreener ↗</a>
                    </p>
                  )}
                  <p className="text-[12px] text-[#64748B]">You confirm in your wallet; nothing is minted until you sign. Factory <a className="text-[#4FC3F7]" href={`https://basescan.org/address/${FACTORY}`} target="_blank" rel="noreferrer">{short(FACTORY)}</a> on Base 8453.</p>
                </div>
              </section>
            </div>
          </div>

          <section className={`${card} grid gap-2.5 max-w-[860px]`}>
            <N n="04">WHERE THE 80% GOES</N>
            <input className={input} value={launch.token ?? coin} onChange={(e) => setCoin(e.target.value.trim())} disabled={!!launch.token} placeholder="Coin address 0x… (or launch one above)" />
            {holder === "none" && isAddress(token) && <p className="text-[13px] text-[#F87171]">Not a coin from this launchpad.</p>}
            {holder && holder !== "none" && !canRoute && <p className="text-[13px] text-[#FBBF24]">Its fees go to {short(holder)} now; only that wallet can change it.</p>}
            <div className="flex gap-1.5">
              {([["agent", "The agent's wallet"], ["stakers", "Share with stakers"]] as const).map(([v, l]) => (
                <button key={v} type="button" onClick={() => setMode(v)} className="rounded-full border px-[11px] py-1 text-[12px]"
                  style={mode === v ? { color: "#050508", background: "#4FC3F7", borderColor: "#4FC3F7", fontWeight: 600 } : { color: "#94A3B8", borderColor: "#1A1A2E" }}>{l}</button>
              ))}
            </div>
            {mode === "agent" ? (
              <>
                <p className="text-[13px] leading-[1.6] text-[#64748B]">Point the launcher&apos;s share at the agent&apos;s own wallet, so its coin funds its work. The current recipient can change it again later.</p>
                <input className={input} value={recip} onChange={(e) => setRecip(e.target.value.trim())} placeholder="Agent wallet 0x…" />
              </>
            ) : (
              <>
                <p className="text-[13px] leading-[1.6] text-[#94A3B8]">{stakerWording(d.symbol.trim() || "COIN", pair.symbol)}</p>
                <p className="text-[13px] leading-[1.6] text-[#64748B]">
                  Holders who do not stake receive nothing. The agent receives the share you set of the launcher&apos;s 80%; stakers share the rest, released over 7 days.
                  Quadra&apos;s and the referrer&apos;s shares are not affected. The contract has no owner and is not audited.
                </p>
                <div className="grid grid-cols-[1fr_110px] gap-2">
                  <input className={input} value={recip} onChange={(e) => setRecip(e.target.value.trim())} placeholder="Agent wallet 0x… (empty if 0%)" />
                  <input className={input} value={agentPct} onChange={(e) => setAgentPct(e.target.value.trim())} placeholder="Agent %" />
                </div>
                <label className="flex items-start gap-2 text-[13px] leading-[1.5] text-[#FBBF24]">
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
                  This cannot be undone. The launcher&apos;s fee share will go to this contract for good: not to me, not to the agent&apos;s wallet, not back.
                </label>
              </>
            )}
            <button type="button" onClick={onRoute} disabled={!canRoute || route.s === "busy" || route.s === "done" || (mode === "stakers" && !ack)}
              className="rounded-[8px] border border-[#1A1A2E] bg-[#0F121A] px-[13px] py-2 text-[13px] text-[#E2E8F0] disabled:opacity-40">
              {mode === "agent" ? "Route fees to this wallet" : "Create the share contract and hand fees to it"}
            </button>
            <Status s={route} />
            {route.s === "done" && mode === "stakers" && isAddress(token) && (
              <Link className="text-[13px] text-[#4FC3F7]" href={`/exchange/coin/${token}`}>Open the staking page →</Link>
            )}
          </section>

          <p className="text-[12px] leading-relaxed text-[#64748B]">
            A coin is not a share in the agent and pays no dividends. Launching one is your decision and your transaction; Blue Agent builds the calls and never holds your keys or funds.
            {" "}<Link className="text-[#4FC3F7]" href="/exchange/create">No agent yet? Create one first →</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
