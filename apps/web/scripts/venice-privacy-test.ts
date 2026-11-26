/**
 * Hermetic unit tests for src/lib/venice-privacy.ts (Step 1).
 * Run: TMPDIR=/tmp node --import tsx scripts/venice-privacy-test.ts
 */
import assert from "node:assert/strict";
import {
  isVeniceTeeModelId,
  resolvePrivacyTier,
  privacyTierBadge,
  parseVeniceBillingPayload,
  parseTeeAttestationPayload,
  readVeniceTeeAttestation,
} from "../src/lib/venice-privacy";

let passed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(() => {
    passed++;
  });
}

async function main() {
  await test("1. isVeniceTeeModelId matches e2ee- prefix and -e2ee suffix only", () => {
    assert.equal(isVeniceTeeModelId("glm-5-3-flash-e2ee"), true);
    assert.equal(isVeniceTeeModelId("e2ee-deepseek-v4-flash"), true);
    assert.equal(isVeniceTeeModelId("e2ee-gpt-oss-120b-p"), true);
    assert.equal(isVeniceTeeModelId("claude-sonnet-5-5"), false);
    assert.equal(isVeniceTeeModelId("qwen3-5-9b"), false);
    assert.equal(isVeniceTeeModelId(null), false);
  });

  await test("2. resolvePrivacyTier never claims E2EE without clientE2eeActive", () => {
    assert.equal(
      resolvePrivacyTier({ provider: "venice", modelId: "glm-5-3-flash-e2ee", capabilities: { supportsTeeAttestation: true, supportsE2EE: true } }),
      "tee",
    );
    assert.equal(
      resolvePrivacyTier({ provider: "venice", modelId: "glm-5-3-flash-e2ee", capabilities: { supportsTeeAttestation: true, supportsE2EE: true }, clientE2eeActive: true }),
      "e2ee",
    );
    assert.equal(
      resolvePrivacyTier({ provider: "venice", modelId: "qwen3-5-9b", catalogPrivacy: "private" }),
      "private",
    );
    assert.equal(
      resolvePrivacyTier({ provider: "venice", modelId: "claude-sonnet-5-5", catalogPrivacy: "anonymized" }),
      "anonymized",
    );
    assert.equal(
      resolvePrivacyTier({ provider: "virtuals", modelId: "e2ee-deepseek-v4-flash", clientE2eeActive: true }),
      "tee",
    );
    assert.equal(
      resolvePrivacyTier({ provider: "virtuals", modelId: "anthropic-claude-sonnet-5" }),
      null,
    );
  });

  await test("3. privacyTierBadge returns distinct labels for all 4 tiers", () => {
    assert.equal(privacyTierBadge("e2ee")?.label, "E2EE");
    assert.equal(privacyTierBadge("tee")?.label, "TEE");
    assert.equal(privacyTierBadge("private")?.label, "ZDR");
    assert.equal(privacyTierBadge("anonymized")?.label, "ANON");
    assert.equal(privacyTierBadge(null), null);
  });

  await test("4. parseVeniceBillingPayload handles DIEM ok, low_balance, exhausted, invalid", () => {
    const ok = parseVeniceBillingPayload({
      canConsume: true,
      consumptionCurrency: "DIEM",
      balances: { diem: 90.5, usd: 25 },
      diemEpochAllocation: 100,
    });
    assert.equal(ok.status, "ok");
    assert.equal(ok.consumptionCurrency, "DIEM");
    assert.equal(ok.diemEpochAllocation, 100);

    const low = parseVeniceBillingPayload({
      canConsume: true,
      consumptionCurrency: "DIEM",
      balances: { diem: 0.4, usd: 0 },
      diemEpochAllocation: 1,
    });
    assert.equal(low.status, "low_balance");

    const exhausted = parseVeniceBillingPayload({
      canConsume: false,
      consumptionCurrency: "DIEM",
      balances: { diem: 0, usd: 0 },
      diemEpochAllocation: 0,
    });
    assert.equal(exhausted.status, "exhausted");

    const bad = parseVeniceBillingPayload(null);
    assert.equal(bad.status, "unavailable");
  });

  await test("5. parseTeeAttestationPayload validates nonce & enclave fields", () => {
    const good = parseTeeAttestationPayload(
      "glm-5-3-flash-e2ee",
      {
        tee_provider: "phala",
        intel_quote: "AAAA".repeat(20),
        nvidia_payload: { arch: "HOPPER" },
        signing_key: "04" + "ab".repeat(64),
        nonce: "deadbeef12345678",
      },
      "DEADBEEF12345678",
    );
    assert.equal(good.ok, true);
    assert.equal(good.teeProvider, "phala");
    assert.equal(good.nonceMatches, true);
    assert.equal(good.hasIntelQuote, true);
    assert.equal(good.hasNvidiaPayload, true);

    const mismatch = parseTeeAttestationPayload(
      "glm-5-3-flash-e2ee",
      {
        tee_provider: "phala",
        intel_quote: "AAAA".repeat(20),
        nonce: "0000000000000000",
      },
      "deadbeef12345678",
    );
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.nonceMatches, false);
  });

  await test("6. readVeniceTeeAttestation rejects non-TEE model without network call", async () => {
    const res = await readVeniceTeeAttestation("claude-sonnet-5-5");
    assert.equal(res.ok, false);
    assert.match(res.error ?? "", /not a Venice TEE/i);
  });

  console.log(`venice-privacy-test: PASS (${passed}/6)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
