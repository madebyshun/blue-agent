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
  const coords = points.map((p, i) => `${(i * step).toFixed(2)},${(h - ((p - min) / range) * h).toFixed(2)}`);
  const line = "M" + coords.join(" L");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      <path d={area} fill={color} fillOpacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
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
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5 flex-1 flex flex-col min-h-0">
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

      {/* Selected token + chart */}
      <div className="rounded-lg border border-[#1A1A2E] bg-[#0d0d12] p-3 mb-3 shrink-0">
        <div className="flex items-start justify-between mb-1">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[12px] text-slate-200 font-bold">{t?.sym ?? "—"}</span>
              {t?.addr && <a href={`https://basescan.org/token/${t.addr}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[9px] text-slate-600 hover:text-[#4FC3F7]">contract ↗</a>}
            </div>
            <div className="font-mono text-[14px] text-white">{fmtPrice(t?.price)}</div>
          </div>
          <div className="font-mono text-[11px]" style={{ color: t?.change24h == null ? "#64748b" : up ? "#34D399" : "#EF4444" }}>
            {t?.change24h == null ? "—" : `${up ? "▲" : "▼"} ${Math.abs(t.change24h).toFixed(2)}% 24h`}
          </div>
        </div>
        <div style={{ height: 56 }}><Spark points={chart} color={lineColor} /></div>
      </div>

      {/* Token list (scrollable) */}
      <div className="flex-1 overflow-y-auto min-h-0 -mr-1 pr-1">
        {tokens.length ? tokens.map(tok => {
          const active = tok.sym === sel;
          const u = (tok.change24h ?? 0) >= 0;
          return (
            <button key={tok.sym} onClick={() => setSel(tok.sym)}
              className="w-full flex items-center justify-between py-1.5 px-2 rounded-md transition-colors"
              style={active ? { background: "#4FC3F710", border: "1px solid #4FC3F722" } : { border: "1px solid transparent" }}>
              <span className="font-mono text-[11px] text-slate-200">{tok.sym}</span>
              <span className="font-mono text-[11px] text-slate-300">
                {fmtPrice(tok.price)} <span style={{ color: tok.change24h == null ? "#64748b" : u ? "#34D399" : "#EF4444" }}>{tok.change24h == null ? "" : `${u ? "+" : ""}${tok.change24h.toFixed(1)}%`}</span>
              </span>
            </button>
          );
        }) : <div className="font-mono text-[10px] text-slate-600 px-2 py-2">loading tokens…</div>}
      </div>
    </div>
  );
}
