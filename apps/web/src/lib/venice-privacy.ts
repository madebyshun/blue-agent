/**
 * Venice AI privacy tiers, DIEM/USD billing balance monitor, and TEE remote
 * attestation reader for Blue Chat.
 */

export type PrivacyTier = "anonymized" | "private" | "tee" | "e2ee";

export interface PrivacyBadge {
  tier: PrivacyTier;
  label: string;
  color: string;
  summary: string;
}

const VENICE_BASE = "https://api.venice.ai/api/v1";

export function isVeniceTeeModelId(modelId?: string | null): boolean {
  return !!modelId && /(?:^e2ee-|-e2ee$)/i.test(modelId.trim());
}

export function resolvePrivacyTier(opts: {
  provider: "virtuals" | "venice";
  modelId: string;
  catalogPrivacy?: string | null;
  capabilities?: Record<string, boolean> | null;
  clientE2eeActive?: boolean;
}): PrivacyTier | null {
  const { provider, modelId, catalogPrivacy, capabilities, clientE2eeActive } = opts;
  const isTeeId = isVeniceTeeModelId(modelId);

  if (provider === "venice") {
    const supportsE2EE = capabilities?.supportsE2EE === true || isTeeId;
    const supportsTee = capabilities?.supportsTeeAttestation === true || isTeeId;
    if (clientE2eeActive && supportsE2EE) return "e2ee";
    if (supportsTee) return "tee";
    if (catalogPrivacy === "private") return "private";
    if (catalogPrivacy === "anonymized") return "anonymized";
    return null;
  }

  return isTeeId ? "tee" : null;
}

const BADGES: Record<PrivacyTier, PrivacyBadge> = {
  e2ee: {
    tier: "e2ee",
    label: "E2EE",
    color: "#10B981",
    summary: "Client-encrypted (secp256k1 + AES-256-GCM) to a verified TEE enclave; blind relay.",
  },
  tee: {
    tier: "tee",
    label: "TEE",
    color: "#6EE7B7",
    summary: "Hardware-isolated TEE enclave with remote attestation; plaintext reaches proxy.",
  },
  private: {
    tier: "private",
    label: "ZDR",
    color: "#34D399",
    summary: "Zero data retention (contract-enforced on Venice infrastructure).",
  },
  anonymized: {
    tier: "anonymized",
    label: "ANON",
    color: "#94A3B8",
    summary: "Identity obscured by Venice proxy; upstream model provider still sees prompt.",
  },
};

export function privacyTierBadge(tier: PrivacyTier | null | undefined): PrivacyBadge | null {
  return tier ? BADGES[tier] : null;
}

export interface VeniceBillingStatus {
  status: "ok" | "low_balance" | "exhausted" | "missing_key" | "unavailable";
  canConsume: boolean;
  consumptionCurrency: string | null;
  diemBalance: number | null;
  usdBalance: number | null;
  diemEpochAllocation: number | null;
  checkedAt: string;
  cached: boolean;
  error?: string;
}

const BILLING_CACHE_TTL_MS = 2 * 60 * 1000;
let _billingCache: { value: VeniceBillingStatus; at: number } | null = null;

export function parseVeniceBillingPayload(
  raw: unknown,
  checkedAt = new Date().toISOString(),
): VeniceBillingStatus {
  if (!raw || typeof raw !== "object") {
    return {
      status: "unavailable",
      canConsume: false,
      consumptionCurrency: null,
      diemBalance: null,
      usdBalance: null,
      diemEpochAllocation: null,
      checkedAt,
      cached: false,
      error: "Invalid billing payload",
    };
  }
  const obj = raw as {
    canConsume?: unknown;
    consumptionCurrency?: unknown;
    balances?: { diem?: unknown; usd?: unknown };
    diemEpochAllocation?: unknown;
  };
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const diemBalance = num(obj.balances?.diem);
  const usdBalance = num(obj.balances?.usd);
  const diemEpochAllocation = num(obj.diemEpochAllocation);
  const canConsume = obj.canConsume === true;
  const consumptionCurrency = typeof obj.consumptionCurrency === "string" ? obj.consumptionCurrency : null;

  const totalAvailable = (diemBalance ?? 0) + (usdBalance ?? 0);
  const status: VeniceBillingStatus["status"] = !canConsume
    ? "exhausted"
    : totalAvailable > 0 && totalAvailable < 1.0
      ? "low_balance"
      : "ok";

  return {
    status,
    canConsume,
    consumptionCurrency,
    diemBalance,
    usdBalance,
    diemEpochAllocation,
    checkedAt,
    cached: false,
  };
}

function getVeniceKey(): string {
  return process.env.VENICE_API_KEY || process.env.VENICE_INFERENCE_KEY || "";
}

export async function readVeniceBillingBalance(opts?: {
  force?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<VeniceBillingStatus> {
  const now = Date.now();
  if (!opts?.force && _billingCache && now - _billingCache.at < BILLING_CACHE_TTL_MS) {
    return { ..._billingCache.value, cached: true };
  }

  const key = getVeniceKey();
  const checkedAt = new Date(now).toISOString();
  if (!key) {
    return {
      status: "missing_key",
      canConsume: false,
      consumptionCurrency: null,
      diemBalance: null,
      usdBalance: null,
      diemEpochAllocation: null,
      checkedAt,
      cached: false,
      error: "Venice key not configured",
    };
  }

  const f = opts?.fetchImpl ?? fetch;
  try {
    const res = await f(`${VENICE_BASE}/billing/balance`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        status: "unavailable",
        canConsume: false,
        consumptionCurrency: null,
        diemBalance: null,
        usdBalance: null,
        diemEpochAllocation: null,
        checkedAt,
        cached: false,
        error: `HTTP ${res.status}${errText ? `: ${errText.slice(0, 120)}` : ""}`,
      };
    }
    const parsed = parseVeniceBillingPayload(await res.json(), checkedAt);
    _billingCache = { value: parsed, at: now };
    return parsed;
  } catch (e) {
    return {
      status: "unavailable",
      canConsume: false,
      consumptionCurrency: null,
      diemBalance: null,
      usdBalance: null,
      diemEpochAllocation: null,
      checkedAt,
      cached: false,
      error: (e as Error).message.slice(0, 120),
    };
  }
}

export interface TeeAttestationEvidence {
  ok: boolean;
  model: string;
  teeProvider: string | null;
  signingKey: string | null;
  signingAlgo: string | null;
  nonce: string | null;
  nonceMatches: boolean | null;
  hasIntelQuote: boolean;
  intelQuotePreview: string | null;
  hasNvidiaPayload: boolean;
  verifiedAt: string;
  cached: boolean;
  raw?: Record<string, unknown>;
  error?: string;
}

const ATTESTATION_CACHE_TTL_MS = 5 * 60 * 1000;
const _attestationCache = new Map<string, { value: TeeAttestationEvidence; at: number }>();

export function parseTeeAttestationPayload(
  model: string,
  raw: unknown,
  expectedNonce?: string,
  verifiedAt = new Date().toISOString(),
): TeeAttestationEvidence {
  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      model,
      teeProvider: null,
      signingKey: null,
      signingAlgo: null,
      nonce: null,
      nonceMatches: expectedNonce ? false : null,
      hasIntelQuote: false,
      intelQuotePreview: null,
      hasNvidiaPayload: false,
      verifiedAt,
      cached: false,
      error: "Empty or non-object attestation response",
    };
  }

  const obj = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  const teeProvider = str(obj.tee_provider) ?? str(obj.provider);
  const signingKey = str(obj.signing_key) ?? str(obj.model_pub_key) ?? str(obj.public_key);
  const signingAlgo = str(obj.signing_algo) ?? (signingKey ? "ecdsa" : null);
  const nonce = str(obj.nonce);
  const intelQuote = str(obj.intel_quote);
  const hasNvidiaPayload = obj.nvidia_payload != null && (typeof obj.nvidia_payload === "string" ? obj.nvidia_payload.length > 0 : typeof obj.nvidia_payload === "object");
  const nonceMatches = expectedNonce ? nonce?.toLowerCase() === expectedNonce.toLowerCase() : null;
  const ok = Boolean((intelQuote || hasNvidiaPayload || signingKey) && (nonceMatches !== false));

  return {
    ok,
    model,
    teeProvider,
    signingKey,
    signingAlgo,
    nonce,
    nonceMatches,
    hasIntelQuote: Boolean(intelQuote),
    intelQuotePreview: intelQuote ? `${intelQuote.slice(0, 32)}…${intelQuote.slice(-16)}` : null,
    hasNvidiaPayload,
    verifiedAt,
    cached: false,
    raw: obj,
  };
}

export async function readVeniceTeeAttestation(
  model: string,
  opts?: { nonce?: string; force?: boolean; fetchImpl?: typeof fetch },
): Promise<TeeAttestationEvidence> {
  const cleanModel = model.trim();
  const verifiedAt = new Date().toISOString();
  if (!isVeniceTeeModelId(cleanModel)) {
    return {
      ok: false,
      model: cleanModel,
      teeProvider: null,
      signingKey: null,
      signingAlgo: null,
      nonce: null,
      nonceMatches: null,
      hasIntelQuote: false,
      intelQuotePreview: null,
      hasNvidiaPayload: false,
      verifiedAt,
      cached: false,
      error: "Model is not a Venice TEE/E2EE model",
    };
  }

  const now = Date.now();
  if (!opts?.nonce && !opts?.force) {
    const hit = _attestationCache.get(cleanModel);
    if (hit && now - hit.at < ATTESTATION_CACHE_TTL_MS) {
      return { ...hit.value, cached: true };
    }
  }

  const key = getVeniceKey();
  if (!key) {
    return {
      ok: false,
      model: cleanModel,
      teeProvider: null,
      signingKey: null,
      signingAlgo: null,
      nonce: null,
      nonceMatches: null,
      hasIntelQuote: false,
      intelQuotePreview: null,
      hasNvidiaPayload: false,
      verifiedAt,
      cached: false,
      error: "Venice key not configured",
    };
  }

  const qs = new URLSearchParams({ model: cleanModel });
  if (opts?.nonce) qs.set("nonce", opts.nonce);

  const f = opts?.fetchImpl ?? fetch;
  try {
    const res = await f(`${VENICE_BASE}/tee/attestation?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        ok: false,
        model: cleanModel,
        teeProvider: null,
        signingKey: null,
        signingAlgo: null,
        nonce: null,
        nonceMatches: opts?.nonce ? false : null,
        hasIntelQuote: false,
        intelQuotePreview: null,
        hasNvidiaPayload: false,
        verifiedAt,
        cached: false,
        error: `Venice attestation HTTP ${res.status}${errText ? `: ${errText.slice(0, 120)}` : ""}`,
      };
    }
    const parsed = parseTeeAttestationPayload(cleanModel, await res.json(), opts?.nonce, verifiedAt);
    if (!opts?.nonce && parsed.ok) {
      _attestationCache.set(cleanModel, { value: parsed, at: now });
    }
    return parsed;
  } catch (e) {
    return {
      ok: false,
      model: cleanModel,
      teeProvider: null,
      signingKey: null,
      signingAlgo: null,
      nonce: null,
      nonceMatches: opts?.nonce ? false : null,
      hasIntelQuote: false,
      intelQuotePreview: null,
      hasNvidiaPayload: false,
      verifiedAt,
      cached: false,
      error: (e as Error).message.slice(0, 120),
    };
  }
}
