/** Default host. `apps/web` is the only live x402 surface — see repo CLAUDE.md. */
export const DEFAULT_BASE_URL = "https://blueagent.dev";

/**
 * One entry of the `accepts[]` array in an x402 v2 402 body, exactly as
 * `POST /api/x402/{tool}` returns it. Measured against production, not assumed:
 * the amount field is `amount` (USDC base units, 6dp), and the human-readable
 * `description` / `mimeType` live at the top level under `resource`, not here.
 */
export type PaymentRequirement = {
  scheme: string;
  /** CAIP-2, e.g. "eip155:8453" (Base mainnet). */
  network: string;
  /** Amount in the asset's base units — USDC has 6 decimals, so "200000" = $0.20. */
  amount: string;
  /** ERC-20 contract of the payment asset (USDC on Base). */
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
};

/** The full 402 body. `accepts` lists every payment option the route will take. */
export type PaymentRequiredBody = {
  x402Version: number;
  error: string;
  resource?: { url: string; description?: string; mimeType?: string };
  accepts: PaymentRequirement[];
  tool?: { id: string; name: string; price: string };
};

export type BlueAgentClientOptions = {
  /** Base URL for the Blue Agent API. Defaults to BLUEAGENT_API_URL, then https://blueagent.dev */
  baseUrl?: string;
  /** Optional API key, sent as Authorization: Bearer */
  apiKey?: string;
  /** Optional function to sign x402 payment requirements. Receives the requirement and returns base64-encoded X-Payment header value */
  signPayment?: (requirement: PaymentRequirement) => Promise<string>;
};

/**
 * Call a Blue Agent x402 tool by name.
 * Handles 402 Payment Required by invoking signPayment if provided.
 */
export async function callTool(
  toolName: string,
  args: Record<string, unknown>,
  options: BlueAgentClientOptions = {}
): Promise<string> {
  const baseUrl = options.baseUrl ?? process.env.BLUEAGENT_API_URL ?? DEFAULT_BASE_URL;

  // `/api/x402/{id}` is the live path. This used to say `/api/tools/{id}`, which
  // has never existed on any branch of the server repo and 404s in production —
  // so every action in this package was unreachable before v1.3.0.
  const url = `${baseUrl.replace(/\/$/, "")}/api/x402/${toolName}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options.apiKey) {
    headers["Authorization"] = `Bearer ${options.apiKey}`;
  }

  const body = JSON.stringify(args);

  let response = await fetch(url, { method: "POST", headers, body });

  if (response.status === 402) {
    // Requirements come back in the JSON body under `accepts[]`. They are NOT in
    // an `X-Payment-Required` header — this client used to read one, and the
    // server has never sent one, so the paid path could not complete either.
    const raw = await response.text().catch(() => "");
    let paid: PaymentRequiredBody | null = null;
    try {
      paid = JSON.parse(raw) as PaymentRequiredBody;
    } catch {
      throw new Error(
        `Tool '${toolName}' returned 402 with an unparsable body: ${raw.slice(0, 200)}`
      );
    }

    const requirement = paid?.accepts?.[0];
    // Prefer the catalog's display price; fall back to base units so the message
    // is never silently "unknown" when the server did tell us the amount.
    const price = paid?.tool?.price ?? (requirement ? `${requirement.amount} base units` : "unknown");

    if (!options.signPayment) {
      throw new Error(
        `Payment required for tool '${toolName}' (${price}). ` +
        "Provide a signPayment function in options to handle x402 payments automatically."
      );
    }

    if (!requirement) {
      throw new Error(`Tool '${toolName}' returned 402 but no accepts[] entry to pay against`);
    }

    headers["X-Payment"] = await options.signPayment(requirement);
    response = await fetch(url, { method: "POST", headers, body });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    // 501 is the server saying "this id is in the catalog but has no handler —
    // you were not charged". Name it, so a dead id is diagnosable from the error.
    if (response.status === 501) {
      throw new Error(
        `Tool '${toolName}' is not implemented on the server (501) — no payment was taken. ` +
        `Check https://blueagent.dev/api/catalog for the live tool ids.`
      );
    }
    throw new Error(`Tool '${toolName}' failed with status ${response.status}: ${text}`);
  }

  const data = await response.json();
  return typeof data === "string" ? data : JSON.stringify(data);
}
