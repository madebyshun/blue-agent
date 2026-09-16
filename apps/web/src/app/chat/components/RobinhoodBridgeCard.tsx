"use client";
// Chat card for the `robinhood_bridge` tool. Bridges an ERC-20 (or native ETH)
// between Base (chainId 8453) and Robinhood Chain (chainId 4663) using Relay
// Protocol as the underlying router. Non-custodial:
//   1. POST /api/robinhood/router/bridge-prepare → { tx, approve?, meta }
//   2. If approve is present, the user signs it on the source chain first.
//   3. The user signs the primary deposit tx on the source chain.
//   4. Relay solvers fill the destination chain — we surface the tracker link.
// The server never signs, never holds keys, never touches the funds.

import { useEffect, useState } from "react";
import {
  useAccount, useSwitchChain, useSendTransaction, useChainId,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits } from "viem";
import { ConnectButton } from "@/components/ConnectModal";
import { TokenGlyph, ChainDot, ConfirmPreview, resolveQuantity } from "./ConfirmCardParts";
import { UnverifiedBalance } from "@/components/wallet/UnverifiedBalance";
import { useSpendableBalance } from "@/lib/wallet/useSpendableBalance";
import { resolveSpend } from "@/lib/wallet/read-state";

// Chain metadata — hard-coded rather than reused from viem, so this card has
// no cross-file coupling to the wagmi config. Base blue vs Robinhood green
// matches the accents used elsewhere in the chat (RobinhoodSend/SwapCard).
const CHAINS = {
  base: {
    id:       8453,
    label:    "Base",
    accent:   "#0052FF",
    explorer: "https://basescan.org",
  },
  robinhood: {
    id:       4663,
    label:    "Robinhood",
    accent:   "#34D399",
    explorer: "https://robinhoodchain.blockscout.com",
  },
} as const;
type ChainKey = keyof typeof CHAINS;

// The local balanceOf ABI that used to live here is gone with the hand-rolled
// balance read it served — see useSpendableBalance, which reads `decimals`
// alongside `balanceOf` from the shared ERC20_ABI. "Matches the shape
// RobinhoodSendCard uses" was the old comment, and matching a shape is exactly
// how three cards came to share one bug.

/** Marker shape the /api/chat handler emits for `robinhood_bridge`. */
export interface RobinhoodBridgeResult {
  kind:         "robinhood_bridge";
  fromChain?:   "base" | "robinhood";
  toChain?:     "base" | "robinhood";
  fromAddress?: string;
  recipient?:   string;
  /** ERC-20 contract 0x… on `fromChain`, or "ETH" / "NATIVE" for native ETH. */
  token?:       string;
  /** Human-readable amount (decimal string) in whole units. */
  amount?:      string | number;
  /** Optional display hint from the LLM. Server verifies via the token contract. */
  tokenSymbol?: string;
  /** Server-side error to display inline (e.g. bad input, unresolved token). */
  error?:       string;
}

// Shape the /api/robinhood/router/bridge-prepare route returns on success.
type PrepareResponse = {
  ok?:    boolean;
  error?: { code: string; message: string };
  tx?:      { to: `0x${string}`; data: `0x${string}`; value: string; chainId: number };
  approve?: { to: `0x${string}`; data: `0x${string}`; value: string; chainId: number };
  meta?: {
    fromChain:  "base" | "robinhood";
    toChain:    "base" | "robinhood";
    token:      { address: `0x${string}`; symbol: string; decimals: number };
    /**
     * What LANDS. A separate token from `token`, because on the pair people use
     * most they genuinely differ: send USDC from Base, receive USDG on
     * Robinhood. Every destination-side figure and label on this card reads from
     * HERE. Reusing `token` on the right-hand side — which this card did — put
     * the input's symbol on the output's number, so the card said "USDC on
     * Robinhood" for a token that does not exist on Robinhood.
     */
    tokenOut:   { address: `0x${string}`; symbol: string; decimals: number };
    /** TRUE when the delivered token is not the one sent. Must be said out loud. */
    assetChanged: boolean;
    /** One sentence from the server, safe to render verbatim. "" when unchanged. */
    assetNote:    string;
    amountIn:   string;
    amountOut:  string;
    /** Guaranteed floor in base units of `tokenOut`, or null if Relay omitted it. */
    amountOutMin: string | null;
    /** Total cost of the trip per Relay, both sides priced. Null = unknown. */
    totalCostUsd:     number | null;
    totalCostPercent: number | null;
    estFillSeconds: number;
    trackerUrl: string;
    requestId:  string;
    recipient:  `0x${string}`;
    relayerFeeUsd?: string;
    relayerFeeFormatted?: string;
  };
};

function shortAddr(a: string): string {
  return a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/**
 * Format a server-supplied amount for display. `decimals` is nullable and the
 * null case is the point: a long all-digits string is BASE UNITS, and base
 * units without a scale are not a quantity. The old signature took a plain
 * `number` and the caller supplied `?? 18`, so an absent scale silently became
 * eighteen — the same substitution that made 1,000 USDG read as a millionth of
 * a cent elsewhere in this file. Unknown scale now renders "" rather than a
 * confident wrong number, and never the raw integer.
 */
function fmtAmount(raw: string | number | undefined, decimals: number | null): string {
  if (raw == null || raw === "") return "";
  const asStr = String(raw);
  if (/^\d+$/.test(asStr) && asStr.length > 6) {
    if (decimals == null) return "";
    try {
      const n = Number(formatUnits(BigInt(asStr), decimals));
      if (Number.isFinite(n)) return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
    } catch { /* unscalable — fall to "" below, never print base units */ }
    return "";
  }
  const n = typeof raw === "number" ? raw : parseFloat(asStr);
  if (!Number.isFinite(n)) return String(raw);
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function RobinhoodBridgeCard({ result }: { result: RobinhoodBridgeResult }) {
  const { address: connected, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const walletChainId = useChainId();

  // Direction comes from the LLM marker and is display-only (#107). The bridge
  // is only Base↔RH, so `toChain` is simply the opposite of `fromChain` — this
  // also removes the old same-chain edge case. If the LLM picked the wrong
  // direction the user re-chats; no in-card toggle = no drift (Issue 1).
  const fromChain: ChainKey = result.fromChain === "robinhood" ? "robinhood" : "base";
  const toChain: ChainKey   = fromChain === "base" ? "robinhood" : "base";

  const fromCfg = CHAINS[fromChain];
  const toCfg   = CHAINS[toChain];

  const fromAddress = (result.fromAddress || connected || "") as `0x${string}` | "";
  const recipient   = (result.recipient   || "")           as `0x${string}` | "";
  const rawToken    = (result.token       || "").trim();
  const isNative    = /^(eth|native)$/i.test(rawToken);
  const tokenSymHint = (result.tokenSymbol || "").replace(/^\$/, "");
  const initialAmt   = result.amount != null ? String(result.amount) : "";

  const [prep, setPrep]   = useState<PrepareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [prepErr, setPrepErr] = useState("");
  // States walked in sequence — the button reflects whichever is active.
  const [step, setStep] = useState<
    "idle" | "switching" | "approving" | "sending" | "delivering" | "filled" | "error"
  >("idle");
  const [err, setErr]         = useState("");
  const [approveHash, setApproveHash] = useState<`0x${string}` | "">("");
  const [txHash, setTxHash]           = useState<`0x${string}` | "">("");

  // Balance for the sender on the SOURCE chain — used to gate the signature.
  // ERC-20 for a token address, native for ETH; the chain is `fromCfg.id`,
  // which is Base OR Robinhood depending on direction, so the read is
  // explicitly chain-scoped (CLAUDE.md rule 1 — the two share no state).
  //
  // Deleted here:
  //
  //     const decimals = prep?.meta?.token.decimals ?? 18;
  //
  // which reads like deference to the server and is not. `prep` only exists
  // after the prepare fetch; the prepare fetch is gated on `amount`; and for a
  // quantity word `amount` is resolved FROM this balance, which needs decimals.
  // The dependency is circular, so `18` was not a fallback — it was the value,
  // every time, including for USDG's 6.
  const bal = useSpendableBalance({
    holder:  fromAddress,
    native:  isNative,
    token:   isNative ? undefined : rawToken,
    chainId: fromCfg.id,
  });
  const symbol  = (prep?.meta?.token.symbol || tokenSymHint || (isNative ? "ETH" : "TOKEN")).replace(/^\$/, "");
  const balance = bal.balance;

  // The amount may be a quantity word ("all"/"max"/"half"/"N%") — resolve it
  // against the SOURCE-chain balance we just read (#137/#138). Native ETH keeps
  // a small gas reserve; ERC-20 uses the full balance (gas paid in ETH apart).
  // While a word is still resolving (balance loading) `amount` is "" and the
  // prepare effect WAITS instead of round-tripping Relay with a bad value.
  const q = resolveQuantity(initialAmt, balance, { isNative });
  // Non-symbolic → the LLM's exact string (bridge-prepare's amount regex rejects
  // an exponential re-format like "1e-7", so never round-trip a plain number).
  const amount = q.symbolic ? (q.value != null ? String(q.value) : "") : initialAmt;
  // Display label for the amount-in — a plain decimal, NOT routed through
  // fmtAmount() (whose base-units heuristic would misread a large whole number).
  const amtLabel = q.value != null && q.value > 0
    ? q.value.toLocaleString("en-US", { maximumFractionDigits: 6 })
    : (q.symbolic ? "…" : "0.0");
  // THREE outcomes, not two. The old guard was
  //     balance != null && q.value != null && q.value > balance
  // which is false when the read FAILED — fail-open, so an unreadable balance
  // enabled the button and sent the user to pay gas on the source chain for a
  // bridge that cannot settle.
  const gate = resolveSpend({
    loading:  bal.loading,
    received: bal.received,
    failed:   bal.failed,
    over:     balance != null && q.value != null && q.value > balance,
  });
  const overBalance = gate === "insufficient";

  // Watch the primary tx until the SOURCE-chain RPC returns a receipt — that's
  // the point where the funds are handed off to the Relay solvers and the
  // "delivering" state begins on the destination chain.
  const { isSuccess: sentMined, isError: sentMinedErr } = useWaitForTransactionReceipt({
    hash:    txHash || undefined,
    chainId: fromCfg.id,
    query:   { enabled: !!txHash },
  });
  useEffect(() => {
    if (sentMined && step === "sending") setStep("delivering");
    if (sentMinedErr && step === "sending") { setStep("error"); setErr("Source-chain tx reverted."); }
  }, [sentMined, sentMinedErr, step]);

  // Same for the (optional) approve — we bump to "sending" once it's mined.
  const { isSuccess: approveMined, isError: approveMinedErr } = useWaitForTransactionReceipt({
    hash:    approveHash || undefined,
    chainId: fromCfg.id,
    query:   { enabled: !!approveHash },
  });
  useEffect(() => {
    if (approveMined && step === "approving") setStep("idle"); // ready to sign primary
    if (approveMinedErr && step === "approving") { setStep("error"); setErr("Approve tx reverted."); }
  }, [approveMined, approveMinedErr, step]);

  // Poll Relay's status API once we've broadcast the source-chain tx. Docs:
  // GET https://api.relay.link/intents/status/v2?requestId=… → { status: "success" | "pending" | … }
  // On success we flip to "filled". If polling errors, we keep "delivering" and
  // the user still has the tracker link.
  useEffect(() => {
    if (step !== "delivering" || !prep?.meta?.requestId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function poll() {
      try {
        const r = await fetch(
          `https://api.relay.link/intents/status/v2?requestId=${encodeURIComponent(prep!.meta!.requestId)}`,
          { cache: "no-store" },
        );
        if (!r.ok) throw new Error(`status ${r.status}`);
        const j = (await r.json()) as { status?: string };
        if (cancelled) return;
        if (j?.status === "success") { setStep("filled"); return; }
        // "waiting" | "pending" | "delayed" — keep polling every 3s.
        timer = setTimeout(poll, 3_000);
      } catch {
        // Silent — user still has the tracker link + explorer to check.
        if (!cancelled) timer = setTimeout(poll, 5_000);
      }
    }
    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [step, prep]);

  // Fetch a fresh quote whenever the key inputs change. Debounced — swap
  // direction toggles fire two state updates back-to-back and we don't want
  // two Relay requests for a single click.
  useEffect(() => {
    let cancelled = false;
    if (!fromAddress || !rawToken || fromChain === toChain) {
      setLoading(false);
      setPrepErr("Missing required field — need from/to chain, address, token.");
      return;
    }
    if (!amount) {
      // A quantity word ("all"/"max"/…) with no number yet. Keep the spinner
      // ONLY while the balance read is genuinely in flight. `setLoading(true)`
      // unconditionally was a permanent "Preparing…" with no error and no way
      // out whenever that read failed — the balance never arrives, so the word
      // never resolves, so `amount` stays "" forever. Same defect, same fix, as
      // in the send card.
      setLoading(gate === "reading");
      setPrepErr("");
      return;
    }
    // Reject non-numeric / zero amounts early — no point round-tripping Relay.
    const amtN = Number(amount);
    if (!Number.isFinite(amtN) || amtN <= 0) {
      setLoading(false);
      setPrepErr("Amount must be a positive number.");
      return;
    }
    setLoading(true); setPrepErr(""); setPrep(null);
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/robinhood/router/bridge-prepare", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromChain, toChain, fromAddress,
            recipient: recipient || fromAddress,
            token:  rawToken,
            amount,
          }),
        });
        const j = (await r.json()) as PrepareResponse;
        if (cancelled) return;
        if (!j.ok || !j.tx) {
          setPrepErr(j.error?.message || `Prepare failed (${r.status})`);
        } else {
          setPrep(j);
        }
      } catch (e) {
        if (!cancelled) setPrepErr((e as Error).message || "Prepare failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
    // `gate` is a dep because the wait branch above reads it — without it the
    // spinner would keep whatever value it had when the balance read began.
  }, [fromChain, toChain, fromAddress, recipient, rawToken, amount, gate]);

  const wrongChain = isConnected && walletChainId !== fromCfg.id;
  const needsApprove = !!prep?.approve && !approveHash;

  // `gate === "ok"` replaces `!overBalance` — it additionally requires that the
  // balance was actually READ, so an unread balance blocks instead of passing.
  const canSign = !!prep?.tx && !prepErr && !loading && gate === "ok"
    && step !== "switching" && step !== "approving" && step !== "sending" && step !== "delivering";
  const busy = step === "switching" || step === "approving" || step === "sending" || step === "delivering";

  async function switchToFromChain() {
    setStep("switching"); setErr("");
    try {
      await switchChainAsync({ chainId: fromCfg.id });
      setStep("idle");
    } catch {
      setStep("error");
      setErr(`Switch to ${fromCfg.label} Chain (${fromCfg.id}) and try again`);
    }
  }

  async function doApprove() {
    if (!prep?.approve) return;
    setErr(""); setStep("approving");
    try {
      // If the wallet is on the wrong chain, this call throws — we catch it
      // and prompt for a switch instead of surfacing a raw wagmi error.
      if (walletChainId !== fromCfg.id) {
        try { await switchChainAsync({ chainId: fromCfg.id }); }
        catch { throw new Error(`Switch to ${fromCfg.label} Chain (${fromCfg.id}) and try again`); }
      }
      const hash = await sendTransactionAsync({
        to:      prep.approve.to,
        data:    prep.approve.data,
        value:   BigInt(prep.approve.value),
        chainId: prep.approve.chainId,
      });
      setApproveHash(hash);
      // Wait for the useWaitForTransactionReceipt effect to flip us back to idle.
    } catch (e) {
      const m = (e as Error).message || String(e);
      const cancelled = /user rejected|denied|cancell?ed/i.test(m);
      setErr(cancelled ? "Approve cancelled." : m.slice(0, 200));
      setStep("error");
    }
  }

  async function doSend() {
    if (!prep?.tx || !prep?.meta) { setErr("Nothing to send yet"); setStep("error"); return; }
    if (!isConnected || !connected) { setErr("Connect your wallet"); setStep("error"); return; }
    setErr(""); setStep("sending");
    try {
      if (walletChainId !== fromCfg.id) {
        try { await switchChainAsync({ chainId: fromCfg.id }); }
        catch { throw new Error(`Switch to ${fromCfg.label} Chain (${fromCfg.id}) and try again`); }
      }
      const hash = await sendTransactionAsync({
        to:      prep.tx.to,
        data:    prep.tx.data,
        value:   BigInt(prep.tx.value),
        chainId: prep.tx.chainId,
      });
      setTxHash(hash);
      // step flips to "delivering" once the source-chain receipt is mined.
    } catch (e) {
      const m = (e as Error).message || String(e);
      const cancelled = /user rejected|denied|cancell?ed/i.test(m);
      setErr(cancelled ? "Send cancelled." : m.slice(0, 200));
      setStep("error");
    }
  }

  // Server-side field-shape failure — render a plain amber card, matching the
  // sibling swap/send-card error styling exactly. Never invent a fix here.
  if (result.error) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 font-mono text-[11px] text-amber-300">
        <div className="font-bold mb-1">Can&apos;t prepare bridge</div>
        <div className="text-amber-200/80">{result.error}</div>
      </div>
    );
  }

  // ── The destination side ───────────────────────────────────────────────────
  //
  // Everything below reads `tokenOut`, never `token`. They are different tokens
  // on the commonest pair in the app, and each of these used the input's:
  //
  //   · the symbol under the received amount — printed "USDC on Robinhood", a
  //     token that does not exist on Robinhood, for a bridge delivering USDG;
  //   · the SCALE of the received amount — survivable only while every pair
  //     anyone tested was 6→6. ETH (18) → USDG (6) would have rendered the
  //     amount received a trillion times too large, directly above a Confirm
  //     button.
  //
  // Absent scale renders "" (see fmtAmount), never a guessed 18.
  const outSymbol = (prep?.meta?.tokenOut?.symbol || "").replace(/^\$/, "");
  const outDecimals = Number.isFinite(prep?.meta?.tokenOut?.decimals)
    ? prep!.meta!.tokenOut.decimals
    : null;
  const amountOutDisplay = prep?.meta ? fmtAmount(prep.meta.amountOut, outDecimals) : "";
  // The floor, not the estimate. Relay quotes ~2% destination slippage on a
  // cross-asset trip, so "≈" and "at worst" are two different numbers — and the
  // second is the only one the user is promised.
  const amountOutMinDisplay = prep?.meta?.amountOutMin
    ? fmtAmount(prep.meta.amountOutMin, outDecimals)
    : "";
  // Fall back to the input symbol ONLY for the pre-quote skeleton, where there
  // is no server answer yet and both sides are placeholders anyway.
  const recvSymbol = outSymbol || symbol;
  const assetChanged = !!prep?.meta?.assetChanged;
  const shortRecipient = (recipient || fromAddress) ? shortAddr(recipient || fromAddress) : "";

  return (
    <div className="rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-4 font-mono text-[11px] text-slate-300 max-w-md">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-white text-[12px] font-bold flex items-center gap-1.5">
            <ChainDot color={fromCfg.accent} />
            <span>{fromCfg.label}</span>
            <span className="text-slate-500">→</span>
            <ChainDot color={toCfg.accent} />
            <span>{toCfg.label}</span>
          </div>
          <div className="text-slate-600 text-[10px]">
            via Relay Protocol · you sign · non-custodial
          </div>
        </div>
        {!isConnected && <ConnectButton label="Connect" />}
      </div>

      {step === "filled" ? (
        <div className="rounded-lg border p-3" style={{ borderColor: "#34D39940", background: "#34D39908" }}>
          <div className="font-bold mb-1" style={{ color: "#34D399" }}>
            {/* Both sides named. "Bridged 10 USDC to Robinhood" is false when
                USDG is what arrived, and this is the line the user screenshots. */}
            Bridged {amtLabel} {symbol} → {amountOutDisplay || "…"} {recvSymbol} on {toCfg.label}
          </div>
          <div className="flex gap-2 flex-wrap mt-1">
            {txHash && (
              <a href={`${fromCfg.explorer}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                className="text-[10px] px-2 py-1 rounded-lg border border-[#34D39940] text-[#34D399] inline-block">
                Source tx ↗
              </a>
            )}
            {prep?.meta?.trackerUrl && (
              <a href={prep.meta.trackerUrl} target="_blank" rel="noopener noreferrer"
                className="text-[10px] px-2 py-1 rounded-lg border border-[#34D39940] text-[#34D399] inline-block">
                Relay tracker ↗
              </a>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Confirm-only preview: pay (source chain) → receive (dest). No edit (#107). */}
          <ConfirmPreview
            left={{
              glyph: <TokenGlyph symbol={symbol} />,
              top: amtLabel,
              bottom: `${symbol} on ${fromCfg.label}`,
            }}
            right={{
              glyph: <TokenGlyph symbol={recvSymbol} />,
              top: loading ? "…" : (amountOutDisplay ? `≈ ${amountOutDisplay}` : "0.0"),
              bottom: `${recvSymbol} on ${toCfg.label}`,
            }}
          />

          {/* The delivered token is not the token sent. This is Relay acting as
              a router, not a bridge — legitimate, quoted, and the whole reason
              the server refuses to auto-resolve anything but dollar-for-dollar.
              It still has to be said BEFORE the button, not discovered after. */}
          {assetChanged && prep?.meta?.assetNote && (
            <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[9px] text-amber-300">
              {prep.meta.assetNote}
            </div>
          )}

          {/* Quantity-word hint — shows what "all"/"max"/"half"/"N%" resolved to.
              Suppressed once the read has failed: "Resolving your balance…" is a
              promise that an answer is coming, and there is no longer one. The
              banner below says what actually happened and offers the way out. */}
          {q.symbolic && gate !== "unverified" && (
            <div className="text-[9px] text-[#34D399] mb-2">
              {q.value != null ? `${q.word} → ${amtLabel} ${symbol}` : "Resolving your balance…"}
            </div>
          )}

          {/* The source-chain balance read failed. Fail-closed: the button is
              already disabled by `gate === "ok"`, so this is the only thing that
              tells the user why — and the retry is the way out of the gate. */}
          {gate === "unverified" && (
            <UnverifiedBalance symbol={symbol} onRetry={() => { void bal.refetch(); }} busy={bal.refetching} />
          )}

          {/* Small meta text: total cost · floor · est fill · recipient · balance.
              The line that used to sit here read "Relayer fee ≈ 0.056 USDC" —
              true, and not the cost. The relayer leg is one of three (relayer,
              gas, swap impact), so on a $1 trip it reported $0.06 against a real
              $0.08, and the fraction it omits GROWS as the amount shrinks.
              `totalCostUsd/Percent` is Relay's own both-sides-priced figure for
              the whole trip. Null means Relay didn't price it — which prints
              "unknown", never a zero. */}
          <div className="text-[9px] text-slate-500 mb-2 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">
                Cost{" "}
                {prep?.meta && prep.meta.totalCostUsd != null
                  ? <>≈ ${prep.meta.totalCostUsd.toFixed(prep.meta.totalCostUsd < 0.1 ? 4 : 2)}
                      {prep.meta.totalCostPercent != null && (
                        // Percentage-of-notional. On a small bridge the fixed
                        // legs dominate — MEASURED 8.4% on $1, 0.07% on $1,000 —
                        // so this is the number that decides whether the trip is
                        // worth taking, and it is worth colouring.
                        <span className={prep.meta.totalCostPercent >= 1 ? "text-amber-400" : "text-slate-600"}>
                          {" "}({prep.meta.totalCostPercent.toFixed(2)}%)
                        </span>
                      )}
                    </>
                  : <span className="text-slate-600">— unknown</span>}
              </span>
              {prep?.meta && <span className="shrink-0">Est. fill ~{prep.meta.estFillSeconds}s</span>}
            </div>
            {/* The promise, under the estimate. Suppressed when Relay gives no
                floor — an unknown minimum is not a minimum of `amountOut`. */}
            {amountOutMinDisplay && (
              <div className="truncate">
                You receive at least {amountOutMinDisplay} {recvSymbol}
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              {shortRecipient && recipient && recipient.toLowerCase() !== fromAddress.toLowerCase()
                ? <span className="truncate">To {shortRecipient} on {toCfg.label}</span>
                : <span />}
              {balance != null && <span className="shrink-0">Bal {balance.toFixed(5)} {symbol}</span>}
            </div>
          </div>

          {overBalance && <p className="text-[10px] text-red-500 mb-2">Exceeds your {symbol} balance on {fromCfg.label}</p>}
          {loading && <p className="text-[9px] text-slate-600 mb-2">Fetching Relay quote…</p>}
          {!loading && prepErr && <p className="text-[10px] text-amber-400 mb-2">{prepErr}</p>}
          {wrongChain && !busy && (
            <p className="text-[10px] text-amber-400 mb-2">
              Wallet is on chain {walletChainId} — bridge sends from {fromCfg.label} ({fromCfg.id}).
            </p>
          )}
          {step === "delivering" && (
            <p className="text-[10px] text-slate-400 mb-2">
              Source tx mined — waiting for Relay solvers to fill on {toCfg.label}…
            </p>
          )}
          {step === "error" && <p className="text-[10px] text-amber-400 mb-2">{err}</p>}

          {/* Primary button — three cascading actions:
              1. Switch chain (if wrong).
              2. Approve (if approve tx exists and not yet signed).
              3. Sign & Bridge (primary deposit tx).
              Only one is rendered — the earliest not-yet-done step. */}
          <button
            onClick={
              !isConnected  ? undefined
              : wrongChain  ? switchToFromChain
              : needsApprove ? doApprove
              : doSend
            }
            disabled={!isConnected ? false : (wrongChain ? busy : (!canSign || busy))}
            className="w-full text-[12px] font-bold py-2.5 rounded-lg transition-all disabled:opacity-50"
            style={{ background: "#34D39915", color: "#34D399", border: "1px solid #34D39940" }}
          >
            {!isConnected ? "Connect your wallet"
              // The in-flight states come first: once a signature is sitting in
              // the wallet, a background re-read that flips to `failed` must not
              // relabel a live bridge as a balance problem.
              : busy && step === "switching"  ? `Switching to ${fromCfg.label}…`
              : busy && step === "approving"  ? "Approving in wallet…"
              : busy && step === "sending"    ? "Confirm in wallet…"
              : busy && step === "delivering" ? "Delivering on destination…"
              : gate === "unverified" ? "Balance unread"
              : loading   ? "Fetching quote…"
              : prepErr   ? "Retry"
              : wrongChain    ? `Switch to ${fromCfg.label}`
              : overBalance   ? "Insufficient balance"
              : needsApprove  ? `Approve ${symbol}`
              // When the delivered token differs, the button names it. A user
              // who clicks "Bridge 10 USDC → Robinhood" and receives USDG was
              // told something false by the last thing they read.
              : assetChanged  ? `Confirm · ${amtLabel} ${symbol} → ${recvSymbol} on ${toCfg.label}`
              : `Confirm · Bridge ${amtLabel} ${symbol} → ${toCfg.label}`}
          </button>

          {/* Tracker link is always available once the primary tx is broadcast,
              even if the polling logic can't reach Relay for some reason. In
              this branch TypeScript has already narrowed step ≠ "filled". */}
          {txHash && prep?.meta?.trackerUrl && (
            <div className="mt-2 flex justify-end">
              <a href={prep.meta.trackerUrl} target="_blank" rel="noopener noreferrer"
                className="text-[10px] text-slate-500 hover:text-slate-300 underline">
                open Relay tracker ↗
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
