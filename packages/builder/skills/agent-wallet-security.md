# Agent Wallet Security

Grounding for `blue audit` — practical security checklist for AI agents handling wallets and executing onchain transactions.

---

## 1. Wallet Types

### EOA (Externally Owned Account)

Standard Ethereum wallet. Single ECDSA private key controls all funds.

- **Risk:** Single point of failure — key leaked = total loss
- **No recovery:** Lost key = lost funds forever
- **Gas:** Cheapest — no overhead beyond base transaction
- **Use for:** Agent hot wallets holding small amounts for gas and micropayments only
- **Never for:** Treasury, protocol admin, anything holding > $1K

---

### Smart Contract Wallet (Account Abstraction, ERC-4337)

Wallet logic is a contract. Authentication and recovery are programmable.

- Multiple signers, spending limits, daily caps, allowlists
- Recovery keys (social recovery or hardware backup)
- Paymaster integration (gasless transactions for users)
- Batch transactions in one call
- Higher gas overhead but far better security model
- Examples: Coinbase Smart Wallet, Safe (Gnosis), Kernel, Biconomy

**Use for:** User-facing products, anything holding significant value, agent vaults

**ERC-4337 architecture:**
```
UserOperation → Bundler → EntryPoint → Wallet Contract
                                    → Paymaster (gas sponsorship)
```

---

### Multi-Sig (Safe / Gnosis Safe)

N-of-M signature scheme. M signers, N required to approve.

- **2-of-3:** Practical for teams (1 key compromised, still safe)
- **3-of-5:** Higher security for protocol treasuries
- Gnosis Safe is the gold standard — audited, battle-tested
- Slow (requires N humans to sign) — not suitable for agent hot paths
- Safe on Base: `TODO — verify on Basescan`

**Use for:** Treasury, protocol ownership, governance, any funds > $10K

---

### Custodial

Third party holds keys. Coinbase, exchanges, Coinbase Prime.

- Counterparty risk: service can freeze, hack, or fail
- Best UX for non-crypto users
- Regulatory risk (regulated entities can block withdrawals)
- **Never use custodial wallets for protocol admin or treasury**

---

## 2. Private Key Management

### ❌ Never Do This

```bash
# Hardcoded key
PRIVATE_KEY=0xdeadbeef...

# In .env committed to git
git add .env

# Logged to console
console.log("Using key:", privateKey);

# In error messages
throw new Error(`Failed with key ${this.privateKey}`);

# Passed as CLI arg (visible in process list)
node agent.js --key 0xdeadbeef
```

### ✅ Do This Instead

| Method | Use case | Notes |
|---|---|---|
| `.env` file (gitignored) | Local dev only | Never commit |
| Hardware wallet (Ledger/Trezor) | Production signing | Best security |
| KMS (AWS, GCP, HashiCorp Vault) | Cloud production | Audited, key never exported |
| Encrypted keystore (ethers/hardhat) | Scripted signing | Keystore JSON, decrypted in memory |
| Separate signing service | Agent production | Wallet service isolated from app |

### Gitignore Check

Every repo must have:
```
.env
.env.local
.env.*
*.key
*.pem
keystore/
secrets/
```

Verify with: `git log --all -p | grep -i "private_key\|mnemonic\|seed"` — if anything shows, that git history must be purged.

### Agent Wallet Isolation

Agents should have **dedicated hot wallets** separate from any treasury or protocol wallet:

```
Treasury wallet (multisig, cold)
  └── Admin wallet (hardware, for upgrades/params)
      └── Agent hot wallet (EOA, minimal balance)
          ├── Gas wallet (0.01 ETH max)
          └── Payment wallet (50 USDC max)
```

Never give an agent access to the treasury private key.

---

## 3. Token Approvals & Allowances

### How Approvals Work

`approve(spender, amount)` grants `spender` the right to call `transferFrom` up to `amount` of your tokens. This is permanent until revoked.

**The risk:** If the spender contract is malicious or gets exploited, it can drain the full approved amount at any time — even months later.

### ❌ Unlimited Approvals

```solidity
// Common pattern — dangerous
token.approve(routerAddress, type(uint256).max);
```

This is convenient but grants permanent unlimited spending. If the router is ever compromised, all tokens are at risk.

### ✅ Exact-Amount Approvals

```solidity
// Approve only what's needed for this transaction
token.approve(routerAddress, swapAmount);
```

Or use EIP-2612 permit for single-transaction approve + use:
```solidity
token.permit(owner, spender, value, deadline, v, r, s);
```

### Revocation

Always revoke approvals after use for high-value contracts:
```solidity
token.approve(spender, 0);
```

Tools for users to check and revoke: `revoke.cash` (supports Base).

### MEV Risk in Approve Patterns

The `approve(0) → approve(amount)` pattern (to reset an allowance) creates a sandwich window where the old allowance can be front-run. Instead use `increaseAllowance` / `decreaseAllowance` or EIP-2612 permit.

---

## 4. Transaction Safety

### Slippage Protection

Every DEX swap must have slippage protection. "0 slippage" = no minimum output = full griefing vulnerability.

```typescript
// ❌ No protection
const params = {
  amountIn: parseUnits("100", 6),
  amountOutMinimum: 0n, // dangerous — will pass any output
};

// ✅ With slippage (0.5% max)
const expectedOut = await quoteExactInput(...);
const params = {
  amountIn: parseUnits("100", 6),
  amountOutMinimum: expectedOut * 995n / 1000n, // 0.5% slippage
};
```

### Deadline Protection

All DEX interactions should include a deadline. Without it, a miner can delay your transaction until conditions are unfavorable.

```typescript
deadline: BigInt(Math.floor(Date.now() / 1000) + 300), // 5 minutes
```

### Gas Estimation

Always use `eth_estimateGas` before submitting — never hardcode gas limits.

```typescript
const gas = await client.estimateGas({ to, data, value });
const gasWithBuffer = gas * 120n / 100n; // 20% buffer
```

### Simulation Before Submission

On Base, you can simulate transactions before sending:

```typescript
// Tenderly or Base's own simulation
const simulation = await client.call({ to, data, from, value });
if (simulation.status === "reverted") {
  throw new Error("Transaction would revert: " + simulation.revertReason);
}
```

### Re-org Awareness

For large value transfers, wait for L1 finality (~15 minutes) before considering irrevocable. For routine agent operations, Base's soft finality (~2s) is sufficient.

---

## 5. Smart Contract Risks for Agent Callers

### Reentrancy in Agent Flows

If your agent calls a contract that calls back into your agent in the same transaction:

```
Agent → MaliciousContract.withdraw()
         └── MaliciousContract calls back → Agent.deposit()
                                              (agent state not yet updated)
              └── withdraw again → profit
```

Guard agent contracts with `ReentrancyGuard` if they hold state between external calls.

### Unchecked Return Values

```typescript
// ❌ Dangerous — silently fails
await contract.write.transfer([to, amount]);

// ✅ Check result
const hash = await contract.write.transfer([to, amount]);
const receipt = await client.waitForTransactionReceipt({ hash });
if (receipt.status === "reverted") throw new Error("Transfer failed");
```

### Proxy Upgrade Risk

If you're calling a proxy contract, be aware the implementation can change. Build agents against audited, versioned interfaces. Cache the ABI and flag if it changes.

---

## 6. Agent-Specific Security

### Minimal Privilege Principle

Agents should only hold what they need:

```
❌ Agent holds $10,000 USDC for "future operations"
✅ Agent holds $5 USDC, refilled on demand from treasury

❌ Agent has owner role on all contracts
✅ Agent has a specific role (EXECUTOR_ROLE) with narrow permissions
```

### Transaction Rate Limits

Always enforce limits in agent code:

```typescript
const LIMITS = {
  maxPerTx: parseUnits("10", 6),       // $10 max per transaction
  maxPerHour: parseUnits("50", 6),     // $50 per hour
  maxPerDay: parseUnits("200", 6),     // $200 per day
  cooldownMs: 30_000,                  // 30s between transactions
};
```

Log every transaction to an append-only store before submission. If the log write fails, don't submit.

### Input Sanitization

Agents often take user-provided strings as inputs. Never pass them directly to contract calls:

```typescript
// ❌ User controls contract address
const contract = getContract({ address: userInput });

// ✅ Validate against allowlist
const ALLOWED_CONTRACTS = new Set(["0xabc...", "0xdef..."]);
if (!ALLOWED_CONTRACTS.has(userInput)) throw new Error("Unknown contract");
```

### Logging & Monitoring

Every onchain action should log:
- Timestamp
- Transaction hash
- From / to addresses
- Amount
- Function called
- Success / failure + reason

Set up alerts for:
- Transaction failure rate > 5%
- Daily spend > 80% of limit
- Gas price spike > 10× normal
- Balance below minimum threshold

---

## 7. Common Attack Vectors

### Signature Replay

A signed authorization for one chain can be replayed on another if domain separator is not enforced.

- Always include `chainId` in signed data (EIP-712 domain)
- Include contract address in domain separator
- Use nonces — each signature usable once

### Front-Running / MEV

Base uses a centralized sequencer — traditional Ethereum MEV is largely absent. However:
- Sequencer can see all pending transactions
- Large swaps can still be sandwiched in theory
- Use private mempool services or `eth_sendRawTransaction` with priority fee for sensitive transactions

### Phishing via Contract Calls

Malicious contracts can trick agents into signing transactions that look like one thing but do another.

- Always simulate before signing
- Decode calldata before displaying to users
- Reject any transaction where decoded function doesn't match expected
- Never sign `approve(address, uint256.max)` unless explicitly reviewed

### Dust Attack

Attacker sends tiny amounts of tokens to agent wallet to pollute balance accounting or trigger unexpected code paths.

- Ignore unknown token transfers below threshold
- Never act on unsolicited incoming transfers
- Maintain explicit allowlist of tokens agent should process

---

## 8. Audit Checklist for Agent Systems

```
Private Key Handling
- [ ] No keys in code, logs, env files committed to git
- [ ] Keys in secrets manager or hardware wallet
- [ ] Agent wallet isolated from treasury

Approvals
- [ ] No unlimited approvals to untrusted contracts
- [ ] Old approvals revoked after use
- [ ] EIP-2612 permit used where possible

Transactions
- [ ] Slippage protection on all swaps (never 0)
- [ ] Deadlines on all time-sensitive calls
- [ ] Gas estimated per-transaction, not hardcoded
- [ ] Simulation before submission on high-value txs

Rate Limiting
- [ ] Per-tx max amount enforced
- [ ] Per-hour and per-day caps enforced
- [ ] Cooldown between transactions

Smart Contracts
- [ ] Reentrancy guard on state-modifying entry points
- [ ] Return values checked (not ignored)
- [ ] Proxy implementations not blindly trusted

Monitoring
- [ ] All transactions logged with full context
- [ ] Alerts on failure rate, spend rate, balance
- [ ] Incident response plan exists

x402 Payments
- [ ] validBefore enforced
- [ ] Nonces stored and never reused
- [ ] Payment address matches expected treasury
- [ ] Amount >= required (no underpayment)
- [ ] USDC address hardcoded (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
```
