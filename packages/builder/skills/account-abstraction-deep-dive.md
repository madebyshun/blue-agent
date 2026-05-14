# Account Abstraction Deep Dive

Grounding for `blue build` (smart wallets, gasless UX) and `blue audit` (ERC-4337 security).

ERC-4337 internals: UserOperation lifecycle, bundler economics, EntryPoint validation, multi-chain AA patterns.

---

## 1. ERC-4337 Architecture

Account Abstraction (AA) separates the **account** (smart contract) from the **signer** (key). Any smart contract can be a wallet — with custom validation logic.

### Key Components

```
Traditional wallet:
  EOA (externally owned account) → signs tx → included in block
  
AA wallet:
  Smart Account → UserOperation → Bundler → EntryPoint → Smart Account

Components:
  UserOperation:   AA's version of a transaction (off-chain, signed struct)
  Bundler:         Node that collects UserOps, submits them onchain in batches
  EntryPoint:      Singleton contract (0x0000000071727De22E5E9d8BAf0edAc6f37da032)
                   Orchestrates UserOp validation and execution
  Smart Account:   Your wallet contract (implements IAccount)
  Paymaster:       Optional contract that pays gas on behalf of user
  Aggregator:      Optional: aggregates signatures (BLS for gas savings)
```

### Why AA on Base?

```
Base advantages:
  - Near-zero gas costs → paymasters are affordable
  - Coinbase Smart Wallet (built on Base) = first mainstream AA wallet
  - OnchainKit provides AA-ready components
  - Base sequencer: no gas auction complexity
  
Use cases:
  - Gasless onboarding (paymaster covers first N txs)
  - Social recovery (recover wallet via trusted contacts)
  - Passkey signing (Face ID / Touch ID → tx)
  - Batched transactions (approve + swap in one click)
  - Spending limits (can't transfer > X/day)
  - Session keys (game signs transactions, user doesn't)
```

---

## 2. UserOperation Structure

```typescript
interface UserOperation {
  // Account
  sender: Address;             // Smart account address
  nonce: bigint;               // Account's nonce (from EntryPoint)
  initCode: Hex;               // Factory + calldata to deploy new account (empty if exists)
  
  // Call
  callData: Hex;               // Encoded function call(s) to execute
  
  // Gas (Payer: EOA bundler or Paymaster)
  callGasLimit: bigint;        // Gas for execution phase
  verificationGasLimit: bigint; // Gas for validateUserOp
  preVerificationGas: bigint;  // Fixed overhead (calldata cost, EntryPoint overhead)
  maxFeePerGas: bigint;        // EIP-1559 max fee
  maxPriorityFeePerGas: bigint;
  
  // Paymaster (optional)
  paymasterAndData: Hex;       // paymasterAddress + paymaster-specific data
  
  // Signature
  signature: Hex;              // Whatever validateUserOp expects (ECDSA, passkey, multisig...)
}

// EntryPoint address (v0.7 — current standard)
const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
```

---

## 3. UserOperation Lifecycle

### Phase 1: Simulation (Off-chain)

```
User creates UserOperation
  ↓
Bundler calls: EntryPoint.simulateValidation(userOp)
  (static call — no state change)
  ↓
EntryPoint calls: account.validateUserOp(userOp, hash, missingFunds)
  ↓
If paymaster: EntryPoint calls: paymaster.validatePaymasterUserOp(userOp, hash, maxCost)
  ↓
Simulation returns: gas estimates, validity window, accepted/rejected
  ↓
Bundler decides: include in mempool or reject
```

### Phase 2: Bundler Mempool

```
Bundler collects UserOps from alt mempool (separate from Ethereum's)
Bundler simulates each UserOp for:
  - Gas usage (to estimate profitability)
  - Forbidden opcodes (BLOCKHASH, TIMESTAMP during validation)
  - Storage access rules (prevent DoS)
  
Bundler groups profitable UserOps into a bundle
Bundle = single transaction: EntryPoint.handleOps(ops[], beneficiary)
```

### Phase 3: On-chain Execution

```solidity
// Simplified EntryPoint.handleOps flow
function handleOps(UserOperation[] calldata ops, address payable beneficiary) external {
    for (UserOperation calldata op : ops) {
        // 1. Validate
        uint256 validationData = _validateUserOp(op);
        require(validationData == 0, "Validation failed");
        
        // 2. Execute
        bool success = _executeUserOp(op);
        
        // 3. Refund unused gas
        uint256 gasUsed = startGas - gasleft();
        uint256 refund = op.preVerificationGas + gasUsed * op.maxFeePerGas;
        
        // 4. Pay bundler (or paymaster handles this)
    }
    
    // Pay bundler for all ops
    beneficiary.transfer(totalRefund);
}
```

---

## 4. Smart Account Implementation

```solidity
// Minimal ERC-4337 compliant smart account
contract SimpleSmartAccount is IAccount {
    address public owner;
    IEntryPoint public immutable entryPoint;
    
    constructor(address _owner, IEntryPoint _entryPoint) {
        owner = _owner;
        entryPoint = _entryPoint;
    }
    
    // Called by EntryPoint to validate UserOperation
    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external override returns (uint256 validationData) {
        // Only EntryPoint can call this
        require(msg.sender == address(entryPoint), "not from EntryPoint");
        
        // 1. Validate signature
        bytes32 hash = userOpHash.toEthSignedMessageHash();
        address signer = hash.recover(userOp.signature);
        
        if (signer != owner) {
            return SIG_VALIDATION_FAILED;  // 1 = failed, 0 = ok
        }
        
        // 2. Pay EntryPoint what it needs for gas
        if (missingAccountFunds > 0) {
            (bool success,) = payable(msg.sender).call{value: missingAccountFunds}("");
            success; // Ignore failure — EntryPoint handles it
        }
        
        return 0;  // 0 = valid, no expiry
    }
    
    // Execute arbitrary calls (only from EntryPoint)
    function execute(
        address dest,
        uint256 value,
        bytes calldata data
    ) external {
        require(msg.sender == address(entryPoint), "not from EntryPoint");
        (bool success, bytes memory result) = dest.call{value: value}(data);
        require(success, string(result));
    }
    
    // Batch execute multiple calls in one UserOperation
    function executeBatch(
        address[] calldata dests,
        uint256[] calldata values,
        bytes[] calldata datas
    ) external {
        require(msg.sender == address(entryPoint), "not from EntryPoint");
        require(dests.length == values.length && dests.length == datas.length, "bad lengths");
        
        for (uint i = 0; i < dests.length; i++) {
            (bool success,) = dests[i].call{value: values[i]}(datas[i]);
            require(success, "batch item failed");
        }
    }
    
    // Allow ETH deposits
    receive() external payable {}
}
```

---

## 5. Paymaster Patterns

Paymasters sponsor gas for users — enabling "gasless" UX.

### Verifying Paymaster (Sponsors Approved Users)

```solidity
contract VerifyingPaymaster is IPaymaster {
    address public verifyingSigner;
    
    // Called during validation phase
    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external override returns (bytes memory context, uint256 validationData) {
        // Extract paymaster signature from paymasterAndData
        // (first 20 bytes = paymaster address, rest = data)
        bytes calldata paymasterData = userOp.paymasterAndData[20:];
        uint48 validUntil = uint48(bytes6(paymasterData[0:6]));
        uint48 validAfter = uint48(bytes6(paymasterData[6:12]));
        bytes calldata signature = paymasterData[12:];
        
        // Verify our signer approved this UserOp
        bytes32 hash = keccak256(abi.encode(
            userOpHash,
            validUntil,
            validAfter
        ));
        address signer = hash.toEthSignedMessageHash().recover(signature);
        require(signer == verifyingSigner, "Invalid paymaster signature");
        
        return ("", _packValidationData(false, validUntil, validAfter));
    }
    
    // Called after execution to handle gas payment
    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost
    ) external override {
        // Paymaster pays EntryPoint from its deposit
        // No user payment needed
    }
}
```

### ERC-20 Paymaster (User Pays in Token Instead of ETH)

```solidity
contract ERC20Paymaster is IPaymaster {
    IERC20 public immutable token;
    AggregatorV3Interface public priceFeed;  // Token/ETH price
    
    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost  // In ETH/wei
    ) external override returns (bytes memory context, uint256 validationData) {
        // Calculate token cost
        uint256 tokenPrice = _getTokenPrice();  // Tokens per ETH
        uint256 tokenCost = maxCost * tokenPrice / 1e18;
        
        // Check user has approved enough tokens
        uint256 allowance = token.allowance(userOp.sender, address(this));
        require(allowance >= tokenCost, "Insufficient token allowance");
        
        // Context: pass token cost to postOp
        return (abi.encode(userOp.sender, tokenCost), 0);
    }
    
    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost  // Actual ETH cost
    ) external override {
        (address user, uint256 maxTokenCost) = abi.decode(context, (address, uint256));
        
        // Calculate actual token cost
        uint256 tokenPrice = _getTokenPrice();
        uint256 actualTokenCost = actualGasCost * tokenPrice / 1e18;
        
        // Collect tokens from user
        token.transferFrom(user, address(this), actualTokenCost);
    }
}
```

---

## 6. Account Factory Pattern

Factories deploy smart accounts at deterministic CREATE2 addresses.

```solidity
// Factory: deploys smart accounts
contract SmartAccountFactory {
    function createAccount(
        address owner,
        uint256 salt
    ) external returns (address account) {
        // CREATE2: deterministic address
        bytes32 finalSalt = keccak256(abi.encode(owner, salt));
        
        // Deploy if not already exists
        address predictedAddress = _getAddress(owner, salt);
        if (predictedAddress.code.length > 0) {
            return predictedAddress;  // Already deployed
        }
        
        account = address(new SimpleSmartAccount{salt: finalSalt}(owner, ENTRY_POINT));
    }
    
    function getAddress(address owner, uint256 salt) public view returns (address) {
        return _getAddress(owner, salt);
    }
    
    function _getAddress(address owner, uint256 salt) internal view returns (address) {
        bytes32 finalSalt = keccak256(abi.encode(owner, salt));
        bytes memory initCode = abi.encodePacked(
            type(SimpleSmartAccount).creationCode,
            abi.encode(owner, ENTRY_POINT)
        );
        return Create2.computeAddress(finalSalt, keccak256(initCode));
    }
}
```

### CounterFactual Addresses (Key AA Feature)

```typescript
// Smart account exists at a deterministic address BEFORE deployment
// Send ETH/tokens to it before it's deployed — deploy lazily on first use

const factory = getContract({ address: FACTORY_ADDRESS, abi: factoryAbi, client });

// Compute address without deploying
const accountAddress = await factory.read.getAddress([userPublicKey, 0n]);
console.log("Your account (not yet deployed):", accountAddress);

// User can receive ETH/tokens at this address immediately
// Account deploys automatically when user sends first UserOperation
// The initCode field in UserOperation triggers factory.createAccount()
```

---

## 7. Passkey Integration

Passkeys (WebAuthn) allow Face ID / Touch ID signing instead of private keys.

```typescript
import { createSmartAccountClient } from "permissionless";
import { toPasskeyValidator } from "@zerodev/passkey";

// Register passkey (happens once)
async function registerPasskey(username: string) {
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "Blue Agent", id: window.location.hostname },
      user: {
        id: new TextEncoder().encode(username),
        name: username,
        displayName: username,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" },   // ES256 (P-256)
        { alg: -257, type: "public-key" }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",  // Device biometric
        requireResidentKey: true,
        userVerification: "required",
      },
    },
  });
  
  // Store credentialId → link to smart account
  return credential;
}

// Sign UserOperation with passkey (Face ID prompt)
async function signWithPasskey(
  userOpHash: Hex,
  credentialId: string
): Promise<Hex> {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: hexToBytes(userOpHash),
      allowCredentials: [{ id: base64ToBytes(credentialId), type: "public-key" }],
      userVerification: "required",
    },
  });
  
  // Pack WebAuthn response into signature format expected by smart account
  return packWebAuthnSignature(assertion);
}
```

---

## 8. Session Keys

Session keys allow dApps to sign transactions without prompting the user every time.

```solidity
// Session key: limited-permission temporary signer
contract SessionKeyModule {
    struct SessionKey {
        address key;
        uint256 validUntil;
        uint256 spendLimit;     // Max ETH per transaction
        address[] allowedTargets;  // Which contracts it can call
        bool active;
    }
    
    mapping(address => mapping(address => SessionKey)) public sessionKeys;
    // account → sessionKey → permissions
    
    // User sets session key once (via biometric/main key)
    function addSessionKey(
        address sessionKey,
        uint256 validUntil,
        uint256 spendLimit,
        address[] calldata allowedTargets
    ) external {
        sessionKeys[msg.sender][sessionKey] = SessionKey({
            key: sessionKey,
            validUntil: validUntil,
            spendLimit: spendLimit,
            allowedTargets: allowedTargets,
            active: true,
        });
    }
    
    // validateUserOp checks if signature is from session key with valid permissions
    function validateSessionKey(
        UserOperation calldata userOp,
        SessionKey memory session
    ) internal view returns (bool) {
        require(session.active, "Session key inactive");
        require(block.timestamp <= session.validUntil, "Session key expired");
        require(userOp.callData.length > 0, "No calldata");
        
        // Decode target from calldata (execute(address,uint256,bytes))
        (address target, uint256 value,) = abi.decode(
            userOp.callData[4:],
            (address, uint256, bytes)
        );
        
        require(value <= session.spendLimit, "Exceeds spend limit");
        require(_isAllowed(target, session.allowedTargets), "Target not allowed");
        
        return true;
    }
}
```

---

## 9. Bundler Economics

```
Bundler profitability:
  Revenue: gas refund from EntryPoint × priority fee
  Cost: gas to submit handleOps transaction
  
Bundler simulation:
  Must simulate each UserOp to estimate gas
  If simulation fails → UserOp rejected (no cost)
  If onchain execution fails → bundler loses gas
  
  EntryPoint protects bundlers:
  - Simulation checks = onchain behavior (guaranteed by spec)
  - If account's validateUserOp passes simulation, it MUST pass onchain
  - Exception: time-based conditions (handled via validity windows)

Forbidden opcodes during validation:
  BLOCKHASH, NUMBER, TIMESTAMP, DIFFICULTY (block-dependent)
  SELFBALANCE, BALANCE (except sender's own balance)
  ORIGIN, GASPRICE
  
  Reason: These could cause simulation/execution divergence
  (different block → different result → bundler loses gas)

Storage access rules:
  Validation can only read:
  - Account's own storage
  - Paymaster's storage
  - Allowed associated storage
  
  Reason: Prevents DoS via storage changes between simulation and execution
```

---

## 10. Multi-Chain AA Patterns

```typescript
// Deploy same smart account address on all chains
// Using CREATE2 with same salt + same factory address

const FACTORY_ADDRESS = "0x...";  // Same on all chains (if factory deployed with same deployer)
const USER_SALT = 0n;

// Addresses are the same on Base, Optimism, Polygon, etc.
// if factory is deployed at same address on each chain

async function getAccountOnChain(
  chainId: number,
  ownerAddress: Address
): Promise<Address> {
  const factory = getContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    client: getClientForChain(chainId),
  });
  
  return factory.read.getAddress([ownerAddress, USER_SALT]);
}

// Cross-chain: same account address, different deployments
const baseAccount = await getAccountOnChain(8453, owner);
const optimismAccount = await getAccountOnChain(10, owner);
// baseAccount === optimismAccount (if factory is identical on both chains)
```

### Multi-Chain UserOperation Submission

```typescript
// Submit same intent on multiple chains simultaneously
async function multiChainExecute(
  intent: {
    target: Address;
    value: bigint;
    data: Hex;
  },
  chains: number[]
): Promise<string[]> {
  const userOps = await Promise.all(
    chains.map(async (chainId) => {
      const client = getBundlerClient(chainId);
      const account = await getSmartAccount(chainId, owner);
      
      return client.sendUserOperation({
        account,
        calls: [{ to: intent.target, value: intent.value, data: intent.data }],
      });
    })
  );
  
  return userOps;
}
```

---

## 11. Security Considerations

### validateUserOp Must Return Correctly

```solidity
// ❌ DANGER: Revert instead of returning SIG_VALIDATION_FAILED
function validateUserOp(...) external returns (uint256) {
    require(isValid, "invalid signature");  // ❌ Revert blocks the bundle
    return 0;
}

// ✅ Return validation failure code (allows EntryPoint to handle gracefully)
function validateUserOp(...) external returns (uint256) {
    if (!isValid) return SIG_VALIDATION_FAILED;  // ✅ Returns 1
    return 0;  // ✅ Returns 0 = success
}
```

### Replay Protection

```solidity
// EntryPoint handles nonces — but understand how:
// nonce = key (192 bits) | seq (64 bits)
// Most accounts use key=0 for sequential nonces
// key>0 enables parallel nonces (useful for session keys)

function validateUserOp(UserOperation calldata userOp, ...) external {
    // Don't implement your own nonce — EntryPoint does it
    // Just validate the signature includes the nonce
    bytes32 hash = getUserOpHash(userOp);  // Includes nonce
    // ...
}
```

### Front-Running During initCode Deployment

```
Risk: If initCode is included, attacker could front-run deployment
      with different constructor args (different owner)
      
Reality: CREATE2 address is deterministic — wrong args = different address
         EntryPoint verifies deployed address matches sender field
         
Mitigation: Already handled by spec. No extra protection needed.
```

---

## Common Mistakes

❌ **Not handling initCode correctly** — forget to include factory call for new accounts → UserOp reverts.

❌ **Using block-dependent values in validateUserOp** — forbidden ops cause bundler to drop your UserOp.

❌ **Paymaster doesn't deposit enough to EntryPoint** — `paymaster.deposit()` must cover all user gas.

❌ **Session key with no expiry** — leaked session key = permanent account compromise.

❌ **Calling EntryPoint functions from wrong context** — `validateUserOp` must only be called by EntryPoint.

✅ **Use established AA frameworks** — ZeroDev, Biconomy, Alchemy Account Kit, Safe{Core} for production.

✅ **Test on Base Sepolia with real bundler** — simulation passes ≠ bundler acceptance (storage rules differ).

✅ **Handle UserOp receipt correctly** — bundler returns userOpHash, need to wait for on-chain confirmation.

---

## Resources

- ERC-4337 spec: `eips.ethereum.org/EIPS/eip-4337`
- EntryPoint v0.7: `0x0000000071727De22E5E9d8BAf0edAc6f37da032` (verify on Basescan)
- ZeroDev (AA framework): `docs.zerodev.app`
- Biconomy: `docs.biconomy.io`
- Alchemy Account Kit: `accountkit.alchemy.com`
- Coinbase Smart Wallet: `docs.cloud.coinbase.com/smart-wallet`
- permissionless.js: `npmjs.com/package/permissionless`
- Related skills: `base-account-integration.md`, `agent-wallet-security.md`
- CLI: `blue build "gasless dApp on Base"`, `blue audit --check account-abstraction`
