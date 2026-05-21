// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * BlueMarketStaking — Stake $BLUEAGENT, earn USDC yield
 *
 * Access thresholds:
 *   Daily Brief   → 25,000,000 BLUE staked
 *   Weekly Report → 60,000,000 BLUE staked
 *
 * Yield:
 *   20% of every x402 USDC subscription payment is distributed
 *   pro-rata to all active stakers. Claimable anytime.
 *
 * Unstake cooldown: 7 days (access + yield accrual revoked immediately)
 *
 * Tokens:
 *   BLUE: 0xf895783b2931c919955e18b5e3343e7c7c456ba3 (Base)
 *   USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (Base)
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract BlueMarketStaking {

    // ─── Config ───────────────────────────────────────────────────────────────

    IERC20  public immutable BLUE;
    IERC20  public immutable USDC;
    address public           owner;
    address public           yieldDistributor; // backend address allowed to push yield

    uint256 public dailyThreshold  = 25_000_000 * 1e18; // 25M BLUE
    uint256 public weeklyThreshold = 60_000_000 * 1e18; // 60M BLUE
    uint256 public unstakeDelay    = 7 days;

    // ─── Staking state ────────────────────────────────────────────────────────

    struct StakeInfo {
        uint256 amount;
        uint256 unstakeRequestedAt;
        uint256 yieldDebt; // acc yield per token at last settle
    }

    mapping(address => StakeInfo) public stakes;
    uint256 public totalStaked;

    // ─── Yield state (reward-per-token pattern) ───────────────────────────────

    uint256 public accYieldPerToken;       // scaled by 1e18
    uint256 public totalYieldDistributed;
    mapping(address => uint256) public pendingYieldOf;

    uint256 private constant PRECISION = 1e18;

    // ─── Events ───────────────────────────────────────────────────────────────

    event Staked(address indexed user, uint256 amount);
    event UnstakeRequested(address indexed user, uint256 claimableAt);
    event UnstakeCancelled(address indexed user);
    event Claimed(address indexed user, uint256 amount);
    event YieldDistributed(uint256 amount, uint256 newAccPerToken);
    event YieldClaimed(address indexed user, uint256 amount);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }
    modifier onlyDistributor() { require(msg.sender == yieldDistributor || msg.sender == owner, "Not distributor"); _; }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _blue, address _usdc) {
        BLUE             = IERC20(_blue);
        USDC             = IERC20(_usdc);
        owner            = msg.sender;
        yieldDistributor = msg.sender;
    }

    // ─── Internal: settle pending yield for user ──────────────────────────────

    function _settle(address user) internal {
        StakeInfo storage s = stakes[user];
        if (s.amount > 0 && s.unstakeRequestedAt == 0) {
            uint256 earned = (s.amount * (accYieldPerToken - s.yieldDebt)) / PRECISION;
            if (earned > 0) pendingYieldOf[user] += earned;
        }
        s.yieldDebt = accYieldPerToken;
    }

    // ─── Staking ──────────────────────────────────────────────────────────────

    function stake(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(stakes[msg.sender].unstakeRequestedAt == 0, "Cancel unstake first");

        _settle(msg.sender);
        BLUE.transferFrom(msg.sender, address(this), amount);
        stakes[msg.sender].amount += amount;
        totalStaked += amount;

        emit Staked(msg.sender, amount);
    }

    function requestUnstake() external {
        require(stakes[msg.sender].amount > 0, "Nothing staked");
        require(stakes[msg.sender].unstakeRequestedAt == 0, "Already requested");

        _settle(msg.sender); // settle yield before revoking
        stakes[msg.sender].unstakeRequestedAt = block.timestamp;

        emit UnstakeRequested(msg.sender, block.timestamp + unstakeDelay);
    }

    function cancelUnstake() external {
        require(stakes[msg.sender].unstakeRequestedAt > 0, "No pending request");
        stakes[msg.sender].unstakeRequestedAt = 0;
        stakes[msg.sender].yieldDebt = accYieldPerToken; // reset debt to now
        emit UnstakeCancelled(msg.sender);
    }

    function claim() external {
        StakeInfo storage s = stakes[msg.sender];
        require(s.unstakeRequestedAt > 0, "No unstake request");
        require(block.timestamp >= s.unstakeRequestedAt + unstakeDelay, "Cooldown not finished");

        uint256 amount = s.amount;
        totalStaked -= amount;
        s.amount = 0;
        s.unstakeRequestedAt = 0;

        BLUE.transfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    // ─── Yield ────────────────────────────────────────────────────────────────

    /**
     * Called by backend after each x402 subscription payment.
     * Backend sends 20% of USDC payment here before transferring to treasury.
     */
    function distributeYield(uint256 amount) external onlyDistributor {
        require(amount > 0, "Amount must be > 0");
        require(totalStaked > 0, "No stakers");

        USDC.transferFrom(msg.sender, address(this), amount);
        accYieldPerToken += (amount * PRECISION) / totalStaked;
        totalYieldDistributed += amount;

        emit YieldDistributed(amount, accYieldPerToken);
    }

    /** Claim accumulated USDC yield */
    function claimYield() external {
        _settle(msg.sender);
        uint256 amount = pendingYieldOf[msg.sender];
        require(amount > 0, "No yield to claim");

        pendingYieldOf[msg.sender] = 0;
        USDC.transfer(msg.sender, amount);
        emit YieldClaimed(msg.sender, amount);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function pendingYield(address user) external view returns (uint256) {
        StakeInfo memory s = stakes[user];
        uint256 settled = pendingYieldOf[user];
        if (s.amount > 0 && s.unstakeRequestedAt == 0) {
            settled += (s.amount * (accYieldPerToken - s.yieldDebt)) / PRECISION;
        }
        return settled;
    }

    function activeStake(address user) external view returns (uint256) {
        if (stakes[user].unstakeRequestedAt > 0) return 0;
        return stakes[user].amount;
    }

    function cooldownRemaining(address user) external view returns (uint256) {
        uint256 req = stakes[user].unstakeRequestedAt;
        if (req == 0) return 0;
        uint256 claimAt = req + unstakeDelay;
        return block.timestamp >= claimAt ? 0 : claimAt - block.timestamp;
    }

    function hasAccess(address user, string calldata product) external view returns (bool) {
        StakeInfo memory s = stakes[user];
        if (s.amount == 0 || s.unstakeRequestedAt > 0) return false;
        bytes32 p = keccak256(bytes(product));
        if (p == keccak256(bytes("daily")))  return s.amount >= dailyThreshold;
        if (p == keccak256(bytes("weekly"))) return s.amount >= weeklyThreshold;
        return false;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setThresholds(uint256 _daily, uint256 _weekly) external onlyOwner {
        require(_weekly >= _daily, "Weekly must be >= daily");
        dailyThreshold  = _daily;
        weeklyThreshold = _weekly;
    }

    function setUnstakeDelay(uint256 _delay) external onlyOwner {
        require(_delay <= 30 days, "Max 30 days");
        unstakeDelay = _delay;
    }

    function setYieldDistributor(address _distributor) external onlyOwner {
        yieldDistributor = _distributor;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
    }
}
