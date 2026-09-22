# Changelog — Blue Agent web

Versions here track the `apps/web` package version only. This file starts at
0.2.0; the `0.1.0` that preceded it was never cut as a release, so there is
nothing honest to write under it.

Every line below names a surface that exists in this tree. If a capability is
held at "soon" in the product (Base MCP actions, `prepare_yield`), it is not
listed — see CLAUDE.md, no-fabrication rule.

## 0.2.0 — Blue Chat v0.2

Marketing calls this release **Blue Chat v0.2**; this bump is what makes the
package version agree with that name.

### Wallet skills in chat (non-custodial — the user signs, we never hold keys)

- `prepare_send` / `robinhood_send` — send native or ERC-20, on Base 8453 and
  Robinhood Chain 4663 (`WalletSendCard`).
- `prepare_swap` — swap on Base (`ConvertPanel`).
- `robinhood_swap` — swap through `RobinhoodSwapRouter` on Robinhood Chain 4663,
  approve + swap legs signed in the user's own wallet (`RobinhoodSwapCard`).
- `robinhood_bridge` — Base ↔ Robinhood Chain via a Relay Protocol quote
  (`RobinhoodBridgeCard` / `BankBridgeCard`).
- `hub_b20_manage` — B20 token administration on Base (`B20ManageCard`).
- Read-side cards: `check_wallet`, `check_memo`, `check_authorization`.

### Credits

- Token-free daily allowance — no `$BLUEAGENT` to hold or stake:
  `GUEST_DAILY = 100`, `WALLET_DAILY = 500` (`src/lib/credits.ts`).
- Chat messages and Hub tool calls inside chat debit **credits**, not USDC.
  USDC (on Base, via the CDP facilitator) only tops credits up, or settles when
  an external agent calls the public `/api/x402/[tool]` endpoint directly.
- Composer quote and ledger debit derive from one preset list, so the price
  shown and the price taken cannot disagree.

### Models

Eight presets (`src/app/chat/components/presets.ts`), including a genuinely
0-credit `free` tier that is chat-only (`noTools: true`) so a free message
cannot invoke a paid tool.

### Sign-in

- Privy embedded wallets (`@privy-io/react-auth`, `@privy-io/wagmi`), gated by
  `PRIVY_ENABLED` / `NEXT_PUBLIC_PRIVY_APP_ID` — sign in and get a wallet, or
  connect one you already have.
