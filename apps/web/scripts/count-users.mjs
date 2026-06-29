// One-off: count real Blue Chat users from the credit ledger in Upstash KV.
// Scans `ledger:*` keys, aggregates engagement from each row's `history` events.
// Prints ONLY aggregate numbers — never wallet addresses or secrets.
import { readFileSync } from "node:fs";

// Load .env.local (KV_REST_API_URL / KV_REST_API_TOKEN or UPSTASH_*).
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}
const url   = process.env.KV_REST_API_URL   ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) { console.error("Missing KV creds"); process.exit(1); }

const { Redis } = await import("@upstash/redis");
const redis = new Redis({ url, token });

// SCAN all ledger:* keys (cursor loop).
let cursor = "0", keys = [];
do {
  const [next, batch] = await redis.scan(cursor, { match: "ledger:*", count: 500 });
  cursor = next; keys.push(...batch);
} while (cursor !== "0");

const now = Date.now();
const H = 3600_000;
let totalSpendEvents = 0, totalTopups = 0;
const activeIn = { "4h": new Set(), "24h": new Set(), "7d": new Set() };
const newWalletsIn = { "4h": 0, "24h": 0 }; // first-ever event within window
const reasons = {}; // model/tool usage tally

for (const k of keys) {
  let row = await redis.get(k);
  if (typeof row === "string") { try { row = JSON.parse(row); } catch { row = null; } }
  const hist = row?.history ?? [];
  if (!hist.length) continue;
  let first = Infinity, last = 0;
  for (const e of hist) {
    first = Math.min(first, e.ts); last = Math.max(last, e.ts);
    if (e.kind === "topup") totalTopups++;
    else { totalSpendEvents++; reasons[e.reason] = (reasons[e.reason] ?? 0) + 1; }
  }
  if (now - last <= 4 * H)  activeIn["4h"].add(k);
  if (now - last <= 24 * H) activeIn["24h"].add(k);
  if (now - last <= 7 * 24 * H) activeIn["7d"].add(k);
  if (now - first <= 4 * H)  newWalletsIn["4h"]++;
  if (now - first <= 24 * H) newWalletsIn["24h"]++;
}

const topReasons = Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log("\n=== Blue Chat — ledger user stats (KV) ===");
console.log(`Total unique wallets (ever used chat/tools): ${keys.length}`);
console.log(`  New wallets — first activity in last 4h:   ${newWalletsIn["4h"]}`);
console.log(`  New wallets — first activity in last 24h:  ${newWalletsIn["24h"]}`);
console.log(`Active wallets — last activity within:`);
console.log(`  4h:  ${activeIn["4h"].size}`);
console.log(`  24h: ${activeIn["24h"].size}`);
console.log(`  7d:  ${activeIn["7d"].size}`);
console.log(`Engagement: ${totalSpendEvents} spend events, ${totalTopups} top-ups`);
console.log(`Top usage (reason → count):`);
for (const [r, c] of topReasons) console.log(`  ${r}: ${c}`);
console.log("");
