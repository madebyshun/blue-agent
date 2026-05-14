# Solidity Security Patterns

Grounding for `blue audit` command — comprehensive security checklist for Solidity smart contracts on Base.

Common vulnerabilities, exploit patterns, secure coding practices, and real hack breakdowns.

---

## 1. Reentrancy Attacks

The most famous smart contract vulnerability. An external contract calls back into your contract before your state is updated.

### The Vulnerable Pattern

```solidity
// ❌ VULNERABLE: State update AFTER external call
contract VulnerableBank {
    mapping(address => uint256) public balances;

    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "Insufficient balance");

        // STEP 1: Send ETH (external call — attacker can re-enter here)
        (bool success,) = msg.sender.call{value: amount}("");
        require(success);

        // STEP 2: Update state (never reached if re-entered)
        balances[msg.sender] -= amount;  // ❌ Too late
    }
}

// Attack contract
contract Attacker {
    VulnerableBank target;

    function attack() external payable {
        target.deposit{value: 1 ether}();
        target.withdraw(1 ether);
    }

    receive() external payable {
        // Called during target.withdraw()
        // Balance not yet decremented → drain again
        if (address(target).balance >= 1 ether) {
            target.withdraw(1 ether);  // Recursive call
        }
    }
}
```

### The Secure Pattern — Checks-Effects-Interactions (CEI)

```solidity
// ✅ SECURE: State update BEFORE external call
contract SecureBank {
    mapping(address => uint256) public balances;

    function withdraw(uint256 amount) external {
        // CHECK: Validate
        require(balances[msg.sender] >= amount, "Insufficient balance");

        // EFFECT: Update state first
        balances[msg.sender] -= amount;  // ✅ Updated before call

        // INTERACT: Now make external call
        (bool success,) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
    }
}
```

### ReentrancyGuard (OpenZeppelin)

```solidity
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract SafeContract is ReentrancyGuard {
    function withdraw(uint256 amount) external nonReentrant {
        // Even if attacker re-enters, nonReentrant reverts the second call
        balances[msg.sender] -= amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok);
    }
}
```

### Cross-Function Reentrancy

```solidity
// ❌ Attacker re-enters a DIFFERENT function
contract Vulnerable {
    uint256 public totalSupply;
    mapping(address => uint256) balances;

    function withdraw(uint256 amount) external {
        (bool ok,) = msg.sender.call{value: amount}("");  // attacker calls mint()
        require(ok);
        balances[msg.sender] -= amount;
    }

    function mint(uint256 amount) external {
        // Not protected — totalSupply inflated during withdraw
        totalSupply += amount;
        balances[msg.sender] += amount;
    }
}
// Fix: Apply ReentrancyGuard to BOTH functions
```

---

## 2. Integer Overflow / Underflow

**Solidity 0.8.0+:** Overflow/underflow reverts automatically. No SafeMath needed.

**Solidity <0.8.0:** Silent wrap-around. Always use SafeMath or upgrade.

```solidity
// Solidity 0.8+: This reverts automatically
uint256 x = type(uint256).max;
uint256 y = x + 1;  // ✅ Reverts with overflow

// ❌ DANGER: Using unchecked{} block opts out of protection
unchecked {
    uint256 y = x + 1;  // 0 — silent overflow! Only use when you've proven it's safe
}

// ✅ When unchecked is legitimate (gas optimization with proven bounds):
function sumArray(uint256[] memory arr) external pure returns (uint256 total) {
    for (uint256 i = 0; i < arr.length; ) {
        total += arr[i];
        unchecked { ++i; }  // Safe: i < 2^256 guaranteed by loop bounds
    }
}
```

### Fixed-Point Math Precision

```solidity
// ❌ Lose precision: divide before multiply
uint256 result = (amount / 100) * fee;  // Truncates

// ✅ Multiply before divide
uint256 result = (amount * fee) / 100;  // Preserves precision

// USDC has 6 decimals — be explicit
uint256 USDC_DECIMALS = 1e6;
uint256 usdcAmount = 100 * USDC_DECIMALS;  // $100 USDC

// ETH has 18 decimals
uint256 ETH_DECIMALS = 1e18;
uint256 ethAmount = 1 * ETH_DECIMALS;   // 1 ETH
```

---

## 3. External Call Risks

Calling external contracts is the #1 source of vulnerabilities. Every external call can:
- Revert (DoS)
- Execute arbitrary code (reentrancy)
- Consume all gas
- Return unexpected data

```solidity
// ❌ Return value ignored — silent failure
token.transfer(recipient, amount);  // ERC-20 can return false!

// ✅ Check return value
bool ok = token.transfer(recipient, amount);
require(ok, "Transfer failed");

// ✅ Better: Use SafeERC20 (handles non-standard tokens)
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

using SafeERC20 for IERC20;
token.safeTransfer(recipient, amount);  // Reverts on false or missing return

// ❌ Unbounded gas to external call
address(target).call{value: amount}("");  // Attacker contract can consume all gas

// ✅ Limit gas for simple sends
(bool ok,) = payable(recipient).call{value: amount, gas: 2300}("");
// Note: 2300 gas limit prevents re-entry but may break some smart wallets
// Use ReentrancyGuard instead for reliability
```

### Call vs DelegateCall

```solidity
// call: Executes in TARGET's context (target's storage, target's address)
(bool ok,) = target.call(data);

// delegatecall: Executes target's CODE in YOUR context (your storage, your address)
// ⚠️ DANGER: target contract can overwrite your storage
(bool ok,) = target.delegatecall(data);  // Only use with trusted, audited contracts

// ❌ NEVER delegatecall to user-supplied addresses
function execute(address target, bytes calldata data) external {
    target.delegatecall(data);  // ❌ Attacker can wipe your contract's storage
}
```

---

## 4. Timestamp Dependency

`block.timestamp` is controlled by the validator (within ~12 seconds). Never use it for:
- Randomness source
- Precise timing < 15 seconds
- Lottery draws
- High-stakes time windows

```solidity
// ❌ Manipulable timestamp usage
function canWithdraw() external view returns (bool) {
    return block.timestamp >= lockEnd;  // Validator can shift by 12s
}

// ❌ Randomness from timestamp (completely predictable)
uint256 random = uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender)));

// ✅ For randomness: Chainlink VRF
// ✅ For time windows > 15min: timestamp is fine with margin
// ✅ For game lotteries: commit-reveal scheme

// Safe use of timestamp (lock with >15min window)
uint256 LOCK_DURATION = 7 days;
mapping(address => uint256) lockStart;

function lock() external {
    lockStart[msg.sender] = block.timestamp;
}

function unlock() external {
    require(
        block.timestamp >= lockStart[msg.sender] + LOCK_DURATION,
        "Still locked"
    );  // ✅ 7 days >> 12s manipulation window
}
```

---

## 5. Storage Layout (Proxy Collisions)

Upgradeable proxies use delegatecall. The implementation's storage variables must align exactly with the proxy's storage layout, or they overwrite each other.

```solidity
// ❌ Storage collision: Proxy has _owner at slot 0
contract TransparentProxy {
    address _owner;  // slot 0

    // Delegates to implementation
    fallback() external payable {
        (bool ok,) = implementation.delegatecall(msg.data);
    }
}

// ❌ Implementation also tries to use slot 0
contract Implementation {
    address _token;  // slot 0 — OVERWRITES proxy's _owner!
}

// ✅ Use OpenZeppelin's storage gap pattern
contract ImplementationV1 {
    uint256 public value;          // slot 0
    address public admin;          // slot 1
    uint256[48] private __gap;     // slots 2-49 reserved for future variables
}

// ✅ Or use ERC-7201 namespaced storage
bytes32 private constant _SLOT = keccak256("myprotocol.main.storage");

struct Storage {
    uint256 value;
    address admin;
}

function _storage() private pure returns (Storage storage s) {
    bytes32 slot = _SLOT;
    assembly { s.slot := slot }
}
```

---

## 6. Access Control

```solidity
// ❌ No access control
function mint(address to, uint256 amount) external {
    _mint(to, amount);  // Anyone can mint!
}

// ✅ onlyOwner (Ownable)
import "@openzeppelin/contracts/access/Ownable2Step.sol";

contract MyToken is Ownable2Step {
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}

// Ownable2Step prevents accidental ownership transfer to wrong address
// transferOwnership() creates pending, acceptOwnership() confirms it

// ✅ Role-based access (AccessControl)
import "@openzeppelin/contracts/access/AccessControl.sol";

contract Protocol is AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);  // Admin can grant roles
        _grantRole(MINTER_ROLE, msg.sender);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }
}

// ❌ tx.origin instead of msg.sender
function onlyUser() external {
    require(tx.origin == owner);  // ❌ Phishing: attacker contract can trick owner
}

// ✅ Always use msg.sender
require(msg.sender == owner);
```

### Timelock for Admin Actions

```solidity
// Admin actions on mainnet should go through a timelock
// OpenZeppelin TimelockController: minimum 24-48h delay
// Gives community time to react to malicious upgrades

// Pattern:
// 1. Admin schedules action (stored onchain)
// 2. 48h delay enforced by contract
// 3. Anyone can verify the pending action
// 4. After delay, anyone can execute (trustless execution)
```

---

## 7. Input Validation

```solidity
// ❌ No validation — integer underflow, zero division, etc.
function divide(uint256 a, uint256 b) external pure returns (uint256) {
    return a / b;  // Panics on b=0 in Solidity 0.8+, but still bad UX
}

// ✅ Explicit validation with clear error messages
error InvalidAmount(uint256 amount);
error ZeroDivisor();

function divide(uint256 a, uint256 b) external pure returns (uint256) {
    if (b == 0) revert ZeroDivisor();
    return a / b;
}

function deposit(uint256 amount) external {
    if (amount == 0) revert InvalidAmount(amount);
    if (amount > MAX_DEPOSIT) revert InvalidAmount(amount);
    // ...
}

// ✅ Validate addresses
function setFeeRecipient(address recipient) external onlyOwner {
    require(recipient != address(0), "Zero address");
    feeRecipient = recipient;
}

// ✅ Validate array lengths
function batchTransfer(
    address[] calldata recipients,
    uint256[] calldata amounts
) external {
    require(recipients.length == amounts.length, "Length mismatch");
    require(recipients.length <= 200, "Too many recipients");  // Gas limit
}
```

---

## 8. State Machine Safety

Many contracts have implicit state machines. Invalid transitions cause exploits.

```solidity
// ❌ No state validation
enum Status { Pending, Active, Completed }

Status public status = Status.Pending;

function complete() external {
    status = Status.Completed;  // Can call from Pending directly — bad
}

// ✅ Explicit state guards
modifier onlyStatus(Status required) {
    require(status == required, "Invalid state");
    _;
}

function activate() external onlyOwner onlyStatus(Status.Pending) {
    status = Status.Active;
}

function complete() external onlyStatus(Status.Active) {
    status = Status.Completed;
}

// State transition diagram:
// Pending → (activate) → Active → (complete) → Completed
// Cannot skip states
```

---

## 9. Common Pitfalls

### Floating Pragma

```solidity
// ❌ Floating pragma — different compiler versions compile differently
pragma solidity ^0.8.0;

// ✅ Pinned pragma
pragma solidity 0.8.24;
```

### `selfdestruct` (deprecated but dangerous)

```solidity
// ❌ selfdestruct forces ETH into any contract, breaking balance assumptions
selfdestruct(payable(recipient));

// In Solidity 0.8.18+ (post-EIP-6049): selfdestruct deprecated
// Code still compiles but the opcode behavior changed
// Never use for forcing ETH — use pull-payment patterns instead
```

### Short-Circuit Logic Errors

```solidity
// ❌ Wrong operator — always passes OR check
require(role == ADMIN || role == USER);  // Fine
require(amount > 0 && amount < MAX);    // Fine

// ❌ Common mistake: OR when AND intended
require(a > 0 || b > 0);  // Passes when either is nonzero
// Should be: require(a > 0 && b > 0);  // Both must be nonzero
```

---

## 10. Real Hacks Breakdown

### The DAO Hack (2016) — $60M — Reentrancy

`withdraw()` sent ETH before updating balance. Attacker re-entered 50+ times. Led to the Ethereum/Ethereum Classic split.

**Lesson:** Always CEI. ReentrancyGuard on all value-moving functions.

### Poly Network (2021) — $611M — Access Control

`onlyOwner` was checked against a user-controlled parameter. Attacker set themselves as owner and drained cross-chain bridge.

**Lesson:** Access control must use `msg.sender`, not function parameters.

### Euler Finance (2023) — $197M — Logic Error

`donateToReserves` function allowed users to increase debt without providing collateral. Violated the protocol's accounting invariant.

**Lesson:** Every function must maintain all accounting invariants. Fuzz test invariants with Foundry.

### Curve (2023) — $62M — Compiler Bug

Vyper compiler bug in certain versions caused reentrancy guards to fail silently. READ-ONLY reentrancy exploited.

**Lesson:** Pin compiler versions. Don't trust that compiler protects you from logic errors.

### Checklist: Pre-Deployment

```
☐ ReentrancyGuard on all external value-moving functions
☐ CEI pattern verified line by line
☐ SafeERC20 for all ERC-20 interactions
☐ Ownable2Step (not plain Ownable) for ownership
☐ Role-based access for multi-party systems
☐ Storage gaps in upgradeable contracts
☐ Input validation with custom errors
☐ State machine guards on all state transitions
☐ Pragma pinned (not floating)
☐ No tx.origin for authorization
☐ No block.timestamp for randomness
☐ Fuzz tests for arithmetic with Foundry
☐ Fork test against Base mainnet
☐ External audit for contracts holding > $100K
```

---

## Resources

- OpenZeppelin Contracts: `docs.openzeppelin.com/contracts`
- Foundry testing: `book.getfoundry.sh`
- Slither (static analysis): `github.com/crytic/slither`
- Mythril (symbolic execution): `github.com/ConsenSysDiligence/mythril`
- Solodit (audit database): `solodit.xyz`
- Related skills: `base-security.md`, `oracle-design-guide.md`
- CLI: `blue audit "contract code"`, `blue audit 0xaddress`
