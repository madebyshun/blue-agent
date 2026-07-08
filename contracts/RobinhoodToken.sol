// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * RobinhoodToken — plain ERC-20, self-contained (no external imports).
 *
 * Robinhood Chain (EVM chainId 4663, Arbitrum-Orbit based, permissionless
 * deploy — see docs.robinhood.com/chain) has NO native token-launch
 * standard analogous to Base's B20 precompile. This is a minimal,
 * standard-compliant ERC-20 deployed as a raw contract-creation
 * transaction (no factory address needed — the user's own connected
 * wallet signs and broadcasts, Blue Agent never holds keys or funds).
 *
 * No external imports on purpose: this repo doesn't vendor OpenZeppelin
 * via forge (libs=[] in foundry.toml), so a standalone implementation
 * avoids a network-dependent `forge install` step at build/compile time.
 */
contract RobinhoodToken {
    string public name;
    string public symbol;
    uint8  public immutable decimals;
    uint256 public totalSupply;
    address public owner;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        uint256 _initialSupply,
        address _owner
    ) {
        require(_owner != address(0), "owner=0");
        name     = _name;
        symbol   = _symbol;
        decimals = _decimals;
        owner    = _owner;

        if (_initialSupply > 0) {
            totalSupply = _initialSupply;
            balanceOf[_owner] = _initialSupply;
            emit Transfer(address(0), _owner, _initialSupply);
        }
        emit OwnershipTransferred(address(0), _owner);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance exceeded");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "owner=0");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "to=0");
        uint256 bal = balanceOf[from];
        require(bal >= amount, "balance exceeded");
        unchecked { balanceOf[from] = bal - amount; }
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _burn(address from, uint256 amount) internal {
        uint256 bal = balanceOf[from];
        require(bal >= amount, "balance exceeded");
        unchecked { balanceOf[from] = bal - amount; }
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }
}
