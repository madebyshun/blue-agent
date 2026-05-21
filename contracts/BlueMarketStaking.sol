// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * BlueMarketStaking
 *
 * Stake $BLUEAGENT to unlock Blue Market subscriptions.
 *
 * Thresholds:
 *   Daily Brief   → 25,000,000 BLUE staked
 *   Weekly Report → 60,000,000 BLUE staked (includes Daily)
 *
 * Unstake cooldown: 7 days (access revoked immediately on request)
 *
 * Token: 0xf895783b2931c919955e18b5e3343e7c7c456ba3 (Base)
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract BlueMarketStaking {

    // ─── Constants ────────────────────────────────────────────────────────────

    IERC20  public immutable BLUE;
    address public           owner;

    uint256 public dailyThreshold  = 25_000_000 * 1e18;  // 25M BLUE
    uint256 public weeklyThreshold = 60_000_000 * 1e18;  // 60M BLUE
    uint256 public unstakeDelay    = 7 days;

    // ─── State ────────────────────────────────────────────────────────────────

    struct StakeInfo {
        uint256 amount;
        uint256 unstakeRequestedAt; // 0 = not requested
    }

    mapping(address => StakeInfo) public stakes;
    uint256 public totalStaked;

    // ─── Events ───────────────────────────────────────────────────────────────

    event Staked(address indexed user, uint256 amount, uint256 total);
    event UnstakeRequested(address indexed user, uint256 amount, uint256 claimableAt);
    event UnstakeCancelled(address indexed user);
    event Claimed(address indexed user, uint256 amount);
    event ThresholdsUpdated(uint256 daily, uint256 weekly);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _blue) {
        BLUE  = IERC20(_blue);
        owner = msg.sender;
    }

    // ─── Staking ──────────────────────────────────────────────────────────────

    /// @notice Stake BLUE tokens to unlock access
    function stake(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(stakes[msg.sender].unstakeRequestedAt == 0, "Cancel unstake request first");

        BLUE.transferFrom(msg.sender, address(this), amount);
        stakes[msg.sender].amount += amount;
        totalStaked += amount;

        emit Staked(msg.sender, amount, stakes[msg.sender].amount);
    }

    /// @notice Request unstake — access revoked immediately, 7-day cooldown begins
    function requestUnstake() external {
        require(stakes[msg.sender].amount > 0, "Nothing staked");
        require(stakes[msg.sender].unstakeRequestedAt == 0, "Already requested");

        stakes[msg.sender].unstakeRequestedAt = block.timestamp;

        emit UnstakeRequested(
            msg.sender,
            stakes[msg.sender].amount,
            block.timestamp + unstakeDelay
        );
    }

    /// @notice Cancel a pending unstake request — restores access immediately
    function cancelUnstake() external {
        require(stakes[msg.sender].unstakeRequestedAt > 0, "No pending request");
        stakes[msg.sender].unstakeRequestedAt = 0;
        emit UnstakeCancelled(msg.sender);
    }

    /// @notice Claim tokens after cooldown period
    function claim() external {
        StakeInfo storage info = stakes[msg.sender];
        require(info.unstakeRequestedAt > 0, "No unstake request");
        require(
            block.timestamp >= info.unstakeRequestedAt + unstakeDelay,
            "Cooldown not finished"
        );

        uint256 amount = info.amount;
        totalStaked -= amount;
        info.amount = 0;
        info.unstakeRequestedAt = 0;

        BLUE.transfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    // ─── Access checks ────────────────────────────────────────────────────────

    /// @notice Returns true if user has active stake meeting threshold
    function hasAccess(address user, string calldata product) external view returns (bool) {
        StakeInfo memory info = stakes[user];
        if (info.amount == 0)                  return false;
        if (info.unstakeRequestedAt > 0)       return false; // revoked on request

        bytes32 p = keccak256(bytes(product));
        if (p == keccak256(bytes("daily")))    return info.amount >= dailyThreshold;
        if (p == keccak256(bytes("weekly")))   return info.amount >= weeklyThreshold;
        return false;
    }

    /// @notice Returns active staked amount (0 if unstake requested)
    function activeStake(address user) external view returns (uint256) {
        if (stakes[user].unstakeRequestedAt > 0) return 0;
        return stakes[user].amount;
    }

    /// @notice Returns seconds remaining in cooldown (0 if claimable or none)
    function cooldownRemaining(address user) external view returns (uint256) {
        uint256 requested = stakes[user].unstakeRequestedAt;
        if (requested == 0) return 0;
        uint256 claimableAt = requested + unstakeDelay;
        if (block.timestamp >= claimableAt) return 0;
        return claimableAt - block.timestamp;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Update access thresholds (governance/admin)
    function setThresholds(uint256 _daily, uint256 _weekly) external onlyOwner {
        require(_weekly >= _daily, "Weekly must be >= daily");
        dailyThreshold  = _daily;
        weeklyThreshold = _weekly;
        emit ThresholdsUpdated(_daily, _weekly);
    }

    function setUnstakeDelay(uint256 _delay) external onlyOwner {
        require(_delay <= 30 days, "Max 30 days");
        unstakeDelay = _delay;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
    }
}
