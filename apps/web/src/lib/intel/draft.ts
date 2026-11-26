/**
 * BlueAgent Markets Intel v1 — Deterministic X draft + Telegram message builders.
 *
 * Rules:
 *   - Short lowercase English draft for @blueagent_
 *   - Uses ONLY numbers supported by the stored IntelEvent record
 *   - Explicitly states selected-pools scope
 *   - Includes finding, comparison period, and stable event URL
 *   - Draft only (no posting integration)
 */
import type { IntelEvent, IntelSessionKind } from "./types";

const SITE = "https://app.blueagent.dev";

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

function fmtUsdLower(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}b`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}m`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
}

function fmtNyDateShort(nyDate: string): string {
  const [y, m, d] = nyDate.split("-").map(Number);
  if (!y || !m || !d) return nyDate;
  return `${MONTHS[m - 1] ?? m} ${d}`;
}

function sessionPhrase(session: IntelSessionKind): string {
  if (session === "regular") return "regular-session";
  if (session === "premarket") return "pre-market";
  return "after-hours";
}

export function intelEventUrl(eventId: string): string {
  return `${SITE}/markets/intel/${encodeURIComponent(eventId)}`;
}

/**
 * Deterministic lowercase English X draft for @blueagent_.
 */
export function buildIntelXDraft(event: IntelEvent): string {
  const sym = event.symbol.toLowerCase();
  const sess = sessionPhrase(event.session);
  const obs = fmtUsdLower(event.observedUsd);
  const med = fmtUsdLower(event.baselineMedianUsd);
  const inc = fmtUsdLower(event.usdIncreaseUsd);
  const mult = `${event.volumeMultiple.toFixed(1)}x`;
  const poolScope =
    event.pools.length === 1
      ? "1 selected base pool"
      : `${event.pools.length} selected base pools`;
  const nyWindow = event.windowNyLabel.toLowerCase();
  const day = fmtNyDateShort(event.nyDate);
  const url = intelEventUrl(event.id);
  const fixturePrefix = event.isFixture ? "[fixture] " : "";

  return (
    `${fixturePrefix}${sym} ${sess} dex volume on base hit ${obs} (${nyWindow}, ${day}), ` +
    `${mult} its prior ${event.baselineLookbackDays}-day median of ${med} (+${inc} across ` +
    `${event.baselineSampleCount} comparable sessions, ${poolScope}). ` +
    `dex volume includes arbitrage and bots. evidence: ${url}`
  );
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Format an IntelEvent for the existing BlueAgent Telegram bot (`/intel`).
 */
export function formatIntelTelegramMessage(event: IntelEvent): string {
  const draft = buildIntelXDraft(event);
  const url = intelEventUrl(event.id);
  const fixtureTag = event.isFixture ? " [FIXTURE]" : "";
  return [
    `<b>Markets Intel · ${escHtml(event.symbol)} (${escHtml(event.session)})</b>${fixtureTag}`,
    `Base 8453 · ${escHtml(event.nyDate)} · ${escHtml(event.windowNyLabel)}`,
    ``,
    `Observed: <b>${escHtml(fmtUsdLower(event.observedUsd))}</b> vs ${event.baselineLookbackDays}d median <b>${escHtml(fmtUsdLower(event.baselineMedianUsd))}</b> (${event.volumeMultiple.toFixed(2)}x, +${escHtml(fmtUsdLower(event.usdIncreaseUsd))}, n=${event.baselineSampleCount})`,
    `Scope: ${event.pools.length} selected Base pool(s) · Rev #${event.revision}`,
    ``,
    `<b>X draft (@blueagent_, copy-ready):</b>`,
    `<pre>${escHtml(draft)}</pre>`,
    `<a href="${url}">Open evidence page →</a>`,
  ].join("\n");
}
