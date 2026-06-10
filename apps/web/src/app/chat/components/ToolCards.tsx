"use client";
// Tool output cards — rendered inline after tool execution logs
// One card per tool type: honeypot, risk-gate, deep-analysis, token-pick, contract-trust

import { useState } from "react";
import { useAccount, useReadContracts, useBalance } from "wagmi";
import { formatUnits } from "viem";

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

// ── LaunchSimCard ─────────────────────────────────────────────────────────────

function LaunchSimCard({ result }: { result: Record<string, unknown> }) {
  const verdict    = String(result.verdict ?? result.consensus ?? "");
  const score      = Number(result.score ?? result.launch_score ?? 0);
  const fdv        = String(result.projectedFDV ?? result.projected_fdv ?? result.fdv ?? "");
  const week1      = String(result.week1Return ?? result.week_1_return ?? "");
  const risks      = Array.isArray(result.risks) ? result.risks as string[] : [];
  const summary    = String(result.summary ?? "");
  const isPositive = score >= 60;
  const color      = isPositive ? "#A78BFA" : "#fb923c";
  return (
    <Card accentColor={color}>
      <CardHeader accentColor={color}>
        <span className="font-mono text-[11px] font-bold text-slate-300">🚀 Launch Simulator</span>
        <div className="flex items-center gap-2">
          {verdict && <span className="font-mono text-[10px] font-bold" style={{ color }}>{verdict}</span>}
          {score > 0 && <span className="font-mono text-[10px] text-slate-500">{score}/100</span>}
        </div>
      </CardHeader>
      <CardBody>
        {score > 0 && <ScoreBar score={score} color={color} />}
        <div className="grid grid-cols-2 gap-3">
          {fdv   && <div><p className="font-mono text-[9px] text-slate-600 uppercase">Projected FDV</p><p className="font-mono text-[12px] text-slate-200">{fdv}</p></div>}
          {week1 && <div><p className="font-mono text-[9px] text-slate-600 uppercase">Week 1 Return</p><p className="font-mono text-[12px]" style={{ color: week1.startsWith("+") ? "#4ade80" : "#f87171" }}>{week1}</p></div>}
        </div>
        {risks.length > 0 && <FlagList flags={risks} color="#fb923c" />}
        {summary && <p className="font-mono text-[11px] text-slate-400 leading-snug">{summary}</p>}
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
  tokenName?:   string;
  tokenSymbol?: string;
  description?: string;
  image?:       string;
  website?:     string;
}

type FeeType = "wallet" | "x" | "farcaster" | "ens";
const FEE_TYPES: { id: FeeType; label: string; placeholder: string }[] = [
  { id: "wallet",    label: "Wallet",    placeholder: "0x… (your address)" },
  { id: "x",         label: "X",         placeholder: "@username" },
  { id: "farcaster", label: "Farcaster", placeholder: "username" },
  { id: "ens",       label: "ENS",       placeholder: "name.eth" },
];

function TokenLaunchCard({ result }: { result: TokenLaunchResult }) {
  const { address, isConnected } = useAccount();
  const [step, setStep] = useState<"idle" | "simulating" | "launching" | "done" | "error">("idle");
  const [err,  setErr]  = useState<string>("");
  const [out,  setOut]  = useState<{ tokenAddress: string | null; basescan: string | null; uniswap: string | null; bankr: string | null; simulated: boolean } | null>(null);
  // Fee recipient — who gets the 57% creator share. Defaults to the connected
  // wallet; can route to an X / Farcaster / ENS handle (Bankr resolves it).
  const [feeType,  setFeeType]  = useState<FeeType>("wallet");
  const [feeValue, setFeeValue] = useState("");

  const name   = result.tokenName?.trim() ?? "";
  const symbol = (result.tokenSymbol ?? "").replace(/^\$/, "").trim();

  // wallet type defaults to the connected address when the field is left blank.
  const effectiveFee = feeType === "wallet" ? (feeValue.trim() || address || "") : feeValue.trim();

  // sim=true → Bankr predicts the address + fees without broadcasting (safe,
  // no irreversible deploy, lighter on the rate limit). sim=false → real deploy.
  async function run(sim: boolean) {
    if (!address) return;
    setStep(sim ? "simulating" : "launching"); setErr("");
    try {
      const res = await fetch("/api/launch-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenName: name, tokenSymbol: symbol,
          description: result.description,
          feeRecipientType: feeType, feeRecipientValue: effectiveFee,
          image: result.image, website: result.website, simulateOnly: sim,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d?.error ?? `Launch failed (${res.status})`); setStep("error"); return; }
      setOut({ tokenAddress: d.tokenAddress ?? null, basescan: d.basescan ?? null, uniswap: d.uniswap ?? null, bankr: d.bankr ?? null, simulated: !!d.simulated });
      setStep("done");
    } catch (e) {
      setErr((e as Error).message); setStep("error");
    }
  }

  if (step === "done" && out?.simulated) {
    // Simulation preview — not deployed. Offer the real deploy.
    return (
      <div className="mt-2 rounded-xl border p-3.5" style={{ borderColor: "#4FC3F740", background: "#4FC3F708" }}>
        <div className="font-mono text-[11px] font-bold mb-1" style={{ color: "#4FC3F7" }}>🧪 Simulation · ${symbol} (not deployed)</div>
        {out.tokenAddress && <div className="font-mono text-[10px] text-slate-400 mb-2 break-all">Predicted: {out.tokenAddress}</div>}
        <p className="font-mono text-[9px] text-slate-600 mb-2.5">Looks good — deploy for real to mint ${symbol} on Base.</p>
        <button onClick={() => run(false)}
          className="w-full font-mono text-[12px] font-bold py-2 rounded-lg transition-all"
          style={{ background: "#F59E0B15", color: "#F59E0B", border: "1px solid #F59E0B40" }}>
          🚀 Deploy ${symbol} for real
        </button>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="mt-2 rounded-xl border p-3.5" style={{ borderColor: "#22C55E40", background: "#22C55E08" }}>
        <div className="font-mono text-[11px] font-bold mb-1" style={{ color: "#22C55E" }}>🚀 ${symbol} launched on Base</div>
        {out?.tokenAddress && <div className="font-mono text-[10px] text-slate-400 mb-2 break-all">{out.tokenAddress}</div>}
        <div className="flex flex-wrap gap-2">
          {out?.bankr    && <a href={out.bankr}    target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] px-2.5 py-1 rounded-lg border border-[#4FC3F730] text-[#4FC3F7]">View on Bankr ↗</a>}
          {out?.basescan && <a href={out.basescan} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] px-2.5 py-1 rounded-lg border border-[#1A1A2E] text-slate-300 hover:text-white">Basescan ↗</a>}
          {out?.uniswap  && <a href={out.uniswap}  target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] px-2.5 py-1 rounded-lg border border-[#F59E0B30] text-[#F59E0B]">Trade on Uniswap ↗</a>}
        </div>
        <p className="font-mono text-[9px] text-slate-600 mt-2">Creator fees (57%) accrue to the fee recipient.</p>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-3.5">
      <div className="font-mono text-[10px] text-slate-500 tracking-widest font-bold mb-3">LAUNCH TOKEN · BASE</div>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center font-mono text-sm font-bold shrink-0"
             style={{ background: "#4FC3F715", border: "1px solid #4FC3F730", color: "#4FC3F7" }}>
          {symbol.slice(0, 2).toUpperCase() || "?"}
        </div>
        <div className="min-w-0">
          <div className="font-mono text-sm font-bold text-white truncate">{name || "Unnamed token"}</div>
          <div className="font-mono text-[11px] text-slate-500">${symbol || "—"}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3 font-mono text-[10px]">
        <div className="rounded-lg border border-[#1A1A2E] bg-[#0d0d12] px-2.5 py-1.5">
          <div className="text-slate-600 mb-0.5">SUPPLY</div><div className="text-slate-300">100B fixed</div>
        </div>
        <div className="rounded-lg border border-[#1A1A2E] bg-[#0d0d12] px-2.5 py-1.5">
          <div className="text-slate-600 mb-0.5">CREATOR FEE</div><div className="text-[#22C55E]">57% of swaps</div>
        </div>
      </div>
      {isConnected && address ? (
        <>
          {/* Fee recipient — who receives the 57% creator share */}
          <div className="mb-3">
            <div className="font-mono text-[9px] text-slate-600 mb-1.5">FEE RECIPIENT · 57% creator share</div>
            <div className="flex gap-1 mb-1.5">
              {FEE_TYPES.map(t => {
                const active = feeType === t.id;
                return (
                  <button key={t.id}
                    onClick={() => { setFeeType(t.id); setFeeValue(""); }}
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
              placeholder={feeType === "wallet" ? `${truncAddr(address)} (default)` : (FEE_TYPES.find(t => t.id === feeType)?.placeholder ?? "")}
              className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-slate-200 placeholder:text-slate-700 outline-none transition-colors"
            />
          </div>
          <p className="font-mono text-[9px] text-slate-600 mb-2 leading-relaxed">
            Fees → <span className="text-slate-400">{feeType === "wallet" ? (feeValue.trim() ? truncAddr(feeValue.trim()) : truncAddr(address)) : `${feeType}:${feeValue.trim() || "—"}`}</span>. This deploys a
            <span className="text-amber-400"> real, irreversible</span> token on Base via Bankr.
          </p>
          {step === "error" && <p className="font-mono text-[10px] text-amber-400 mb-2">{err}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => run(true)}
              disabled={step === "simulating" || step === "launching" || !name || !symbol}
              className="font-mono text-[12px] font-bold py-2 px-3 rounded-lg transition-all disabled:opacity-50 shrink-0"
              style={{ background: "#4FC3F712", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
              {step === "simulating" ? "Simulating…" : "🧪 Simulate"}
            </button>
            <button
              onClick={() => run(false)}
              disabled={step === "simulating" || step === "launching" || !name || !symbol}
              className="flex-1 font-mono text-[12px] font-bold py-2 rounded-lg transition-all disabled:opacity-50"
              style={{ background: "#F59E0B15", color: "#F59E0B", border: "1px solid #F59E0B40" }}>
              {step === "launching" ? "Launching…" : `🚀 Launch $${symbol || "TOKEN"}`}
            </button>
          </div>
          <p className="font-mono text-[9px] text-slate-700 mt-1.5">Simulate = preview address + fees, no deploy. Bankr allows 1 real launch/min per wallet.</p>
        </>
      ) : (
        <p className="font-mono text-[10px] text-slate-500">Connect a wallet to launch — creator fees route to it.</p>
      )}
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
    case "hub_launch_sim":    return <LaunchSimCard    result={r} />;
    case "show_portfolio":    return <PortfolioCard />;
    case "prepare_token_launch": return <TokenLaunchCard result={r as TokenLaunchResult} />;
    default:                  return <GenericCard      tool={tool} result={r} />;
  }
}
