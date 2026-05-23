---
name: Blue Agent — Audit
description: Use when user wants a security review of code, a smart contract, or a system. Triggers — "blue audit", "audit this", "security review", "is this safe", "check my contract", "find vulnerabilities", "go/no-go", "reentrancy", "access control".
version: 1.0.0
---

# Blue Audit — Security Review

500+ checks across 13 categories. Returns critical issues, suggested fixes, and a go/no-go verdict.

## What it produces

| Section | Content |
|---------|---------|
| Critical issues | Vulnerabilities that must be fixed before shipping |
| High / Medium / Low | Categorized findings with severity |
| Suggested fixes | Specific code-level fixes for each issue |
| 13 categories | Reentrancy, access control, math, oracle, MEV, etc. |
| Go / No-Go | Binary verdict with reasoning |

## MCP Tool

```
blue_audit(prompt: string)
```

## Prompt format

Pass the code, contract, or system description. Can include:
- Solidity contracts (paste full source)
- TypeScript/JS code
- System architecture description
- API design

## Example

```
blue_audit("
pragma solidity ^0.8.24;
contract Vault {
  mapping(address => uint) balances;
  function withdraw(uint amount) external {
    require(balances[msg.sender] >= amount);
    (bool ok,) = msg.sender.call{value: amount}('');
    require(ok);
    balances[msg.sender] -= amount;
  }
}
")
```

## Output

Structured audit report — critical issues first, with line-level fix suggestions.

## Price

$1.00 per call
