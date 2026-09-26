/**
 * Choosing which x402 payment requirement to sign, for an endpoint WE DO NOT RUN.
 *
 * Pure: values in, a verdict out. No fetch, no wallet, no imports. Lives in its
 * own module so `scripts/external-payee-check.ts` can drive every refusal branch
 * with fixtures, because the refusals are the entire safety story here.
 *
 * ── WHAT THIS GUARDS AGAINST ────────────────────────────────────────────────
 * A community tool's 402 is written by the BUILDER. Anyone can register a tool.
 * So the response that tells us "sign 10000 units to 0x…" is untrusted input, and
 * the thing being produced from it is an EIP-3009 authorization — a signature that
 * moves the user's USDC. There is no undo and no chargeback.
 *
 * 🔴 Three ways a naive reader of that JSON loses the user money, all of which
 * look like ordinary code:
 *
 *   1. `accepts[0]`  — MEASURED 2026-09-26 on the one live registered endpoint:
 *      it publishes `accepts` (Base USDC), `accepts_bsc` (BSC, 18 decimals,
 *      amount 10000000000000000) and `acceptsV1`. Index 0 happens to be Base
 *      today. Nothing makes that stable, and a BSC entry read as Base would have
 *      the user sign an authorization against a different asset entirely.
 *      Select by network AND asset. Never by position.
 *
 *   2. trusting the amount — the Hub card says "$0.01" because that is what the
 *      builder typed into the registry at submit time. The 402 is generated live
 *      and can say anything. If we sign what the 402 asks, a builder can advertise
 *      $0.01 and charge $500, and the only place the real figure appears is inside
 *      a typed-data blob most people approve without reading. The advertised price
 *      is therefore a CEILING, enforced here.
 *
 *   3. falling back — `?? PAY_TO_WALLET`, `?? 0`, or "if discovery fails, use the
 *      registry address" all turn a failed read into a confident payment. This
 *      module has no fallback by construction: every failure is a named refusal,
 *      and the caller has nothing to sign.
 *
 * ── WHY THE PAYEE IS THE BUILDER ────────────────────────────────────────────
 * EIP-3009 `transferWithAuthorization` settles to exactly ONE recipient. There is
 * no on-chain fan-out, so the payee IS the revenue split — 100% to whoever is in
 * `to`. For an external tool that has to be the builder: our proxy
 * (`/api/hub/tools/<id>/call`) does not verify or settle anything, it forwards the
 * X-PAYMENT header, and the BUILDER's endpoint verifies `authorization.to` against
 * the builder's own wallet. Signing the Blue treasury for it — which is what
 * shipped until now — is rejected by that verifier, which is why no registered
 * tool had ever been paid (callCount 2, revenueTotal 0: two people tried, both
 * were correctly refused).
 *
 * The alternatives were considered and are not refactors:
 *   • route to Blue, forward to the builder later → Blue holds a third party's
 *     money. A CUSTODY change, and ShunTr's call.
 *   • split → two authorizations, so two wallet signatures per call.
 * Both are real products. Neither is this bug fix.
 */

/** Base mainnet USDC. The only asset this app has ever settled. */
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
/** Base mainnet, in the two spellings x402 implementations use in the wild. */
const BASE_NETWORKS = new Set(["eip155:8453", "base", "8453"]);

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

/** One entry of the `accepts` array, as a builder might send it. All optional:
 *  this is untrusted JSON, and the point of this module is to prove otherwise. */
export type RawAccept = {
  scheme?: unknown;
  network?: unknown;
  asset?: unknown;
  payTo?: unknown;
  amount?: unknown;
  maxAmountRequired?: unknown;
  extra?: { name?: unknown; version?: unknown } | unknown;
};

export type SelectedAccept = {
  /** Checked: 0x + 40 hex. Safe to put in `authorization.to`. */
  payTo: string;
  /** Checked: a positive integer string, ≤ the advertised ceiling. USDC 6dp. */
  amountUnits: string;
  asset: string;
  network: string;
  /** EIP-712 domain for the USDC contract. Defaults are the canonical ones. */
  domainName: string;
  domainVersion: string;
};

export type SelectResult =
  | { ok: true; accept: SelectedAccept }
  /**
   * `reason` is shown to the user, so it says what happened and never blames
   * them. `code` is for the guard and for logs.
   *
   * 🔴 No `reason` here may contain "Nothing was signed" — the CALLER appends
   * that once, uniformly, so the reassurance is present on every refusal
   * branch including ones added later. Saying it here too would print it
   * twice on some branches and, worse, would make it look optional: a branch
   * whose author forgot the sentence would be the one branch that reads as if
   * money might have moved. Pinned by `scripts/external-payee-check.ts`.
   */
  | { ok: false; code: SelectFailure; reason: string };

export type SelectFailure =
  | "no_accepts"
  | "no_base_usdc"
  | "bad_payee"
  | "bad_amount"
  | "over_advertised"
  | "bad_scheme";

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** USDC units → a human figure with no trailing-zero noise. "10000" → "0.01". */
const usd = (units: number): string =>
  (units / 1e6).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");

/**
 * Pull the requirements array out of a 402 body.
 *
 * Two spellings exist in the wild: `accepts` (the x402 field, and what the one
 * live registered endpoint sends) and `paymentRequirements` (some server SDKs).
 *
 * 🔴 Nothing else is guessed, and in particular "the only array in the body" is
 * NOT a rule. MEASURED 2026-09-26: the live endpoint's body also holds
 * `accepts_bsc` (BSC, 18 decimals) and `acceptsV1`. A body missing `accepts`
 * therefore returns null — refusing — rather than the BSC list, because
 * "an array is present" and "the array we asked for is present" are different
 * facts and only the second one is safe to sign against.
 */
export function extractAccepts(body: unknown): unknown[] | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { accepts?: unknown; paymentRequirements?: unknown };
  if (Array.isArray(b.accepts)) return b.accepts;
  if (Array.isArray(b.paymentRequirements)) return b.paymentRequirements;
  return null;
}

/**
 * Convert an advertised price like "$0.01" to USDC's 6-decimal integer units.
 * Returns null when it cannot be read — which must NOT be treated as 0 or as
 * "no limit"; the caller has to refuse, because an unreadable ceiling is not an
 * absent ceiling.
 */
export function priceToUnits(price: string | undefined | null): number | null {
  if (!price) return null;
  const n = Number.parseFloat(String(price).replace("$", "").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1_000_000);
}

/**
 * Pick the Base-USDC requirement from a builder's 402, or refuse.
 *
 * @param accepts        the `accepts` array, verbatim and untrusted.
 * @param maxUnits       the ceiling in USDC units — the price the Hub advertised.
 *                       An amount above this is refused, NOT clamped: clamping
 *                       would sign an authorization the endpoint then rejects,
 *                       and the user would have signed for nothing.
 */
export function selectBaseUsdcAccept(accepts: unknown, maxUnits: number | null): SelectResult {
  if (!Array.isArray(accepts) || accepts.length === 0) {
    return { ok: false, code: "no_accepts", reason: "This tool did not say how to pay it." };
  }

  // Network AND asset, both, and case-insensitively on the address — a checksum
  // difference is not a different token, and rejecting on it would refuse honest
  // endpoints. See hazard 1 in the header for why position is not used.
  const match = (accepts as RawAccept[]).find(
    (a) =>
      BASE_NETWORKS.has(str(a.network).toLowerCase()) &&
      str(a.asset).toLowerCase() === BASE_USDC.toLowerCase(),
  );
  if (!match) {
    return {
      ok: false,
      code: "no_base_usdc",
      reason: "This tool does not take USDC on Base, which is the only rail the Hub signs.",
    };
  }

  // "exact" is the only scheme whose semantics we know. An unknown scheme may
  // mean something entirely different by the same field names.
  const scheme = str(match.scheme) || "exact";
  if (scheme !== "exact") {
    return { ok: false, code: "bad_scheme", reason: `Unsupported payment scheme "${scheme}".` };
  }

  const payTo = str(match.payTo);
  if (!ADDR_RE.test(payTo)) {
    return { ok: false, code: "bad_payee", reason: "This tool's payout address is not a valid address." };
  }

  // `maxAmountRequired` is the x402 field; `amount` is what several live
  // endpoints actually send. Prefer the spec field, accept the common one.
  const rawAmount = str(match.maxAmountRequired) || str(match.amount);
  // Digits only. `Number()` would accept "1e9", " 10 ", "0x2710" and "Infinity",
  // every one of which is a different number than it looks like.
  if (!/^\d+$/.test(rawAmount)) {
    return { ok: false, code: "bad_amount", reason: "This tool did not state a readable price." };
  }
  const units = Number(rawAmount);
  if (!Number.isSafeInteger(units) || units <= 0) {
    return { ok: false, code: "bad_amount", reason: "This tool stated a price the Hub cannot sign." };
  }

  // 🔴 Hazard 2. An unreadable ceiling refuses; it never becomes "no ceiling".
  if (maxUnits === null) {
    return {
      ok: false,
      code: "over_advertised",
      reason: "The Hub could not read this tool's listed price, so it will not sign a payment for it.",
    };
  }
  if (units > maxUnits) {
    return {
      ok: false,
      code: "over_advertised",
      reason:
        `This tool is asking for ${usd(units)} USDC but is listed at ${usd(maxUnits)}.`,
    };
  }

  const extra = (match.extra ?? {}) as { name?: unknown; version?: unknown };
  return {
    ok: true,
    accept: {
      payTo,
      amountUnits: rawAmount,
      asset: BASE_USDC,
      network: "eip155:8453",
      // The canonical USDC domain. Taken from the endpoint only if it supplies
      // one, because getting this wrong makes a signature the token rejects.
      domainName: str(extra.name) || "USD Coin",
      domainVersion: str(extra.version) || "2",
    },
  };
}
