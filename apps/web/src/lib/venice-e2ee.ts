/**
 * Venice AI client-side End-to-End Encryption (Strict E2EE) protocol.
 *
 * Implements the exact wire format documented at:
 *   https://docs.venice.ai/guides/features/tee-e2ee-models
 *
 *   - Key agreement: ECDH on secp256k1 (32-byte big-endian X coordinate)
 *   - KDF:           HKDF-SHA256, empty salt, info = UTF-8("ecdsa_encryption"), 32-byte key
 *   - Cipher:        AES-256-GCM, 12-byte random IV, 16-byte auth tag
 *   - Payload:       uncompressed ephemeral pubkey (65B) || IV (12B) || ciphertext+tag → lowercase hex
 *   - Nonce:         32 random bytes (64 hex chars) required by TEE attestation providers
 *
 * Zero extra npm packages: uses `@noble/curves/secp256k1` (already bundled via
 * viem) plus standard Web Crypto (`crypto.subtle` & `crypto.getRandomValues`).
 */
import { secp256k1 } from "@noble/curves/secp256k1";

const HKDF_INFO = new TextEncoder().encode("ecdsa_encryption");

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error("Invalid hex string");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export interface EphemeralKeyPair {
  privateKey: Uint8Array;
  /** Uncompressed secp256k1 public key: 130 lowercase hex chars starting with "04". */
  publicKeyHex: string;
}

export function generateEphemeralKeyPair(): EphemeralKeyPair {
  const privateKey = secp256k1.utils.randomPrivateKey();
  const publicKey = secp256k1.getPublicKey(privateKey, false); // 65 bytes, 0x04 || X || Y
  return { privateKey, publicKeyHex: bytesToHex(publicKey) };
}

/** Securely zero-fill private key bytes in memory after the session completes. */
export function zeroFill(arr: Uint8Array): void {
  arr.fill(0);
}

/** Generate a 32-byte (64 lowercase hex chars) nonce required by Venice TEE providers. */
export function generateAttestationNonce(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export function validateClientPubkey(pubkeyHex: string): void {
  if (pubkeyHex.length !== 130 || !pubkeyHex.startsWith("04") || !/^[0-9a-fA-F]+$/.test(pubkeyHex)) {
    throw new Error(`Client pubkey must be 130 hex chars starting with '04' (got ${pubkeyHex.length})`);
  }
}

export function normalizeModelPubkey(pubkeyHex: string): string {
  const clean = pubkeyHex.startsWith("0x") || pubkeyHex.startsWith("0X") ? pubkeyHex.slice(2) : pubkeyHex;
  if (clean.length === 128 && !clean.startsWith("04")) return `04${clean}`;
  return clean;
}

/** Minimum encrypted payload: 65B pubkey + 12B IV + 16B GCM tag = 93B = 186 hex chars. */
export function isHexEncrypted(s: string): boolean {
  return typeof s === "string" && s.length >= 186 && s.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(s);
}

async function deriveAesKey(sharedSecretX: Uint8Array): Promise<CryptoKey> {
  const ikm = await globalThis.crypto.subtle.importKey(
    "raw",
    sharedSecretX as unknown as BufferSource,
    "HKDF",
    false,
    ["deriveKey"],
  );
  return globalThis.crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: HKDF_INFO,
    },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypts a single UTF-8 string to a Venice TEE model's secp256k1 public key.
 * Returns lowercase hex: `ephemeralPub(65B) || iv(12B) || ciphertext+tag`.
 */
export async function encryptMessageForE2EE(plaintext: string, modelPublicKeyHex: string): Promise<string> {
  const norm = normalizeModelPubkey(modelPublicKeyHex);
  validateClientPubkey(norm);

  const eph = generateEphemeralKeyPair();
  try {
    // Uncompressed shared point is 65 bytes (0x04 || X(32) || Y(32)); Venice uses the 32-byte X coordinate.
    const sharedPoint = secp256k1.getSharedSecret(eph.privateKey, hexToBytes(norm), false);
    const sharedX = sharedPoint.slice(1, 33);
    const aesKey = await deriveAesKey(sharedX);

    const iv = new Uint8Array(12);
    globalThis.crypto.getRandomValues(iv);
    const encryptedBuf = await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      new TextEncoder().encode(plaintext),
    );
    const encrypted = new Uint8Array(encryptedBuf);
    const ephPubBytes = hexToBytes(eph.publicKeyHex);

    const combined = new Uint8Array(65 + 12 + encrypted.length);
    combined.set(ephPubBytes, 0);
    combined.set(iv, 65);
    combined.set(encrypted, 77);
    return bytesToHex(combined);
  } finally {
    zeroFill(eph.privateKey);
  }
}

/**
 * Decrypts one hex-encoded E2EE response chunk using the client session's
 * ephemeral secp256k1 private key.
 */
export async function decryptChunkFromE2EE(ciphertextHex: string, clientPrivateKey: Uint8Array): Promise<string> {
  if (!isHexEncrypted(ciphertextHex)) {
    throw new Error("Chunk is not valid E2EE hex payload");
  }
  const raw = hexToBytes(ciphertextHex);
  const serverEphemeralPub = raw.slice(0, 65);
  const iv = raw.slice(65, 77);
  const ciphertext = raw.slice(77);

  const sharedPoint = secp256k1.getSharedSecret(clientPrivateKey, serverEphemeralPub, false);
  const sharedX = sharedPoint.slice(1, 33);
  const aesKey = await deriveAesKey(sharedX);

  const plainBuf = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    ciphertext,
  );
  return new TextDecoder().decode(plainBuf);
}

export interface E2eeMessage {
  role: string;
  content: string;
}

/**
 * Encrypts all non-empty messages (`user`, `system`, and `assistant`) for
 * Venice E2EE. Venice TEE providers (e.g. `z-ai/glm-5.3-flash`) require every
 * message `content` field in multi-turn conversations to be valid hex
 * ciphertext, otherwise returning HTTP 400 `Encrypted field is not valid hex`.
 */
export async function encryptMessagesForE2EE(
  messages: E2eeMessage[],
  modelPublicKeyHex: string,
): Promise<E2eeMessage[]> {
  return Promise.all(
    messages
      .filter((m) => typeof m.content === "string" && m.content.length > 0)
      .map(async (m) => ({
        ...m,
        content: await encryptMessageForE2EE(m.content, modelPublicKeyHex),
      })),
  );
}
