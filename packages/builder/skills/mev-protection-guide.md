# MEV Protection Guide

Grounding for `blue audit` and `blue build` — protecting users from maximal extractable value attacks on Base.

Sandwich attacks, frontrunning, intent-based swaps, and practical mitigation strategies.

---

## 1. What is MEV?

**Maximal Extractable Value (MEV)** is profit extracted by validators/sequencers (or bots) by reordering, inserting, or censoring transactions within a block.

### MEV Types

| Type | How | Example |
|---|---|---|
| **Sandwich attack** | Bot buys before you, sells after | Your $10K swap gets worse price |
| **Frontrunning** | Bot copies your tx with higher gas | Your arbitrage stolen |
| **Backrunning** | Bot acts on your tx's effect | Arb after your large swap |
| **Liquidation MEV** | Race to liquidate undercollateralized positions | Aave/Compound liquidation bots |
| **JIT liquidity** | LP adds liquidity just before your swap, removes after | Steals your swap fees |

### MEV on Base (Important Difference)

Base uses a **centralized sequencer** (operated by Coinbase). Unlike Ethereum's open mempool:

- No public mempool to frontrun from (transactions visible to sequencer only)
- Traditional gas auction MEV largely absent
- **BUT:** Sequencer CAN see all transactions before ordering them
- **AND:** Sequencer could theoretically sandwich (no evidence to date)
- **AND:** Cross-DEX arbitrage still exists (bots watch onchain state, not mempool)

**Bottom line for Base builders:** Standard MEV protection (slippage limits, deadline) is still required. Private mempool protection is less critical than on Ethereum but not zero.

---

## 2. Sandwich Attacks — Anatomy

```
Block N execution order (manipulated by bot):
  1. Bot TX: Buy 50 ETH for USDC (pushes price up)
  2. Victim TX: Your 10 ETH swap (at worse price, higher slippage)
  3. Bot TX: Sell 50 ETH for USDC (price restored, bot profits)

Economics:
  ETH price at start: $3,000
  Bot buys 50 ETH → price moves to $3,150 (+5%)
  You swap $30,000 for 9.52 ETH (instead of 10 ETH at $3,000)
  Bot sells 50 ETH → price back to $3,005
  
  Bot profit = $3,005 - $3,000 = $5/ETH × 50 = $250
  Your loss = slippage = $300 (you got 9.52 ETH instead of 10)
```

### Profitable Sandwich Conditions

```
Bot profit > bot gas cost
Bot profit = victim_slippage * (bot_position_size / pool_size)

Profitable sandwich threshold:
  - Large victim trade (>$10K)
  - Thin liquidity pool (<$500K TVL)
  - High slippage tolerance (>0.5%)
  
Bots skip sandwiching:
  - Small trades (<$1K) — profit < gas cost
  - Deep pools (>$5M TVL) — price impact too small
  - Tight slippage (<0.1%) — victim tx reverts, bot loses gas
```

---

## 3. Frontrunning

Frontrunning is copying a victim's transaction with a higher gas price to execute first.

```
Victim submits: buy_token(1000 USDC) with gasPrice = 1 gwei
Bot detects:    buy_token(1000 USDC) with gasPrice = 2 gwei (higher)
Block inclusion: Bot's tx first → price moves → victim gets worse rate

Classic frontrunnable transactions:
  - DEX arbitrage (profitable trade detected in mempool)
  - NFT minting at fixed price (bot buys before you)
  - Governance token claims (bot claims before you)
  - Oracle price updates (bot acts before price correction)
```

**On Base:** Less common because sequencer controls ordering, not public gas auction. But still consider for large arbitrage opportunities.

---

## 4. Slippage Control

The primary defense. Set maximum acceptable price impact.

```typescript
// ❌ Zero slippage tolerance — swaps revert if any price movement
const params = {
  amountIn: parseUnits("10000", 6),
  amountOutMinimum: 0n,  // ❌ Never do this — no protection
};

// ❌ Too loose — 5% slippage on $10,000 = $500 loss acceptable
const params = {
  amountIn: parseUnits("10000", 6),
  amountOutMinimum: parseEther("9.5"),  // 5% allowed — sandwich profitable
};

// ✅ 0.5% max slippage — balanced protection
const quote = await quoter.quoteExactInputSingle({
  tokenIn: USDC,
  tokenOut: WETH,
  amountIn: parseUnits("10000", 6),
  fee: 500,
  sqrtPriceLimitX96: 0n,
});

const amountOutMinimum = quote * 995n / 1000n;  // 0.5% slippage

const params = {
  tokenIn: USDC,
  tokenOut: WETH,
  fee: 500,
  recipient: userAddress,
  amountIn: parseUnits("10000", 6),
  amountOutMinimum,  // ✅ Reverts if more than 0.5% slippage
  sqrtPriceLimitX96: 0n,
};
```

### Slippage Tolerance Reference

| Trade Size | Recommended Slippage | Rationale |
|---|---|---|
| <$100 | 0.5–1.0% | Gas overhead >> sandwich profit |
| $100–$1K | 0.3–0.5% | Standard retail range |
| $1K–$10K | 0.1–0.3% | Balance execution vs protection |
| $10K–$100K | 0.05–0.1% | May need multiple small swaps |
| >$100K | Split into batches + 0.05% | Minimize price impact |

---

## 5. Deadline Protection

All swaps should have a deadline — prevents pending transactions from executing at stale prices.

```typescript
// ❌ No deadline — transaction can sit in mempool indefinitely
const params = {
  amountIn: ...,
  amountOutMinimum: ...,
  // deadline: missing!
};

// ✅ 5-minute deadline
const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

const params = {
  tokenIn: USDC,
  tokenOut: WETH,
  amountIn: parseUnits("10000", 6),
  amountOutMinimum,
  deadline,  // ✅ Reverts if not included in a block within 5 minutes
};
```

---

## 6. Intent-Based Architecture

**Intents** flip the execution model: users sign what they *want* (e.g., "swap 100 USDC for at least 0.032 ETH"), and **solvers** compete to fill it.

```
Traditional:
  User → broadcasts swap tx → miners/sequencer can frontrun

Intent-based:
  User → signs intent (off-chain)
  Solvers compete → best price wins
  Solver submits filled intent onchain
  User never touches the mempool
```

### UniswapX (on Base)

```typescript
// UniswapX order structure
const order = {
  info: {
    reactor: UNISWAPX_REACTOR_ADDRESS,
    swapper: userAddress,
    nonce: BigInt(Date.now()),
    deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
    additionalValidationContract: zeroAddress,
    additionalValidationData: "0x",
  },
  decayStartTime: BigInt(Math.floor(Date.now() / 1000)),
  decayEndTime: BigInt(Math.floor(Date.now() / 1000) + 60),
  exclusiveFiller: zeroAddress,
  exclusivityOverrideBps: 0n,
  input: {
    token: USDC,
    amount: parseUnits("100", 6),
    startAmount: parseUnits("100", 6),
    endAmount: parseUnits("100", 6),
  },
  outputs: [{
    token: WETH,
    startAmount: parseEther("0.033"),  // Best expected price
    endAmount: parseEther("0.031"),    // Worst acceptable price (decays over time)
    recipient: userAddress,
  }],
};

// Sign and submit off-chain
const signature = await wallet.signTypedData(orderTypeData);
// Submit to UniswapX order endpoint (off-chain API)
```

### CoW Protocol

Batch orders together. Matching off-chain finds coincidences of wants (CoW) — e.g., User A wants ETH, User B wants USDC — match them directly, no AMM needed.

**Result:** Zero MEV (no AMM, no frontrunning), better prices for matched pairs.

---

## 7. MEV-Resistant DEX Comparison

| Protocol | MEV Resistance | How | Best For |
|---|---|---|---|
| Uniswap V3/V4 | Medium | Slippage + deadline | Standard swaps |
| UniswapX | High | Intent-based, solver competition | Large swaps |
| CoW Protocol | Very high | Batch auction + CoW matching | Exact-output swaps |
| 1inch Fusion | High | Intent-based + resolver competition | Any size |
| Aerodrome | Medium | Same as Uniswap V3 | Base-native tokens |

---

## 8. Gas Price & Priority

On Base (centralized sequencer), gas auction MEV is less relevant. But for time-sensitive transactions:

```typescript
// Get current base fee + add priority tip
const feeData = await provider.getFeeData();

// For urgent transactions (avoid being delayed)
const maxFeePerGas = feeData.maxFeePerGas! * 120n / 100n;  // 20% above estimate
const maxPriorityFeePerGas = parseGwei("0.01");  // Minimal tip on Base (sequencer doesn't auction)

// For normal transactions (save gas)
const maxFeePerGas = feeData.maxFeePerGas!;
const maxPriorityFeePerGas = 0n;  // Zero tip still gets included on Base
```

**On Base:** Priority tips go to Coinbase (sequencer), not miners. Minimal tips sufficient for normal transactions.

---

## 9. Monitoring Tools

```typescript
// Track MEV on your contracts
// Watch for sandwich patterns in transaction history

// Example: Detect if your tx was sandwiched
async function detectSandwich(txHash: string): Promise<boolean> {
  const receipt = await provider.getTransactionReceipt(txHash);
  const block = await provider.getBlock(receipt.blockNumber, true);

  const txIndex = receipt.transactionIndex;
  const prevTx = block.transactions[txIndex - 1];
  const nextTx = block.transactions[txIndex + 1];

  // Check if adjacent txs interact with same pool
  // Same from address + same pool = likely sandwich
  return (
    prevTx?.to === nextTx?.to &&  // Same DEX
    prevTx?.from === nextTx?.from  // Same bot address
  );
}
```

**Tools:**
- MEV explore (Ethereum): `eigenphi.io`
- Flashbots MEV dashboard: `transparency.flashbots.net`
- Transaction simualtion: Tenderly (supports Base)

---

## 10. Mitigation Strategies Summary

### For Users / Frontend

```typescript
// 1. Always set slippage (0.1–0.5% range)
const minOut = quote * 995n / 1000n;  // 0.5% slippage

// 2. Always set deadline (5 min)
const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

// 3. For large swaps: split into multiple smaller swaps
async function splitSwap(totalAmount: bigint, chunks: number) {
  const chunkSize = totalAmount / BigInt(chunks);
  for (let i = 0; i < chunks; i++) {
    await executeSwap(chunkSize);
    await delay(2000);  // 2 block delay between chunks
  }
}

// 4. For large swaps: consider UniswapX/CoW
const useIntent = totalAmount > parseUnits("10000", 6);  // >$10K → use intent
```

### For Smart Contracts

```solidity
// ✅ Always validate amountOutMinimum > 0
function swap(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 amountOutMinimum,  // Must be nonzero — enforce in contract
    uint256 deadline
) external {
    require(amountOutMinimum > 0, "No slippage protection");
    require(deadline > block.timestamp, "Expired deadline");

    uint256 amountOut = _executeSwap(tokenIn, tokenOut, amountIn);
    require(amountOut >= amountOutMinimum, "Insufficient output amount");
}

// ✅ Commit-reveal for games/auctions (prevents frontrunning)
mapping(address => bytes32) commits;

function commit(bytes32 hash) external {
    commits[msg.sender] = hash;
}

function reveal(uint256 value, bytes32 salt) external {
    require(commits[msg.sender] == keccak256(abi.encodePacked(value, salt)));
    // Execute with revealed value — frontrunner can't win without knowing salt
}
```

---

## Common Mistakes

❌ **amountOutMinimum = 0** — zero slippage protection = guaranteed MEV extraction. Never ship this.

❌ **Infinite deadline** — old transactions can execute at bad prices months later.

❌ **Large single swap on thin liquidity** — 10% price impact = 10% loss on $100K = $10K lost.

❌ **Assuming Base is MEV-free** — sequencer can still sandwich, cross-DEX arb still exists onchain.

❌ **Displaying amountOut to user before deadline** — quote goes stale. Fetch fresh quote in final tx.

✅ **Smart defaults:** 0.5% slippage, 5-minute deadline in all UIs.

✅ **UniswapX for >$10K swaps** — solver competition typically beats AMM prices anyway.

✅ **Split large orders** — 3 × $33K is safer than 1 × $100K.

---

## Resources

- UniswapX docs: `docs.uniswap.org/contracts/uniswapx`
- CoW Protocol: `cow.fi`
- MEV education: `flashbots.net/writings`
- Related skills: `uniswap-v4-hooks-guide.md`, `aerodrome-dex-guide.md`
- CLI: `blue audit --check slippage`, `blue audit --check mev-risk`
