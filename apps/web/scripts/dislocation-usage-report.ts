/**
 * Dislocation usage — who actually calls the endpoint we meant to sell, minus us.
 *
 * Run (from apps/web, with production KV in the environment):
 *   npm run hood:disloc-usage                      # last 14 days
 *   npm run hood:disloc-usage -- --days 30
 *   DISLOCATION_OWN_KEYS="keyA,keyB" npm run hood:disloc-usage
 *   npm run hood:disloc-usage -- --exclude-key <raw key> [--exclude-key …]
 * Prints a table. Writes nothing. NOT part of `npm test` (the filename does not
 * end in -test / -check): it reads production KV.
 *
 * WHY (rebuild plan §5 #5, 2026-09-30): `recordDislocationCall` is written from
 * a dozen call sites across /api/hood/dislocation and /spread, and until this
 * script nothing READ it — `readDislocationDays` existed with no caller but a
 * test. A meter nobody reads cannot tell anyone whether the endpoint has users.
 *
 * "MINUS US": our own probes (smoke runs, manual curls, the checklist) land in
 * the same hash as a customer would. The meter stores only a truncated SHA-256
 * of the caller's `x-api-key` (see lib/blue-hood/dislocation-usage.ts), so the
 * way to exclude ourselves is to hash OUR keys here and drop those rows. The
 * raw keys are read from the flag or env, hashed in memory, and never printed.
 *
 * ⚠️ The anonymous bucket (`anon` — no key sent) cannot be split: our keyless
 * probes and a stranger's are the same row. It is reported on its own line and
 * never counted as a customer. If you want your own traffic excluded, send a
 * key when you probe.
 */
import { readDislocationDays, hashApiKey, ANON_KEY_HASH } from "../src/lib/blue-hood/dislocation-usage";

function arg(name: string): string[] {
  const out: string[] = [];
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) if (a[i] === name && a[i + 1]) out.push(a[++i]);
  return out;
}

(async () => {
  const days = Math.max(1, Math.min(Number(arg("--days")[0] ?? 14) || 14, 90));
  const ownRaw = [
    ...arg("--exclude-key"),
    ...(process.env.DISLOCATION_OWN_KEYS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  ];
  const own = new Set(ownRaw.map((k) => hashApiKey(k)));

  const rows = await readDislocationDays(days);
  const unreadable = rows.filter((r) => r.callers === null).map((r) => r.day);
  type Tot = { ok: number; stale: number; rejected: number; days: Set<string> };
  const customers = new Map<string, Tot>();
  const ours: Tot = { ok: 0, stale: 0, rejected: 0, days: new Set() };
  const anon: Tot = { ok: 0, stale: 0, rejected: 0, days: new Set() };
  let dropped = 0;
  for (const d of rows) {
    dropped += d.dropped;
    for (const [id, c] of Object.entries(d.callers ?? {})) {
      const hash = id.split("|")[0];
      const bucket = own.has(hash) ? ours : hash === ANON_KEY_HASH ? anon : (customers.get(hash) ?? (() => {
        const t: Tot = { ok: 0, stale: 0, rejected: 0, days: new Set() };
        customers.set(hash, t);
        return t;
      })());
      bucket.ok += c.ok; bucket.stale += c.stale; bucket.rejected += c.rejected;
      if (c.ok + c.stale + c.rejected > 0) bucket.days.add(d.day);
    }
  }

  const line = (label: string, t: Tot) =>
    `${label.padEnd(20)} ok ${String(t.ok).padStart(6)}   stale ${String(t.stale).padStart(5)}   rejected ${String(t.rejected).padStart(5)}   active days ${t.days.size}`;
  console.log(`Dislocation usage — last ${days} UTC day(s) (${rows.at(-1)?.day} → ${rows[0]?.day})`);
  console.log(`own keys excluded: ${own.size}${own.size === 0 ? "  (none given — every keyed caller below may include us)" : ""}\n`);
  if (customers.size === 0) console.log("keyed callers (not ours): NONE");
  else for (const [h, t] of [...customers.entries()].sort((a, b) => (b[1].ok + b[1].stale) - (a[1].ok + a[1].stale))) console.log(line(`key ${h}`, t));
  console.log("");
  console.log(line("anonymous (no key)", anon) + "   ← cannot be split from our own keyless probes");
  if (own.size) console.log(line("ours (excluded)", ours));
  if (dropped) console.log(`\n${dropped} call(s) dropped by the per-day caller cap — some day was saturated; totals are a floor.`);
  if (unreadable.length) console.log(`\n⚠️ UNREADABLE day(s): ${unreadable.join(", ")} — KV read failed; those days are unknown, not zero.`);
})().catch((e) => { console.error(e); process.exit(1); });
