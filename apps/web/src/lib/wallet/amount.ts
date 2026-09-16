/**
 * Turning what the user asked for into what `parseUnits` will accept.
 *
 * This lived in `app/chat/components/ConfirmCardParts.tsx` — chat-card
 * furniture — until the Blue Hood sign panel needed it too. It is not chat
 * furniture: it is about a TOKEN'S SCALE, which is a property of the token and
 * not of the surface asking. Same move, same reason, as `useSpendableBalance`
 * and `UnverifiedBalance` before it: the moment a second surface needs the
 * rule, the rule needs one address.
 *
 * Deliberately dependency-free — no viem, no React — so a plain `tsx` script
 * can exercise it and so nothing here is specific to a chain or a token.
 */

/**
 * Truncate a plain decimal string to at most `dp` fractional digits. FLOORS
 * (never rounds up) so a resolved "all"/"half"/"N%" can't tip a hair over the
 * real balance. `parseUnits()` throws when a string carries more decimals than
 * the token supports — and a symbolic fraction easily does (half of an odd
 * 6-dp balance → 7 dp). Call this right before `parseUnits(amount, dec)` on any
 * client that signs.
 *
 * The flooring direction is load-bearing twice over, and both were measured:
 * the chat swap card's symbolic amounts, and the Blue Hood panel's SELL
 * presets, where the old float path used `.toFixed` — which ROUNDS UP — and a
 * balance of 0.001612535… became "0.001613", one digit ABOVE what the wallet
 * held, so the over-balance guard fired on the user's own 100% button and they
 * could never sell everything.
 *
 * Non-exponential inputs only (no caller feeds it a word or "1e-7"); returns
 * the input unchanged when it has no fractional part.
 */
export function clampDecimals(s: string, dp: number): string {
  if (!s || !s.includes(".")) return s;
  const [intPart, fracPart = ""] = s.split(".");
  const frac = dp > 0 ? fracPart.slice(0, dp) : "";
  let out = frac ? `${intPart}.${frac}` : intPart;
  if (out.includes(".")) out = out.replace(/0+$/, "").replace(/\.$/, "");
  return out;
}

// ── Quantity words ──────────────────────────────────────────────────────────
//
// Users say "send all", "swap half my USAR", "bridge max ETH" — and the LLM
// passes the word through verbatim rather than inventing a figure, because the
// number is the user's own balance and chat has not read it (#137/#138).
//
// MEASURED 2026-09-16: this rule had FIVE copies, and the fifth disagreed.
//
//     ConfirmCardParts.tsx   SYMBOLIC_AMOUNT_RE  /^(all|max|half|\d+(?:\.\d+)?%)$/i
//     WalletSendCard.tsx     QUANTITY_WORD_RE    ← identical
//     SwapCard.tsx           QUANTITY_WORD_RE    ← identical
//     RhSwapCard.tsx         QUANTITY_WORD_RE    ← identical
//     BridgeCard.tsx         isWord              /^(all|max|half|\d{1,3}%)$/i
//
// `\d{1,3}%` is not a harmless narrowing. It REJECTS "12.5%" — which the confirm
// card underneath it accepts and would have resolved — so the bridge editor
// answered "Enter an amount" for a quantity the card behind it understood
// perfectly. And it ACCEPTS "999%", which the editor waved through to a confirm
// card that dutifully resolved 9.99× the balance and left the fail-closed spend
// gate to catch it one screen later.
//
// Neither direction is visible to a type: both are strings and both parse. The
// only defence is that there is one regex, so this is it.

/** The words accepted in place of a number: all | max | half | "N%" / "N.N%". */
export const QUANTITY_WORD_RE = /^(all|max|half|\d+(?:\.\d+)?%)$/i;

/**
 * A quantity word as BASIS POINTS of the balance, or `null` when it isn't one.
 *
 * Basis points rather than a fraction because every caller applies it to a
 * `bigint` balance in base units (`raw * bps / 10000n`), and integer division
 * truncates toward zero. The float path it replaced used `.toFixed`, which
 * ROUNDS UP — see `clampDecimals` above for the measured consequence: a user's
 * own 100% button computed a hair MORE than they held, so the over-balance
 * guard fired and they could never sell everything.
 *
 * Capped at 10000. A user who types "500%" is asking for five times a balance
 * they do not have; resolving that to everything they DO hold is the reading
 * that matches what they meant, and it is the only one the spend gate accepts.
 */
export function wordToBps(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!QUANTITY_WORD_RE.test(s)) return null;
  if (s === "all" || s === "max") return 10000;
  if (s === "half") return 5000;
  const pct = parseFloat(s);                 // "50%" → 50
  if (!Number.isFinite(pct) || pct <= 0) return null;
  return Math.min(Math.round(pct * 100), 10000);
}

/** A plain positive decimal: "25", "25.5". No sign, no exponent, no separators. */
export const PLAIN_AMOUNT_RE = /^\d+(\.\d+)?$/;

/**
 * The SHAPE every amount field accepts: a plain decimal, or a quantity word.
 *
 * Exists because the rule has two ends and they have to agree. `/api/chat`
 * validates the LLM's `amount` argument before it renders a card; the card then
 * validates what it was handed. A server that accepts a word the card rejects
 * renders a card stuck on "Enter an amount" for a quantity the user did say —
 * and a server that rejects one the card accepts means the user cannot say it
 * at all. Both were one inline regex away, on two lines 37 apart.
 *
 * SHAPE, not size: "0" passes here and is refused downstream by the cards'
 * `amount > 0`. Kept that way deliberately — this replaced the route's regex
 * byte-for-byte in behaviour, and widening or narrowing what a fund-touching
 * path accepts is a separate decision from giving it one address.
 */
export function isAmountLike(raw: string): boolean {
  const s = raw.trim();
  return PLAIN_AMOUNT_RE.test(s) || QUANTITY_WORD_RE.test(s);
}
