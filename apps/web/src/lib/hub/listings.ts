/**
 * Listings, follows and hire receipts for the Agents mode (R2, after TOLLY's
 * "Sell services", "Following" and "My Usage").
 *
 * LISTING — a seller proves it runs an x402 service and is listed on Blue Agent:
 *   1. sign in (the SIWE session) with the wallet it is paid to (its payTo);
 *   2. publish https://<domain>/.well-known/blueagent-agent.json containing
 *      {"payTo": "<wallet>", "token": "<token we give>"};
 *   3. we import https://<domain>/.well-known/x402 and call every Base service
 *      UNPAID: it passes only if its 402 asks for USDC on Base to that payTo.
 *   With the domain proven and one passing service, it is listed. Buyers pay the
 *   seller directly; we hold nothing and charge nothing.
 *
 * FOLLOW — a set of payTos per signed-in wallet. HIRE LOG — what a wallet paid
 * other sellers through Hire Agent (we never settle; the seller's receipt is kept).
 */
import { kv, kvGetProbe, kvMutate } from "@/lib/kv";
import { probeOne, type SellerProbe } from "@/lib/hub/exchange";

export interface Listing {
  payTo: string;
  domain: string;
  name: string;
  description: string;
  services: { url: string; priceUsd: number | null; description: string; probe: SellerProbe["result"] }[];
  verifiedAt: string;
}

const K_INDEX = "hub:listed:index";
const listKey = (p: string) => `hub:listed:${p}`;
const claimKey = (w: string) => `hub:listed:claim:${w}`;
const followKey = (w: string) => `follow:${w}`;
const hireKey = (w: string) => `hire:log:${w}`;
const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

export function cleanDomain(d: string): string | null {
  const s = d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  // No IP literals and no internal names: the verifier fetches this host.
  return DOMAIN_RE.test(s) && !/^[0-9.]+$/.test(s) && !/(^localhost$|\.local$|\.internal$|\.localhost$)/.test(s) ? s : null;
}

export async function startClaim(wallet: string, domainIn: string): Promise<{ domain: string; token: string; file: object } | string> {
  const domain = cleanDomain(domainIn);
  if (!domain) return "Enter a public domain, like api.example.com.";
  const token = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
  await kv.set(claimKey(wallet), { domain, token, at: new Date().toISOString() }, { ex: 2 * 24 * 3600 });
  return { domain, token, file: { payTo: wallet, token } };
}

async function getJson(url: string): Promise<unknown> {
  const r = await fetch(url, { signal: AbortSignal.timeout(8_000), cache: "no-store", redirect: "follow" });
  if (!r.ok) throw new Error(`${url} answered HTTP ${r.status}`);
  return r.json();
}

/** Verify the claim and, if it holds, save the listing. Returns the listing or why not. */
export async function verifyClaim(wallet: string, name: string, description: string): Promise<Listing | string> {
  const claim = await kv.get<{ domain: string; token: string }>(claimKey(wallet));
  if (!claim) return "Start again: no pending claim for this wallet (claims last 2 days).";
  const proofUrl = `https://${claim.domain}/.well-known/blueagent-agent.json`;
  let proof: { payTo?: string; token?: string };
  try { proof = (await getJson(proofUrl)) as typeof proof; } catch (e) { return `Could not read ${proofUrl}: ${(e as Error).message}`; }
  if (String(proof?.token ?? "") !== claim.token || String(proof?.payTo ?? "").toLowerCase() !== wallet) {
    return `${proofUrl} does not hold this wallet and token yet.`;
  }
  let doc: { items?: { resource?: string; description?: string; accepts?: { network?: string; payTo?: string; amount?: string; maxAmountRequired?: string }[] }[] };
  try { doc = (await getJson(`https://${claim.domain}/.well-known/x402`)) as typeof doc; } catch (e) { return `Could not read https://${claim.domain}/.well-known/x402: ${(e as Error).message}`; }
  const candidates = (doc?.items ?? []).flatMap((it) => {
    const url = String(it.resource ?? "");
    const a = (it.accepts ?? []).find((x) => (x.network === "eip155:8453" || x.network === "base") && String(x.payTo ?? "").toLowerCase() === wallet);
    if (!a || !/^https:\/\//.test(url)) return [];
    let host = ""; try { host = new URL(url).hostname; } catch { return []; }
    if (host !== claim.domain && !host.endsWith(`.${claim.domain}`)) return [];
    const raw = Number(a.amount ?? a.maxAmountRequired);
    return [{ url, priceUsd: Number.isFinite(raw) ? raw / 1e6 : null, description: String(it.description ?? "").slice(0, 200) }];
  }).slice(0, 12);
  if (!candidates.length) return "No service in your /.well-known/x402 asks for USDC on Base to this wallet, on this domain.";
  const services = await Promise.all(candidates.map(async (c) => ({ ...c, probe: (await probeOne(wallet, c.url)).result })));
  if (!services.some((s) => s.probe === "live")) return "None of your services answered an unpaid call with a 402 for USDC on Base to this wallet.";
  const listing: Listing = {
    payTo: wallet, domain: claim.domain, name: name.trim().slice(0, 60) || claim.domain,
    description: description.trim().slice(0, 400), services, verifiedAt: new Date().toISOString(),
  };
  await kv.set(listKey(wallet), listing);
  await kvMutate<string[]>(K_INDEX, [], (cur) => (cur.includes(wallet) ? null : [...cur, wallet]));
  await kv.del(claimKey(wallet));
  return listing;
}

export async function unlist(wallet: string): Promise<void> {
  await kv.del(listKey(wallet));
  await kvMutate<string[]>(K_INDEX, [], (cur) => (cur.includes(wallet) ? cur.filter((x) => x !== wallet) : null));
}

export async function readListings(): Promise<Listing[]> {
  const p = await kvGetProbe<string[]>(K_INDEX);
  const ids = p.status === "hit" ? p.value : [];
  const all = await Promise.all(ids.map((id) => kv.get<Listing>(listKey(id)).catch(() => null)));
  return all.filter((x): x is Listing => !!x);
}

export async function readListing(payTo: string): Promise<Listing | null> {
  return (await kv.get<Listing>(listKey(payTo.toLowerCase())).catch(() => null)) ?? null;
}

// ── Follow ───────────────────────────────────────────────────────────────────

export async function readFollows(wallet: string): Promise<string[]> {
  return (await kv.get<string[]>(followKey(wallet)).catch(() => null)) ?? [];
}

export async function setFollow(wallet: string, payTo: string, on: boolean): Promise<string[]> {
  const p = payTo.toLowerCase();
  let out: string[] = [];
  await kvMutate<string[]>(followKey(wallet), [], (cur) => {
    out = on ? (cur.includes(p) ? cur : [...cur, p].slice(-200)) : cur.filter((x) => x !== p);
    return out;
  });
  return out;
}

// ── Hire log ─────────────────────────────────────────────────────────────────

export interface HireRecord { at: string; payTo: string; url: string; status: number; tx: string | null; units: string | null }

export async function recordHire(wallet: string, r: HireRecord): Promise<void> {
  await kvMutate<HireRecord[]>(hireKey(wallet), [], (cur) => [r, ...cur].slice(0, 200), 120 * 24 * 3600).catch(() => {});
}

export async function readHires(wallet: string): Promise<HireRecord[]> {
  return (await kv.get<HireRecord[]>(hireKey(wallet)).catch(() => null)) ?? [];
}
