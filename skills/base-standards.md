# Base Standards

Base-specific knowledge for building on Blue Agent. Always apply these when writing contracts, integrations, or tooling.

---

## Network parameters

| Parameter | Value |
|---|---|
| Chain ID | `8453` |
| Native token | ETH |
| Block time | ~2 seconds |
| Finality | Soft finality ~2s; L1 finality after ~15 min (dispute window) |
| RPC (public, rate-limited) | `https://mainnet.base.org` |
| Block explorer | `https://basescan.org` |
| Alt explorer | `https://base.blockscout.com` |
| Testnet | Base Sepolia, chain ID `84532` |

---

## Key differences from Ethereum mainnet

| Topic | Ethereum Mainnet | Base |
|---|---|---|
| Chain ID | 1 | 8453 |
| Block time | ~12s | ~2s |
| Gas fees | High, variable | Very low (~$0.001–$0.01 per tx) |
| Sequencer | Decentralized validators | Centralized sequencer (Coinbase-operated) |
| Finality | ~13 min (PoS) | Soft ~2s, L1-final ~15 min |
| Consensus | Ethereum PoS | OP Stack (Optimistic Rollup) |
| Fraud proofs | N/A | 7-day challenge window |
| EVM compatibility | Native | Full EVM equivalence |
| `PUSH0` opcode | EIP-3855 | Supported |
| Blob transactions | EIP-4844 | Supported (reduces L1 DA cost) |

### Practical implications

- **Gas costs**: Use Base's low gas to enable patterns that are uneconomical on mainnet (e.g., on-chain micropayments, frequent state updates).
- **Block time**: ~2s means faster UX but don't assume Ethereum mainnet timing in UI or contract logic.
- **L1 withdrawal delay**: Withdrawing ETH/tokens to Ethereum mainnet takes ~7 days through the standard bridge. Use third-party fast bridges for instant exits.
- **Sequencer trust**: Base uses a centralized sequencer. For censorship-resistant use cases, note this limitation.
- **No MEV auction**: Base uses a private mempool — standard Ethereum MEV strategies don't apply the same way.

---

## ERC standards commonly used on Base

| Standard | Use case | Notes |
|---|---|---|
| ERC-20 | Fungible tokens (USDC, WETH, BLUEAGENT) | Most common. Use `SafeERC20` from OpenZeppelin. |
| ERC-721 | NFTs | Standard non-fungible token |
| ERC-1155 | Multi-token (gaming, badges) | Efficient batch transfers |
| ERC-4337 | Account abstraction (smart wallets) | Coinbase Smart Wallet is ERC-4337 |
| ERC-2612 | Permit (gasless approvals) | USDC on Base supports `permit()` |
| ERC-7579 | Modular smart accounts | Emerging standard, relevant for agent wallets |

---

## Coinbase Smart Wallet

The default wallet for Base-native apps. Supports:
- ERC-4337 account abstraction
- Passkey signing (no seed phrase)
- Gas sponsorship via Paymaster
- Cross-app session keys

Onboard users with `@coinbase/onchainkit` or the Wagmi `coinbaseWallet` connector.

---

## Development conventions for Blue Agent

- Always use `viem` or `ethers v6` for on-chain reads/writes (not v5).
- Always specify `chain: base` explicitly — never assume network from env alone.
- All USDC amounts are in 6 decimals (`1 USDC = 1_000_000n`).
- All ETH amounts are in 18 decimals (`1 ETH = 10n ** 18n`).
- Prefer `publicClient.readContract()` over raw `eth_call` for type safety.
- For write transactions, always estimate gas before sending.
- Test on Base Sepolia (chain ID `84532`) before mainnet. Mirror addresses may differ — always check.

---

## Useful Base-native tooling

| Tool | Purpose |
|---|---|
| [OnchainKit](https://onchainkit.xyz) | Coinbase's React component library for Base |
| [wagmi](https://wagmi.sh) | React hooks for EVM |
| [viem](https://viem.sh) | Low-level EVM client (TypeScript) |
| [Basescan API](https://basescan.org/apis) | Contract verification, ABI fetch |
| [Base Bridge](https://bridge.base.org) | Official L1 ↔ Base bridge |
| [Aerodrome](https://aerodrome.finance) | Largest DEX on Base |
| [Uniswap v3 on Base](https://app.uniswap.org) | Major DEX, see addresses in `base-addresses.md` |
