# Multi-Sig Wallet Security Guide

Grounding for `blue build` (treasury management, team wallets) and `blue audit` (multi-sig risk review).

Safe{Wallet} architecture, M-of-N setups, module patterns, recovery keys, and operational security.

---

## 1. Why Multi-Sig?

A single private key is a single point of failure. Multi-sig requires M of N keys to sign any transaction.

```
Single key: 1 person compromised → everything lost
2-of-3:     1 person compromised → funds safe (need 2 to move)
3-of-5:     2 people compromised → funds safe (need 3 to move)
            2 people unavailable → funds safe (3 others still work)

Real risk scenarios:
  Key loss:         Someone loses their hardware wallet → 3-of-5 means you still have 4 others
  Key compromise:   Hacker steals 1 key → still needs 2 more
  Internal threat:  Rogue employee → can't move funds alone
  Phishing:         Signer tricked into signing → others can reject
  
Rule of thumb:
  Personal treasury: 2-of-3
  Protocol treasury: 3-of-5 or 4-of-7
  Emergency admin: 5-of-9 (higher bar for critical functions)
```

---

## 2. Safe{Wallet} Architecture

Safe (formerly Gnosis Safe) is the standard multi-sig for DeFi. ~$100B+ TVL.

### Core Architecture

```
Safe Contract (Proxy):
  ├── Safe Proxy (minimal proxy — delegates to implementation)
  ├── Safe Implementation (logic contract)
  └── Module Registry (optional extensions)

Key concepts:
  Owners:     List of authorized signers (EOA addresses)
  Threshold:  Minimum signatures required (M in M-of-N)
  Nonce:      Transaction replay protection
  Modules:    Authorized contracts that bypass threshold
  Guard:      Contract that checks every transaction (can reject)
```

### Safe Transaction Flow

```
1. Propose transaction (any owner):
   - Define: to, value, data, operation (CALL or DELEGATECALL)
   - Sign the SafeTxHash (EIP-712 typed data)
   - Post signature to Safe API (or on-chain if no API)

2. Collect signatures (M-1 more owners):
   - Each owner reviews and signs the SafeTxHash
   - Signatures collected off-chain via Safe{Wallet} UI / API

3. Execute transaction (any signer with enough sigs):
   - Call Safe.execTransaction(to, value, data, ..., signatures)
   - Contract verifies signatures match owners
   - Executes if threshold met
   
4. Optional: Timelock module
   - Transaction queued for 24-48h before execution
   - Community can react to malicious transactions
```

---

## 3. Deploying a Safe

### Via Safe SDK

```typescript
import Safe, { EthersAdapter, SafeFactory, SafeAccountConfig } from "@safe-global/protocol-kit";
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

const ethAdapter = new EthersAdapter({ ethers, signerOrProvider: signer });
const safeFactory = await SafeFactory.create({ ethAdapter });

// Define owners and threshold
const safeAccountConfig: SafeAccountConfig = {
  owners: [
    "0xAlice...",  // Replace with real addresses (verify on Basescan)
    "0xBob...",
    "0xCarol...",
  ],
  threshold: 2,  // 2-of-3
};

// Deploy Safe on Base (chain ID 8453)
const safeSdk = await safeFactory.deploySafe({ safeAccountConfig });
const safeAddress = await safeSdk.getAddress();
console.log("Safe deployed at:", safeAddress);
```

### Via blue CLI

```bash
# Deploy and configure Safe multisig vault
blue build "Deploy 3-of-5 Safe multisig on Base for protocol treasury"
```

---

## 4. Executing Transactions

```typescript
import Safe, { EthersAdapter } from "@safe-global/protocol-kit";
import SafeApiKit from "@safe-global/api-kit";

const safeService = new SafeApiKit({
  txServiceUrl: "https://safe-transaction-base.safe.global",
  ethAdapter,
});

// 1. Create transaction
const safeTx = await safeSdk.createTransaction({
  transactions: [{
    to: TREASURY_RECIPIENT,
    value: ethers.parseEther("1").toString(),
    data: "0x",
  }],
});

// 2. Sign (first signer)
const safeTxHash = await safeSdk.getTransactionHash(safeTx);
const senderSignature = await safeSdk.signTransactionHash(safeTxHash);

// 3. Propose to Safe API (other signers can see it)
await safeService.proposeTransaction({
  safeAddress,
  safeTransactionData: safeTx.data,
  safeTxHash,
  senderAddress: await signer.getAddress(),
  senderSignature: senderSignature.data,
});

// 4. Other signers: approve via Safe{Wallet} UI or API
// 5. Execute once threshold reached
const executeTxResponse = await safeSdk.executeTransaction(safeTx);
const receipt = await executeTxResponse.transactionResponse?.wait();
console.log("Executed:", receipt?.hash);
```

---

## 5. Safe Modules

Modules are contracts that can execute transactions on behalf of a Safe without M-of-N signatures. Use carefully.

### Timelock Module

```solidity
// Queues all Safe transactions — gives community time to react
contract TimelockModule {
    Safe public safe;
    uint256 public constant DELAY = 48 hours;
    
    struct QueuedTx {
        address to;
        uint256 value;
        bytes data;
        uint256 executeAfter;
        bool executed;
    }
    
    mapping(bytes32 => QueuedTx) public queue;
    
    // Any owner can queue a tx
    function queueTransaction(
        address to,
        uint256 value,
        bytes calldata data
    ) external returns (bytes32 txId) {
        require(safe.isOwner(msg.sender), "Not owner");
        txId = keccak256(abi.encode(to, value, data, block.timestamp));
        queue[txId] = QueuedTx({
            to: to, value: value, data: data,
            executeAfter: block.timestamp + DELAY,
            executed: false,
        });
        emit TransactionQueued(txId, to, value, data, block.timestamp + DELAY);
    }
    
    // Execute after delay
    function executeTransaction(bytes32 txId) external {
        QueuedTx storage tx = queue[txId];
        require(!tx.executed, "Already executed");
        require(block.timestamp >= tx.executeAfter, "Too early");
        
        tx.executed = true;
        bool success = safe.execTransactionFromModule(
            tx.to, tx.value, tx.data, Enum.Operation.Call
        );
        require(success, "Execution failed");
    }
    
    // Cancel before delay expires (requires full threshold)
    function cancelTransaction(bytes32 txId) external {
        require(safe.isOwner(msg.sender), "Not owner");
        delete queue[txId];
    }
}
```

### Allowance Module (Spending Limits)

```solidity
// Pre-approved recurring payments without full multi-sig
contract AllowanceModule {
    struct Allowance {
        uint96 amount;           // Max amount per period
        uint96 spent;            // Amount spent this period
        uint16 resetPeriod;      // Days until reset (0 = one-time)
        uint32 lastReset;        // Timestamp of last reset
        address delegate;        // Who can spend this allowance
    }
    
    mapping(address => mapping(address => Allowance)) allowances;
    // safe → token → allowance

    // Set allowance (requires safe threshold)
    function setAllowance(
        address safe,
        address delegate,
        address token,
        uint96 amount,
        uint16 resetPeriod
    ) external {
        // Only called from safe via execTransactionFromModule
        allowances[safe][token] = Allowance({
            amount: amount,
            spent: 0,
            resetPeriod: resetPeriod,
            lastReset: uint32(block.timestamp),
            delegate: delegate,
        });
    }
    
    // Delegate can transfer within allowance
    function executeAllowanceTransfer(
        address safe,
        address token,
        address payable to,
        uint96 amount
    ) external {
        Allowance storage allowance = allowances[safe][token];
        require(msg.sender == allowance.delegate, "Not delegate");
        
        // Reset if period elapsed
        if (block.timestamp >= allowance.lastReset + uint256(allowance.resetPeriod) * 1 days) {
            allowance.spent = 0;
            allowance.lastReset = uint32(block.timestamp);
        }
        
        require(allowance.spent + amount <= allowance.amount, "Allowance exceeded");
        allowance.spent += amount;
        
        // Transfer via safe
        bool success = GnosisSafe(safe).execTransactionFromModule(
            token, 0,
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount),
            Enum.Operation.Call
        );
        require(success, "Transfer failed");
    }
}
```

---

## 6. Recovery Patterns

### Social Recovery

```
When a key is lost: remaining owners add replacement

Process (2-of-3 Safe, lost one key):
  1. Remaining 2 owners propose: addOwnerWithThreshold(newKey, 2)
  2. Both sign the Safe transaction
  3. Execute → new key replaces lost one
  
Key generation ceremony:
  - Generate new key offline (air-gapped computer)
  - Verify address on hardware wallet
  - All signers confirm new owner address before signing
```

```typescript
// Add new owner (use after key compromise/loss)
const safeTx = await safeSdk.createAddOwnerTx({
  ownerAddress: newOwnerAddress,
  threshold: 2,  // Keep or adjust threshold
});

// Sign and execute with remaining owners
const safeTxHash = await safeSdk.getTransactionHash(safeTx);
```

### Dead Man's Switch

```typescript
// Module: if no activity for N days, allow recovery address to claim
contract DeadManSwitch {
    Safe public safe;
    address public recovery;
    uint256 public constant TIMEOUT = 365 days;
    uint256 public lastActivity;
    
    function checkIn() external {
        require(safe.isOwner(msg.sender), "Not owner");
        lastActivity = block.timestamp;
    }
    
    function recover() external {
        require(msg.sender == recovery, "Not recovery");
        require(block.timestamp > lastActivity + TIMEOUT, "Not timed out");
        
        // Add recovery address as owner with threshold 1
        safe.execTransactionFromModule(
            address(safe),
            0,
            abi.encodeWithSelector(
                safe.addOwnerWithThreshold.selector,
                recovery,
                1
            ),
            Enum.Operation.Call
        );
    }
}
```

---

## 7. Guard — Transaction Validation

Guards inspect every transaction before execution. Like a firewall for your Safe.

```solidity
// Guard: restrict which addresses Safe can interact with
contract AllowlistGuard is Guard {
    mapping(address => bool) public allowedTargets;
    
    function checkTransaction(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes memory signatures,
        address msgSender
    ) external view override {
        // Block delegatecall (high risk)
        require(
            operation == Enum.Operation.Call,
            "Guard: DELEGATECALL not allowed"
        );
        
        // Only allow whitelisted destinations
        require(allowedTargets[to], "Guard: target not in allowlist");
        
        // Block zero-value calls to EOAs (potential gas griefing)
        require(
            to.code.length > 0 || value > 0,
            "Guard: empty call to EOA"
        );
    }
    
    function checkAfterExecution(bytes32 txHash, bool success) external override {
        // Post-execution checks (optional)
    }
}
```

---

## 8. Operational Security

### Signer Hardware Requirements

```
Minimum hardware security for each signer:
  ✅ Hardware wallet (Ledger, Trezor, GridPlus) — required for >$10K treasury
  ✅ Separate device than daily use computer
  ✅ Seed phrase stored offline (metal backup, not paper)
  ✅ Never enter seed phrase on computer
  
Key ceremony for new Safe:
  1. All signers generate keys independently
  2. Share ONLY the public address (never private key)
  3. Verify each address on physical device before adding
  4. Test with $1 transaction before storing real funds
```

### Verification Process

```
Before signing any Safe transaction:
  1. Open Safe{Wallet} and navigate to pending transactions
  2. Verify: to address (copy-paste, don't trust clipboard)
  3. Verify: amount
  4. Verify: calldata (decode on Tenderly or Etherscan)
  5. Verify: nonce (correct, not a replay)
  6. Sign on hardware wallet, verify address on device screen
  
Anti-phishing:
  Always access Safe via bookmarked URL (app.safe.global)
  Never click links in emails/Discord to "sign a Safe tx"
  Verify Safe address matches expected address before signing
```

### Multi-Device Signer Setup

```
Team of 5 with 3-of-5:

Alice: Ledger (personal) + Ledger (office, backup)
Bob: Trezor Model T (hardware)
Carol: Keystone Pro (air-gapped)
Dave: GridPlus Lattice1 (hardware + cloud backup)
Eve: Ledger Nano X (hardware)

Geographic distribution:
  Alice: San Francisco
  Bob: New York
  Carol: London
  Dave: Singapore
  Eve: Remote (distributed)

No single jurisdiction can seize more than 1-2 keys
```

---

## 9. Common Multi-Sig Setups

### Protocol Treasury (3-of-5)

```
Purpose: Store protocol fees, liquidity, grants
Signers: 3 core team + 2 community reps
Threshold: 3-of-5

Operations:
  Daily: Allowance module for team expenses (< $5K)
  Weekly: Payroll via recurring transactions (< $50K)
  Monthly: Protocol upgrades, large payments (> $50K) require 3-of-5

Timelock: 24h on all transactions > $10K
```

### Emergency Admin (4-of-7)

```
Purpose: Pause contracts, emergency upgrades
Signers: 4 senior engineers + 3 security researchers
Threshold: 4-of-7

Operations:
  Only for emergencies (active hack, critical bug)
  All signers on-call with 1h response SLA
  Post-incident report required for every use
  
No timelock (emergency = need speed)
Audit trail: All transactions logged to Discord/Notion
```

---

## Common Mistakes

❌ **Threshold too low (1-of-N)** — single signature = single point of failure. Minimum 2.

❌ **All signers in same jurisdiction** — regulatory seizure or natural disaster can freeze funds.

❌ **No hardware wallets** — software wallets can be compromised remotely.

❌ **Module without timelock** — modules bypass threshold; a buggy module = full access.

❌ **Enabling DELEGATECALL on modules** — allows modules to upgrade Safe itself.

❌ **Not testing recovery process** — test with small amounts before real treasury.

✅ **Use Safe{Wallet} (app.safe.global)** — battle-tested, $100B+ TVL, regular audits.

✅ **Set up allowance module for predictable payments** — reduces signature fatigue.

✅ **Timelock all protocol parameter changes** — gives community time to exit if needed.

---

## Resources

- Safe{Wallet}: `app.safe.global`
- Safe SDK: `docs.safe.global/sdk/protocol-kit`
- Safe Transaction Service API: `safe-transaction-base.safe.global`
- Safe modules registry: `docs.safe.global/advanced/smart-account-modules`
- CLI: `blue build "Safe multisig treasury on Base"`, `blue audit --check multisig-config`
- Related skills: `agent-wallet-security.md`, `governance-dao-patterns.md`
