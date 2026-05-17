# base-security — sample export

## What it covers

Security checklist for Base smart contracts and agent systems — reentrancy, access control, oracle manipulation, MEV, and Base-specific risks.

## When to use it

Use this skill when Aeon flags a security regression, when MiroShark needs to assess risk factors in a scenario, or when `blue audit` runs a security review.

## Core concepts

- Base uses a centralized sequencer — standard Ethereum MEV bots largely absent, but sequencer sees all txs.
- Soft finality ~2s; L1 finality ~15 min — don't settle large transfers on soft confirmation.
- USDC on Base is 6 decimals — not 18. Precision errors are common.
- `tx.origin` must never be used for authorization — always `msg.sender`.

## Critical checks

- Reentrancy guard on all functions that transfer ETH or call external contracts.
- Checks-effects-interactions pattern — no state changes after external calls.
- Two-step ownership transfer (`Ownable2Step`) — prevents accidental transfer.
- Multisig (Safe) required for treasury, fee changes, protocol parameter updates.
- Timelock on governance actions — minimum 24h.
- Chainlink price feeds: check staleness (`updatedAt + heartbeat > block.timestamp`) and validity (`answer > 0`).
- Slippage protection on all swaps — `amountOutMin` never 0.

## Patterns

- Use OpenZeppelin's `ReentrancyGuard` — never implement custom reentrancy protection.
- Use `SafeERC20` for all ERC-20 transfers.
- Never use spot DEX price as sole oracle — use TWAP (minimum 30-min window on Base).
- All security flags from audit must have explicit fix recommendation before go/no-go.
