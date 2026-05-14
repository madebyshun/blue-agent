# Governance & DAO Patterns

Grounding for `blue build` (DAO setup, governance tokens) and `blue audit` (governance attack vectors).

On-chain voting, proposal lifecycle, timelock delays, treasury management, and governance attack mitigations.

---

## 1. Governance Models

### Token-Weighted Voting

```
Most common model. Votes = tokens held (or locked).

Mechanism:
  1. Token holders propose changes
  2. Community votes with token weight
  3. Majority (or quorum) determines outcome
  4. Approved proposal queued in timelock
  5. Executed after delay

Pros: Simple, Sybil-resistant (weighted by economic stake)
Cons: Whale dominance, plutocracy, voter apathy, low participation

Example: Compound COMP, Uniswap UNI, Aave AAVE governance
```

### Vote-Escrowed Governance (ve)

```
Lock tokens for vote power. Longer lock = more votes.

Mechanism:
  Lock 1,000 TOKEN for 4 years → 1,000 veTOKEN (max voting power)
  Lock 1,000 TOKEN for 1 year → 250 veTOKEN
  
Benefits:
  Aligns voters with long-term protocol success
  Reduces governance attacks (attacker must lock capital)
  
Examples: Curve veCRV, Aerodrome veAERO, Frax

On Base: Aerodrome uses this for gauge voting
```

### Optimistic Governance

```
Transactions auto-execute unless vetoed.

Mechanism:
  Proposer submits transaction with timelock
  Anyone can veto during challenge period
  After period: auto-execute if no veto
  
Benefit: Lower friction for routine operations
Risk: Requires active community monitoring
Mitigation: Guardian multisig can veto instantly
```

---

## 2. Governor + Timelock Architecture (OpenZeppelin)

Standard production governance stack.

### Governance Token (ERC20Votes)

```solidity
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

// Governance token with delegation support
contract GovernanceToken is ERC20Votes, ERC20Permit {
    constructor(string memory name, string memory symbol)
        ERC20(name, symbol)
        ERC20Permit(name)
    {
        // Mint initial supply to treasury/team
        _mint(msg.sender, 100_000_000 * 10**18);  // 100M tokens
    }
    
    // ✅ Must override for OZ compatibility
    function _afterTokenTransfer(
        address from, address to, uint256 amount
    ) internal override(ERC20, ERC20Votes) {
        super._afterTokenTransfer(from, to, amount);
    }
    
    function _mint(address to, uint256 amount) internal override(ERC20, ERC20Votes) {
        super._mint(to, amount);
    }
    
    function _burn(address from, uint256 amount) internal override(ERC20, ERC20Votes) {
        super._burn(from, amount);
    }
}

// ⚠️ IMPORTANT: Votes use snapshots — tokens must be delegated
// Users must call delegate(self) or delegate(delegatee) to activate voting power
// Undelegated tokens have ZERO voting power
```

### Governor Contract

```solidity
import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";

contract MyGovernor is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl
{
    constructor(IVotes _token, TimelockController _timelock)
        Governor("MyDAO Governor")
        GovernorSettings(
            1,          // Voting delay: 1 block (~2 seconds on Base)
            50400,      // Voting period: 50400 blocks (~28 hours on Base)
            100_000e18  // Proposal threshold: 100K tokens to propose
        )
        GovernorVotes(_token)
        GovernorVotesQuorumFraction(4)  // 4% of total supply needed for quorum
        GovernorTimelockControl(_timelock)
    {}
    
    // Required overrides
    function proposalThreshold() public view override(Governor, GovernorSettings)
        returns (uint256) { return super.proposalThreshold(); }
    
    function quorum(uint256 blockNumber) public view override(IGovernor, GovernorVotesQuorumFraction)
        returns (uint256) { return super.quorum(blockNumber); }
    
    function state(uint256 proposalId) public view override(Governor, GovernorTimelockControl)
        returns (ProposalState) { return super.state(proposalId); }
    
    function _execute(uint256 proposalId, address[] memory targets, uint256[] memory values,
        bytes[] memory calldatas, bytes32 descriptionHash)
        internal override(Governor, GovernorTimelockControl) {
        super._execute(proposalId, targets, values, calldatas, descriptionHash);
    }
    
    function _cancel(address[] memory targets, uint256[] memory values,
        bytes[] memory calldatas, bytes32 descriptionHash)
        internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }
    
    function _executor() internal view override(Governor, GovernorTimelockControl)
        returns (address) { return super._executor(); }
    
    function supportsInterface(bytes4 interfaceId)
        public view override(Governor, GovernorTimelockControl)
        returns (bool) { return super.supportsInterface(interfaceId); }
}
```

### Timelock Controller

```solidity
import "@openzeppelin/contracts/governance/TimelockController.sol";

// Deploy timelock with 2-day delay
address[] memory proposers = new address[](1);
proposers[0] = address(governor);  // Only governor can queue

address[] memory executors = new address[](1);
executors[0] = address(0);  // Anyone can execute after delay

TimelockController timelock = new TimelockController(
    2 days,     // Minimum delay between queue and execute
    proposers,  // Who can queue transactions
    executors,  // Who can execute (address(0) = anyone)
    msg.sender  // Admin (give to multisig, then renounce)
);

// Critical: after setup, timelock should govern itself
// Transfer all admin/ownership to timelock
myProtocol.transferOwnership(address(timelock));
```

---

## 3. Proposal Lifecycle

```typescript
import { Contract, parseEther } from "ethers";

// 1. CREATE PROPOSAL
async function createProposal(
  governor: Contract,
  targetContract: string,
  calldata: string,
  description: string
): Promise<bigint> {
  const tx = await governor.propose(
    [targetContract],              // targets
    [0n],                          // values (ETH amounts)
    [calldata],                    // calldatas (encoded function calls)
    description                    // Human-readable description
  );
  
  const receipt = await tx.wait();
  const event = receipt.logs.find((log) => log.eventName === "ProposalCreated");
  const proposalId = event.args.proposalId;
  
  console.log("Proposal ID:", proposalId);
  return proposalId;
}

// 2. VOTE (after voting delay)
async function vote(
  governor: Contract,
  proposalId: bigint,
  support: 0 | 1 | 2  // 0=Against, 1=For, 2=Abstain
): Promise<void> {
  const tx = await governor.castVoteWithReason(
    proposalId,
    support,
    "Supporting for the security improvements"
  );
  await tx.wait();
}

// 3. QUEUE (after voting period, if passed)
async function queue(governor: Contract, proposalId: bigint): Promise<void> {
  const tx = await governor.queue(
    [targetContract], [0n], [calldata], descriptionHash
  );
  await tx.wait();
}

// 4. EXECUTE (after timelock delay)
async function execute(governor: Contract): Promise<void> {
  const tx = await governor.execute(
    [targetContract], [0n], [calldata], descriptionHash
  );
  await tx.wait();
}
```

---

## 4. Governance Attack Vectors

### Flash Loan Governance Attack

```
Attack:
  1. Borrow 10M tokens via flash loan (no lock-up needed)
  2. Delegate votes to self in same tx
  3. Create malicious proposal (or vote on existing)
  4. Repay flash loan

Defense:
  ✅ Snapshot votes at proposal creation block — not current block
     OZ Governor uses block snapshots automatically
  ✅ Voting delay: even if you get votes now, proposal was already snapshot
  ✅ Proposal threshold: need sustained token holdings to propose
```

### Governance Capture (Whale Accumulation)

```
Attack:
  Attacker slowly accumulates 51% of governance tokens
  Passes malicious proposal (drain treasury, mint tokens)
  
Defense:
  ✅ Timelock: community can react during delay
  ✅ Guardian multisig: can veto malicious proposals
  ✅ Quorum: prevents passing proposals with low participation
  ✅ Vote cap: max N% of supply counts as single voter's votes
  ✅ Delegated voting: lets passive holders empower active delegates
```

### Short-Voting-Period Attack

```
Attack:
  Whale passes proposal during low-activity period
  (e.g., holiday, weekend at 3am)
  
Defense:
  ✅ Long voting period: 3-7 days minimum
  ✅ Alerts: governance monitoring tools (Tally, Boardroom)
  ✅ Quorum: min % of supply must participate
```

---

## 5. Treasury Management

### On-Chain Treasury Structure

```solidity
// DAO treasury controlled by governance
contract DAOTreasury {
    address public governance;  // TimelockController address
    
    modifier onlyGovernance() {
        require(msg.sender == governance, "Not governance");
        _;
    }
    
    // Governance-approved transfers
    function transfer(
        address token,
        address recipient,
        uint256 amount
    ) external onlyGovernance {
        if (token == address(0)) {
            payable(recipient).transfer(amount);
        } else {
            IERC20(token).transfer(recipient, amount);
        }
    }
    
    // Governance-approved contract calls (e.g., DeFi interactions)
    function execute(
        address target,
        bytes calldata data
    ) external onlyGovernance returns (bytes memory) {
        (bool success, bytes memory result) = target.call(data);
        require(success, "Treasury: execution failed");
        return result;
    }
    
    receive() external payable {}
}
```

### Treasury Allocation Framework

```
Recommended DAO treasury allocation:
  
  Reserves (40–60%):
    Stable assets: USDC, USDT
    Purpose: Runway, payroll, operating costs
    
  Protocol assets (20–30%):
    Native token: liquidity support
    ETH: gas fees, DeFi operations
    
  Growth capital (10–20%):
    Strategic investments in ecosystem projects
    LP positions for protocol tokens
    
  Emergency fund (5–10%):
    Liquid assets for immediate use
    Separate from main treasury
    
Min runway: 18-24 months at current burn rate
```

---

## 6. Snapshot (Off-Chain Voting)

For lightweight governance without gas costs.

```typescript
import { Snapshot } from "@snapshot-labs/snapshot.js";

const client = new Snapshot.Client712("https://hub.snapshot.org");
const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
const [account] = await web3Provider.listAccounts();

// Create a proposal on Snapshot
const receipt = await client.proposal(web3Provider, account, {
  space: "my-dao.eth",           // Your ENS space
  type: "single-choice",
  title: "Proposal: Increase protocol fee to 0.1%",
  body: "# Background\n\n...",   // Markdown description
  discussion: "https://forum.myprotocol.xyz/t/fee-increase/123",
  choices: ["For", "Against", "Abstain"],
  start: Math.floor(Date.now() / 1000),
  end: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,  // 7 days
  snapshot: await web3Provider.getBlockNumber(),
  plugins: JSON.stringify({}),
  app: "my-dao",
});

console.log("Proposal ID:", receipt.id);
```

### Snapshot + Timelock Hybrid

```
Common pattern:
  1. Off-chain Snapshot vote (free, high participation)
  2. Multi-sig executes winning proposal (trusted execution)
  3. Timelock on multi-sig (24-48h delay for community reaction)
  
Full decentralization path:
  Phase 1: Snapshot + multi-sig (launch)
  Phase 2: On-chain governor + timelock (growth)
  Phase 3: Optimistic governance (mature protocol)
```

---

## 7. Delegation

Most governance tokens support delegation — passive holders can delegate votes to active participants.

```solidity
// Users call this to activate voting power
// Without delegation, tokens have ZERO voting power in OZ Governor

// Self-delegate (activate your own votes)
governanceToken.delegate(msg.sender);

// Delegate to community representative
governanceToken.delegate(communityRepAddress);

// Check current delegate
address myDelegate = governanceToken.delegates(myAddress);

// Check current voting power of an address
uint256 votes = governanceToken.getVotes(delegateAddress);

// Historical voting power (for proposal snapshot)
uint256 votesAtBlock = governanceToken.getPastVotes(
    delegateAddress,
    proposalSnapshotBlock
);
```

---

## 8. Governance Configuration Reference

| Parameter | Conservative | Standard | Aggressive |
|---|---|---|---|
| Voting delay | 7 days | 2 days | 1 day |
| Voting period | 14 days | 7 days | 3 days |
| Timelock delay | 7 days | 48 hours | 24 hours |
| Proposal threshold | 1% of supply | 0.5% | 0.1% |
| Quorum | 10% | 4% | 1% |
| Guardian | 5-of-9 multisig | 3-of-5 | None |

**For launch:** Use conservative settings. Easier to relax parameters later than tighten them.

---

## 9. DAO Tooling Ecosystem

```
Voting interfaces:
  Tally:      tally.xyz — On-chain governor UI
  Boardroom:  boardroom.info — Multi-protocol dashboard
  Snapshot:   snapshot.org — Off-chain voting

Forum and discussion:
  Discourse:  forum.yourprotocol.xyz (host your own)
  Common:     common.xyz — structured governance discussions

Treasury management:
  Safe{Wallet}: app.safe.global — multi-sig treasury
  Parcel:       parcelx.io — payroll + vendor payments
  Utopia:       utopiafinance.io — DAO ops + payments

Monitoring:
  OpenZeppelin Defender: defender.openzeppelin.com
  Tenderly: tenderly.co — transaction simulation
```

---

## Common Mistakes

❌ **No timelock** — governance decision executed instantly = no community reaction time.

❌ **Single token = plutocracy** — large holders dominate. Consider vote caps or quadratic voting.

❌ **Short voting period (<48h)** — passes during off-hours; community can't respond.

❌ **No quorum** — proposal with 3 votes passes. Set minimum participation.

❌ **Admin key retained after launch** — centralized override defeats decentralization.

❌ **Not requiring delegation** — undelegated tokens have zero votes; warn users prominently.

✅ **Start with multi-sig + Snapshot** — lower risk during early protocol phase.

✅ **Graduated decentralization** — progressively extend timelock, lower thresholds as protocol matures.

✅ **Governance forum before on-chain** — social consensus before expensive on-chain proposals.

---

## Resources

- OpenZeppelin Governor: `docs.openzeppelin.com/contracts/5.x/governance`
- Tally: `docs.tally.xyz`
- Snapshot: `docs.snapshot.org`
- DAOstack: `daostack.io`
- Related skills: `multi-sig-wallet-security.md`, `solidity-security-patterns.md`
- CLI: `blue build "DAO governance on Base"`, `blue audit --check governance-attacks`
