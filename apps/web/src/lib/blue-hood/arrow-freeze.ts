/**
 * Arrows are FROZEN (ShunTr, 2026-09-30 — docs/rebuild-5-tang-2026-09-30.md).
 *
 * "Arrow không có giá trị" — nobody trades on the drift/arb signals, so the
 * engine stops publishing new ones. What keeps running, on purpose:
 *   - the poller and both archives (the data is the asset; ~zero cost),
 *   - the grader, so the arrows already open close out honestly,
 *   - the dislocation/series routes that read the snapshot.
 * What stops: new arrows (runRuleEngine counts them as `skipped_frozen`), and
 * the brief-worker cron that wrote an LLM brief for each new arrow (unscheduled
 * in vercel.json in the same commit).
 *
 * A code constant, not an env var: un-freezing is a product decision and should
 * arrive as a reviewed commit, not a dashboard toggle nobody sees.
 */
export const ARROWS_FROZEN = true;

/** The day publishing stopped — shown on the track-record pages and returned
 *  by the public track-record/cohort APIs, so a record that stopped growing
 *  says so instead of reading like a desk that broke. */
export const ARROWS_FROZEN_SINCE = "2026-09-30";

/** One sentence every surface can quote verbatim. */
export const ARROWS_FROZEN_NOTE =
  `Blue Hood stopped publishing new arrows on ${ARROWS_FROZEN_SINCE}. ` +
  "The record is historical: arrows already open are still graded, nothing new is added.";

/**
 * The [Review & Sign] button on an arrow opened a REAL Robinhood Chain trade
 * panel straight from a directional signal (chat audit 2026-09-30 §7.2). That
 * turns a published signal into a personalised "trade this now" — advice by
 * construction — so it is off (ShunTr, 2026-09-30). Swaps still happen in
 * Wallet and Chat, where the user states the trade. The user's past trades on
 * an arrow (the YouTraded badge) stay visible: that is their own record.
 * Separate from ARROWS_FROZEN on purpose — un-freezing arrows must not quietly
 * bring trading-from-a-signal back with it.
 */
export const ARROW_TRADE_ENABLED = false;
