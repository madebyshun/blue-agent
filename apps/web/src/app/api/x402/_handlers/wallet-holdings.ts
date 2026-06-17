// x402/wallet-holdings — ERC-20 + native ETH balances for any Base wallet
// Price: $0.05 — pure on-chain data (Moralis), no LLM. Never fabricates a price.

const MORALIS_BASE = "https://deep-index.moralis.io/api/v2.2";
const WETH_BASE = "0x4200000000000000000000000000000000000006";

type MoralisToken = {
  symbol?: string;
  name?: string;
  balance?: string;
  decimals?: number | string;
  token_address?: string;
  usd_value?: number | string;
  usd_price?: number | string;
  possible_spam?: boolean;
};

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

// Live WETH price (USD) from DexScreener, or null if unavailable.
async function getWethPriceUsd(): Promise<number | null> {
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

async function getErc20Balances(address: string): Promise<MoralisToken[]> {
  const key = process.env.MORALIS_API_KEY ?? "";
  if (!key) return [];
  try {
    const res = await fetch(`${MORALIS_BASE}/${address}/erc20?chain=base`, {
      headers: { "X-API-Key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    // Moralis may return a bare array or { result: [] } depending on endpoint version.
    if (Array.isArray(data)) return data as MoralisToken[];
    return ((data as { result?: MoralisToken[] }).result ?? []);
  } catch {
    return [];
  }
}

// Native ETH balance (wei string) for a Base address. null on failure.
async function getNativeBalanceWei(address: string): Promise<string | null> {
  const key = process.env.MORALIS_API_KEY ?? "";
  if (!key) return null;
  try {
    const res = await fetch(`${MORALIS_BASE}/${address}/balance?chain=base`, {
      headers: { "X-API-Key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { balance?: string };
    return data.balance ?? null;
  } catch {
    return null;
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { address?: string } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    if (!body.address) body.address = url.searchParams.get("address") || undefined;

    const { address } = body;
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return Response.json({ error: "Provide a valid wallet address (0x...)" }, { status: 400 });
    }

    console.log(`[WalletHoldings] Reading balances for: ${address}`);

    const [rawTokens, nativeWei, wethPrice] = await Promise.all([
      getErc20Balances(address),
      getNativeBalanceWei(address),
      getWethPriceUsd(),
    ]);

    // Native ETH: wei (1e18) → ETH. Price via WETH (ETH ≈ WETH).
    const native_eth = nativeWei != null ? num(nativeWei) !== null ? Number(nativeWei) / 1e18 : null : null;
    const native_eth_usd =
      native_eth != null && wethPrice != null ? +(native_eth * wethPrice).toFixed(2) : null;

    const tokens = rawTokens
      .filter((t) => !t.possible_spam)
      .map((t) => {
        const decimals = num(t.decimals) ?? 18;
        const rawBal = num(t.balance);
        const balance = rawBal != null ? rawBal / Math.pow(10, decimals) : null;
        // Prefer Moralis-provided usd_value; else derive from usd_price; else null.
        let value_usd = num(t.usd_value);
        if (value_usd == null) {
          const price = num(t.usd_price);
          if (price != null && balance != null) value_usd = +(balance * price).toFixed(2);
        }
        return {
          symbol: t.symbol ?? null,
          balance,
          value_usd,
          contract: t.token_address ?? null,
        };
      });

    const total_usd =
      tokens.reduce((sum, t) => sum + (t.value_usd ?? 0), 0) + (native_eth_usd ?? 0);

    return Response.json({
      tool: "wallet-holdings",
      address,
      chain: "base",
      native_eth,
      native_eth_usd,
      tokens,
      total_usd: +total_usd.toFixed(2),
      token_count: tokens.length,
      data_source: "Moralis",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[WalletHoldings] Error:", error);
    return Response.json(
      { error: "Wallet holdings lookup failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
