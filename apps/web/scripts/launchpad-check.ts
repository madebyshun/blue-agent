/**
 * launchpad-check — the launchpad readers (lib/launchpads/*, lib/token-overview)
 * and the chat surface they feed. Hermetic: no network.
 *
 *  1. Every event topic in the registry is keccak256 of its signature — a
 *     typo'd topic matches nothing and reads as "0 launches".
 *  2. The resolver: first hit wins; a READ failure is "unread", never a
 *     negative; a revert is a plain miss.
 *  3. The replies say where each number came from, say "unread" for what was
 *     not read, never show a tax for Robinhood Chain, and never print a null as 0.
 *  4. The prompt carries the launchpad facts even without tools (the
 *     "pons is part of the brainstem" answer came from a tool-free turn) and
 *     names the tools only when they are attached.
 */
import { keccak256, toBytes } from "viem";
import { TOPICS, LAUNCHPAD_INFO, BANKR_INTEGRATOR } from "../src/lib/launchpads/registry";
import { resolveLaunchpad, type ProbeSet } from "../src/lib/launchpads/resolve";
import { formatOverview, formatFeed } from "../src/lib/launchpads/format";
import { buildLaunchpadSection } from "../src/app/api/chat/system-prompt";
import type { TokenOverview } from "../src/lib/token-overview";
import type { LaunchFeed } from "../src/lib/launchpads/feed";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

console.log("1. topics are the keccak of their signatures");
const SIGS: Record<keyof typeof TOPICS, string> = {
  dopplerCreate: "Create(address,address,address,address)",
  clankerTokenCreated: "TokenCreated(address,address,address,string,string,string,string,string,int24,address,bytes32,address,address,address,uint256,address[])",
  ponsLaunched: "TokenLaunched(address,address,address,address,uint256,uint256)",
  ponsGraduated: "", // signature not published; pinned to the topic seen on live PoolGraduated logs (2026-10-01)
  flapCreated: "TokenCreated(uint256,address,uint256,address,string,string,string)",
  virtualsLaunched: "Launched(address,address,uint256,uint256,uint256,(uint8,uint16,bool,uint8,bool))",
  virtualsGraduated: "Graduated(address,address)",
};
for (const [k, sig] of Object.entries(SIGS) as Array<[keyof typeof TOPICS, string]>) {
  if (!sig) { ok(`${k} is a 32-byte topic`, /^0x[0-9a-f]{64}$/.test(TOPICS[k])); continue; }
  ok(`${k} = keccak("${sig.split("(")[0]}(…)")`, keccak256(toBytes(sig)) === TOPICS[k], keccak256(toBytes(sig)));
}
ok("Bankr marker is a full address", /^0x[0-9a-fA-F]{40}$/.test(BANKR_INTEGRATOR));
ok("Pons is Robinhood-only, Zora Base-only", LAUNCHPAD_INFO.pons.chains.join() === "robinhood" && LAUNCHPAD_INFO.zora.chains.join() === "base");

(async () => {
  console.log("2. resolver semantics");
  const T = "0x1111111111111111111111111111111111111111";
  const hitRes = { launchpad: "pons" as const, name: "Pons", stage: "bonding_curve" as const, facts: ["on curve"] };
  let ran: string[] = [];
  const set = (...ps: Array<[string, () => Promise<unknown>]>): ProbeSet =>
    ps.map(([id, f]) => [id, async () => { ran.push(id); return f(); }]) as ProbeSet;

  ran = [];
  let r = await resolveLaunchpad("robinhood", T, set(
    ["a", async () => ({ hit: false })],
    ["b", async () => ({ hit: true, res: hitRes })],
    ["c", async () => ({ hit: true, res: { ...hitRes, launchpad: "clanker" } })],
  ));
  ok("first hit wins", r.launchpad === "pons");
  ok("probes stop at the first hit", ran.join() === "a,b", ran.join());

  r = await resolveLaunchpad("base", T, set(
    ["doppler", async () => { throw new Error("HTTP request failed: 429 Too Many Requests"); }],
    ["clanker", async () => ({ hit: false })],
  ));
  ok("a network failure is 'unread'", r.unread.join() === "doppler", r.unread.join());
  ok("…and the answer says it is not a negative", r.launchpad === null && /not a negative/.test(r.facts[0]), r.facts[0]);

  r = await resolveLaunchpad("base", T, set(
    ["zora", async () => { throw new Error('The contract function "hooks" reverted.'); }],
    ["clanker", async () => ({ hit: false })],
  ));
  ok("a revert is a plain miss", r.unread.length === 0 && /not from any launchpad/.test(r.facts[0]), r.facts[0]);

  let threw = false;
  try { await resolveLaunchpad("base", "NVDA", set()); } catch { threw = true; }
  ok("a non-address is refused", threw);

  console.log("3. replies");
  const base: TokenOverview = {
    chain: "robinhood", token: "0xC00899951D84ee5aFb1BF22Df1d91d5206457D86",
    onchain: { name: "ZIP", symbol: "ZIP", decimals: 18, totalSupply: "1,000,000,000", isContract: true },
    stockToken: null,
    launchpad: { chain: "robinhood", token: "0xC00899951D84ee5aFb1BF22Df1d91d5206457D86", launchpad: "pons", name: "Pons (Pons Family)", stage: "graduated", facts: ["graduated from its Pons curve into a Uniswap v4 pool", "curve 0xabc"], unread: [] },
    market: { priceUsd: 0.000144, pools: [{ name: "ZIP / WETH", dex: "pons-v2-dex", reserveUsd: 23882, volume24hUsd: 944973, change24hPct: 150.9 }], status: "ok" },
  };
  let txt = formatOverview(base);
  ok("names the launchpad and stage", txt.includes("**Pons (Pons Family)** — graduated from its Pons curve into a Uniswap v4 pool.") && !/graduated to its DEX pool/.test(txt), txt);
  ok("names the price source", txt.includes("(GeckoTerminal)"));
  ok("drops the raw curve address line", !txt.includes("curve 0xabc"));
  ok("says RH tax is NOT measured", /no tax check for Robinhood Chain/.test(txt));
  txt = formatOverview({ ...base, market: { priceUsd: null, pools: [], status: "none_listed" } });
  ok("not listed is not proof", /not proof there is none/.test(txt));
  txt = formatOverview({ ...base, onchain: { ...base.onchain, isContract: false } });
  ok("no code = not a token on that chain", /has no contract code on Robinhood Chain/.test(txt));
  txt = formatOverview({ ...base, chain: "base", stockToken: { ticker: "NVDA", name: "NVIDIA Corporation", venue: "Base B20 stock token (Coinbase)" }, launchpad: null });
  ok("a registered stock token is labelled by registry", txt.includes("Base B20 stock token (Coinbase) tracking NVDA"));

  const feed: LaunchFeed = {
    chain: "robinhood", windowMinutes: 60,
    counts: [{ id: "pons", name: "Pons (Pons Family)", launches: 146 }, { id: "flap", name: "Flap (flap.sh)", launches: null }],
    graduations: { windowHours: 24, items: [{ launchpad: "Pons (Pons Family)", token: "0xC00899951D84ee5aFb1BF22Df1d91d5206457D86", symbol: "ZIP" }], unread: [] },
    newPools: { minReserveUsd: 10_000, items: null },
  };
  txt = formatFeed(feed);
  ok("counts name their source and window", txt.includes("last 60 min") && txt.includes("Pons (Pons Family) 146"), txt);
  ok("an unread count is said, never shown as 0", txt.includes("Could not count: Flap (flap.sh)") && !/Flap \(flap\.sh\) 0/.test(txt));
  ok("graduations listed by contract", txt.includes("ZIP · Pons (Pons Family) · `0xC008"));
  ok("unread new pools are said", txt.includes("New pools could not be read"));
  ok("facts, not picks", /not picks/.test(txt));

  console.log("4. prompt");
  const off = buildLaunchpadSection(false);
  const on = buildLaunchpadSection(true);
  ok("tool-free prompt knows what Pons is", /Pons \(Pons Family\)\*\* — the largest launchpad on Robinhood Chain/.test(off));
  ok("tool-free prompt names no tool", !/check_token|new_tokens/.test(off));
  ok("with tools, both tools are named", on.includes("check_token") && on.includes("new_tokens"));
  ok("crypto questions are kept away from /hood", /Never send a question about a crypto or memecoin token to \/hood/.test(off));
  ok("Bankr is a fact, with no integration claimed", /it has no Bankr integration/.test(off));

  console.log(failures === 0 ? "\nlaunchpad-check: PASS" : `\nlaunchpad-check: FAIL — ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})();
