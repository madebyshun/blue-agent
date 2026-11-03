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

/** A real, valid input per service, so "Check input and price" works first try:
 *  Base WETH / AERO / NVDAc, and NVDA on Robinhood Chain. */
export const BLUE_HIRE_EXAMPLES: Record<string, Record<string, unknown>> = {
  "token-price": { token: "0x4200000000000000000000000000000000000006" },
  "honeypot-check": { token: "0x940181a94A35A4569E4529A3CDfB74e38FD98631" },
  "liquidity-depth": { token: "0x940181a94A35A4569E4529A3CDfB74e38FD98631" },
  "contract-trust": { address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631" },
  "dex-flow": { token: "0x940181a94A35A4569E4529A3CDfB74e38FD98631" },
  "safe-trending": { limit: 5 },
  "pool-scan": { limit: 5 },
  "wallet-risk": { address: "0x4200000000000000000000000000000000000006" },
  "b20-inspect": { address: "0xb20000000000000000000078ee7ce2fE4908108C" },
  "base-stock-search": { query: "NVDA" },
  "base-stock-quote": { ticker: "NVDA" },
  "base-stock-ohlc": { ticker: "NVDA", timeframe: "1h", limit: 24 },
  "base-stock-liquidity": { ticker: "NVDA" },
  "base-stock-movers": { limit: 5 },
  "rh-stock-quote": { ticker: "NVDA" },
  "rh-stock-arb": { ticker: "NVDA" },
  "rh-stock-ohlc": { ticker: "NVDA" },
  "rh-stock-liquidity": { ticker: "NVDA" },
  "rh-stock-movers": { limit: 5 },
};

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
      name: t.name,
      description: t.description.slice(0, 300),
      method: "POST", bodyType: "json", example: BLUE_HIRE_EXAMPLES[id] ?? example, exampleIn: "body" as const,
    }];
  });
}
