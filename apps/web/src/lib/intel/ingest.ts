/**
 * BlueAgent Markets Intel v1 — Live ingestion & Telegram owner alert hook.
 *
 * Scans all 12 verified Base B20 stocks (`BASE_STOCKS`) across completed
 * full-hour America/New_York trading windows. Uses a KV batch cursor
 * (`intel:scan:cursor:v1`, default 4 tokens/run) so hourly cron runs rotate
 * cleanly across all 12 stocks without tripping GeckoTerminal's 429 limit.
 */
import { kvGetProbe, kvSet } from "@/lib/kv";
import { sendMessage } from "@/lib/telegram/bot";
import { KV_DRAFTS_CHAT } from "@/lib/xdrafts/compose";
import { formatIntelTelegramMessage } from "./draft";
import {
  ingestIntelEvent,
  saveIntelScanSummary,
  type IntelScanSummary,
} from "./store";
import {
  DEFAULT_INTEL_CONFIG,
  type IntelDetectorConfig,
  type IntelEvent,
  type WindowEvaluation,
} from "./types";
import {
  evaluateSessionWindow,
  fetchTokenHourlyHistory,
  listCompletedWindows,
  targetIntelStocks,
} from "./volume-detector";

export const KV_INTEL_CURSOR = "intel:scan:cursor:v1";

export interface RunIntelResult {
  summary: IntelScanSummary;
  evaluations: WindowEvaluation[];
  qualifiedEvents: IntelEvent[];
  telegramNotified: number;
}

export async function runIntelIngestion(opts?: {
  now?: Date;
  daysBack?: number;
  /** Number of tokens to scan this run (0 or >= total = scan all). Default 4 for cron rate-limit safety. */
  batchSize?: number;
  config?: Partial<IntelDetectorConfig>;
  persist?: boolean;
  notifyTelegram?: boolean;
}): Promise<RunIntelResult> {
  const now = opts?.now ?? new Date();
  const daysBack = opts?.daysBack ?? 3;
  const cfg: IntelDetectorConfig = { ...DEFAULT_INTEL_CONFIG, ...opts?.config };
  const persist = opts?.persist ?? true;
  const notifyTelegram = opts?.notifyTelegram ?? false;

  const allStocks = targetIntelStocks();
  const batchSize = opts?.batchSize ?? allStocks.length;
  let stocks = allStocks;

  if (batchSize > 0 && batchSize < allStocks.length) {
    const curProbe = await kvGetProbe<{ offset: number }>(KV_INTEL_CURSOR);
    const offset = curProbe.status === "hit" && Number.isInteger(curProbe.value?.offset)
      ? curProbe.value.offset % allStocks.length
      : 0;
    const batch: typeof allStocks = [];
    for (let i = 0; i < batchSize; i++) {
      batch.push(allStocks[(offset + i) % allStocks.length]);
    }
    stocks = batch;
    if (persist) {
      await kvSet(KV_INTEL_CURSOR, { offset: (offset + batchSize) % allStocks.length, updatedAt: now.toISOString() });
    }
  }

  const windows = listCompletedWindows(now, daysBack);
  const evaluations: WindowEvaluation[] = [];
  const qualifiedEvents: IntelEvent[] = [];
  const ingested: IntelScanSummary["ingested"] = [];
  const notes: string[] = [];

  for (const stock of stocks) {
    const history = await fetchTokenHourlyHistory(stock.ticker, cfg.maxPools);
    if (history.errors.length > 0) {
      notes.push(`${stock.symbol}: ${history.errors.join("; ")}`);
    }
    for (const w of windows) {
      const ev = evaluateSessionWindow({
        stock,
        window: w,
        pools: history.pools,
        candlesByPool: history.candlesByPool,
        config: cfg,
        evaluatedAt: now,
      });
      evaluations.push(ev);
      if (ev.status === "qualified" && ev.event) {
        qualifiedEvents.push(ev.event);
        if (persist) {
          const outcome = await ingestIntelEvent(ev.event, now);
          ingested.push({ id: outcome.event.id, action: outcome.action });
        }
      }
    }
  }

  let telegramNotified = 0;
  if (notifyTelegram && persist) {
    const newlyCreated = ingested.filter((i) => i.action === "created");
    if (newlyCreated.length > 0) {
      const chatProbe = await kvGetProbe<{ chatId: number }>(KV_DRAFTS_CHAT);
      if (chatProbe.status === "hit" && chatProbe.value?.chatId) {
        for (const item of newlyCreated) {
          const event = qualifiedEvents.find((e) => e.id === item.id);
          if (!event) continue;
          const res = await sendMessage(chatProbe.value.chatId, formatIntelTelegramMessage(event));
          if (res.ok) telegramNotified++;
        }
      }
    }
  }

  const summary: IntelScanSummary = {
    scannedAt: now.toISOString(),
    tokens: stocks.map((s) => s.symbol),
    windowsEvaluated: evaluations.length,
    qualifiedCount: evaluations.filter((e) => e.status === "qualified").length,
    normalCount: evaluations.filter((e) => e.status === "normal").length,
    insufficientDataCount: evaluations.filter((e) => e.status === "insufficient_data").length,
    ingested,
    notes,
  };

  if (persist) {
    await saveIntelScanSummary(summary);
  }

  return { summary, evaluations, qualifiedEvents, telegramNotified };
}
