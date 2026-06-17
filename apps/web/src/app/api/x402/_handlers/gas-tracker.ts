// x402/gas-tracker — live Base gas price + USD cost estimates for common actions
// Price: $0.02 — Base RPC + DexScreener ETH price, no LLM, no fabricated numbers.

const BASE_RPC = "https://mainnet.base.org";
const WETH_BASE = "0x4200000000000000000000000000000000000006";

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

// Returns a hex result from a Base JSON-RPC call, or null on failure.
async function rpcCall(method: string, params: unknown[] = []): Promise<string | null> {
  try {
    const res = await fetch(BASE_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string };
    return typeof data.result === "string" ? data.result : null;
  } catch {
    return null;
  }
}

// hex wei → gwei (number), or null.
function weiHexToGwei(hex: string | null): number | null {
  if (!hex) return null;
  try {
    const wei = BigInt(hex);
    return Number(wei) / 1e9;
  } catch {
    return null;
  }
}

async function getEthPriceUsd(): Promise<number | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${WETH_BASE}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { pairs?: { chainId?: string; priceUsd?: string; liquidity?: { usd?: number } }[] };
    const basePairs = (data.pairs ?? [])
      .filter((p) => p.chainId === "base")
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    return num(basePairs[0]?.priceUsd);
  } catch {
    return null;
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    console.log("[GasTracker] Fetching Base gas price");

    const [gasHex, priorityHex, ethPrice] = await Promise.all([
      rpcCall("eth_gasPrice"),
      rpcCall("eth_maxPriorityFeePerGas"),
      getEthPriceUsd(),
    ]);

    const base_fee_gwei = weiHexToGwei(gasHex);
    // Prefer the RPC priority fee; else a conservative ~0.01 gwei estimate for Base.
    const priority_fee_gwei = weiHexToGwei(priorityHex) ?? 0.01;

    const GAS_UNITS = {
      simple_transfer: 21000,
      erc20_transfer: 65000,
      swap: 180000,
      contract_deploy: 1500000,
    };

    // cost_usd = gwei * 1e-9 (ETH/unit) * units * eth_price. null if inputs missing.
    const costUsd = (units: number): number | null =>
      base_fee_gwei != null && ethPrice != null
        ? +(base_fee_gwei * 1e-9 * units * ethPrice).toFixed(4)
        : null;

    const estimated_cost = {
      simple_transfer_usd: costUsd(GAS_UNITS.simple_transfer),
      erc20_transfer_usd: costUsd(GAS_UNITS.erc20_transfer),
      swap_usd: costUsd(GAS_UNITS.swap),
      contract_deploy_usd: costUsd(GAS_UNITS.contract_deploy),
    };

    // Congestion bands from base fee (code logic, not LLM). Unknown if no fee.
    let congestion: "low" | "medium" | "high" | "unknown" = "unknown";
    if (base_fee_gwei != null) {
      congestion = base_fee_gwei < 5 ? "low" : base_fee_gwei <= 20 ? "medium" : "high";
    }

    return Response.json({
      tool: "gas-tracker",
      chain: "base",
      chainId: 8453,
      base_fee_gwei,
      priority_fee_gwei,
      estimated_cost,
      congestion,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[GasTracker] Error:", error);
    return Response.json(
      { error: "Gas tracker failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
