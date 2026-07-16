// x402/rh-stock-alert (A2) — register a Chainlink-price threshold alert.
// Price: $0.10
//
// Non-execution: returns the alert config, polls the Chainlink feed ONCE
// to report the current state (met / not-met), and optionally persists the
// alert to KV so a downstream poller/cron can watch it and fire a webhook.

import { findByTicker, RH_CHAIN } from "@/lib/robinhood/rwa-registry";
import { chainlinkLatest } from "@/lib/robinhood/rwa-price";
import { kv } from "@vercel/kv";
import { isAddress, getAddress } from "viem";

type Direction = "above" | "below";

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: {
      ticker?: string;
      threshold_usd?: number;
      direction?: string;
      recipient?: string;    // wallet or webhook — free-form identifier for the alert's owner
      webhook_url?: string;   // optional POST target for the cron
      persist?: boolean;
      ttl_hours?: number;
    } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);

    const ticker = (body.ticker ?? url.searchParams.get("ticker") ?? "").trim();
    const threshold = Number(body.threshold_usd ?? url.searchParams.get("threshold_usd") ?? 0);
    const directionRaw = ((body.direction ?? url.searchParams.get("direction") ?? "above") as string).toLowerCase();
    const direction: Direction = directionRaw === "below" ? "below" : "above";
    const recipient = (body.recipient ?? url.searchParams.get("recipient") ?? "").trim();
    const webhookUrl = (body.webhook_url ?? url.searchParams.get("webhook_url") ?? "").trim();
    const persist = body.persist === true;
    const ttlHours = Math.max(1, Math.min(30 * 24, Number(body.ttl_hours ?? url.searchParams.get("ttl_hours") ?? 24 * 7)));

    if (!ticker) return Response.json({ error: "Provide `ticker`." }, { status: 400 });
    if (!Number.isFinite(threshold) || threshold <= 0) {
      return Response.json({ error: "`threshold_usd` must be > 0." }, { status: 400 });
    }
    if (recipient && recipient.startsWith("0x") && !isAddress(recipient)) {
      return Response.json({ error: "`recipient` looks like an address but is invalid." }, { status: 400 });
    }

    const token = findByTicker(ticker);
    if (!token) return Response.json({ tool: "rh-stock-alert", ticker, error: "Ticker not in registry." }, { status: 404 });
    if (!token.chainlinkFeed) {
      return Response.json({
        tool: "rh-stock-alert",
        ticker: token.ticker,
        error: "No Chainlink feed on RH Chain for this ticker — cannot register a Chainlink-threshold alert. Try a ticker with a live feed (e.g. AAPL, MSTR, TSLA).",
        network: RH_CHAIN,
      }, { status: 400 });
    }

    const timestamp = new Date().toISOString();
    const nowUnix = Math.floor(Date.now() / 1000);
    const quote = await chainlinkLatest(token.chainlinkFeed, token.chainlinkHeartbeat ?? 86400);
    const currentPrice = quote?.price_usd ?? null;
    const met =
      currentPrice !== null &&
      (direction === "above" ? currentPrice >= threshold : currentPrice <= threshold);

    const alertId = `rh-alert:${token.ticker.toLowerCase()}:${direction}:${threshold}:${recipient ? recipient.toLowerCase() : "anon"}:${nowUnix}`;
    const config = {
      id: alertId,
      ticker: token.ticker,
      contract: token.contract,
      chainlink_feed: token.chainlinkFeed,
      threshold_usd: threshold,
      direction,
      recipient: recipient ? (isAddress(recipient) ? getAddress(recipient) : recipient) : null,
      webhook_url: webhookUrl || null,
      status: met ? "MET" : "PENDING",
      created_at_unix: nowUnix,
      last_polled_unix: nowUnix,
      last_price_usd: currentPrice,
    };

    let persisted = false;
    if (persist) {
      try {
        await kv.set(alertId, config, { ex: ttlHours * 3600 });
        persisted = true;
      } catch (e) {
        console.warn("[rh-stock-alert] KV persist failed:", (e as Error).message);
      }
    }

    return Response.json({
      tool: "rh-stock-alert",
      alert: config,
      chainlink: quote,
      met_now: met,
      persisted,
      persist_note: persist && !persisted ? "KV persist failed — config returned only." : null,
      note: met
        ? `Threshold already met at registration: current $${currentPrice?.toFixed(4)} ${direction === "above" ? ">=" : "<="} $${threshold}.`
        : `Threshold not met yet: current $${currentPrice?.toFixed(4)} vs $${threshold} (${direction}).`,
      data_sources: ["Chainlink AggregatorV3 on-chain (RH Chain)", persist ? "@vercel/kv" : null].filter(Boolean),
      network: RH_CHAIN,
      timestamp,
    });
  } catch (e) {
    return Response.json({ error: "rh-stock-alert failed", message: (e as Error).message }, { status: 500 });
  }
}
