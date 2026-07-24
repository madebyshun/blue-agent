"use client";

/**
 * Blue Hood — Review & Sign panel (T-E, the Action layer).
 *
 * Opens over an arrow card. Fetches a live quote, lets the user pick
 * amount + slippage, then walks the user through the sign flow via
 * their connected wallet on Robinhood Chain (4663).
 *
 * NON-NEGOTIABLE RULES — enforced in this file:
 *   1. NON-CUSTODIAL — every signature comes from `useSendTransaction`
 *      on the user's connected wallet. Server never gets a private key.
 *   2. `recipient` = `useAccount().address` VERBATIM. There is NO
 *      env fallback, NO default, NO hardcode. `recipient` variable
 *      is set exactly ONCE, right here, from `address`. Grep for
 *      the string "RECIPIENT SET" to audit.
 *   3. NO auto-execute. Every tx requires a distinct user click on
 *      an explicit button. The panel autoquotes on open, but that's
 *      a READ operation — no wallet interaction happens until the
 *      user clicks "Sign approve" / "Sign swap".
 *   4. Warnings shown VERBATIM. `warnings.map(...)` — no filtering.
 *   5. Better to block than mis-sign. Every doubt → sign button
 *      disabled with a specific reason.
 *
 * Multi-hop scope (v1): the X2 endpoint can return a 4-call
 * multi-hop sequence when no direct pool exists at the picked denom.
 * v1 supports DIRECT route only (2 signs). If multi-hop comes back,
 * we show a clear message pointing the user at the other denom.
 * Multi-hop with balance-recalc between legs lands in v2.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useSwitchChain, useSendTransaction, useReadContract, usePublicClient, useBalance } from "wagmi";
import { erc20Abi, formatUnits, parseUnits } from "viem";
import Link from "next/link";
import type { Arrow, UserAction } from "@/lib/blue-hood/types";
import { ConnectButton } from "@/components/ConnectModal";

const RH_CHAIN_ID = 4663;
const RH_EXPLORER = "https://robinhoodchain.blockscout.com";
const HEAVY_IMPACT_PCT = 3;      // amber warning + require ack above this
const MIN_TVL_USD = 5_000;       // dust floor — same as engine
const QUOTE_STALE_MS = 60_000;   // 60s from last quote fetch

const RH_GREEN = "#00C805";
const AMBER = "#f5b342";
const RED = "#ef4444";
const MUTED = "#6b7280";
const BORDER = "#1A1A2E";
const SURFACE = "#0B0D13";

// ── Types shared with the API ─────────────────────────────────────────

interface QuoteResponse {
  ticker: string;
  side: "buy" | "sell";
  denom_in: "USDG" | "WETH";
  amount_in: number;
  amount_in_base_units: string;
  spot_usd: number | null;
  spot_source: "pool" | "chainlink" | null;
  pool_spot_usd: number | null;
  chainlink_spot_usd: number | null;
  pool_oracle_delta_pct: number | null;
  pool_deviates_from_oracle: boolean;
  expected_out: number | null;
  expected_after_impact: number | null;
  min_out: number | null;
  slippage_bps: number;
  trade_impact_pct: number;
  one_side_usd_used: number;
  warnings: string[];
  route: {
    kind: "direct" | "multi-hop" | null;
    /** Honest V3 executability. If false, the on-chain V3 factory has
     *  no pool for this pair — GT may show a V4 pool but our router
     *  can't touch it. Panel must disable Sign when this is false. */
    executable?: boolean;
    unavailable_reason?: string | null;
    note: string;
    direct_pool_gt: { address: string; tvl_usd: number } | null;
    direct_pool_on_chain_weth: { address: string } | null;
  };
  execution: {
    token_in: string;
    token_out: string;
    token_in_decimals: number;
    token_out_decimals: number;
    router: string;
    factory: string;
    deadline_unix: number;
  };
  timestamp: string;
}

interface PrepareResponse {
  ticker: string;
  side: "buy" | "sell";
  denom_in: "USDG" | "WETH";
  recipient: string;
  quote: QuoteResponse["route"] & Partial<QuoteResponse> & { min_out?: number | null; amount_in_base_units?: string; amount_out_minimum_base_units?: string };
  warnings: string[];
  route: { kind: "direct" | "multi-hop"; call_count: number };
  calls: Array<{
    kind: "approve" | "swap";
    to: string;
    data: string;
    value: string;
    leg?: number | null;
  }>;
  deadline_unix: number;
  notes: string[];
  network: string;
  timestamp: string;
}

// ── Component ─────────────────────────────────────────────────────────

export interface ReviewSignPanelProps {
  arrow: Arrow;
  /** Called when the panel closes (X button, backdrop click, done). */
  onClose: () => void;
  /** Called after a swap tx has been broadcast (before receipt). Lets
   *  the caller optimistically update its local arrow copy. Optional. */
  onActionPending?: (action: UserAction) => void;
}

type Phase =
  | { kind: "quoting" }
  | { kind: "quote_error"; msg: string }
  | { kind: "ready" }
  | { kind: "preparing" }
  | { kind: "prepare_error"; msg: string }
  | { kind: "review" }
  | { kind: "signing"; step: number; total: number; label: string }
  | { kind: "sign_error"; msg: string }
  | { kind: "done"; swap_hash: string; approve_hash: string | null };

export default function ReviewSignPanel({ arrow, onClose, onActionPending }: ReviewSignPanelProps) {
  const { address, isConnected, chain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const pubClient = usePublicClient({ chainId: RH_CHAIN_ID });

  // Derive `side` from the arrow's expected direction. LONG_DEX / drift-up /
  // arb-long-dex all mean "buy the token". SHORT_DEX / drift-down / arb-
  // short-dex all mean "sell". Arrows with `expected_direction === null`
  // (whale-informational) are read-only — we surface this state below.
  const defaultSide: "buy" | "sell" = arrow.expected_direction === "down" ? "sell" : "buy";

  const [amount, setAmount] = useState<string>("100");
  const [side, setSide] = useState<"buy" | "sell">(defaultSide);
  const [denom, setDenom] = useState<"USDG" | "WETH">("USDG");
  const [slippageBps, setSlippageBps] = useState<number>(100);
  const [ackImpact, setAckImpact] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "quoting" });
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [prepare, setPrepare] = useState<PrepareResponse | null>(null);
  const [quoteFetchedAt, setQuoteFetchedAt] = useState<number>(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Wallet balance (of the denom the user pays with) ────────────────
  const payToken: `0x${string}` | undefined =
    quote?.execution?.token_in && side === "buy"
      ? (quote.execution.token_in as `0x${string}`)
      : undefined;
  const payDecimals = quote?.execution?.token_in_decimals ?? 6;
  const { data: rawBalance } = useReadContract({
    address: payToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: RH_CHAIN_ID,
    query: { enabled: !!payToken && !!address, refetchInterval: 15_000 },
  });
  const walletBalance = useMemo(() => {
    if (typeof rawBalance !== "bigint") return null;
    return parseFloat(formatUnits(rawBalance, payDecimals));
  }, [rawBalance, payDecimals]);

  // Native ETH on Robinhood Chain — gas token. The raw viem/MetaMask
  // "insufficient funds for gas" dump is unreadable (screenshot 3+4),
  // and users have no visible signal that they might be under-funded
  // on gas. Show it inline so the panel is honest about pre-conditions.
  const { data: rhEthBalance } = useBalance({
    address,
    chainId: RH_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  // ── Quote fetcher (debounced on input change) ───────────────────────
  const fetchQuote = useCallback(async () => {
    setPhase({ kind: "quoting" });
    try {
      const res = await fetch("/api/hood/trade/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker: arrow.ticker, side, amount: Number(amount), denom, slippage_bps: slippageBps }),
      });
      const body = await res.json() as QuoteResponse | { error: string; detail?: string };
      if (!res.ok || "error" in body) {
        const detail = ("detail" in body ? body.detail : undefined) ?? ("error" in body ? body.error : "quote_failed");
        setPhase({ kind: "quote_error", msg: String(detail) });
        return;
      }
      setQuote(body);
      setQuoteFetchedAt(Date.now());
      setPhase({ kind: "ready" });
    } catch (e) {
      setPhase({ kind: "quote_error", msg: (e as Error).message });
    }
  }, [arrow.ticker, side, amount, denom, slippageBps]);

  // Initial + on-input debounce (500ms per spec)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void fetchQuote(); }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchQuote]);

  // ── Derived flags for the smart action button ───────────────────────
  const arrowIsOpen = arrow.status === "open";
  const arrowClosedDetail = !arrowIsOpen
    ? `this signal closed ${arrow.graded_at ? formatRelTime(arrow.graded_at) : "already"} — read-only`
    : null;
  const wrongChain = isConnected && chain?.id !== RH_CHAIN_ID;
  const marketClosedDrift = arrow.type === "drift" && arrow.market_at_fire && !arrow.market_at_fire.is_open;
  const quoteStale = !!quote && (Date.now() - quoteFetchedAt) > QUOTE_STALE_MS;
  const deadlineExpired = !!quote?.execution && quote.execution.deadline_unix * 1000 < Date.now();
  const poolTvl = quote?.route?.direct_pool_gt?.tvl_usd ?? quote?.one_side_usd_used ? (quote?.one_side_usd_used ?? 0) * 2 : 0;
  const poolTooThin = quote !== null && poolTvl > 0 && poolTvl < MIN_TVL_USD;
  const heavyImpact = (quote?.trade_impact_pct ?? 0) > HEAVY_IMPACT_PCT;
  const amountNum = Number(amount);
  const validAmount = Number.isFinite(amountNum) && amountNum > 0;
  const insufficient = walletBalance !== null && side === "buy" && validAmount && amountNum > walletBalance;
  const multiHop = quote?.route?.kind === "multi-hop";

  // Reset the impact ack when the impact-blocked state clears.
  useEffect(() => { if (!heavyImpact) setAckImpact(false); }, [heavyImpact]);

  // The smart action button state — computes what click does + why.
  const action = pickAction({
    phase, isConnected, wrongChain, arrowIsOpen, validAmount, insufficient,
    poolTooThin, heavyImpact, ackImpact, quoteStale, deadlineExpired, multiHop,
    quote, hasAddress: !!address,
  });

  // ── Sign flow ────────────────────────────────────────────────────────
  const signFlow = useCallback(async (prep: PrepareResponse) => {
    // RECIPIENT SET — the ONLY assignment of recipient in the file. Comes
    // from wagmi's `useAccount().address`. If we ever accept a recipient
    // from anywhere else, this comment MUST be updated so the grep audit
    // still catches it.
    if (!address) throw new Error("wallet not connected");
    if (prep.recipient.toLowerCase() !== address.toLowerCase()) {
      throw new Error(`recipient mismatch: prepare returned ${prep.recipient} but wallet is ${address}`);
    }
    // Direct route only in v1 (spec E3): approve → swap.
    if (prep.route.kind !== "direct" || prep.calls.length !== 2) {
      throw new Error(`unsupported_route: expected direct 2-call, got ${prep.route.kind} ${prep.calls.length}-call. Try the other denom.`);
    }
    const [approveCall, swapCall] = prep.calls;

    // Sign #1 — approve
    setPhase({ kind: "signing", step: 1, total: 2, label: "Sign approve in wallet…" });
    const approveHash = await sendTransactionAsync({
      to: approveCall.to as `0x${string}`,
      data: approveCall.data as `0x${string}`,
      value: BigInt(approveCall.value || "0x0"),
      chainId: RH_CHAIN_ID,
    });
    if (pubClient) {
      await pubClient.waitForTransactionReceipt({
        hash: approveHash, confirmations: 1, timeout: 90_000,
      });
    }

    // Sign #2 — swap
    setPhase({ kind: "signing", step: 2, total: 2, label: "Sign swap in wallet…" });
    const swapHash = await sendTransactionAsync({
      to: swapCall.to as `0x${string}`,
      data: swapCall.data as `0x${string}`,
      value: BigInt(swapCall.value || "0x0"),
      chainId: RH_CHAIN_ID,
    });

    // Record "pending" — server writes even before we wait for receipt so
    // the receipt shows up in the feed immediately.
    const pending: UserAction = {
      ts: new Date().toISOString(),
      wallet: address.toLowerCase(),
      tx_hash: swapHash.toLowerCase(),
      side, amount: amountNum, denom,
      min_out: quote?.min_out ?? null,
      status: "pending",
    };
    onActionPending?.(pending);
    void postUserAction(arrow.id, pending);

    // Wait + upgrade
    if (pubClient) {
      try {
        const receipt = await pubClient.waitForTransactionReceipt({
          hash: swapHash, confirmations: 1, timeout: 120_000,
        });
        const status: UserAction["status"] = receipt.status === "success" ? "success" : "reverted";
        void postUserAction(arrow.id, { ...pending, status });
      } catch (e) {
        console.warn("[review-sign] receipt wait crashed:", (e as Error).message);
      }
    }

    setPhase({ kind: "done", swap_hash: swapHash, approve_hash: approveHash });
  }, [address, arrow.id, sendTransactionAsync, pubClient, side, amountNum, denom, quote?.min_out, onActionPending]);

  const onSmartClick = useCallback(async () => {
    if (action.kind === "connect") return; // rendered as ConnectButton child
    if (action.kind === "switch") {
      try { await switchChainAsync({ chainId: RH_CHAIN_ID }); }
      catch (e) { console.warn("[review-sign] switch failed:", (e as Error).message); }
      return;
    }
    if (action.kind === "requote") { void fetchQuote(); return; }
    if (action.kind === "sign") {
      // Step 1 — prepare (build calldata with recipient = address)
      setPhase({ kind: "preparing" });
      try {
        if (!address) throw new Error("no_wallet");
        const res = await fetch("/api/hood/trade/prepare", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ticker: arrow.ticker, side, amount: amountNum, denom,
            slippage_bps: slippageBps, deadline_minutes: 5,
            recipient: address, // RECIPIENT SET — see note in signFlow
          }),
        });
        const body = await res.json() as PrepareResponse | { error: string; detail?: string };
        if (!res.ok || "error" in body) {
          const detail = ("detail" in body ? body.detail : undefined) ?? ("error" in body ? body.error : "prepare_failed");
          setPhase({ kind: "prepare_error", msg: String(detail) });
          return;
        }
        setPrepare(body);
        // Step 2 — sign (goes straight in; user already reviewed the
        // quote above. If we want a "review calls" pause step, we can
        // gate this behind a second confirm. For MVP: single confirm
        // above, then straight-through signing.)
        await signFlow(body);
      } catch (e) {
        const msg = (e as Error).message;
        setPhase({ kind: "sign_error", msg: humanizeSignError(msg) });
      }
    }
  }, [action.kind, switchChainAsync, fetchQuote, address, arrow.ticker, side, amountNum, denom, slippageBps, signFlow]);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div
      role="dialog"
      aria-label="Review & Sign"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 md:items-center hood-fade-in"
      onClick={onClose}
      style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
    >
      <div
        className="w-full max-w-lg rounded-lg border overflow-hidden hood-modal-in max-h-[90vh] overflow-y-auto hood-scroll"
        style={{ borderColor: BORDER, backgroundColor: SURFACE }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "#0f1218" }}>
          <span className="text-[11px]" style={{ color: RH_GREEN }}>{arrow.serial}</span>
          <span className="text-[14px] font-semibold text-white">{arrow.ticker}</span>
          <span className="text-[10px] uppercase" style={{ color: MUTED, letterSpacing: "0.08em" }}>
            {arrow.type} {arrow.expected_direction === "up" ? "↑" : arrow.expected_direction === "down" ? "↓" : ""}
          </span>
          <button
            onClick={onClose}
            className="ml-auto text-[16px] hover:text-white"
            style={{ color: MUTED }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Market-closed drift banner — informational, not blocking */}
        {marketClosedDrift && (
          <div
            className="mx-4 mt-3 rounded border px-3 py-2 text-[11px]"
            style={{ borderColor: "#3b2a15", backgroundColor: "#1a1408", color: "#f6c88f" }}
          >
            market closed — DEX may snap toward oracle at open; this is price
            discovery, not arbitrage.
          </div>
        )}

        {/* Read-only lock when arrow closed */}
        {!arrowIsOpen && (
          <div
            className="mx-4 mt-3 rounded border px-3 py-2 text-[11px]"
            style={{ borderColor: RED, backgroundColor: "#160b0b", color: "#f8b6b6" }}
          >
            {arrowClosedDetail}
          </div>
        )}

        {/* Inputs — amount + side + denom + slippage */}
        <div className="px-4 py-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[10px] uppercase" style={{ color: MUTED, letterSpacing: "0.08em" }}>side</label>
            <SideToggle value={side} onChange={setSide} disabled={!arrowIsOpen} />
            <label className="text-[10px] uppercase ml-3" style={{ color: MUTED, letterSpacing: "0.08em" }}>denom</label>
            <DenomToggle value={denom} onChange={setDenom} disabled={!arrowIsOpen} />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[10px] uppercase" style={{ color: MUTED, letterSpacing: "0.08em" }}>amount</label>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!arrowIsOpen}
              className="flex-1 rounded border px-2 py-1 text-[13px] bg-black/40 text-white tabular-nums"
              style={{ borderColor: BORDER }}
            />
            <span className="text-[11px]" style={{ color: MUTED }}>{denom}</span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[10px] uppercase" style={{ color: MUTED, letterSpacing: "0.08em" }}>slippage</label>
            {[50, 100, 300].map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setSlippageBps(b)}
                disabled={!arrowIsOpen}
                className="rounded border px-2 py-0.5 text-[11px]"
                style={{
                  borderColor: slippageBps === b ? RH_GREEN : BORDER,
                  color: slippageBps === b ? RH_GREEN : "#9aa1ac",
                  backgroundColor: slippageBps === b ? "rgba(0,200,5,0.10)" : "transparent",
                }}
              >
                {(b / 100).toFixed(1)}%
              </button>
            ))}
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={5000}
              value={slippageBps}
              onChange={(e) => setSlippageBps(Math.max(1, Math.min(5000, Math.trunc(Number(e.target.value) || 100))))}
              disabled={!arrowIsOpen}
              className="w-20 rounded border px-2 py-0.5 text-[11px] bg-black/40 text-white tabular-nums"
              style={{ borderColor: BORDER }}
            />
            <span className="text-[10px]" style={{ color: MUTED }}>bps</span>
          </div>

          {isConnected && (
            <div className="text-[10px] flex flex-wrap gap-x-4" style={{ color: MUTED }}>
              {walletBalance !== null && (
                <span>
                  balance: <span className="tabular-nums">{formatNum(walletBalance)}</span> {denom}
                  {insufficient && <span className="ml-2" style={{ color: RED }}>insufficient</span>}
                </span>
              )}
              {rhEthBalance && (() => {
                const eth = parseFloat(formatUnits(rhEthBalance.value, rhEthBalance.decimals));
                return (
                  <span>
                    gas: <span className="tabular-nums">{formatNum(eth)}</span> ETH
                    {eth < 0.01 && (
                      <span className="ml-2" style={{ color: RED }} title="Low RH ETH — swap will fail with insufficient funds for gas">
                        low
                      </span>
                    )}
                  </span>
                );
              })()}
            </div>
          )}
        </div>

        {/* Quote block */}
        <QuoteView phase={phase} quote={quote} denom={denom} onRequote={fetchQuote} />

        {/* Facts strip */}
        {arrow.snapshot_at_fire && <FactsAtFire snap={arrow.snapshot_at_fire} />}

        {/* Warnings (verbatim, per rule #4) */}
        {quote?.warnings && quote.warnings.length > 0 && (
          <div className="px-4 pb-3 space-y-1">
            {quote.warnings.map((w, i) => (
              <div key={i} className="text-[11px]" style={{ color: AMBER }}>⚠ {w}</div>
            ))}
          </div>
        )}
        {poolTooThin && (
          <div className="mx-4 mb-3 rounded border px-3 py-2 text-[11px]" style={{ borderColor: RED, color: "#f8b6b6", backgroundColor: "#160b0b" }}>
            pool too thin to trade safely (~${formatNum(poolTvl)} TVL) — engine's dust floor is ${MIN_TVL_USD.toLocaleString()}.
          </div>
        )}
        {multiHop && (
          <div className="mx-4 mb-3 rounded border px-3 py-2 text-[11px]" style={{ borderColor: AMBER, color: "#f6c88f", backgroundColor: "#1a1408" }}>
            no direct pool at this denom — X2 returned a multi-hop route.
            Multi-hop signing lands in v2. Try the other denom above for a
            direct route.
          </div>
        )}
        {heavyImpact && arrowIsOpen && !poolTooThin && (
          <div className="mx-4 mb-3">
            <label className="flex items-start gap-2 text-[11px] cursor-pointer" style={{ color: AMBER }}>
              <input
                type="checkbox"
                checked={ackImpact}
                onChange={(e) => setAckImpact(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                heavy trade — impact {(quote?.trade_impact_pct ?? 0).toFixed(2)}%.
                I understand this will move the pool and my realized fill
                will be worse than the mid-quote.
              </span>
            </label>
          </div>
        )}

        {/* Progress + result */}
        {phase.kind === "signing" && (
          <div className="mx-4 mb-3 rounded border px-3 py-2 text-[11px]" style={{ borderColor: BORDER, color: "#9aa1ac" }}>
            <span className="text-white">{phase.step}/{phase.total}</span> · {phase.label}
          </div>
        )}
        {phase.kind === "sign_error" && (
          <div className="mx-4 mb-3 rounded border px-3 py-2 text-[11px]" style={{ borderColor: RED, color: "#f8b6b6", backgroundColor: "#160b0b" }}>
            sign failed · {phase.msg}
          </div>
        )}
        {phase.kind === "prepare_error" && (
          <div className="mx-4 mb-3 rounded border px-3 py-2 text-[11px]" style={{ borderColor: RED, color: "#f8b6b6", backgroundColor: "#160b0b" }}>
            prepare failed · {phase.msg}
          </div>
        )}
        {phase.kind === "quote_error" && (
          <div className="mx-4 mb-3 rounded border px-3 py-2 text-[11px]" style={{ borderColor: RED, color: "#f8b6b6", backgroundColor: "#160b0b" }}>
            quote failed · {phase.msg}
          </div>
        )}
        {phase.kind === "done" && (
          <div className="mx-4 mb-3 rounded border px-3 py-3 text-[12px] space-y-1" style={{ borderColor: RH_GREEN, backgroundColor: "rgba(0,200,5,0.06)" }}>
            <div className="text-white">✓ swap signed & broadcast</div>
            {phase.approve_hash && (
              <div className="text-[11px]" style={{ color: MUTED }}>
                approve · <a href={`${RH_EXPLORER}/tx/${phase.approve_hash}`} target="_blank" rel="noreferrer" className="underline">{shorten(phase.approve_hash)}</a>
              </div>
            )}
            <div className="text-[11px]" style={{ color: MUTED }}>
              swap · <a href={`${RH_EXPLORER}/tx/${phase.swap_hash}`} target="_blank" rel="noreferrer" className="underline" style={{ color: RH_GREEN }}>
                {shorten(phase.swap_hash)}
              </a>
            </div>
          </div>
        )}

        {/* Action bar */}
        <div className="border-t px-4 py-3 flex items-center gap-3" style={{ borderColor: "#0f1218" }}>
          {action.kind === "connect" ? (
            // Author's original comment on onSmartClick said "rendered as
            // ConnectButton child" but the ConnectButton was never wired up
            // → the plain <button> below just rendered `disabled: true` and
            // clicking did nothing. Real bug found in preview 2026-07-23.
            // Use the shared <ConnectButton> so users get the wallet-picker
            // modal (Coinbase / MetaMask / injected / WalletConnect) —
            // same UI as everywhere else in the app for consistency.
            <div className="flex-1">
              <ConnectButton
                label="Connect wallet to trade"
                className="w-full rounded border px-4 py-2 text-[13px] font-semibold"
                style={{ borderColor: RH_GREEN, color: RH_GREEN, backgroundColor: "rgba(0,200,5,0.10)" }}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={onSmartClick}
              disabled={action.disabled || phase.kind === "signing" || phase.kind === "preparing"}
              className="flex-1 rounded border px-4 py-2 text-[13px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                borderColor: action.color,
                color: action.color,
                backgroundColor: action.color === RH_GREEN ? "rgba(0,200,5,0.10)" : "transparent",
              }}
              title={action.reason ?? undefined}
            >
              {phase.kind === "preparing" ? "preparing…" : action.label}
            </button>
          )}
          {action.reason && (
            <span className="text-[10px] max-w-[240px]" style={{ color: MUTED }} title={action.reason}>
              {action.reason}
            </span>
          )}
        </div>

        {/* Footer trust note */}
        <div className="px-4 py-2 border-t text-[9px] uppercase" style={{ borderColor: "#0f1218", color: MUTED, letterSpacing: "0.08em" }}>
          non-custodial · your wallet signs · <Link href="/hood/inbox" className="underline">/hood/inbox</Link>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function SideToggle({ value, onChange, disabled }: { value: "buy" | "sell"; onChange: (v: "buy" | "sell") => void; disabled?: boolean }) {
  return (
    <div className="inline-flex rounded border overflow-hidden" style={{ borderColor: BORDER }}>
      {(["buy", "sell"] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          disabled={disabled}
          className="px-2 py-0.5 text-[11px]"
          style={{
            color: value === s ? RH_GREEN : "#9aa1ac",
            backgroundColor: value === s ? "rgba(0,200,5,0.10)" : "transparent",
          }}
        >
          {s.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function DenomToggle({ value, onChange, disabled }: { value: "USDG" | "WETH"; onChange: (v: "USDG" | "WETH") => void; disabled?: boolean }) {
  return (
    <div className="inline-flex rounded border overflow-hidden" style={{ borderColor: BORDER }}>
      {(["USDG", "WETH"] as const).map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          disabled={disabled}
          className="px-2 py-0.5 text-[11px]"
          style={{
            color: value === d ? RH_GREEN : "#9aa1ac",
            backgroundColor: value === d ? "rgba(0,200,5,0.10)" : "transparent",
          }}
        >
          {d}
        </button>
      ))}
    </div>
  );
}

function QuoteView({ phase, quote, denom, onRequote }: { phase: Phase; quote: QuoteResponse | null; denom: string; onRequote: () => void }) {
  if (phase.kind === "quoting") {
    return <div className="px-4 pb-3 text-[11px]" style={{ color: MUTED }}>quoting…</div>;
  }
  if (!quote) return null;
  const rows: [string, string][] = [
    ["spot",             quote.spot_usd !== null ? `$${quote.spot_usd.toFixed(4)}` : "—"],
    ["expected out",     quote.expected_out !== null ? `${formatNum(quote.expected_out)}` : "—"],
    ["after impact",     quote.expected_after_impact !== null ? `${formatNum(quote.expected_after_impact)}` : "—"],
    ["min out",          quote.min_out !== null ? `${formatNum(quote.min_out)}` : "—"],
    ["trade impact",     `${quote.trade_impact_pct.toFixed(3)}%`],
    ["pool·oracle Δ",    quote.pool_oracle_delta_pct !== null ? `${quote.pool_oracle_delta_pct.toFixed(3)}%` : "—"],
    ["source",           quote.spot_source ?? "—"],
    ["route",            quote.route.kind ?? "—"],
  ];
  return (
    <div className="mx-4 mb-3 rounded border px-3 py-2 text-[11px] space-y-0.5" style={{ borderColor: BORDER, backgroundColor: "#0a0c11", color: "#9aa1ac" }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[9px] uppercase" style={{ color: MUTED, letterSpacing: "0.15em" }}>quote</span>
        <button type="button" onClick={onRequote} className="ml-auto text-[10px] underline" style={{ color: MUTED }}>
          re-quote
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 tabular-nums">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <span style={{ color: MUTED }}>{k}</span>
            <span className="text-white">{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 text-[9px]" style={{ color: MUTED }}>denom in: {denom}</div>
    </div>
  );
}

function FactsAtFire({ snap }: { snap: NonNullable<Arrow["snapshot_at_fire"]> }) {
  const pairs: [string, string][] = [
    ["dex@fire",    snap.dex_price_usd !== null ? `$${snap.dex_price_usd.toFixed(4)}` : "—"],
    ["oracle@fire", snap.oracle_price_usd !== null ? `$${snap.oracle_price_usd.toFixed(4)}` : "—"],
    ["tvl@fire",    snap.dex_tvl_usd !== null ? `$${formatNum(snap.dex_tvl_usd)}` : "—"],
    ["vol@fire",    snap.dex_volume_24h_usd !== null ? `$${formatNum(snap.dex_volume_24h_usd)}` : "—"],
  ];
  return (
    <div className="mx-4 mb-3 rounded border px-3 py-2 text-[10px] tabular-nums" style={{ borderColor: BORDER, backgroundColor: "#080a0e", color: "#9aa1ac" }}>
      <div className="text-[8px] uppercase mb-1" style={{ color: MUTED, letterSpacing: "0.15em" }}>facts at fire</div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {pairs.map(([k, v]) => (
          <span key={k}><span style={{ color: MUTED }}>{k}</span> {v}</span>
        ))}
      </div>
    </div>
  );
}

// ── Smart action button ───────────────────────────────────────────────

interface ActionState {
  kind: "connect" | "switch" | "requote" | "sign" | "noop";
  label: string;
  disabled: boolean;
  color: string;
  reason: string | null;
}

function pickAction(o: {
  phase: Phase;
  isConnected: boolean;
  wrongChain: boolean;
  hasAddress: boolean;
  arrowIsOpen: boolean;
  validAmount: boolean;
  insufficient: boolean;
  poolTooThin: boolean;
  heavyImpact: boolean;
  ackImpact: boolean;
  quoteStale: boolean;
  deadlineExpired: boolean | undefined;
  multiHop: boolean | undefined;
  quote: QuoteResponse | null;
}): ActionState {
  if (o.phase.kind === "done") {
    return { kind: "noop", label: "done", disabled: true, color: RH_GREEN, reason: null };
  }
  if (!o.arrowIsOpen) {
    return { kind: "noop", label: "signal closed · read-only", disabled: true, color: MUTED, reason: null };
  }
  if (!o.isConnected || !o.hasAddress) {
    return { kind: "connect", label: "Connect wallet to trade", disabled: true, color: MUTED, reason: "no wallet connected" };
  }
  if (o.wrongChain) {
    return { kind: "switch", label: "Switch to Robinhood Chain", disabled: false, color: AMBER, reason: `expected chain 4663` };
  }
  if (!o.validAmount) {
    return { kind: "noop", label: "Enter an amount", disabled: true, color: MUTED, reason: null };
  }
  if (o.insufficient) {
    return { kind: "noop", label: "Insufficient balance", disabled: true, color: RED, reason: "topup or lower the amount" };
  }
  if (!o.quote) {
    return { kind: "noop", label: "Waiting for quote…", disabled: true, color: MUTED, reason: null };
  }
  if (o.poolTooThin) {
    return { kind: "noop", label: "Pool too thin", disabled: true, color: RED, reason: `TVL below dust floor` };
  }
  // V3 executability — quote's honest "can prepare build calldata" flag.
  // Was silently absent before the SNDK bug fix: quote said "direct"
  // based on GT (which includes V4), user clicked Sign, prepare failed
  // with "no route". Now the panel disables Sign at quote time.
  if (o.quote.route.executable === false) {
    const reason = o.quote.route.unavailable_reason ?? "No V3 pool for this pair";
    return {
      kind: "noop",
      label: "Not executable · V3 router",
      disabled: true,
      color: AMBER,
      reason: `${reason}. V4 support: Task #75.`,
    };
  }
  if (o.multiHop) {
    return { kind: "noop", label: "Multi-hop not in v1", disabled: true, color: AMBER, reason: "try the other denom for a direct route" };
  }
  if (o.deadlineExpired || o.quoteStale) {
    return { kind: "requote", label: "Re-quote", disabled: false, color: AMBER, reason: "quote is stale — pull a fresh one" };
  }
  if (o.heavyImpact && !o.ackImpact) {
    return { kind: "noop", label: "Acknowledge heavy impact first", disabled: true, color: AMBER, reason: `tick the checkbox above` };
  }
  return { kind: "sign", label: "Review & Sign (2 txs)", disabled: false, color: RH_GREEN, reason: null };
}

// ── Utils ─────────────────────────────────────────────────────────────

async function postUserAction(arrowId: string, action: UserAction) {
  try {
    await fetch(`/api/hood/arrows/${arrowId}/user-action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action),
    });
  } catch (e) {
    console.warn("[review-sign] user-action post failed:", (e as Error).message);
  }
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

/**
 * Turn viem/MetaMask raw error dumps into one honest sentence. Before
 * this the error box showed hundreds of characters of viem stack + RPC
 * details that no user could parse (screenshots 3 + 4 on 2026-07-23).
 *
 * We look at KNOWN failure modes (rejected, out of gas ETH, deadline,
 * slippage, revert, chain switch refused) and pick a short human line.
 * If nothing matches we fall back to the first line of the raw message
 * — better than dumping the whole thing.
 */
function humanizeSignError(raw: string): string {
  const s = raw || "";
  const low = s.toLowerCase();

  if (/reject|denied|user\s+cancel/i.test(s)) {
    return "cancelled — you rejected the signature";
  }
  // The "insufficient funds for gas * price + value" case. Applies to
  // both the approve step and the swap step. Direct users to top up ETH
  // on Robinhood Chain — that's the actionable fix.
  if (low.includes("insufficient funds") || low.includes("exceeds the balance")) {
    return "not enough ETH on Robinhood Chain to pay gas — top up native ETH on RH before retrying";
  }
  if (low.includes("nonce too low") || low.includes("nonce is too low")) {
    return "wallet nonce mismatch — refresh the page and try again";
  }
  if (low.includes("chain") && low.includes("mismatch")) {
    return "wallet on the wrong chain — switch to Robinhood Chain (4663)";
  }
  if (low.includes("deadline") && low.includes("exceeded")) {
    return "swap deadline passed — hit re-quote to pull a fresh quote";
  }
  if (low.includes("execution reverted")) {
    // Pool likely moved / allowance wrong. Callers should re-quote and
    // widen slippage. Skip the raw revert reason — it's usually opaque.
    return "on-chain transaction reverted — pool state changed, widen slippage or re-quote";
  }
  if (low.includes("gas required exceeds allowance")) {
    return "wallet blocked the gas estimate — top up native ETH on RH";
  }
  // Fall back to the first line only.
  const first = s.split(/\n|Details:|Request Arguments:|Version:/)[0]?.trim() ?? "sign failed";
  return first.length > 200 ? first.slice(0, 200) + "…" : first;
}
function shorten(h: string): string { return `${h.slice(0, 6)}…${h.slice(-4)}`; }
function formatRelTime(iso: string): string {
  const sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
// Silence unused-import warnings — parseUnits reserved for future
// balance-decimal parsing; keep it in scope so a follow-up doesn't
// need to re-thread the import.
void parseUnits;
