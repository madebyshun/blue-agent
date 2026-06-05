// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * BlueMarketStaking — Stake $BLUEAGENT, earn Blue Chat credits + USDC yield
 *
 * Venice-inspired stake-to-earn model:
 *   Stake BLUEAGENT → credits accrue continuously (off-chain indexing)
 *   Stake BLUEAGENT → earn pro-rata USDC yield from x402 revenue
 *
 * Credit rate (matches Blue Chat tiers):
 *   500K BLUE staked  →  500  credits/day  (Starter)
 *   2M   BLUE staked  →  2000 credits/day  (Pro)
 *   10M  BLUE staked  →  ∞    credits/day  (Max cap applied off-chain)
 *
 * Rate math: CREDIT_RATE = 1e15
 *   credits = stakeAmount * CREDIT_RATE * elapsed / (1e36 * 86400)
 *   2M BLUE (2e24 wei) * 1e15 * 86400s / (1e36 * 86400) = 2000 ✓
 *
 * Unstake: 1-day cooldown. Credits stop accruing on requestUnstake().
 * USDC yield: backend distributes 20% of x402 revenue pro-rata to stakers.
 *
 * Tokens (Base mainnet):
 *   BLUE: 0xf895783b2931c919955e18b5e3343e7c7c456ba3
 *   USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract BlueMarketStaking {

    // ─── Constants ────────────────────────────────────────────────────────────

    /// credits per 1 BLUE per day, scaled by 1e18
    /// 1e15 → 0.001 credits per BLUE per day → 2M BLUE = 2000 cr/day
    uint256 public constant CREDIT_RATE = 1e15;

    /// denominator for credit calculation: 1e18 (token decimals) * 1e18 (rate scale) * 86400 (seconds/day)
    uint256 private constant CREDIT_DENOM = 1e18 * 1e18 * 86400;

    /// precision scalar for yield-per-token accounting
    uint256 private constant YIELD_PRECISION = 1e18;

    // ─── Config ───────────────────────────────────────────────────────────────

    IERC20  public immutable BLUE;
    IERC20  public immutable USDC;
    address public           owner;
    address public           yieldDistributor; // backend address allowed to push USDC yield

    uint256 public unstakeDelay = 1 days;

    // ─── Staking state ────────────────────────────────────────────────────────

    struct StakeInfo {
        uint256 amount;              // BLUE staked (wei)
        uint256 stakedAt;            // timestamp of initial stake (for credit accrual)
        uint256 lastAccruedAt;       // timestamp credits were last snapshotted
        uint256 accruedCredits;      // credits accumulated up to lastAccruedAt
        uint256 unstakeRequestedAt;  // 0 = not requested
        uint256 yieldDebt;           // accYieldPerToken at last settle
    }

    mapping(address => StakeInfo) public stakes;
    uint256 public totalStaked;

    // ─── Yield state (reward-per-token) ──────────────────────────────────────

    uint256 public accYieldPerToken;
    uint256 public totalYieldDistributed;
    mapping(address => uint256) public pendingYieldOf;

    // ─── Re-entrancy guard ────────────────────────────────────────────────────

    uint256 private _lock;
    modifier nonReentrant() {
        require(_lock == 0, "Reentrant");
        _lock = 1;
        _;
        _lock = 0;
    }

    // ─── Access control ───────────────────────────────────────────────────────

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }
    modifier onlyDistributor() {
        require(msg.sender == yieldDistributor || msg.sender == owner, "Not distributor");
        _;
    }

    // ─── Events ───────────────────────────────────────────────────────────────

    event Staked(address indexed user, uint256 amount, uint256 totalStake);
    event UnstakeRequested(address indexed user, uint256 amount, uint256 claimableAt);
    event UnstakeCancelled(address indexed user);
    event Unstaked(address indexed user, uint256 amount);
    event YieldDistributed(uint256 amount, uint256 newAccPerToken);
    event YieldClaimed(address indexed user, uint256 amount);
    event OwnershipTransferred(address indexed from, address indexed to);
    event YieldDistributorChanged(address indexed newDistributor);
    event UnstakeDelayChanged(uint256 newDelay);
    event EmergencyWithdraw(address indexed token, uint256 amount);

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _blue, address _usdc) {
        require(_blue != address(0) && _usdc != address(0), "Zero address");
        BLUE             = IERC20(_blue);
        USDC             = IERC20(_usdc);
        owner            = msg.sender;
        yieldDistributor = msg.sender;
    }

    // ─── Internal: snapshot credits before any state change ──────────────────

    function _snapshotCredits(address user) internal {
        StakeInfo storage s = stakes[user];
        if (s.amount > 0 && s.unstakeRequestedAt == 0) {
            uint256 elapsed = block.timestamp - s.lastAccruedAt;
            if (elapsed > 0) {
                // credits = amount * CREDIT_RATE * elapsed / CREDIT_DENOM
                // safe: max(amount)=1e27, CREDIT_RATE=1e15, elapsed<1e10 → product<1e52 < uint256_max
                uint256 newCredits = s.amount * CREDIT_RATE * elapsed / CREDIT_DENOM;
                s.accruedCredits += newCredits;
                s.lastAccruedAt   = block.timestamp;
            }
        }
    }

    // ─── Internal: settle USDC yield before any stake change ─────────────────

    function _settleYield(address user) internal {
        StakeInfo storage s = stakes[user];
        if (s.amount > 0 && s.unstakeRequestedAt == 0) {
            uint256 earned = (s.amount * (accYieldPerToken - s.yieldDebt)) / YIELD_PRECISION;
            if (earned > 0) pendingYieldOf[user] += earned;
        }
        s.yieldDebt = accYieldPerToken;
    }

    // ─── Staking ──────────────────────────────────────────────────────────────

    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(stakes[msg.sender].unstakeRequestedAt == 0, "Cancel unstake first");

        _snapshotCredits(msg.sender);
        _settleYield(msg.sender);

        BLUE.transferFrom(msg.sender, address(this), amount);

        StakeInfo storage s = stakes[msg.sender];
        if (s.amount == 0) {
            s.stakedAt      = block.timestamp;
            s.lastAccruedAt = block.timestamp;
        }
        s.amount    += amount;
        totalStaked += amount;

        emit Staked(msg.sender, amount, s.amount);
    }

    function requestUnstake() external nonReentrant {
        StakeInfo storage s = stakes[msg.sender];
        require(s.amount > 0, "Nothing staked");
        require(s.unstakeRequestedAt == 0, "Already requested");

        // Snapshot credits + yield before revoking accrual
        _snapshotCredits(msg.sender);
        _settleYield(msg.sender);

        s.unstakeRequestedAt = block.timestamp;
        emit UnstakeRequested(msg.sender, s.amount, block.timestamp + unstakeDelay);
    }

    function cancelUnstake() external {
        StakeInfo storage s = stakes[msg.sender];
        require(s.unstakeRequestedAt > 0, "No pending request");

        s.unstakeRequestedAt = 0;
        s.lastAccruedAt      = block.timestamp; // restart accrual from now
        s.yieldDebt          = accYieldPerToken;

        emit UnstakeCancelled(msg.sender);
    }

    function unstake() external nonReentrant {
        StakeInfo storage s = stakes[msg.sender];
        require(s.unstakeRequestedAt > 0, "No unstake request");
        require(block.timestamp >= s.unstakeRequestedAt + unstakeDelay, "Cooldown not finished");

        uint256 amount  = s.amount;
        totalStaked    -= amount;
        s.amount        = 0;
        s.unstakeRequestedAt = 0;

        BLUE.transfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    // ─── USDC yield ───────────────────────────────────────────────────────────

    /**
     * Called by backend after collecting x402 revenue.
     * Backend sends 20% of USDC receipts here for pro-rata distribution to stakers.
     */
    function distributeYield(uint256 amount) external nonReentrant onlyDistributor {
        require(amount > 0, "Amount must be > 0");
        require(totalStaked > 0, "No stakers");

        USDC.transferFrom(msg.sender, address(this), amount);
        accYieldPerToken     += (amount * YIELD_PRECISION) / totalStaked;
        totalYieldDistributed += amount;

        emit YieldDistributed(amount, accYieldPerToken);
    }

    function claimYield() external nonReentrant {
        _settleYield(msg.sender);
        uint256 amount = pendingYieldOf[msg.sender];
        require(amount > 0, "No yield to claim");

        pendingYieldOf[msg.sender] = 0;
        USDC.transfer(msg.sender, amount);
        emit YieldClaimed(msg.sender, amount);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    /**
     * Credits accumulated since `since` timestamp.
     * Backend calls: pendingCredits(wallet, lastSyncTimestamp)
     * Returns new credits earned since last sync.
     */
    function pendingCreditsSince(address user, uint256 since) external view returns (uint256) {
        StakeInfo memory s = stakes[user];
        if (s.amount == 0 || s.unstakeRequestedAt > 0) return 0;
        uint256 from    = since > s.lastAccruedAt ? since : s.lastAccruedAt;
        uint256 elapsed = block.timestamp > from ? block.timestamp - from : 0;
        return s.amount * CREDIT_RATE * elapsed / CREDIT_DENOM;
    }

    /**
     * Total credits ever accrued by a user (snapshotted + live).
     * Backend uses this as the "gross credits" figure; subtracts own usage ledger.
     */
    function totalCreditsAccrued(address user) external view returns (uint256) {
        StakeInfo memory s = stakes[user];
        uint256 live = 0;
        if (s.amount > 0 && s.unstakeRequestedAt == 0) {
            uint256 elapsed = block.timestamp - s.lastAccruedAt;
            live = s.amount * CREDIT_RATE * elapsed / CREDIT_DENOM;
        }
        return s.accruedCredits + live;
    }

    /**
     * Credits per day at current stake level.
     */
    function creditsPerDay(address user) external view returns (uint256) {
        StakeInfo memory s = stakes[user];
        if (s.amount == 0 || s.unstakeRequestedAt > 0) return 0;
        return s.amount * CREDIT_RATE / 1e36; // CREDIT_DENOM / 86400
    }

    function pendingYield(address user) external view returns (uint256) {
        StakeInfo memory s = stakes[user];
        uint256 settled    = pendingYieldOf[user];
        if (s.amount > 0 && s.unstakeRequestedAt == 0) {
            settled += (s.amount * (accYieldPerToken - s.yieldDebt)) / YIELD_PRECISION;
        }
        return settled;
    }

    function cooldownRemaining(address user) external view returns (uint256) {
        uint256 req = stakes[user].unstakeRequestedAt;
        if (req == 0) return 0;
        uint256 claimAt = req + unstakeDelay;
        return block.timestamp >= claimAt ? 0 : claimAt - block.timestamp;
    }

    function stakeInfo(address user) external view returns (
        uint256 amount,
        uint256 stakedAt,
        uint256 dailyCredits,
        uint256 cooldown,
        uint256 pendingUsdc
    ) {
        StakeInfo memory s = stakes[user];
        amount       = s.amount;
        stakedAt     = s.stakedAt;
        dailyCredits = (s.amount > 0 && s.unstakeRequestedAt == 0)
            ? s.amount * CREDIT_RATE / 1e36
            : 0;
        cooldown     = this.cooldownRemaining(user);
        pendingUsdc  = this.pendingYield(user);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setUnstakeDelay(uint256 _delay) external onlyOwner {
        require(_delay <= 7 days, "Max 7 days");
        unstakeDelay = _delay;
        emit UnstakeDelayChanged(_delay);
    }

    function setYieldDistributor(address _distributor) external onlyOwner {
        require(_distributor != address(0), "Zero address");
        yieldDistributor = _distributor;
        emit YieldDistributorChanged(_distributor);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /**
     * Emergency: recover any ERC20 token sent to contract by mistake.
     * Cannot recover BLUE that users have staked (protected by totalStaked check).
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(BLUE)) {
            uint256 available = BLUE.balanceOf(address(this));
            require(available > totalStaked, "Cannot withdraw staked BLUE");
            uint256 excess = available - totalStaked;
            require(amount <= excess, "Amount exceeds excess");
        }
        IERC20(token).transfer(owner, amount);
        emit EmergencyWithdraw(token, amount);
    }
}
