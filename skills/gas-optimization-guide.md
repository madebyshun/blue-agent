# Gas Optimization Guide

Grounding for `blue build` (gas-efficient contracts) and `blue audit` (gas risk review).

EVM opcode costs, storage vs memory, batch operations, assembly tricks, and Base-specific patterns.

---

## 1. Why Gas Optimization Matters

```
On Ethereum: High gas costs → users pay $10-200 per transaction
On Base: Gas costs ~1000× cheaper, but still matters because:
  - Protocols with many users: 1M txs × saved gas = real money
  - Gas-intensive operations still noticeable on Base
  - Smart contract patterns matter for cross-chain deployment
  
Gas costs:
  Ethereum: ~15 gwei base fee → $2-30 per complex tx
  Base: ~0.001-0.01 gwei base fee → $0.001-0.05 per complex tx
  
Optimization priority:
  1. Correctness (never sacrifice for gas)
  2. Security (never sacrifice for gas)
  3. Readability (consider cost before sacrificing)
  4. Gas savings (apply when above are satisfied)
```

---

## 2. Storage Is Expensive — Memory Is Cheap

The most important gas principle: **SSTORE and SLOAD are the most expensive operations**.

### Storage Costs (EIP-2929, EIP-3529)

```
SSTORE (write to storage):
  New slot (0 → nonzero):   22,100 gas
  Update slot (nonzero → nonzero): 2,900 gas  (after first access in tx)
  Delete slot (nonzero → 0):     -15,000 gas refund (capped at 20% of tx)

SLOAD (read from storage):
  First access in tx:  2,100 gas (cold)
  Subsequent access:     100 gas (warm, EIP-2929)

MLOAD / MSTORE (memory):
  3 gas each (extremely cheap)

CALLDATALOAD:
  3 gas (reading calldata)
```

### Caching Storage Variables

```solidity
// ❌ BAD: Multiple SLOADs (expensive)
function badSum() external view returns (uint256) {
    return balance[msg.sender] + balance[msg.sender] + balance[msg.sender];
    // 3 SLOADs = 3 × 2,100 = 6,300 gas
}

// ✅ GOOD: Cache in memory (one SLOAD)
function goodSum() external view returns (uint256) {
    uint256 bal = balance[msg.sender];  // 1 SLOAD = 2,100 gas
    return bal + bal + bal;             // 3 MLOADs = 9 gas
}

// ❌ BAD: Loop reading storage
function badTotal() external view returns (uint256 total) {
    for (uint i = 0; i < items.length; i++) {  // items.length = SLOAD each iteration
        total += items[i];                       // items[i] = SLOAD each iteration
    }
}

// ✅ GOOD: Cache array length and items
function goodTotal() external view returns (uint256 total) {
    uint256 len = items.length;    // 1 SLOAD
    uint256[] memory _items = items;  // 1 SLOAD for pointer
    for (uint i = 0; i < len; i++) {
        total += _items[i];        // MLOAD, not SLOAD
    }
}
```

---

## 3. Packing Storage Variables

EVM stores 32 bytes per storage slot. Pack multiple small variables into one slot.

```solidity
// ❌ BAD: Each variable uses full 32-byte slot (3 slots = 3 × 22,100 gas to init)
contract BadPacking {
    uint256 public tokenId;    // Slot 0: 32 bytes
    address public owner;      // Slot 1: 32 bytes (only uses 20 bytes)
    uint32 public timestamp;   // Slot 2: 32 bytes (only uses 4 bytes)
}

// ✅ GOOD: Pack into 1 slot (address=20 bytes, uint32=4 bytes, bool=1 byte = 25 bytes < 32)
contract GoodPacking {
    // Solidity packs these into one slot (declared together, smaller types)
    address public owner;      // 20 bytes ─┐
    uint32 public timestamp;   // 4 bytes   ├─ All in Slot 0 (28 bytes used)
    bool public locked;        // 1 byte   ─┘
    
    uint256 public tokenId;    // Slot 1: 32 bytes (uint256 always gets own slot)
}

// Verify packing with assembly
function getSlot0() external view returns (bytes32 slot0Data) {
    assembly { slot0Data := sload(0) }
}
```

### Structs and Packing

```solidity
// ❌ BAD: Struct layout wastes 2 slots
struct BadOrder {
    uint256 price;    // Slot 0: 32 bytes
    address buyer;    // Slot 1: 20 bytes (padded to 32)
    uint256 amount;   // Slot 2: 32 bytes
    uint32 deadline;  // Slot 3: 4 bytes (padded to 32)
}
// Total: 4 slots = 4 × 22,100 = 88,400 gas to create

// ✅ GOOD: Reordered to pack into 2 slots
struct GoodOrder {
    uint256 price;    // Slot 0: 32 bytes
    uint256 amount;   // Slot 1: 32 bytes
    address buyer;    // Slot 2: 20 bytes ─┐ packed into one slot
    uint32 deadline;  //          4 bytes ─┘
}
// Total: 3 slots (and slot 2 partially used) = 3 × 22,100 = 66,300 gas
// Savings: 22,100 gas per struct creation
```

---

## 4. Calldata vs Memory

```solidity
// ❌ BAD: Copies array to memory (expensive for large arrays)
function processItems(uint256[] memory items) external {
    // Memory copy from calldata: gas ∝ items.length
}

// ✅ GOOD: Read directly from calldata
function processItems(uint256[] calldata items) external {
    // No copy — reads directly from calldata
    // Cheaper for large arrays
}

// When to use memory vs calldata:
// calldata: For external functions, input arrays you don't modify
// memory: For internal functions, arrays you need to modify, return values
```

---

## 5. Short-Circuit and Early Exit

```solidity
// ❌ BAD: Always evaluates both conditions
function badCheck(uint256 a, uint256 b) internal {
    require(expensiveCheck1() && expensiveCheck2(), "failed");
}

// ✅ GOOD: Short-circuit — expensiveCheck2 skipped if Check1 fails
function goodCheck(uint256 a, uint256 b) internal {
    require(expensiveCheck1(), "check1 failed");
    require(expensiveCheck2(), "check2 failed");
}

// ✅ GOOD: Early return in loops
function findFirst(uint256[] calldata items, uint256 target)
    external pure returns (uint256 index) {
    for (uint256 i; i < items.length; i++) {
        if (items[i] == target) return i;  // Exit immediately
    }
    revert("Not found");
}
```

---

## 6. Immutables and Constants

```solidity
// ❌ BAD: Storage read on every access (2,100 gas cold, 100 gas warm)
contract BadConfig {
    address public treasury;       // Storage variable
    uint256 public fee = 500;      // Storage variable
    
    constructor(address _treasury) {
        treasury = _treasury;
    }
}

// ✅ GOOD: Constants and immutables are in bytecode (3 gas)
contract GoodConfig {
    uint256 public constant FEE = 500;  // Compile-time constant: 3 gas
    address public immutable treasury;  // Set once in constructor: 3 gas per read
    
    constructor(address _treasury) {
        treasury = _treasury;
    }
}
```

---

## 7. Mappings vs Arrays

```solidity
// Mappings: O(1) lookup, no length, can't iterate
// Arrays: O(n) lookup, has length, can iterate

// ✅ For individual lookups: mapping wins
mapping(address => uint256) balances;
uint256 bal = balances[user];  // O(1), 1 SLOAD

// ❌ Arrays for lookups are expensive
address[] users;
// Finding a user: O(n) loop = n SLOADs

// Pattern: Use both for different purposes
mapping(address => uint256) public balances;  // Fast lookup
address[] public userList;                     // For enumeration
mapping(address => bool) public isUser;        // Fast existence check
```

---

## 8. Events Instead of Storage

```solidity
// ❌ BAD: Store historical data in storage (expensive)
struct Transaction {
    address from;
    address to;
    uint256 amount;
    uint256 timestamp;
}
Transaction[] public transactionHistory;  // Grows forever, expensive

// ✅ GOOD: Emit events (20× cheaper than storage, readable off-chain)
event Transfer(
    address indexed from,   // indexed = can filter efficiently
    address indexed to,
    uint256 amount,
    uint256 timestamp
);

function transfer(address to, uint256 amount) external {
    balances[msg.sender] -= amount;
    balances[to] += amount;
    emit Transfer(msg.sender, to, amount, block.timestamp);  // ~375 gas per topic
}

// Off-chain: query events via getLogs
const transfers = await client.getLogs({
  address: contractAddress,
  event: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 amount, uint256 timestamp)"),
  fromBlock: 0n,
});
```

---

## 9. Unchecked Math

In Solidity 0.8+, overflow/underflow checks add ~50-100 gas per operation.

```solidity
// ✅ Use unchecked when overflow is mathematically impossible

// Loop counter can't overflow uint256 (would need 2^256 iterations)
for (uint256 i; i < len; ) {
    // ... loop body ...
    unchecked { i++; }  // Saves ~50 gas per iteration
}

// Balance update: subtraction checked above
function transfer(address to, uint256 amount) external {
    require(balances[msg.sender] >= amount, "Insufficient");
    unchecked {
        balances[msg.sender] -= amount;  // Safe: checked above
        balances[to] += amount;           // Safe: total supply bounded
    }
}

// ❌ NEVER use unchecked blindly
unchecked {
    result = a * b;  // ❌ Could still overflow if a and b are large
}
```

---

## 10. Assembly for Hot Paths

Inline assembly (Yul) for maximum gas efficiency. Use only for well-tested, critical paths.

```solidity
// ✅ Efficient address comparison
function isContract(address addr) internal view returns (bool result) {
    assembly {
        result := gt(extcodesize(addr), 0)  // 700 gas vs ~800 for Solidity version
    }
}

// ✅ Efficient ETH transfer (avoid Solidity overhead)
function sendETH(address payable recipient, uint256 amount) internal {
    assembly {
        let success := call(gas(), recipient, amount, 0, 0, 0, 0)
        if iszero(success) { revert(0, 0) }
    }
    // ~500 gas vs ~2,300 gas for recipient.transfer(amount)
}

// ✅ Read arbitrary storage slot
function readSlot(uint256 slot) external view returns (bytes32 value) {
    assembly { value := sload(slot) }
}

// ✅ Efficient keccak256 for mapping key
function getMappingSlot(address key, uint256 mappingSlot) internal pure returns (uint256) {
    return uint256(keccak256(abi.encode(key, mappingSlot)));
}
```

---

## 11. Batch Operations

```solidity
// ❌ BAD: N separate transactions = N × overhead
// User calls transfer() 10 times = 10 × 21,000 base gas + call overhead

// ✅ GOOD: Batch in one transaction
function batchTransfer(
    address[] calldata recipients,
    uint256[] calldata amounts
) external {
    require(recipients.length == amounts.length, "Length mismatch");
    
    uint256 len = recipients.length;
    for (uint256 i; i < len; ) {
        balances[msg.sender] -= amounts[i];
        balances[recipients[i]] += amounts[i];
        emit Transfer(msg.sender, recipients[i], amounts[i]);
        unchecked { i++; }
    }
}
// 1 transaction = 1 × 21,000 base gas + N × (transfer cost)
// Savings: ~20,000 gas per recipient vs separate transactions
```

---

## 12. EIP-1153 Transient Storage (Solidity 0.8.24+)

Transient storage is cleared after each transaction — perfect for reentrancy locks and cross-call caches.

```solidity
// ❌ OLD: Reentrancy lock uses permanent storage (22,100 gas to set, refund on clear)
bool private locked;
modifier nonReentrant() {
    require(!locked, "Reentrant");
    locked = true;
    _;
    locked = false;
}

// ✅ NEW (EIP-1153): Transient storage (100 gas, auto-cleared after tx)
modifier nonReentrantTransient() {
    assembly {
        if tload(0) { revert(0, 0) }  // Check transient slot 0
        tstore(0, 1)                   // Set lock (100 gas vs 22,100)
    }
    _;
    assembly { tstore(0, 0) }          // Clear (100 gas vs refund mechanism)
}
```

---

## 13. Base-Specific Optimizations

```
Base vs Ethereum gas differences:

L2 calldata: Cheaper than Ethereum but still paid
  - Ethereum: 4 gas/zero byte, 16 gas/nonzero byte
  - Base: uses L1 data posting cost — minimize calldata size

Deployment:
  - Contract deployment is cheap on Base (~0.001 ETH vs 0.1+ ETH)
  - Deploy larger/more feature-rich contracts than you'd risk on Ethereum
  
Block gas limit:
  - Base: 60M gas limit (same as Ethereum)
  - Block time: ~2 seconds → cheaper per-block than Ethereum's 12s
  
Tips for Base:
  1. Calldata compression matters less (L1 cost still applies)
  2. Prefer on-chain computation over off-chain + signature
     (computation is cheap; reducing trust is worth it)
  3. Large storage is still the main cost (same as Ethereum)
```

---

## 14. Gas Profiling Tools

```bash
# Foundry gas reports
forge test --gas-report

# Snapshot comparison
forge snapshot                    # Save current gas snapshot
forge test --diff .gas-snapshot   # Compare against snapshot

# Gas optimization via IR
forge build --via-ir              # Use Yul IR pipeline (better optimization)

# Specific function gas measurement
forge test -vvv --match-test test_transfer
# Shows gas cost of each test

# Hardhat gas reporter
npx hardhat test --reporter eth-gas-reporter
```

---

## Common Mistakes

❌ **Reading storage in loops** — N SLOADs × loop iterations = exponential cost. Cache first.

❌ **Using `public` instead of `external` for external functions** — `public` copies calldata to memory.

❌ **Large string error messages** — each character costs gas. Use short error codes or custom errors.

```solidity
// ❌ Expensive: stores error string in bytecode
require(balance > 0, "Insufficient balance to perform this operation");

// ✅ Cheap: custom errors (4 bytes signature, no string)
error InsufficientBalance();
if (balance == 0) revert InsufficientBalance();
```

❌ **Redundant condition checks** — if SafeMath, require + unchecked double-checks.

✅ **Profile before optimizing** — use `forge snapshot` to measure real impact.

✅ **Immutable > constant > storage** — for any value set at deploy time.

✅ **Custom errors over require strings** — saves ~50-100 bytes and gas per revert.

---

## Resources

- Ethereum EVM opcodes: `evm.codes`
- Foundry gas reporting: `book.getfoundry.sh/reference/forge/forge-snapshot`
- Gas optimization techniques: `rareskills.io/gas-optimization`
- EIP-1153 (transient storage): `eips.ethereum.org/EIPS/eip-1153`
- Related skills: `solidity-security-patterns.md`, `uniswap-v4-hooks-guide.md`
- CLI: `blue audit --check gas-efficiency`, `blue build "gas-optimized ERC20 on Base"`
