"use client";
// Tool output cards — rendered inline after tool execution logs
// One card per tool type: honeypot, risk-gate, deep-analysis, token-pick, contract-trust

import { useState, useEffect } from "react";
import { useAccount, useReadContracts, useBalance, useReadContract, useWriteContract, useSwitchChain, usePublicClient, useSendTransaction } from "wagmi";
import { formatUnits, parseUnits, parseEther, isAddress } from "viem";
import { base } from "viem/chains";
import { useAddress, useName } from "@coinbase/onchainkit/identity";
import { YIELD_NETWORKS, ERC20_ABI, AAVE_POOL_ABI, ERC4626_ABI, WITHDRAW_ALL, parseUsdc, supplyApyPct, VENUES, VENUE_LIST, type YieldNetwork, type VenueId } from "@/lib/yield-execution";
import { useChat } from "../ChatContext";

function truncAddr(addr: string, len = 6) {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, len)}…${addr.slice(-4)}`;
}

function ScoreBar({ score, color }: { score: number; color: string }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 rounded-full bg-[#1A1A2E] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="font-mono text-[10px] shrink-0" style={{ color }}>{pct}</span>
    </div>
  );
}

function VerdictBadge({
  verdict, colorMap,
}: {
  verdict: string;
  colorMap: Record<string, { bg: string; text: string; icon: string }>;
}) {
  const s = colorMap[verdict] ?? { bg: "#1E1E32", text: "#94a3b8", icon: "·" };
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[11px] font-bold"
      style={{ background: s.bg, color: s.text }}
    >
      <span>{s.icon}</span>
      {verdict}
    </span>
  );
}

function FlagList({ flags, color }: { flags: string[]; color: string }) {
  if (!flags?.length) return null;
  return (
    <div className="flex flex-col gap-1">
      {flags.slice(0, 4).map((f, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <span style={{ color }} className="mt-0.5 shrink-0 text-[10px]">›</span>
          <span className="font-mono text-[11px] text-slate-400 leading-snug">{f}</span>
        </div>
      ))}
    </div>
  );
}

// ── Shared card wrapper ───────────────────────────────────────────────────────

function Card({ children, accentColor = "#4FC3F7" }: { children: React.ReactNode; accentColor?: string }) {
  return (
    <div
      className="rounded-xl border overflow-hidden my-3"
      style={{ borderColor: `${accentColor}25`, background: `${accentColor}06` }}
    >
      {children}
    </div>
  );
}

function CardHeader({ children, accentColor }: { children: React.ReactNode; accentColor: string }) {
  return (
    <div
      className="flex items-center justify-between px-4 py-3 border-b"
      style={{ borderColor: `${accentColor}20`, background: `${accentColor}10` }}
    >
      {children}
    </div>
  );
}

function CardBody({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-3 space-y-3">{children}</div>;
}

// ── HoneypotCard ─────────────────────────────────────────────────────────────

interface HoneypotResult {
  verdict?: string;
  confidence?: number;
  is_honeypot?: boolean;
  sell_tax_estimate?: string;
  buy_tax_estimate?: string;
  red_flags?: string[];
  green_flags?: string[];
  assessment?: string;
  token?: { name?: string; symbol?: string; verified?: boolean; url?: string };
  address?: string;
}

const HONEYPOT_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  SAFE:       { bg: "#16a34a15", text: "#4ade80", icon: "✓" },
  SUSPICIOUS: { bg: "#d9770615", text: "#fb923c", icon: "⚠" },
  HONEYPOT:   { bg: "#dc262615", text: "#f87171", icon: "✕" },
};

export function HoneypotCard({ result }: { result: HoneypotResult }) {
  const verdict   = result.verdict ?? "SUSPICIOUS";
  const color     = HONEYPOT_COLORS[verdict]?.text ?? "#94a3b8";
  const accentColor = verdict === "SAFE" ? "#4ade80" : verdict === "HONEYPOT" ? "#f87171" : "#fb923c";
  const url       = result.token?.url ?? (result.address ? `https://basescan.org/address/${result.address}` : undefined);

  return (
    <Card accentColor={accentColor}>
      <CardHeader accentColor={accentColor}>
        <div className="flex items-center gap-3">
          <span className="text-sm">🛡</span>
          <span className="font-mono text-[11px] text-slate-500 tracking-widest uppercase">Honeypot Check</span>
        </div>
        <div className="flex items-center gap-2">
          <VerdictBadge verdict={verdict} colorMap={HONEYPOT_COLORS} />
          {result.confidence !== undefined && (
            <span className="font-mono text-[10px] text-slate-600">{result.confidence}% confidence</span>
          )}
        </div>
      </CardHeader>
      <CardBody>
        {/* Token info */}
        {result.token?.name && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-slate-400">
              {result.token.symbol && <span style={{ color: accentColor }} className="font-bold">${result.token.symbol}</span>}
              {result.token.name && ` · ${result.token.name}`}
            </span>
            {result.address && (
              <span className="font-mono text-[10px] text-slate-600">{truncAddr(result.address)}</span>
            )}
          </div>
        )}

        {/* Tax row */}
        {(result.sell_tax_estimate || result.buy_tax_estimate) && (
          <div className="flex gap-4 font-mono text-[11px]">
            {result.buy_tax_estimate && (
              <span>Buy tax: <span className="text-slate-300">{result.buy_tax_estimate}</span></span>
            )}
            {result.sell_tax_estimate && (
              <span>Sell tax: <span style={{ color: result.sell_tax_estimate === "0%" ? "#4ade80" : "#fb923c" }}>
                {result.sell_tax_estimate}
              </span></span>
            )}
          </div>
        )}

        {/* Flags */}
        {!!result.red_flags?.length && <FlagList flags={result.red_flags} color="#f87171" />}
        {!!result.green_flags?.length && <FlagList flags={result.green_flags} color="#4ade80" />}

        {/* Assessment */}
        {result.assessment && (
          <p className="font-mono text-[11px] text-slate-500 leading-relaxed border-t pt-2" style={{ borderColor: `${accentColor}15` }}>
            {result.assessment}
          </p>
        )}

        {/* Footer */}
        {url && (
          <div className="flex pt-1">
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="font-mono text-[10px] hover:underline transition-colors"
              style={{ color: accentColor }}>
              View on Basescan ↗
            </a>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ── RiskGateCard ─────────────────────────────────────────────────────────────

interface RiskGateResult {
  verdict?: string;
  action?: string;
  risk_score?: number;
  risk_level?: string;
  red_flags?: string[];
  aml_signals?: string[];
  assessment?: string;
  transaction?: { action?: string; to?: string; hasCalldata?: boolean };
  target?: { isContract?: boolean; verified?: boolean; contractName?: string; url?: string };
  community?: { known_drainer?: boolean; known_phishing?: boolean; risk_signals?: string[] };
}

const RISKGATE_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  PROCEED: { bg: "#16a34a15", text: "#4ade80", icon: "✓" },
  CAUTION: { bg: "#d9770615", text: "#fb923c", icon: "⚠" },
  ABORT:   { bg: "#dc262615", text: "#f87171", icon: "✕" },
};

export function RiskGateCard({ result }: { result: RiskGateResult }) {
  const verdict     = result.verdict ?? "CAUTION";
  const score       = result.risk_score ?? 50;
  const accentColor = verdict === "PROCEED" ? "#4ade80" : verdict === "ABORT" ? "#f87171" : "#fb923c";
  const url         = result.target?.url;

  return (
    <Card accentColor={accentColor}>
      <CardHeader accentColor={accentColor}>
        <div className="flex items-center gap-3">
          <span className="text-sm">⚠️</span>
          <span className="font-mono text-[11px] text-slate-500 tracking-widest uppercase">Risk Gate</span>
        </div>
        <VerdictBadge verdict={verdict} colorMap={RISKGATE_COLORS} />
      </CardHeader>
      <CardBody>
        {/* Transaction info */}
        <div className="flex flex-wrap gap-3 font-mono text-[11px]">
          {result.transaction?.action && (
            <span className="text-slate-400">Action: <span className="text-slate-200 capitalize">{result.transaction.action}</span></span>
          )}
          {result.transaction?.to && (
            <span className="text-slate-400">To: <span className="text-slate-300">{truncAddr(result.transaction.to)}</span></span>
          )}
          {result.target?.contractName && (
            <span className="text-slate-400">Contract: <span className="text-slate-300">{result.target.contractName}</span></span>
          )}
        </div>

        {/* Risk score bar */}
        <div className="space-y-1">
          <div className="flex justify-between font-mono text-[10px] text-slate-600">
            <span>Risk score</span>
            <span style={{ color: accentColor }}>{result.risk_level ?? "medium"}</span>
          </div>
          <ScoreBar score={score} color={accentColor} />
        </div>

        {/* Drainer / phishing badges */}
        {(result.community?.known_drainer || result.community?.known_phishing) && (
          <div className="flex gap-2 flex-wrap">
            {result.community.known_drainer && (
              <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-red-950/40 text-red-400 border border-red-900/40">Known drainer</span>
            )}
            {result.community.known_phishing && (
              <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-red-950/40 text-red-400 border border-red-900/40">Phishing</span>
            )}
          </div>
        )}

        {/* Flags */}
        {!!result.red_flags?.length && <FlagList flags={result.red_flags} color="#f87171" />}
        {!!result.aml_signals?.length && <FlagList flags={result.aml_signals} color="#fb923c" />}

        {/* Assessment */}
        {result.assessment && (
          <p className="font-mono text-[11px] text-slate-500 leading-relaxed border-t pt-2" style={{ borderColor: `${accentColor}15` }}>
            {result.assessment}
          </p>
        )}

        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="font-mono text-[10px] hover:underline" style={{ color: accentColor }}>
            View on Basescan ↗
          </a>
        )}
      </CardBody>
    </Card>
  );
}

// ── DeepAnalysisCard ──────────────────────────────────────────────────────────

interface DeepAnalysisResult {
  verdict?: string;
  composite_score?: number;
  action?: string;
  address?: string;
  token?: { name?: string; symbol?: string; verified?: boolean; isProxy?: boolean; url?: string };
  security?: { score?: number; critical_risks?: string[]; positive_signals?: string[]; summary?: string };
  market?: { score?: number; community_trust?: string; narrative?: string; summary?: string };
  fundamentals?: { score?: number; activity_level?: string; age_signal?: string; summary?: string };
}

const DEEP_VERDICT_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  BULLISH: { bg: "#16a34a15", text: "#4ade80", icon: "↑" },
  NEUTRAL: { bg: "#1e40af15", text: "#60a5fa", icon: "→" },
  BEARISH: { bg: "#dc262615", text: "#f87171", icon: "↓" },
};

export function DeepAnalysisCard({ result }: { result: DeepAnalysisResult }) {
  const verdict     = result.verdict ?? "NEUTRAL";
  const composite   = result.composite_score ?? 50;
  const accentColor = verdict === "BULLISH" ? "#4ade80" : verdict === "BEARISH" ? "#f87171" : "#60a5fa";
  const secScore    = result.security?.score ?? 0;
  const mktScore    = result.market?.score ?? 0;
  const fundScore   = result.fundamentals?.score ?? 0;
  const url         = result.token?.url ?? (result.address ? `https://basescan.org/address/${result.address}` : undefined);

  return (
    <Card accentColor={accentColor}>
      <CardHeader accentColor={accentColor}>
        <div className="flex items-center gap-3">
          <span className="text-sm">🔬</span>
          <div className="flex flex-col">
            <span className="font-mono text-[11px] text-slate-500 tracking-widest uppercase">Deep Analysis</span>
            {result.token?.symbol && (
              <span className="font-mono text-[12px] font-bold" style={{ color: accentColor }}>
                ${result.token.symbol}
                {result.token?.name ? ` · ${result.token.name}` : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <VerdictBadge verdict={verdict} colorMap={DEEP_VERDICT_COLORS} />
          <span className="font-mono text-[10px] text-slate-600">Score {composite}/100</span>
        </div>
      </CardHeader>
      <CardBody>
        {/* Score bars */}
        <div className="space-y-2">
          <div className="space-y-1">
            <div className="flex justify-between font-mono text-[10px] text-slate-600">
              <span>Security</span>
            </div>
            <ScoreBar score={secScore} color={secScore >= 70 ? "#4ade80" : secScore >= 45 ? "#fb923c" : "#f87171"} />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between font-mono text-[10px] text-slate-600">
              <span>Market</span>
            </div>
            <ScoreBar score={mktScore} color={mktScore >= 70 ? "#4ade80" : mktScore >= 45 ? "#fb923c" : "#f87171"} />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between font-mono text-[10px] text-slate-600">
              <span>Onchain</span>
            </div>
            <ScoreBar score={fundScore} color={fundScore >= 70 ? "#4ade80" : fundScore >= 45 ? "#fb923c" : "#f87171"} />
          </div>
        </div>

        {/* Tags row */}
        <div className="flex flex-wrap gap-1.5">
          {result.token?.verified && (
            <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-green-950/40 text-green-400 border border-green-900/40">Verified</span>
          )}
          {result.token?.isProxy && (
            <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-yellow-950/40 text-yellow-400 border border-yellow-900/40">Proxy</span>
          )}
          {result.market?.narrative && result.market.narrative !== "unknown" && (
            <span className="font-mono text-[10px] px-2 py-0.5 rounded-full border" style={{ borderColor: `${accentColor}30`, color: accentColor, background: `${accentColor}10` }}>
              {result.market.narrative}
            </span>
          )}
          {result.fundamentals?.activity_level && result.fundamentals.activity_level !== "unknown" && (
            <span className="font-mono text-[10px] px-2 py-0.5 rounded-full border border-slate-700/50 text-slate-500">
              activity: {result.fundamentals.activity_level}
            </span>
          )}
        </div>

        {/* Critical risks */}
        {!!result.security?.critical_risks?.length && (
          <FlagList flags={result.security.critical_risks} color="#f87171" />
        )}

        {/* Security summary */}
        {result.security?.summary && (
          <p className="font-mono text-[11px] text-slate-500 leading-relaxed border-t pt-2" style={{ borderColor: `${accentColor}15` }}>
            {result.security.summary}
          </p>
        )}

        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="font-mono text-[10px] hover:underline" style={{ color: accentColor }}>
            View on Basescan ↗
          </a>
        )}
      </CardBody>
    </Card>
  );
}

// ── TokenPickCard ─────────────────────────────────────────────────────────────

interface TokenPickResult {
  token?: string;
  symbol?: string;
  thesis?: string;
  entry?: string;
  target?: string;
  kill_criterion?: string;
  sizing?: string;
  conviction?: string;
  timeframe?: string;
  catalysts?: string[];
  risks?: string[];
  narrative?: string;
  // fallback flat structure
  signal?: string;
  pick?: string;
  result?: string;
}

const CONVICTION_COLORS: Record<string, string> = {
  high:   "#4ade80",
  medium: "#fb923c",
  low:    "#94a3b8",
};

export function TokenPickCard({ result }: { result: TokenPickResult }) {
  const conviction  = (result.conviction ?? "medium").toLowerCase();
  const accentColor = CONVICTION_COLORS[conviction] ?? "#4FC3F7";
  const symbol      = result.symbol ?? result.token?.split("(")[0]?.trim() ?? "Token";

  return (
    <Card accentColor={accentColor}>
      <CardHeader accentColor={accentColor}>
        <div className="flex items-center gap-3">
          <span className="text-sm">🎯</span>
          <div>
            <span className="font-mono text-[11px] text-slate-500 tracking-widest uppercase">Token Pick</span>
            {symbol && (
              <p className="font-mono text-[13px] font-bold" style={{ color: accentColor }}>${symbol}</p>
            )}
          </div>
        </div>
        {result.conviction && (
          <span className="font-mono text-[10px] px-2.5 py-1 rounded-full border font-semibold uppercase tracking-wider"
            style={{ color: accentColor, borderColor: `${accentColor}40`, background: `${accentColor}12` }}>
            {conviction} conviction
          </span>
        )}
      </CardHeader>
      <CardBody>
        {/* Thesis */}
        {result.thesis && (
          <p className="font-mono text-[12px] text-slate-300 leading-relaxed">{result.thesis}</p>
        )}

        {/* Trade params */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 font-mono text-[11px]">
          {result.entry && (
            <div><span className="text-slate-600">Entry</span> <span className="text-slate-300">{result.entry}</span></div>
          )}
          {result.target && (
            <div><span className="text-slate-600">Target</span> <span style={{ color: accentColor }}>{result.target}</span></div>
          )}
          {result.sizing && (
            <div><span className="text-slate-600">Size</span> <span className="text-slate-300">{result.sizing}</span></div>
          )}
          {result.timeframe && (
            <div><span className="text-slate-600">Timeframe</span> <span className="text-slate-300">{result.timeframe}</span></div>
          )}
          {result.narrative && (
            <div className="col-span-2"><span className="text-slate-600">Narrative</span> <span className="text-slate-300">{result.narrative}</span></div>
          )}
        </div>

        {/* Kill criterion */}
        {result.kill_criterion && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg border border-red-900/30 bg-red-950/20">
            <span className="text-red-400 text-xs shrink-0 mt-px">✕</span>
            <div>
              <span className="font-mono text-[10px] text-red-500 uppercase tracking-wider block mb-0.5">Kill switch</span>
              <span className="font-mono text-[11px] text-slate-400">{result.kill_criterion}</span>
            </div>
          </div>
        )}

        {/* Catalysts */}
        {!!result.catalysts?.length && (
          <div>
            <span className="font-mono text-[10px] text-slate-600 uppercase tracking-wider block mb-1">Catalysts</span>
            <FlagList flags={result.catalysts} color={accentColor} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ── ContractTrustCard ─────────────────────────────────────────────────────────

interface ContractTrustResult {
  verdict?: string;
  confidence?: number;
  headline?: string;
  action?: string;
  summary?: string;
  checklist?: string[];
  address?: string;
  basescan?: { verified?: boolean; contractName?: string; isProxy?: boolean; url?: string };
  security?: { score?: number; red_flags?: string[]; green_flags?: string[]; assessment?: string };
  community?: { trust?: string; recognition?: string; verdict?: string };
}

const TRUST_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  SAFE:     { bg: "#16a34a15", text: "#4ade80", icon: "✓" },
  CAUTION:  { bg: "#d9770615", text: "#fb923c", icon: "⚠" },
  RED_FLAG: { bg: "#dc262615", text: "#f87171", icon: "✕" },
};

export function ContractTrustCard({ result }: { result: ContractTrustResult }) {
  const verdict     = result.verdict ?? "CAUTION";
  const score       = result.security?.score ?? 50;
  const accentColor = TRUST_COLORS[verdict]?.text ?? "#94a3b8";
  const url         = result.basescan?.url ?? (result.address ? `https://basescan.org/address/${result.address}` : undefined);

  return (
    <Card accentColor={accentColor}>
      <CardHeader accentColor={accentColor}>
        <div className="flex items-center gap-3">
          <span className="text-sm">🔐</span>
          <div>
            <span className="font-mono text-[11px] text-slate-500 tracking-widest uppercase">Contract Trust</span>
            {result.basescan?.contractName && (
              <p className="font-mono text-[12px] font-bold text-slate-200">{result.basescan.contractName}</p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <VerdictBadge verdict={verdict} colorMap={TRUST_COLORS} />
          {result.confidence !== undefined && (
            <span className="font-mono text-[10px] text-slate-600">{result.confidence}% confidence</span>
          )}
        </div>
      </CardHeader>
      <CardBody>
        {result.headline && (
          <p className="font-mono text-[12px] text-slate-200 font-medium">{result.headline}</p>
        )}

        {/* Security score */}
        <div className="space-y-1">
          <div className="font-mono text-[10px] text-slate-600">Security score</div>
          <ScoreBar score={score} color={accentColor} />
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {result.basescan?.verified && (
            <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-green-950/40 text-green-400 border border-green-900/40">Verified</span>
          )}
          {result.basescan?.isProxy && (
            <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-yellow-950/40 text-yellow-400 border border-yellow-900/40">Proxy</span>
          )}
          {result.community?.recognition && result.community.recognition !== "unknown" && (
            <span className="font-mono text-[10px] px-2 py-0.5 rounded-full border border-slate-700/50 text-slate-500">
              {result.community.recognition.replace(/_/g, " ")}
            </span>
          )}
        </div>

        {/* Red flags */}
        {!!result.security?.red_flags?.length && <FlagList flags={result.security.red_flags} color="#f87171" />}
        {!!result.security?.green_flags?.length && <FlagList flags={result.security.green_flags} color="#4ade80" />}

        {/* Summary */}
        {result.summary && (
          <p className="font-mono text-[11px] text-slate-500 leading-relaxed border-t pt-2" style={{ borderColor: `${accentColor}15` }}>
            {result.summary}
          </p>
        )}

        {/* Checklist */}
        {!!result.checklist?.length && (
          <div className="space-y-1">
            <span className="font-mono text-[10px] text-slate-600 uppercase tracking-wider">Before interacting</span>
            <FlagList flags={result.checklist.slice(0, 3)} color="#94a3b8" />
          </div>
        )}

        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="font-mono text-[10px] hover:underline" style={{ color: accentColor }}>
            View on Basescan ↗
          </a>
        )}
      </CardBody>
    </Card>
  );
}

// ── MarketFitCard ─────────────────────────────────────────────────────────────

const VERDICT_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  GO:    { bg: "#16a34a15", text: "#4ade80", icon: "✓" },
  WAIT:  { bg: "#d9770615", text: "#fb923c", icon: "⏸" },
  PIVOT: { bg: "#dc262615", text: "#f87171", icon: "↻" },
};

function MarketFitCard({ result }: { result: Record<string, unknown> }) {
  const verdict  = String(result.verdict ?? "");
  const score    = Number(result.score ?? result.market_fit_score ?? 0);
  const summary  = String(result.summary ?? result.suggested_change ?? "");
  const risks    = Array.isArray(result.risks) ? result.risks as string[] : [];
  const brief    = result.brief as Record<string, string> | undefined;
  const color    = verdict === "GO" ? "#4ade80" : verdict === "WAIT" ? "#fb923c" : "#f87171";
  return (
    <Card accentColor={color}>
      <CardHeader accentColor={color}>
        <span className="font-mono text-[11px] font-bold text-slate-300">Market Fit</span>
        <div className="flex items-center gap-2">
          <VerdictBadge verdict={verdict || "—"} colorMap={VERDICT_COLORS} />
          {score > 0 && <span className="font-mono text-[10px]" style={{ color }}>{score}/100</span>}
        </div>
      </CardHeader>
      <CardBody>
        {score > 0 && <ScoreBar score={score} color={color} />}
        {brief && (
          <div className="grid grid-cols-1 gap-1.5">
            {Object.entries(brief).slice(0, 3).map(([k, v]) => (
              <div key={k}>
                <p className="font-mono text-[9px] text-slate-600 uppercase tracking-wider">{k}</p>
                <p className="font-mono text-[11px] text-slate-300 leading-snug">{v}</p>
              </div>
            ))}
          </div>
        )}
        {risks.length > 0 && <FlagList flags={risks} color="#fb923c" />}
        {summary && <p className="font-mono text-[11px] text-slate-400 leading-snug">{summary}</p>}
      </CardBody>
    </Card>
  );
}

// ── WalletPnlCard ─────────────────────────────────────────────────────────────

function WalletPnlCard({ result }: { result: Record<string, unknown> }) {
  const pnl   = String(result.estimatedPnL ?? result.pnl ?? "");
  const wr    = String(result.winRate ?? result.win_rate ?? "");
  const style = String(result.tradingStyle ?? result.trading_style ?? "");
  const score = Number(result.smartMoneyScore ?? result.smart_money_score ?? 0);
  const summary = String(result.summary ?? "");
  const isPos = pnl.startsWith("+");
  const color = isPos ? "#4ade80" : pnl.startsWith("-") ? "#f87171" : "#4FC3F7";
  return (
    <Card accentColor={color}>
      <CardHeader accentColor={color}>
        <span className="font-mono text-[11px] font-bold text-slate-300">Wallet PnL</span>
        {pnl && <span className="font-mono text-[13px] font-bold" style={{ color }}>{pnl}</span>}
      </CardHeader>
      <CardBody>
        <div className="grid grid-cols-3 gap-3">
          {wr    && <div><p className="font-mono text-[9px] text-slate-600 uppercase">Win Rate</p><p className="font-mono text-[12px]" style={{ color: "#4ade80" }}>{wr}</p></div>}
          {style && <div><p className="font-mono text-[9px] text-slate-600 uppercase">Style</p><p className="font-mono text-[11px] text-slate-300">{style}</p></div>}
          {score > 0 && <div><p className="font-mono text-[9px] text-slate-600 uppercase">Smart $</p><ScoreBar score={score} color="#A78BFA" /></div>}
        </div>
        {summary && <p className="font-mono text-[11px] text-slate-400 leading-snug">{summary}</p>}
      </CardBody>
    </Card>
  );
}

// ── AmlCard ───────────────────────────────────────────────────────────────────

const AML_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  CLEAN:      { bg: "#16a34a15", text: "#4ade80", icon: "✓" },
  SUSPICIOUS: { bg: "#d9770615", text: "#fb923c", icon: "⚠" },
  FLAGGED:    { bg: "#dc262615", text: "#f87171", icon: "✕" },
};

function AmlCard({ result }: { result: Record<string, unknown> }) {
  const verdict = String(result.verdict ?? result.status ?? "");
  const score   = Number(result.riskScore ?? result.risk_score ?? 0);
  const flags   = Array.isArray(result.flags) ? result.flags as string[] : [];
  const summary = String(result.summary ?? "");
  const color   = verdict === "CLEAN" ? "#4ade80" : verdict === "FLAGGED" ? "#f87171" : "#fb923c";
  return (
    <Card accentColor={color}>
      <CardHeader accentColor={color}>
        <span className="font-mono text-[11px] font-bold text-slate-300">AML Screen</span>
        <div className="flex items-center gap-2">
          <VerdictBadge verdict={verdict || "—"} colorMap={AML_COLORS} />
          {score > 0 && <span className="font-mono text-[10px]" style={{ color }}>Risk {score}</span>}
        </div>
      </CardHeader>
      <CardBody>
        {score > 0 && <ScoreBar score={score} color={color} />}
        {flags.length > 0 && <FlagList flags={flags} color="#fb923c" />}
        {summary && <p className="font-mono text-[11px] text-slate-400 leading-snug">{summary}</p>}
      </CardBody>
    </Card>
  );
}

// ── QuantumCard ───────────────────────────────────────────────────────────────

function QuantumCard({ result }: { result: Record<string, unknown> }) {
  const score    = Number(result.vulnerabilityScore ?? result.score ?? result.quantum_score ?? 0);
  const verdict  = String(result.verdict ?? result.risk_level ?? "");
  const exposed  = result.keyExposed ?? result.key_exposed;
  const timeline = String(result.timeline ?? result.threat_timeline ?? "");
  const recs     = Array.isArray(result.recommendations) ? result.recommendations as string[] : [];
  const color    = score > 70 ? "#f87171" : score > 40 ? "#fb923c" : "#4ade80";
  return (
    <Card accentColor={color}>
      <CardHeader accentColor={color}>
        <span className="font-mono text-[11px] font-bold text-slate-300">⚛ Quantum Scan</span>
        <div className="flex items-center gap-2">
          {verdict && <span className="font-mono text-[10px] font-bold" style={{ color }}>{verdict}</span>}
          {score > 0 && <span className="font-mono text-[10px] text-slate-500">Score {score}</span>}
        </div>
      </CardHeader>
      <CardBody>
        {score > 0 && <ScoreBar score={score} color={color} />}
        {exposed !== undefined && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-slate-600 uppercase">Key Exposed</span>
            <span className="font-mono text-[11px]" style={{ color: exposed ? "#f87171" : "#4ade80" }}>{exposed ? "Yes ⚠" : "No ✓"}</span>
          </div>
        )}
        {timeline && <p className="font-mono text-[11px] text-slate-400 leading-snug">{timeline}</p>}
        {recs.length > 0 && <FlagList flags={recs} color="#A78BFA" />}
      </CardBody>
    </Card>
  );
}

// ── YieldCard ─────────────────────────────────────────────────────────────────

function YieldCard({ result }: { result: Record<string, unknown> }) {
  const opps = Array.isArray(result.opportunities) ? result.opportunities as Record<string, unknown>[] : [];
  const summary = String(result.summary ?? result.top_opportunity ?? "");
  return (
    <Card accentColor="#34D399">
      <CardHeader accentColor="#34D399">
        <span className="font-mono text-[11px] font-bold text-slate-300">💰 Yield Optimizer</span>
        {opps.length > 0 && <span className="font-mono text-[10px] text-[#34D399]">{opps.length} opportunities</span>}
      </CardHeader>
      <CardBody>
        {opps.slice(0, 3).map((o, i) => (
          <div key={i} className="flex items-center justify-between py-1 border-b border-slate-800 last:border-0">
            <div>
              <p className="font-mono text-[11px] text-slate-200">{String(o.protocol ?? o.name ?? "")}</p>
              <p className="font-mono text-[9px] text-slate-600">{String(o.asset ?? o.pool ?? "")}</p>
            </div>
            <span className="font-mono text-[12px] font-bold text-[#34D399]">{String(o.apy ?? o.apr ?? "")}</span>
          </div>
        ))}
        {opps.length === 0 && summary && <p className="font-mono text-[11px] text-slate-400">{summary}</p>}
      </CardBody>
    </Card>
  );
}

// ── GenericCard — fallback for any tool without a specific card ───────────────

const SKIP_KEYS = new Set(["raw", "prompt", "_meta", "model", "tool", "command"]);

function GenericCard({ tool, result }: { tool: string; result: Record<string, unknown> }) {
  const label = tool.replace(/^hub_/, "").replace(/_/g, " ");

  // Pick the most informative fields to surface
  const topFields = Object.entries(result)
    .filter(([k, v]) => !SKIP_KEYS.has(k) && v !== null && v !== undefined && v !== "")
    .slice(0, 6);

  if (topFields.length === 0) return null;

  return (
    <Card accentColor="#4FC3F7">
      <CardHeader accentColor="#4FC3F7">
        <span className="font-mono text-[11px] font-bold text-slate-300 capitalize">{label}</span>
      </CardHeader>
      <CardBody>
        <div className="grid grid-cols-1 gap-2">
          {topFields.map(([k, v]) => {
            const isArray  = Array.isArray(v);
            const isObject = typeof v === "object" && !isArray;
            const display  = isArray
              ? (v as unknown[]).slice(0, 3).map(String).join(" · ")
              : isObject
              ? JSON.stringify(v).slice(0, 120)
              : String(v).slice(0, 200);
            const isScore  = /score|rating|pct|percent/i.test(k) && typeof v === "number";
            const key      = k.replace(/_/g, " ");
            return (
              <div key={k}>
                <p className="font-mono text-[9px] text-slate-600 uppercase tracking-wider">{key}</p>
                {isScore
                  ? <ScoreBar score={Number(v)} color="#4FC3F7" />
                  : <p className="font-mono text-[11px] text-slate-300 leading-snug">{display}</p>
                }
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}

// ── Router — pick the right card for a tool ───────────────────────────────────

// ── Portfolio card (live, client-side) ────────────────────────────────────────
// Rendered for the `show_portfolio` marker tool. Reads the connected wallet's
// Base balances directly via wagmi (read-only, no signing) so the number is
// live rather than a server snapshot. Mirrors the dashboard's token set.

const PORTFOLIO_TOKENS = [
  { sym: "BLUEAGENT", address: "0xf895783b2931c919955e18b5e3343e7c7c456ba3", decimals: 18, color: "#4FC3F7" },
  { sym: "USDC",  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6,  color: "#22C55E" },
  { sym: "WETH",  address: "0x4200000000000000000000000000000000000006", decimals: 18, color: "#A78BFA" },
  { sym: "cbBTC", address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8,  color: "#F59E0B" },
  { sym: "AERO",  address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", decimals: 18, color: "#F472B6" },
] as const;

const ERC20_BALANCE_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

function fmtTokenAmt(n: number, decimals: number): string {
  if (n === 0) return "0";
  if (decimals <= 6)  return n.toFixed(2);
  if (n >= 1_000)     return (n / 1_000).toFixed(2) + "K";
  if (n >= 1)         return n.toFixed(4);
  return n.toFixed(6);
}

function PortfolioCard() {
  const { address, isConnected } = useAccount();
  const { data: native } = useBalance({ address });
  const { data, isLoading } = useReadContracts({
    contracts: PORTFOLIO_TOKENS.map(t => ({
      address:      t.address as `0x${string}`,
      abi:          ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args:         address ? [address] : undefined,
    })),
    query: { enabled: !!address },
  });

  if (!isConnected || !address) {
    return (
      <div className="mt-2 rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-3 font-mono text-[11px] text-slate-500">
        Connect a wallet to see your Base portfolio.
      </div>
    );
  }

  const eth = native ? Number(formatUnits(native.value, 18)) : null;
  const rows = [
    { sym: "ETH", color: "#627EEA", decimals: 18, amt: eth },
    ...PORTFOLIO_TOKENS.map((t, i) => {
      const raw = data?.[i]?.result as bigint | undefined;
      return { sym: t.sym, color: t.color, decimals: t.decimals,
               amt: raw !== undefined ? Number(formatUnits(raw, t.decimals)) : null };
    }),
  ];

  return (
    <div className="mt-2 rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-3.5">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[10px] text-slate-500 tracking-widest font-bold">PORTFOLIO · BASE</span>
        <span className="font-mono text-[9px] text-slate-700">{truncAddr(address)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {rows.map(t => {
          const isZero = !t.amt || t.amt === 0;
          return (
            <div key={t.sym}
              className={`rounded-lg border p-2 ${isZero ? "border-[#1A1A2E]/40 bg-[#0a0a0f]/40 opacity-50" : "border-[#1A1A2E] bg-[#0d0d12]"}`}>
              <div className="font-mono text-[9px] tracking-widest font-bold mb-0.5" style={{ color: t.color }}>{t.sym}</div>
              <div className="font-mono text-[12px] font-bold text-white leading-none truncate">
                {isLoading && t.amt === null ? "…" : t.amt === null ? "—" : fmtTokenAmt(t.amt, t.decimals)}
              </div>
            </div>
          );
        })}
      </div>
      <p className="font-mono text-[9px] text-slate-700 mt-2.5">Live on-chain balances · read-only</p>
    </div>
  );
}

// ── Token launch card (Bankr launchpad, explicit confirm) ─────────────────────
// Rendered for the `prepare_token_launch` marker. A real, irreversible deploy
// on Base — so it's a preview with an explicit Launch button. The deploy runs
// server-side via Bankr's partner key; the 57% creator-fee share is routed to
// the user's connected wallet (feeRecipient), so they own the upside without a
// Bankr account or a signature.

interface TokenLaunchResult {
  tokenName?:        string;
  tokenSymbol?:      string;
  description?:      string;
  image?:            string;
  website?:          string;
  feeRecipientType?: string;   // wallet | x | farcaster | ens (from the agent Q&A)
  feeRecipientValue?:string;
}

type FeeType = "wallet" | "x" | "farcaster" | "ens";
const FEE_TYPES: { id: FeeType; label: string; placeholder: string }[] = [
  { id: "wallet",    label: "Wallet",    placeholder: "0x… (your address)" },
  { id: "x",         label: "X",         placeholder: "@username" },
  { id: "farcaster", label: "Farcaster", placeholder: "username" },
  { id: "ens",       label: "ENS",       placeholder: "name.eth" },
];

// Default fee recipient when the user leaves the field blank — BlueAgent's X
// account (@blueagent_). Bankr resolves the X handle → verified wallet at deploy
// time, so launches monetize BlueAgent by default; the user can redirect the
// 57% creator fee to themselves (wallet / X / Farcaster / ENS).
const BLUE_FEE_X = "blueagent_";

// Small labelled text input used across the launch form.
function LaunchField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[9px] text-slate-600 block mb-1">{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-slate-200 placeholder:text-slate-700 outline-none transition-colors"
      />
    </label>
  );
}

function TokenLaunchCard({ result }: { result: TokenLaunchResult }) {
  const { address } = useAccount();
  const [step, setStep] = useState<"idle" | "launching" | "done" | "error">("idle");
  const [err,  setErr]  = useState<string>("");
  const [out,  setOut]  = useState<{ tokenAddress: string | null; basescan: string | null; uniswap: string | null; bankr: string | null } | null>(null);

  // Every token field is editable in the card — pre-filled only from values the
  // agent explicitly passed through (it never invents them), but the card is the
  // source of truth so the user can fix/fill anything before launching.
  const [name,        setName]        = useState(result.tokenName ?? "");
  const [symbol,      setSymbol]      = useState((result.tokenSymbol ?? "").replace(/^\$/, ""));
  const [description, setDescription] = useState(result.description ?? "");
  const [image,       setImage]       = useState(result.image ?? "");
  const [website,     setWebsite]     = useState(result.website ?? "");

  // Fee recipient — who gets the 57% creator share. Pre-selected from the Q&A if
  // any; left blank, fees default to BlueAgent (see resolved* below).
  const initType = (["wallet", "x", "farcaster", "ens"].includes(result.feeRecipientType ?? "")
    ? result.feeRecipientType : "wallet") as FeeType;
  const [feeType,  setFeeType]  = useState<FeeType>(initType);
  const [feeValue, setFeeValue] = useState(result.feeRecipientValue ?? "");

  const cleanName   = name.trim();
  const cleanSymbol = symbol.replace(/^\$/, "").trim();

  // Resolve the effective fee recipient. If the user entered nothing, the 57%
  // creator fee defaults to BlueAgent's X account (@blueagent_) — the user can
  // redirect it to their own wallet / X / Farcaster / ENS by filling the field.
  const feeEntered       = feeValue.trim().length > 0;
  const resolvedFeeType  = feeEntered ? feeType : "x";
  const resolvedFeeValue = feeEntered ? feeValue.trim() : BLUE_FEE_X;

  async function launch() {
    if (!cleanName) return;
    setStep("launching"); setErr("");
    try {
      const res = await fetch("/api/launch-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenName: cleanName, tokenSymbol: cleanSymbol || undefined,
          description: description.trim() || undefined,
          feeRecipientType: resolvedFeeType, feeRecipientValue: resolvedFeeValue,
          image: image.trim() || undefined, website: website.trim() || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d?.error ?? `Launch failed (${res.status})`); setStep("error"); return; }
      setOut({ tokenAddress: d.tokenAddress ?? null, basescan: d.basescan ?? null, uniswap: d.uniswap ?? null, bankr: d.bankr ?? null });
      setStep("done");
    } catch (e) {
      setErr((e as Error).message); setStep("error");
    }
  }

  if (step === "done") {
    return (
      <div className="mt-2 rounded-xl border p-3.5" style={{ borderColor: "#22C55E40", background: "#22C55E08" }}>
        <div className="font-mono text-[11px] font-bold mb-1" style={{ color: "#22C55E" }}>🚀 ${cleanSymbol || cleanName} launched on Base</div>
        {out?.tokenAddress && <div className="font-mono text-[10px] text-slate-400 mb-2 break-all">{out.tokenAddress}</div>}
        <div className="flex flex-wrap gap-2">
          {out?.bankr    && <a href={out.bankr}    target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] px-2.5 py-1 rounded-lg border border-[#4FC3F730] text-[#4FC3F7]">View on Bankr ↗</a>}
          {out?.basescan && <a href={out.basescan} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] px-2.5 py-1 rounded-lg border border-[#1A1A2E] text-slate-300 hover:text-white">Basescan ↗</a>}
          {out?.uniswap  && <a href={out.uniswap}  target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] px-2.5 py-1 rounded-lg border border-[#F59E0B30] text-[#F59E0B]">Trade on Uniswap ↗</a>}
        </div>
        <p className="font-mono text-[9px] text-slate-600 mt-2">Creator fees (57%) accrue to {feeEntered ? "the fee recipient" : "@blueagent_"}.</p>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-3.5">
      <div className="font-mono text-[10px] text-slate-500 tracking-widest font-bold mb-3">LAUNCH TOKEN · BASE</div>

      {/* Live preview of the name/ticker as typed */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center font-mono text-sm font-bold shrink-0"
             style={{ background: "#4FC3F715", border: "1px solid #4FC3F730", color: "#4FC3F7" }}>
          {(cleanSymbol || cleanName).slice(0, 2).toUpperCase() || "?"}
        </div>
        <div className="min-w-0">
          <div className="font-mono text-sm font-bold text-white truncate">{cleanName || "Your token name"}</div>
          <div className="font-mono text-[11px] text-slate-500">${cleanSymbol || "TICKER"}</div>
        </div>
      </div>

      {/* Editable token fields — the card is the form */}
      <div className="space-y-2 mb-3">
        <LaunchField label="TOKEN NAME *"  value={name}        onChange={setName}        placeholder="e.g. Blue Agent" />
        <div className="grid grid-cols-2 gap-2">
          <LaunchField label="TICKER"      value={symbol}      onChange={setSymbol}      placeholder="auto from name" />
          <LaunchField label="LOGO URL"    value={image}       onChange={setImage}       placeholder="https://…/logo.png" />
        </div>
        <LaunchField label="DESCRIPTION"   value={description}  onChange={setDescription} placeholder="One-line pitch (optional)" />
        <LaunchField label="WEBSITE"       value={website}      onChange={setWebsite}     placeholder="https://… (optional)" />
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3 font-mono text-[10px]">
        <div className="rounded-lg border border-[#1A1A2E] bg-[#0d0d12] px-2.5 py-1.5">
          <div className="text-slate-600 mb-0.5">SUPPLY</div><div className="text-slate-300">100B fixed</div>
        </div>
        <div className="rounded-lg border border-[#1A1A2E] bg-[#0d0d12] px-2.5 py-1.5">
          <div className="text-slate-600 mb-0.5">CREATOR FEE</div><div className="text-[#22C55E]">57% of 1.2% swap fee</div>
        </div>
      </div>

      {/* Fee recipient — optional; blank = BlueAgent */}
      <div className="mb-3">
        <div className="font-mono text-[9px] text-slate-600 mb-1.5">FEE RECIPIENT · 57% creator share · optional</div>
        <div className="flex gap-1 mb-1.5 flex-wrap">
          {FEE_TYPES.map(t => {
            const active = feeType === t.id;
            return (
              <button key={t.id}
                onClick={() => { setFeeType(t.id); setFeeValue(t.id === "wallet" && address ? address : ""); }}
                className="font-mono text-[10px] px-2 py-1 rounded-md transition-colors"
                style={active
                  ? { background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F730" }
                  : { color: "#64748b", border: "1px solid #1A1A2E" }}>
                {t.label}
              </button>
            );
          })}
        </div>
        <input
          value={feeValue}
          onChange={e => setFeeValue(e.target.value)}
          placeholder={feeType === "wallet"
            ? (address ? `${truncAddr(address)} — or leave blank → @blueagent_` : "0x… — or leave blank → @blueagent_")
            : `${FEE_TYPES.find(t => t.id === feeType)?.placeholder ?? ""} — or leave blank → @blueagent_`}
          className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-slate-200 placeholder:text-slate-700 outline-none transition-colors"
        />
      </div>

      <p className="font-mono text-[9px] text-slate-600 mb-2 leading-relaxed">
        Fees → <span className="text-slate-400">{feeEntered ? (resolvedFeeType === "wallet" ? truncAddr(resolvedFeeValue) : `${resolvedFeeType}:${feeValue.trim()}`) : "@blueagent_ (default)"}</span>. This deploys a
        <span className="text-amber-400"> real, irreversible</span> token on Base via Bankr.
      </p>
      {step === "error" && <p className="font-mono text-[10px] text-amber-400 mb-2">{err}</p>}
      <button
        onClick={launch}
        disabled={step === "launching" || !cleanName}
        className="w-full font-mono text-[12px] font-bold py-2 rounded-lg transition-all disabled:opacity-50"
        style={{ background: "#F59E0B15", color: "#F59E0B", border: "1px solid #F59E0B40" }}>
        {step === "launching" ? "Launching…" : `🚀 Launch $${cleanSymbol || "TOKEN"} on Base`}
      </button>
      <p className="font-mono text-[9px] text-slate-700 mt-1.5">
        {cleanName ? "Bankr allows 1 real launch/min per wallet." : "Enter a token name to launch."}
      </p>
    </div>
  );
}

// Rendered for the `prepare_yield` marker. NON-custodial move-to-yield: the user
// signs supply/withdraw on the chosen venue (Aave v3 or Morpho) from their OWN
// wallet via wagmi. Verified addresses (see lib/yield-execution). Best-rate
// router: pick a venue, the card builds the right protocol calls.
interface YieldMoveResult { action?: string; amount?: number | string; network?: string }

function MoveToYieldCard({ result }: { result: YieldMoveResult }) {
  // Use the chat's canonical connected wallet (set by WalletBar via
  // onWalletChange) so the card's "connected" state matches what the user sees
  // in the sidebar — wagmi's bare useAccount() can lag/mismatch right after a
  // reconnect. wagmi hooks below still drive the actual signing.
  const { walletAddr } = useChat();
  const address = walletAddr as `0x${string}` | undefined;
  const isConnected = !!walletAddr;
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [venue,   setVenue]   = useState<VenueId>("aave");
  const [action,  setAction]  = useState<"supply" | "withdraw">(result.action === "withdraw" ? "withdraw" : "supply");
  const [network, setNetwork] = useState<YieldNetwork>(result.network === "base" ? "base" : "baseSepolia");
  const [amount,  setAmount]  = useState<string>(
    result.amount != null && (typeof result.amount === "number" || typeof result.amount === "string") ? String(result.amount) : "");
  const [all,  setAll]  = useState(false);
  const [step, setStep] = useState<"idle" | "switching" | "approving" | "supplying" | "withdrawing" | "done" | "error">("idle");
  const [err,  setErr]  = useState("");
  const [txHash, setTxHash] = useState<string>("");

  // #4 Best-rate routing — live curated USDC lending APYs across Base venues from
  // DefiLlama. Drives both the comparison panel and the per-venue APY display.
  type Rate = { project: string; label: string; apy: number; executable: boolean };
  const [rates, setRates] = useState<Rate[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/yield/rates")
      .then(r => r.json())
      .then(d => { if (!cancelled) setRates((d?.rates as Rate[]) ?? []); })
      .catch(() => { if (!cancelled) setRates([]); });
    return () => { cancelled = true; };
  }, []);

  const net = YIELD_NETWORKS[network];
  const chainId = net.chainId;
  const vcfg = VENUES[venue];
  const vnet = vcfg.nets[network];            // venue addresses on this network (or undefined)
  const isAave = vcfg.protocol === "aave";
  const publicClient = usePublicClient({ chainId });

  // Picking a venue not on the current network auto-switches the network.
  function pickVenue(v: VenueId) {
    setVenue(v); setStep("idle"); setErr("");
    if (!VENUES[v].nets[network]) setNetwork(Object.keys(VENUES[v].nets)[0] as YieldNetwork);
  }
  // Switching to a network the venue doesn't support falls back to Aave.
  useEffect(() => { if (!VENUES[venue].nets[network]) setVenue("aave"); }, [network, venue]);

  // #1 Position — Aave: aToken.balanceOf (rebases). Morpho: vault.maxWithdraw
  // (USDC-equivalent of your shares). Both in USDC units for display.
  const { data: aaveBal, refetch: refetchAave } = useReadContract({
    address: vnet?.receipt, abi: ERC20_ABI, functionName: "balanceOf",
    args: address ? [address] : undefined, chainId,
    query: { enabled: !!address && isAave && !!vnet },
  });
  const { data: reserve } = useReadContract({
    address: vnet?.target, abi: AAVE_POOL_ABI, functionName: "getReserveData",
    args: vnet ? [vnet.usdc] : undefined, chainId,
    query: { enabled: isAave && !!vnet },
  });
  const { data: morphoMaxW, refetch: refetchMorpho } = useReadContract({
    address: vnet?.target, abi: ERC4626_ABI, functionName: "maxWithdraw",
    args: address ? [address] : undefined, chainId,
    query: { enabled: !!address && !isAave && !!vnet },
  });
  const { data: morphoShares } = useReadContract({
    address: vnet?.receipt, abi: ERC20_ABI, functionName: "balanceOf",
    args: address ? [address] : undefined, chainId,
    query: { enabled: !!address && !isAave && !!vnet },
  });

  const position = isAave
    ? (aaveBal != null ? Number(formatUnits(aaveBal as bigint, 6)) : null)
    : (morphoMaxW != null ? Number(formatUnits(morphoMaxW as bigint, 6)) : null);
  const venueRate = rates?.find(r => r.project === vcfg.llamaProject)?.apy ?? null;
  const apy = isAave && reserve
    ? supplyApyPct((reserve as { currentLiquidityRate: bigint }).currentLiquidityRate)
    : venueRate;
  const refetchPos = () => { refetchAave?.(); refetchMorpho?.(); };

  const amt = parseFloat(amount);
  const withdrawAll = action === "withdraw" && all;
  const valid = !!vnet && (withdrawAll || amt > 0);
  const busy = step === "switching" || step === "approving" || step === "supplying" || step === "withdrawing";

  async function run() {
    if (!address) { setErr("Connect your wallet first"); setStep("error"); return; }
    if (!vnet)    { setErr(`${vcfg.short} isn't available on ${net.short}`); setStep("error"); return; }
    if (!valid)   { setErr("Enter an amount"); setStep("error"); return; }
    setErr(""); setTxHash("");
    try {
      setStep("switching");
      await switchChainAsync({ chainId });
      const value = withdrawAll ? WITHDRAW_ALL : parseUsdc(amt, network);

      if (action === "supply") {
        setStep("approving");
        const approveHash = await writeContractAsync({
          address: vnet.usdc, abi: ERC20_ABI, functionName: "approve",
          args: [vnet.spender, value], chainId,
        });
        await publicClient?.waitForTransactionReceipt({ hash: approveHash });
        setStep("supplying");
        const supplyHash = isAave
          ? await writeContractAsync({ address: vnet.target, abi: AAVE_POOL_ABI, functionName: "supply",  args: [vnet.usdc, value, address, 0], chainId })
          : await writeContractAsync({ address: vnet.target, abi: ERC4626_ABI,   functionName: "deposit", args: [value, address], chainId });
        setTxHash(supplyHash); setStep("done");
      } else {
        setStep("withdrawing");
        let wHash: `0x${string}`;
        if (isAave) {
          wHash = await writeContractAsync({ address: vnet.target, abi: AAVE_POOL_ABI, functionName: "withdraw", args: [vnet.usdc, value, address], chainId });
        } else if (withdrawAll) {
          // ERC-4626 has no "max" sentinel — redeem the full share balance.
          const shares = (morphoShares as bigint | undefined) ?? 0n;
          if (shares === 0n) throw new Error("No position to withdraw");
          wHash = await writeContractAsync({ address: vnet.target, abi: ERC4626_ABI, functionName: "redeem", args: [shares, address, address], chainId });
        } else {
          wHash = await writeContractAsync({ address: vnet.target, abi: ERC4626_ABI, functionName: "withdraw", args: [value, address, address], chainId });
        }
        setTxHash(wHash); setStep("done");
      }
      setTimeout(refetchPos, 4000); // best-effort refresh once the tx is in
    } catch (e) {
      setErr(((e as Error).message || String(e)).slice(0, 160)); setStep("error");
    }
  }

  if (step === "done") {
    const msg = action === "supply"
      ? `Supplied to ${vcfg.short} — earning as it confirms.`
      : "Withdraw submitted — USDC is returning to your wallet.";
    return (
      <div className="mt-2 rounded-xl border p-3.5" style={{ borderColor: "#22C55E40", background: "#22C55E08" }}>
        <div className="font-mono text-[11px] font-bold mb-1" style={{ color: "#22C55E" }}>
          ✓ {action === "supply" ? "Supply" : "Withdraw"} submitted · {vcfg.short} · {net.short}
        </div>
        <div className="font-mono text-[10px] text-slate-400 mb-2">{msg}</div>
        {txHash && (
          <a href={`${net.explorer}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
             className="font-mono text-[10px] px-2.5 py-1 rounded-lg border border-[#4FC3F730] text-[#4FC3F7]">
            View tx ↗
          </a>
        )}
      </div>
    );
  }

  const btnLabel = busy
    ? (step === "switching" ? "Switching network…" : step === "approving" ? "Approve in wallet…" : step === "supplying" ? "Supply in wallet…" : "Withdraw in wallet…")
    : action === "supply" ? `🌾 Supply${amt > 0 ? ` ${amt}` : ""} USDC → ${vcfg.short}` : `↩︎ Withdraw${withdrawAll ? " all" : amt > 0 ? ` ${amt}` : ""} USDC`;

  return (
    <div className="mt-2 rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-3.5">
      <div className="font-mono text-[10px] text-slate-500 tracking-widest font-bold mb-3">MOVE TO YIELD · BASE</div>

      {/* Network risk banner */}
      <div className="rounded-lg px-2.5 py-1.5 mb-3 font-mono text-[10px] leading-relaxed"
           style={net.testnet
             ? { background: "#F59E0B0a", border: "1px solid #F59E0B30", color: "#fcd9a3" }
             : { background: "#EF44440a", border: "1px solid #EF444440", color: "#fca5a5" }}>
        {net.testnet
          ? <>⚠️ <b>Testnet (Base Sepolia)</b> — safe to experiment with fake funds.</>
          : <>🔴 <b>Mainnet — real funds.</b> You sign; this is irreversible. Double-check the amount.</>}
      </div>

      {/* Venue selector — the router */}
      <div className="mb-3">
        <div className="font-mono text-[9px] text-slate-600 mb-1.5">VENUE</div>
        <div className="flex gap-1">
          {VENUE_LIST.map(v => {
            const active = venue === v.id;
            const vr = rates?.find(r => r.project === v.llamaProject)?.apy ?? null;
            return (
              <button key={v.id} onClick={() => pickVenue(v.id)}
                className="flex-1 font-mono text-[10px] py-1.5 rounded-md transition-colors"
                style={active
                  ? { background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F730" }
                  : { color: "#64748b", border: "1px solid #1A1A2E" }}>
                {v.short}{vr != null && <span className={active ? "text-[#22C55E]" : "text-slate-500"}> {vr.toFixed(1)}%</span>}
              </button>
            );
          })}
        </div>
        <div className="font-mono text-[9px] text-slate-700 mt-1">
          {vcfg.label}{!isAave && " · mainnet only"}
        </div>
      </div>

      {/* #1 Position + #2 live APY — real on-chain reads (per venue) */}
      <div className="flex items-center justify-between mb-3 px-2.5 py-2 rounded-lg border border-[#1A1A2E] bg-[#0d0d12] font-mono text-[10px]">
        <div>
          <div className="text-slate-600 mb-0.5">YOUR POSITION</div>
          <div className="text-slate-200">{position != null ? `${position.toFixed(2)} USDC` : (isConnected ? (vnet ? "—" : "—") : "connect to view")}</div>
        </div>
        <div className="text-right">
          <div className="text-slate-600 mb-0.5">SUPPLY APY</div>
          <div className="text-[#22C55E]">{apy != null ? `~${apy.toFixed(2)}%` : "—"}</div>
        </div>
      </div>

      {/* #4 Best rate on Base — live curated comparison (DefiLlama) */}
      {rates && rates.length > 0 && (
        <div className="mb-3 rounded-lg border border-[#1A1A2E] bg-[#0d0d12] p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[9px] text-slate-600">BEST USDC RATE · BASE</span>
            <span className="font-mono text-[9px] text-slate-700">live · DefiLlama</span>
          </div>
          {rates.slice(0, 4).map((r, i) => (
            <div key={r.project} className="flex items-center justify-between py-[2px] font-mono text-[10px]">
              <span className={i === 0 ? "text-[#22C55E]" : "text-slate-400"}>
                {i === 0 ? "★ " : "  "}{r.label}
                {!r.executable && <span className="text-slate-700"> · view-only</span>}
              </span>
              <span className={i === 0 ? "text-[#22C55E]" : "text-slate-300"}>{r.apy.toFixed(2)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Supply / Withdraw toggle */}
      <div className="flex gap-1 mb-3">
        {(["supply", "withdraw"] as const).map(a => {
          const active = action === a;
          return (
            <button key={a} onClick={() => setAction(a)}
              className="flex-1 font-mono text-[11px] py-1.5 rounded-md transition-colors"
              style={active
                ? { background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F730" }
                : { color: "#64748b", border: "1px solid #1A1A2E" }}>
              {a === "supply" ? "Supply" : "Withdraw"}
            </button>
          );
        })}
      </div>

      {/* Network */}
      <label className="block mb-3">
        <span className="font-mono text-[9px] text-slate-600 block mb-1">NETWORK</span>
        <select value={network} onChange={e => setNetwork(e.target.value as YieldNetwork)}
          className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-slate-200 outline-none">
          <option value="baseSepolia" disabled={!VENUES[venue].nets.baseSepolia}>Base Sepolia (testnet)</option>
          <option value="base">Base mainnet</option>
        </select>
      </label>

      {/* Amount */}
      <label className="block mb-2">
        <span className="font-mono text-[9px] text-slate-600 block mb-1">AMOUNT (USDC)</span>
        <input type="number" min="0" step="0.01" value={amount} disabled={withdrawAll}
          onChange={e => setAmount(e.target.value)} placeholder="e.g. 5"
          className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-slate-200 placeholder:text-slate-700 outline-none transition-colors disabled:opacity-40" />
      </label>

      {action === "withdraw" && (
        <label className="flex items-center gap-2 mb-2 font-mono text-[10px] text-slate-500 cursor-pointer">
          <input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} className="w-auto" />
          Withdraw all (full position)
        </label>
      )}

      <p className="font-mono text-[9px] text-slate-600 mb-2 leading-relaxed">
        {action === "supply"
          ? <>Supplies USDC into <span className="text-slate-400">{vcfg.label}</span> — you sign {isAave ? "approve + supply" : "approve + deposit"} and hold a yield-bearing receipt. Non-custodial; funds stay in your control.</>
          : <>Pulls USDC back out of <span className="text-slate-400">{vcfg.short}</span> to your wallet — you sign one {isAave ? "withdraw" : withdrawAll ? "redeem" : "withdraw"} call.</>}
      </p>

      {step === "error" && <p className="font-mono text-[10px] text-amber-400 mb-2">{err}</p>}

      <button onClick={run} disabled={busy || !valid || !isConnected}
        className="w-full font-mono text-[12px] font-bold py-2 rounded-lg transition-all disabled:opacity-50"
        style={action === "supply"
          ? { background: "#F59E0B15", color: "#F59E0B", border: "1px solid #F59E0B40" }
          : { background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
        {!isConnected ? "Connect your wallet to continue" : btnLabel}
      </button>
      <p className="font-mono text-[9px] text-slate-700 mt-1.5">
        {vcfg.label} · {net.label} · you sign every transaction · withdraw anytime.
      </p>
    </div>
  );
}

// Rendered for the `prepare_send` marker. NON-custodial send/pay: the user signs
// a USDC ERC-20 transfer (or native ETH send) to an address or Basename, from
// their OWN wallet. Basenames resolve via OnchainKit (Base L2 resolver).
interface SendResult { to?: string; amount?: number | string; asset?: string; network?: string }

function SendCard({ result }: { result: SendResult }) {
  const { walletAddr } = useChat();
  const fromAddr = walletAddr as `0x${string}` | undefined;
  const isConnected = !!walletAddr;
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();

  const [asset,     setAsset]     = useState<"USDC" | "ETH">(result.asset === "ETH" ? "ETH" : "USDC");
  const [network,   setNetwork]   = useState<YieldNetwork>(result.network === "base" ? "base" : "baseSepolia");
  const [recipient, setRecipient] = useState<string>(typeof result.to === "string" ? result.to : "");
  const [amount,    setAmount]    = useState<string>(
    result.amount != null && (typeof result.amount === "number" || typeof result.amount === "string") ? String(result.amount) : "");
  const [step, setStep] = useState<"idle" | "switching" | "sending" | "done" | "error">("idle");
  const [err,  setErr]  = useState("");
  const [txHash, setTxHash] = useState<string>("");

  const net = YIELD_NETWORKS[network];
  const chainId = net.chainId;
  const recip = recipient.trim();
  const recipIsAddr = isAddress(recip);
  const recipIsName = /\.(base|eth)$/i.test(recip);

  // Forward-resolve a Basename/ENS → address (always on Base mainnet resolver;
  // the resolved address is valid on whichever network you send from).
  const { data: resolvedAddr, isLoading: resolving } = useAddress(
    { name: recip, chain: base }, { enabled: recipIsName && recip.length > 3 });
  // Reverse-name for a pasted address (nice confirmation label).
  const { data: revName } = useName(
    { address: recipIsAddr ? (recip as `0x${string}`) : undefined, chain: base }, { enabled: recipIsAddr });

  const toAddress = (recipIsAddr ? recip : (recipIsName ? (resolvedAddr ?? undefined) : undefined)) as `0x${string}` | undefined;
  const amt = parseFloat(amount);
  const valid = !!toAddress && amt > 0;
  const busy = step === "switching" || step === "sending";

  async function send() {
    if (!fromAddr)  { setErr("Connect your wallet first"); setStep("error"); return; }
    if (!toAddress) { setErr(recipIsName ? "Couldn't resolve that name" : "Enter a valid address or .base name"); setStep("error"); return; }
    if (!(amt > 0)) { setErr("Enter an amount"); setStep("error"); return; }
    setErr(""); setTxHash("");
    try {
      setStep("switching");
      await switchChainAsync({ chainId });
      setStep("sending");
      const hash = asset === "USDC"
        ? await writeContractAsync({ address: net.usdc, abi: ERC20_ABI, functionName: "transfer", args: [toAddress, parseUnits(amount, net.usdcDecimals)], chainId })
        : await sendTransactionAsync({ to: toAddress, value: parseEther(amount), chainId });
      setTxHash(hash); setStep("done");
    } catch (e) {
      setErr(((e as Error).message || String(e)).slice(0, 160)); setStep("error");
    }
  }

  if (step === "done") {
    return (
      <div className="mt-2 rounded-xl border p-3.5" style={{ borderColor: "#22C55E40", background: "#22C55E08" }}>
        <div className="font-mono text-[11px] font-bold mb-1" style={{ color: "#22C55E" }}>
          ✓ Sent {amt} {asset} · {net.short}
        </div>
        <div className="font-mono text-[10px] text-slate-400 mb-2 break-all">
          to {revName || (recipIsName ? recip : truncAddr(toAddress ?? ""))}
        </div>
        {txHash && (
          <a href={`${net.explorer}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
             className="font-mono text-[10px] px-2.5 py-1 rounded-lg border border-[#4FC3F730] text-[#4FC3F7]">
            View tx ↗
          </a>
        )}
      </div>
    );
  }

  // Recipient resolution status line
  let resolveLine: React.ReactNode = null;
  if (recipIsName && resolving) resolveLine = <span className="text-slate-500">resolving {recip}…</span>;
  else if (recipIsName && toAddress) resolveLine = <span className="text-[#22C55E]">→ {truncAddr(toAddress)}</span>;
  else if (recipIsName && recip.length > 3) resolveLine = <span className="text-red-500">name not found on Base</span>;
  else if (recipIsAddr) resolveLine = <span className="text-[#22C55E]">✓ {revName ? `${revName} · ${truncAddr(recip)}` : "valid address"}</span>;
  else if (recip.length > 0) resolveLine = <span className="text-slate-600">enter a 0x… address or name.base</span>;

  const btnLabel = busy ? (step === "switching" ? "Switching network…" : "Confirm in wallet…")
    : `Send${amt > 0 ? ` ${amt}` : ""} ${asset}${toAddress ? ` → ${recipIsName ? recip : truncAddr(toAddress)}` : ""}`;

  return (
    <div className="mt-2 rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-3.5">
      <div className="font-mono text-[10px] text-slate-500 tracking-widest font-bold mb-3">SEND / PAY · BASE</div>

      {/* Network risk banner */}
      <div className="rounded-lg px-2.5 py-1.5 mb-3 font-mono text-[10px] leading-relaxed"
           style={net.testnet
             ? { background: "#F59E0B0a", border: "1px solid #F59E0B30", color: "#fcd9a3" }
             : { background: "#EF44440a", border: "1px solid #EF444440", color: "#fca5a5" }}>
        {net.testnet
          ? <>⚠️ <b>Testnet (Base Sepolia)</b> — safe to experiment with fake funds.</>
          : <>🔴 <b>Mainnet — real funds.</b> Sending is irreversible. Double-check the recipient + amount.</>}
      </div>

      {/* Asset toggle */}
      <div className="flex gap-1 mb-3">
        {(["USDC", "ETH"] as const).map(a => {
          const active = asset === a;
          return (
            <button key={a} onClick={() => setAsset(a)}
              className="flex-1 font-mono text-[11px] py-1.5 rounded-md transition-colors"
              style={active
                ? { background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F730" }
                : { color: "#64748b", border: "1px solid #1A1A2E" }}>
              {a}
            </button>
          );
        })}
      </div>

      {/* Recipient */}
      <label className="block mb-1">
        <span className="font-mono text-[9px] text-slate-600 block mb-1">RECIPIENT</span>
        <input value={recipient} onChange={e => setRecipient(e.target.value)}
          placeholder="0x… or name.base"
          className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-slate-200 placeholder:text-slate-700 outline-none transition-colors" />
      </label>
      <div className="font-mono text-[9px] mb-3 h-3">{resolveLine}</div>

      {/* Amount */}
      <label className="block mb-3">
        <span className="font-mono text-[9px] text-slate-600 block mb-1">AMOUNT ({asset})</span>
        <input type="number" min="0" step={asset === "ETH" ? "0.0001" : "0.01"} value={amount}
          onChange={e => setAmount(e.target.value)} placeholder={asset === "ETH" ? "e.g. 0.01" : "e.g. 5"}
          className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-slate-200 placeholder:text-slate-700 outline-none transition-colors" />
      </label>

      {/* Network */}
      <label className="block mb-3">
        <span className="font-mono text-[9px] text-slate-600 block mb-1">NETWORK</span>
        <select value={network} onChange={e => setNetwork(e.target.value as YieldNetwork)}
          className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-slate-200 outline-none">
          <option value="baseSepolia">Base Sepolia (testnet)</option>
          <option value="base">Base mainnet</option>
        </select>
      </label>

      <p className="font-mono text-[9px] text-slate-600 mb-2 leading-relaxed">
        Sends {asset} directly from your wallet — you sign one {asset === "USDC" ? "transfer" : "send"}. Non-custodial; Blue Agent never touches the funds.
      </p>

      {step === "error" && <p className="font-mono text-[10px] text-amber-400 mb-2">{err}</p>}

      <button onClick={send} disabled={busy || !valid || !isConnected}
        className="w-full font-mono text-[12px] font-bold py-2 rounded-lg transition-all disabled:opacity-50"
        style={{ background: "#34D39915", color: "#34D399", border: "1px solid #34D39940" }}>
        {!isConnected ? "Connect your wallet to continue" : btnLabel}
      </button>
      <p className="font-mono text-[9px] text-slate-700 mt-1.5">
        {net.label} · you sign every transaction · sends are final.
      </p>
    </div>
  );
}

export function ToolResultCard({ tool, result }: { tool: string; result: Record<string, unknown> }) {
  if (!result || typeof result !== "object") return null;
  const r = result;

  switch (tool) {
    case "hub_honeypot":      return <HoneypotCard    result={r as HoneypotResult} />;
    case "hub_risk_gate":     return <RiskGateCard    result={r as RiskGateResult} />;
    case "hub_deep_analysis": return <DeepAnalysisCard result={r as DeepAnalysisResult} />;
    case "hub_token_pick":    return <TokenPickCard   result={r as TokenPickResult} />;
    case "hub_contract_trust":
    case "hub_whale_signal":  return <ContractTrustCard result={r as ContractTrustResult} />;
    case "hub_market_fit":    return <MarketFitCard   result={r} />;
    case "hub_wallet_pnl":    return <WalletPnlCard   result={r} />;
    case "hub_aml":           return <AmlCard         result={r} />;
    case "hub_quantum":       return <QuantumCard      result={r} />;
    case "hub_yield":         return <YieldCard        result={r} />;
    case "show_portfolio":    return <PortfolioCard />;
    case "prepare_token_launch": return <TokenLaunchCard result={r as TokenLaunchResult} />;
    case "prepare_yield":     return <MoveToYieldCard  result={r as YieldMoveResult} />;
    case "prepare_send":      return <SendCard         result={r as SendResult} />;
    default:                  return <GenericCard      tool={tool} result={r} />;
  }
}
