/**
 * /api/catalog — machine-readable tool catalog for agents & x402 directories.
 *
 * Lists every Blue Hub tool with its x402 endpoint, price, network, asset and
 * input fields. Any x402-capable agent can discover a tool here, then call its
 * endpoint and pay per call in USDC — no API key, no signup.
 *
 * Public + CORS-open so browser agents and directories (Agentic Market, etc.)
 * can index it.
 */
import { NextResponse } from "next/server";
import { AGENT_TOOLS } from "@/lib/agent-tools";
import { HANDLERS }    from "@/app/api/x402/_handlers";
import { wireSchema }  from "@/lib/tool-wire-schema";
import { X402_PAY_TO } from "@/lib/x402-payee";

export const runtime = "nodejs";
// Vercel kills serverless functions at 60s by default — explicit budget so
// it fails loudly instead of silently 504-ing.
export const maxDuration = 15;

const BASE = "https://blueagent.dev";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAY_TO = X402_PAY_TO;

function priceUnits(price?: string): number | null {
  if (!price) return null;
  const n = parseFloat(price.replace("$", "").trim());
  return Number.isNaN(n) ? null : Math.round(n * 1_000_000);
}

/**
 * Every tool on this endpoint is Blue Agent, so this is a constant. That is
 * the honest value, not a placeholder waiting to be re-populated.
 *
 * The history is worth keeping, because the mistake changed shape twice and
 * only the second form was hard to see:
 *   • Originally `t.isComposite ? ["blue","aeon","miroshark"] : ...` — wrong
 *     for 61 of 65 composite tools (measured 2026-08-28). `isComposite` means
 *     multi-STEP, not multi-AGENT: 31 composite tools were one Blue persona
 *     chained several times, and all 31 advertised Aeon and MiroShark to every
 *     directory that indexes this endpoint.
 *   • Then derived from `agentName`. Accurate about which PROMPTS ran, and
 *     still misleading, because a list of three names reads as three parties.
 *     They were system-prompt prefixes on one Virtuals endpoint
 *     (`_lib/llm.ts`): no second model, no second vendor, no voting protocol.
 *   • 2026-09-27: Aeon and MiroShark retired (ShunTr). `agentName` is now
 *     "Blue Agent" on all 110 tools, so the derivation could not vary even in
 *     principle — a function whose output is constant, lending false precision.
 *
 * KEPT rather than dropped: x402 directories and agents index this endpoint,
 * so removing a key breaks them, and `["blue"]` is true. If this ever needs to
 * vary again, derive it from something that measures what RAN — never from a
 * label that records what was intended.
 */
const AGENTS = ["blue"] as const;

export async function GET() {
  // `HANDLERS[t.id]` is a regression guard, not a fix: measured 2026-08-28 all
  // 112 catalog entries have a handler, so this changes nothing today. It is
  // here because the sibling `/api/v1` index DID drift into advertising two
  // ids with no handler (`allowance-audit`, `phishing-scan`), which answer 501.
  // A directory that indexes this endpoint cannot tell a real tool from a
  // ghost, so the filter has to.
  const tools = AGENT_TOOLS
    .filter(t => t.x402Url && HANDLERS[t.id])
    .map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      agents: [...AGENTS],
      price: t.price ?? null,
      priceUsdcUnits: priceUnits(t.price),
      endpoint: `${BASE}/api/x402/${t.id}`,
      method: "POST",
      // The WIRE shape, derived by running t.x402Body — not `inputs[].key`,
      // which is the Hub form and differs from the wire for 18 of these tools.
      // See lib/tool-wire-schema.ts: publishing the form meant an agent could
      // POST exactly what this endpoint told it to, have every field ignored,
      // and still pay. `fields` is dropped here because JSON Schema is what a
      // caller consumes; the doc generator uses it.
      input: (({ fields: _fields, ...schema }) => schema)(wireSchema(t)),
    }));

  return NextResponse.json(
    {
      name: "Blue Hub",
      // Describes what a calling agent GETS, not how we brand it. This text
      // once sold "3-agent consensus (Blue · Aeon · MiroShark)" as a blanket
      // property of the catalog. It was retired when the measurement showed
      // most tools ran one Blue persona and none involved a second model or
      // vendor; Aeon and MiroShark were then retired outright on 2026-09-27.
      // Keep this describing capability and pricing — the roster belongs in
      // the per-tool `agents` field above, where it is checkable.
      // Both chains are named because a ticker alone does not identify a token
      // here (CLAUDE.md rule 1) and ~30 rh-* tools are Robinhood-Chain-only.
      // `network` below is the PAYMENT rail (USDC on Base) and is unrelated to
      // which chain a given tool reads.
      description:
        "AI agent tools for builders and traders on Base (8453) and Robinhood Chain (4663) — on-chain data, security audits, DeFi and market signals. Pay per call in USDC over x402. No API key, no signup.",
      url: `${BASE}/hub`,
      protocol: "x402",
      x402Version: 2,
      network: "eip155:8453",
      asset: USDC,
      payTo: PAY_TO,
      count: tools.length,
      // ── the receipt for `count` ───────────────────────────────────────────
      // `count` on its own is an assertion. These three make it re-computable by
      // the caller: `listed` is how many entries the catalog holds, `withHandler`
      // how many of those resolve to code that runs, and `count` is the
      // intersection this response actually published. Equal ⟹ no ghosts.
      //
      // The comment above the filter explains why the filter exists at all: the
      // sibling /api/v1 index DID advertise two ids that answer 501, and a
      // directory indexing it could not tell a real tool from a ghost. Silently
      // filtering fixes the list but hides the fact — a caller sees a smaller
      // number with no way to know whether we trimmed ghosts or lost tools.
      // Printing all three makes the difference visible instead of absorbed.
      //
      // 🔴 Never collapse these to one number, and never compute `listed` from
      // `tools.length`. Both are the same mistake: deriving the check from the
      // thing being checked, which passes no matter what. `scripts/docs-truth-check.ts`
      // (group 4) pins the equality; `hub-receipts-report.ts` prints it beside
      // the symbol each came from.
      integrity: {
        listed: AGENT_TOOLS.length,
        withHandler: Object.keys(HANDLERS).length,
        /** true ⟹ every listed tool has a handler and every handler is listed. */
        noOrphans: AGENT_TOOLS.length === Object.keys(HANDLERS).length
          && tools.length === AGENT_TOOLS.length,
      },
      tools,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    }
  );
}

export function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
