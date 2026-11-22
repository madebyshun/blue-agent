/**
 * `token_verdict` — "should I touch this token?" in one paid MCP call.
 *
 * The verdict is the pre-trade check every swap and send already runs
 * (lib/pre-trade-check.ts: honeypot and tax read from the contract, impostor
 * of a registered token, owner powers, stock-token oracle gap), mapped to plain
 * words in code — never chosen by a model (CLAUDE.md, verdict rule). It was
 * picked over `honeypot-check` / `risk-gate` as the core because those two ask
 * an LLM for their conclusion.
 *
 *   BLOCK → avoid · WARN → caution · PASS → no_issues_found
 *
 * "no_issues_found" is deliberately not "safe": it means the listed checks
 * found nothing, which is all this can know.
 *
 * Price and liquidity ride along on Base (DexScreener via the `token-price`
 * catalog tool, in-process) because that is what MCP callers measurably ask
 * for next (usage-daily, 90 days: token-price is the one tool with steady
 * outside use). A missing market read is `market: null` with the reason, not a
 * failed verdict.
 */
import { preTradeCheck, type PreTradeCheck } from "@/lib/pre-trade-check";
import { runInternalTool } from "@/lib/x402-internal-run";
import type { TxChain } from "@/lib/tx-chains";
import {
  simulateRoundTripOnBase,
  readTokenHolders,
  readTokenOrigin,
  LOSS_BAD,
  LOSS_WARN,
  CONCENTRATED_PCT,
} from "@/lib/verdict-forensics";

export type VerdictWord = "no_issues_found" | "caution" | "avoid";
const WORD: Record<PreTradeCheck["verdict"], VerdictWord> = { PASS: "no_issues_found", WARN: "caution", BLOCK: "avoid" };

export async function tokenVerdict(chain: TxChain, token: string): Promise<Record<string, unknown>> {
  const isBase = chain === "base";
  const [check, marketPack] = await Promise.all([
    preTradeCheck({ chain, kind: "swap", token }),
    isBase ? marketRead(token) : Promise.resolve({ market: null, market_note: "price and liquidity are read on Base 8453 only", pairAddresses: [] as string[] }),
  ]);

  const shouldSimulate = isBase && check.asset_type === "crypto";
  const [simulation, holders, origin] = isBase
    ? await Promise.all([
        shouldSimulate ? simulateRoundTripOnBase(token) : Promise.resolve(null),
        readTokenHolders(token, marketPack.pairAddresses),
        readTokenOrigin(token),
      ])
    : [null, null, null];

  const extraReasons: { level: string; code: string; text: string }[] = [];
  let verdict: VerdictWord = WORD[check.verdict];
  const escalate = (to: VerdictWord) => {
    if (to === "avoid") verdict = "avoid";
    else if (to === "caution" && verdict === "no_issues_found") verdict = "caution";
  };

  if (simulation) {
    if (simulation.status === "checked") {
      if (simulation.kind === "empty_market" || simulation.kind === "sell_reverted") {
        escalate("avoid");
        extraReasons.push({ level: "block", code: "SIM_TRAP", text: simulation.summary });
      } else if (simulation.kind === "buy_reverted") {
        escalate("caution");
        extraReasons.push({ level: "warn", code: "SIM_BUY_REVERTED", text: simulation.summary });
      } else if (simulation.kind === "traded") {
        if (simulation.tone === "bad") {
          escalate("avoid");
          extraReasons.push({ level: "block", code: "SIM_LOSS_OR_TRANSFER_FAIL", text: `${simulation.summary} (threshold > ${LOSS_BAD * 100}%)` });
        } else if (simulation.tone === "warn") {
          escalate("caution");
          extraReasons.push({ level: "warn", code: "SIM_ELEVATED_LOSS", text: `${simulation.summary} (warn > ${LOSS_WARN * 100}%)` });
        } else {
          extraReasons.push({ level: "info", code: "SIM_ROUNDTRIP_OK", text: simulation.summary });
        }
      }
    } else {
      escalate("caution");
      extraReasons.push({ level: "warn", code: "SIM_NOT_CHECKED", text: simulation.summary });
    }
  }

  if (holders) {
    if (holders.status === "checked" && holders.top_10_pct > CONCENTRATED_PCT) {
      escalate("caution");
      extraReasons.push({ level: "warn", code: "CONCENTRATED_HOLDERS", text: holders.summary });
    } else if (holders.status === "not_checked") {
      extraReasons.push({ level: "info", code: "HOLDERS_NOT_CHECKED", text: holders.summary });
    }
  }

  if (origin) {
    if (origin.status === "checked" && origin.pulled_liquidity_at) {
      escalate("avoid");
      extraReasons.push({ level: "block", code: "LAUNCHER_PULLED_LIQUIDITY", text: origin.summary });
    } else if (origin.status === "checked" && origin.tone === "warn") {
      escalate("caution");
      extraReasons.push({ level: "warn", code: "LAUNCHER_CAUTION", text: origin.summary });
    }
  }

  const { pairAddresses: _pairs, ...marketOut } = marketPack;
  return {
    verdict,
    chain,
    chain_id: chain === "base" ? 8453 : 4663,
    token,
    label: check.label,
    asset_type: check.asset_type,
    reasons: [
      ...check.reasons.map((r) => ({ level: r.level.toLowerCase(), code: r.code, text: r.text })),
      ...extraReasons,
    ],
    ...(check.drift_pct !== undefined ? { stock_drift_pct: check.drift_pct } : {}),
    ...marketOut,
    ...(simulation ? { simulation } : {}),
    ...(holders ? { holders } : {}),
    ...(origin ? { launcher: origin } : {}),
    checked_at: check.checked_at,
    note: "Verdict computed in code from on-chain simulation, contract checks, holder distribution, and launcher history. no_issues_found means these checks found nothing — it is not a guarantee.",
  };
}

async function marketRead(token: string): Promise<{ market: Record<string, unknown> | null; market_note?: string; pairAddresses: string[] }> {
  try {
    const r = await runInternalTool({ tool: "token-price", body: { token }, service: true, timeoutMs: 15_000 });
    if (r.status !== 200) return { market: null, market_note: `market read unavailable (${r.status})`, pairAddresses: [] };
    // Field names as the token-price handler writes them (its 200 body).
    const b = r.body as Record<string, unknown>;
    // No pair is a 200 with `price_usd: null` and an `error` sentence.
    if (b.price_usd == null) return { market: null, market_note: typeof b.error === "string" ? b.error : "no price found", pairAddresses: [] };
    const urlStr = typeof b.url === "string" ? b.url : "";
    const pairMatch = urlStr.match(/\/base\/(0x[a-fA-F0-9]{40,64})/);
    return {
      pairAddresses: pairMatch ? [pairMatch[1]] : [],
      market: {
        price_usd: b.price_usd ?? null,
        liquidity_usd: b.liquidity_usd ?? null,
        volume_24h_usd: b.volume_24h ?? null,
        market_cap_usd: b.mcap ?? null,
        change_pct: b.change ?? null,
        source: "DexScreener",
      },
    };
  } catch (e) {
    return { market: null, market_note: `market read failed: ${(e as Error).message}`, pairAddresses: [] };
  }
}
