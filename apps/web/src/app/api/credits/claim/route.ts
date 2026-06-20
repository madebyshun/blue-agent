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
import { kv, kvGet, kvSet, kvSetNX, kvDel } from "@/lib/kv";
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

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address") ?? "";
  const n = await count();
  const claimed = isAddr(address) ? !!(await kvGet(doneKey(address))) : false;
  return NextResponse.json({
    amount:       CLAIM_AMOUNT,
    total:        CLAIM_CAP,
    claimedCount: n,
    remaining:    Math.max(0, CLAIM_CAP - n),
    soldOut:      n >= CLAIM_CAP,
    claimed,
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
