"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import { useAccount, useSignTypedData, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@/components/ConnectModal";
import { parseUnits, formatUnits } from "viem";
import { fetchBlueBalance, getTierInfo, type TierInfo } from "@/lib/credits";

// ─── Signal types ─────────────────────────────────────────────────────────────
type SignalType = "build" | "shift" | "risk" | "grant" | "collab";
interface Signal {
  type: SignalType; title: string; body: string;
  action: string; confidence: number; timestamp: string;
}
const SIGNAL_EMOJI: Record<SignalType, string> = {
  build: "🔨", shift: "📡", risk: "🛡️", grant: "💰", collab: "🤝",
};
const SIGNAL_LABEL: Record<SignalType, string> = {
  build: "Build Opportunity", shift: "Ecosystem Shift",
  risk: "Risk Alert", grant: "Grant Signal", collab: "Collab Signal",
};
const SIGNAL_COLOR: Record<SignalType, string> = {
  build: "#4FC3F7", shift: "#A78BFA", risk: "#EF4444", grant: "#F59E0B", collab: "#34D399",
};

// ─── Constants ────────────────────────────────────────────────────────────────

const USDC_BASE        = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const BLUE_TOKEN       = "0xf895783b2931c919955e18b5e3343e7c7c456ba3" as const;
const PAY_TO           = "0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f" as const;

// TODO: replace after deploying BlueMarketStaking.sol to Base
const STAKING_CONTRACT = "0x0000000000000000000000000000000000000000" as const;

const DAILY_THRESHOLD  = parseUnits("25000000",  18); // 25M BLUE
const WEEKLY_THRESHOLD = parseUnits("60000000",  18); // 60M BLUE
const USDC_DAILY       = 10_000_000n; // $10/mo
const USDC_WEEKLY      = 15_000_000n; // $15/mo

const STAKING_ABI = [
  { name: "stake",             type: "function", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { name: "requestUnstake",    type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "cancelUnstake",     type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "claim",             type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "claimYield",        type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "activeStake",       type: "function", stateMutability: "view",       inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "cooldownRemaining", type: "function", stateMutability: "view",       inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "pendingYield",      type: "function", stateMutability: "view",       inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "totalYieldDistributed", type: "function", stateMutability: "view",   inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const ERC20_ABI = [
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "allowance", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

function randomNonce(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")}`;
}
function fmtUSDC(raw: bigint) { return `$${Number(raw) / 1_000_000}`; }
function fmtBLUE(raw: bigint) { return `${(Number(formatUnits(raw, 18)) / 1_000_000).toFixed(0)}M`; }

// ─── Archive ──────────────────────────────────────────────────────────────────

const ARCHIVE = [
  { date: "Thu, May 21", signal: "Ship something on Base today — builder activity and smart wallet adoption are at peak momentum.",
    ecosystem: "· Uniswap v4 hooks activity up 40% on Base\n· BaseNames registrations hit 2M milestone\n· New Base Grants wave opens: $50k–$500k",
    coinbase:  "· Coinbase Wallet adds smart wallet passkey auth\n· Base testnet: EIP-7702 support next week\n· Coinbase Ventures led $12M round in Base yield",
    market:    "· AI agent narrative dominating CT — up 28% WTD\n· DeFi rotation: LRT cooling, real-yield gaining\n· Builder sentiment bullish — hackathon +60% YoY",
    onchain:   "· 847 new contracts deployed on Base in 24h\n· Smart wallet DAU crossed 180k\n· $USDC bridge inflows: $42M net positive" },
  { date: "Wed, May 20", signal: "Uniswap v4 hooks on Base are the next builder unlock — position your protocol now.",
    ecosystem: "· 3 new DeFi protocols launched on Base\n· Base builder grants round closes Friday\n· Smart wallet SDK v2 released",
    coinbase:  "· Coinbase L2 fee reduction announcement\n· Base ecosystem fund expanded to $200M\n· New Coinbase developer docs launched",
    market:    "· Hook-based AMMs gaining CT traction\n· Modular DeFi narrative building\n· Base TVL crossed $3B milestone",
    onchain:   "· 620 new contract deployments\n· Uniswap v4 pool TVL up 18%\n· Smart wallet transactions +34% WoW" },
  { date: "Tue, May 19", signal: "BaseNames hitting milestones signals mainstream onboarding is real — build consumer.",
    ecosystem: "· BaseNames: 2M registrations milestone\n· Consumer app grants available\n· New Base onboarding SDK released",
    coinbase:  "· Coinbase One adds Base perks\n· Farcaster × Base integration deepens\n· New partnership: Base × major neobank",
    market:    "· Consumer crypto narrative gaining CT\n· Social/identity sector rotating up\n· Base memecoin activity slowing — utility wins",
    onchain:   "· BaseNames registrations: 12k in 24h\n· Farcaster frames transactions +200%\n· New ERC-6551 deployments surging" },
];

// ─── Staking panel ────────────────────────────────────────────────────────────

function StakingPanel({ address }: { address: `0x${string}` }) {
  const [stakeInput, setStakeInput] = useState("");

  const { data: activeStake } = useReadContract({
    address: STAKING_CONTRACT, abi: STAKING_ABI,
    functionName: "activeStake", args: [address],
  });
  const { data: cooldown } = useReadContract({
    address: STAKING_CONTRACT, abi: STAKING_ABI,
    functionName: "cooldownRemaining", args: [address],
  });
  const { data: yieldPending } = useReadContract({
    address: STAKING_CONTRACT, abi: STAKING_ABI,
    functionName: "pendingYield", args: [address],
  });
  const { data: totalYield } = useReadContract({
    address: STAKING_CONTRACT, abi: STAKING_ABI,
    functionName: "totalYieldDistributed",
  });
  const { data: allowance } = useReadContract({
    address: BLUE_TOKEN, abi: ERC20_ABI,
    functionName: "allowance", args: [address, STAKING_CONTRACT],
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  const staked       = activeStake ?? 0n;
  const hasDaily     = staked >= DAILY_THRESHOLD;
  const hasWeekly    = staked >= WEEKLY_THRESHOLD;
  const stakeAmtRaw  = stakeInput ? parseUnits(stakeInput, 18) : 0n;
  const needsApprove = (allowance ?? 0n) < stakeAmtRaw;
  const inTx         = isPending || isConfirming;

  function handleApprove() {
    writeContract({ address: BLUE_TOKEN, abi: ERC20_ABI, functionName: "approve",
      args: [STAKING_CONTRACT, stakeAmtRaw] });
  }
  function handleStake() {
    writeContract({ address: STAKING_CONTRACT, abi: STAKING_ABI, functionName: "stake",
      args: [stakeAmtRaw] });
  }
  function handleRequestUnstake() {
    writeContract({ address: STAKING_CONTRACT, abi: STAKING_ABI, functionName: "requestUnstake", args: [] });
  }
  function handleCancelUnstake() {
    writeContract({ address: STAKING_CONTRACT, abi: STAKING_ABI, functionName: "cancelUnstake", args: [] });
  }
  function handleClaim() {
    writeContract({ address: STAKING_CONTRACT, abi: STAKING_ABI, functionName: "claim", args: [] });
  }
  function handleClaimYield() {
    writeContract({ address: STAKING_CONTRACT, abi: STAKING_ABI, functionName: "claimYield", args: [] });
  }

  const cooldownDays  = cooldown ? Math.ceil(Number(cooldown) / 86400) : 0;
  const yieldUSDC     = yieldPending ? Number(yieldPending) / 1_000_000 : 0;
  const totalYieldFmt = totalYield ? `$${(Number(totalYield) / 1_000_000).toFixed(2)}` : "$0";

  return (
    <div className="bg-[#0a0a14] border border-[#1A1A2E] rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] text-slate-500 tracking-widest uppercase">Your Stake</p>
        <p className="font-mono text-xs text-white font-bold">{fmtBLUE(staked)} BLUE</p>
      </div>

      {/* Access status */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Daily Brief",    threshold: DAILY_THRESHOLD,  has: hasDaily,  color: "#4FC3F7" },
          { label: "Weekly Report",  threshold: WEEKLY_THRESHOLD, has: hasWeekly, color: "#A78BFA" },
        ].map(p => (
          <div key={p.label} className="px-3 py-2 rounded-lg border"
            style={{ background: p.has ? p.color + "10" : "#1A1A2E", borderColor: p.has ? p.color + "30" : "#1A1A2E30" }}>
            <p className="font-mono text-[9px] tracking-widest mb-1" style={{ color: p.has ? p.color : "#475569" }}>
              {p.has ? "✓ ACTIVE" : `NEED ${fmtBLUE(p.threshold)}`}
            </p>
            <p className="font-mono text-[10px]" style={{ color: p.has ? "#fff" : "#475569" }}>{p.label}</p>
          </div>
        ))}
      </div>

      {/* Stake input */}
      {cooldownDays === 0 && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input type="number" value={stakeInput} onChange={e => setStakeInput(e.target.value)}
              placeholder="Amount to stake (BLUE)"
              className="flex-1 bg-[#0D0D1A] border border-[#1A1A2E] rounded-lg px-3 py-2
                         font-mono text-xs text-white placeholder-slate-700
                         focus:outline-none focus:border-[#4FC3F7]/30 transition-colors" />
            <button disabled={!stakeInput || inTx}
              onClick={needsApprove ? handleApprove : handleStake}
              className="border border-[#4FC3F7]/30 bg-[#4FC3F7]/10 text-[#4FC3F7]
                         rounded-lg px-3 py-2 font-mono text-xs hover:opacity-80 disabled:opacity-40 transition-opacity whitespace-nowrap">
              {inTx ? "Confirming…" : needsApprove ? "Approve" : "Stake"}
            </button>
          </div>
          <div className="flex gap-2 text-[10px] font-mono text-slate-700">
            <button onClick={() => setStakeInput("25000000")} className="hover:text-slate-400 transition-colors">25M (Daily)</button>
            <span>·</span>
            <button onClick={() => setStakeInput("60000000")} className="hover:text-slate-400 transition-colors">60M (Weekly)</button>
          </div>
        </div>
      )}

      {/* Unstake controls */}
      {/* Yield panel */}
      <div className="border border-[#4FC3F7]/15 bg-[#4FC3F7]/5 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] text-[#4FC3F7] tracking-widest">⚡ USDC YIELD</p>
          <p className="font-mono text-[10px] text-slate-600">Total paid out: {totalYieldFmt}</p>
        </div>
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs text-white font-bold">
            ${yieldUSDC.toFixed(4)} USDC
          </p>
          <button onClick={handleClaimYield} disabled={inTx || yieldUSDC === 0}
            className="border border-[#4FC3F7]/30 bg-[#4FC3F7]/10 text-[#4FC3F7]
                       rounded-lg px-3 py-1 font-mono text-[10px]
                       hover:opacity-80 disabled:opacity-30 transition-opacity">
            {inTx ? "Confirming…" : "Claim"}
          </button>
        </div>
        <p className="font-mono text-[10px] text-slate-700">
          20% of every subscription payment · pro-rata by stake
        </p>
      </div>

      {/* Unstake controls */}
      {staked > 0n && (
        <div className="border-t border-[#1A1A2E] pt-3 space-y-2">
          {cooldownDays > 0 ? (
            <div className="space-y-2">
              <p className="font-mono text-[10px] text-slate-500">
                Cooldown: {cooldownDays} day{cooldownDays !== 1 ? "s" : ""} remaining · access revoked
              </p>
              <div className="flex gap-2">
                <button onClick={handleCancelUnstake} disabled={inTx}
                  className="flex-1 border border-[#4FC3F7]/20 text-[#4FC3F7] bg-[#4FC3F7]/5
                             rounded-lg py-2 font-mono text-xs hover:opacity-80 disabled:opacity-40 transition-opacity">
                  {inTx ? "Confirming…" : "Cancel & restore access"}
                </button>
                {cooldownDays === 0 && (
                  <button onClick={handleClaim} disabled={inTx}
                    className="flex-1 border border-[#A78BFA]/20 text-[#A78BFA] bg-[#A78BFA]/5
                               rounded-lg py-2 font-mono text-xs hover:opacity-80 disabled:opacity-40 transition-opacity">
                    Claim tokens
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button onClick={handleRequestUnstake} disabled={inTx}
              className="w-full border border-[#1A1A2E] text-slate-600 rounded-lg py-2
                         font-mono text-xs hover:text-slate-400 hover:border-slate-600 disabled:opacity-40 transition-all">
              {inTx ? "Confirming…" : "Request unstake (7-day cooldown)"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── x402 subscribe form ──────────────────────────────────────────────────────

type SubStep = "idle" | "signing" | "paying" | "done" | "error";

function USDCSubscribeForm({ planTier, price, accent }: {
  planTier: "daily" | "weekly"; price: bigint; accent: string;
}) {
  const [email, setEmail]     = useState("");
  const [step, setStep]       = useState<SubStep>("idle");
  const [message, setMessage] = useState("");

  const { address, isConnected } = useAccount();
  const { signTypedData }         = useSignTypedData();

  async function handlePay() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage("Enter a valid email."); setStep("error"); return;
    }
    if (!isConnected) { setMessage("Connect your wallet first."); setStep("error"); return; }
    setStep("signing"); setMessage("");
    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const nonce    = randomNonce();
      const sig = await new Promise<`0x${string}`>((resolve, reject) => {
        signTypedData({
          domain: { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: USDC_BASE },
          types: { TransferWithAuthorization: [
            { name: "from", type: "address" }, { name: "to", type: "address" },
            { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
          ]},
          primaryType: "TransferWithAuthorization",
          message: { from: address!, to: PAY_TO as `0x${string}`,
            value: price, validAfter: 0n, validBefore: deadline, nonce },
        }, { onSuccess: resolve, onError: reject });
      });
      setStep("paying");
      const res = await fetch("/api/market/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json",
          "X-PAYMENT": JSON.stringify({ scheme: "exact", network: "base", token: USDC_BASE,
            amount: price.toString(), from: address, nonce, deadline: deadline.toString(), signature: sig }) },
        body: JSON.stringify({ email, tier: planTier }),
      });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setStep("done"); setMessage(data.message ?? "Subscribed!"); setEmail("");
    } catch (err) { setStep("error"); setMessage((err as Error).message); }
  }

  if (step === "done") return (
    <div className="border rounded-lg p-3 text-center" style={{ borderColor: accent + "40" }}>
      <p className="font-mono text-xs" style={{ color: accent }}>✓ {message}</p>
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handlePay()}
          placeholder="you@example.com"
          className="flex-1 bg-[#0D0D1A] border border-[#1A1A2E] rounded-lg px-3 py-2
                     font-mono text-xs text-white placeholder-slate-700
                     focus:outline-none focus:border-[#4FC3F7]/30 transition-colors" />
        <button onClick={handlePay} disabled={step === "signing" || step === "paying"}
          className="border rounded-lg px-3 py-2 font-mono text-xs font-medium
                     hover:opacity-80 transition-opacity disabled:opacity-40 whitespace-nowrap"
          style={{ background: accent + "15", borderColor: accent + "40", color: accent }}>
          {step === "signing" ? "Signing…" : step === "paying" ? "Paying…" :
           isConnected ? `Pay ${fmtUSDC(price)}/mo` : "Connect wallet"}
        </button>
      </div>
      {step === "error" && message && <p className="font-mono text-[10px] text-red-400">{message}</p>}
    </div>
  );
}

// ─── Plan card ────────────────────────────────────────────────────────────────

function PlanCard({ planTier, accent, usdcPrice, stakeThreshold, features, description, address, hasAccess }: {
  planTier: "daily" | "weekly"; accent: string; usdcPrice: bigint;
  stakeThreshold: bigint; features: string[]; description: string;
  address?: `0x${string}`; hasAccess: boolean;
}) {
  const [tab, setTab]         = useState<"usdc" | "stake">("usdc");

  return (
    <div className="bg-[#0a0a14] rounded-xl p-5 flex flex-col gap-4 relative overflow-hidden"
      style={{ border: `1px solid ${hasAccess ? accent + "50" : accent + "25"}` }}>
      <div className="absolute top-0 right-0 w-28 h-28 rounded-full blur-2xl pointer-events-none"
        style={{ background: accent + "08" }} />

      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="font-mono text-[10px] tracking-widest uppercase" style={{ color: accent }}>
            {planTier === "daily" ? "Daily Brief" : "Weekly Deep Report"}
          </p>
          {hasAccess ? (
            <span className="font-mono text-[10px] px-2 py-0.5 rounded-full border"
              style={{ background: accent + "20", borderColor: accent + "40", color: accent }}>
              ✓ Active
            </span>
          ) : (
            <span className="font-mono text-[10px] px-2 py-0.5 rounded-full border"
              style={{ background: accent + "10", borderColor: accent + "20", color: accent }}>
              {fmtUSDC(usdcPrice)}/mo
            </span>
          )}
        </div>
        <p className="font-mono text-sm text-white font-bold">
          {planTier === "daily" ? "Every morning at 8am UTC" : "Every Monday"}
        </p>
        <p className="font-mono text-[11px] text-slate-500 mt-1">{description}</p>
      </div>

      {/* Features */}
      <div className="space-y-1.5 flex-1">
        {features.map(s => (
          <div key={s} className="flex items-center gap-2">
            <span className="font-mono text-[10px]" style={{ color: accent + "60" }}>·</span>
            <p className="font-mono text-[11px] text-slate-400">{s}</p>
          </div>
        ))}
      </div>

      {hasAccess ? (
        <div className="border rounded-lg p-3 text-center" style={{ borderColor: accent + "30" }}>
          <p className="font-mono text-xs text-slate-400">
            Access active via stake ·{" "}
            <span style={{ color: accent }}>{fmtBLUE(stakeThreshold)} BLUE</span>
          </p>
        </div>
      ) : (
        <>
          {/* Tab switcher */}
          <div className="flex bg-[#0D0D1A] rounded-lg p-1 gap-1">
            {(["usdc", "stake"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-1.5 rounded-md font-mono text-[10px] transition-colors ${
                  tab === t ? "bg-[#1A1A2E] text-white" : "text-slate-600 hover:text-slate-400"
                }`}>
                {t === "usdc" ? "Pay USDC" : "Stake BLUE"}
              </button>
            ))}
          </div>

          {tab === "usdc" ? (
            <USDCSubscribeForm planTier={planTier} price={usdcPrice} accent={accent} />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-3 py-2 bg-[#0D0D1A] rounded-lg">
                <p className="font-mono text-[10px] text-slate-500">Required stake</p>
                <p className="font-mono text-[10px] text-white">{fmtBLUE(stakeThreshold)} BLUE</p>
              </div>
              <p className="font-mono text-[10px] text-slate-600 leading-relaxed">
                Stake once, access forever while staked. Unstake anytime with 7-day cooldown.
              </p>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[#FACC15]/20 bg-[#FACC15]/5">
                <span className="font-mono text-[10px] text-[#FACC15]">⚡</span>
                <p className="font-mono text-[10px] text-[#FACC15]">
                  Staking contract deploying soon · subscribe via USDC for now
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MarketPage() {
  const [activeArchive, setActiveArchive] = useState(0);
  const [tierInfo, setTierInfo]           = useState<TierInfo | null>(null);
  const [signals, setSignals]             = useState<Signal[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(true);

  const { address, isConnected } = useAccount();

  useEffect(() => {
    if (!address) { setTierInfo(null); return; }
    fetchBlueBalance(address).then(bal => setTierInfo(getTierInfo(bal)));
  }, [address]);

  // Load Research Loop signals from KV
  useEffect(() => {
    fetch("/api/signals")
      .then(r => r.json())
      .then((data: { signals: Signal[] }) => {
        setSignals(data.signals ?? []);
        setSignalsLoading(false);
      })
      .catch(() => setSignalsLoading(false));
  }, []);

  const { data: activeStake } = useReadContract({
    address: STAKING_CONTRACT, abi: STAKING_ABI,
    functionName: "activeStake", args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const staked     = activeStake ?? 0n;
  const hasDaily   = staked >= DAILY_THRESHOLD;
  const hasWeekly  = staked >= WEEKLY_THRESHOLD;

  return (
    <>
      <Navbar />
      <div className="flex bg-[#050508] font-mono pt-14">

        {/* ── Sidebar ── */}
        <aside className="hidden lg:flex flex-col w-72 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] border-r border-[#1A1A2E]">
          <div className="px-5 pt-6 pb-4 border-b border-[#1A1A2E]">
            <p className="font-mono text-xs text-[#4FC3F7] tracking-widest">// BLUE MARKET</p>
            <p className="font-mono text-[10px] text-slate-700 mt-1">Daily intelligence for Base builders</p>
          </div>

          {/* Plans */}
          <div className="px-4 pt-4 pb-3 border-b border-[#1A1A2E]">
            <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase mb-3">Plans</p>
            <div className="space-y-1.5">
              {[
                { label: "Daily Brief",    sub: "8am UTC · every day",    price: "$10/mo", accent: "#4FC3F7", has: hasDaily  },
                { label: "Weekly Report",  sub: "Every Monday",           price: "$15/mo", accent: "#A78BFA", has: hasWeekly },
              ].map(p => (
                <div key={p.label} className="flex items-center justify-between px-3 py-2 rounded-lg border"
                  style={{ background: p.has ? p.accent + "10" : p.accent + "05", borderColor: p.has ? p.accent + "30" : p.accent + "15" }}>
                  <div>
                    <p className="font-mono text-xs text-white">{p.label}</p>
                    <p className="font-mono text-[10px] text-slate-600">{p.sub}</p>
                  </div>
                  <span className="font-mono text-[10px]" style={{ color: p.accent }}>
                    {p.has ? "✓" : p.price}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Stake info */}
          <div className="px-4 pt-4 pb-3 border-b border-[#1A1A2E]">
            <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase mb-3">Stake to Access</p>
            <div className="space-y-1">
              {[
                { label: "Daily Brief",    amount: "25M BLUE", color: "#4FC3F7" },
                { label: "Weekly Report",  amount: "60M BLUE", color: "#A78BFA" },
              ].map(t => (
                <div key={t.label} className="flex items-center justify-between px-2 py-1.5">
                  <span className="font-mono text-[10px] text-slate-600">{t.label}</span>
                  <span className="font-mono text-[10px]" style={{ color: t.color }}>{t.amount}</span>
                </div>
              ))}
            </div>
            <p className="font-mono text-[10px] text-slate-700 mt-2">7-day unstake cooldown</p>
          </div>

          {/* Archive nav */}
          <div className="flex-1 overflow-y-auto">
            <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase px-5 pt-4 pb-2">Recent Briefs</p>
            {ARCHIVE.map((brief, i) => (
              <button key={i} onClick={() => setActiveArchive(i)}
                className={`w-full text-left px-5 py-2.5 transition-all border-l-2 ${
                  activeArchive === i
                    ? "border-[#4FC3F7] bg-[#4FC3F7]/5 text-white"
                    : "border-transparent text-slate-500 hover:text-white hover:bg-[#0D0D1A]"
                }`}>
                <p className="font-mono text-xs">{brief.date}</p>
                <p className="font-mono text-[10px] text-slate-700 mt-0.5 truncate">{brief.signal.slice(0, 42)}…</p>
              </button>
            ))}
          </div>

          <div className="px-5 py-4 border-t border-[#1A1A2E]">
            <p className="font-mono text-[10px] text-slate-700">x402 · Stake-to-Access · Base</p>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="flex-1 h-[calc(100vh-3.5rem)] overflow-y-auto">

          {/* Compact header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#1A1A2E] shrink-0">
            <div className="flex items-center gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
              <h1 className="font-mono text-sm font-bold text-white tracking-tight">
                BLUE<span className="text-[#4FC3F7]">MARKET</span>
              </h1>
              <span className="font-mono text-[10px] text-slate-600">Daily intelligence · Stake-to-Access · Base</span>
            </div>
            <div className="flex items-center gap-3">
              {isConnected && staked > 0n && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#4FC3F7]/30 bg-[#4FC3F7]/5">
                  <span className="w-1 h-1 rounded-full bg-[#4FC3F7]" />
                  <span className="font-mono text-[10px] text-[#4FC3F7]">{fmtBLUE(staked)} BLUE staked</span>
                </div>
              )}
              {!isConnected && <ConnectButton label="Connect wallet" />}
            </div>
          </div>

          <div className="px-6 lg:px-10 py-6 w-full space-y-6">

            {/* Plan cards */}
            <div className="grid md:grid-cols-2 gap-5">
              <PlanCard planTier="daily" accent="#4FC3F7" usdcPrice={USDC_DAILY}
                stakeThreshold={DAILY_THRESHOLD} hasAccess={hasDaily} address={address}
                description="Inbox + Telegram · 5 sections · every day"
                features={["🏗 Base Ecosystem", "🔷 Coinbase & Base", "📊 Market Signals", "⛓ Onchain Intelligence", "⚡ Daily Signal"]} />
              <PlanCard planTier="weekly" accent="#A78BFA" usdcPrice={USDC_WEEKLY}
                stakeThreshold={WEEKLY_THRESHOLD} hasAccess={hasWeekly} address={address}
                description="Email · deep report · every Monday"
                features={["🎯 Token Picks — high-conviction setups", "🐋 Onchain Flows — whale & smart money", "🔭 Builder Radar — who's shipping next", "📐 Market Edge — contrarian takes", "⚡ Weekly Signal — 1 move to make"]} />
            </div>

            {/* Staking panel — hidden until contract deployed */}
            {isConnected && address && STAKING_CONTRACT !== "0x0000000000000000000000000000000000000000" && (
              <div>
                <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase mb-3">Manage Stake</p>
                <StakingPanel address={address} />
              </div>
            )}

            {/* Research Signals — live from KV */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase">🔬 Research Signals</p>
                {!signalsLoading && signals.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
                    <span className="font-mono text-[10px] text-[#4FC3F7]">live</span>
                  </span>
                )}
              </div>

              {signalsLoading ? (
                <div className="border border-[#1A1A2E] rounded-xl p-6 flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
                  <span className="font-mono text-xs text-slate-600">Loading signals…</span>
                </div>
              ) : signals.length === 0 ? (
                <div className="border border-[#1A1A2E] rounded-xl p-6 text-center">
                  <p className="font-mono text-xs text-slate-600">Research loop runs at 6:00 AM UTC daily.</p>
                  <p className="font-mono text-[10px] text-slate-700 mt-1">Next signals incoming soon.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {[...signals]
                    .sort((a, b) => b.confidence - a.confidence)
                    .slice(0, 3)
                    .map((signal, i) => {
                      const color = SIGNAL_COLOR[signal.type] ?? "#4FC3F7";
                      return (
                        <div key={i} className="border rounded-xl p-4 space-y-2"
                          style={{ borderColor: color + "25", background: color + "08" }}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{SIGNAL_EMOJI[signal.type]}</span>
                              <span className="font-mono text-[10px] tracking-widest" style={{ color }}>
                                {SIGNAL_LABEL[signal.type].toUpperCase()}
                              </span>
                            </div>
                            <span className="font-mono text-[10px] px-2 py-0.5 rounded-full"
                              style={{ background: color + "20", color }}>
                              {signal.confidence}%
                            </span>
                          </div>
                          <p className="font-mono text-sm text-white font-semibold leading-snug">{signal.title}</p>
                          <p className="font-mono text-[11px] text-slate-400 leading-relaxed">{signal.body}</p>
                          <div className="flex items-start gap-2 pt-1 border-t border-white/5">
                            <span className="font-mono text-[10px] text-slate-600 mt-0.5">→</span>
                            <p className="font-mono text-[10px] text-slate-400 italic leading-relaxed">{signal.action}</p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Brief preview */}
            <div className="border border-[#1A1A2E] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#1A1A2E] bg-[#0a0a14]">
                <p className="font-mono text-[10px] text-slate-500 tracking-widest uppercase">
                  Brief Preview — {ARCHIVE[activeArchive].date}
                </p>
                <div className="flex gap-1">
                  {ARCHIVE.map((_, i) => (
                    <button key={i} onClick={() => setActiveArchive(i)}
                      className={`w-6 h-6 rounded font-mono text-[10px] transition-colors ${
                        activeArchive === i ? "bg-[#4FC3F7]/15 text-[#4FC3F7]" : "text-slate-700 hover:text-slate-400"
                      }`}>{i + 1}</button>
                  ))}
                </div>
              </div>
              <div className="p-5 bg-[#080811] space-y-4">
                <div className="bg-[#4FC3F7]/8 border border-[#4FC3F7]/15 rounded-lg p-4">
                  <p className="font-mono text-[10px] text-[#4FC3F7] tracking-widest mb-2">⚡ SIGNAL</p>
                  <p className="font-mono text-sm text-white italic leading-relaxed">{ARCHIVE[activeArchive].signal}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "🏗 BASE ECOSYSTEM", content: ARCHIVE[activeArchive].ecosystem },
                    { label: "🔷 COINBASE & BASE",  content: ARCHIVE[activeArchive].coinbase  },
                    { label: "📊 MARKET SIGNALS",   content: ARCHIVE[activeArchive].market    },
                    { label: "⛓ ONCHAIN",           content: ARCHIVE[activeArchive].onchain   },
                  ].map(({ label, content }) => (
                    <div key={label} className="bg-[#0a0a14] border border-[#1A1A2E] rounded-lg p-3">
                      <p className="font-mono text-[9px] text-[#4FC3F7] tracking-widest mb-2">{label}</p>
                      <p className="font-mono text-[10px] text-slate-400 leading-relaxed whitespace-pre-line">{content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </main>
      </div>
    </>
  );
}
