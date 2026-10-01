// POST /api/credits/purchase  { address, txHash }
//
// Non-custodial USDC → credits top-up (the "Pay with USDC" flow).
//
// The user signs a DIRECT USDC transfer from their own wallet to the Blue
// treasury (client side, in TopUpModal). This route only READS the settled
// transaction and credits the off-chain ledger — it never holds a key, never
// moves funds, and never trusts a number from the client.
//
// Security model:
//   1. We fetch the on-chain receipt for txHash on Base and require status=success.
//   2. We decode the ERC-20 Transfer logs and sum ONLY transfers where
//        token == USDC_BASE  AND  to == TOPUP_TREASURY  AND  from == caller.
//      Binding `from == caller` stops anyone crediting themselves for someone
//      else's legitimate treasury-inbound transfer.
//   3. Idempotency: an atomic KV NX lock on `purchase:<txHash>` guarantees a
//      given settled tx can mint credits at most once, even under ret/races.
//      On verify-failure we RELEASE the lock (kvDel) so a genuine retry works;
//      on success we KEEP it (long TTL) as the permanent processed-marker.
//
// Credits are derived in CODE from the on-chain USDC amount (CREDITS_PER_USDC),
// never from anything the client sends.
//
//   4. ONLY A TOP-UP counts (fixed 2026-09-30, plan §2 fix 2). TOPUP_TREASURY
//      is the same address as the x402 payee, and an x402 settlement is an
//      EIP-3009 `transferWithAuthorization` — which emits exactly the Transfer
//      rule 2 looks for (from = the payer, to = treasury, token = USDC). So a
//      caller could pay for a Hub tool, then post that settlement hash here and
//      be credited the same USDC a second time. A real top-up is the plain
//      `transfer` TopUpModal sends; EIP-3009 always also emits USDC's
//      `AuthorizationUsed(authorizer, nonce)`, so any tx where the caller
//      authorized one is refused. Credit is never minted for a payment that
//      already bought something.
//
//   5. …and the same holds for the OTHER x402 settlement shape (fixed
//      2026-10-01). x402 v2 `exact` can also settle through Permit2: the
//      reference facilitator in @x402/evm picks EIP-3009 or Permit2 from the
//      shape of the CLIENT's payload, and x402/[tool] forwards that payload
//      unchanged — so the payer, not us, chooses. A Permit2 settlement runs
//      x402ExactPermit2Proxy → Permit2 → USDC.transferFrom(payer, treasury):
//      the very Transfer rule 2 sums, and NO AuthorizationUsed, so rule 4
//      alone let it through. The plain `transfer` TopUpModal sends never goes
//      near either contract, so a receipt is refused when its top-level `to`
//      is Permit2 or an x402 Permit2 proxy, OR when any of those contracts
//      emitted a log in it (the proxy emits `Settled` / `SettledWithPermit`
//      on every settle, which also catches a settlement batched behind some
//      other wrapper). Addresses come from @x402/evm's own exports — the
//      package that defines the settlement path — never a literal here.
//
//   6. Rules 4 and 5 are a list of settlement SHAPES, i.e. a blocklist that
//      covers the methods someone thought of. The positive check: every x402
//      settlement this app makes is marked `x402:settled:<tx>` by
//      `recordSettlement` (lib/x402-settlements.ts — the one function both
//      x402/[tool] and hub/community/[slug]/invoke call on settle.ok), and a
//      marked hash is refused whatever its shape. An unreadable marker (KV
//      error) is refused as retryable rather than read as "not a settlement":
//      minting on an unknown is the direction that costs money. The marker is
//      forward-only, which is why 4 and 5 stay.

import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  http,
  parseEventLogs,
  formatUnits,
  isAddress,
  isHash,
  getAddress,
  type Hex,
} from "viem";
import { base } from "viem/chains";
import { topup } from "@/lib/credit-ledger";
import { kvGet, kvSet, kvSetNX, kvDel } from "@/lib/kv";
import { USDC_BASE, TOPUP_TREASURY, creditsForUsdc } from "@/lib/payments";
import { isRecordedSettlement } from "@/lib/x402-settlements";
import {
  PERMIT2_ADDRESS,
  x402ExactPermit2ProxyAddress,
  x402UptoPermit2ProxyAddress,
} from "@x402/evm";

export const runtime = "nodejs";
export const maxDuration = 20;

const RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";

// ERC-20 Transfer(address indexed from, address indexed to, uint256 value).
const TRANSFER_EVENT = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
  },
] as const;

// EIP-3009: emitted by USDC on every transferWithAuthorization — i.e. on every
// x402 settlement, and never on the plain transfer a top-up is.
const AUTHORIZATION_USED_EVENT = [
  {
    type: "event",
    name: "AuthorizationUsed",
    inputs: [
      { indexed: true, name: "authorizer", type: "address" },
      { indexed: true, name: "nonce", type: "bytes32" },
    ],
  },
] as const;

// Rule 5: the contracts an x402 Permit2 settlement runs through. `upto` is not
// a scheme we sell, but its proxy settles into payTo the same way, and
// refusing it costs a real top-up nothing.
const PERMIT2_SETTLEMENT_CONTRACTS = new Set<string>(
  [PERMIT2_ADDRESS, x402ExactPermit2ProxyAddress, x402UptoPermit2ProxyAddress].map((a) => getAddress(a)),
);

function touchesPermit2Settlement(receipt: { to?: string | null; logs: ReadonlyArray<{ address: string }> }): boolean {
  const isSettlementContract = (a: string | null | undefined) => {
    if (!a) return false;
    try { return PERMIT2_SETTLEMENT_CONTRACTS.has(getAddress(a)); } catch { return false; }
  };
  return isSettlementContract(receipt.to) || receipt.logs.some((l) => isSettlementContract(l.address));
}

// Permanent processed-marker; also read on a duplicate call to return the
// original credited amount idempotently. TTL long enough to be effectively
// permanent for reconciliation, short enough not to hoard KV forever.
const PROCESSED_TTL = 365 * 24 * 3600; // 1 year
const LOCK_TTL = 600; // 10 min — an in-flight verify that dies releases naturally

interface PurchaseRecord {
  status:  "verifying" | "credited";
  ts:      number;
  address?: string;
  credits?: number;
  usdc?:    number;
}

function coerceRecord(raw: PurchaseRecord | string | null): PurchaseRecord | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as PurchaseRecord; } catch { return null; }
  }
  return raw;
}

export async function POST(req: NextRequest) {
  let body: { address?: string; txHash?: string };
  try {
    body = (await req.json()) as { address?: string; txHash?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const address = (body.address ?? "").trim();
  const txHash  = (body.txHash ?? "").trim();

  if (!isAddress(address)) {
    return NextResponse.json({ ok: false, error: "Invalid address" }, { status: 400 });
  }
  if (!isHash(txHash)) {
    return NextResponse.json({ ok: false, error: "Invalid transaction hash" }, { status: 400 });
  }

  const caller  = getAddress(address);
  const lockKey = `purchase:${txHash.toLowerCase()}`;

  // ── Idempotency: acquire the per-tx lock (atomic SET NX EX) ─────────────────
  const gotLock = await kvSetNX(
    lockKey,
    JSON.stringify({ status: "verifying", ts: Date.now(), address: caller } satisfies PurchaseRecord),
    LOCK_TTL,
  );

  if (!gotLock) {
    // Someone already holds this tx — either mid-verify or already credited.
    const existing = coerceRecord(await kvGet<PurchaseRecord | string>(lockKey));
    if (existing?.status === "credited") {
      return NextResponse.json({
        ok: true,
        alreadyCredited: true,
        credits: existing.credits ?? 0,
        usdc:    existing.usdc ?? 0,
      });
    }
    return NextResponse.json(
      { ok: false, error: "This transaction is already being verified — refresh in a moment." },
      { status: 409 },
    );
  }

  // From here on, ANY verify-failure MUST release the lock so a real retry works.
  try {
    // Rule 6: a hash this app recorded as an x402 settlement is never a top-up.
    const recorded = await isRecordedSettlement(txHash);
    if (recorded !== false) {
      await kvDel(lockKey);
      return recorded
        ? NextResponse.json(
            {
              ok: false,
              error:
                "This transaction is an x402 payment for a Hub tool, not a top-up — it already paid for something. " +
                "Top up with a direct USDC transfer from the Credits screen.",
            },
            { status: 400 },
          )
        : NextResponse.json(
            { ok: false, error: "Could not check this transaction against x402 settlements — try again in a moment." },
            { status: 503 },
          );
    }

    const client = createPublicClient({ chain: base, transport: http(RPC) });

    let receipt;
    try {
      receipt = await client.getTransactionReceipt({ hash: txHash as Hex });
    } catch {
      await kvDel(lockKey);
      return NextResponse.json(
        { ok: false, pending: true, error: "Transaction not found or not yet mined — try again in a few seconds." },
        { status: 202 },
      );
    }

    if (receipt.status !== "success") {
      await kvDel(lockKey);
      return NextResponse.json({ ok: false, error: "Transaction reverted on-chain." }, { status: 400 });
    }

    // Rule 4: an EIP-3009 authorization by the caller means this is a payment
    // (x402 settlement), not a top-up. Checked before any Transfer is summed.
    let authorizations: Array<{ address: string; args: { authorizer?: string } }> = [];
    try {
      authorizations = parseEventLogs({ abi: AUTHORIZATION_USED_EVENT, logs: receipt.logs }) as typeof authorizations;
    } catch {
      authorizations = [];
    }
    const authorizedByCaller = authorizations.some((a) => {
      try {
        return getAddress(a.address) === USDC_BASE && a.args.authorizer != null && getAddress(a.args.authorizer) === caller;
      } catch {
        return false;
      }
    });
    if (authorizedByCaller) {
      await kvDel(lockKey);
      return NextResponse.json(
        {
          ok: false,
          error:
            "This transaction is a signed USDC authorization (an x402 payment), not a top-up — it already paid for something. " +
            "Top up with a direct USDC transfer from the Credits screen.",
        },
        { status: 400 },
      );
    }

    // Rule 5: a Permit2-routed x402 settlement is a payment too, and emits no
    // AuthorizationUsed for rule 4 to see.
    if (touchesPermit2Settlement(receipt)) {
      await kvDel(lockKey);
      return NextResponse.json(
        {
          ok: false,
          error:
            "This transaction settled through Permit2 (an x402 payment), not a top-up — it already paid for something. " +
            "Top up with a direct USDC transfer from the Credits screen.",
        },
        { status: 400 },
      );
    }

    // Decode Transfer logs; keep only USDC → treasury FROM this caller.
    let logs: Array<{ address: string; args: { from?: string; to?: string; value?: bigint } }> = [];
    try {
      logs = parseEventLogs({ abi: TRANSFER_EVENT, logs: receipt.logs }) as typeof logs;
    } catch {
      logs = [];
    }

    let totalUnits = 0n; // USDC base units (6 decimals)
    for (const log of logs) {
      const from = log.args.from;
      const to   = log.args.to;
      const val  = log.args.value;
      if (from == null || to == null || val == null) continue;
      try {
        if (
          getAddress(log.address) === USDC_BASE &&
          getAddress(to)          === TOPUP_TREASURY &&
          getAddress(from)        === caller
        ) {
          totalUnits += val;
        }
      } catch {
        // malformed address in a log — skip it
      }
    }

    if (totalUnits <= 0n) {
      await kvDel(lockKey);
      return NextResponse.json(
        { ok: false, error: "No USDC transfer from your wallet to the Blue treasury was found in this transaction." },
        { status: 400 },
      );
    }

    const usdc    = Number(formatUnits(totalUnits, 6));
    const credits = creditsForUsdc(usdc);

    if (credits <= 0) {
      await kvDel(lockKey);
      return NextResponse.json({ ok: false, error: "Amount too small to credit." }, { status: 400 });
    }

    // Credit the ledger. On failure, release the lock so the user can retry.
    let summary;
    try {
      summary = await topup(caller, credits, "purchase:usdc", txHash);
    } catch (e) {
      await kvDel(lockKey);
      return NextResponse.json(
        { ok: false, error: `Ledger credit failed: ${(e as Error).message}` },
        { status: 500 },
      );
    }

    // Promote the lock to a permanent processed-marker (idempotent on re-POST).
    await kvSet(
      lockKey,
      JSON.stringify({ status: "credited", ts: Date.now(), address: caller, credits, usdc } satisfies PurchaseRecord),
      PROCESSED_TTL,
    );

    return NextResponse.json({
      ok: true,
      credits,
      usdc,
      balance: summary.balance,
      pool:    summary.pool,
    });
  } catch (e) {
    // Unexpected failure — release the lock, surface a generic error.
    await kvDel(lockKey);
    return NextResponse.json(
      { ok: false, error: `Verification failed: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
