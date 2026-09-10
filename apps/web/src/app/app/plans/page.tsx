"use client";

// /app/plans — the top-up screen. This is a PRICING PAGE ONLY: it introduces no
// new billing mechanism. Every "Pay $N in USDC" button (and the header chip)
// opens the existing TopUpModal, which runs the same non-custodial USDC → credits
// flow (CREDIT_PACKS) used everywhere else — and TopUpModal routes through the
// wallet picker itself when nothing is connected, so this page needs no connect
// card of its own.
//
// Every number on this page is imported, never typed out:
//   CREDIT_PACKS / CREDITS_PER_USDC  — lib/payments, the real packs + anchor rate
//   cheapestPaid.credits             — per-message cost of the cheapest paid model
//   GUEST_DAILY / WALLET_DAILY       — lib/credits, the real free allowances
// The per-card "≈ N messages · or N tool runs" is arithmetic on those; a hardcoded
// figure would drift the moment a pack is repriced or a model recosted.
//
// Honesty invariant carried over from the previous build: a credit pack unlocks
// NOTHING. Guest and Member reach the identical model list and Hub catalog — packs
// differ in SIZE only. That is why every card's middle feature row is the literal
// "Spends on any model or Hub tool" (identical on all four), and why the footer
// states the free daily allowance instead of implying you must pay to use the
// product. Selling a "tier" that gated a feature would be the same class of defect
// as advertising a tool the model cannot call.

import { useEffect, useState } from "react";
import Link from "next/link";
import TopUpModal from "@/components/TopUpModal";
import { CREDIT_PACKS, CREDITS_PER_USDC } from "@/lib/payments";
import { WALLET_DAILY, GUEST_DAILY } from "@/lib/credits";
import {
  VIRTUALS_PRESETS_V1,
  type VirtualsPresetV1,
} from "@/app/chat/components/presets";

const ACCENT = "#4FC3F7";

// The "≈ N tool runs" reference price. $0.05 is the catalog floor (the cheapest
// Hub tools), so this reads as an upper bound — hence the "≈". Live per-tool
// prices live on /hub; anchoring to one number here beats mirroring a 100-row
// table that would rot the day a tool is repriced.
const TOOL_RUN_ANCHOR_USD = 0.05;

// Advisory framing per tier, keyed by the pack's own label — editorial "who is
// this size for", never a capability the smaller tiers lack. The two rows above
// it on every card are identical on purpose. Unknown labels get a size-neutral
// line so a repriced CREDIT_PACKS never renders an empty row.
const TIER_FLAVOR: Record<string, string> = {
  Starter: "Good for a first project",
  Plus:    "Enough for a full month of building",
  Pro:     "Volume for agents and cron jobs",
  Scale:   "Volume for agents and cron jobs",
};

/** USDC list price → credits, at the one anchor rate. */
function usdToCredits(usd: number): number {
  return Math.round(usd * CREDITS_PER_USDC);
}

export default function PlansPage() {
  const [topup, setTopup] = useState(false);

  // Same catalog-trim the chat picker does: the server filters the static spec
  // against the live Virtuals/Venice catalogs, so a de-listed model can't anchor
  // a message count it can no longer be charged at. Static list until it answers,
  // static list again if it fails.
  const [presets, setPresets] = useState<VirtualsPresetV1[]>(VIRTUALS_PRESETS_V1);
  useEffect(() => {
    let off = false;
    fetch("/api/chat/presets")
      .then(r => (r.ok ? r.json() : null))
      .then((body: { ok?: boolean; presets?: VirtualsPresetV1[] } | null) => {
        if (off) return;
        if (body?.ok && Array.isArray(body.presets) && body.presets.length > 0) {
          setPresets(body.presets);
        }
      })
      .catch(() => {});
    return () => { off = true; };
  }, []);

  // Anchor the "≈ N messages" figure to the cheapest PAID model — the free one
  // costs nothing and would make every pack read as infinite.
  const cheapestPaid =
    [...presets].filter(p => p.credits > 0).sort((a, b) => a.credits - b.credits)[0] ?? null;

  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden">
      {/* Desktop header — on mobile the AppShell top bar prints the title */}
      <div className="hidden lg:flex items-center gap-3.5 flex-wrap shrink-0 min-h-[48px] px-5 py-2 border-b border-[#1A1A2E]">
        <span className="font-mono text-[11px] font-semibold tracking-[0.16em] text-[#E2E8F0]">// PLANS</span>
        <span className="font-mono text-[10.5px] text-[#64748B]">
          1 USDC = {CREDITS_PER_USDC.toLocaleString()} credits · Coinbase x402 · non-custodial
        </span>
        <button
          onClick={() => setTopup(true)}
          className="ml-auto font-mono text-[10.5px] font-semibold rounded-[7px] px-2.5 py-[5px] transition-opacity hover:opacity-90"
          style={{ color: "#050508", background: ACCENT }}
        >
          Top up with USDC
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-[980px] px-6 pt-[34px] pb-10">

          {/* Hero */}
          <div className="text-center">
            <div className="font-mono text-[9.5px] font-medium tracking-[0.2em]" style={{ color: ACCENT }}>
              TOP UP
            </div>
            <h1 className="font-mono font-bold text-[30px] leading-[1.28] tracking-[-0.02em] text-[#E2E8F0] mt-3.5">
              Buy credits once.<br />Spend them on anything.
            </h1>
            <p className="font-prose text-[12px] leading-[1.75] text-[#94A3B8] max-w-[520px] mx-auto mt-3.5">
              1 USDC = {CREDITS_PER_USDC.toLocaleString()} credits. Credits pay for chat messages and Hub tool
              runs at the same anchor rate. No subscription, nothing recurring — you sign the transfer yourself.
            </p>
            <div className="flex justify-center gap-2 mt-5 flex-wrap">
              <Pill dot="#34D399" color="#34D399" border="rgba(52,211,153,.32)">no subscription</Pill>
              <Pill dot={ACCENT} color={ACCENT} border="rgba(79,195,247,.32)">credits never expire</Pill>
              <Pill dot={ACCENT} color={ACCENT} border="rgba(79,195,247,.32)">you sign the transfer</Pill>
              <Pill color="#94A3B8" border="#1A1A2E">USDC · Base 8453</Pill>
            </div>
          </div>

          {/* Tier grid — driven entirely by CREDIT_PACKS */}
          <div
            className="grid gap-3.5 mt-[30px]"
            style={{ gridTemplateColumns: "repeat(auto-fit,minmax(215px,1fr))" }}
          >
            {CREDIT_PACKS.map(pack => {
              const popular  = !!pack.popular;
              const msgs     = cheapestPaid ? Math.floor(pack.credits / cheapestPaid.credits) : null;
              const toolRuns = Math.floor(pack.credits / usdToCredits(TOOL_RUN_ANCHOR_USD));
              const capacity =
                "≈ " +
                [
                  cheapestPaid && msgs != null ? `${msgs.toLocaleString()} ${cheapestPaid.label} messages` : null,
                  `${toolRuns.toLocaleString()} tool runs`,
                ]
                  .filter(Boolean)
                  .join(" · or ");
              return (
                <button
                  key={pack.usdc}
                  onClick={() => setTopup(true)}
                  className="relative text-left rounded-[18px] px-5 pt-6 pb-5 transition-colors"
                  style={{
                    border: popular ? "1px solid rgba(79,195,247,.4)" : "1px solid #1A1A2E",
                    background: popular ? "rgba(79,195,247,.05)" : "#0D0D14",
                    boxShadow: popular ? "inset 0 0 44px rgba(79,195,247,.06)" : undefined,
                  }}
                >
                  {popular && (
                    <span
                      className="absolute -top-2.5 left-5 font-mono text-[8.5px] font-semibold tracking-[0.12em] rounded-full px-2.5 py-1"
                      style={{ color: "#050508", background: ACCENT }}
                    >
                      MOST POPULAR
                    </span>
                  )}
                  <div className="font-mono text-[13px] font-semibold text-[#E2E8F0]">{pack.label}</div>
                  <div className="flex items-baseline gap-1.5 mt-3.5">
                    <span
                      className="font-mono font-bold text-[40px] tracking-[-0.03em]"
                      style={{ color: popular ? ACCENT : "#E2E8F0" }}
                    >
                      ${pack.usdc}
                    </span>
                    <span className="font-mono text-[10px] text-[#64748B]">one-off</span>
                  </div>
                  <div className="font-mono text-[15px] font-semibold text-[#E2E8F0] mt-3">
                    {pack.credits.toLocaleString()}{" "}
                    <span className="font-mono text-[10.5px] font-normal text-[#64748B]">credits</span>
                  </div>
                  <div className="font-prose text-[10.5px] leading-[1.6] text-[#94A3B8] mt-1.5">{capacity}</div>
                  <div
                    className="font-mono text-[11px] font-semibold rounded-full py-[11px] text-center mt-5"
                    style={
                      popular
                        ? {
                            color: "#050508",
                            background: ACCENT,
                            border: `1px solid ${ACCENT}`,
                            boxShadow: "0 0 20px rgba(79,195,247,.26)",
                          }
                        : { color: "#E2E8F0", background: "transparent", border: "1px solid #1A1A2E" }
                    }
                  >
                    Pay ${pack.usdc} in USDC
                  </div>
                  <div
                    className="mt-4 pt-3.5"
                    style={{ borderTop: popular ? "1px solid rgba(79,195,247,.18)" : "1px solid #1A1A2E" }}
                  >
                    <Feature>Never expires</Feature>
                    <Feature>Spends on any model or Hub tool</Feature>
                    <Feature>{TIER_FLAVOR[pack.label] ?? "Scales with your usage"}</Feature>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Free-allowance footer — the honesty note that you never have to pay */}
          <div className="flex items-center gap-2.5 mt-[26px] rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14] px-4 py-3.5 flex-wrap">
            <span className="font-prose text-[10.5px] leading-[1.7] text-[#94A3B8] flex-1 min-w-[240px]">
              Every wallet already gets a free daily allowance — {GUEST_DAILY.toLocaleString()} credits as a
              guest, {WALLET_DAILY.toLocaleString()} with a wallet connected. Top-ups sit in a separate pool
              that never resets.
            </span>
            <Link
              href="/usage"
              className="font-mono text-[10.5px] font-medium rounded-[9px] px-3 py-2.5 whitespace-nowrap"
              style={{ color: ACCENT, border: "1px solid rgba(79,195,247,.3)" }}
            >
              See your usage →
            </Link>
          </div>
        </div>
      </div>

      <TopUpModal open={topup} onClose={() => setTopup(false)} />
    </div>
  );
}

// ── Bits ──────────────────────────────────────────────────────────────────────

/** A guarantee pill in the hero. `dot` is optional — the "USDC · Base 8453"
 *  pill is a plain slate chip with no leading dot. */
function Pill({ children, dot, color, border }: {
  children: React.ReactNode; dot?: string; color: string; border: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[10px] font-medium rounded-full px-2.5 py-[5px]"
      style={{ color, border: `1px solid ${border}` }}
    >
      {dot && <span className="w-[5px] h-[5px] rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}

/** One green-check row inside a tier card. */
function Feature({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-[5px]">
      <span className="font-mono text-[10px] font-semibold" style={{ color: "#34D399" }}>✓</span>
      <span className="flex-1 font-prose text-[10.5px] leading-[1.6] text-[#94A3B8]">{children}</span>
    </div>
  );
}
