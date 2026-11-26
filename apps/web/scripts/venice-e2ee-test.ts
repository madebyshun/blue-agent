/**
 * Hermetic cryptographic round-trip tests for src/lib/venice-e2ee.ts (Step 3).
 * Run: TMPDIR=/tmp node --import tsx scripts/venice-e2ee-test.ts
 */
import assert from "node:assert/strict";
import {
  generateEphemeralKeyPair,
  generateAttestationNonce,
  validateClientPubkey,
  isHexEncrypted,
  encryptMessageForE2EE,
  decryptChunkFromE2EE,
  encryptMessagesForE2EE,
  zeroFill,
} from "../src/lib/venice-e2ee";

let passed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(() => {
    passed++;
  });
}

async function main() {
  await test("1. Ephemeral secp256k1 keypair has 130-char uncompressed 04 pubkey and zeroFill wipes privateKey", () => {
    const kp = generateEphemeralKeyPair();
    assert.equal(kp.privateKey.length, 32);
    assert.equal(kp.publicKeyHex.length, 130);
    assert.equal(kp.publicKeyHex.startsWith("04"), true);
    validateClientPubkey(kp.publicKeyHex);
    zeroFill(kp.privateKey);
    assert.equal(kp.privateKey.every((b) => b === 0), true);
  });

  await test("2. Attestation nonce is strictly 32 bytes (64 hex chars)", () => {
    const n1 = generateAttestationNonce();
    const n2 = generateAttestationNonce();
    assert.equal(n1.length, 64);
    assert.match(n1, /^[0-9a-f]{64}$/);
    assert.notEqual(n1, n2);
  });

  await test("3. Round-trip ECDH + HKDF-SHA256 + AES-256-GCM works for ASCII and Vietnamese UTF-8", async () => {
    const enclave = generateEphemeralKeyPair();
    const plain = "Kiểm tra danh mục NVDAc + 0.5 DIEM trên Base 8453 — tuyệt mật!";
    const cipherHex = await encryptMessageForE2EE(plain, enclave.publicKeyHex);
    assert.equal(isHexEncrypted(cipherHex), true);
    assert.equal(cipherHex.includes("NVDAc"), false);

    const decrypted = await decryptChunkFromE2EE(cipherHex, enclave.privateKey);
    assert.equal(decrypted, plain);
    zeroFill(enclave.privateKey);
  });

  await test("4. encryptMessagesForE2EE encrypts all non-empty roles including assistant for multi-turn TEE", async () => {
    const enclave = generateEphemeralKeyPair();
    const out = await encryptMessagesForE2EE(
      [
        { role: "system", content: "You are a private assistant." },
        { role: "user", content: "My wallet strategy" },
        { role: "assistant", content: "Prior assistant reply" },
        { role: "assistant", content: "" },
      ],
      enclave.publicKeyHex,
    );
    assert.equal(out.length, 3);
    assert.equal(isHexEncrypted(out[0].content), true);
    assert.equal(isHexEncrypted(out[1].content), true);
    assert.equal(isHexEncrypted(out[2].content), true);
    assert.equal(await decryptChunkFromE2EE(out[1].content, enclave.privateKey), "My wallet strategy");
    assert.equal(await decryptChunkFromE2EE(out[2].content, enclave.privateKey), "Prior assistant reply");
    zeroFill(enclave.privateKey);
  });

  await test("5. Tampered ciphertext fails AES-GCM authentication tag verification", async () => {
    const enclave = generateEphemeralKeyPair();
    const cipherHex = await encryptMessageForE2EE("secret prompt", enclave.publicKeyHex);
    const flipped = cipherHex.slice(0, -2) + (cipherHex.endsWith("00") ? "ff" : "00");
    await assert.rejects(() => decryptChunkFromE2EE(flipped, enclave.privateKey));
    zeroFill(enclave.privateKey);
  });

  console.log(`venice-e2ee-test: PASS (${passed}/5)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
