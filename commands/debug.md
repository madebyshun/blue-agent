# blue debug

Debug a failed transaction, contract error, or agent execution problem on Base.

## What it does

Takes a tx hash, error message, or contract address and returns a root cause analysis with a fix.

## Supported inputs

- Transaction hash (0x...)
- Solidity revert message or stack trace
- Contract address + failing function
- Agent execution log / error

## Output

- Root cause summary
- Decoded revert reason (if tx hash provided)
- Likely fix (code snippet or config change)
- Related patterns to watch for
- Verification steps after fix

## Common use cases

- `execution reverted` errors
- out of gas failures
- ERC-20 approval issues
- reentrancy or access control bugs
- x402 payment failures
- Bankr agent job failures

## Usage

```
blue debug <tx_hash>
blue debug <error_message>
blue debug <contract_address> <function_name>
```
