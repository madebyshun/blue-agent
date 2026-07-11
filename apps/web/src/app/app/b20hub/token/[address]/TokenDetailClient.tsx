"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPublicClient, http, keccak256, encodeAbiParameters } from "viem";
import { base } from "wagmi/chains";
import { B20HUB_HOOK, B20HUB_BUYBACK, WETH9_BASE } from "@/lib/b20hub/constants";

const B20_FACTORY = "0xB20f000000000000000000000000000000000000" as const;
const POSITION_MANAGER = "0x7C5f5A4bBd8fD63184577525326123B519429bDc" as const;
const STATE_VIEW = "0xA3c0c9B65BAd0b08107Aa264b0f3dB444b867A71" as const;

const publicClient = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });

const HOOK_ABI = [
  {
    type: "function", name: "creatorOfPool", stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [{ name: "creator", type: "address" }],
  },
  {
    type: "function", name: "lpTokenIdOfPool", stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
] as const;
const ERC20_ABI = [
  { type: "function", name: "name",        stateMutability: "view", inputs: [], outputs: [{ type: "string"  }] },
  { type: "function", name: "symbol",      stateMutability: "view", inputs: [], outputs: [{ type: "string"  }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals",    stateMutability: "view", inputs: [], outputs: [{ type: "uint8"   }] },
] as const;
const B20_ABI = [
  { type: "function", name: "isB20", stateMutability: "view", inputs: [{ name: "addr", type: "address" }], outputs: [{ type: "bool" }] },
] as const;
const STATE_VIEW_ABI = [
  {
    type: "function", name: "getSlot0", stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "sqrtPriceX96",  type: "uint160" },
      { name: "tick",          type: "int24"   },
      { name: "protocolFee",   type: "uint24"  },
      { name: "lpFee",         type: "uint24"  },
    ],
  },
] as const;

function buildPoolKey(token: `0x${string}`, feeTier: number, tickSpacing: number) {
  const weth = WETH9_BASE.toLowerCase();
  const tok = token.toLowerCase();
  const wethIsSmaller = weth < tok;
  return {
    currency0:    (wethIsSmaller ? WETH9_BASE : token) as `0x${string}`,
    currency1:    (wethIsSmaller ? token : WETH9_BASE) as `0x${string}`,
    fee:          feeTier,
    tickSpacing:  tickSpacing,
    hooks:        B20HUB_HOOK as `0x${string}`,
  };
}
function computePoolId(key: ReturnType<typeof buildPoolKey>): `0x${string}` {
  const encoded = encodeAbiParameters(
    [{
      type: "tuple",
      components: [
        { name: "currency0",   type: "address" },
        { name: "currency1",   type: "address" },
        { name: "fee",         type: "uint24"  },
        { name: "tickSpacing", type: "int24"   },
        { name: "hooks",       type: "address" },
      ],
    }],
    [key],
  );
  return keccak256(encoded);
}

// Try 3 fee tiers to find which one this token uses.
const TIERS: Array<{ fee: number; spacing: number; label: string }> = [
  { fee: 3000,  spacing: 60,  label: "0.3%" },
  { fee: 10000, spacing: 200, label: "1%"   },
  { fee: 30000, spacing: 600, label: "3%"   },
];

interface Detail {
  isB20:        boolean;
  name:         string;
  symbol:       string;
  totalSupply:  bigint;
  decimals:     number;
  poolFound:    { poolId: `0x${string}`; feeTier: number; label: string } | null;
  creator:      `0x${string}` | null;
  lpTokenIdA:   bigint | null;
  slot0:        readonly [bigint, number, number, number] | null;
  market:       {
    priceUsd?:     number | null;
    marketCap?:    number | null;
    volume24h?:   number | null;
    liquidityUsd?: number | null;
    change24h?:   number | null;
  } | null;
}

export default function TokenDetailClient({ address }: { address: `0x${string}` }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error,  setError]  = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [isB20, name, symbol, totalSupply, decimals] = await Promise.all([
          publicClient.readContract({ address: B20_FACTORY, abi: B20_ABI, functionName: "isB20", args: [address] }),
          publicClient.readContract({ address, abi: ERC20_ABI, functionName: "name" }).catch(() => "?"),
          publicClient.readContract({ address, abi: ERC20_ABI, functionName: "symbol" }).catch(() => "?"),
          publicClient.readContract({ address, abi: ERC20_ABI, functionName: "totalSupply" }).catch(() => 0n),
          publicClient.readContract({ address, abi: ERC20_ABI, functionName: "decimals" }).catch(() => 18),
        ]);

        // Probe pools: find first fee tier whose poolId is bound in our hook.
        let poolFound: Detail["poolFound"] = null;
        let creator:   Detail["creator"]   = null;
        let lpTokenIdA: Detail["lpTokenIdA"] = null;
        let slot0:     Detail["slot0"]      = null;
        for (const t of TIERS) {
          const key = buildPoolKey(address, t.fee, t.spacing);
          const poolId = computePoolId(key);
          const c = await publicClient.readContract({
            address: B20HUB_HOOK as `0x${string}`,
            abi: HOOK_ABI,
            functionName: "creatorOfPool",
            args: [poolId],
          }).catch(() => "0x0000000000000000000000000000000000000000" as const);
          if (c !== "0x0000000000000000000000000000000000000000") {
            poolFound = { poolId, feeTier: t.fee, label: t.label };
            creator = c as `0x${string}`;
            lpTokenIdA = await publicClient.readContract({
              address: B20HUB_HOOK as `0x${string}`,
              abi: HOOK_ABI,
              functionName: "lpTokenIdOfPool",
              args: [poolId],
            }).catch(() => null) as bigint | null;
            slot0 = await publicClient.readContract({
              address: STATE_VIEW,
              abi: STATE_VIEW_ABI,
              functionName: "getSlot0",
              args: [poolId],
            }).catch(() => null) as Detail["slot0"];
            break;
          }
        }

        // Fetch market via DexScreener proxy through our existing endpoint.
        const marketRes = await fetch(`/api/b20hub/tokens`).then((r) => r.json()).catch(() => null);
        const market =
          (marketRes?.tokens ?? []).find(
            (t: { tokenAddress: string; market?: unknown }) =>
              t.tokenAddress.toLowerCase() === address.toLowerCase(),
          )?.market ?? null;

        if (!alive) return;
        setDetail({
          isB20:       Boolean(isB20),
          name:        String(name),
          symbol:      String(symbol),
          totalSupply: totalSupply as bigint,
          decimals:    Number(decimals),
          poolFound,
          creator,
          lpTokenIdA,
          slot0,
          market,
        });
      } catch (e) {
        if (alive) setError((e as Error).message || "Failed to load token");
      }
    })();
    return () => { alive = false; };
  }, [address]);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center">
        <p className="font-mono text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] py-16 text-center">
        <div className="inline-block w-2 h-2 rounded-full bg-[#4FC3F7] animate-pulse" />
        <p className="font-mono text-[10px] text-slate-600 mt-3">Loading token…</p>
      </div>
    );
  }

  if (!detail.isB20) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
        <p className="font-mono text-sm text-amber-400 mb-1">Not a B20 token</p>
        <p className="font-mono text-[11px] text-slate-500">
          <code className="text-slate-300">isB20({address.slice(0, 8)}…)</code>{" "}
          returned <span className="text-red-400">false</span> at the factory.
          Only real B20 tokens are indexed here.
        </p>
      </div>
    );
  }

  const supplyWhole = Number(detail.totalSupply) / Math.pow(10, detail.decimals);
  const sym = detail.symbol.replace(/^\$/, "");

  return (
    <div className="space-y-6">
      <HeaderCard sym={sym} name={detail.name} address={address} detail={detail} supplyWhole={supplyWhole} />

      <div className="grid md:grid-cols-2 gap-4">
        <MarketCard market={detail.market} />
        <PoolCard detail={detail} />
      </div>

      <ActionsCard address={address} detail={detail} />

      <ContractCard address={address} detail={detail} />
    </div>
  );
}

function HeaderCard({ sym, name, address, detail, supplyWhole }: {
  sym: string; name: string; address: string; detail: Detail; supplyWhole: number;
}) {
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5 flex items-start gap-4">
      <div className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold shrink-0"
        style={{ background: "#4FC3F715", border: "1px solid #4FC3F740", color: "#4FC3F7" }}>
        {sym.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3 flex-wrap mb-1">
          <h1 className="font-mono text-xl font-bold">{name || sym}</h1>
          <span className="font-mono text-sm text-slate-500">${sym}</span>
        </div>
        <div className="flex gap-2 mb-2">
          <Badge label="B20 Asset" color="#4FC3F7" />
          <Badge label="Base" color="#0052FF" />
          {detail.poolFound && <Badge label={`V4 · ${detail.poolFound.label}`} color="#FF007A" />}
          <Badge label="LP Locked" color="#22C55E" />
        </div>
        <p className="font-mono text-[10px] text-slate-600 break-all">{address}</p>
        <p className="font-mono text-[11px] text-slate-400 mt-2">
          Supply: <span className="text-slate-200">{supplyWhole.toLocaleString()}</span>
        </p>
      </div>
    </div>
  );
}

function MarketCard({ market }: { market: Detail["market"] }) {
  const changeColor = market?.change24h == null ? "#64748B" : market.change24h >= 0 ? "#22C55E" : "#EF4444";
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5">
      <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-3">
        Market (via DexScreener)
      </p>
      <div className="grid grid-cols-2 gap-4">
        <Stat label="PRICE"    value={market?.priceUsd == null ? "—" : "$" + market.priceUsd.toExponential(2)} />
        <Stat label="MCAP"     value={fmtUsd(market?.marketCap)} />
        <Stat label="24H VOL"  value={fmtUsd(market?.volume24h)} />
        <Stat label="24H %"    value={fmtPct(market?.change24h)} color={changeColor} />
        <Stat label="LIQ"      value={fmtUsd(market?.liquidityUsd)} />
      </div>
    </div>
  );
}

function PoolCard({ detail }: { detail: Detail }) {
  if (!detail.poolFound) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
        <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-3">
          Pool
        </p>
        <p className="font-mono text-xs text-amber-400 mb-1">Not a B20HUB pool</p>
        <p className="font-mono text-[10px] text-slate-500 leading-relaxed">
          The B20HUB hook doesn&apos;t track a pool for this token at any
          standard fee tier. This might be a plain-B20 launch (deployed
          via <code className="text-slate-300">/app/b20</code> without
          auto-pool) or launched under an earlier hook.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5">
      <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-3">
        B20HUB Pool
      </p>
      <div className="space-y-2 text-[11px] font-mono">
        <Row label="Fee tier"   value={detail.poolFound.label} />
        <Row label="Creator"    value={detail.creator ? detail.creator.slice(0, 8) + "…" + detail.creator.slice(-6) : "—"} />
        <Row label="Position A" value={detail.lpTokenIdA ? "#" + detail.lpTokenIdA.toString() : "—"} />
        <Row label="Current tick" value={detail.slot0 ? detail.slot0[1].toString() : "—"} />
        <Row label="LP status"  value="🔒 Locked in hook forever" color="#22C55E" />
      </div>
    </div>
  );
}

function ActionsCard({ address, detail }: { address: string; detail: Detail }) {
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5">
      <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-3">
        Actions
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href={`https://app.uniswap.org/swap?chain=base&outputCurrency=${address}`}
          target="_blank" rel="noopener noreferrer"
          className="font-mono text-xs font-bold px-4 py-2 rounded-lg"
          style={{ background: "#FF007A", color: "white" }}
        >
          🦄 Trade on Uniswap
        </a>
        {detail.poolFound && (
          <Link
            href={`/app/b20hub/claim`}
            className="font-mono text-xs font-bold px-4 py-2 rounded-lg"
            style={{ background: "#34D399", color: "#050508" }}
          >
            🔷 Claim Creator Fees
          </Link>
        )}
        <a
          href={`https://basescan.org/token/${address}`}
          target="_blank" rel="noopener noreferrer"
          className="font-mono text-xs px-4 py-2 rounded-lg border border-[#1A1A2E] text-slate-300"
        >
          Basescan ↗
        </a>
        <a
          href={`https://dexscreener.com/base/${address}`}
          target="_blank" rel="noopener noreferrer"
          className="font-mono text-xs px-4 py-2 rounded-lg border border-[#1A1A2E] text-slate-300"
        >
          DexScreener ↗
        </a>
      </div>
    </div>
  );
}

function ContractCard({ address, detail }: { address: string; detail: Detail }) {
  const rows = [
    { l: "Token",          v: address,                                  href: `https://basescan.org/address/${address}` },
    { l: "Creator",        v: detail.creator ?? "—",                    href: detail.creator ? `/app/b20hub/creator/${detail.creator}` : undefined, internal: true },
    { l: "Hook",           v: B20HUB_HOOK,                              href: `https://basescan.org/address/${B20HUB_HOOK}` },
    { l: "BuyBack",        v: B20HUB_BUYBACK,                           href: `https://basescan.org/address/${B20HUB_BUYBACK}` },
    { l: "PosMgr LP NFT",  v: detail.lpTokenIdA ? "#" + detail.lpTokenIdA.toString() : "—", href: detail.lpTokenIdA ? `https://basescan.org/token/${POSITION_MANAGER}?a=${detail.lpTokenIdA}` : undefined },
  ];
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5">
      <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-3">
        Onchain addresses
      </p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.l} className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] text-slate-500 tracking-wider uppercase">{r.l}</span>
            {r.href ? (
              r.internal ? (
                <Link href={r.href} className="font-mono text-[10px] text-[#4FC3F7] hover:underline break-all">
                  {r.v}
                </Link>
              ) : (
                <a href={r.href} target="_blank" rel="noopener noreferrer"
                  className="font-mono text-[10px] text-[#4FC3F7] hover:underline break-all">
                  {r.v} ↗
                </a>
              )
            ) : (
              <span className="font-mono text-[10px] text-slate-400 break-all">{r.v}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── utilities ────────────────────────────────────────────────────────────────
function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-bold" style={{ color: color ?? "#e2e8f0" }}>{value}</span>
    </div>
  );
}
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-1">{label}</div>
      <div className="font-mono text-sm font-bold tabular-nums" style={{ color: color ?? "#e2e8f0" }}>{value}</div>
    </div>
  );
}
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className="font-mono text-[9px] tracking-wider uppercase px-2 py-0.5 rounded"
      style={{ background: `${color}15`, color, border: `1px solid ${color}40` }}>
      {label}
    </span>
  );
}
function fmtUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1_000_000) return "$" + (v / 1_000_000).toFixed(2) + "M";
  if (v >= 1_000)     return "$" + (v / 1_000).toFixed(1) + "K";
  if (v >= 1)         return "$" + v.toFixed(2);
  if (v > 0)          return "$" + v.toExponential(2);
  return "$0";
}
function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}
