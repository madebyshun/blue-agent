"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount, useSendTransaction, useSwitchChain } from "wagmi";
import { ConnectButton } from "@/components/ConnectModal";

/**
 * B20HUB launch UI — consolidated + minimal.
 *
 * Contract-level constants (nothing user-configurable here):
 *  - Supply:        100_000_000_000 × 10¹⁸ (100B tokens)
 *  - OpeningPrice:  OPENING_SQRT_PRICE_X96 constant (~$4K mcap @ $3K ETH)
 *  - Fee split:     80% creator / 15% BuyBack / 5% Treasury
 *  - LP:            permanently locked in hook
 *  - Admin:         renounced in the same tx
 *
 * User-picked knobs:
 *  - Token name
 *  - Token symbol
 *  - Fee tier (0.3% / 1% / 3%)
 */

type FeeTier = "MEDIUM" | "HIGH" | "3PCT";
const TIER_FEE: Record<FeeTier, number> = { MEDIUM: 3000, HIGH: 10000, "3PCT": 30000 };
const TIER_LABEL: Record<FeeTier, string> = { MEDIUM: "0.3%", HIGH: "1%", "3PCT": "3%" };
const TIER_HINT: Record<FeeTier, string> = {
  MEDIUM: "Balanced — real utility tokens, blue-chip attempts",
  HIGH:   "Memes — high-volume, wide spread absorbs volatility",
  "3PCT": "Niche — very illiquid or experimental launches",
};

const INPUT_CLS =
  "w-full bg-[#0a0a12] border border-[#1A1A2E] focus:border-[#4FC3F740] rounded-xl px-3 py-2.5 font-mono text-sm text-slate-200 placeholder:text-slate-700 outline-none transition-colors";

export default function LaunchClient() {
  const { address, isConnected } = useAccount();
  const { sendTransactionAsync }  = useSendTransaction();
  const { switchChainAsync }      = useSwitchChain();

  // Onchain (required — baked into deploy tx)
  const [name,       setName]       = useState("");
  const [symbol,     setSymbol]     = useState("");
  const [tier,       setTier]       = useState<FeeTier>("MEDIUM");

  // Off-chain metadata (optional — recorded to launch registry post-deploy
  // so /app/b20hub/token/[addr] and the feed can render them). NOT stored
  // in contract bytecode: users can update these later without a redeploy.
  const [image,       setImage]       = useState("");
  const [description, setDescription] = useState("");
  const [website,     setWebsite]     = useState("");
  const [twitter,     setTwitter]     = useState("");
  const [telegram,    setTelegram]    = useState("");
  const [farcaster,   setFarcaster]   = useState("");
  const [showMore,    setShowMore]    = useState(false);

  const [status,     setStatus]     = useState<"idle"|"preparing"|"signing"|"confirming"|"done"|"error">("idle");
  const [error,      setError]      = useState("");
  const [txHash,     setTxHash]     = useState("");
  const [tokenAddr,  setTokenAddr]  = useState("");

  const canLaunch = !!name.trim() && !!symbol.trim() && isConnected;

  async function launch() {
    if (!address || !canLaunch) return;
    setStatus("preparing"); setError(""); setTxHash(""); setTokenAddr("");
    try {
      const res = await fetch("/api/b20hub/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:        name.trim(),
          symbol:      symbol.trim().toUpperCase(),
          variant:     "asset",
          decimals:    18,
          totalSupply: "100000000000", // 100B — protocol constant
          feeTier:     TIER_FEE[tier],
          creator:     address,
          chain:       "base",
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json?.notDeployed) {
          throw new Error("B20HUB launcher is being redeployed — check back in a few minutes.");
        }
        throw new Error(json?.error || "Prepare failed");
      }

      // Switch to Base mainnet.
      try { await switchChainAsync({ chainId: 8453 }); }
      catch { throw new Error("Switch wallet to Base mainnet (chain 8453) and retry."); }

      setStatus("signing");
      const hash = await sendTransactionAsync({
        to:    json.tx.to as `0x${string}`,
        data:  json.tx.data as `0x${string}`,
        value: 0n,
        chainId: 8453,
      });
      setTxHash(hash);
      setStatus("confirming");

      // Poll receipt for token address.
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const rec = await fetch("/api/b20/receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tx_hash: hash, network: "mainnet" }),
        }).then((r) => r.json());
        if (rec.ok && rec.status === "success" && rec.tokenAddress) {
          setTokenAddr(rec.tokenAddress);
          // Best-effort: persist metadata + register in the launch feed.
          // Errors here don't break the flow — the token is already on-chain.
          fetch("/api/b20hub/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tokenAddress: rec.tokenAddress,
              tokenName:    name.trim(),
              tokenSymbol:  symbol.trim().toUpperCase(),
              image:        image.trim() || null,
              description:  description.trim() || null,
              website:      website.trim() || null,
              twitter:      twitter.trim() || null,
              telegram:     telegram.trim() || null,
              farcaster:    farcaster.trim() || null,
              creator:      address,
              txHash:       hash,
              feeTier:      TIER_FEE[tier],
            }),
          }).catch(() => {});
          setStatus("done");
          return;
        }
        if (rec.ok && rec.status === "reverted") throw new Error("Transaction reverted onchain");
      }
      // Timed out but tx is on chain — user can inspect.
      setStatus("done");
    } catch (e) {
      setError((e as Error).message || "Launch failed"); setStatus("error");
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-2">
        b20hub · launch
      </p>
      <h1 className="font-mono text-2xl md:text-3xl font-bold mb-3">
        Launch a B20 with an auto-pool.
      </h1>
      <p className="font-mono text-xs text-slate-500 leading-relaxed mb-6">
        Two fields. One signature. Every launch is 100B tokens at{" "}
        <span className="text-slate-300">~$4K opening market cap</span> — fixed at
        the contract level. See{" "}
        <Link href="/app/b20hub/docs" className="text-[#4FC3F7] hover:underline">
          how it works
        </Link>{" "}for the full breakdown.
      </p>

      {status === "done" && tokenAddr ? (
        <SuccessCard tokenAddr={tokenAddr} txHash={txHash} onLaunchAnother={() => {
          setStatus("idle"); setName(""); setSymbol(""); setTxHash(""); setTokenAddr("");
        }} />
      ) : (
        <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5 space-y-4">
          <div>
            <label className="font-mono text-[9px] text-slate-600 tracking-widest uppercase block mb-1.5">
              Token name *
            </label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="My Token" spellCheck={false} className={INPUT_CLS} />
          </div>

          <div>
            <label className="font-mono text-[9px] text-slate-600 tracking-widest uppercase block mb-1.5">
              Symbol *
            </label>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="MTK" spellCheck={false} className={INPUT_CLS} />
          </div>

          <div>
            <label className="font-mono text-[9px] text-slate-600 tracking-widest uppercase block mb-1.5">
              Fee tier
            </label>
            <div className="flex rounded-xl border border-[#1A1A2E] overflow-hidden mb-1.5">
              {(["MEDIUM", "HIGH", "3PCT"] as const).map((t, i) => (
                <button key={t} onClick={() => setTier(t)}
                  className="flex-1 py-2.5 font-mono text-xs transition-all"
                  style={tier === t
                    ? { background: "#4FC3F715", color: "#4FC3F7", borderRight: i < 2 ? "1px solid #1A1A2E" : undefined }
                    : { color: "#475569", borderRight: i < 2 ? "1px solid #1A1A2E" : undefined }}>
                  {TIER_LABEL[t]}
                </button>
              ))}
            </div>
            <p className="font-mono text-[9px] text-slate-600 leading-relaxed">
              {TIER_HINT[tier]}
            </p>
          </div>

          {/* Optional metadata — collapsed by default. These fields
              land in the launch registry, not on-chain. Creator can
              update later; nothing here is baked into contract bytecode.
              Match o1.exchange / pump.fun set: image, description, and
              4 social handles. Everything is opt-in. */}
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="w-full flex items-center justify-between text-left font-mono text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            <span className="tracking-widest uppercase">
              {showMore ? "▾" : "▸"} Optional metadata (image, description, socials)
            </span>
            <span className="text-[9px] text-slate-600">
              {showMore ? "hide" : "show"}
            </span>
          </button>
          {showMore && (
            <div className="space-y-3 pt-1">
              <MetaField label="Image / logo URL" placeholder="https://…/logo.png or ipfs://…"
                value={image} onChange={setImage} />
              <MetaField label="Description" placeholder="One line about your token"
                value={description} onChange={setDescription} textarea />
              <MetaField label="Website"   placeholder="https://mytoken.xyz"     value={website}   onChange={setWebsite} />
              <MetaField label="Twitter / X"  placeholder="@myhandle"           value={twitter}   onChange={setTwitter} />
              <MetaField label="Telegram" placeholder="t.me/mygroup"           value={telegram}  onChange={setTelegram} />
              <MetaField label="Farcaster" placeholder="@myhandle or fid"      value={farcaster} onChange={setFarcaster} />
              <p className="font-mono text-[9px] text-slate-600 leading-relaxed pt-1">
                Off-chain. Stored in the B20HUB registry so the feed +
                token page can render this. Editable later via a signed
                request from the creator wallet.
              </p>
            </div>
          )}

          {/* Read-only summary of contract-level constants. */}
          <ConstantsPanel />

          {!isConnected ? (
            <ConnectButton label="Connect Wallet to Launch" />
          ) : (
            <button onClick={launch}
              disabled={!canLaunch || status === "preparing" || status === "signing" || status === "confirming"}
              className="w-full font-mono text-sm font-bold py-3 rounded-xl transition-all disabled:opacity-40"
              style={{ background: "#34D399", color: "#050508" }}>
              {status === "preparing"  ? "Preparing tx…"
                : status === "signing"    ? "Confirm in wallet…"
                : status === "confirming" ? "Waiting for confirmation…"
                : `🚀 Launch $${symbol.trim().toUpperCase() || "TOKEN"} →`}
            </button>
          )}

          {(error || status === "error") && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3">
              <p className="font-mono text-xs text-red-400 break-words">{error}</p>
            </div>
          )}

          {txHash && status !== "done" && (
            <p className="font-mono text-[10px] text-slate-500 text-center break-all">
              tx: <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-[#4FC3F7] hover:underline">
                {txHash.slice(0, 16)}…{txHash.slice(-8)} ↗
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MetaField({
  label, placeholder, value, onChange, textarea,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
}) {
  return (
    <div>
      <label className="font-mono text-[9px] text-slate-600 tracking-widest uppercase block mb-1">
        {label}
      </label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          spellCheck={false}
          className={INPUT_CLS + " resize-none"}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          className={INPUT_CLS}
        />
      )}
    </div>
  );
}

function ConstantsPanel() {
  const rows = [
    { l: "Supply",           v: "100,000,000,000 tokens" },
    { l: "Opening mcap",     v: "~$4K @ $3K ETH" },
    { l: "Creator take",     v: "80% of every swap fee",  c: "#34D399" },
    { l: "$BLUE buyback",    v: "15% (auto flywheel)",    c: "#4FC3F7" },
    { l: "Treasury",         v: "5%" },
    { l: "LP",               v: "Locked forever" },
    { l: "Admin",            v: "Renounced at deploy" },
  ];
  return (
    <div className="rounded-xl border border-[#4FC3F7]/20 bg-[#4FC3F7]/[0.03] p-3 space-y-1.5">
      <p className="font-mono text-[9px] text-slate-500 tracking-widest uppercase mb-1">
        contract-level constants (not editable)
      </p>
      {rows.map(({ l, v, c }) => (
        <div key={l} className="flex items-center justify-between text-[10px] font-mono">
          <span className="text-slate-500">{l}</span>
          <span className="font-bold" style={{ color: c ?? "#e2e8f0" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function SuccessCard({
  tokenAddr,
  txHash,
  onLaunchAnother,
}: {
  tokenAddr: string;
  txHash: string;
  onLaunchAnother: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[#34D399]/40 bg-[#34D399]/5 p-6 text-center">
      <div className="text-4xl mb-3">🚀</div>
      <p className="font-mono text-lg font-bold text-[#34D399] mb-1">B20 Launched</p>
      <p className="font-mono text-[11px] text-slate-400 break-all mb-4">{tokenAddr}</p>

      <div className="flex flex-wrap gap-2 justify-center mb-4">
        <a href={`https://basescan.org/token/${tokenAddr}`}
          target="_blank" rel="noopener noreferrer"
          className="font-mono text-[11px] px-3 py-1.5 rounded-lg border border-[#1A1A2E] text-slate-300 hover:text-white transition-colors">
          Basescan ↗
        </a>
        <Link href={`/app/b20hub/token/${tokenAddr}`}
          className="font-mono text-[11px] px-3 py-1.5 rounded-lg border border-[#4FC3F740] text-[#4FC3F7]">
          Token page →
        </Link>
        <a href={`https://app.uniswap.org/swap?chain=base&outputCurrency=${tokenAddr}`}
          target="_blank" rel="noopener noreferrer"
          className="font-mono text-[11px] px-3 py-1.5 rounded-lg" style={{ background: "#FF007A15", color: "#FF007A", border: "1px solid #FF007A40" }}>
          Trade on Uniswap ↗
        </a>
      </div>

      {txHash && (
        <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
          className="font-mono text-[10px] text-slate-500 hover:text-slate-300 break-all block mb-4">
          Deploy tx: {txHash.slice(0, 16)}…{txHash.slice(-8)}
        </a>
      )}

      <button onClick={onLaunchAnother}
        className="font-mono text-xs text-[#4FC3F7] hover:underline">
        Launch another token
      </button>
    </div>
  );
}
