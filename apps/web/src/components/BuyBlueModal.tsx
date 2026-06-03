"use client";

/**
 * BuyBlueModal — In-app $BLUEAGENT purchase modal
 *
 * Fetches live price from CoinGecko, shows tier calculator,
 * then opens Uniswap pre-filled with the exact amount.
 */

import { useState, useEffect } from "react";

const BLUE_ADDRESS  = "0xf895783b2931c919955e18b5e3343e7c7c456ba3";
const USDC_ADDRESS  = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const UNISWAP_URL = (outputAmt?: number) =>
  `https://app.uniswap.org/swap?chain=base&outputCurrency=${BLUE_ADDRESS}&inputCurrency=${USDC_ADDRESS}` +
  (outputAmt ? `&exactField=output&exactAmount=${outputAmt}` : "");

// ── Tiers ─────────────────────────────────────────────────────────────────────

const TIERS = [
  { name: "Starter", blue: 500_000,    cr: 500,  color: "#4FC3F7" },
  { name: "Pro",     blue: 2_000_000,  cr: 2_000, color: "#A78BFA" },
  { name: "Max",     blue: 10_000_000, cr: -1,    color: "#F59E0B" },
] as const;

function fmtBlue(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(0) + "M";
  return (n / 1_000).toFixed(0) + "K";
}

function fmtUSD(n: number) {
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

// ── Modal ──────────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

type SelectedTier = typeof TIERS[number] | null;

export default function BuyBlueModal({ onClose }: Props) {
  const [price,       setPrice]       = useState<number | null>(null);
  const [priceLoading,setPriceLoading]= useState(true);
  const [selected,    setSelected]    = useState<SelectedTier>(TIERS[0]);
  const [customAmt,   setCustomAmt]   = useState("");

  // Fetch live price from CoinGecko
  useEffect(() => {
    fetch(
      `https://api.coingecko.com/api/v3/simple/token_price/base?contract_addresses=${BLUE_ADDRESS}&vs_currencies=usd`,
    )
      .then(r => r.json())
      .then((d: Record<string, { usd?: number }>) => {
        const p = d[BLUE_ADDRESS.toLowerCase()]?.usd ?? d[BLUE_ADDRESS]?.usd;
        if (p) setPrice(p);
      })
      .catch(() => {/* silently use fallback */})
      .finally(() => setPriceLoading(false));
  }, []);

  const blueAmt    = selected ? selected.blue : Number(customAmt) || 0;
  const usdCost    = price && blueAmt ? blueAmt * price : null;
  const fallbackP  = 0.000001; // ~$0.000001 per BLUE (mcap ~$101K / 1B supply)

  function openSwap(amt: number) {
    window.open(UNISWAP_URL(amt), "_blank", "noopener,noreferrer");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#0D0D14] border border-[#2A2A4E] rounded-2xl w-full max-w-sm shadow-2xl">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#1A1A2E]">
          <div>
            <p className="font-mono text-[10px] text-[#F59E0B] tracking-widest mb-0.5">$BLUEAGENT · BASE</p>
            <h2 className="font-mono text-base font-bold text-white">Buy $BLUEAGENT</h2>
            {!priceLoading && (
              <p className="font-mono text-[10px] text-slate-500 mt-0.5">
                {price ? `1 BLUE = ${fmtUSD(price)}` : `~${fmtUSD(fallbackP)} (est.)`}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-[#1A1A2E] transition-all text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* ── Tier cards ──────────────────────────────────────────────────── */}
        <div className="px-4 pt-4 pb-3">
          <p className="font-mono text-[9px] text-slate-600 tracking-widest mb-2.5">SELECT TIER</p>
          <div className="flex flex-col gap-2">
            {TIERS.map((t) => {
              const cost = (price ?? fallbackP) * t.blue;
              const isActive = selected?.name === t.name;
              return (
                <button
                  key={t.name}
                  onClick={() => { setSelected(t); setCustomAmt(""); }}
                  className="flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-left"
                  style={isActive
                    ? { borderColor: `${t.color}50`, background: `${t.color}08` }
                    : { borderColor: "#1A1A2E", background: "transparent" }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: isActive ? t.color : "#374151" }}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold"
                          style={{ color: isActive ? t.color : "#94a3b8" }}>
                          {t.name}
                        </span>
                        <span className="font-mono text-[10px] text-slate-600">
                          {fmtBlue(t.blue)} BLUE
                        </span>
                      </div>
                      <div className="font-mono text-[10px] text-slate-600">
                        {t.cr === -1 ? "∞ credits/day" : `${t.cr.toLocaleString()} credits/day`}
                        {t.name === "Pro" && <span className="ml-1.5 text-[#A78BFA]">· 20% off models</span>}
                        {t.name === "Max" && <span className="ml-1.5 text-[#F59E0B]">· 40% off models</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-mono text-sm font-bold text-white">
                      {fmtUSD(cost)}
                    </div>
                    <div className="font-mono text-[9px] text-slate-600">USDC</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Custom amount ────────────────────────────────────────────────── */}
        <div className="px-4 pb-3">
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all"
            style={{ borderColor: !selected ? "#2A2A4E" : "#1A1A2E" }}
          >
            <span className="font-mono text-[10px] text-slate-600 flex-shrink-0">Custom:</span>
            <input
              type="number"
              value={customAmt}
              onChange={(e) => { setCustomAmt(e.target.value); setSelected(null); }}
              placeholder="amount of BLUE"
              className="flex-1 bg-transparent outline-none font-mono text-sm text-white placeholder:text-slate-700 min-w-0"
            />
            {customAmt && (
              <span className="font-mono text-[10px] text-slate-500 flex-shrink-0">
                ≈ {fmtUSD((price ?? fallbackP) * Number(customAmt))}
              </span>
            )}
          </div>
        </div>

        {/* ── CTA ─────────────────────────────────────────────────────────── */}
        <div className="px-4 pb-5">
          <button
            onClick={() => openSwap(blueAmt)}
            disabled={blueAmt === 0}
            className="w-full py-3 rounded-xl font-mono text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ background: "#F59E0B", color: "#050508" }}
          >
            <span>
              {blueAmt > 0
                ? `Buy ${fmtBlue(blueAmt)} BLUE`
                : "Select amount"}
            </span>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
          <p className="font-mono text-[9px] text-slate-700 text-center mt-2">
            Opens Uniswap on Base · credits refresh automatically after purchase
          </p>
        </div>
      </div>
    </div>
  );
}
