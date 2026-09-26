/**
 * Buy/sell tax read STRAIGHT OFF the token contract on Base 8453.
 *
 * WHY THIS EXISTS
 * ---------------
 * MEASURED 2026-09-26 against the 18 tools on /api/mcp: `honeypot-check`
 * returned `tax: "unknown"` for 12 of 12 tokens and still answered
 * `verdict: SAFE` at `confidence: 90-99`. A reader sees "SAFE, 95% confidence"
 * and understands "we verified this is safe to trade". What it actually meant
 * was "we never read the tax and are telling you it is fine anyway" — the tax
 * string was produced by the LLM from a prompt that only *asked* it to say
 * "unknown", with nothing in the tool that had ever looked at the contract.
 *
 * Per CLAUDE.md: prompts do not prevent hallucination, data sources do. So this
 * module is the data source, and `honeypot-check` derives its tax fields and
 * its confidence ceiling from what this returns — never from the model.
 *
 * WHY SELECTORS AND NOT THE CONTRACT NAME
 * ---------------------------------------
 * The Virtuals `AgentToken` / `AgentTokenV4` templates expose
 * `totalBuyTaxBasisPoints()` and `totalSellTaxBasisPoints()`; V4 additionally
 * exposes `blacklists(address)`. The obvious identification is "does Basescan
 * say ContractName == AgentTokenV4", and that is the wrong test twice over:
 * `ContractName` is a string the DEPLOYER chooses (an impostor can call itself
 * AgentTokenV4 and expose nothing), and it is absent entirely on an unverified
 * contract that nonetheless implements the interface. A SELECTOR cannot lie
 * about this — it either answers an `eth_call` with a well-formed word or it
 * does not, and that is a property of the deployed bytecode.
 *
 * WHAT A FAILED READ MUST NOT BECOME
 * ----------------------------------
 * `null`, and nothing else. Not `0` (a 0% tax is a strong safety signal and
 * inventing one is the exact false-SAFE this module exists to stop), not the
 * string `"unknown"` (which renders as data in a tax field and reads as a
 * measurement), not "high" (an inferred negative from absent data). The caller
 * gets `tax_read: "failed"` and is expected to cap what it claims.
 *
 * TIER 2 — SIMULATION — IS DELIBERATELY ABSENT. A buy/sell round-trip against
 * a forked or `eth_call`-overridden state would cover the tokens this tier
 * misses (any non-Virtuals template), and it is a separate change: it needs a
 * funded simulation path and an archive/override-capable RPC, neither of which
 * this module has. Until then a non-template token is honestly unread, which is
 * why the confidence clamp in `honeypot-check` is the load-bearing half of the
 * fix and not a nice-to-have.
 */
import { encodeFunctionData, toFunctionSelector } from "viem";
import { TX_CHAINS } from "@/lib/tx-chains";

/** Derived, not pasted — a hand-copied selector is a silent wrong-function call. */
export const SEL_BUY_TAX = toFunctionSelector("totalBuyTaxBasisPoints()");
export const SEL_SELL_TAX = toFunctionSelector("totalSellTaxBasisPoints()");
export const SEL_BLACKLISTS = toFunctionSelector("blacklists(address)");

/** One raw selector probe. `ok: false` covers revert, RPC error and timeout
 *  alike — all three mean the same thing here: we did not read a tax. */
export type Probe = { ok: true; data: string } | { ok: false };

export type TaxReadStatus = "template" | "failed";

export interface TaxRead {
  /** `template` ⇒ both tax selectors answered. Only this value may unlock a
   *  confidence of 90+ in `honeypot-check`. */
  tax_read: TaxReadStatus;
  tax_units: "basis_points";
  /** Basis points (100 = 1%). `null` means UNREAD — never 0, never a guess. */
  buy_tax: number | null;
  sell_tax: number | null;
  /** Same numbers as a display string, formatted in code from the bps above. */
  buy_tax_pct: string | null;
  sell_tax_pct: string | null;
  /** `true` the selector answered, `false` this template provably has none,
   *  `null` we could not tell. See `interpretTaxProbes` for why all three. */
  has_blacklist: boolean | null;
  template: "AgentTokenV4" | "AgentToken" | null;
  /** How the numbers were obtained, for the response's own audit trail. */
  tax_source: string | null;
}

/** A 32-byte ABI word and nothing else. A fallback() that answers `0x` is not
 *  an implementation of the selector, and neither is a 4-byte revert string. */
const WORD = /^0x[0-9a-fA-F]{64}$/;

/**
 * 10000 bps = 100%. A read above that is not a tax, it is a selector collision
 * on a contract whose fallback returns arbitrary bytes, so it degrades to
 * "unread" rather than being reported as a 40000% tax. Exactly 10000 IS kept —
 * a genuine 100% sell tax is the honeypot this tool is named after, and it must
 * survive to the verdict rather than be discarded as implausible.
 */
const MAX_BPS = 10_000;

function decodeBps(p: Probe): number | null {
  if (!p.ok || !WORD.test(p.data)) return null;
  let v: bigint;
  try { v = BigInt(p.data); } catch { return null; }
  if (v > BigInt(MAX_BPS)) return null;
  return Number(v);
}

/** bps → display string, in code. 0 → "0%", 100 → "1%", 250 → "2.5%". */
export function bpsToPct(bps: number | null): string | null {
  if (bps == null) return null;
  return `${+(bps / 100).toFixed(2)}%`;
}

/** Did the selector answer at all? The VALUE of `blacklists(someAddress)` is
 *  irrelevant — we are asking whether the contract HAS a blacklist lever, and
 *  a `false` for one probe address answers that just as well as a `true`. */
function answered(p: Probe): boolean {
  return p.ok && WORD.test(p.data);
}

/**
 * PURE. Three raw probes in, one honest TaxRead out. No network, no clock.
 *
 * On `has_blacklist` being three-valued rather than a boolean: if `blacklists`
 * is silent but the two tax selectors answered, we know which template this is
 * and that template genuinely has no blacklist — a real `false`. If NOTHING
 * answered we know nothing about this contract's levers, and `false` there
 * would be an inferred negative from absent data, which CLAUDE.md forbids
 * precisely because it reads identically to a measured clean result.
 */
export function interpretTaxProbes(buy: Probe, sell: Probe, blacklist: Probe): TaxRead {
  const buy_tax = decodeBps(buy);
  const sell_tax = decodeBps(sell);
  const read = buy_tax != null && sell_tax != null;
  const blacklisted = answered(blacklist);

  return {
    tax_read: read ? "template" : "failed",
    tax_units: "basis_points",
    buy_tax: read ? buy_tax : null,
    sell_tax: read ? sell_tax : null,
    buy_tax_pct: read ? bpsToPct(buy_tax) : null,
    sell_tax_pct: read ? bpsToPct(sell_tax) : null,
    has_blacklist: blacklisted ? true : read ? false : null,
    template: blacklisted ? "AgentTokenV4" : read ? "AgentToken" : null,
    tax_source: read
      ? "totalBuyTaxBasisPoints() + totalSellTaxBasisPoints() — eth_call on Base 8453"
      : null,
  };
}

/** What a caller gets when the address is not even shaped like an address. */
export const TAX_UNREAD: TaxRead = interpretTaxProbes({ ok: false }, { ok: false }, { ok: false });

// ─── Network tier ─────────────────────────────────────────────────────────────

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/** Probes are a side quest on a paid call — they must not hold the response. */
const PROBE_TIMEOUT_MS = 6_000;

/** One `eth_call`. Every failure mode collapses to `{ ok: false }` on purpose:
 *  a revert, a 429, a JSON-RPC error object and a timeout are all "not read". */
async function ethCall(to: string, data: string): Promise<Probe> {
  try {
    const res = await fetch(TX_CHAINS.base.rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to, data }, "latest"],
      }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false };
    const d = (await res.json()) as { result?: string; error?: unknown };
    if (d.error || typeof d.result !== "string") return { ok: false };
    return { ok: true, data: d.result };
  } catch {
    return { ok: false };
  }
}

export type SelectorProbe = (address: string) => Promise<[Probe, Probe, Probe]>;

/** The live Base probe: three parallel `eth_call`s, no key, no indexer. */
export const probeBaseSelectors: SelectorProbe = async (address) => {
  const blacklistData = encodeFunctionData({
    abi: [{
      type: "function", name: "blacklists", stateMutability: "view",
      inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "bool" }],
    }],
    functionName: "blacklists",
    // The zero address is only ever the *argument*. We read whether the
    // function exists, not whether some particular wallet is blocked.
    args: ["0x0000000000000000000000000000000000000000"],
  });
  return Promise.all([
    ethCall(address, SEL_BUY_TAX),
    ethCall(address, SEL_SELL_TAX),
    ethCall(address, blacklistData),
  ]);
};

/**
 * Read a Base token's buy/sell tax. `probe` is injectable so the guard suite
 * can exercise every branch hermetically — CI runs with no network.
 */
export async function readTokenTax(
  rawAddress: string,
  probe: SelectorProbe = probeBaseSelectors,
): Promise<TaxRead> {
  const address = (rawAddress ?? "").trim();
  if (!ADDRESS.test(address)) return TAX_UNREAD;
  try {
    const [buy, sell, blacklist] = await probe(address);
    return interpretTaxProbes(buy, sell, blacklist);
  } catch {
    return TAX_UNREAD;
  }
}
