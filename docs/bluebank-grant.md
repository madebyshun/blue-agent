# BlueBank — Grant Profile & Pitch

> A non-custodial consumer neobank on Base. Sign in with Face ID, hold USDC,
> earn real on-chain yield, and pay anyone by QR — no seed phrase, no gas, no
> custody. Built by Blocky Studio, the team behind Blue Agent.

**Status:** live in local testing (production-gated). Testnet pass complete on Base Sepolia; mainnet pass in progress.
**Chain:** Base only (8453 / 84532).
**Repo surface:** `apps/web` → `/app/bank` (Founder Console monorepo).

---

## 1. TL;DR

BlueBank turns a Base wallet into something a normal person can use like a bank
app — without giving up custody. Three things make it different from every
"DeFi dashboard":

1. **Seedless onboarding** — Coinbase Smart Wallet (passkey / Face ID). No 12-word phrase to lose.
2. **Gasless** — Coinbase Paymaster sponsors gas via EIP-5792. Users never need to "buy ETH for gas."
3. **It actually does bank things** — earn yield (Aave v3 + Morpho, best-rate router), send/pay by address or Basename, **scan-to-pay by QR**, add cash by card (Coinbase Onramp), and a real on-chain activity feed.

Everything is non-custodial: BlueBank only *prepares* the transaction; the user
signs from their own wallet.

---

## 2. Problem

Crypto's onboarding still fails normal users at three steps:

- **Seed phrases** — terrifying and easy to lose; the #1 drop-off in self-custody.
- **Gas** — "you need ETH to move your USDC" is nonsensical to a newcomer.
- **No product** — most "wallets on Base" are token lists and charts, not something you'd use to actually *get paid* or *save*.

The result: people who want dollar-stable savings + payments end up on
custodial CEXs, defeating the point of an open chain.

## 3. Solution — BlueBank

A consumer banking surface on Base where every primitive is a real bank action:

| Bank action | BlueBank implementation | Non-custodial? |
|---|---|---|
| Open account | Coinbase Smart Wallet (passkey, no seed) | ✅ user owns keys |
| Save / earn | Best-rate router across **Aave v3** + **Morpho** (Gauntlet USDC Prime) | ✅ user signs supply |
| Send / pay | USDC / ETH to address or **Basename** | ✅ user signs transfer |
| Pay by QR | **Scan-to-pay** (EIP-681) + payment-request QR | ✅ user signs |
| Add cash | **Coinbase Onramp** (card / Apple Pay / bank → USDC) | ✅ delivered to user wallet |
| Gas | **Coinbase Paymaster** sponsorship (EIP-5792) | ✅ sponsored, user still authors |
| History | Real on-chain **Activity** feed (Etherscan V2) | — read-only |

## 4. Why Base, why now

- **Base is the consumer chain.** Smart Wallet, Paymaster, Basenames, Onramp, and Base App distribution are exactly the rails a consumer neobank needs — BlueBank uses all of them natively.
- **Emerging-market timing.** Vietnam's *Law on Digital Technology Industry* (effective Jan 1, 2026) is the country's first legal recognition of digital assets. Vietnam is already a QR-payment-native market (VietQR). BlueBank's **scan-to-pay USDC** maps onto an existing daily habit precisely as a regulated on-chain payments market opens — a wedge into a 100M-person economy.
- **Stablecoin tailwind.** USDC savings + payments is the clearest real-world use of an L2 today; BlueBank packages it for non-crypto users.

## 5. What's already built (verifiable)

All on-chain, all Base, all non-custodial. Recent commits on `dev`:

- **Smart Wallet onboarding** — "Create a free wallet" (passkey) as the primary CTA. *(commit `b456d51`)*
- **Gasless sends** — `/api/paymaster` EIP-7677 proxy + `useSendCalls` paymaster capability with EOA fallback. *(commit `d6a8b52`)*
- **Scan-to-pay + request QR** — camera scanner (jsQR) + EIP-681 parse/build. *(commit `3f06631`)*
- **Coinbase Onramp** — server-side CDP session token, USDC to Base. *(verified live)*
- **Real Activity feed** — Etherscan V2, classifies Supplied / Withdrew / Sent / Received against verified Aave/Morpho/aUSDC addresses. *(verified: returned a wallet's real Sepolia history)*
- **Yield router** — live APY across Aave v3 + Morpho (DefiLlama), executable supply/withdraw. *(testnet-verified)*
- **Live market data** — Base TVL, USDC APY comparison, Base token prices (DefiLlama / DexScreener / GeckoTerminal) — no fabricated numbers.

**Proof points:** testnet supply/withdraw/send executed and classified correctly on Base Sepolia; Onramp session tokens generated against the production CDP API; all contract addresses verified on Basescan.

## 6. Use of grant / milestones

| Milestone | Deliverable | Est. |
|---|---|---|
| M1 — Mainnet GA | Mainnet pass (real USDC), Paymaster policy funded + contract allowlist, domain allowlist | 2 wks |
| M2 — Distribution | List on **Base App** (Mini App manifest), Basename identity, share links | 3 wks |
| M3 — VN wedge | Scan-to-pay UX localization, merchant request-QR flow, education content | 4 wks |
| M4 — Retention | Recurring auto-save into best-rate vault, balance alerts, referrals | 6 wks |

**Asks:**
- **Base Ecosystem / Builder grant** — fund M1–M3 engineering + Paymaster gas sponsorship pool.
- **CDP credits** — Onramp + Paymaster + Bundler usage during GA.
- **Distribution** — Base App featuring + ecosystem co-marketing for the VN launch.

## 7. Target programs

- Base Ecosystem Fund / **Base Builder Grants** & Builder Rewards (onchain activity-weighted)
- **Coinbase Developer Platform** credits (Onramp / Paymaster / Bundler)
- **Optimism RetroPGF** (Base is on the Superchain; onchain impact qualifies)
- Stablecoin / payments-focused ecosystem programs

## 8. Team

**Blocky Studio** — builders of **Blue Agent**, an AI agent layer on Base (Founder
Console + x402 paid API services + Blue Hub tool marketplace). BlueBank is the
consumer banking surface of that stack. Track record shipping real on-chain
products on Base with verified contracts and live data integrations.

- Token: `$BLUEAGENT` — `0xf895783b2931c919955e18b5e3343e7c7c456ba3` (Base, Uniswap v4)
- X: [@blueagent_](https://x.com/blueagent_) · TG: [t.me/blueagent_hub](https://t.me/blueagent_hub)
- Site: [blueagent.dev](https://blueagent.dev) · Studio: [blocky.studio](https://blocky.studio)

## 9. One-paragraph version (for forms)

> BlueBank is a non-custodial consumer neobank on Base. Users open an account
> with Face ID (Coinbase Smart Wallet — no seed phrase), earn real yield on USDC
> through a best-rate router across Aave v3 and Morpho, and send or get paid by
> address, Basename, or QR — with gas sponsored by Coinbase Paymaster so they
> never need ETH. Cash-in is via Coinbase Onramp; every action is signed by the
> user and verifiable on Basescan. Built natively on Base's consumer rails
> (Smart Wallet, Paymaster, Basenames, Onramp, Base App), BlueBank targets
> emerging QR-payment markets — starting with Vietnam as its digital-asset law
> takes effect in 2026.
