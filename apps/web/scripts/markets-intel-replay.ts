/**
 * Historical replay for BlueAgent Markets Intel v1 (NVDAc, AAPLc, MSTRc on Base 8453).
 *
 * Fetches real hourly OHLCV candles from GeckoTerminal across the top 3 deepest
 * Base pools per token, evaluates completed full-hour America/New_York sessions
 * over the past 14 days against their prior 28-day medians, and prints a full
 * summary of qualified events, normal windows, insufficient-data reasons, and
 * a copy-ready X draft (falling back to the labeled demo fixture if live history
 * yields 0 qualifying events).
 */
import { runIntelIngestion } from "../src/lib/intel/ingest";
import { buildIntelXDraft, intelEventUrl } from "../src/lib/intel/draft";
import { DEMO_FIXTURE_EVENT } from "../src/lib/intel/store";

async function main() {
  const daysBack = Number(process.argv[2] ?? "14");
  console.log(`Running Markets Intel v1 historical replay (last ${daysBack} NY days)...`);
  const res = await runIntelIngestion({
    daysBack,
    persist: false,
    notifyTelegram: false,
  });

  console.log("\n=== SCAN SUMMARY ===");
  console.log(JSON.stringify(res.summary, null, 2));

  console.log("\n=== PER-TOKEN BREAKDOWN ===");
  for (const sym of res.summary.tokens) {
    const rows = res.evaluations.filter((e) => e.symbol === sym);
    const qual = rows.filter((e) => e.status === "qualified");
    const norm = rows.filter((e) => e.status === "normal");
    const insuff = rows.filter((e) => e.status === "insufficient_data");
    const maxMult = rows
      .map((r) => r.volumeMultiple)
      .filter((v): v is number => v !== null)
      .sort((a, b) => b - a)[0];
    console.log(
      `- ${sym}: evaluated=${rows.length}, qualified=${qual.length}, normal=${norm.length}, insufficient_data=${insuff.length}, maxMultiple=${maxMult ?? "n/a"}x`,
    );
    if (insuff.length > 0) {
      console.log(`  sample insufficient_data reason: ${insuff[0].reason}`);
    }
    if (norm.length > 0) {
      const topNorm = [...norm].sort((a, b) => (b.volumeMultiple ?? 0) - (a.volumeMultiple ?? 0))[0];
      console.log(
        `  closest normal window: ${topNorm.window.nyDate} ${topNorm.window.session} obs=$${Math.round(topNorm.observedUsd ?? 0).toLocaleString("en-US")} med=$${Math.round(topNorm.baselineMedianUsd ?? 0).toLocaleString("en-US")} (${topNorm.volumeMultiple ?? "n/a"}x, n=${topNorm.baselineSampleCount})`,
      );
    }
  }

  if (res.qualifiedEvents.length > 0) {
    const top = [...res.qualifiedEvents].sort((a, b) => b.volumeMultiple - a.volumeMultiple)[0];
    console.log("\n=== TOP QUALIFIED LIVE EVENT ===");
    console.log(JSON.stringify(top, null, 2));
    console.log("\n=== COPY-READY X DRAFT ===");
    console.log(buildIntelXDraft(top));
    console.log("Evidence URL:", intelEventUrl(top.id));
  } else {
    console.log("\n=== NO LIVE QUALIFYING EVENT FOUND — DEMO FIXTURE ===");
    console.log("Fixture URL:", intelEventUrl(DEMO_FIXTURE_EVENT.id));
    console.log("Fixture X Draft:");
    console.log(buildIntelXDraft(DEMO_FIXTURE_EVENT));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
