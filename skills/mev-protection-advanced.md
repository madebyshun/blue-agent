# MEV Protection Advanced Guide

Grounding for `blue audit` and `blue build` — advanced MEV mitigation: CoW, intent-based swaps, order flow auctions, MEV burning.

---

## 1. Advanced MEV Landscape

Basic MEV (sandwich, frontrunning) is covered in `mev-protection-guide.md`. This document covers **structural MEV elimination** — redesigning how trades route to eliminate extractable value entirely.

### The MEV Problem at Scale

```
Ethereum MEV extraction per year: ~$1–2B
Base MEV: Lower (centralized sequencer, no public mempool)
           But: still ~$50M+ in cross-DEX arb and JIT liquidity

Who benefits from MEV:
  Ethereum: Validators + MEV-Boost relays (public auction)
  Base: Coinbase (sequencer gets all MEV by default)
  
Who loses:
  Retail traders: ~0.1–1% worse prices
  Protocols: Reputation damage, user loss
  DeFi ecosystem: Systematic wealth transfer from users to bots
```

---

## 2. CoW — Coincidence of Wants

**CoW Protocol** finds two users who want to trade with each other directly — bypassing AMMs entirely.

### How CoW Matching Works

```
Traditional AMM route:
  User A: Sell 1,000 USDC → Buy ETH
  Route: USDC → AMM pool → ETH
  Slippage: 0.1%, Pool fee: 0.05%
  Total cost: 0.15%

CoW matching:
  User A: Sell 1,000 USDC → Buy ETH
  User B: Sell 0.33 ETH → Buy USDC
  
  Solver matches them directly:
  A gets ETH, B gets USDC
  Both at midpoint price — no AMM fee, no slippage
  Solver takes tiny spread (0.01–0.03%)
  
  Savings: 0.15% → 0.02% = 87% cheaper
```

### CoW Batch Auction Architecture

```
1. Collection phase (30 seconds):
   All intents collected off-chain
   No mempool exposure during this phase

2. Solver competition:
   ~20 registered solvers receive batch
   Each solver submits: execution plan + surplus amount
   Surplus = what users save vs worst-case price

3. Winner selection:
   Solver with maximum user surplus wins
   Solver submits batch on-chain as single tx

4. Settlement:
   All trades in batch settled atomically
   CoW matches filled first (zero cost)
   Remaining routed to best available liquidity
```

### CoW Protocol Integration

```typescript
import { OrderBookApi, OrderSigningUtils, SupportedChainId } from "@cowprotocol/cow-sdk";

const orderBookApi = new OrderBookApi({ chainId: SupportedChainId.BASE });

// Create order
const order = {
  sellToken: USDC_ADDRESS,
  buyToken: WETH_ADDRESS,
  receiver: userAddress,
  sellAmount: parseUnits("1000", 6).toString(),  // 1,000 USDC
  buyAmount: parseEther("0.32").toString(),       // Minimum 0.32 ETH
  validTo: Math.floor(Date.now() / 1000) + 600,  // 10 min validity
  appData: "0x",
  feeAmount: "0",                                 // CoW calculates fee
  kind: "sell",
  partiallyFillable: false,
};

// Sign order
const { signature, signingScheme } = await OrderSigningUtils.signOrder(
  order,
  SupportedChainId.BASE,
  signer
);

// Submit to CoW orderbook (off-chain)
const orderId = await orderBookApi.sendOrder({
  ...order,
  signature,
  signingScheme,
  from: userAddress,
});

console.log("CoW order submitted:", orderId);
// Order is now off-chain — no mempool exposure
// Solver batch runs every ~30 seconds
```

---

## 3. Intent-Based Architecture Deep Dive

Intents separate **what the user wants** from **how it gets executed**.

### Intent Primitives

```
Traditional swap:
  User specifies: exact path + pools + amounts
  Problem: Path is visible → extractable

Intent-based swap:
  User specifies: "I want at least X of token B for my A"
  Solver specifies: path, routing, execution
  Problem eliminated: User doesn't touch mempool
```

### UniswapX Dutch Auction

```typescript
// UniswapX uses a Dutch auction that decays over time
// Solvers compete: best price early, or wait for guaranteed fill at worse price

interface DutchOrder {
  info: {
    reactor: string;      // UniswapX Reactor contract
    swapper: string;      // User address
    nonce: bigint;
    deadline: bigint;     // Absolute expiry
    additionalValidationContract: string;
    additionalValidationData: string;
  };
  decayStartTime: bigint; // Auction starts
  decayEndTime: bigint;   // Auction ends (guaranteed fill price)
  exclusiveFiller: string; // Optional: specific solver gets priority
  exclusivityOverrideBps: bigint;
  input: {
    token: string;
    startAmount: bigint;  // Best case (less input)
    endAmount: bigint;    // Worst case (more input)
  };
  outputs: {
    token: string;
    startAmount: bigint;  // Best case (more output)
    endAmount: bigint;    // Worst case (less output)
    recipient: string;
  }[];
}

// Example: User sells 1,000 USDC
// Dutch auction from $3,200/ETH → $3,100/ETH over 60 seconds
const dutchOrder: DutchOrder = {
  info: {
    reactor: UNISWAPX_REACTOR,
    swapper: userAddress,
    nonce: BigInt(Date.now()),
    deadline: BigInt(Math.floor(Date.now() / 1000) + 120),
    additionalValidationContract: zeroAddress,
    additionalValidationData: "0x",
  },
  decayStartTime: BigInt(Math.floor(Date.now() / 1000)),
  decayEndTime: BigInt(Math.floor(Date.now() / 1000) + 60),
  exclusiveFiller: zeroAddress,
  exclusivityOverrideBps: 0n,
  input: {
    token: USDC,
    startAmount: parseUnits("1000", 6),
    endAmount: parseUnits("1000", 6),
  },
  outputs: [{
    token: WETH,
    startAmount: parseEther("0.3125"),  // Best: $3,200/ETH
    endAmount: parseEther("0.3226"),    // Worst: $3,100/ETH (guaranteed fill)
    recipient: userAddress,
  }],
};
```

### 1inch Fusion Mode

```typescript
// 1inch Fusion: intent-based with resolver network
// Resolvers compete to fill orders, user never hits mempool

const fusionSdk = new FusionSDK({
  url: "https://fusion.1inch.io",
  network: 8453,  // Base chain ID
  blockchainProvider: provider,
});

const params = {
  fromTokenAddress: USDC,
  toTokenAddress: WETH,
  amount: parseUnits("1000", 6).toString(),
  walletAddress: userAddress,
  // Optional: permit2 signature for gasless approve
};

// Get quote (shows resolver competition)
const quote = await fusionSdk.getQuote(params);
console.log("Resolver count:", quote.resolverCount);
console.log("Expected output:", formatEther(quote.toTokenAmount));

// Place order
const order = await fusionSdk.placeOrder(quote, signer);
console.log("Fusion order:", order.orderHash);
```

---

## 4. Order Flow Auctions (OFA)

Order Flow Auctions let protocols sell user order flow to the highest-bidding solver — returning MEV value back to users.

### MEV Capture Architecture

```
Without OFA:
  User → DEX → Sandwich bot takes MEV → User pays full cost

With OFA:
  User → Protocol OFA → Solvers bid for right to fill
  Highest bidder pays user/protocol for the order
  User gets better price (MEV rebated back)
  
Example: CoW Protocol batch auction IS an OFA
```

### Implementing a Simple OFA

```typescript
// On-chain: sealed bid auction for order flow
contract OrderFlowAuction {
    struct Bid {
        address solver;
        uint256 surplusPromised;  // How much extra the solver promises user
        bytes32 commitment;       // Sealed bid
    }

    // Phase 1: Collect sealed bids (100 blocks)
    // Phase 2: Reveal bids (50 blocks)
    // Phase 3: Execute highest bidder's fill

    mapping(bytes32 => Bid[]) public bids;
    
    function submitBid(
        bytes32 orderId,
        bytes32 commitment  // keccak(solverAddress, surplusAmount, salt)
    ) external {
        bids[orderId].push(Bid(msg.sender, 0, commitment));
    }
    
    function revealBid(
        bytes32 orderId,
        uint256 surplus,
        bytes32 salt
    ) external {
        // Verify commitment
        bytes32 expectedCommit = keccak256(abi.encodePacked(msg.sender, surplus, salt));
        // Find matching bid and update surplus
    }
    
    function executeWinner(bytes32 orderId) external {
        // Find highest surplus bidder
        // Let them execute the order
        // User gets surplus + base fill
    }
}
```

---

## 5. MEV Burning

Instead of giving MEV to validators/sequencers, burn it — redistributing value to all token holders.

### Ethereum's EIP-1559 as MEV Burning Analogy

```
Base fee:  Burned (deflationary)
Priority tip: Goes to validator

EIP-1559 effectively burns a portion of transaction value
MEV burning: Protocol captures MEV and burns protocol token
```

### Protocol-Level MEV Burning

```solidity
// Example: DEX that captures and burns MEV
contract MEVBurningDEX {
    IERC20 public protocolToken;
    
    // Sequencer/validator backrun value captured here
    receive() external payable {
        // ETH sent here is backrun MEV from our pool
        // Buy and burn protocol token
        _buyAndBurn(msg.value);
    }
    
    function _buyAndBurn(uint256 ethAmount) internal {
        // Buy protocol token on open market
        uint256 tokensBought = _buyToken(ethAmount);
        // Burn them
        protocolToken.transfer(address(0), tokensBought);
        emit MEVBurned(ethAmount, tokensBought);
    }
}
```

### Base Sequencer Revenue Sharing (Retroactive)

```
Base charges sequencer fee on all transactions.
Coinbase keeps this revenue currently.

Future: Sequencer revenue sharing with Base ecosystem:
  - Part of fees go to Base treasury
  - Part rebated to active dApps
  - Proposal: On-chain public good funding

For builders: Not yet live but design for it —
  track your protocol's sequencer fee contribution
```

---

## 6. Advanced Slippage Engineering

### Dynamic Slippage Based on Trade Size

```typescript
function calculateOptimalSlippage(
  poolTVL: bigint,
  tradeSize: bigint,
  volatility: number  // annualized vol as fraction (0.8 = 80%)
): number {
  const priceImpact = Number(tradeSize) / Number(poolTVL);
  
  // Base slippage = expected price impact × 2 (buffer)
  const baseSlippage = priceImpact * 2;
  
  // Volatility adjustment: high vol = need more buffer
  const volatilityBuffer = volatility * (5 / 365 / 24);  // 5-minute vol
  
  const totalSlippage = baseSlippage + volatilityBuffer;
  
  // Bounds: 0.05% min, 3% max
  return Math.min(Math.max(totalSlippage, 0.0005), 0.03);
}
```

### Split Order Routing

```typescript
async function splitOrderRoute(
  tokenIn: Address,
  tokenOut: Address,
  totalAmount: bigint,
  options: { maxImpact: number; pools: Pool[] }
): Promise<SplitOrder[]> {
  const maxSingleOrder = options.pools.reduce((sum, pool) => {
    // Max order that stays within impact tolerance
    const maxForPool = pool.tvl * BigInt(Math.floor(options.maxImpact * 10000)) / 10000n;
    return sum + maxForPool;
  }, 0n);
  
  if (totalAmount <= maxSingleOrder) {
    return [{ amount: totalAmount, pool: options.pools[0] }];
  }
  
  // Split across pools and time
  const chunkSize = maxSingleOrder / 3n;
  const chunks = Math.ceil(Number(totalAmount / chunkSize));
  
  return Array.from({ length: chunks }, (_, i) => ({
    amount: i === chunks - 1 ? totalAmount - chunkSize * BigInt(chunks - 1) : chunkSize,
    delay: i * 2,  // 2-second delay between chunks (≈1 block on Base)
    pool: options.pools[i % options.pools.length],
  }));
}
```

---

## 7. MEV on Base — Specific Patterns

### Cross-DEX Arbitrage (Still Active on Base)

```
Base sequencer sees all txs before including them.
Cross-DEX arb happens AFTER transactions are confirmed:
  
  Block N: Large USDC→ETH swap on Aerodrome
  Bot sees confirmed tx
  Bot: ETH→USDC on Uniswap (price hasn't equalized yet)
  Block N+1: Arb captured

This is BACKRUNNING — bots react to onchain state, not mempool.
Defense: Add slippage protection (price equalization is automatic).
There is no defense against backrunning for the original trader — it's the natural AMM mechanism.
```

### JIT Liquidity Attack Pattern

```
JIT = Just-In-Time Liquidity

Attack:
  1. Bot detects your large swap in sequencer queue
  2. Bot adds $10M concentrated liquidity in same range
  3. Your swap executes → bot collects all your swap fees
  4. Bot removes liquidity immediately after
  
Cost to user: 0 (you still get your swap)
Stolen value: LP fees that should have gone to existing LPs
  
Defense for LPs: Uniswap V4 hooks can detect and block JIT
  (Time-based lock: liquidity must stay for N blocks)
```

### MEV-Resistant Pool Design

```solidity
// Uniswap V4 hook: prevent JIT liquidity
contract AntiJITHook is BaseHook {
    mapping(bytes32 => uint256) public lastAddedLiquidity;  // position → block
    uint256 public constant MIN_BLOCKS_BEFORE_REMOVE = 10;  // ~20 seconds on Base
    
    function beforeRemoveLiquidity(
        address sender,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata params,
        bytes calldata
    ) external override returns (bytes4) {
        bytes32 positionKey = keccak256(abi.encode(sender, params.tickLower, params.tickUpper));
        
        require(
            block.number >= lastAddedLiquidity[positionKey] + MIN_BLOCKS_BEFORE_REMOVE,
            "JIT: must hold liquidity for minimum period"
        );
        
        return BaseHook.beforeRemoveLiquidity.selector;
    }
    
    function afterAddLiquidity(
        address sender,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata params,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external override returns (bytes4, BalanceDelta) {
        bytes32 positionKey = keccak256(abi.encode(sender, params.tickLower, params.tickUpper));
        lastAddedLiquidity[positionKey] = block.number;
        return (BaseHook.afterAddLiquidity.selector, BalanceDeltaLibrary.ZERO_DELTA);
    }
}
```

---

## 8. Aggregator Selection for MEV Protection

| Aggregator | MEV Protection | Base Support | Best For |
|---|---|---|---|
| CoW Protocol | Very High (batch auction) | Yes | Large trades, exact-out |
| UniswapX | High (Dutch auction) | Yes | Any size, fast |
| 1inch Fusion | High (resolver network) | Yes | DeFi power users |
| Paraswap | Medium (aggregation) | Yes | Mid-size trades |
| 0x Protocol | Medium (RFQ + AMM) | Yes | Professional/API |
| Li.Fi | Medium (cross-chain) | Yes | Cross-chain swaps |

---

## 9. Monitoring & Alerting for MEV

```typescript
// Track if your protocol is being sandwiched
interface MEVAlert {
  type: "sandwich" | "frontrun" | "backrun" | "jit";
  blockNumber: number;
  victimTx: string;
  attackerTx: string;
  estimatedLoss: bigint;
}

async function monitorForMEV(
  poolAddress: Address,
  fromBlock: bigint,
  client: PublicClient
): Promise<MEVAlert[]> {
  const alerts: MEVAlert[] = [];
  
  const block = await client.getBlock({ blockNumber: fromBlock, includeTransactions: true });
  const txs = block.transactions as TransactionType[];
  
  for (let i = 1; i < txs.length - 1; i++) {
    const prev = txs[i - 1];
    const curr = txs[i];
    const next = txs[i + 1];
    
    // Detect sandwich: prev and next are same sender, curr is victim
    if (
      prev.from === next.from &&      // Same bot
      prev.from !== curr.from &&      // Different from victim
      prev.to === poolAddress &&      // Interact with same pool
      next.to === poolAddress
    ) {
      alerts.push({
        type: "sandwich",
        blockNumber: Number(fromBlock),
        victimTx: curr.hash,
        attackerTx: prev.hash,
        estimatedLoss: 0n,  // Would need simulation to calculate
      });
    }
  }
  
  return alerts;
}
```

---

## 10. Protocol Design Principles for MEV Minimization

```
1. Batch execution:
   Never execute single trades — accumulate and batch
   CoW Protocol is the extreme version of this principle

2. Off-chain signing, on-chain settlement:
   Users sign intents off-chain (no mempool exposure)
   Settlement happens in single atomic tx

3. Commit-reveal for auctions:
   NFT auctions: submit hash of (bid + salt), reveal later
   Prevents frontrunning of winning bids

4. Time-locks on sensitive operations:
   Governance: 48-hour timelock before execution
   Liquidations: 15-minute delay (soft liquidation)
   New pool: Observation period before allowing large trades

5. MEV-aware circuit breakers:
   Pause if price moves >5% in one block
   Require TWAP confirmation for large liquidations
   Alert team on anomalous block patterns
```

---

## Common Mistakes

❌ **Routing large trades through thin AMMs** — high slippage = profitable sandwich.

❌ **Ignoring JIT liquidity for LP protocols** — existing LPs lose fees without knowing why.

❌ **Building your own OFA** — extremely complex; use CoW or UniswapX's existing infrastructure.

❌ **Thinking Base = MEV-free** — backrunning and JIT still exist. Cross-DEX arb is constant.

✅ **Use intent-based protocols for >$10K swaps** — CoW/UniswapX/1inch Fusion beat AMM prices.

✅ **Implement anti-JIT hooks in Uniswap V4 pools** — protect your LPs from fee theft.

✅ **Design for MEV transparency** — log what MEV your protocol generates so you can address it.

---

## Resources

- CoW Protocol SDK: `npmjs.com/package/@cowprotocol/cow-sdk`
- UniswapX: `docs.uniswap.org/contracts/uniswapx`
- 1inch Fusion: `portal.1inch.dev/documentation/fusion-swap`
- MEV research: `flashbots.net/writings`
- Eigenphi (MEV explorer): `eigenphi.io`
- Related skills: `mev-protection-guide.md`, `uniswap-v4-hooks-guide.md`
- CLI: `blue audit --check mev-advanced`, `blue build "MEV-resistant DEX on Base"`
