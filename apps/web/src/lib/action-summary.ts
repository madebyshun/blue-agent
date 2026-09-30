/**
 * What an action record (lib/actions.ts) says in one line — pure, so the
 * history view (components/wallet/ActionHistory.tsx) and its test share it.
 *
 * Only what the record holds: the amount and tokens the card or builder
 * recorded, a symbol never without its contract beside it (a symbol is a label
 * a contract picks for itself), and a bridge's two chains named with their ids.
 */
import { WALLET_CHAINS } from "@/lib/wallet/chains";

type Params = Record<string, string | number | null>;

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const NATIVE_SENTINEL = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** A token as the record names it: ETH, or its symbol with the contract beside
 *  it, or the bare contract. Never a symbol alone. */
export function tokenText(addr: unknown, sym: unknown): string {
  const a = typeof addr === "string" ? addr.trim() : "";
  const s = typeof sym === "string" ? sym.trim().slice(0, 16) : "";
  if (/^(eth|native)$/i.test(a) || a.toLowerCase() === NATIVE_SENTINEL) return "ETH";
  if (ADDR.test(a)) return s ? `${s} (${short(a)})` : short(a);
  return s || a || "?";
}

const chainName = (c: unknown) =>
  c === "robinhood" ? `${WALLET_CHAINS.robinhood.short} ${WALLET_CHAINS.robinhood.chainId}`
  : c === "base" ? `${WALLET_CHAINS.base.short} ${WALLET_CHAINS.base.chainId}`
  : "?";

/** One line saying what moved, from the params the card or builder recorded. */
export function actionSummary(r: { kind: "swap" | "send" | "bridge"; params: Params }): string {
  const p = r.params ?? {};
  const amt = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");
  if (r.kind === "send") {
    const to = typeof p.to === "string" && ADDR.test(p.to) ? short(p.to) : amt(p.to);
    return `${amt(p.amount)} ${tokenText(p.token, p.symbol)}${to ? ` → ${to}` : ""}`.trim();
  }
  if (r.kind === "bridge") {
    return `${amt(p.amount)} ${tokenText(p.token, p.symbol)} · ${chainName(p.fromChain)} → ${chainName(p.toChain)}`.trim();
  }
  // swap — two shapes: tokenIn/tokenOut (Base 0x card, RH token↔token, MCP)
  // or direction + token (RH ETH↔token cards).
  if (p.tokenIn != null || p.tokenOut != null) {
    return `${amt(p.amountIn ?? p.amount)} ${tokenText(p.tokenIn, p.symIn)} → ${tokenText(p.tokenOut, p.symOut)}`.trim();
  }
  const token = tokenText(p.token, p.direction === "sell" ? p.symIn : p.symOut);
  return p.direction === "sell"
    ? `${amt(p.amount)} ${token} → ETH`.trim()
    : `${amt(p.amount)} ETH → ${token}`.trim();
}
