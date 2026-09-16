/**
 * Which token actually lands on the other chain.
 *
 * ── The bug this module exists to make impossible ─────────────────────────────
 * `bridge-prepare` used to ask Relay for the ORIGIN token's address on the
 * DESTINATION chain:
 *
 *     destinationCurrency: originCurrency,   // "same token, other chain"
 *
 * A contract address is chain-local. Base USDC's address does not exist on
 * Robinhood Chain, so every ERC-20 bridge in either direction failed with
 * `INVALID_INPUT_CURRENCY` — and the route flattened that into "NO_ROUTE",
 * which blamed the token pair for a malformed request of our own making.
 * Native ETH worked only because the zero address means "native" on every
 * chain, i.e. the one case where the bug's premise is accidentally true.
 *
 * ── Why a lookup and not a symbol match ───────────────────────────────────────
 * Relay exposes two token lists and they are NOT interchangeable:
 *
 *   · `/currencies/v2` is the open list. On chain 4663 it returns ~50 entries
 *     including THREE different tokens called "FINN", three called "Goku",
 *     and memecoins named "AMD", "GME" and "COST". Matching a ticker against
 *     that list is how a user asking for a dollar receives a joke.
 *   · `/chains` → `erc20Currencies` is Relay's own curated BRIDGING allow-list:
 *     7 entries on Base, 1 on Robinhood. Nothing enters it without Relay
 *     adding it. That is the list this module takes.
 *
 * (CLAUDE.md: "Never resolve a stock token by ticker string… name-matching a
 * ticker is exactly how an impostor gets in.")
 *
 * ── The rule that matters most ────────────────────────────────────────────────
 * Relay is a router, not just a bridge: asked to move cbBTC to a chain that has
 * no cbBTC, it will happily SELL the cbBTC and deliver USDG. MEASURED — 0.001
 * cbBTC → 76.88 USDG, HTTP 200, no warning. So the auto-resolver refuses
 * anything but a same-asset or dollar-to-dollar move, and a dollar-to-dollar
 * move is reported with `assetChanged: true` so the card can say the delivered
 * token is not the one that was sent. Everything else must be asked for
 * explicitly by address. A bridge that silently liquidates a position is worse
 * than a bridge that does not work.
 */

/** One currency Relay will bridge, as described by `/chains`. */
export type BridgeCurrency = {
  /** Lowercase. The zero address means native ETH — Relay's own convention. */
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  /** Relay's own flag. Base DEGEN is listed but `false`, so listed ≠ bridgeable. */
  supportsBridging: boolean;
};

/** A chain's bridgeable set: native plus the curated ERC-20 allow-list. */
export type ChainCurrencies = {
  chainId: number;
  /** Human label for error copy — "Robinhood Chain", not "4663". */
  label: string;
  native: BridgeCurrency;
  erc20: BridgeCurrency[];
};

export type PairOk = {
  ok: true;
  from: BridgeCurrency;
  to: BridgeCurrency;
  /**
   * TRUE when `to` is a different asset from `from` — today only ever a
   * dollar-for-a-different-dollar swap. The card MUST say so; a user who sends
   * USDC and is shown "USDC on Robinhood" has been told something false.
   */
  assetChanged: boolean;
  /** One sentence, safe to render verbatim. Empty when nothing changed. */
  note: string;
};

export type PairErr = {
  ok: false;
  /** Never "NO_ROUTE" — that word belongs to Relay's routing verdict alone. */
  code: "TOKEN_NOT_BRIDGEABLE" | "NO_EQUIVALENT";
  message: string;
};

export type PairResolution = PairOk | PairErr;

export const NATIVE_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/**
 * Symbols we are willing to treat as interchangeable dollars.
 *
 * Deliberately short and deliberately hand-written. Every entry is a USD
 * stablecoin whose peg is its whole purpose, so swapping one for another
 * preserves what the user was holding: a dollar. It is used for ONE decision —
 * "may these two be auto-substituted" — and never to identify a token; the
 * address always comes from Relay's allow-list, never from this set.
 *
 * Adding a non-stable here would re-open the cbBTC hole. Don't.
 */
const STABLE_SYMBOLS = new Set(["USDC", "USDT", "USDG", "DAI", "USDBC", "USDS"]);

export function isStableSymbol(symbol: string): boolean {
  return STABLE_SYMBOLS.has(symbol.trim().toUpperCase());
}

export function isNativeAddress(address: string): boolean {
  return address.trim().toLowerCase() === NATIVE_ADDRESS;
}

/** Every currency on a chain that Relay will actually move. */
export function bridgeableOf(chain: ChainCurrencies): BridgeCurrency[] {
  return [chain.native, ...chain.erc20].filter((c) => c.supportsBridging);
}

function findBridgeable(chain: ChainCurrencies, address: string): BridgeCurrency | undefined {
  const want = address.trim().toLowerCase();
  return bridgeableOf(chain).find((c) => c.address === want);
}

function listSymbols(chain: ChainCurrencies): string {
  const syms = bridgeableOf(chain).map((c) => c.symbol);
  return syms.length ? syms.join(", ") : "nothing";
}

export type ResolveOpts = {
  /**
   * A destination address the CALLER chose. Validated but never second-guessed —
   * an explicit choice is the user's, and cross-asset moves are legitimate as
   * long as nobody is auto-enrolled in one.
   */
  explicitTo?: string;
  /**
   * The destination chain's canonical dollar, as THIS APP defines it
   * (`WALLET_CHAINS[chain].stable`). Used for exactly one decision: which
   * stablecoin to deliver when the destination bridges more than one and the
   * user named none. See the tie-break note in step 3.
   */
  preferredStable?: string;
};

/**
 * Resolve the destination currency for a bridge.
 *
 * @param from          origin chain's bridgeable set
 * @param to            destination chain's bridgeable set
 * @param originAddress the token being sent, on the ORIGIN chain (0x… or zero for native)
 */
export function resolveBridgePair(
  from: ChainCurrencies,
  to: ChainCurrencies,
  originAddress: string,
  opts: ResolveOpts = {},
): PairResolution {
  const { explicitTo, preferredStable } = opts;
  const src = findBridgeable(from, originAddress);
  if (!src) {
    return {
      ok: false,
      code: "TOKEN_NOT_BRIDGEABLE",
      message: `That token can't be bridged from ${from.label}. Relay moves: ${listSymbols(from)}.`,
    };
  }

  // ── The caller named a destination token. Validate, don't interpret. ───────
  if (explicitTo && explicitTo.trim()) {
    const dst = findBridgeable(to, explicitTo);
    if (!dst) {
      return {
        ok: false,
        code: "TOKEN_NOT_BRIDGEABLE",
        message: `That destination token can't be bridged on ${to.label}. Relay moves: ${listSymbols(to)}.`,
      };
    }
    const changed = dst.symbol.toUpperCase() !== src.symbol.toUpperCase();
    return {
      ok:   true,
      from: src,
      to:   dst,
      assetChanged: changed,
      note: changed
        ? `You send ${src.symbol} and receive ${dst.symbol} — a different token, at Relay's rate.`
        : "",
    };
  }

  // ── Auto-resolve. Three permitted moves, in order. ────────────────────────
  //
  // 1. Native to native. The zero address is the same claim on both chains
  //    ("the gas token"), which is the single case where the old
  //    `destinationCurrency: originCurrency` was right.
  if (isNativeAddress(src.address)) {
    if (!to.native.supportsBridging) {
      return {
        ok: false,
        code: "NO_EQUIVALENT",
        message: `${to.label} does not accept bridged ${to.native.symbol}.`,
      };
    }
    return { ok: true, from: src, to: to.native, assetChanged: false, note: "" };
  }

  // 2. The same asset exists on the far side. Matching by symbol is safe HERE
  //    and only here: the candidates are Relay's curated allow-list, not the
  //    open token list. Ambiguity still refuses rather than picks — a duplicate
  //    symbol inside the allow-list would mean Relay changed shape under us.
  const sym = src.symbol.trim().toUpperCase();
  const sameSymbol = bridgeableOf(to).filter((c) => c.symbol.trim().toUpperCase() === sym);
  if (sameSymbol.length === 1) {
    return { ok: true, from: src, to: sameSymbol[0]!, assetChanged: false, note: "" };
  }
  if (sameSymbol.length > 1) {
    return {
      ok: false,
      code: "NO_EQUIVALENT",
      message: `${to.label} lists more than one ${src.symbol}. Name the destination token explicitly.`,
    };
  }

  // 3. A dollar for a different dollar. Permitted because what the user holds —
  //    a dollar — survives the trip, and on Robinhood Chain it is the ONLY way
  //    to get dollars across.
  //
  //    Reaching here means step 2 found NO destination currency with this
  //    symbol, so whatever we return is a different token and `assetChanged` is
  //    unconditionally true.
  if (isStableSymbol(src.symbol)) {
    const stables = bridgeableOf(to).filter((c) => isStableSymbol(c.symbol));
    const dollarFor = (dst: BridgeCurrency): PairOk => ({
      ok:   true,
      from: src,
      to:   dst,
      assetChanged: true,
      // One sentence, identical on both paths below. The card must not be able
      // to tell "only candidate" from "our preferred candidate" — the user is
      // receiving a different token either way, and that is the whole fact.
      note: `${to.label} has no ${src.symbol}. Bridging delivers ${dst.symbol}, a different stablecoin, at Relay's rate.`,
    });

    if (stables.length === 1) return dollarFor(stables[0]!);

    if (stables.length > 1) {
      // TIE-BREAK. Base bridges both USDC and USDT, so USDG → Base has two
      // answers and refusing outright would break the most common return trip
      // in the app. We resolve it with the destination chain's canonical dollar
      // — `WALLET_CHAINS[chain].stable`, the token this wallet already calls
      // cash there, prices the balance card in, and settles credits in. That is
      // a choice the app has already made and shown the user, not a coin flip
      // performed on their money at bridge time.
      //
      // Matched by ADDRESS against the bridgeable set, so an unknown, delisted
      // or non-bridgeable preference simply fails to match and we fall through
      // to refusing. Fails closed: the bad outcome of a stale constant here is
      // "asks the user to choose", never "sends a token nobody named".
      const want = preferredStable?.trim().toLowerCase();
      const preferred = want ? stables.find((c) => c.address === want) : undefined;
      if (preferred) return dollarFor(preferred);

      return {
        ok: false,
        code: "NO_EQUIVALENT",
        message: `${to.label} has no ${src.symbol} and more than one stablecoin to choose from (${stables.map((s) => s.symbol).join(", ")}). Name the destination token explicitly.`,
      };
    }
  }

  // 4. Everything else. Relay WOULD fill this by selling the asset — that is
  //    precisely why we stop. Say what the chain does take, so the answer is
  //    actionable rather than just a refusal.
  return {
    ok: false,
    code: "NO_EQUIVALENT",
    message: `${src.symbol} doesn't exist on ${to.label}, and bridging it would sell it for another token. ${to.label} accepts: ${listSymbols(to)}. Name a destination token explicitly if that's what you want.`,
  };
}

/**
 * Parse a `/chains` entry into the shape above.
 *
 * Tolerant by construction: Relay adds fields, and an unknown field must never
 * turn into a thrown error on a payment path. Anything unparseable is dropped
 * from the allow-list, which fails CLOSED — a dropped token is a token we
 * refuse to bridge, not one we bridge blindly.
 */
type RawCurrency = {
  address?: string; symbol?: string; decimals?: number; supportsBridging?: boolean;
};
type RawChain = {
  id?: number; displayName?: string; name?: string;
  currency?: RawCurrency; erc20Currencies?: RawCurrency[];
};

function parseCurrency(raw: RawCurrency | undefined, fallbackNative: boolean): BridgeCurrency | null {
  if (!raw) return null;
  const address = typeof raw.address === "string" ? raw.address.trim().toLowerCase() : "";
  if (!/^0x[0-9a-f]{40}$/.test(address)) return null;
  const decimals = Number(raw.decimals);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) return null;
  const symbol = typeof raw.symbol === "string" ? raw.symbol.trim() : "";
  if (!symbol) return null;
  return {
    address: address as `0x${string}`,
    symbol,
    decimals,
    // Native entries omit the flag on some chains; a chain that is listed at
    // all bridges its own gas token. ERC-20s must say so explicitly.
    supportsBridging: raw.supportsBridging === true || (fallbackNative && raw.supportsBridging == null),
  };
}

export function parseChainCurrencies(raw: RawChain | undefined): ChainCurrencies | null {
  if (!raw || typeof raw.id !== "number") return null;
  const native = parseCurrency(raw.currency, true);
  if (!native) return null;
  const erc20 = (Array.isArray(raw.erc20Currencies) ? raw.erc20Currencies : [])
    .map((c) => parseCurrency(c, false))
    .filter((c): c is BridgeCurrency => c !== null);
  return {
    chainId: raw.id,
    label:   (raw.displayName || raw.name || `chain ${raw.id}`).trim(),
    native,
    erc20,
  };
}
