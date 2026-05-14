# Privacy Transactions Guide

Grounding for `blue build` (privacy-preserving apps) and `blue audit` (privacy risk review).

ZK proofs, private pools, mixer mechanics, compliance patterns, and privacy on Base.

---

## 1. Privacy on Public Blockchains

By default, all blockchain transactions are public: sender, receiver, amount, and data are visible.

```
Public blockchain reality:
  Your address → all transactions visible (balance, history, interactions)
  Smart contract interactions → all arguments visible
  Token approvals → visible (what you approved, how much)
  
Privacy problems:
  1. Business confidentiality: competitor sees your supplier payments
  2. Personal safety: holding large amounts → known target
  3. Competitive DeFi: arbitrage bots front-run your visible strategy
  4. Negotiation leverage: counterparty knows your balance before deal
  
Privacy on Base:
  Same transparency as Ethereum (public L2)
  All data posted to Ethereum as calldata (publicly readable)
  Sequencer sees all transactions before inclusion
```

---

## 2. Zero-Knowledge Proof Fundamentals

ZK proofs let you prove knowledge of a secret without revealing it.

### ZK Proof Properties

```
Zero-knowledge: Verifier learns nothing except "the statement is true"
Soundness: Cheating prover can't convince verifier of false statement
Completeness: Honest prover can always convince verifier of true statement

Example:
  Statement: "I know a private key for an address with balance > 0"
  Proof: ZK proof that proves this WITHOUT revealing the address or key
  Verifier: Smart contract verifies the proof on-chain
```

### ZK Proof Systems (Practical)

```
Groth16:
  - Fast verification (~250k gas)
  - Requires trusted setup ceremony (toxic waste risk)
  - Fixed circuit: one proof system per application
  - Used by: Tornado Cash (original)

PLONK:
  - Universal trusted setup (reusable across applications)
  - Slightly larger proofs than Groth16
  - More flexible: programmable constraints
  - Used by: many new ZK projects

STARKs:
  - No trusted setup (quantum-resistant)
  - Larger proofs (~50KB vs ~200 bytes for Groth16)
  - Higher verification gas
  - Used by: StarkNet, Polygon Miden
  
For Base applications: Groth16 or PLONK recommended (lower gas)
```

---

## 3. Commitment-Nullifier Pattern

The core primitive for private transactions (used by Tornado Cash, Aztec, etc.).

```
Core idea:
  Commitment: Hash(secret + nullifier) → stored on-chain (public)
  Nullifier:  Hash(secret) → revealed when spending (proves ownership without linking)
  
Flow:
  DEPOSIT:
    1. Generate secret (random) + nullifier (hash of secret)
    2. Compute commitment = hash(secret, nullifier)
    3. Send tokens + commitment to contract (public: amount + commitment)
    4. Keep secret private (never reveal)
  
  WITHDRAW (different address, different time):
    1. Generate ZK proof: "I know secret s.t. hash(s, nullifier) is in the commitments tree"
    2. Reveal nullifier (not the secret)
    3. Contract checks: nullifier not used before, proof is valid
    4. Send tokens to any address
    
  Result:
    Deposit and withdrawal are NOT linkable (no shared secret revealed)
    Double-spend prevented (nullifier can only be used once)
```

---

## 4. Building a Simple Commitment Scheme

```solidity
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract PrivatePool {
    // Merkle tree of commitments
    uint256 public constant TREE_DEPTH = 20;  // Supports 2^20 = 1M deposits
    bytes32[] public tree;
    uint256 public nextLeafIndex;
    
    // Used nullifiers (prevent double-spend)
    mapping(bytes32 => bool) public nullifiers;
    
    // Fixed deposit amount (all deposits same size → prevents amount tracing)
    uint256 public constant DENOMINATION = 1 ether;
    
    // ZK verifier contract (generated from your circuit)
    IVerifier public verifier;
    
    event Deposit(bytes32 indexed commitment, uint256 leafIndex, uint256 timestamp);
    event Withdrawal(address to, bytes32 nullifier);
    
    // Deposit: commit funds to pool
    function deposit(bytes32 commitment) external payable {
        require(msg.value == DENOMINATION, "Wrong denomination");
        require(nextLeafIndex < 2**TREE_DEPTH, "Tree full");
        
        uint256 leafIndex = nextLeafIndex;
        _insertLeaf(commitment);
        nextLeafIndex++;
        
        emit Deposit(commitment, leafIndex, block.timestamp);
    }
    
    // Withdraw: prove ownership without revealing which deposit is yours
    function withdraw(
        bytes calldata proof,
        bytes32 root,           // Merkle root (public input)
        bytes32 nullifierHash,  // H(secret) — proves ownership, not identity
        address payable recipient,
        address relayer,
        uint256 fee
    ) external {
        require(!nullifiers[nullifierHash], "Note already spent");
        require(isKnownRoot(root), "Unknown root");
        require(fee < DENOMINATION, "Fee too high");
        
        // Verify ZK proof
        // Proof proves: "I know secret s.t. H(H(secret), secret) is in the tree at root"
        require(
            verifier.verifyProof(
                proof,
                [uint256(root), uint256(nullifierHash), uint256(uint160(recipient)), fee]
            ),
            "Invalid ZK proof"
        );
        
        // Mark nullifier as used (prevent double-spend)
        nullifiers[nullifierHash] = true;
        
        // Send funds
        uint256 refund = DENOMINATION - fee;
        recipient.transfer(refund);
        if (fee > 0) payable(relayer).transfer(fee);
        
        emit Withdrawal(recipient, nullifierHash);
    }
    
    function _insertLeaf(bytes32 leaf) internal {
        // Insert into Merkle tree
        // (Implementation: incremental Merkle tree with stored sibling nodes)
    }
    
    function isKnownRoot(bytes32 root) public view returns (bool) {
        // Accept any recent Merkle root (tree grows over time)
        // Store last N roots to allow in-flight proofs
    }
}
```

---

## 5. Circom Circuit (ZK Proof Generation)

```javascript
// Circom: circuit language for ZK proofs
// This circuit proves: "I know secret that hashes to a commitment in the tree"

pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/merkleTree.circom";

template Withdrawal(levels) {
    // Private inputs (hidden from verifier)
    signal input secret;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    
    // Public inputs (visible to verifier/contract)
    signal input root;
    signal input nullifierHash;
    signal input recipient;
    signal input fee;
    
    // 1. Compute nullifier hash from secret
    component nullifier = Poseidon(1);
    nullifier.inputs[0] <== secret;
    nullifierHash === nullifier.out;
    
    // 2. Compute commitment from secret
    component commitment = Poseidon(2);
    commitment.inputs[0] <== nullifier.out;
    commitment.inputs[1] <== secret;
    
    // 3. Verify commitment is in Merkle tree
    component tree = MerkleTreeChecker(levels);
    tree.leaf <== commitment.out;
    tree.root <== root;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }
    
    // 4. Validate public inputs (prevent tampering)
    signal recipientSquare;
    recipientSquare <== recipient * recipient;
    signal feeSquare;
    feeSquare <== fee * fee;
}

component main {public [root, nullifierHash, recipient, fee]} = Withdrawal(20);
```

### Generating Proof Off-Chain

```typescript
import { groth16 } from "snarkjs";
import { buildPoseidon } from "circomlibjs";

async function generateWithdrawalProof(
  secret: bigint,
  merkleProof: { pathElements: bigint[]; pathIndices: number[] },
  merkleRoot: bigint,
  recipient: string,
  fee: bigint
): Promise<{ proof: string; publicSignals: string[] }> {
  const poseidon = await buildPoseidon();
  
  // Compute nullifier
  const nullifierHash = poseidon.F.toString(poseidon([secret]));
  
  // Prepare witness inputs
  const input = {
    secret: secret.toString(),
    pathElements: merkleProof.pathElements.map(e => e.toString()),
    pathIndices: merkleProof.pathIndices.map(i => i.toString()),
    root: merkleRoot.toString(),
    nullifierHash,
    recipient: BigInt(recipient).toString(),
    fee: fee.toString(),
  };
  
  // Generate ZK proof (takes 1-30 seconds depending on circuit size)
  const { proof, publicSignals } = await groth16.fullProve(
    input,
    "withdrawal.wasm",   // Compiled circuit
    "withdrawal.zkey",   // Proving key (from trusted setup)
  );
  
  return {
    proof: groth16.exportSolidityCallData(proof, publicSignals),
    publicSignals,
  };
}
```

---

## 6. Relayer Pattern (True Untraceability)

Problem: To call withdraw(), user must pay gas — revealing their new address's first transaction came from the private pool.

Solution: Relayers submit withdrawal on behalf of user, take a fee.

```
Without relayer:
  User's new address → calls withdraw() → pays gas from somewhere
  Where did gas come from? Traces back to user.
  
With relayer:
  User: generates proof, signs withdrawal request (off-chain)
  Relayer: submits proof on-chain, pays gas, receives fee from withdrawal
  
  New address never touched ETH before withdrawal
  No connection between deposit wallet and withdrawal wallet
```

```typescript
// Relayer service (off-chain server)
import express from "express";
const app = express();

app.post("/relay", async (req, res) => {
  const { proof, root, nullifierHash, recipient, fee } = req.body;
  
  // Verify proof is valid before spending gas
  const isValid = await verifyProofOffchain(proof, root, nullifierHash, recipient, fee);
  if (!isValid) return res.status(400).json({ error: "Invalid proof" });
  
  // Check fee is acceptable
  const minFee = await calculateMinFee();
  if (BigInt(fee) < minFee) return res.status(400).json({ error: "Fee too low" });
  
  // Submit transaction
  const tx = await contract.withdraw(proof, root, nullifierHash, recipient, relayerAddress, fee);
  await tx.wait();
  
  res.json({ txHash: tx.hash });
});
```

---

## 7. Compliance Patterns

Privacy doesn't mean illegal. Compliance mechanisms for regulated environments.

### Viewing Keys

```
A viewing key lets a designated party (e.g., regulator, auditor) see your transaction history.
The holder of the viewing key can decrypt your transactions — no ZK needed.
You share it voluntarily or under legal obligation.

Implementation:
  Encrypt transaction details with user's public key
  Store encrypted data on-chain (cheap on Base) or IPFS
  Viewing key = private key to decrypt it
```

### Compliance Blocklist

```solidity
// Sanctioned addresses cannot deposit
contract CompliancePool {
    address public complianceOracle;  // Chainalysis or similar
    
    function deposit(bytes32 commitment) external payable {
        // Check if sender is sanctioned
        require(
            !IComplianceOracle(complianceOracle).isSanctioned(msg.sender),
            "Sanctioned address"
        );
        _deposit(commitment);
    }
    
    // Regulator can add addresses to blocklist
    function updateOracle(address newOracle) external onlyOwner {
        complianceOracle = newOracle;
    }
}
```

### Travel Rule Compliance

```
FATF Travel Rule: financial institutions must share sender/receiver info for transactions > $1,000
Most DeFi protocols can't comply automatically.

Patterns for compliance-aware privacy:
  1. KYC pool: only verified users can deposit (permissioned privacy)
  2. Viewing key disclosure: users can prove transaction history on demand
  3. Amount thresholds: full privacy < $1K, KYC required above
```

---

## 8. Privacy Levels by Tool

| Tool | Privacy Level | Mechanism | Compliance | Status |
|---|---|---|---|---|
| Tornado Cash | High | ZK commitments | None (OFAC sanctioned) | Sanctions risk |
| Railgun | High | ZK (Grail protocol) | Viewing keys | Active |
| Aztec Network | High | Full ZK L2 | Private to public bridge | Not on Base |
| Penumbra | High | ZK (Cosmos) | Viewing keys | Cosmos only |
| Zcash shielded | High | ZK (Sapling) | Viewing keys | ZEC chain only |
| Privacy pools | Medium | ZK + compliance sets | Allowlists | Emerging |
| Simple mixing | Low | Time delays + amounts | None | Ineffective |

**For Base builders:** Railgun is currently the most production-ready privacy layer on EVM chains.

---

## 9. On-Chain Data Minimization

Even without ZK proofs, minimize what's revealed.

### Stealth Addresses

```
Problem: Sending to a known address reveals both parties.
Solution: Ephemeral recipient address per transaction.

ERC-5564 Stealth Addresses:
  Recipient publishes: spending key + viewing key (once, on-chain registry)
  Sender: generates ephemeral address, sends to it
  Recipient: scans all stealth transactions, finds theirs
  Third party: cannot link stealth address to recipient
```

```solidity
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract StealthRegistry {
    // User registers their stealth meta-address
    mapping(address => bytes) public stealthMetaAddress;
    
    function registerMetaAddress(bytes calldata metaAddress) external {
        stealthMetaAddress[msg.sender] = metaAddress;
        emit MetaAddressSet(msg.sender, metaAddress);
    }
}

// Off-chain: sender computes stealth address for recipient
function computeStealthAddress(
  recipientMetaAddress: Hex,  // From registry
  ephemeralPrivateKey: Hex
): { stealthAddress: Address; announcement: Hex } {
  // ERC-5564 computation
  // ...
}
```

### Commit-Then-Reveal for Auction Bids

```solidity
// Sealed bid auction: hide bids until reveal phase

contract SealedBidAuction {
    mapping(address => bytes32) public commitments;
    uint256 public commitDeadline;
    uint256 public revealDeadline;
    
    // Phase 1: Commit bid (hidden)
    function commit(bytes32 commitment) external {
        require(block.timestamp < commitDeadline, "Commitment phase over");
        commitments[msg.sender] = commitment;
    }
    
    // Phase 2: Reveal bid
    function reveal(uint256 bidAmount, bytes32 salt) external {
        require(block.timestamp >= commitDeadline, "Still in commit phase");
        require(block.timestamp < revealDeadline, "Reveal phase over");
        
        bytes32 commitment = keccak256(abi.encodePacked(bidAmount, salt, msg.sender));
        require(commitments[msg.sender] == commitment, "Commitment mismatch");
        
        _processBid(msg.sender, bidAmount);
    }
}
```

---

## 10. Privacy Risk in Smart Contracts

### Information Leakage Patterns

```solidity
// ❌ LEAKS: Transaction amount reveals strategy
function swap(uint256 exactAmountIn) external {
    // Large round numbers ($100K, $500K) identify whale wallets
}

// ❌ LEAKS: Timing reveals correlation
// If users always interact at same time → correlatable

// ❌ LEAKS: Gas usage reveals computation
// Different code paths use different gas → reveals which branch executed

// ❌ LEAKS: Function selector visible
// Anyone can see which function you called (even if args are encrypted)

// ✅ MITIGATIONS:
// - Fixed denomination amounts (all deposits same size)
// - Time delays between deposit and withdrawal
// - Relayers to hide gas payment source
// - Padding arguments to same size
```

---

## Common Mistakes

❌ **Using Tornado Cash contracts** — OFAC sanctioned. Interacting with sanctioned contracts is illegal in many jurisdictions.

❌ **Building privacy without compliance mechanism** — without viewing keys or KYC, can't serve regulated users.

❌ **Weak ZK circuit constraints** — missing constraints = proof of false statement accepted. Get circuit audited.

❌ **Reusing nullifiers** — if nullifier revealed early, attacker can spend before you. Keep secret until withdrawal.

❌ **Trusted setup without ceremony** — if toxic waste from trusted setup is known, all proofs can be faked.

✅ **Use Railgun for production privacy on EVM** — audited, has viewing keys, OFAC compliant approach.

✅ **Design for compliance** — viewing keys + blocklists are needed for institutional adoption.

✅ **Fixed denominations** — variable amounts make correlation attacks trivial.

---

## Resources

- Railgun: `railgun.org`
- Privacy Pools (Vitalik's research): `0xbow.io`
- Circom (ZK circuits): `docs.circom.io`
- SnarkJS: `github.com/iden3/snarkjs`
- ERC-5564 (stealth addresses): `eips.ethereum.org/EIPS/eip-5564`
- ZK learning: `learn.0xparc.org`
- Related skills: `agent-wallet-security.md`, `solidity-security-patterns.md`
- CLI: `blue build "privacy-preserving app on Base"`, `blue audit --check privacy-risk`
