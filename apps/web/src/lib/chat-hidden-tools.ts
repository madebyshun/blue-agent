// ─── Tools hidden from chat (ShunTr, 2026-09-30) ─────────────────────────────
// docs/rebuild-5-tang-2026-09-30.md: "chỉ cần những tool hữu ích". Chat keeps the
// tools inside its loop (discover → evaluate → check → swap/send/bridge) plus
// catalog lookup. Hidden, not deleted: every id below stays in the catalog and
// is still callable over x402 and via `blue_call`; the definitions stay in
// ALL_HUB_TOOLS (api/chat/route.ts) so a tool comes back by deleting one line
// here.
//
// Read in three places, which is why it lives in its own module (moved here
// 2026-10-01 — a `route.ts` may only export route handlers, so while it sat in
// api/chat/route.ts nothing else could import it):
//   • api/chat/route.ts — filters ALL_HUB_TOOLS into what the model is SHOWN,
//     and blocks the names at dispatch (callHubTool), so a name the model
//     invents or remembers still cannot run;
//   • app/chat/hub-skills.ts — drops the chips whose tool is hidden. Before the
//     move it could not see this set, so the Tools tab and /docs/blue-chat kept
//     advertising 14 tools chat refused ("The model can call N curated Hub
//     tools" counted them);
//   • the checks that pin both (curated-trigger-check, chat-skills-check,
//     discovery-card-test, tool-halts-check).
//
// Keep this file free of imports: hub-skills.ts is bundled into the client.
export const CHAT_HIDDEN_TOOLS: ReadonlySet<string> = new Set([
  // Builder/founder tools — the old founder console, outside the trading loop.
  "hub_competitor_scan", "hub_market_fit", "hub_repo_health", "hub_agent_score",
  "hub_token_readiness", "blue_deploy", "blue_simulate",
  "hub_builder_dd", "hub_base_grant",
  // DeFi/yield research — outside swap/send/bridge.
  "hub_defi_opportunity", "hub_protocol_compare",
  // Temporarily out: Moralis-backed (halted in lib/tool-halts.ts) and
  // key-exposure (Etherscan account endpoints are not on the free tier for
  // Base). Back when the Blockscout replacement lands.
  "hub_key_exposure",
  // Outside the five-layer loop (docs/plan-build-2026-10-06.md task 0.4,
  // skill audit 2026-10-04). Model-written narrative and research
  // (narrative, narrative_pulse, ecosystem, research), an
  // LLM-scored entry/target scanner (token_momentum), a TVL-only risk score
  // (protocol_risk), a founder score (builder_score), and three re-serves of
  // DexScreener/GeckoTerminal that hub_token_price, hub_dex_flow,
  // hub_safe_trending and hub_rh_movers already cover with more checks
  // (blue_monitor, blue_analytics, blue_stream). Still in the catalog and
  // callable over x402 and blue_call. hub_b20_analyze stays: it explains the
  // standard (no figures, no verdict) and the B20 dispatch rules lean on it.
  "hub_narrative", "hub_narrative_pulse", "hub_ecosystem", "blue_research",
  "hub_token_momentum", "hub_protocol_risk", "hub_builder_score",
  "blue_monitor", "blue_analytics", "blue_stream",
  // Execution cards outside the basic set (swap/send/bridge on Base + RH):
  // the yield card shows another vault's APY; B20 management is not a basic trade.
  "prepare_yield", "hub_b20_manage",
]);
