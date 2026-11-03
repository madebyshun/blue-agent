/**
 * Pays ONE real x402 call to each Blue Agent service a buyer can hire
 * (lib/hub/blue-services BLUE_HIRE_IDS), so Coinbase's Bazaar lists it. The
 * Bazaar only catalogs an endpoint after a settled payment carrying its
 * discovery extension (measured 2026-11-03: 1 of 57 listed, token-price, the
 * only one ever paid since the extension was fixed on 2026-10-22).
 *
 * Spends real USDC on Base from BUYER_PRIVATE_KEY, at each tool's listed price
 * (about $1.5 for the whole list). Use a wallet funded only for this. The key
 * stays in this process. Dry run first:
 *
 *   cd apps/web
 *   npx tsx scripts/bazaar-seed.ts --dry                 # quote each, pay nothing
 *   BUYER_PRIVATE_KEY=0x... npx tsx scripts/bazaar-seed.ts
 *   ONLY=token-price,honeypot-check BUYER_PRIVATE_KEY=0x... npx tsx scripts/bazaar-seed.ts
 *
 * Then check: https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=0x02950ad38ada1d599375bd447e080cd404809205
 */
import { privateKeyToAccount } from "viem/accounts";
import { BLUE_HIRE_EXAMPLES, blueHireServices } from "../src/lib/hub/blue-services";
import { quoteProblem, signX402, toQuote } from "../src/lib/x402-sign-client";
import { X402_PAY_TO } from "../src/lib/x402-payee";

const MAX_TOTAL_USD = Number(process.env.MAX_TOTAL_USD ?? 3);

async function main() {
  const dry = process.argv.includes("--dry");
  const only = (process.env.ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const services = blueHireServices().filter((s) => !only.length || only.some((id) => s.url.endsWith(`/${id}`)));
  const total = services.reduce((a, s) => a + (s.priceUsd ?? 0), 0);
  console.log(`${services.length} services · listed total $${total.toFixed(3)} · cap $${MAX_TOTAL_USD}`);
  if (total > MAX_TOTAL_USD) throw new Error(`Listed total exceeds MAX_TOTAL_USD=${MAX_TOTAL_USD}; raise it on purpose if intended.`);

  const pk = process.env.BUYER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!dry && !pk) throw new Error("Set BUYER_PRIVATE_KEY (a wallet funded only for this), or pass --dry.");
  const account = pk ? privateKeyToAccount(pk) : null;

  for (const s of services) {
    const id = s.url.split("/").pop();
    const body = JSON.stringify(BLUE_HIRE_EXAMPLES[id ?? ""] ?? s.example ?? {});
    const r = await fetch(s.url, { method: "POST", headers: { "content-type": "application/json" }, body });
    if (r.status !== 402) { console.log(`SKIP ${id}: unpaid call answered ${r.status} (expected 402)`); continue; }
    const j = (await r.json().catch(() => ({}))) as { x402Version?: number; accepts?: Record<string, unknown>[] };
    const q = toQuote(j.accepts?.[0] ?? {}, j.x402Version ?? 2);
    const why = q ? quoteProblem(q) : "no USDC-on-Base option";
    if (!q || why) { console.log(`SKIP ${id}: ${why}`); continue; }
    if (q.payTo.toLowerCase() !== X402_PAY_TO.toLowerCase()) { console.log(`SKIP ${id}: quote pays ${q.payTo}, not Blue Agent`); continue; }
    const usd = Number(q.amount) / 1e6;
    if (dry || !account) { console.log(`QUOTE ${id}: $${usd} to ${q.payTo}`); continue; }
    const header = await signX402(account.address, q, (args) => account.signTypedData(args as Parameters<typeof account.signTypedData>[0]));
    const paid = await fetch(s.url, { method: "POST", headers: { "content-type": "application/json", "x-payment": header, "payment-signature": header }, body });
    const text = await paid.text();
    console.log(`${paid.ok ? "PAID" : "FAIL"} ${id}: $${usd} · HTTP ${paid.status}${paid.ok ? "" : ` · ${text.slice(0, 160)}`}`);
    await new Promise((res) => setTimeout(res, 1500));
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
