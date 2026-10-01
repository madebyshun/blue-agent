/**
 * x402 settlement ledger — real USDC settled on Base via the Coinbase CDP facilitator.
 *
 * Every paid tool call that clears CDP `/settle` moves USDC on-chain to the Blue
 * Agent treasury (0x0295…). We record ONLY confirmed settlements (settle.ok === true)
 * here so the /stats page can show the actual amount Coinbase CDP has settled —
 * not the runs×price ESTIMATE (which counts internal-bypass / free / failed-settle
 * calls too). The number is therefore a strict, honest lower-bound of paid volume.
 *
 * Aggregate only: a running count + summed micro-units + the latest tx hash (for a
 * one-click Basescan proof). No wallet address appears in any key or value HERE.
 *
 * That last sentence used to end "— the payer address is never stored", full stop,
 * as a property of the system rather than of this file. It is no longer true of the
 * system: `lib/wallet/spend-log.ts` deliberately files the same settlement a second
 * time under `spend:<payer>`, because a wallet that cannot name its own payments is
 * the whole defect that surface exists to fix. Read that file's header for what is
 * and is not recorded (tool id, price, tx, timestamp — never inputs or outputs).
 *
 * The distinction still matters and is why both books exist: /stats must be able to
 * publish total settled volume WITHOUT touching anything per-user, so it reads these
 * three keys and only these three. Do not "simplify" by deriving the aggregate from
 * the per-payer receipts — that would make a public page depend on private rows, and
 * the receipts expire after 90 days while this meter is cumulative.
 *
 * Forward-only, like the `usage:<id>` run counters: it starts accruing at deploy
 * time. That is intentional and truthful — it is a live meter of CDP settlements,
 * not a backfilled historical total. A KV failure degrades every read to null so
 * /stats renders an honest "—", never a fabricated figure.
 *
 * ONE per-settlement key lives here too (added 2026-10-01): `x402:settled:<tx>`,
 * a bare marker that the tx hash is an x402 settlement — no payer, no tool, no
 * amount. It exists for /api/credits/purchase, which credits a USDC transfer to
 * the same treasury and must never mint credits for a payment that already
 * bought a tool. That route also refuses the settlement SHAPES it knows
 * (EIP-3009 AuthorizationUsed, Permit2 proxy), but a shape list is a blocklist:
 * it covers the methods we thought of. This marker is the positive check — it
 * covers whatever method the facilitator used, because it is written at the
 * one place every settlement passes through. Forward-only like the meter, so
 * the shape checks stay as the guard for settlements made before it existed.
 */
import { kv, kvGet, kvGetProbe } from "@/lib/kv";

const K_COUNT = "x402:settle:count";  // # of confirmed CDP settlements
const K_UNITS = "x402:settle:units";  // Σ USDC micro-units settled (6 decimals)
const K_LASTTX = "x402:settle:lasttx"; // most-recent on-chain tx hash (Base)
const settledTxKey = (tx: string) => `x402:settled:${tx.toLowerCase()}`;
// Matches credits/purchase's processed-marker TTL: a settlement older than a
// year that was never posted there is still caught by its shape checks.
const SETTLED_TX_TTL = 365 * 24 * 3600;

export interface X402Settlements {
  count: number;         // confirmed on-chain settlements via Coinbase CDP
  units: number;         // raw USDC micro-units (6 decimals)
  usdc:  number;         // human USDC (units / 1e6)
  lastTx: string | null; // latest settlement tx hash on Base, for Basescan proof
}

/**
 * Record ONE confirmed CDP settlement. Call ONLY when cdpSettle().ok === true.
 * Best-effort and non-throwing: a KV hiccup must never break the paid response
 * (the USDC already moved — bookkeeping is secondary).
 */
export async function recordSettlement(units: number, tx?: string | null): Promise<void> {
  if (!Number.isFinite(units) || units <= 0) return;
  try {
    await Promise.all([
      kv.incr(K_COUNT),
      kv.incrby(K_UNITS, Math.round(units)),
      tx ? kv.set(K_LASTTX, tx) : Promise.resolve(),
      tx ? kv.set(settledTxKey(tx), 1, { ex: SETTLED_TX_TTL }) : Promise.resolve(),
    ]);
  } catch { /* bookkeeping is best-effort */ }
}

/**
 * Was this tx hash recorded as an x402 settlement? `true` / `false` when KV
 * answered, `null` when it could not be asked — the caller decides what an
 * unknown means (credits/purchase refuses to mint on it), never this helper.
 */
export async function isRecordedSettlement(tx: string): Promise<boolean | null> {
  const probe = await kvGetProbe<unknown>(settledTxKey(tx));
  if (probe.status === "error") return null;
  return probe.status === "hit";
}

/** Read the aggregate settlement meter. Null on total KV failure → /stats shows "—". */
export async function getX402Settlements(): Promise<X402Settlements | null> {
  try {
    const [count, units, lastTx] = await Promise.all([
      kvGet<number>(K_COUNT),
      kvGet<number>(K_UNITS),
      kvGet<string>(K_LASTTX),
    ]);
    const u = units ?? 0;
    return {
      count:  count ?? 0,
      units:  u,
      usdc:   u / 1_000_000,
      lastTx: lastTx ?? null,
    };
  } catch {
    return null;
  }
}
