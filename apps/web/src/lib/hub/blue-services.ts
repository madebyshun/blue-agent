/**
 * Blue Agent's own services a buyer can hire from its page (Hire Agent) and
 * that /api/hire will carry. Data-grounded tools only: each reads a contract,
 * a pool, an oracle or a named API, so the answer can be checked. The
 * advisory, model-written tools stay on /services but are not offered here.
 *
 * Built from the same pieces the live 402 uses (AGENT_TOOLS, PRICE_UNITS,
 * wireSchema), so the price and body shown are what the endpoint will quote.
 */
import { AGENT_TOOLS } from "@/lib/agent-tools";
import { PRICE_UNITS } from "@/lib/x402-internal-run";
import { wireSchema } from "@/lib/tool-wire-schema";
import type { ResourceSample } from "@/lib/hub/exchange";

export const BLUE_HIRE_IDS = [
  // Base token checks
  "token-price", "honeypot-check", "liquidity-depth", "contract-trust", "dex-flow", "safe-trending", "pool-scan",
  // wallets and gas
  "wallet-risk", "gas-tracker",
  // stock tokens: Base B20 and Robinhood Chain
  "b20-inspect", "base-stock-search", "base-stock-quote", "base-stock-ohlc", "base-stock-liquidity", "base-stock-movers",
  "rh-stock-quote", "rh-stock-arb", "rh-stock-ohlc", "rh-stock-liquidity", "rh-stock-movers",
] as const;

export function blueHireServices(): ResourceSample[] {
  return BLUE_HIRE_IDS.flatMap((id) => {
    const t = AGENT_TOOLS.find((x) => x.id === id);
    const units = PRICE_UNITS.get(id);
    if (!t || !units) return [];
    const fields = wireSchema(t).fields;
    const example = Object.fromEntries(
      fields.filter((f) => f.required || (f.default !== undefined && f.default !== null))
        .map((f) => [f.name, f.default !== undefined && f.default !== null ? f.default : f.type === "number" ? 0 : f.type === "boolean" ? false : ""]),
    );
    return [{
      url: `https://blueagent.dev/api/x402/${id}`,
      priceUsd: units / 1e6,
      description: `${t.name}: ${t.description}`.slice(0, 300),
      method: "POST", bodyType: "json", example, exampleIn: "body" as const,
    }];
  });
}
