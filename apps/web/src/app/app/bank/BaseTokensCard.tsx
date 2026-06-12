"use client";

// BASE MARKET card — selectable list of top Base tokens with a live price chart
// for the picked token. Real data: /api/base-tokens (DexScreener) +
// /api/token-ohlcv (GeckoTerminal). Fills the fixed-height left column.

import { useState, useEffect } from "react";

type Tok = { sym: string; addr: string; price: number | null; change24h: number | null; vol24h: number | null; pool: string | null };

const fmtPrice = (n: number | null | undefined) =>
  n == null ? "—"
  : n >= 1 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
  : `$${n.toFixed(n < 1e-4 ? 10 : 6).replace(/0+$/, "").replace(/\.$/, "")}`;

function Spark({ points, color }: { points: number[]; color: string }) {
  if (!points || points.length < 2) return <div className="font-mono text-[9px] text-slate-700">no chart</div>;
  const w = 100, h = 48;
  const min = Math.min(...points), max = Math.max(...points), range = max - min || 1;
  const step = w / (points.length - 1);
  const xy = points.map((p, i) => [i * step, h - ((p - min) / range) * h] as const);
  const coords = xy.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`);
  const line = "M" + coords.join(" L");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const gid = `spark-${color.replace("#", "")}`;
  // Re-key on points so the draw-in animation replays when the token changes.
  const k = points.length + ":" + color;
  return (
    <svg key={k} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%", overflow: "visible" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <filter id={`${gid}-glow`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path className="bank-draw" d={line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" pathLength={1} filter={`url(#${gid}-glow)`} />
    </svg>
  );
}

export default function BaseTokensCard() {
  const [tokens, setTokens] = useState<Tok[]>([]);
  const [sel, setSel] = useState<string>("");
  const [chart, setChart] = useState<number[]>([]);

  useEffect(() => {
    let off = false;
    fetch("/api/base-tokens").then(r => r.json()).then(j => {
      if (off) return;
      setTokens(j.tokens ?? []);
      if (j.tokens?.[0]) setSel(j.tokens[0].sym);
    }).catch(() => {});
    return () => { off = true; };
  }, []);

  const t = tokens.find(x => x.sym === sel);
  useEffect(() => {
    if (!t?.pool) { setChart([]); return; }
    let off = false;
    fetch(`/api/token-ohlcv?pool=${t.pool}`).then(r => r.json()).then(j => { if (!off) setChart(j.points ?? []); }).catch(() => { if (!off) setChart([]); });
    return () => { off = true; };
  }, [t?.pool]);

  // Scan any Base token by contract address → look up + add to the list + select.
  const [query, setQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState("");
  async function scan() {
    const addr = query.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) { setScanErr("Enter a 0x token contract"); return; }
    setScanning(true); setScanErr("");
    try {
      const j = await fetch(`/api/token-lookup?addr=${addr}`).then(r => r.json());
      if (!j.token) { setScanErr(j.error || "token not found on Base"); return; }
      const tok: Tok = j.token;
      setTokens(prev => [tok, ...prev.filter(x => x.addr.toLowerCase() !== tok.addr.toLowerCase())]);
      setSel(tok.sym);
      setQuery("");
    } catch { setScanErr("lookup failed"); }
    finally { setScanning(false); }
  }

  const up = (t?.change24h ?? 0) >= 0;
  const lineColor = up ? "#34D399" : "#EF4444";

  return (
    <div className="card-hover rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5 h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[10px] text-slate-500 tracking-widest">BASE MARKET</span>
        <span className="font-mono text-[9px] text-slate-700">live · built by Coinbase</span>
      </div>

      {/* Scan any token by contract address */}
      <div className="mb-3 shrink-0">
        <div className="flex gap-1.5">
          <input value={query} onChange={e => { setQuery(e.target.value); setScanErr(""); }}
            onKeyDown={e => { if (e.key === "Enter") scan(); }}
            placeholder="Scan a token contract 0x…"
            className="flex-1 bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-lg px-2.5 py-1.5 font-mono text-[10px] text-slate-200 placeholder:text-slate-700 outline-none" />
          <button onClick={scan} disabled={scanning}
            className="font-mono text-[10px] px-2.5 py-1.5 rounded-lg disabled:opacity-50" style={{ background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
            {scanning ? "…" : "Scan"}
          </button>
        </div>
        {scanErr && <div className="font-mono text-[9px] text-red-500 mt-1">{scanErr}</div>}
      </div>

      {/* Quick-pick chips */}
      <div className="flex flex-wrap gap-1.5 mb-3 shrink-0">
        {tokens.slice(0, 8).map(tok => (
          <button key={tok.sym} onClick={() => setSel(tok.sym)}
            className="font-mono text-[10px] px-2 py-1 rounded-md transition-colors"
            style={tok.sym === sel
              ? { background: "#4FC3F712", color: "#4FC3F7", border: "1px solid #4FC3F730" }
              : { color: "#94a3b8", border: "1px solid #1A1A2E" }}>
            {tok.sym}
          </button>
        ))}
      </div>

      {/* Selected token header */}
      <div className="flex items-start justify-between mb-2 shrink-0">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[14px] text-slate-100 font-bold">{t?.sym ?? "—"}</span>
            {t?.addr && <a href={`https://basescan.org/token/${t.addr}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[9px] text-slate-600 hover:text-[#4FC3F7]">contract ↗</a>}
          </div>
          <div className="font-mono text-[18px] text-white font-bold">{fmtPrice(t?.price)}</div>
        </div>
        <div className="font-mono text-[12px]" style={{ color: t?.change24h == null ? "#64748b" : up ? "#34D399" : "#EF4444" }}>
          {t?.change24h == null ? "—" : `${up ? "▲" : "▼"} ${Math.abs(t.change24h).toFixed(2)}% 24h`}
        </div>
      </div>

      {/* Big price chart fills the remaining space */}
      <div className="flex-1 min-h-0">
        <Spark points={chart} color={lineColor} />
      </div>
    </div>
  );
}
