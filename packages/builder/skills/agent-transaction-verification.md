# Agent Transaction Verification

Grounding for `blue build`, `blue audit`, `blue validate`, and `blue chat` — comprehensive, Base-native, actionable reference for every layer of transaction verification that an AI agent must perform before sending any onchain action.

This file covers the full lifecycle: preflight → simulation → confirmation → send → log → abort. Every section includes TypeScript code, tradeoffs, common mistakes, and CLI integration examples.

---

## 1. Title and Purpose

**Agent Transaction Verification** is the discipline of ensuring that every transaction an AI agent proposes, constructs, simulates, and sends is provably correct, authorized, scoped to Base, within value limits, decoded and displayed honestly to the user, and fully traceable.

Agents that skip any of these steps are security liabilities. A bug or a hallucinated address in a single transaction can result in irreversible loss of funds. Unlike traditional software bugs, onchain mistakes cannot be rolled back.

### Who This File Is For

- Developers using `blue build` to scaffold agent transaction flows
- Auditors using `blue audit --check tx-safety` to review agent code
- Validators using `blue validate --tx` to verify a raw transaction object
- Chat sessions using `blue chat "review this transaction"` to inspect a proposed tx

### What This File Covers

1. Why verification matters for AI agents (threat model)
2. Transaction anatomy (every field, what it means)
3. Twelve preflight checks before any tx is sent
4. Simulation — dry-running before spending real gas
5. Calldata and recipient validation
6. Chain and token address verification
7. Human confirmation flows
8. Hallucination protection
9. Sending on behalf of users
10. Failure handling and abort rules
11. Logging and traceability
12. Tradeoffs and best practices
13. Common mistakes and red flags
14. CLI integration patterns
15. Resources and references

---

## 2. Core Concepts — Why Verification Matters for AI Agents

### 2.1 The Threat Model

AI agents interacting with blockchain are uniquely dangerous compared to traditional software because:

1. **Irreversibility.** Onchain transactions are final. There is no undo, no chargeback, no support ticket. A wrong `to` address means permanent loss.

2. **LLM hallucination.** Language models can generate addresses, amounts, and calldata that look syntactically correct but are semantically wrong or entirely fabricated. A hallucinated contract address is indistinguishable from a real one in plain text.

3. **Prompt injection.** A user or upstream data source can craft natural language that tricks the agent into constructing a transaction with different parameters than intended. "Send 1 USDC to Alice" can become "send 1000 USDC to attacker" if the agent's intent extraction is weak.

4. **Context collapse.** Agent sessions can lose context about what was confirmed. An agent that was told "send $5 to Bob" might later execute a $500 transaction if it misreads a stored intent.

5. **Chain confusion.** Base (chain ID 8453) and Ethereum mainnet (chain ID 1) have overlapping address formats. An agent that ignores `chainId` can submit a valid-looking transaction on the wrong network.

6. **Token address substitution.** There is no single "USDC." USDC on Ethereum mainnet is `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`. USDC on Base is `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. An agent that hardcodes or guesses the wrong USDC address will either revert or, worse, interact with a malicious token contract.

### 2.2 The Verification Hierarchy

```
Natural language intent
  └── Disambiguation (agent asks clarifying questions)
      └── TransactionRequest construction
          └── Schema validation (Zod)
              └── Preflight checks (12 checks)
                  └── Simulation (eth_call / Tenderly)
                      └── Human confirmation (if required)
                          └── Send to RPC
                              └── Receipt verification
                                  └── Append-only log entry
```

**Every layer is mandatory.** Skipping simulation does not save time — it risks funds. Skipping human confirmation for large amounts is not a UX improvement — it is a security vulnerability.

### 2.3 Why AI Agents Are Different from Traditional Tx Signers

A human using MetaMask sees a confirmation dialog, can read the decoded calldata, and has years of experience spotting phishing. An AI agent:

- Receives instructions in natural language, which is ambiguous
- May have been trained on outdated contract addresses
- Cannot independently verify that a contract does what its name claims
- Can be given intentionally deceptive inputs by malicious users

Therefore, agent verification must be **more rigorous**, not less, than what is expected of a human signer.

---

## 3. Transaction Anatomy — to, value, data, chainId, token, amount

### 3.1 Full Field Reference

Every Ethereum-compatible transaction has the following fields. Agents must understand each one and validate it independently.

```typescript
// Base transaction fields (EIP-1559 format used on Base)
interface RawTransaction {
  // Destination address — the contract or EOA receiving this tx
  to: `0x${string}`;

  // Native ETH value in wei — 0n for token transfers
  value: bigint;

  // Encoded function call (ABI-encoded) — empty for plain ETH sends
  data: `0x${string}`;

  // MUST be 8453 for Base mainnet
  chainId: number;

  // EIP-1559 gas fields
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  gas: bigint;

  // Sender address
  from: `0x${string}`;

  // Replay protection — must match current nonce for `from`
  nonce: number;
}
```

### 3.2 Token Transfer Fields (ERC-20 Layer)

When the transaction is an ERC-20 token transfer, the semantic fields are encoded into `data`. Agents must track both layers:

```typescript
interface TokenTransferIntent {
  // The ERC-20 contract — must be on allowlist
  tokenAddress: `0x${string}`;

  // Human-readable symbol (for display only, never for logic)
  tokenSymbol: string;

  // Number of decimals — used for amount conversion
  tokenDecimals: number;

  // Recipient — separate from tx.to (which is the token contract)
  recipient: `0x${string}`;

  // Amount in human-readable units (e.g., "10.5")
  amountHuman: string;

  // Amount in raw token units (amountHuman * 10^decimals)
  amountRaw: bigint;
}
```

**Critical distinction:** For an ERC-20 transfer, `tx.to` is the token contract address (e.g., USDC), NOT the recipient. The recipient is encoded inside `tx.data`. An agent that confuses these will validate the wrong address.

### 3.3 Calldata Anatomy

```
0xa9059cbb                                     ← function selector (transfer)
000000000000000000000000[recipient address]    ← padded to 32 bytes
000000000000000000000000000000000000[amount]   ← padded to 32 bytes
```

The agent must decode this and verify:
- Selector matches the intended function (`transfer`, `approve`, `swap`, etc.)
- Recipient matches what the user said
- Amount matches what the user said (in token units)

### 3.4 chainId = 8453

Base mainnet is chain ID 8453. This is the only chain Blue Agent operates on.

```typescript
const BASE_CHAIN_ID = 8453;

function assertBaseChain(chainId: number): void {
  if (chainId !== BASE_CHAIN_ID) {
    throw new Error(
      `Chain ID mismatch: expected 8453 (Base), got ${chainId}. ` +
      `Blue Agent operates on Base only. Abort.`
    );
  }
}
```

---

## 4. Preflight Checks — 12+ Checks Before Any TX Is Sent

### 4.1 The TransactionRequest Schema (Zod)

```typescript
import { z } from "zod";

// Regex for EVM address
const EvmAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Must be a valid EVM address (0x + 40 hex chars)");

// Hex data
const HexData = z
  .string()
  .regex(/^0x[0-9a-fA-F]*$/, "Must be valid hex data");

const TransactionRequestSchema = z.object({
  to: EvmAddress,
  from: EvmAddress,
  value: z.bigint().min(0n),
  data: HexData.default("0x"),
  chainId: z.literal(8453, {
    errorMap: () => ({ message: "chainId must be 8453 (Base mainnet)" }),
  }),
  maxFeePerGas: z.bigint().positive(),
  maxPriorityFeePerGas: z.bigint().positive(),
  gas: z.bigint().positive(),
  nonce: z.number().int().min(0),
});

export type TransactionRequest = z.infer<typeof TransactionRequestSchema>;

// Extended schema for token transfers
const TokenTransferIntentSchema = z.object({
  tokenAddress: EvmAddress,
  tokenSymbol: z.string().min(1).max(10),
  tokenDecimals: z.number().int().min(0).max(18),
  recipient: EvmAddress,
  amountHuman: z.string().regex(/^\d+(\.\d+)?$/, "Must be a positive decimal number"),
  amountRaw: z.bigint().positive(),
  usdValueEstimate: z.number().positive().optional(),
});

export type TokenTransferIntent = z.infer<typeof TokenTransferIntentSchema>;
```

### 4.2 Full Preflight Validation Function

```typescript
import { createPublicClient, http, isAddress, decodeAbiParameters, parseAbi } from "viem";
import { base } from "viem/chains";

const BASE_RPC = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
const BASE_CHAIN_ID = 8453;

// USDC on Base — verified on Basescan
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

// Hard limit before human confirmation is required (USD cents)
const HUMAN_CONFIRM_THRESHOLD_USD = 20;

interface PreflightError {
  code: string;
  message: string;
  fatal: boolean; // if true, abort immediately; if false, warn and proceed with caution
}

interface PreflightResult {
  passed: boolean;
  errors: PreflightError[];
  warnings: PreflightError[];
  requiresHumanConfirmation: boolean;
}

export async function runPreflightChecks(
  tx: TransactionRequest,
  intent?: TokenTransferIntent
): Promise<PreflightResult> {
  const errors: PreflightError[] = [];
  const warnings: PreflightError[] = [];
  let requiresHumanConfirmation = false;

  const client = createPublicClient({
    chain: base,
    transport: http(BASE_RPC),
  });

  // ─────────────────────────────────────────────
  // CHECK 1: Chain ID must be Base (8453)
  // ─────────────────────────────────────────────
  if (tx.chainId !== BASE_CHAIN_ID) {
    errors.push({
      code: "CHAIN_ID_MISMATCH",
      message: `chainId is ${tx.chainId}, must be 8453 (Base). Aborting to prevent wrong-network transaction.`,
      fatal: true,
    });
  }

  // ─────────────────────────────────────────────
  // CHECK 2: `to` address is valid EVM address
  // ─────────────────────────────────────────────
  if (!isAddress(tx.to)) {
    errors.push({
      code: "INVALID_TO_ADDRESS",
      message: `'to' address ${tx.to} is not a valid EVM address.`,
      fatal: true,
    });
  }

  // ─────────────────────────────────────────────
  // CHECK 3: `from` address is valid EVM address
  // ─────────────────────────────────────────────
  if (!isAddress(tx.from)) {
    errors.push({
      code: "INVALID_FROM_ADDRESS",
      message: `'from' address ${tx.from} is not a valid EVM address.`,
      fatal: true,
    });
  }

  // ─────────────────────────────────────────────
  // CHECK 4: `to` is not zero address
  // ─────────────────────────────────────────────
  if (tx.to === "0x0000000000000000000000000000000000000000") {
    errors.push({
      code: "ZERO_ADDRESS_RECIPIENT",
      message: "Sending to zero address (0x000...000) burns funds permanently. Aborting.",
      fatal: true,
    });
  }

  // ─────────────────────────────────────────────
  // CHECK 5: `to` is not the `from` address
  // ─────────────────────────────────────────────
  if (tx.to.toLowerCase() === tx.from.toLowerCase()) {
    warnings.push({
      code: "SELF_SEND",
      message: "Transaction sends to the same address it originates from. Confirm this is intentional.",
      fatal: false,
    });
    requiresHumanConfirmation = true;
  }

  // ─────────────────────────────────────────────
  // CHECK 6: value field is non-negative
  // ─────────────────────────────────────────────
  if (tx.value < 0n) {
    errors.push({
      code: "NEGATIVE_VALUE",
      message: "Transaction value is negative, which is invalid.",
      fatal: true,
    });
  }

  // ─────────────────────────────────────────────
  // CHECK 7: Native ETH balance covers value + gas
  // ─────────────────────────────────────────────
  try {
    const ethBalance = await client.getBalance({ address: tx.from });
    const gasCost = tx.gas * tx.maxFeePerGas;
    const totalRequired = tx.value + gasCost;
    if (ethBalance < totalRequired) {
      errors.push({
        code: "INSUFFICIENT_ETH_BALANCE",
        message: `Insufficient ETH. Need ${totalRequired} wei (value + gas), have ${ethBalance} wei.`,
        fatal: true,
      });
    }
  } catch (e) {
    warnings.push({
      code: "BALANCE_CHECK_FAILED",
      message: `Could not fetch ETH balance for ${tx.from}: ${String(e)}`,
      fatal: false,
    });
  }

  // ─────────────────────────────────────────────
  // CHECK 8: Token balance check (for ERC-20 transfers)
  // ─────────────────────────────────────────────
  if (intent) {
    try {
      const tokenBalance = await client.readContract({
        address: intent.tokenAddress as `0x${string}`,
        abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
        functionName: "balanceOf",
        args: [tx.from],
      });
      if (tokenBalance < intent.amountRaw) {
        errors.push({
          code: "INSUFFICIENT_TOKEN_BALANCE",
          message: `Insufficient ${intent.tokenSymbol}. Need ${intent.amountRaw}, have ${tokenBalance}.`,
          fatal: true,
        });
      }
    } catch (e) {
      warnings.push({
        code: "TOKEN_BALANCE_CHECK_FAILED",
        message: `Could not fetch token balance: ${String(e)}`,
        fatal: false,
      });
    }
  }

  // ─────────────────────────────────────────────
  // CHECK 9: Nonce matches on-chain value
  // ─────────────────────────────────────────────
  try {
    const onchainNonce = await client.getTransactionCount({ address: tx.from });
    if (tx.nonce !== onchainNonce) {
      errors.push({
        code: "NONCE_MISMATCH",
        message: `Nonce mismatch: tx nonce=${tx.nonce}, on-chain nonce=${onchainNonce}. Transaction will be rejected or stuck.`,
        fatal: true,
      });
    }
  } catch (e) {
    warnings.push({
      code: "NONCE_CHECK_FAILED",
      message: `Could not verify nonce: ${String(e)}`,
      fatal: false,
    });
  }

  // ─────────────────────────────────────────────
  // CHECK 10: Gas limit sanity (not too low, not absurdly high)
  // ─────────────────────────────────────────────
  const MIN_GAS = 21_000n; // minimum for ETH send
  const MAX_GAS = 15_000_000n; // Base block gas limit
  if (tx.gas < MIN_GAS) {
    errors.push({
      code: "GAS_TOO_LOW",
      message: `Gas limit ${tx.gas} is below minimum 21,000. Transaction will fail.`,
      fatal: true,
    });
  }
  if (tx.gas > MAX_GAS) {
    errors.push({
      code: "GAS_EXCEEDS_BLOCK_LIMIT",
      message: `Gas limit ${tx.gas} exceeds Base block gas limit of 15,000,000.`,
      fatal: true,
    });
  }

  // ─────────────────────────────────────────────
  // CHECK 11: Value triggers human confirmation threshold
  // ─────────────────────────────────────────────
  if (intent?.usdValueEstimate !== undefined) {
    if (intent.usdValueEstimate >= HUMAN_CONFIRM_THRESHOLD_USD) {
      requiresHumanConfirmation = true;
      warnings.push({
        code: "ABOVE_CONFIRM_THRESHOLD",
        message: `Transaction value ($${intent.usdValueEstimate.toFixed(2)}) exceeds $${HUMAN_CONFIRM_THRESHOLD_USD} auto-approve limit. Human confirmation required.`,
        fatal: false,
      });
    }
  }

  // ─────────────────────────────────────────────
  // CHECK 12: Decoded calldata amount matches intent
  // ─────────────────────────────────────────────
  if (intent && tx.data !== "0x") {
    const calldataMismatch = checkCalldataAmountMismatch(tx.data, intent);
    if (calldataMismatch) {
      errors.push({
        code: "CALLDATA_AMOUNT_MISMATCH",
        message: calldataMismatch,
        fatal: true,
      });
    }
  }

  // ─────────────────────────────────────────────
  // CHECK 13: `to` is on contract allowlist (if calldata present)
  // ─────────────────────────────────────────────
  if (tx.data !== "0x") {
    const allowlistResult = checkContractAllowlist(tx.to);
    if (!allowlistResult.allowed) {
      errors.push({
        code: "CONTRACT_NOT_ALLOWLISTED",
        message: `Contract ${tx.to} is not on the approved contract list. ${allowlistResult.reason}`,
        fatal: true,
      });
    }
  }

  // ─────────────────────────────────────────────
  // CHECK 14: maxFeePerGas is within sane bounds
  // ─────────────────────────────────────────────
  const MAX_GAS_PRICE_GWEI = 1_000_000_000n * 50n; // 50 gwei — sanity cap
  if (tx.maxFeePerGas > MAX_GAS_PRICE_GWEI) {
    warnings.push({
      code: "GAS_PRICE_VERY_HIGH",
      message: `maxFeePerGas of ${tx.maxFeePerGas} wei (${tx.maxFeePerGas / 1_000_000_000n} gwei) is unusually high.`,
      fatal: false,
    });
    requiresHumanConfirmation = true;
  }

  const passed = errors.filter((e) => e.fatal).length === 0;
  return { passed, errors, warnings, requiresHumanConfirmation };
}

// Helper: compare decoded calldata amount to stated intent
function checkCalldataAmountMismatch(
  data: `0x${string}`,
  intent: TokenTransferIntent
): string | null {
  try {
    // ERC-20 transfer(address,uint256) selector = 0xa9059cbb
    const TRANSFER_SELECTOR = "0xa9059cbb";
    if (data.slice(0, 10).toLowerCase() !== TRANSFER_SELECTOR) {
      return null; // not a transfer call, skip this check
    }
    const decoded = decodeAbiParameters(
      [{ type: "address", name: "recipient" }, { type: "uint256", name: "amount" }],
      `0x${data.slice(10)}` as `0x${string}`
    );
    const decodedRecipient = decoded[0].toLowerCase();
    const decodedAmount = decoded[1];

    if (decodedRecipient !== intent.recipient.toLowerCase()) {
      return `Calldata recipient (${decodedRecipient}) does not match stated intent (${intent.recipient}).`;
    }
    if (decodedAmount !== intent.amountRaw) {
      return `Calldata amount (${decodedAmount}) does not match stated intent (${intent.amountRaw}).`;
    }
    return null;
  } catch {
    return "Could not decode calldata for amount verification. Manual review required.";
  }
}
```

---

## 5. Transaction Simulation — Dry Run, Calldata Decoding, Balance Checks

### 5.1 Why Simulation Is Non-Negotiable

Simulation runs the transaction against the current chain state without broadcasting it. It reveals:

- Whether the transaction would revert, and why
- The actual gas consumed
- Return values from the contract
- Side effects (token transfers, events emitted)

**If you skip simulation, you are flying blind.** A transaction that will definitely revert still costs gas when sent live. A transaction that drains the wrong amount will execute and cannot be recalled.

### 5.2 Simulation via eth_call

```typescript
interface SimulationResult {
  success: boolean;
  revertReason?: string;
  gasUsed: bigint;
  returnData: `0x${string}`;
  estimatedGas: bigint;
}

export async function simulateTransaction(
  tx: TransactionRequest
): Promise<SimulationResult> {
  const client = createPublicClient({
    chain: base,
    transport: http(BASE_RPC),
  });

  // 1. Estimate gas first
  let estimatedGas: bigint;
  try {
    estimatedGas = await client.estimateGas({
      account: tx.from,
      to: tx.to,
      data: tx.data as `0x${string}`,
      value: tx.value,
    });
  } catch (e) {
    // estimateGas throws if the tx would revert
    return {
      success: false,
      revertReason: extractRevertReason(e),
      gasUsed: 0n,
      returnData: "0x",
      estimatedGas: 0n,
    };
  }

  // 2. eth_call simulation
  try {
    const returnData = await client.call({
      account: tx.from,
      to: tx.to,
      data: tx.data as `0x${string}`,
      value: tx.value,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    });

    return {
      success: true,
      gasUsed: estimatedGas,
      returnData: returnData.data ?? "0x",
      estimatedGas,
    };
  } catch (e) {
    return {
      success: false,
      revertReason: extractRevertReason(e),
      gasUsed: 0n,
      returnData: "0x",
      estimatedGas,
    };
  }
}

function extractRevertReason(error: unknown): string {
  if (error instanceof Error) {
    // viem surfaces revert reasons in message or cause
    const msg = error.message;
    const reasonMatch = msg.match(/reverted with reason string '([^']+)'/);
    if (reasonMatch) return reasonMatch[1];
    const customMatch = msg.match(/reverted with the following reason:\s*(.+)/);
    if (customMatch) return customMatch[1].trim();
    return msg;
  }
  return String(error);
}
```

### 5.3 Tenderly Simulation (Advanced — More Detail)

When `TENDERLY_ACCESS_KEY` is set, use Tenderly's simulation API for richer output including full trace and event logs.

```typescript
interface TenderlySimulationRequest {
  network_id: string; // "8453" for Base
  from: string;
  to: string;
  input: string; // calldata
  value: string; // hex wei
  gas: number;
  gas_price: string;
  save: boolean;
}

export async function simulateWithTenderly(
  tx: TransactionRequest
): Promise<SimulationResult> {
  const TENDERLY_ACCOUNT = process.env.TENDERLY_ACCOUNT;
  const TENDERLY_PROJECT = process.env.TENDERLY_PROJECT;
  const TENDERLY_ACCESS_KEY = process.env.TENDERLY_ACCESS_KEY;

  if (!TENDERLY_ACCOUNT || !TENDERLY_PROJECT || !TENDERLY_ACCESS_KEY) {
    // Fallback to eth_call
    return simulateTransaction(tx);
  }

  const body: TenderlySimulationRequest = {
    network_id: "8453",
    from: tx.from,
    to: tx.to,
    input: tx.data,
    value: `0x${tx.value.toString(16)}`,
    gas: Number(tx.gas),
    gas_price: tx.maxFeePerGas.toString(),
    save: false,
  };

  const response = await fetch(
    `https://api.tenderly.co/api/v1/account/${TENDERLY_ACCOUNT}/project/${TENDERLY_PROJECT}/simulate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Key": TENDERLY_ACCESS_KEY,
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    // Tenderly unavailable — fall back to eth_call
    return simulateTransaction(tx);
  }

  const result = await response.json();
  const sim = result.transaction;

  return {
    success: sim.status,
    revertReason: sim.error_message ?? undefined,
    gasUsed: BigInt(sim.gas_used),
    returnData: sim.output ?? "0x",
    estimatedGas: BigInt(sim.gas_used),
  };
}
```

### 5.4 Interpreting ERC-20 Return Values

ERC-20 `transfer()` should return `true`. Some non-standard tokens (e.g., USDT mainnet) return nothing. On Base, well-audited tokens like USDC always return a boolean. Verify:

```typescript
function verifyTransferReturnValue(returnData: `0x${string}`): void {
  if (returnData === "0x" || returnData === "0x" + "0".repeat(64)) {
    // Either non-standard (no return) or explicit false
    // Check if it's an explicit false
    if (returnData === "0x" + "0".repeat(64)) {
      throw new Error("ERC-20 transfer() returned false — transfer rejected by contract.");
    }
    // No return value — warn but continue (non-standard token)
  }
  // If 32 bytes and last byte is 1 — success
}
```

---

## 6. Calldata and Recipient Validation — Allowlists, Denylists

### 6.1 Contract Allowlist

Agents must maintain an explicit allowlist of contracts they are permitted to call. Any contract not on this list must be rejected.

```typescript
// packages/core/src/tx-allowlist.ts

interface AllowedContract {
  address: `0x${string}`;
  name: string;
  description: string;
  allowedSelectors: string[]; // 4-byte function selectors, empty = any
}

// Base mainnet verified contracts
// All addresses verified on Basescan: https://basescan.org
export const CONTRACT_ALLOWLIST: AllowedContract[] = [
  {
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    name: "USDC (Base)",
    description: "Circle USD Coin on Base",
    allowedSelectors: [
      "0xa9059cbb", // transfer(address,uint256)
      "0x095ea7b3", // approve(address,uint256)
      "0x23b872dd", // transferFrom(address,address,uint256)
    ],
  },
  {
    address: "0x4200000000000000000000000000000000000006",
    name: "WETH (Base)",
    description: "Wrapped Ether on Base",
    allowedSelectors: [
      "0xa9059cbb", // transfer
      "0x095ea7b3", // approve
      "0xd0e30db0", // deposit()
      "0x2e1a7d4d", // withdraw(uint256)
    ],
  },
];

// Addresses that should NEVER receive transactions
export const RECIPIENT_DENYLIST: Set<string> = new Set([
  "0x0000000000000000000000000000000000000000", // zero address
  "0x000000000000000000000000000000000000dead", // burn address
]);

interface AllowlistCheckResult {
  allowed: boolean;
  contract?: AllowedContract;
  reason: string;
}

export function checkContractAllowlist(
  to: `0x${string}`,
  selector?: string
): AllowlistCheckResult {
  const toNormalized = to.toLowerCase();

  // Denylist check first
  if (RECIPIENT_DENYLIST.has(toNormalized)) {
    return {
      allowed: false,
      reason: `Address ${to} is on the permanent denylist (burn/zero address).`,
    };
  }

  const match = CONTRACT_ALLOWLIST.find(
    (c) => c.address.toLowerCase() === toNormalized
  );

  if (!match) {
    return {
      allowed: false,
      reason: `Contract ${to} is not on the approved contract allowlist. Add it explicitly to CONTRACT_ALLOWLIST after verification on Basescan.`,
    };
  }

  if (selector && match.allowedSelectors.length > 0) {
    if (!match.allowedSelectors.includes(selector.toLowerCase())) {
      return {
        allowed: false,
        contract: match,
        reason: `Function selector ${selector} is not in the approved list for ${match.name}. Allowed: ${match.allowedSelectors.join(", ")}.`,
      };
    }
  }

  return {
    allowed: true,
    contract: match,
    reason: `${match.name} is on the approved allowlist.`,
  };
}
```

### 6.2 Recipient Validation

For ERC-20 transfers, the recipient (decoded from calldata) must also be checked:

```typescript
export function validateRecipient(
  recipient: `0x${string}`,
  expectedRecipient?: `0x${string}`
): { valid: boolean; reason: string } {
  if (!isAddress(recipient)) {
    return { valid: false, reason: `Recipient ${recipient} is not a valid EVM address.` };
  }

  if (RECIPIENT_DENYLIST.has(recipient.toLowerCase())) {
    return { valid: false, reason: `Recipient ${recipient} is on the permanent denylist.` };
  }

  if (expectedRecipient && recipient.toLowerCase() !== expectedRecipient.toLowerCase()) {
    return {
      valid: false,
      reason: `Decoded recipient (${recipient}) does not match expected recipient (${expectedRecipient}). Possible calldata injection.`,
    };
  }

  return { valid: true, reason: "Recipient address is valid." };
}
```

### 6.3 Function Selector Decoding

```typescript
const KNOWN_SELECTORS: Record<string, string> = {
  "0xa9059cbb": "transfer(address,uint256)",
  "0x095ea7b3": "approve(address,uint256)",
  "0x23b872dd": "transferFrom(address,address,uint256)",
  "0xd0e30db0": "deposit()",
  "0x2e1a7d4d": "withdraw(uint256)",
  "0x38ed1739": "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
  "0x5c11d795": "swapExactTokensForTokensSupportingFeeOnTransferTokens(...)",
};

export function decodeSelector(data: `0x${string}`): {
  selector: string;
  functionName: string | null;
} {
  const selector = data.slice(0, 10).toLowerCase();
  return {
    selector,
    functionName: KNOWN_SELECTORS[selector] ?? null,
  };
}
```

---

## 7. Chain and Token Address Verification — Base-Specific, USDC Address

### 7.1 Base Chain Constants

```typescript
// packages/core/src/base-constants.ts

export const BASE = {
  CHAIN_ID: 8453,
  CHAIN_NAME: "Base",
  RPC_URL: "https://mainnet.base.org",
  BLOCK_EXPLORER: "https://basescan.org",
  NATIVE_CURRENCY: "ETH",

  // Token addresses — verified on Basescan
  TOKENS: {
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const,
    WETH: "0x4200000000000000000000000000000000000006" as const,
    // Add others only after Basescan verification
  },

  // Protocol addresses
  PROTOCOLS: {
    UNISWAP_V3_ROUTER: "0x2626664c2603336E57B271c5C0b26F421741e481" as const,
    // Verify on Basescan before adding any address
  },
} as const;

// Common incorrect USDC addresses that agents must NEVER use on Base
export const WRONG_USDC_ADDRESSES = [
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC on Ethereum mainnet
  "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC on Polygon
  "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", // USDC on Optimism
] as const;
```

### 7.2 Token Address Verification Function

```typescript
export function verifyTokenAddress(
  address: `0x${string}`,
  claimedSymbol: string
): { valid: boolean; reason: string } {
  const normalized = address.toLowerCase();

  // Check for known wrong addresses
  const isWrongUsdc = (WRONG_USDC_ADDRESSES as readonly string[]).includes(normalized);
  if (isWrongUsdc && claimedSymbol.toUpperCase() === "USDC") {
    return {
      valid: false,
      reason: `Address ${address} is USDC on a different network, NOT Base. Base USDC is ${BASE.TOKENS.USDC}.`,
    };
  }

  // Verify against known Base tokens
  const knownTokens = Object.entries(BASE.TOKENS) as [string, string][];
  for (const [symbol, knownAddress] of knownTokens) {
    if (normalized === knownAddress.toLowerCase()) {
      if (symbol !== claimedSymbol.toUpperCase()) {
        return {
          valid: false,
          reason: `Address ${address} is ${symbol} on Base, not ${claimedSymbol}.`,
        };
      }
      return { valid: true, reason: `Verified: ${symbol} on Base.` };
    }
  }

  // Address is not in known list
  return {
    valid: false,
    reason: `Token address ${address} is not in the verified Base token list. Verify on Basescan before using.`,
  };
}
```

### 7.3 Runtime Chain ID Verification

Always verify the live chain ID from the RPC before sending any transaction:

```typescript
export async function verifyLiveChainId(): Promise<void> {
  const client = createPublicClient({ chain: base, transport: http(BASE_RPC) });
  const liveChainId = await client.getChainId();
  if (liveChainId !== BASE.CHAIN_ID) {
    throw new Error(
      `RPC returned chain ID ${liveChainId}, expected ${BASE.CHAIN_ID} (Base). ` +
        `Check BASE_RPC_URL configuration. Current: ${BASE_RPC}`
    );
  }
}
```

---

## 8. Human Confirmation Flows — When to Pause and Show the User

### 8.1 Rules for When Confirmation Is Required

| Condition | Require Confirmation? |
|---|---|
| USD value >= $20 | Yes — always |
| Contract not in allowlist | Yes — or abort |
| Recipient never transacted with agent before | Yes |
| `approve` with amount > 0 | Yes — show exact amount and spender |
| `approve` with `uint256.max` | Always abort unless user explicitly typed "approve max" |
| Gas price > 2x recent average | Yes |
| Self-send (from == to) | Yes |
| First transaction from this wallet | Yes |
| Any transaction > $100 | Always abort, require manual execution |

### 8.2 Confirmation Prompt Structure

```typescript
interface ConfirmationPrompt {
  title: string;
  summary: string;
  transactionDetails: {
    action: string;
    from: string;
    to: string;
    toName?: string;
    amount?: string;
    token?: string;
    usdValue?: string;
    gas?: string;
    network: string;
  };
  risks: string[];
  requiredAcknowledgments: string[];
  abortOption: string;
}

export function buildConfirmationPrompt(
  tx: TransactionRequest,
  intent?: TokenTransferIntent,
  simulation?: SimulationResult
): ConfirmationPrompt {
  const usdValue = intent?.usdValueEstimate
    ? `$${intent.usdValueEstimate.toFixed(2)}`
    : "unknown";

  const risks: string[] = [];

  if (!intent?.usdValueEstimate || intent.usdValueEstimate >= 20) {
    risks.push(`This transaction is valued at ${usdValue}. It cannot be reversed.`);
  }

  if (simulation && !simulation.success) {
    risks.push(`Simulation failed: ${simulation.revertReason}. Transaction will revert.`);
  }

  const allowlistResult = checkContractAllowlist(tx.to);
  if (!allowlistResult.allowed) {
    risks.push(`Destination contract ${tx.to} is not on the approved list.`);
  }

  return {
    title: "Transaction Confirmation Required",
    summary: intent
      ? `Send ${intent.amountHuman} ${intent.tokenSymbol} to ${intent.recipient}`
      : `Send ${tx.value} wei ETH to ${tx.to}`,
    transactionDetails: {
      action: intent ? `Transfer ${intent.tokenSymbol}` : "Send ETH",
      from: tx.from,
      to: intent ? intent.recipient : tx.to,
      toName: allowlistResult.contract?.name,
      amount: intent ? intent.amountHuman : undefined,
      token: intent?.tokenSymbol,
      usdValue,
      gas: simulation ? `~${simulation.gasUsed} gas units` : undefined,
      network: "Base (chain ID 8453)",
    },
    risks,
    requiredAcknowledgments: [
      "I confirm the recipient address is correct.",
      "I understand this transaction is irreversible.",
      risks.length > 0 ? "I have reviewed and accept the listed risks." : "",
    ].filter(Boolean),
    abortOption: "Cancel — do not send this transaction.",
  };
}
```

### 8.3 Auto-Abort Conditions

These conditions cause immediate abort regardless of any user instruction:

```typescript
export function checkAutoAbort(
  tx: TransactionRequest,
  intent?: TokenTransferIntent
): { abort: boolean; reason: string } | null {
  // Never send to zero address
  if (tx.to === "0x0000000000000000000000000000000000000000") {
    return { abort: true, reason: "Sending to zero address is permanently disallowed." };
  }

  // Never send on wrong chain
  if (tx.chainId !== BASE.CHAIN_ID) {
    return {
      abort: true,
      reason: `Chain ID ${tx.chainId} is not Base (8453). Blue Agent only operates on Base.`,
    };
  }

  // Never send more than $100 automatically
  if (intent?.usdValueEstimate && intent.usdValueEstimate > 100) {
    return {
      abort: true,
      reason: `Value of $${intent.usdValueEstimate.toFixed(2)} exceeds the $100 automated transaction cap. User must execute this manually.`,
    };
  }

  // Never approve unlimited (uint256.max) without explicit user command
  if (tx.data.startsWith("0x095ea7b3")) {
    const approveAmount = BigInt("0x" + tx.data.slice(74));
    if (approveAmount === 2n ** 256n - 1n) {
      return {
        abort: true,
        reason: "Unlimited token approval (uint256.max) is blocked by default. User must explicitly request and confirm this action.",
      };
    }
  }

  return null;
}
```

---

## 9. Agent Hallucination Protection — Detecting Impossible or Nonsensical TX Requests

### 9.1 Types of Hallucination in Transaction Contexts

1. **Address hallucination** — Model generates a plausible-looking but nonexistent or wrong address
2. **Amount inflation** — "Send $1 to Alice" becomes "send 1000000 USDC" (off by 10^6)
3. **Token confusion** — Agent uses USDC address from Ethereum mainnet on Base
4. **Contract name hallucination** — Agent cites a contract name that doesn't exist at the given address
5. **Function hallucination** — Agent calls a function that doesn't exist on the target contract
6. **Chain hallucination** — Agent acts as if Base and Ethereum mainnet are interchangeable

### 9.2 Risky Transaction Rejection Logic

```typescript
interface RiskyTxCheck {
  isRisky: boolean;
  reason: string;
  riskLevel: "low" | "medium" | "high" | "critical";
}

export async function assessTransactionRisk(
  tx: TransactionRequest,
  intent?: TokenTransferIntent,
  rawPrompt?: string
): Promise<RiskyTxCheck[]> {
  const risks: RiskyTxCheck[] = [];

  // Risk 1: Amount in calldata doesn't match stated intent
  if (intent && tx.data !== "0x") {
    const mismatch = checkCalldataAmountMismatch(tx.data, intent);
    if (mismatch) {
      risks.push({
        isRisky: true,
        reason: `Amount mismatch detected: ${mismatch}`,
        riskLevel: "critical",
      });
    }
  }

  // Risk 2: Token address looks like a different chain's address
  if (intent) {
    const isWrongChainToken = (WRONG_USDC_ADDRESSES as readonly string[]).includes(
      intent.tokenAddress.toLowerCase()
    );
    if (isWrongChainToken) {
      risks.push({
        isRisky: true,
        reason: `Token address ${intent.tokenAddress} is from a different network, not Base.`,
        riskLevel: "critical",
      });
    }
  }

  // Risk 3: No bytecode at target contract address
  if (tx.data !== "0x") {
    try {
      const client = createPublicClient({ chain: base, transport: http(BASE_RPC) });
      const bytecode = await client.getBytecode({ address: tx.to });
      if (!bytecode || bytecode === "0x") {
        risks.push({
          isRisky: true,
          reason: `No contract code at ${tx.to} on Base. Sending calldata to an EOA will likely fail or lose ETH/tokens.`,
          riskLevel: "high",
        });
      }
    } catch {
      risks.push({
        isRisky: true,
        reason: `Could not verify bytecode at ${tx.to}. Proceeding without confirmation is unsafe.`,
        riskLevel: "medium",
      });
    }
  }

  // Risk 4: Prompt contains suspicious escalation language
  if (rawPrompt) {
    const suspiciousPatterns = [
      /ignore previous instructions/i,
      /send all/i,
      /drain/i,
      /approve everything/i,
      /transfer all funds/i,
      /send maximum/i,
    ];
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(rawPrompt)) {
        risks.push({
          isRisky: true,
          reason: `Prompt contains suspicious instruction pattern: "${pattern.source}". This may be a prompt injection attempt.`,
          riskLevel: "high",
        });
      }
    }
  }

  // Risk 5: Amount seems like a decimal unit confusion
  if (intent) {
    const humanAmount = parseFloat(intent.amountHuman);
    // If user said "1 USDC" but amountRaw is 1 (not 1_000_000)
    if (humanAmount >= 1 && intent.tokenDecimals === 6) {
      const expectedRaw = BigInt(Math.round(humanAmount * 1_000_000));
      if (intent.amountRaw !== expectedRaw) {
        risks.push({
          isRisky: true,
          reason: `Decimal unit mismatch: ${humanAmount} ${intent.tokenSymbol} should be ${expectedRaw} raw units, but amountRaw is ${intent.amountRaw}. Possible 10^${intent.tokenDecimals} error.`,
          riskLevel: "critical",
        });
      }
    }
  }

  return risks;
}
```

### 9.3 Disambiguation Before Construction

Before constructing any transaction from natural language, the agent must disambiguate:

```typescript
interface DisambiguationCheck {
  isAmbiguous: boolean;
  questions: string[];
}

export function checkAmbiguity(naturalLanguageInput: string): DisambiguationCheck {
  const questions: string[] = [];

  // Vague recipient
  if (/\b(someone|anyone|them|him|her|they)\b/i.test(naturalLanguageInput)) {
    questions.push("Who is the recipient? Please provide an exact wallet address or ENS name.");
  }

  // Missing token specification
  if (/send\s+\d/.test(naturalLanguageInput) && !/usdc|eth|weth|usdt/i.test(naturalLanguageInput)) {
    questions.push("Which token should be sent? (e.g., USDC, ETH, WETH)");
  }

  // Ambiguous amount
  if (/\b(some|a few|a bit|several|a lot)\b/i.test(naturalLanguageInput)) {
    questions.push("Please specify an exact amount.");
  }

  // Missing network (always Base, but agent should confirm intent)
  if (/mainnet|ethereum|polygon|optimism|arbitrum/i.test(naturalLanguageInput)) {
    questions.push(
      "Blue Agent operates on Base only (chain ID 8453). Did you mean to use Base?"
    );
  }

  return {
    isAmbiguous: questions.length > 0,
    questions,
  };
}
```

---

## 10. Sending on Behalf of Users Safely

### 10.1 Delegation and Authorization

When an agent sends transactions on behalf of a user, the following must be verified:

1. The user has explicitly granted the agent permission to sign transactions
2. The scope of that permission (which contracts, max amounts, time window) is documented
3. The agent has never been granted broader permissions than the user intended

```typescript
interface AgentAuthorization {
  grantedBy: `0x${string}`;   // user wallet
  agentAddress: `0x${string}`; // agent hot wallet
  allowedContracts: `0x${string}`[];
  maxAmountPerTx: bigint;      // in USDC smallest unit (6 decimals)
  maxAmountPerDay: bigint;
  expiresAt: number;           // unix timestamp
  grantedAt: number;
}

export function verifyAgentAuthorization(
  auth: AgentAuthorization,
  tx: TransactionRequest,
  intent?: TokenTransferIntent
): { authorized: boolean; reason: string } {
  const now = Math.floor(Date.now() / 1000);

  if (now > auth.expiresAt) {
    return { authorized: false, reason: "Agent authorization has expired. User must re-authorize." };
  }

  if (tx.from.toLowerCase() !== auth.grantedBy.toLowerCase()) {
    return {
      authorized: false,
      reason: `Transaction 'from' (${tx.from}) does not match authorization grantor (${auth.grantedBy}).`,
    };
  }

  if (!auth.allowedContracts.map((a) => a.toLowerCase()).includes(tx.to.toLowerCase())) {
    return {
      authorized: false,
      reason: `Contract ${tx.to} is not in the user's authorized contract list.`,
    };
  }

  if (intent && intent.amountRaw > auth.maxAmountPerTx) {
    return {
      authorized: false,
      reason: `Amount ${intent.amountRaw} exceeds per-transaction cap of ${auth.maxAmountPerTx}.`,
    };
  }

  return { authorized: true, reason: "Authorization verified." };
}
```

### 10.2 Spending Ledger

Track all agent-initiated spending in a persistent ledger to enforce daily caps:

```typescript
interface SpendingEntry {
  txHash: string;
  timestamp: number;
  amountRaw: bigint;
  token: `0x${string}`;
  recipient: `0x${string}`;
}

// In-memory daily ledger (production: use Redis or DB)
const dailySpendingLedger: SpendingEntry[] = [];

export function checkDailySpendingCap(
  auth: AgentAuthorization,
  proposedAmount: bigint
): { allowed: boolean; reason: string } {
  const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
  const todayTotal = dailySpendingLedger
    .filter((e) => e.timestamp > oneDayAgo)
    .reduce((sum, e) => sum + e.amountRaw, 0n);

  if (todayTotal + proposedAmount > auth.maxAmountPerDay) {
    return {
      allowed: false,
      reason: `Daily spend cap exceeded. Spent today: ${todayTotal}, proposed: ${proposedAmount}, cap: ${auth.maxAmountPerDay}.`,
    };
  }

  return { allowed: true, reason: `Daily spend of ${todayTotal + proposedAmount} within cap.` };
}
```

---

## 11. Failure Handling and Abort Rules

### 11.1 The Full Safe TX Execution Flow

```typescript
// packages/core/src/safe-tx-executor.ts

interface TxExecutionResult {
  success: boolean;
  txHash?: `0x${string}`;
  receipt?: { status: "success" | "reverted"; blockNumber: bigint };
  abortReason?: string;
  logEntry: TxLogEntry;
}

export async function safeSendTransaction(
  tx: TransactionRequest,
  intent?: TokenTransferIntent,
  walletClient: WalletClient,
  rawPrompt?: string
): Promise<TxExecutionResult> {
  const startedAt = Date.now();
  const logEntry: Partial<TxLogEntry> = {
    startedAt,
    tx,
    intent,
  };

  // ── STEP 1: Auto-abort check ───────────────────────────────────────
  const abortCheck = checkAutoAbort(tx, intent);
  if (abortCheck) {
    return {
      success: false,
      abortReason: abortCheck.reason,
      logEntry: finalizeLog(logEntry, "aborted", abortCheck.reason, startedAt),
    };
  }

  // ── STEP 2: Disambiguation ─────────────────────────────────────────
  if (rawPrompt) {
    const ambiguity = checkAmbiguity(rawPrompt);
    if (ambiguity.isAmbiguous) {
      return {
        success: false,
        abortReason: `Cannot construct transaction — ambiguous input. Questions: ${ambiguity.questions.join(" | ")}`,
        logEntry: finalizeLog(logEntry, "aborted", "ambiguous_input", startedAt),
      };
    }
  }

  // ── STEP 3: Schema validation ──────────────────────────────────────
  const parsed = TransactionRequestSchema.safeParse(tx);
  if (!parsed.success) {
    const reason = parsed.error.issues.map((i) => i.message).join("; ");
    return {
      success: false,
      abortReason: `Schema validation failed: ${reason}`,
      logEntry: finalizeLog(logEntry, "aborted", reason, startedAt),
    };
  }

  // ── STEP 4: Preflight checks ───────────────────────────────────────
  const preflight = await runPreflightChecks(tx, intent);
  if (!preflight.passed) {
    const fatalErrors = preflight.errors.filter((e) => e.fatal);
    const reason = fatalErrors.map((e) => `[${e.code}] ${e.message}`).join(" | ");
    return {
      success: false,
      abortReason: `Preflight failed: ${reason}`,
      logEntry: finalizeLog(logEntry, "preflight_failed", reason, startedAt),
    };
  }

  // ── STEP 5: Risk assessment ────────────────────────────────────────
  const risks = await assessTransactionRisk(tx, intent, rawPrompt);
  const criticalRisks = risks.filter((r) => r.riskLevel === "critical");
  if (criticalRisks.length > 0) {
    const reason = criticalRisks.map((r) => r.reason).join(" | ");
    return {
      success: false,
      abortReason: `Critical risk detected: ${reason}`,
      logEntry: finalizeLog(logEntry, "risk_aborted", reason, startedAt),
    };
  }

  // ── STEP 6: Simulation ─────────────────────────────────────────────
  const simulation = await simulateWithTenderly(tx);
  logEntry.simulation = simulation;

  if (!simulation.success) {
    return {
      success: false,
      abortReason: `Simulation failed — transaction would revert: ${simulation.revertReason}`,
      logEntry: finalizeLog(logEntry, "simulation_failed", simulation.revertReason, startedAt),
    };
  }

  // ── STEP 7: Human confirmation (if required) ───────────────────────
  if (preflight.requiresHumanConfirmation) {
    const prompt = buildConfirmationPrompt(tx, intent, simulation);
    // In Blue Agent UI this renders a confirmation dialog.
    // In CLI mode, it prints the prompt and waits for "yes".
    // This function must block until user input is received.
    const confirmed = await requestHumanConfirmation(prompt);
    if (!confirmed) {
      return {
        success: false,
        abortReason: "User cancelled transaction at confirmation step.",
        logEntry: finalizeLog(logEntry, "user_cancelled", "user_cancelled", startedAt),
      };
    }
  }

  // ── STEP 8: Send ───────────────────────────────────────────────────
  let txHash: `0x${string}`;
  try {
    txHash = await walletClient.sendTransaction({
      to: tx.to,
      value: tx.value,
      data: tx.data as `0x${string}`,
      gas: simulation.gasUsed * 120n / 100n, // 20% buffer over simulated gas
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      nonce: tx.nonce,
    });
  } catch (e) {
    const reason = String(e);
    return {
      success: false,
      abortReason: `Transaction submission failed: ${reason}`,
      logEntry: finalizeLog(logEntry, "send_failed", reason, startedAt),
    };
  }

  // ── STEP 9: Wait for receipt ───────────────────────────────────────
  const client = createPublicClient({ chain: base, transport: http(BASE_RPC) });
  const receipt = await client.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });

  if (receipt.status === "reverted") {
    return {
      success: false,
      txHash,
      receipt,
      abortReason: `Transaction mined but reverted. Hash: ${txHash}`,
      logEntry: finalizeLog(logEntry, "reverted", "on_chain_revert", startedAt, txHash),
    };
  }

  return {
    success: true,
    txHash,
    receipt,
    logEntry: finalizeLog(logEntry, "success", undefined, startedAt, txHash),
  };
}

// Placeholder for UI/CLI confirmation integration
async function requestHumanConfirmation(prompt: ConfirmationPrompt): Promise<boolean> {
  // Implementation depends on surface (Telegram, web, CLI)
  // Must surface all fields of ConfirmationPrompt to the user
  // Must explicitly receive "yes" or equivalent before returning true
  console.log("CONFIRMATION REQUIRED:", JSON.stringify(prompt, null, 2));
  // In production: integrate with Telegram confirm button or web modal
  return false; // default to not confirmed — never default to true
}
```

### 11.2 Abort Rule Summary

| Trigger | Action |
|---|---|
| chainId != 8453 | Immediate abort |
| `to` is zero address | Immediate abort |
| Amount > $100 | Immediate abort |
| Simulation revert | Abort and surface revert reason |
| Schema validation failure | Abort |
| Calldata/intent mismatch | Abort |
| No bytecode at target (when calldata present) | Abort |
| User cancels at confirm step | Abort |
| Suspicious prompt injection pattern | Abort and log |
| `approve(max)` without explicit user request | Abort |

---

## 12. Logging and Traceability

### 12.1 Log Entry Structure

Every transaction attempt — successful or not — must produce an immutable log entry before the transaction is submitted and after it settles.

```typescript
// packages/core/src/tx-logger.ts

type TxStatus =
  | "aborted"
  | "preflight_failed"
  | "risk_aborted"
  | "simulation_failed"
  | "user_cancelled"
  | "send_failed"
  | "reverted"
  | "success";

interface TxLogEntry {
  // Unique log ID — generated before tx is sent
  logId: string;

  // Timing
  startedAt: number;   // unix ms
  completedAt: number; // unix ms
  durationMs: number;

  // Status
  status: TxStatus;
  abortReason?: string;

  // Transaction fields
  tx: {
    chainId: number;
    from: string;
    to: string;
    value: string; // bigint as string
    data: string;
    nonce: number;
    gas: string;
  };

  // Semantic intent (if available)
  intent?: {
    tokenAddress: string;
    tokenSymbol: string;
    recipient: string;
    amountHuman: string;
    amountRaw: string;
    usdValueEstimate?: number;
  };

  // Simulation result
  simulation?: {
    success: boolean;
    gasUsed: string;
    revertReason?: string;
  };

  // On-chain result
  txHash?: string;
  blockNumber?: string;
  receiptStatus?: "success" | "reverted";

  // Agent metadata
  agentVersion: string;
  rawPrompt?: string; // sanitized, no secrets
}

export function finalizeLog(
  partial: Partial<TxLogEntry>,
  status: TxStatus,
  abortReason: string | undefined,
  startedAt: number,
  txHash?: `0x${string}`
): TxLogEntry {
  const completedAt = Date.now();
  return {
    logId: crypto.randomUUID(),
    startedAt,
    completedAt,
    durationMs: completedAt - startedAt,
    status,
    abortReason,
    tx: {
      chainId: partial.tx?.chainId ?? 0,
      from: partial.tx?.from ?? "",
      to: partial.tx?.to ?? "",
      value: partial.tx?.value?.toString() ?? "0",
      data: partial.tx?.data ?? "0x",
      nonce: partial.tx?.nonce ?? -1,
      gas: partial.tx?.gas?.toString() ?? "0",
    },
    intent: partial.intent
      ? {
          tokenAddress: partial.intent.tokenAddress,
          tokenSymbol: partial.intent.tokenSymbol,
          recipient: partial.intent.recipient,
          amountHuman: partial.intent.amountHuman,
          amountRaw: partial.intent.amountRaw.toString(),
          usdValueEstimate: partial.intent.usdValueEstimate,
        }
      : undefined,
    simulation: partial.simulation
      ? {
          success: partial.simulation.success,
          gasUsed: partial.simulation.gasUsed.toString(),
          revertReason: partial.simulation.revertReason,
        }
      : undefined,
    txHash,
    agentVersion: process.env.npm_package_version ?? "unknown",
  };
}

export async function persistLog(entry: TxLogEntry): Promise<void> {
  // Write to append-only store BEFORE sending the transaction
  // Options: local file, Postgres, IPFS, Supabase
  // Never mutate an existing log entry — always append new ones
  const line = JSON.stringify(entry) + "\n";
  await appendFile("./logs/tx-audit.jsonl", line, "utf8");
}
```

### 12.2 Log Retention and Alerting

```typescript
// Alert thresholds
const ALERT_RULES = {
  failureRateThreshold: 0.05,    // alert if >5% of txs fail in last hour
  dailySpendAlertPct: 0.8,       // alert at 80% of daily cap
  consecutiveFailures: 3,        // alert after 3 failures in a row
  unusualAmountMultiple: 10,     // alert if amount is 10x recent average
};

// Basescan transaction link
export function buildBasescanLink(txHash: string): string {
  return `https://basescan.org/tx/${txHash}`;
}

// Structured log line example (JSONL format)
// {"logId":"uuid","startedAt":1700000000000,"status":"success","tx":{"chainId":8453,"from":"0x...","to":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","value":"0","data":"0xa9059cbb...","nonce":42,"gas":"65000"},"intent":{"tokenAddress":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","tokenSymbol":"USDC","recipient":"0xabc...","amountHuman":"5.00","amountRaw":"5000000","usdValueEstimate":5},"simulation":{"success":true,"gasUsed":"51234"},"txHash":"0xdef...","blockNumber":"12345678"}
```

---

## 13. Tradeoffs and Best Practices

### 13.1 Tradeoff Table

| Decision | Option A | Option B | Recommendation |
|---|---|---|---|
| Allowlist vs. open contract calls | Allowlist only | Any verified contract | Allowlist only for agent-initiated tx |
| Simulation provider | eth_call (free) | Tenderly (richer output) | Tenderly if available, eth_call fallback |
| Confirmation threshold | $5 | $20 | $20 for UX, $5 for high-risk contexts |
| Per-tx cap | $10 | $100 | $20 default, configurable per deployment |
| Log storage | Local file | Remote DB | Remote DB for production, local for dev |
| Gas estimation | hardcoded | per-tx estimate | Always per-tx estimate + 20% buffer |
| Nonce management | auto | manual | Auto with lock to prevent race conditions |

### 13.2 Nonce Management

Concurrent agent operations can use the same nonce, causing one to be dropped. Implement a nonce lock:

```typescript
import { Mutex } from "async-mutex";

const nonceLock = new Mutex();

export async function getAndLockNonce(
  address: `0x${string}`,
  client: PublicClient
): Promise<{ nonce: number; release: () => void }> {
  const release = await nonceLock.acquire();
  const nonce = await client.getTransactionCount({ address });
  return { nonce, release };
}

// Usage:
// const { nonce, release } = await getAndLockNonce(from, client);
// try { await sendTransaction({ ...tx, nonce }); } finally { release(); }
```

### 13.3 Gas Price Strategy

On Base, gas prices are very low (typically < 0.01 gwei). Use the following strategy:

```typescript
export async function suggestGasPrice(client: PublicClient): Promise<{
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}> {
  const block = await client.getBlock({ blockTag: "latest" });
  const baseFee = block.baseFeePerGas ?? 1_000_000n; // fallback 0.001 gwei
  const priorityFee = 1_000_000n; // 0.001 gwei priority tip on Base
  return {
    maxFeePerGas: baseFee * 2n + priorityFee, // 2x base + tip
    maxPriorityFeePerGas: priorityFee,
  };
}
```

### 13.4 Retry Policy

Only retry on transient network errors. Never retry on:
- Revert (fix the transaction)
- Nonce mismatch (refresh nonce)
- Insufficient balance (top up wallet)

```typescript
const RETRYABLE_ERROR_CODES = new Set([
  "NETWORK_ERROR",
  "TIMEOUT",
  "SERVER_ERROR",
]);

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 2000
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const isRetryable =
        e instanceof Error &&
        RETRYABLE_ERROR_CODES.has((e as any).code);

      if (!isRetryable || attempt === maxAttempts) throw e;
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
  throw new Error("Unreachable");
}
```

---

## 14. Common Mistakes / Red Flags

### 14.1 Sending Without Simulation

```typescript
// ❌ WRONG — sending without any preflight or simulation
const hash = await walletClient.sendTransaction({ to, data, value });

// ✅ RIGHT — always run safeSendTransaction()
const result = await safeSendTransaction(tx, intent, walletClient);
if (!result.success) throw new Error(result.abortReason);
```

**Why it matters:** A transaction that will definitely revert still costs gas. A swap with wrong calldata can drain funds. Simulation costs nothing.

---

### 14.2 Trusting Unverified Calldata from LLM Output

```typescript
// ❌ WRONG — using LLM-generated calldata directly
const calldata = await bankrLLM("generate calldata to send 10 USDC to Alice");
await walletClient.sendTransaction({ to: USDC, data: calldata }); // never do this

// ✅ RIGHT — encode calldata deterministically from validated intent
import { encodeFunctionData } from "viem";
const calldata = encodeFunctionData({
  abi: parseAbi(["function transfer(address,uint256)"]),
  functionName: "transfer",
  args: [validatedRecipientAddress, validatedAmountRaw],
});
```

**Why it matters:** LLMs can generate hex strings that look like calldata but encode different recipients or amounts. Always encode calldata from validated parameters, never accept calldata as a string from an LLM.

---

### 14.3 Ignoring Chain ID Mismatch

```typescript
// ❌ WRONG — no chain check
async function sendTokens(to: string, amount: bigint) {
  await walletClient.sendTransaction({ to: USDC, data: encodeTransfer(to, amount) });
}

// ✅ RIGHT — verify chain before anything
async function sendTokens(to: string, amount: bigint) {
  await verifyLiveChainId(); // throws if not Base
  const tx = buildTx(to, amount);
  assertBaseChain(tx.chainId); // double check the constructed tx
  return safeSendTransaction(tx, ...);
}
```

**Why it matters:** If the RPC URL is accidentally pointed at Ethereum mainnet, the same transaction code will interact with wrong contracts. USDC on mainnet (`0xA0b...`) is a completely different contract than USDC on Base (`0x833...`). A transfer on the wrong chain loses funds with no recourse.

---

### 14.4 Failing to Compare Expected vs Actual Decoded Amount

```typescript
// ❌ WRONG — building calldata and sending without verifying it encodes the right amount
const calldata = buildTransferCalldata(recipient, amountRaw);
// ... proceed to send

// ✅ RIGHT — decode and compare before sending
const calldata = buildTransferCalldata(recipient, amountRaw);
const mismatch = checkCalldataAmountMismatch(calldata, intent);
if (mismatch) throw new Error(mismatch); // catches decimal errors, off-by-one, etc.
```

**Why it matters:** A 6-decimal USDC token means 1 USDC = 1,000,000 raw units. If the agent misreads the user's "1 USDC" as 1 raw unit, it sends 0.000001 USDC. If it misreads it as 1 ETH in wei, it sends $1.6M worth. Decoding and cross-checking is the only reliable guard.

---

### 14.5 Acting on Vague Natural Language Without Disambiguation

```typescript
// ❌ WRONG — guessing intent from ambiguous input
const intent = parseTxIntent("send some tokens to my friend");
// agent guesses: $10 USDC to last known contact → potentially wrong

// ✅ RIGHT — detect ambiguity and ask
const ambiguity = checkAmbiguity("send some tokens to my friend");
if (ambiguity.isAmbiguous) {
  return { requiresClarification: true, questions: ambiguity.questions };
}
```

**Ambiguity red flags to always catch:**
- No specific recipient address ("my friend", "them", "Alice")
- No specific token ("some tokens", "money", "crypto")
- No specific amount ("some", "a few", "enough")
- Relative amounts ("double what I sent last time", "half my balance")
- References to contacts or names without an associated address

---

### 14.6 Using USDC Address from the Wrong Chain

| Network | USDC Address | Status |
|---|---|---|
| **Base (use this)** | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Correct for Blue Agent |
| Ethereum mainnet | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | Wrong chain |
| Polygon | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` | Wrong chain |
| Optimism | `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85` | Wrong chain |
| Arbitrum | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | Wrong chain |

Always import `BASE.TOKENS.USDC` from `packages/core/src/base-constants.ts`. Never hardcode USDC addresses inline in agent code.

---

### 14.7 Hardcoding Gas Limits

```typescript
// ❌ WRONG — hardcoded gas limit
const hash = await walletClient.sendTransaction({ to, data, gas: 100_000n });

// ✅ RIGHT — estimate gas per transaction
const estimatedGas = await client.estimateGas({ to, data, from, value });
const gas = estimatedGas * 120n / 100n; // 20% buffer
```

---

### 14.8 Not Verifying Receipt Status

```typescript
// ❌ WRONG — assuming success after broadcast
const hash = await walletClient.sendTransaction(...);
console.log("Transaction sent:", hash); // transaction may have reverted!

// ✅ RIGHT — wait and check status
const hash = await walletClient.sendTransaction(...);
const receipt = await client.waitForTransactionReceipt({ hash });
if (receipt.status === "reverted") {
  throw new Error(`Transaction ${hash} reverted on-chain.`);
}
```

---

## 15. Blue Agent CLI Integration Patterns

### 15.1 audit — Transaction Safety Check

```bash
# Run the tx-safety audit module against a project
blue audit --check tx-safety

# What this checks:
# - Are preflight checks implemented before every sendTransaction call?
# - Is simulation (eth_call or Tenderly) called before submission?
# - Is chainId validated at construction and at runtime?
# - Is the USDC address correct for Base?
# - Are user confirmation prompts shown above the $20 threshold?
# - Are all logs append-only and written before tx submission?
# - Is there a spending cap enforced?
# - Is calldata encoded programmatically (not from LLM string output)?
```

The `blue audit --check tx-safety` command should:
1. Parse all TypeScript files in the project for `sendTransaction` and `writeContract` calls
2. Check if each call is preceded by a simulation call within the same function scope
3. Check if `chainId` is validated before the call
4. Check if `gas` is estimated (not hardcoded)
5. Output a report with line numbers and severity levels for each finding

Expected output format:
```
[CRITICAL] src/agent/tx.ts:42 — sendTransaction called without prior simulation
[HIGH]     src/agent/tx.ts:55 — Gas limit hardcoded as 100000
[MEDIUM]   src/agent/tx.ts:71 — No chain ID check before tx construction
[INFO]     src/agent/tx.ts:88 — No spending cap enforcement found
```

### 15.2 validate — Raw Transaction Object Check

```bash
# Validate a raw transaction JSON before sending
blue validate --tx

# Interactive usage — paste or pipe a JSON transaction object
blue validate --tx '{"to":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","value":"0","data":"0xa9059cbb000000000000000000000000abc...","chainId":8453}'

# Pipe from file
cat tx.json | blue validate --tx

# Expected output:
# Validating transaction on Base (chain ID 8453)...
# ✓ Chain ID: 8453 (Base) — correct
# ✓ Destination: USDC (Base) — on allowlist
# ✓ Function: transfer(address,uint256) — selector 0xa9059cbb
# ✓ Decoded recipient: 0xabc... 
# ✓ Decoded amount: 10000000 (10 USDC)
# ✓ Schema validation passed
# Running preflight...
# ✓ 14/14 preflight checks passed
# Running simulation (eth_call on Base)...
# ✓ Simulation succeeded — gas: 51,234 units
# Result: SAFE TO SEND (pending human confirmation for amounts >= $20)
```

Implementation:
```typescript
// packages/cli/src/commands/validate.ts
import { TransactionRequestSchema } from "@blueagent/core";
import { runPreflightChecks, simulateTransaction } from "@blueagent/core";

export async function validateTxCommand(txJson: string): Promise<void> {
  let raw: unknown;
  try {
    raw = JSON.parse(txJson);
  } catch {
    console.error("Invalid JSON. Provide a valid transaction object.");
    process.exit(1);
  }

  // Convert string bigints
  if (typeof (raw as any).value === "string") {
    (raw as any).value = BigInt((raw as any).value);
  }

  const parsed = TransactionRequestSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("Schema validation failed:");
    parsed.error.issues.forEach((i) => console.error(` - [${i.path.join(".")}] ${i.message}`));
    process.exit(1);
  }

  console.log("Schema: PASS");

  const preflight = await runPreflightChecks(parsed.data);
  if (!preflight.passed) {
    console.error("Preflight checks failed:");
    preflight.errors.forEach((e) => console.error(` - [${e.code}] ${e.message}`));
    process.exit(1);
  }
  console.log(`Preflight: PASS (${preflight.warnings.length} warnings)`);

  const sim = await simulateTransaction(parsed.data);
  if (!sim.success) {
    console.error(`Simulation FAILED: ${sim.revertReason}`);
    process.exit(1);
  }
  console.log(`Simulation: PASS — gas: ${sim.gasUsed}`);

  if (preflight.requiresHumanConfirmation) {
    console.log("STATUS: SAFE — human confirmation required before sending.");
  } else {
    console.log("STATUS: SAFE — no confirmation required for this amount.");
  }
}
```

### 15.3 chat — Interactive Transaction Review

```bash
# Ask Blue Agent to review a transaction in natural language
blue chat "review this transaction: send 50 USDC to 0xabc..."

# Blue Agent will:
# 1. Parse the natural language intent
# 2. Run checkAmbiguity() — flag any unclear fields
# 3. Construct a TransactionRequest from validated parameters
# 4. Run all preflight checks and surface results
# 5. Simulate on Base
# 6. Present the confirmation prompt
# 7. Wait for explicit user approval
```

Example chat integration (packages/core/src/chat-tx-handler.ts):
```typescript
import { callBankrLLM } from "@blueagent/bankr";

export async function handleTxChatCommand(userMessage: string): Promise<string> {
  // Step 1: extract intent via LLM (structured output)
  const extractionResponse = await callBankrLLM({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    system: `Extract transaction intent from the user message. Return JSON only.
    Schema: { "action": "transfer"|"approve"|"unknown", "tokenSymbol": string, "recipient": string|null, "amount": string|null, "isAmbiguous": boolean, "clarifyingQuestions": string[] }`,
    messages: [{ role: "user", content: userMessage }],
  });

  let intent: any;
  try {
    intent = JSON.parse(extractionResponse.content[0].text);
  } catch {
    return "Could not parse transaction intent. Please be more specific.";
  }

  if (intent.isAmbiguous || intent.clarifyingQuestions?.length > 0) {
    return (
      "Before I can review this transaction, I need a few details:\n" +
      intent.clarifyingQuestions.map((q: string, i: number) => `${i + 1}. ${q}`).join("\n")
    );
  }

  if (intent.action === "unknown") {
    return "I couldn't identify this as a transaction request. Try: \"send 10 USDC to 0x...\"";
  }

  // Validate recipient
  if (!intent.recipient || !isAddress(intent.recipient)) {
    return `Recipient "${intent.recipient}" is not a valid Base address. Please provide a full 0x address.`;
  }

  // Build and validate — surface results as chat message
  return `Transaction Review:\n` +
    `Action: Transfer ${intent.amount} ${intent.tokenSymbol}\n` +
    `Recipient: ${intent.recipient}\n` +
    `Network: Base (chain ID 8453)\n\n` +
    `Running checks...\n` +
    `(Full preflight + simulation would run here and results appended)`;
}
```

### 15.4 build — Scaffolding Transaction-Safe Agent Code

```bash
# Scaffold an agent with transaction safety baked in
blue build --feature tx-agent

# Generates:
# src/
#   agent/
#     tx-executor.ts       ← imports safeSendTransaction from @blueagent/core
#     tx-allowlist.ts      ← pre-populated with Base verified contracts
#     tx-logger.ts         ← append-only JSONL log writer
#     preflight.ts         ← full 14-check preflight
#     simulation.ts        ← eth_call + Tenderly fallback
#   config/
#     agent-limits.ts      ← maxPerTx, maxPerDay, confirmThreshold
```

Template for `blue build` generated `agent-limits.ts`:
```typescript
// config/agent-limits.ts — generated by blue build
// Modify these values carefully. Each change should be reviewed in blue audit.
export const AGENT_LIMITS = {
  // Maximum USD value per single transaction before human confirmation
  confirmThresholdUsd: 20,

  // Maximum USD value per single transaction (hard cap — no override)
  maxPerTxUsd: 100,

  // Maximum USD value per 24-hour rolling window
  maxPerDayUsd: 500,

  // Minimum delay between consecutive transactions (milliseconds)
  cooldownMs: 5_000,

  // Maximum gas price before requiring human confirmation (gwei)
  maxGasPriceGwei: 10,

  // Chain ID — never change this
  chainId: 8453,
} as const;
```

---

## 16. Resources / References

### 16.1 Base Infrastructure

| Resource | URL |
|---|---|
| Base mainnet RPC | `https://mainnet.base.org` |
| Base Basescan explorer | `https://basescan.org` |
| Base chain docs | `https://docs.base.org` |
| Base chain ID | 8453 |

### 16.2 Token Addresses (Base Mainnet — Verified on Basescan)

| Token | Address | Basescan |
|---|---|---|
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | `https://basescan.org/token/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| WETH | `0x4200000000000000000000000000000000000006` | `https://basescan.org/token/0x4200000000000000000000000000000000000006` |

### 16.3 Libraries Used in This Guide

| Library | Version | Purpose |
|---|---|---|
| `viem` | ^2.x | Ethereum client, ABI encoding, transaction types |
| `zod` | ^3.x | Schema validation for TransactionRequest |
| `async-mutex` | ^0.4.x | Nonce locking for concurrent agent operations |

### 16.4 EIPs Referenced

| EIP | Title | Relevance |
|---|---|---|
| EIP-1559 | Fee market change | Base uses EIP-1559 gas model |
| EIP-2612 | ERC-20 permit | Gasless approval pattern |
| EIP-712 | Typed structured data signing | Domain separator for replay protection |
| ERC-20 | Token standard | All token transfers in this guide |
| ERC-4337 | Account abstraction | Smart wallet agent authorization |

### 16.5 Blue Agent Internal References

- `packages/core/src/schemas.ts` — `BLUE_AGENT_PRICING`, shared types
- `packages/bankr/` — `callBankrLLM()` for LLM calls (never call OpenAI directly)
- `skills/agent-wallet-security.md` — wallet key management, approvals, rate limits
- `skills/base-addresses.md` — verified Base contract addresses
- `skills/base-security.md` — Base-specific security considerations
- `commands/audit.md` — `blue audit` command contract

### 16.6 Simulation Services

| Service | Type | Use |
|---|---|---|
| Base RPC `eth_call` | Free, always available | Default simulation |
| Tenderly | Paid, richer trace/events | Production agents |
| Alchemy Simulate | Paid | Alternative to Tenderly |

### 16.7 Security References

- [SWC Registry](https://swcregistry.io) — Solidity weakness classifications
- [Ethereum Smart Contract Best Practices](https://consensys.github.io/smart-contract-best-practices/)
- [Trail of Bits — Building Secure Smart Contracts](https://github.com/crytic/building-secure-contracts)
- [OpenZeppelin Contracts](https://github.com/OpenZeppelin/openzeppelin-contracts) — audited primitives used throughout

---

*This grounding file is maintained by Blocky Studio for Blue Agent. All contract addresses must be verified on Basescan before use. Never guess, never invent, never trust LLM-generated addresses without verification.*
