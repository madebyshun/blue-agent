"use client";
// Tool output cards — rendered inline after tool execution logs
// One card per tool type: honeypot, risk-gate, deep-analysis, token-pick, contract-trust

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

// ── Router — pick the right card for a tool ───────────────────────────────────

export function ToolResultCard({ tool, result }: { tool: string; result: Record<string, unknown> }) {
  if (!result || typeof result !== "object") return null;
  const r = result;

  switch (tool) {
    case "hub_honeypot":
      return <HoneypotCard result={r as HoneypotResult} />;
    case "hub_risk_gate":
      return <RiskGateCard result={r as RiskGateResult} />;
    case "hub_deep_analysis":
      return <DeepAnalysisCard result={r as DeepAnalysisResult} />;
    case "hub_token_pick":
      return <TokenPickCard result={r as TokenPickResult} />;
    case "hub_contract_trust":
    case "hub_whale_signal":  // contract-trust also applies here if used for addresses
      return <ContractTrustCard result={r as ContractTrustResult} />;
    default:
      return null;
  }
}
