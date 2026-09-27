/**
 * Machine-readable x402 pricing manifest
 * GET /.well-known/pricing
 *
 * Compatible with Tavily x402 pricing spec.
 * Agents use this to discover all tool prices without parsing the full catalog.
 */
import { NextResponse } from "next/server";
import { AGENT_TOOLS } from "@/lib/agent-tools";
import { HANDLERS } from "@/app/api/x402/_handlers";
import { X402_PAY_TO } from "@/lib/x402-payee";

const USDC_BASE  = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAY_TO     = X402_PAY_TO;
const NETWORK    = "eip155:8453";
const BASE_URL   = "https://blueagent.dev";

export async function GET() {
  /**
   * The falsy-zero filter below is CORRECT here, and was a BUG in the two
   * manifests beside it — worth saying out loud, because the expression is
   * identical and `openapi.json` / `ai-tool/{id}.json` were both fixed on
   * 2026-09-27 for writing it.
   *
   * What differs is what the array means. Every entry in `routes` carries
   * `payTo`, `scheme` and `maxAmountRequired`: it is a PAYMENT REQUIREMENT, and
   * a free tool has none. An entry instructing an agent to send zero USDC to a
   * real address is the contradiction it resolves by signing anyway — the same
   * reason the ERC-8257 manifest emits `pricing: []` instead of a $0 entry.
   *
   * What WAS missing: a reader of this file alone could not learn the six free
   * tools exist. `free` below fixes that without putting them in `routes`,
   * where every payment field would be a lie.
   */
  const free = AGENT_TOOLS
    .filter(t => HANDLERS[t.id] && (t.priceUSDC ?? -1) === 0)
    .map(t => ({
      path:        `/api/x402/${t.id}`,
      endpoint:    `${BASE_URL}/api/x402/${t.id}`,
      manifest:    `${BASE_URL}/.well-known/ai-tool/${t.id}.json`,
      name:        t.name,
      description: t.description,
      category:    t.category,
      priceUSD:    t.price ?? "$0.00",
      // No payTo, no scheme, no asset, no maxAmountRequired — deliberately.
      // There is nothing to settle, and naming a recipient would imply there is.
      payment:     "none",
      note:        "Free — never answers 402. POST directly; do not build an authorization.",
    }));

  const routes = AGENT_TOOLS
    .filter(t => t.priceUSDC && HANDLERS[t.id])
    .map(t => ({
      path:             `/api/x402/${t.id}`,
      endpoint:         `${BASE_URL}/api/x402/${t.id}`,
      manifest:         `${BASE_URL}/.well-known/ai-tool/${t.id}.json`,
      name:             t.name,
      description:      t.description,
      category:         t.category,
      scheme:           "exact",
      network:          NETWORK,
      asset:            USDC_BASE,
      payTo:            PAY_TO,
      maxAmountRequired: String(t.priceUSDC),   // raw USDC units (6 decimals)
      priceUSD:         t.price ?? null,         // human-readable e.g. "$0.25"
    }));

  const manifest = {
    version:     2,
    // DERIVED from the payload, not from TOOL_COUNT and never hand-typed. This
    // line read "40 AI tools" for months while the same function was mapping
    // over the live catalog three lines above — the file imported the truth and
    // then ignored it. `routes.length` is also the RIGHT number here, which
    // TOOL_COUNT would not be: the filter drops tools with no handler and every
    // $0.00 tool (priceUSDC 0 is falsy), so this manifest lists fewer tools
    // than the catalog holds and now says so. It said "the two $0.00 tools"
    // until 2026-09-27, by which point there were six — a count derived from
    // the data does not save a sentence written beside it from going stale, so
    // `free.length` is spliced in rather than spelled.
    description: `Blue Hub — ${routes.length} paid AI tools on Base, pay-per-call via x402 + USDC, plus ${free.length} free`,
    network:     NETWORK,
    asset:       USDC_BASE,
    payTo:       PAY_TO,
    catalog:     `${BASE_URL}/api/catalog`,
    updated:     new Date().toISOString(),
    routes,
    // `payTo` above applies to `routes` only. Separated rather than merged so a
    // client that iterates `routes` to build authorizations cannot pick one up.
    free,
  };

  return NextResponse.json(manifest, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control":               "public, s-maxage=300",
      "Content-Type":                "application/json",
    },
  });
}
