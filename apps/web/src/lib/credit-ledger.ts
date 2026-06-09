/**
 * Credit ledger — Phase 1 source of truth for spendable credits.
 *
 * Two-source model:
 *
 *   - On-chain ACCRUED  (BlueMarketStaking.totalCreditsAccrued)
 *       Read-only counter that increases with stake size × time.
 *       Never deducted on-chain.
 *
 *   - Off-chain SPENT   (this file, backed by Upstash KV)
 *       Increases when the user runs a chat message or tool call.
 *       Increases (negatively) when the user tops up with USDC.
 *
 *   balance = max(0, accrued + topup_credits - spent)
 *
 * The contract stays untouched: we don't need it to know about spending or
 * top-ups while we're still bootstrapping. If/when this hits real volume,
 * the on-chain side can be promoted to a full claimedOf/spentOf mapping
 * via a contract redeploy + KV → on-chain migration.
 */

import { kvGet, kvSet } from "./kv";

// ─── On-chain accrued (read via /lib/credits → contract) ─────────────────────

/**
 * Reads BlueMarketStaking.totalCreditsAccrued(address) and returns the value
 * as a plain number (after dividing by 10^18 since the contract stores credits
 * scaled by 1e18 of stake-token decimals).
 *
 * Returns 0 if the contract can't be reached.
 */
const STAKING_ADDRESS = "0x69e539684EE48F71eCDAd58618d8e8a2423E279d";
const BASE_RPC        = "https://mainnet.base.org";

export async function readAccruedCredits(address: string): Promise<number> {
  // totalCreditsAccrued(address) — selector 0x1e434399
  // Computed as keccak256("totalCreditsAccrued(address)")[:4]; verified against
  // viem's toFunctionSelector(). If the ABI ever changes, recompute.
  const selector = "0x1e434399";
  const data     = selector + address.slice(2).padStart(64, "0").toLowerCase();

  try {
    const res = await fetch(BASE_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "eth_call",
        params: [{ to: STAKING_ADDRESS, data }, "latest"],
      }),
      signal: AbortSignal.timeout(5000),
    });
    const json = await res.json() as { result?: string };
    if (!json.result || json.result === "0x") return 0;
    // The contract returns credits already in human units (no extra scaling
    // by 1e18): the rate math in the contract bakes the decimals out.
    return Number(BigInt(json.result));
  } catch {
    return 0;
  }
}

// ─── Off-chain spent + top-up (KV-backed) ────────────────────────────────────

interface LedgerRow {
  spent:   number;      // credits debited from balance
  topup:   number;      // credits credited via USDC top-up
  history: LedgerEvent[];
}

export interface LedgerEvent {
  ts:        number;            // ms epoch
  kind:      "spend" | "topup";
  amount:    number;            // credits (positive)
  reason:    string;            // human label: "chat:pro", "tool:honeypot-check", "topup:big"
  ref?:      string;            // optional ref (tx hash, message id, etc.)
}

const key = (addr: string) => `ledger:${addr.toLowerCase()}`;

async function loadLedger(addr: string): Promise<LedgerRow> {
  const row = await kvGet<LedgerRow | string>(key(addr));
  if (!row) return { spent: 0, topup: 0, history: [] };
  if (typeof row === "string") {
    try { return JSON.parse(row) as LedgerRow; } catch { return { spent: 0, topup: 0, history: [] }; }
  }
  return row;
}

async function saveLedger(addr: string, row: LedgerRow): Promise<void> {
  // Cap history at last 50 events so the row never grows unbounded.
  if (row.history.length > 50) row.history = row.history.slice(-50);
  await kvSet(key(addr), JSON.stringify(row));
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface BalanceSummary {
  address:  string;
  accrued:  number;     // on-chain accrual from staking time
  topup:    number;     // off-chain credits added via USDC top-up
  spent:    number;     // off-chain credits debited via chat/tool use
  balance:  number;     // max(0, accrued + topup - spent)
  recent:   LedgerEvent[];  // last few events
}

/**
 * Compute the spendable balance for a wallet.
 *
 * `accrued` is read fresh from the contract on every call; this is a single
 * RPC roundtrip and accepts a 5-second timeout. KV reads/writes are cheap.
 */
export async function getBalance(address: string): Promise<BalanceSummary> {
  const addr = address.toLowerCase();
  const [accrued, ledger] = await Promise.all([
    readAccruedCredits(addr),
    loadLedger(addr),
  ]);
  const balance = Math.max(0, accrued + ledger.topup - ledger.spent);
  return {
    address: addr,
    accrued,
    topup:   ledger.topup,
    spent:   ledger.spent,
    balance,
    recent:  ledger.history.slice(-10).reverse(),
  };
}

/**
 * Record a credit debit. Returns the new balance, or throws if the user
 * doesn't have enough credits (server callers should catch and surface a
 * "top up?" prompt).
 */
export async function spend(
  address: string,
  amount:  number,
  reason:  string,
  ref?:    string,
): Promise<BalanceSummary> {
  if (amount <= 0) throw new Error("amount must be positive");
  const addr = address.toLowerCase();

  const [accrued, ledger] = await Promise.all([
    readAccruedCredits(addr),
    loadLedger(addr),
  ]);
  const balance = Math.max(0, accrued + ledger.topup - ledger.spent);
  if (balance < amount) {
    const err = new Error(`Insufficient credits: have ${balance}, need ${amount}`);
    (err as { code?: string }).code = "INSUFFICIENT_CREDITS";
    throw err;
  }

  ledger.spent += amount;
  ledger.history.push({ ts: Date.now(), kind: "spend", amount, reason, ref });
  await saveLedger(addr, ledger);

  return {
    address: addr,
    accrued,
    topup:   ledger.topup,
    spent:   ledger.spent,
    balance: balance - amount,
    recent:  ledger.history.slice(-10).reverse(),
  };
}

/**
 * Record a USDC → credits top-up. Caller is responsible for verifying the
 * USDC settlement first (via x402 or direct transfer check).
 */
export async function topup(
  address: string,
  credits: number,
  reason:  string,
  ref?:    string,
): Promise<BalanceSummary> {
  if (credits <= 0) throw new Error("credits must be positive");
  const addr = address.toLowerCase();

  const [accrued, ledger] = await Promise.all([
    readAccruedCredits(addr),
    loadLedger(addr),
  ]);
  ledger.topup += credits;
  ledger.history.push({ ts: Date.now(), kind: "topup", amount: credits, reason, ref });
  await saveLedger(addr, ledger);

  return {
    address: addr,
    accrued,
    topup:   ledger.topup,
    spent:   ledger.spent,
    balance: Math.max(0, accrued + ledger.topup - ledger.spent),
    recent:  ledger.history.slice(-10).reverse(),
  };
}
