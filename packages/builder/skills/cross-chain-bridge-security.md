# Cross-Chain Bridge Security Guide

Grounding for `blue audit` (bridge risk review) and `blue build` (cross-chain integration).

Safe cross-chain bridging between Base and other chains — architectures, risk models, and best practices.

---

## 1. Bridge Architectures

### Lock-and-Mint

```
Ethereum → Base:
  1. User locks ETH in bridge contract on Ethereum
  2. Relayer detects lock event
  3. Wrapped ETH (WETH) minted on Base
  4. User receives WETH on Base

Risk: If bridge contract on Ethereum is exploited → wrapped tokens worthless
Risk: If minting key compromised → infinite wrapped tokens printed
```

### Liquidity Pool (Atomic Swap)

```
Ethereum → Base:
  1. User deposits USDC on Ethereum
  2. Protocol releases USDC from Base pool to user
  3. Net balance rebalanced via rebalancer bots

Examples: Stargate, Hop, Across

Risk: Pool can be drained if AMM logic is exploited
Risk: Liquidity mismatch (Ethereum pool full, Base pool empty = failure)
```

### Optimistic Bridge (Base Official)

```
Base ↔ Ethereum official bridge:
  1. Message sent on Base
  2. 7-day challenge window (anyone can prove fraud)
  3. After 7 days → message executed on Ethereum

Deposit (Ethereum → Base): ~2 minutes (fast, no challenge needed)
Withdrawal (Base → Ethereum): 7 days (challenge window)

Risk: Very low — backed by Ethereum security + fault proofs
```

### ZK Bridge

```
ZK proof generated off-chain proves state transition
Verifier contract on destination chain checks ZK proof
No challenge period — near-instant finality

Examples: Polygon zkEVM bridge, ZKSync, Starknet

Risk: ZK proof bugs (rare but catastrophic), verifier contract bugs
Currently: Most ZK bridges are still partially trusted (committee-based proof submission)
```

---

## 2. Base ↔ Ethereum Bridge (Official)

The safest option. Backed by Ethereum's security and Base's fault proof system.

### Deposit (Ethereum → Base)

```typescript
import { createWalletClient, http, parseEther } from "viem";
import { mainnet } from "viem/chains";

// L1StandardBridge on Ethereum
const L1_BRIDGE = "0x3154Cf16ccdb4C6d922629664174b904d80F2C35";  // TODO: verify

// Deposit ETH from Ethereum to Base
const depositTx = await walletClient.writeContract({
  address: L1_BRIDGE,
  abi: L1StandardBridgeAbi,
  functionName: "depositETH",
  args: [
    200_000n,   // L2 gas limit
    "0x",       // extra data
  ],
  value: parseEther("1"),  // 1 ETH to bridge
});

// Wait ~2 minutes for deposit to appear on Base
```

### Withdrawal (Base → Ethereum)

```typescript
// L2StandardBridge on Base
const L2_BRIDGE = "0x4200000000000000000000000000000000000010";  // OP Stack predeploy

// Step 1: Initiate withdrawal on Base
const initTx = await walletClient.writeContract({
  address: L2_BRIDGE,
  abi: L2StandardBridgeAbi,
  functionName: "withdraw",
  args: [
    ETH_ADDRESS,       // L2 token (ETH)
    parseEther("1"),   // Amount
    100_000n,          // L1 gas limit
    "0x",             // Extra data
  ],
});

// Step 2: Wait 7 DAYS for challenge window
// Step 3: Prove withdrawal on Ethereum (after finalization)
// Step 4: Relay withdrawal on Ethereum

// For fast withdrawals: use Hop, Across, or Stargate
// They front the ETH on Ethereum, then get repaid via the 7-day bridge
```

### Native USDC Bridge

Circle's CCTP (Cross-Chain Transfer Protocol) provides native USDC bridging:
- No wrapped USDC — native USDC burned on source, minted on destination
- ~20 minutes (attestation time)
- Official Circle mechanism — no bridge smart contract risk

```typescript
// USDC CCTP on Base
// TokenMessenger: TODO — verify on Basescan
// MessageTransmitter: TODO — verify on Basescan
```

---

## 3. Third-Party Bridges

### Stargate (LayerZero-based)

```
Architecture: Unified liquidity pools across chains
Mechanism: Delta Algorithm — rebalances pools via messaging
Fee: 0.06% of transfer amount
Speed: ~30 seconds to 5 minutes
Risk: LayerZero oracle + relayer trust, pool liquidity

Best for: USDC, ETH transfers where speed matters more than maximum security
```

### Across Protocol

```
Architecture: Intents-based (relayers front liquidity, get repaid via UMA oracle)
Mechanism: Relayers compete to fill orders, optimistic verification
Fee: Dynamic, typically 0.04–0.15%
Speed: 1–4 minutes
Risk: UMA oracle for relayer payment settlement

Best for: Fast USDC/USDT/WETH transfers
```

### Hop Protocol

```
Architecture: hTokens (intermediary token) + Uniswap-style AMM on each chain
Mechanism: Bonders front liquidity, receive hTokens as IOU
Fee: 0.04–0.2% + gas
Speed: 1–5 minutes
Risk: Bonder solvency, AMM imbalance, hToken depeg

Best for: Moderate transfers where some speed premium is acceptable
```

### Wormhole

```
Architecture: Guardian network (19 validators) signs VAAs (Verifiable Action Approvals)
Mechanism: Attestation-based bridge
Fee: Very low (near-zero protocol fee)
Speed: ~15 seconds (fast guardian network)
Risk: 13-of-19 guardian compromise = bridge drained

Best for: Solana ↔ Base, multi-chain routing
Caution: Was hacked for $320M in Feb 2022 (signature verification bug)
```

---

## 4. Bridge Risk Assessment

### Risk Severity Matrix

| Bridge Type | Hack Probability | Hack Magnitude | Recommended Max |
|---|---|---|---|
| Official Base bridge | Very Low | N/A (Ethereum security) | No limit |
| USDC CCTP | Very Low | N/A (Circle-operated) | No limit |
| Across / Stargate | Low | Medium (pool TVL) | $100K personal |
| Hop | Low-Medium | Medium | $50K |
| Wormhole | Medium (history) | High (all TVL) | $10K |
| Unknown bridges | High | High | Never |

### Historical Bridge Hacks (Major)

| Bridge | Date | Loss | Mechanism |
|---|---|---|---|
| Ronin (Axie) | 2022 | $625M | 5-of-9 validator keys compromised |
| Wormhole | 2022 | $320M | Signature verification bypass |
| Nomad | 2022 | $190M | Merkle proof bug — anyone could claim |
| Poly Network | 2021 | $611M | Access control bypass |
| Harmony Horizon | 2022 | $100M | 2-of-5 multisig compromised |

**Pattern:** Most bridge hacks are validator/key compromise or smart contract bugs.

---

## 5. Wrapped Token Risk

When using third-party bridges, you receive **wrapped tokens** — IOUs backed by the bridge's contract.

```
Native USDC (Base):     0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
                        → Circle-issued, no bridge risk

Stargate USDC (Base):   TODO — verify
                        → Wrapped by Stargate, redeemable from pool
                        → If Stargate is exploited, this USDC is worthless

Hop USDC (Base):        TODO — verify
                        → Wrapped by Hop, requires Hop liquidity
```

### Depeg Risk

Wrapped tokens can trade below face value if:
1. Bridge contract is exploited
2. Liquidity pool becomes imbalanced
3. Rebalancer bots fail
4. Smart contract upgrade goes wrong

**Rule:** Always prefer native USDC over bridged variants. Verify with `token.symbol()` and source code.

---

## 6. Best Practices

### Amount Limits

```typescript
// Never bridge more than you can afford to lose to bridge risk
const BRIDGE_LIMITS = {
  official: Infinity,     // Base official bridge — backed by Ethereum
  cctp: Infinity,         // USDC CCTP — backed by Circle
  stargate: 100_000,      // $100K max per transaction
  across: 50_000,         // $50K max
  hop: 25_000,            // $25K max
  unknown: 0,             // Never
};

function validateBridgeAmount(bridge: string, amount: number): void {
  const limit = BRIDGE_LIMITS[bridge] ?? 0;
  if (amount > limit) {
    throw new Error(`Amount $${amount} exceeds ${bridge} trust limit of $${limit}`);
  }
}
```

### Bridge Diversification for Large Amounts

```
Moving $500,000 USDC from Ethereum to Base:
❌ Single bridge: $500,000 via Stargate (full exposure to Stargate hack)

✅ Diversified:
  $250,000 via official bridge (7-day delay, maximum security)
  $150,000 via USDC CCTP (20 min, Circle-level security)
  $100,000 via Across (fast, lower security)
```

### Verify Before Bridging

```typescript
// Before using any bridge:
// 1. Check recent audit reports
// 2. Check TVL (high TVL = more incentive to hack = more scrutiny from auditors)
// 3. Check insurance coverage (Nexus Mutual, Sherlock)
// 4. Check time since last audit
// 5. Check if contracts are upgradeable (can be changed without notice)

async function bridgeRiskCheck(bridge: BridgeProtocol): Promise<RiskScore> {
  const tvl = await getBridgeTVL(bridge);
  const lastAudit = await getLastAuditDate(bridge);
  const isUpgradeable = await checkUpgradeability(bridge);
  const hasInsurance = await checkInsurance(bridge);

  // Score 0-100 (higher = safer)
  let score = 50;
  if (tvl > 500_000_000) score += 20;  // High TVL = more scrutiny
  if (daysSince(lastAudit) < 180) score += 20;
  if (!isUpgradeable) score += 10;
  if (hasInsurance) score += 15;

  return { score, recommendation: score > 70 ? "safe" : "caution" };
}
```

---

## 7. Token Bridging vs Liquidity Bridging

### Token Bridging (Lock-and-Mint)

```
+ Works for any ERC-20 token (even obscure ones)
+ No liquidity pool required
- Wrapped token = new counterparty risk
- Need to verify wrapped token is legitimate
```

### Liquidity Bridging (Pool-Based)

```
+ Native tokens on destination (no wrapping)
+ Usually faster
- Requires liquidity on both sides
- Pool imbalance = transaction fails or high slippage
- Works only for popular tokens (USDC, ETH, USDT)
```

### For USDC: Always Prefer CCTP

```typescript
// CCTP: Native USDC cross-chain (no wrapper)
// Circle burns USDC on source chain, mints on destination
// ~20 minutes, Circle-level security, zero slippage

// vs

// Stargate/Hop: Pool-based, wrapped USDC
// Faster but introduces bridge smart contract risk
```

---

## 8. Slippage & Price Impact on Bridges

```typescript
// Check liquidity depth before bridging
async function checkBridgeLiquidity(
  bridge: string,
  token: string,
  amount: bigint
): Promise<{ available: bigint; slippage: number }> {
  const poolLiquidity = await getBridgePoolLiquidity(bridge, token);

  // High amount vs pool size = high slippage
  const slippage = Number(amount) / Number(poolLiquidity) * 100;

  if (slippage > 0.5) {
    console.warn(`High bridge slippage: ${slippage.toFixed(2)}%`);
    console.warn("Consider splitting into multiple transactions");
  }

  return { available: poolLiquidity, slippage };
}

// Rule: Bridge slippage > 0.3% → split into smaller batches
const SLIPPAGE_THRESHOLD = 0.3;  // 0.3%
```

---

## 9. Gas Costs Comparison

```
Ethereum → Base:
  Official bridge: ~$5-20 ETH gas + Base gas (near-free)
  Stargate: ~$3-15 + Stargate fee (0.06%)
  Across: ~$5-20 + Across fee (0.04-0.15%)
  USDC CCTP: ~$5-15 (burn tx) + attestation + mint tx

Base → Ethereum:
  Official bridge: ~$0.001 (Base tx) + 7 day wait + ~$10-30 (Ethereum prove + relay)
  Third-party: ~$0.001 (Base tx) + fee + ~$5-15 (Ethereum)

Gas optimization: Batch multiple transfers in one transaction if bridge supports it
```

---

## 10. Integration Checklist

```
Pre-Integration:
  ☐ Reviewed bridge audit reports (within 12 months)
  ☐ Checked bridge TVL and time in operation
  ☐ Identified which tokens are supported natively vs wrapped
  ☐ Tested on Base Sepolia testnet
  ☐ Set amount limits appropriate to bridge trust level

Implementation:
  ☐ Validate bridge address against official docs (not random GitHub gist)
  ☐ Implement slippage checks on bridge output
  ☐ Handle bridge failures gracefully (retry logic, user notification)
  ☐ Log all bridge transactions with txHash on both chains
  ☐ Implement reconciliation checks (expected vs actual received)

For USDC Transfers Specifically:
  ☐ Use native USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) on Base
  ☐ Prefer CCTP for Ethereum ↔ Base USDC
  ☐ Verify received token is native USDC, not a wrapped variant
```

---

## Common Mistakes

❌ **Using spot price from bridge as oracle** — bridge pools are manipulable.

❌ **Bridging more than bridge insurance covers** — if hacked, no recourse.

❌ **Not checking for wrapped vs native tokens** — silently receiving inferior wrapped token.

❌ **Using unofficial/unknown bridges** — $0 in protocol TVL = no incentive for auditors to check it.

❌ **Not testing bridge failure paths** — what happens if bridge fails mid-transaction?

✅ **Official bridge for security-critical transfers** — 7 days is worth the safety.

✅ **USDC CCTP for fast USDC transfers** — Circle-grade security, 20 minute speed.

✅ **Document which bridge token you accept** — native USDC vs bridged USDC affects protocol accounting.

---

## Resources

- Official Base bridge: `bridge.base.org`
- Across protocol: `across.to`
- Stargate: `stargate.finance`
- USDC CCTP: `developers.circle.com/stablecoins/cctp-getting-started`
- Li.Fi (bridge aggregator + comparison): `li.fi`
- Related skills: `agent-wallet-security.md`, `base-ecosystem.md`
- CLI: `blue audit --check bridge-risk`, `blue build "cross-chain app on Base"`
