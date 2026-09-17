// Launch airdrop — first 300 wallets get 1,000 free credits each (one-time).
//
//   GET  /api/credits/claim?address=0x…  → status + slots remaining
//   POST /api/credits/claim { address }  → claim 1,000 credits
//
// Budget guard: the 300 hard cap × 1,000 cr = 300,000 cr ≈ $150 (1 cr ≈ $0.0005),
// safely under the $200 grant pool — so the CAP itself bounds total spend no
// matter what. One claim per wallet via an atomic KV NX lock. A soft per-IP
// limit deters trivial scripted multi-claim WITHOUT blocking genuinely new
// (empty) wallets — onboarding new users is the whole point, so we don't gate
// on wallet age / balance.

import { NextResponse } from "next/server";
import { kv, kvGet, kvSet, kvSetNX, kvDel, kvGetCounter, kvGetProbe } from "@/lib/kv";
import { topup } from "@/lib/credit-ledger";

export const runtime = "nodejs";

const CLAIM_AMOUNT = 1000;   // credits per wallet
const CLAIM_CAP    = 300;    // first N wallets (≈ $150 max)
const IP_LIMIT     = 3;      // claims per IP over the campaign (soft deterrent)

const COUNT_KEY = "claim:count";
const doneKey = (a: string) => `claim:done:${a.toLowerCase()}`;
const ipKey   = (ip: string) => `claim:ip:${ip}`;

const isAddr = (s: string) => /^0x[a-fA-F0-9]{40}$/.test(s);
const count  = async () => (await kvGet<number>(COUNT_KEY)) ?? 0;

/**
 * #150 read side — the SCARCITY number, which is the one thing this response
 * exists to state.
 *
 * `count()` swallows a KV throw into `null` and `?? 0` turns it into `0`, so a
 * throttled read made the banner announce "300/300 left" — a fabricated
 * measurement of a public giveaway, printed at exactly the moment we could not
 * verify a single slot. `claimed` degraded the same way: a wallet that HAD
 * claimed was shown the Claim button again.
 *
 * To be precise about what this does NOT fix, because the two are easy to
 * conflate: the 300-slot CAP never depended on this read. The enforcement is
 * the atomic `kv.incr(COUNT_KEY)` in POST below, which returns the true count
 * and rolls the slot back past the cap — the `count()` pre-check at the top of
 * POST is a fast path, not the guard. So this was never an over-granting bug.
 * It was an honesty bug: we advertised a number we had not read.
 *
 * Both reads are now probed and an unreadable one answers 503 instead of a
 * number. ClaimBanner hides itself on `ok: false` — a promo banner that can't
 * verify its own scarcity should be absent, not confidently wrong.
 */
export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address") ?? "";

  const n = await kvGetCounter(COUNT_KEY);
  const done = isAddr(address) ? await kvGetProbe<unknown>(doneKey(address)) : null;

  if (n === null || done?.status === "error") {
    console.error(`[claim] status unreadable (count=${n === null ? "error" : "ok"} done=${done?.status ?? "n/a"}) — refusing to quote a slot count we did not read`);
    return NextResponse.json({
      ok: false,
      amount: CLAIM_AMOUNT,
      total:  CLAIM_CAP,
      error:  "storage unavailable — could not read the claim counter. Slots are NOT known to be available or full; the 300 cap is still enforced atomically on claim.",
    }, { status: 503 });
  }

  return NextResponse.json({
    ok:           true,
    amount:       CLAIM_AMOUNT,
    total:        CLAIM_CAP,
    claimedCount: n,
    remaining:    Math.max(0, CLAIM_CAP - n),
    soldOut:      n >= CLAIM_CAP,
    claimed:      done?.status === "hit",
  });
}

export async function POST(req: Request) {
  let body: { address?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "bad body" }, { status: 400 }); }

  const address = (body.address ?? "").trim();
  if (!isAddr(address)) return NextResponse.json({ ok: false, error: "invalid address" }, { status: 400 });
  const addr = address.toLowerCase();

  // Already claimed → idempotent success.
  if (await kvGet(doneKey(addr))) {
    return NextResponse.json({ ok: true, claimed: true, alreadyClaimed: true, amount: CLAIM_AMOUNT });
  }

  // Campaign full?
  if ((await count()) >= CLAIM_CAP) {
    return NextResponse.json({ ok: false, soldOut: true, remaining: 0, error: "Campaign is full" });
  }

  // Soft per-IP deterrent (the 300 cap is the real budget guard; this just stops
  // trivial multi-claim from one machine — does NOT block new empty wallets).
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (ip && (await kv.incr(ipKey(ip))) > IP_LIMIT) {
    return NextResponse.json({ ok: false, error: "Too many claims from this network — try later." }, { status: 429 });
  }

  // One claim per wallet — atomic NX lock (no double-grant under races).
  if (!(await kvSetNX(doneKey(addr), Date.now(), 365 * 24 * 3600))) {
    return NextResponse.json({ ok: true, claimed: true, alreadyClaimed: true, amount: CLAIM_AMOUNT });
  }

  // Take a slot atomically; if we raced past the cap, release and report full.
  const n = await kv.incr(COUNT_KEY);
  if (n > CLAIM_CAP) {
    await kvDel(doneKey(addr));
    await kvSet(COUNT_KEY, CLAIM_CAP);
    return NextResponse.json({ ok: false, soldOut: true, remaining: 0, error: "Campaign is full" });
  }

  // Grant the credits into the server ledger pool.
  try {
    await topup(addr, CLAIM_AMOUNT, "grant:claim:launch300");
  } catch {
    // Don't strand the slot on a transient ledger error — roll back.
    await kvDel(doneKey(addr));
    await kvSet(COUNT_KEY, Math.max(0, n - 1));
    return NextResponse.json({ ok: false, error: "Grant failed, please retry" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, claimed: true, amount: CLAIM_AMOUNT, remaining: Math.max(0, CLAIM_CAP - n) });
}
