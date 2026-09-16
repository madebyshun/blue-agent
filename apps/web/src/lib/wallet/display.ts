/**
 * Display rules for wallet holdings — the two view-only switches the three
 * holdings tables and the account card all have to agree on.
 *
 * ── Why a module and not two booleans per file ────────────────────────────────
 * There are four surfaces that render the same money: `BankClient`'s account
 * card, `TokenTable` (Base, Moralis), `RhTokenTable` (Robinhood, Blockscout) and
 * `StockTable` (both venues). "How complete is this read?" was answered locally
 * in three of them and two of the three answers were wrong, which is why
 * `read-state.ts` exists. This is the same shape of question one layer up — what
 * do we SHOW of what we read — so it gets the same treatment before it has a
 * chance to drift: one threshold, one mask, one definition of dust.
 *
 * ── The honesty contract ──────────────────────────────────────────────────────
 * Both switches are DISPLAY-ONLY. Neither cancels a read, changes a derivation,
 * or moves a total. Concretely:
 *
 *   1. A hidden row is still COUNTED. Every table sums its holdings BEFORE
 *      filtering, so turning "hide small balances" on can never make the figure
 *      at the top of that table go down. A filter that quietly shrinks a total
 *      is indistinguishable from a wallet that lost money.
 *
 *   2. UNPRICED IS NOT DUST. `isDust` is false for `null`/`undefined` — a token
 *      we could not price is a token whose value we do not know, and "unknown"
 *      must never be swept into "worth less than a dollar". This matters on
 *      Robinhood Chain, where most RWA tokens have no Chainlink feed at all: a
 *      threshold applied to a missing number would hide real positions behind a
 *      filter the user believes only removes dust. (CLAUDE.md: "Missing data →
 *      'unknown'. NEVER infer a fake number.")
 *
 *      The hide-small switch now removes unpriced rows TOO (ShunTr, 2026-09-13),
 *      and that does not relax this rule — it is why the rule needed a second
 *      predicate instead of a wider one. `isUnpriced` is its own function, its
 *      own count, and its own sentence; the two are hidden together and
 *      described apart. What stays forbidden is the CLASSIFICATION: no unpriced
 *      row is ever called dust, counted under the "$1" label, or implied to be
 *      inside a total it cannot be inside. See `hiddenNote` and `sumIsFloor` —
 *      the moment one of these rows exists, the total above it renders "≥".
 *
 *   3. The mask only ever wraps a figure we WOULD have shown. It never wraps
 *      "—", "unread", or a warning — a hidden balance and an unknown balance are
 *      different facts, and collapsing them would turn ignorance into a secret.
 *      It also stops at the screen: the string handed to the chat model
 *      (`balanceForPrompt`) is deliberately never masked, because the model is
 *      the one reader that would try to do arithmetic with "••••".
 *
 * Amounts are masked as well as dollar values. The thing being defended against
 * is someone reading your holdings off your screen, and a token quantity next to
 * a public market price is the same disclosure with one more step.
 */

/** Below this, in USD, a row counts as dust. One dollar, as the design asked. */
export const DUST_USD = 1;

/** What a hidden figure renders as. Not "$•••" — the currency sign is part of
 *  the figure, and a masked number should not still assert a denomination. */
export const MASK = "••••";

/**
 * Is this row small enough to hide behind the dust filter?
 *
 * `null` / `undefined` → FALSE, always. See rule 2 above: an unpriced row is
 * unknown, not small. This is the single most important line in the file.
 */
export function isDust(usdValue: number | null | undefined): boolean {
  return typeof usdValue === "number" && Number.isFinite(usdValue) && usdValue < DUST_USD;
}

/**
 * Do we have NO price for this row at all?
 *
 * The exact complement of "priced", and deliberately a SECOND predicate rather
 * than a widening of `isDust`. Rule 2 above is not an implementation detail we
 * are now working around — it is the reason these two must stay apart:
 *
 *   · `isDust(x)`     answers "we priced it, and the price is tiny".
 *   · `isUnpriced(x)` answers "we never got a price, so the value is unknown".
 *
 * They are hidden by the SAME user-facing switch (ShunTr, 2026-09-13: "ngoài ẩn
 * token dưới $1, cần ẩn token không có giá trị") and they are COUNTED and
 * NAMED separately everywhere, because they license different sentences. A dust
 * row is still inside the total below it; an unpriced row never could be, at
 * any setting — so "still counted in the total" is true of the first and a lie
 * about the second. Merging them under a "< $1" label would state a price for
 * rows we failed to price, which is the fabrication CLAUDE.md rules out.
 *
 * MEASURED 2026-09-13, 0xb058…3b5f on Base: 41 rows, **29 unpriced** (mostly
 * airdrop spam). `isDust` is false for every one of them by contract, so before
 * this predicate existed the switch could not touch the bulk of the noise it
 * was put there to remove.
 */
export function isUnpriced(usdValue: number | null | undefined): boolean {
  return !(typeof usdValue === "number" && Number.isFinite(usdValue));
}

/** What the hide-small switch removed, split by WHY each row went. */
export interface HideSplit<T> {
  /** Rows that survived. Identity-equal to the input when the switch is off. */
  shown: T[];
  /** Hidden because we priced them and the price was under `DUST_USD`. */
  dust: number;
  /** Hidden because we have no price — unknown value, not a small one. */
  unpriced: number;
  /** `dust + unpriced`. */
  hidden: number;
}

/**
 * Apply the hide-small switch to one table's rows.
 *
 * One implementation for the three holdings tables, same argument as
 * `read-state.ts`: this filter was written per-file, and a filter that differs
 * between two tables showing the same wallet is a bug the user reads as missing
 * money. The counts come back with the rows so a caller cannot render the list
 * from one derivation and the footnote from another.
 *
 * `hide === false` returns the original array unfiltered — no copy, no counts —
 * because the switch being off is not a filter that hid nothing, and a caller
 * showing "0 hidden" would be describing a control the user never touched.
 */
export function splitByValue<T>(
  rows: T[],
  valueOf: (row: T) => number | null | undefined,
  hide: boolean,
): HideSplit<T> {
  if (!hide) return { shown: rows, dust: 0, unpriced: 0, hidden: 0 };
  const shown: T[] = [];
  let dust = 0, unpriced = 0;
  for (const r of rows) {
    const v = valueOf(r);
    if (isDust(v)) dust++;
    else if (isUnpriced(v)) unpriced++;
    else shown.push(r);
  }
  return { shown, dust, unpriced, hidden: dust + unpriced };
}

/**
 * The one sentence describing what the switch removed. `null` when it removed
 * nothing — a filter that hid nothing has nothing to confess.
 *
 * Written here, once, so all three tables say it identically and so the two
 * clauses can never be collapsed into one by a later edit. Each clause carries
 * its own claim about the total, and those claims are opposites:
 *
 *   dust     → "still counted"  — the row is inside the figure above, just not
 *                                 on screen. Hiding it did not move the total.
 *   unpriced → "never counted"  — there is no number to add. The total above is
 *                                 a LOWER BOUND, which is why every caller also
 *                                 passes `sumIsFloor` into its "≥" prefix.
 */
export function hiddenNote(s: { dust: number; unpriced: number }): string | null {
  const d = s.dust > 0 ? `${s.dust} under $${DUST_USD} hidden — still counted in the total` : null;
  const u = s.unpriced > 0 ? `${s.unpriced} with no price hidden — value unknown, never in the total` : null;
  if (d && u) return `${d}. ${u}.`;
  return d ? `${d}.` : u ? `${u}.` : null;
}

/**
 * Does a sum over these rows UNDERSTATE what the wallet holds?
 *
 * True as soon as one row that counts toward the total has no price: those rows
 * contribute 0 to the sum, so the figure is a floor and must render with "≥".
 *
 * This is NOT the same question `read-state.ts` answers. `resolveRead` asks how
 * much of the LIST we obtained; this asks how much of the list we could PRICE.
 * Both make the total a floor and either alone is sufficient — a complete list
 * of tokens, 29 of which have no price, still sums to less than the wallet is
 * worth. `net-worth.ts:129` already got this right for the headline figure
 * ("some tokens have no price" → `isFloor`); the per-table totals printed a
 * flat, confident "$8.24" over the same holdings.
 *
 * It also has to survive the filter: hiding the unpriced rows removes the last
 * on-screen evidence that the sum is short, so the "≥" is computed over ALL
 * rows and never over the visible ones.
 */
export function sumIsFloor<T>(
  rows: T[],
  valueOf: (row: T) => number | null | undefined,
  counted: (row: T) => boolean = () => true,
): boolean {
  return rows.some(r => counted(r) && isUnpriced(valueOf(r)));
}

/**
 * Wrap a figure the eye toggle should be able to hide.
 *
 * Pass the FORMATTED string, not the number, so the caller decides what counts
 * as a figure — `maskFigure("—", true)` still returns "—" only because callers
 * are expected not to ask. Keep the guard at the call site: mask the branch that
 * prints a number, leave the branch that prints an absence alone.
 */
export function maskFigure(s: string, hidden?: boolean): string {
  return hidden ? MASK : s;
}
