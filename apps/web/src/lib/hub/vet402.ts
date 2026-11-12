/**
 * Delivery records from vet402 (vet402.com), shown beside the sellers on the
 * Agent Exchange. Blue Agent measures who GETS PAID over x402 on Base; vet402
 * buys from those listings and publishes who DELIVERS after being paid. The
 * two read the same sellers from opposite sides.
 *
 * Source: https://vet402.com/api/v1/sellers/export.csv, one row per active Base
 * listing, classified by vet402's latest purchase (outcome = delivered | seller
 * | vet402 | pending | unsorted | not_bought | not_tried). CC BY 4.0: every
 * place this is shown names vet402 and the retrieval time.
 *
 * Counted per host: `delivered`; `sellerFail` (vet402 shows the failure was not
 * its own); `bought` = delivered + sellerFail + unsorted. vet402-side failures,
 * pending and not-tried rows are not the seller's record and are left out.
 * Only hosts vet402 actually bought from are stored. Refreshed daily by
 * /api/cron/hub-providers; stored at `hub:x:vet402` (no TTL; the blob carries
 * its own retrieval time, and a failed refresh keeps the last good one).
 */
import { kvGetProbe, kvSet } from "@/lib/kv";

export const KV_VET402 = "hub:x:vet402";
const SOURCE = "https://vet402.com/api/v1/sellers/export.csv";

export interface HostRecord { delivered: number; sellerFail: number; bought: number }
export interface Vet402Blob { retrievedAt: string; source: string; license: "CC-BY-4.0"; hosts: Record<string, HostRecord> }

/** Minimal CSV line split: handles double-quoted fields with commas and "" escapes. */
export function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

export function foldSellers(csv: string): Record<string, HostRecord> {
  const lines = csv.split(/\r?\n/);
  const head = splitCsv(lines[0] ?? "");
  const iHost = head.indexOf("host"), iOut = head.indexOf("outcome");
  if (iHost < 0 || iOut < 0) throw new Error("vet402 export: unexpected columns");
  const hosts: Record<string, HostRecord> = {};
  for (let k = 1; k < lines.length; k++) {
    if (!lines[k]) continue;
    const f = splitCsv(lines[k]);
    const host = (f[iHost] ?? "").toLowerCase(), outcome = f[iOut];
    if (!host || !(outcome === "delivered" || outcome === "seller" || outcome === "unsorted")) continue;
    const h = (hosts[host] ??= { delivered: 0, sellerFail: 0, bought: 0 });
    h.bought++;
    if (outcome === "delivered") h.delivered++;
    if (outcome === "seller") h.sellerFail++;
  }
  return hosts;
}

export async function refreshVet402(): Promise<{ hosts: number } | { error: string }> {
  const r = await fetch(SOURCE, { headers: { "User-Agent": "blueagent-exchange/1" }, signal: AbortSignal.timeout(60_000), cache: "no-store" });
  if (!r.ok) return { error: `vet402 HTTP ${r.status}` };
  const hosts = foldSellers(await r.text());
  if (!Object.keys(hosts).length) return { error: "vet402 export had no bought rows; kept the last record" };
  const blob: Vet402Blob = { retrievedAt: r.headers.get("x-vet402-retrieved-at") ?? new Date().toISOString(), source: SOURCE, license: "CC-BY-4.0", hosts };
  await kvSet(KV_VET402, blob);
  return { hosts: Object.keys(hosts).length };
}

export async function readVet402(): Promise<Vet402Blob | null> {
  const p = await kvGetProbe<Vet402Blob>(KV_VET402);
  return p.status === "hit" ? p.value : null;
}

/** The record for a seller across its hosts, or null when vet402 never bought from it. */
export function recordFor(blob: Vet402Blob | null, hosts: string[]): HostRecord | null {
  if (!blob) return null;
  const sum = { delivered: 0, sellerFail: 0, bought: 0 };
  for (const h of hosts) {
    const r = blob.hosts[h.toLowerCase()];
    if (r) { sum.delivered += r.delivered; sum.sellerFail += r.sellerFail; sum.bought += r.bought; }
  }
  return sum.bought ? sum : null;
}
