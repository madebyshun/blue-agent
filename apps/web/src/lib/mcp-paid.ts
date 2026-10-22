/**
 * Paid MCP tools over the x402 MCP transport (Blue Agent MCP v2, 2026-10-22).
 *
 * The transport, as implemented by Coinbase's `@x402/mcp` (read from its 2.28.0
 * source, not guessed):
 *   1. Unpaid call → a tool RESULT with `isError: true`, `structuredContent` =
 *      the x402 v2 PaymentRequired, and the same object JSON-encoded in
 *      `content[0].text` (MCP SDK v1 drops McpError data, hence a result).
 *   2. The client retries with the PaymentPayload in `params._meta["x402/payment"]`.
 *   3. We verify, run, and settle — and answer with the SettleResponse in
 *      `result._meta["x402/payment-response"]`.
 * So any wrapped MCP client (`wrapMCPClientWithPayment`, Bazaar's MCP proxy)
 * can pay a Blue Agent tool with no Blue-Agent-specific code.
 *
 * Money rules — the same as /api/x402/[tool], deliberately:
 *   • bad input is refused BEFORE a price is quoted (no 402 for a call that
 *     could never succeed);
 *   • settle only after a successful run — a tool that fails costs nothing;
 *   • payTo is the one treasury every other path pays (lib/x402-payee).
 * Prices are here, in USDC micro-units, beside nothing else that could drift.
 */
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { declareBuilderCodeExtension } from "@x402/extensions/builder-code";
import { buildRequirements, cdpVerify, cdpSettle } from "@/app/api/_lib/x402-cdp";
import { recordMcpReceipt } from "@/lib/mcp-receipts";

export const MCP_PAYMENT_META_KEY = "x402/payment";
export const MCP_PAYMENT_RESPONSE_META_KEY = "x402/payment-response";

/** USDC micro-units (6 decimals). ShunTr, 2026-10-22: "thu phí giống bảng". */
export const MCP_PRICES: Readonly<Record<string, number>> = {
  swap_prepare: 10_000,   // $0.01
  stock_signal: 10_000,   // $0.01
  token_verdict: 10_000,  // $0.01
  wallet_risk: 10_000,    // $0.01
  trending_safe: 50_000,  // $0.05
};

const BUILDER_CODE_EXT = declareBuilderCodeExtension("bc_2ejr35xc");

export interface McpToolOutcome { text: string; isError?: boolean; structured?: Record<string, unknown> }
export interface McpCallResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}

const resourceFor = (tool: string, description: string) => ({
  url: `mcp://tool/${tool}`,
  description,
  mimeType: "application/json",
  serviceName: "Blue Agent",
  tags: ["base", "robinhood", "agents", "tokenized-stocks"],
  iconUrl: "https://blueagent.dev/icon.png",
});

function extensionsFor(tool: string, description: string, inputSchema: Record<string, unknown>) {
  return {
    ...declareDiscoveryExtension({ toolName: tool, description, transport: "streamable-http", inputSchema }),
    "builder-code": BUILDER_CODE_EXT,
  };
}

/** The x402 v2 PaymentRequired for one tool, as a tool result. */
export function paymentRequiredResult(
  tool: string, description: string, inputSchema: Record<string, unknown>, error = "Payment required to access this tool",
): McpCallResult {
  const units = MCP_PRICES[tool];
  const paymentRequired = {
    x402Version: 2,
    error,
    resource: resourceFor(tool, description),
    accepts: [buildRequirements(String(units))],
    extensions: extensionsFor(tool, description, inputSchema),
  };
  return {
    isError: true,
    structuredContent: paymentRequired,
    content: [{ type: "text", text: JSON.stringify(paymentRequired) }],
  };
}

/** The payment the client attached, or null. Accepts an object or a base64/JSON string. */
export function paymentFromMeta(meta: unknown): Record<string, unknown> | null {
  const raw = (meta as Record<string, unknown> | undefined)?.[MCP_PAYMENT_META_KEY];
  if (!raw) return null;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    for (const decode of [(s: string) => s, (s: string) => Buffer.from(s, "base64").toString("utf-8")]) {
      try { const o = JSON.parse(decode(raw)); if (o && typeof o === "object") return o as Record<string, unknown>; } catch { /* next */ }
    }
  }
  return null;
}

/**
 * Run a paid tool: quote when unpaid, verify, run, settle only on success.
 * `refuse` is the cheap input check (no network); `run` does the work.
 */
export async function runPaidMcpTool(opts: {
  tool: string;
  description: string;
  inputSchema: Record<string, unknown>;
  meta: unknown;
  refuse: () => string | null;
  run: () => Promise<McpToolOutcome>;
}): Promise<McpCallResult> {
  const { tool, description, inputSchema } = opts;
  const units = MCP_PRICES[tool];
  if (!units) throw new Error(`${tool} has no MCP price`);

  // Bad input never gets a price.
  const why = opts.refuse();
  if (why) return { isError: true, content: [{ type: "text", text: `[BAD_INPUT] ${why} Nothing was charged.` }] };

  const payment = paymentFromMeta(opts.meta);
  if (!payment) return paymentRequiredResult(tool, description, inputSchema);

  const requirements = buildRequirements(String(units));
  const resource = resourceFor(tool, description);
  const extensions = extensionsFor(tool, description, inputSchema);
  const verify = await cdpVerify(payment, requirements, resource, extensions);
  if (!verify.ok) {
    const detail = typeof verify.detail === "object" && verify.detail
      ? String((verify.detail as Record<string, unknown>).invalidReason ?? (verify.detail as Record<string, unknown>).errorMessage ?? "")
      : String(verify.detail ?? "");
    return paymentRequiredResult(tool, description, inputSchema, `Payment verification failed${detail ? `: ${detail}` : ""}`);
  }

  const payer = payerFromPayloadSync(payment);
  const notCharged = () => recordMcpReceipt({ tool, outcome: "not_charged", units: 0, payer, tx: null });
  let out: McpToolOutcome;
  try {
    out = await opts.run();
  } catch (e) {
    const err = e as Error & { code?: string };
    await notCharged();
    return { isError: true, content: [{ type: "text", text: `${err.code ? `[${err.code}] ` : "Error: "}${err.message} You were not charged.` }] };
  }
  if (out.isError) {
    await notCharged();
    return { isError: true, content: [{ type: "text", text: `${out.text}\n\nYou were not charged.` }] };
  }

  const settle = await cdpSettle(payment, requirements, resource, extensions);
  // A failed settle still returns the result (parity with /api/x402/[tool]), so
  // the caller was not charged — and the receipt says exactly that.
  await recordMcpReceipt(settle.ok
    ? { tool, outcome: "settled", units, payer, tx: settle.tx ?? null }
    : { tool, outcome: "not_charged", units: 0, payer, tx: null });
  if (settle.ok) {
    const { recordSettlement } = await import("@/lib/x402-settlements");
    await recordSettlement(units, settle.tx).catch(() => {});
    const { recordToolPayment, payerFromPayload } = await import("@/lib/wallet/spend-log");
    await recordToolPayment(payerFromPayload(payment), `mcp:${tool}`, units, settle.tx).catch(() => {});
  }
  return {
    content: [{ type: "text", text: out.text }],
    ...(out.structured ? { structuredContent: out.structured } : {}),
    _meta: {
      [MCP_PAYMENT_RESPONSE_META_KEY]: {
        success: settle.ok,
        transaction: settle.tx ?? null,
        network: requirements.network,
        payer,
      },
    },
  };
}

/** The `from` of an EIP-3009 authorization, without importing the spend log. */
function payerFromPayloadSync(payment: Record<string, unknown>): string | null {
  const auth = ((payment.payload as Record<string, unknown> | undefined)?.authorization ?? {}) as Record<string, unknown>;
  return typeof auth.from === "string" ? auth.from : null;
}
