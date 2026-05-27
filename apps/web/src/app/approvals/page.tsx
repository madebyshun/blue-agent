"use client";

import { useState, useCallback } from "react";
import Navbar from "@/components/Navbar";

// Extend window for injected wallet providers
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type RiskLevel = "critical" | "high" | "medium" | "low" | "safe";

interface ApprovalItem {
  token:         string;
  tokenName:     string;
  tokenSymbol:   string;
  tokenDecimals: number;
  spender:       string;
  allowance:     string;
  isUnlimited:   boolean;
  isKnownSafe:   boolean;
  riskLevel:     RiskLevel;
  riskSummary:   string;
  indicators:    string[];
  txHash:        string;
}

interface ApprovalsResponse {
  wallet:      string;
  totalActive: number;
  critical:    number;
  high:        number;
  unlimited:   number;
  approvals:   ApprovalItem[];
  scannedAt:   string;
  blockRange:  { from: number; to: number };
  error?:      string;
}

interface RevokeState {
  [key: string]: "idle" | "pending" | "success" | "error";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortAddr(addr: string, chars = 6): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-4)}`;
}

function riskBadge(level: RiskLevel, isKnownSafe: boolean) {
  if (isKnownSafe) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-[#0D1F0D] text-[#4ADE80] border border-[#166534]">
      ✓ SAFE
    </span>
  );
  const map: Record<RiskLevel, { bg: string; text: string; border: string; label: string }> = {
    critical: { bg: "bg-[#1F0D0D]", text: "text-[#F87171]", border: "border-[#7F1D1D]", label: "🚨 CRITICAL" },
    high:     { bg: "bg-[#1F150D]", text: "text-[#FB923C]", border: "border-[#78350F]", label: "⚠️ HIGH"     },
    medium:   { bg: "bg-[#1A1A0D]", text: "text-[#FACC15]", border: "border-[#713F12]", label: "🟡 MEDIUM"   },
    low:      { bg: "bg-[#0D1420]", text: "text-[#60A5FA]", border: "border-[#1E3A5F]", label: "🔵 LOW"      },
    safe:     { bg: "bg-[#0D1F0D]", text: "text-[#4ADE80]", border: "border-[#166534]", label: "✓ SAFE"      },
  };
  const s = map[level] ?? map.low;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono ${s.bg} ${s.text} border ${s.border}`}>
      {s.label}
    </span>
  );
}

// ─── ABI encode approve(spender, 0) ──────────────────────────────────────────

function encodeRevoke(spender: string): string {
  // approve(address,uint256) = 0x095ea7b3
  const paddedSpender = spender.slice(2).padStart(64, "0").toLowerCase();
  const paddedValue   = "0".padStart(64, "0");
  return "0x095ea7b3" + paddedSpender + paddedValue;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const [walletInput, setWalletInput]   = useState("");
  const [loading, setLoading]           = useState(false);
  const [result, setResult]             = useState<ApprovalsResponse | null>(null);
  const [error, setError]               = useState("");
  const [revokeState, setRevokeState]   = useState<RevokeState>({});
  const [connectedWallet, setConnected] = useState<string | null>(null);
  const [filter, setFilter]             = useState<RiskLevel | "all">("all");

  // ── Connect wallet ──────────────────────────────────────────────────────────

  const connectWallet = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      setError("No wallet found. Install MetaMask or Coinbase Wallet.");
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
      if (accounts[0]) {
        setConnected(accounts[0]);
        setWalletInput(accounts[0]);
      }
    } catch {
      setError("Wallet connection rejected.");
    }
  }, []);

  // ── Scan ────────────────────────────────────────────────────────────────────

  const scan = useCallback(async () => {
    const wallet = walletInput.trim().toLowerCase();
    if (!/^0x[0-9a-f]{40}$/i.test(wallet)) {
      setError("Enter a valid wallet address (0x…)");
      return;
    }
    setError("");
    setLoading(true);
    setResult(null);
    setFilter("all");

    try {
      const res  = await fetch(`/api/sentinel/approvals?wallet=${wallet}`);
      const data = await res.json() as ApprovalsResponse;
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [walletInput]);

  // ── Revoke ──────────────────────────────────────────────────────────────────

  const revoke = useCallback(async (approval: ApprovalItem) => {
    if (typeof window === "undefined" || !window.ethereum) {
      setError("Connect a wallet to revoke approvals.");
      return;
    }

    const key = `${approval.token}:${approval.spender}`;
    setRevokeState(s => ({ ...s, [key]: "pending" }));

    try {
      // Ensure correct wallet
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
      const from = accounts[0];

      // Check we're on Base (chain ID 8453 = 0x2105)
      const chainId = await window.ethereum.request({ method: "eth_chainId" }) as string;
      if (chainId !== "0x2105") {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x2105" }],
        });
      }

      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{
          from,
          to:   approval.token,
          data: encodeRevoke(approval.spender),
        }],
      }) as string;

      // Poll until mined (max 30s)
      let mined = false;
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const receipt = await window.ethereum.request({
          method: "eth_getTransactionReceipt",
          params: [txHash],
        }) as { status: string } | null;
        if (receipt?.status === "0x1") { mined = true; break; }
      }

      setRevokeState(s => ({ ...s, [key]: mined ? "success" : "pending" }));

      if (mined && result) {
        // Remove from list
        setResult(r => r ? {
          ...r,
          approvals:   r.approvals.filter(a => !(a.token === approval.token && a.spender === approval.spender)),
          totalActive: r.totalActive - 1,
        } : r);
      }
    } catch (e) {
      console.error(e);
      setRevokeState(s => ({ ...s, [key]: "error" }));
    }
  }, [result]);

  // ── Filter ──────────────────────────────────────────────────────────────────

  const filtered = result?.approvals.filter(a =>
    filter === "all" ? true : a.riskLevel === filter
  ) ?? [];

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <>
      <Navbar />
      <div className="flex bg-[#050508] font-mono pt-16 text-[#C8C8D0]">
      <main className="flex-1 h-[calc(100vh-4rem)] overflow-y-auto">

      {/* ── Header ── */}
      <div className="pb-6 px-6 lg:px-10 pt-8 border-b border-[#1A1A2E]">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">🔐</span>
            <h1 className="text-xl font-bold text-white tracking-tight">Approval Tracker</h1>
            <span className="text-xs px-2 py-0.5 rounded bg-[#0A1628] text-[#60A5FA] border border-[#1E3A5F]">Base</span>
          </div>
          <p className="text-sm text-[#6B6B7E] ml-11">
            Scan all active ERC-20 approvals for a wallet · revoke unlimited approvals instantly
          </p>
      </div>

      <div className="px-6 lg:px-10 py-6 space-y-6">

        {/* ── Scan bar ── */}
        <div className="bg-[#0A0A14] border border-[#1A1A2E] rounded-lg p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={walletInput}
                onChange={e => setWalletInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && scan()}
                placeholder="0x… wallet address"
                className="w-full bg-[#050508] border border-[#1A1A2E] rounded px-3 py-2 text-sm text-white placeholder-[#3A3A4E] focus:outline-none focus:border-[#3B82F6] font-mono"
              />
              {connectedWallet && (
                <span className="absolute right-3 top-2.5 text-xs text-[#4ADE80]">● connected</span>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={connectWallet}
                className="px-3 py-2 text-sm border border-[#2A2A3E] text-[#A0A0B0] hover:text-white hover:border-[#3B82F6] rounded transition-colors"
              >
                {connectedWallet ? shortAddr(connectedWallet) : "Connect"}
              </button>
              <button
                onClick={scan}
                disabled={loading}
                className="px-5 py-2 text-sm bg-[#1E3A5F] hover:bg-[#2D5A8E] text-white rounded transition-colors disabled:opacity-50 disabled:cursor-wait flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="inline-block w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                    Scanning…
                  </>
                ) : "Scan"}
              </button>
            </div>
          </div>
          {error && (
            <p className="mt-2 text-xs text-[#F87171]">⚠ {error}</p>
          )}
        </div>

        {/* ── Loading skeleton ── */}
        {loading && (
          <div className="bg-[#0A0A14] border border-[#1A1A2E] rounded-lg p-8 text-center space-y-3">
            <div className="w-6 h-6 border border-[#3B82F6]/40 border-t-[#3B82F6] rounded-full animate-spin mx-auto" />
            <p className="text-sm text-[#6B6B7E]">Scanning Base for approval events…</p>
            <p className="text-xs text-[#3A3A4E]">Checking last ~1 month of blocks · this may take 10–20 seconds</p>
          </div>
        )}

        {/* ── Results ── */}
        {result && !loading && (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Active Approvals", value: result.totalActive, color: "text-white" },
                { label: "Critical",         value: result.critical,    color: "text-[#F87171]" },
                { label: "High Risk",        value: result.high,        color: "text-[#FB923C]" },
                { label: "Unlimited",        value: result.unlimited,   color: "text-[#FACC15]" },
              ].map(s => (
                <div key={s.label} className="bg-[#0A0A14] border border-[#1A1A2E] rounded-lg p-4 text-center">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-[#6B6B7E] mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Filter tabs */}
            {result.totalActive > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-[#6B6B7E]">Filter:</span>
                {(["all", "critical", "high", "medium", "low", "safe"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1 text-xs rounded border transition-colors ${
                      filter === f
                        ? "bg-[#1E3A5F] border-[#3B82F6] text-white"
                        : "border-[#1A1A2E] text-[#6B6B7E] hover:text-white hover:border-[#2A2A3E]"
                    }`}
                  >
                    {f === "all" ? `All (${result.totalActive})` : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            )}

            {/* Empty state */}
            {result.totalActive === 0 && (
              <div className="bg-[#0A0A14] border border-[#1A1A2E] rounded-lg p-10 text-center">
                <div className="text-4xl mb-3">✅</div>
                <p className="text-white font-semibold">No active approvals</p>
                <p className="text-sm text-[#6B6B7E] mt-1">This wallet has no outstanding ERC-20 approvals on Base.</p>
              </div>
            )}

            {/* Approval rows */}
            {filtered.length > 0 && (
              <div className="space-y-2">
                {filtered.map(a => {
                  const key    = `${a.token}:${a.spender}`;
                  const rs     = revokeState[key] ?? "idle";
                  const danger = a.riskLevel === "critical" || a.riskLevel === "high";

                  return (
                    <div
                      key={key}
                      className={`bg-[#0A0A14] border rounded-lg p-4 transition-colors ${
                        a.riskLevel === "critical" ? "border-[#7F1D1D]" :
                        a.riskLevel === "high"     ? "border-[#78350F]" :
                        "border-[#1A1A2E]"
                      }`}
                    >
                      {/* Top row */}
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Token badge */}
                          <div className="shrink-0 w-9 h-9 rounded-full bg-[#1A1A2E] flex items-center justify-center text-sm font-bold text-[#60A5FA]">
                            {a.tokenSymbol.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-white">{a.tokenSymbol}</span>
                              <span className="text-xs text-[#6B6B7E]">{a.tokenName}</span>
                            </div>
                            <div className="text-xs text-[#3A3A4E] mt-0.5 font-mono">
                              {shortAddr(a.token)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {riskBadge(a.riskLevel, a.isKnownSafe)}
                          {/* Revoke button */}
                          {rs === "success" ? (
                            <span className="text-xs text-[#4ADE80] font-mono">✓ Revoked</span>
                          ) : (
                            <button
                              onClick={() => revoke(a)}
                              disabled={rs === "pending" || a.isKnownSafe}
                              className={`px-3 py-1.5 text-xs rounded border transition-colors flex items-center gap-1.5 ${
                                a.isKnownSafe
                                  ? "border-[#1A1A2E] text-[#3A3A4E] cursor-default"
                                  : danger
                                    ? "border-[#7F1D1D] bg-[#1F0D0D] text-[#F87171] hover:bg-[#2D0F0F] disabled:opacity-50"
                                    : "border-[#2A2A3E] text-[#A0A0B0] hover:text-white hover:border-[#4B4B5E] disabled:opacity-50"
                              }`}
                            >
                              {rs === "pending" ? (
                                <>
                                  <span className="inline-block w-2.5 h-2.5 border border-current/40 border-t-current rounded-full animate-spin" />
                                  Revoking…
                                </>
                              ) : rs === "error" ? (
                                "⚠ Retry"
                              ) : a.isKnownSafe ? (
                                "Safe"
                              ) : (
                                "Revoke"
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Details row */}
                      <div className="mt-3 pt-3 border-t border-[#1A1A2E] grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        {/* Spender */}
                        <div>
                          <div className="text-[#6B6B7E] mb-1">Spender</div>
                          <a
                            href={`https://basescan.org/address/${a.spender}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#60A5FA] hover:underline font-mono"
                          >
                            {shortAddr(a.spender)}
                          </a>
                        </div>

                        {/* Allowance */}
                        <div>
                          <div className="text-[#6B6B7E] mb-1">Allowance</div>
                          <span className={`font-mono font-semibold ${
                            a.isUnlimited ? "text-[#FACC15]" : "text-white"
                          }`}>
                            {a.isUnlimited ? "∞ Unlimited" : a.allowance + " " + a.tokenSymbol}
                          </span>
                        </div>

                        {/* Tx */}
                        <div>
                          <div className="text-[#6B6B7E] mb-1">Approval Tx</div>
                          <a
                            href={`https://basescan.org/tx/${a.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#60A5FA] hover:underline font-mono"
                          >
                            {shortAddr(a.txHash, 8)}
                          </a>
                        </div>
                      </div>

                      {/* Risk summary + indicators */}
                      {(!a.isKnownSafe && a.riskSummary) && (
                        <div className="mt-2 text-xs text-[#6B6B7E]">
                          {a.riskSummary}
                        </div>
                      )}
                      {a.indicators.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {a.indicators.map(ind => (
                            <span key={ind} className="px-1.5 py-0.5 rounded bg-[#1A1A2E] text-[#6B6B7E] text-[10px] font-mono">
                              {ind.replace(/_/g, " ")}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Scan meta */}
            <div className="text-xs text-[#3A3A4E] flex flex-wrap gap-4">
              <span>Scanned: {new Date(result.scannedAt).toLocaleString()}</span>
              <span>Blocks: {result.blockRange.from.toLocaleString()} → {result.blockRange.to.toLocaleString()}</span>
              <a
                href={`https://basescan.org/address/${result.wallet}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#60A5FA] hover:underline"
              >
                View on Basescan ↗
              </a>
            </div>
          </>
        )}

        {/* ── Info section (no result yet) ── */}
        {!result && !loading && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                icon: "🔍",
                title: "Scan approvals",
                desc: "Finds every ERC-20 token approval your wallet has ever granted on Base, checks if they're still active.",
              },
              {
                icon: "⚠️",
                title: "Risk scoring",
                desc: "Each spender is analyzed for drainer patterns, bytecode fingerprints, and infinite approval traps.",
              },
              {
                icon: "🔒",
                title: "One-click revoke",
                desc: "Revoke unlimited approvals directly from your wallet. Calls approve(spender, 0) on the token contract.",
              },
            ].map(item => (
              <div key={item.title} className="bg-[#0A0A14] border border-[#1A1A2E] rounded-lg p-5">
                <div className="text-2xl mb-2">{item.icon}</div>
                <div className="font-semibold text-white text-sm mb-1">{item.title}</div>
                <div className="text-xs text-[#6B6B7E] leading-relaxed">{item.desc}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      </main>
      </div>
    </>
  );
}
