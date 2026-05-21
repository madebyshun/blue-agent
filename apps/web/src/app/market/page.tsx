"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import { useAccount, useConnect, useSignTypedData } from "wagmi";
import { injected } from "wagmi/connectors";

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const WEEKLY_PRICE = 5_000_000n; // $5.00 USDC

function randomNonce(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")}`;
}

// ─── Mock archive data ────────────────────────────────────────────────────────

const ARCHIVE = [
  {
    date: "Thu, May 21 2026",
    signal: "Ship something on Base today — builder activity and smart wallet adoption are at peak momentum.",
    tags: ["Base", "Smart Wallets", "DeFi"],
  },
  {
    date: "Wed, May 20 2026",
    signal: "Uniswap v4 hooks on Base are the next builder unlock — position your protocol now.",
    tags: ["Uniswap v4", "Base", "Hooks"],
  },
  {
    date: "Tue, May 19 2026",
    signal: "BaseNames hitting milestones signals mainstream onboarding is real — build consumer.",
    tags: ["BaseNames", "Consumer", "Onboarding"],
  },
];

// ─── Subscribe form ───────────────────────────────────────────────────────────

type SubscribeStep = "idle" | "signing" | "paying" | "done" | "error";

function SubscribeForm({ tier }: { tier: "daily" | "weekly" }) {
  const [email, setEmail]   = useState("");
  const [step, setStep]     = useState<SubscribeStep>("idle");
  const [message, setMessage] = useState("");

  const { address, isConnected } = useAccount();
  const { connect }               = useConnect();
  const { signTypedData }         = useSignTypedData();

  const isWeekly = tier === "weekly";
  const accent   = isWeekly ? "#A78BFA" : "#4FC3F7";

  async function handleSubscribe() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage("Enter a valid email.");
      setStep("error");
      return;
    }

    if (isWeekly && !isConnected) {
      connect({ connector: injected() });
      return;
    }

    setStep(isWeekly ? "signing" : "paying");
    setMessage("");

    try {
      let paymentHeader: string | undefined;

      // Weekly: sign EIP-3009 TransferWithAuthorization
      if (isWeekly) {
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
        const nonce    = randomNonce();

        const sig = await new Promise<`0x${string}`>((resolve, reject) => {
          signTypedData(
            {
              domain: {
                name:              "USD Coin",
                version:           "2",
                chainId:           8453,
                verifyingContract: USDC_BASE,
              },
              types: {
                TransferWithAuthorization: [
                  { name: "from",        type: "address" },
                  { name: "to",          type: "address" },
                  { name: "value",       type: "uint256" },
                  { name: "validAfter",  type: "uint256" },
                  { name: "validBefore", type: "uint256" },
                  { name: "nonce",       type: "bytes32" },
                ],
              },
              primaryType: "TransferWithAuthorization",
              message: {
                from:        address!,
                to:          "0x0000000000000000000000000000000000000000" as `0x${string}`,
                value:       WEEKLY_PRICE,
                validAfter:  0n,
                validBefore: deadline,
                nonce,
              },
            },
            { onSuccess: resolve, onError: reject }
          );
        });

        setStep("paying");
        paymentHeader = JSON.stringify({
          scheme: "exact", network: "base", token: USDC_BASE,
          amount: WEEKLY_PRICE.toString(), from: address, nonce,
          deadline: deadline.toString(), signature: sig,
        });
      }

      const res = await fetch("/api/market/subscribe", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          ...(paymentHeader ? { "X-PAYMENT": paymentHeader } : {}),
        },
        body: JSON.stringify({ email, tier }),
      });

      const data = await res.json() as { ok?: boolean; message?: string; error?: string };

      if (!res.ok) throw new Error(data.error ?? "Subscribe failed");

      setStep("done");
      setMessage(data.message ?? "Subscribed!");
      setEmail("");
    } catch (err) {
      setStep("error");
      setMessage((err as Error).message);
    }
  }

  if (step === "done") {
    return (
      <div style={{ borderColor: accent + "40" }}
        className="border rounded-lg p-4 text-center">
        <p className="font-mono text-sm" style={{ color: accent }}>✓ {message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSubscribe()}
          placeholder="you@example.com"
          className="flex-1 bg-[#0d0d1a] border border-[#1A1A2E] rounded-lg px-3 py-2.5
                     font-mono text-sm text-white placeholder-slate-600
                     focus:outline-none focus:border-[#4FC3F750] transition-colors"
        />
        <button
          onClick={handleSubscribe}
          disabled={step === "signing" || step === "paying"}
          style={{ background: accent + "15", borderColor: accent + "40", color: accent }}
          className="border rounded-lg px-4 py-2.5 font-mono text-sm font-medium
                     hover:opacity-80 transition-opacity disabled:opacity-40 whitespace-nowrap"
        >
          {step === "signing" ? "Signing…" :
           step === "paying"  ? "Paying…"  :
           isWeekly ? (isConnected ? "Pay $5 USDC" : "Connect wallet") :
           "Subscribe free"}
        </button>
      </div>

      {step === "error" && message && (
        <p className="font-mono text-xs text-red-400">{message}</p>
      )}

      {isWeekly && isConnected && (
        <p className="font-mono text-xs text-slate-600">
          {address?.slice(0, 6)}…{address?.slice(-4)} · $5 USDC on Base
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MarketPage() {
  const [activeArchive, setActiveArchive] = useState(0);

  return (
    <div className="min-h-screen bg-[#050508] text-slate-200">
      <Navbar />

      <main className="max-w-5xl mx-auto px-6 pt-24 pb-20">

        {/* ── Hero ── */}
        <div className="mb-16 text-center">
          <p className="font-mono text-xs text-slate-600 tracking-widest mb-4 uppercase">
            Blue Agent × Aeon × MiroShark
          </p>
          <h1 className="font-mono text-4xl md:text-5xl font-bold text-white mb-4">
            🔵 BLUE<span style={{ color: "#4FC3F7" }}>MARKET</span>
          </h1>
          <p className="font-mono text-slate-400 text-base md:text-lg max-w-xl mx-auto leading-relaxed">
            Daily intelligence for Base builders and founders.
            <br />
            Ecosystem moves. Onchain signals. Market edge.
          </p>
        </div>

        {/* ── Plans ── */}
        <div className="grid md:grid-cols-2 gap-6 mb-16">

          {/* Daily Brief — free */}
          <div className="bg-[#0a0a14] border border-[#1A1A2E] rounded-xl p-6 flex flex-col">
            <div className="mb-5">
              <div className="flex items-center justify-between mb-3">
                <p className="font-mono text-xs text-[#4FC3F7] tracking-widest uppercase">Daily Brief</p>
                <span className="font-mono text-xs bg-[#4FC3F715] text-[#4FC3F7] border border-[#4FC3F730]
                                 px-2 py-0.5 rounded-full">Free</span>
              </div>
              <p className="font-mono text-white text-lg font-bold mb-1">Every morning at 8am UTC</p>
              <p className="font-mono text-slate-500 text-sm">5 sections, delivered to your inbox + Telegram</p>
            </div>

            <div className="space-y-2 mb-6 flex-1">
              {[
                "🏗 Base Ecosystem — launches, builders, funding",
                "🔷 Coinbase & Base — product news, announcements",
                "📊 Market Signals — narratives, sentiment shifts",
                "⛓ Onchain Intelligence — deployments, TVL, flows",
                "⚡ Signal — 1 action for Base founders today",
              ].map(item => (
                <div key={item} className="flex items-start gap-2">
                  <span className="font-mono text-xs text-slate-600 mt-0.5">·</span>
                  <p className="font-mono text-xs text-slate-400">{item}</p>
                </div>
              ))}
            </div>

            <SubscribeForm tier="daily" />
          </div>

          {/* Weekly Deep Report — paid */}
          <div className="bg-[#0a0a14] border border-[#A78BFA30] rounded-xl p-6 flex flex-col
                          relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full
                            bg-[#A78BFA08] blur-2xl pointer-events-none" />

            <div className="mb-5">
              <div className="flex items-center justify-between mb-3">
                <p className="font-mono text-xs text-[#A78BFA] tracking-widest uppercase">Weekly Deep Report</p>
                <span className="font-mono text-xs bg-[#A78BFA15] text-[#A78BFA] border border-[#A78BFA30]
                                 px-2 py-0.5 rounded-full">$5 USDC</span>
              </div>
              <p className="font-mono text-white text-lg font-bold mb-1">Every Monday — deeper edge</p>
              <p className="font-mono text-slate-500 text-sm">Pay once per report via x402 on Base. No subscription.</p>
            </div>

            <div className="space-y-2 mb-6 flex-1">
              {[
                "🎯 Token Picks — high-conviction Base setups",
                "🐋 Onchain Flows — whale moves, smart money",
                "🔭 Builder Radar — who's shipping, what's next",
                "📐 Market Edge — contrarian takes, positioning",
                "⚡ Weekly Signal — 1 move a Base founder must make",
                "Everything in Daily Brief included",
              ].map(item => (
                <div key={item} className="flex items-start gap-2">
                  <span className="font-mono text-xs text-[#A78BFA80] mt-0.5">·</span>
                  <p className="font-mono text-xs text-slate-400">{item}</p>
                </div>
              ))}
            </div>

            <SubscribeForm tier="weekly" />

            <p className="font-mono text-xs text-slate-700 mt-3 text-center">
              Pay with USDC on Base · powered by x402
            </p>
          </div>
        </div>

        {/* ── Recent Briefs Archive ── */}
        <div className="mb-6 flex items-center justify-between">
          <p className="font-mono text-xs text-slate-500 tracking-widest uppercase">Recent Briefs</p>
          <p className="font-mono text-xs text-slate-700">Archive</p>
        </div>

        <div className="border border-[#1A1A2E] rounded-xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-[#1A1A2E]">
            {ARCHIVE.map((brief, i) => (
              <button
                key={i}
                onClick={() => setActiveArchive(i)}
                className={`flex-1 px-4 py-3 font-mono text-xs transition-colors text-left
                  ${activeArchive === i
                    ? "bg-[#0d0d1a] text-[#4FC3F7] border-b-2 border-[#4FC3F7]"
                    : "text-slate-600 hover:text-slate-400"}`}
              >
                {brief.date}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="p-6 bg-[#0a0a14]">
            <div className="bg-[#4FC3F710] border border-[#4FC3F720] rounded-lg p-4 mb-4">
              <p className="font-mono text-xs text-[#4FC3F7] mb-2 tracking-widest">⚡ SIGNAL</p>
              <p className="font-mono text-sm text-white italic">
                {ARCHIVE[activeArchive].signal}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {ARCHIVE[activeArchive].tags.map(tag => (
                <span key={tag}
                  className="font-mono text-xs bg-[#1A1A2E] text-slate-500 px-2 py-1 rounded">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Footer note ── */}
        <div className="mt-12 text-center">
          <p className="font-mono text-xs text-slate-700">
            Blue Agent × Aeon × MiroShark ·{" "}
            <a href="https://blueagent.dev" className="text-[#4FC3F770] hover:text-[#4FC3F7] transition-colors">
              blueagent.dev
            </a>
          </p>
        </div>

      </main>
    </div>
  );
}
