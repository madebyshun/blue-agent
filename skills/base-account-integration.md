# Base Account Integration Guide

Grounding for `blue build` (account abstraction category) — smart wallets, ERC-4337, paymasters, and gasless UX on Base.

---

## 1. What is a Base Account (Coinbase Smart Wallet)?

Coinbase Smart Wallet is a production-ready ERC-4337 smart contract wallet deployed by Coinbase on Base. It eliminates seed phrases — users authenticate with passkeys (Face ID, Touch ID, device PIN).

**Why it matters for builders:**
- No extension required (works in mobile browsers)
- No seed phrase (works for non-crypto users)
- Gasless transactions (your app can sponsor gas)
- Batch transactions (multiple onchain actions in one click)
- Cross-device recovery (add second device without seed phrase)

**What it is technically:**
- An ERC-4337 compliant smart contract wallet
- Uses WebAuthn/passkeys for signing (FIDO2 standard)
- Factory-deployed: same address across all Base deployments for same passkey
- Compatible with all EVM wallets (can also import traditional EOA)

**Docs:** `docs.base.org/identity/smart-wallet`
**OnchainKit:** `onchainkit.xyz` (React components for Base app integration)

---

## 2. ERC-4337 Architecture

Account Abstraction without changing Ethereum consensus. Works on Base today.

### Components

```
User (Passkey)
  │
  ▼ Signs
UserOperation
  │
  ▼ Submits to
Bundler (Pimlico, Alchemy, Coinbase)
  │
  ▼ Calls
EntryPoint Contract (0x0000000071727De22E5E9d8BAf0edAc6f37da032)
  │
  ├──▶ UserOperation validation
  │      • Signature verified against smart wallet
  │      • Nonce checked
  │      • Gas prepaid (by paymaster or wallet)
  │
  ├──▶ Paymaster (optional — sponsors gas)
  │      • Checks sponsorship conditions
  │      • Pays gas on behalf of user
  │
  └──▶ Smart Wallet Contract
         • Executes the actual transaction(s)
         • Emits events
```

### UserOperation Struct

```typescript
type UserOperation = {
  sender: Address;          // Smart wallet address
  nonce: bigint;            // Anti-replay (per-wallet, managed by EntryPoint)
  initCode: Hex;            // Deploy wallet if first tx (empty after first)
  callData: Hex;            // The actual transaction(s) to execute
  callGasLimit: bigint;     // Gas for execution
  verificationGasLimit: bigint;  // Gas for signature verification
  preVerificationGas: bigint;    // Bundler overhead gas
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterAndData: Hex;    // Paymaster address + data (empty if self-paying)
  signature: Hex;           // Passkey signature
}
```

### EntryPoint on Base

```
EntryPoint v0.7: 0x0000000071727De22E5E9d8BAf0edAc6f37da032
EntryPoint v0.6: 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
```

Both addresses are canonical across all EVM chains (same deployer, same CREATE2).

---

## 3. Paymaster Patterns

Paymasters pay gas on behalf of users. They unlock truly gasless UX.

### Types of Paymasters

| Type | Who pays | Use case |
|---|---|---|
| Verifying paymaster | App sponsor | App pays gas for all users |
| ERC-20 paymaster | User pays in ERC-20 | User pays USDC instead of ETH |
| Allowlist paymaster | App sponsor (filtered) | Only verified users get sponsorship |

### Coinbase Paymaster (Free Tier Available)

```typescript
import { createPublicClient, createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { coinbaseWallet } from "wagmi/connectors";

// OnchainKit automatically uses Coinbase paymaster when NEXT_PUBLIC_CDP_API_KEY is set
// Set in .env:
// NEXT_PUBLIC_CDP_API_KEY=your_cdp_api_key
// NEXT_PUBLIC_ONCHAINKIT_API_KEY=same_as_cdp

// The wallet will automatically use the paymaster — no code needed beyond env var
```

### Custom Verifying Paymaster

```solidity
// IPaymaster interface
interface IPaymaster {
    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external returns (bytes memory context, uint256 validationData);

    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost
    ) external;
}

// Your paymaster decides: should I pay for this UserOperation?
// validatePaymasterUserOp returns 0 = approve, 1 = reject
```

### ERC-20 Paymaster (User Pays in USDC)

```typescript
// Pimlico's ERC-20 paymaster — user pays in USDC, no ETH needed
const paymasterClient = createPimlicoPaymasterClient({
  transport: http(
    `https://api.pimlico.io/v2/base/rpc?apikey=${PIMLICO_API_KEY}`
  ),
});

// Get USDC quote for gas payment
const { paymasterAndData } = await paymasterClient.sponsorUserOperation({
  userOperation,
  // Pimlico charges USDC from user's wallet instead of ETH
  entryPoint: ENTRY_POINT_ADDRESS,
});
```

---

## 4. Multi-Signer Recovery

Coinbase Smart Wallet supports multiple owners — add a recovery device or key.

```typescript
// Add second device as owner (browser SDK)
const wallet = await CoinbaseSmartWallet.connect();
await wallet.addOwner({
  newOwner: {
    publicKey: newPasskeyPublicKey,  // Second device's passkey
    type: "webauthn-key"
  }
});

// Add EOA as recovery key
await wallet.addOwner({
  newOwner: {
    address: "0xRecoveryAddress",
    type: "ethereum-address"
  }
});
```

**Recovery flow:**
1. User loses primary device
2. Logs in with second device's passkey (or EOA recovery key)
3. Same smart wallet address — funds intact
4. Can rotate or remove old passkey

---

## 5. Transaction Bundling

Bundle multiple onchain actions into a single UserOperation = single UX approval.

```typescript
// Without bundling: 3 approvals, 3 gas payments, 3 confirmations
await token.approve(router, amount);
await router.swap(params);
await staking.stake(lpTokens);

// ✅ With bundling: 1 approval, 1 (sponsored) gas, 1 confirmation
const calls = [
  {
    to: token.address,
    data: token.interface.encodeFunctionData("approve", [router, amount]),
    value: 0n,
  },
  {
    to: router.address,
    data: router.interface.encodeFunctionData("swap", [params]),
    value: 0n,
  },
  {
    to: staking.address,
    data: staking.interface.encodeFunctionData("stake", [lpTokens]),
    value: 0n,
  },
];

// Execute all 3 in one UserOperation
await smartWallet.executeBatch(calls);
```

### OnchainKit Transaction Component

```tsx
import { Transaction, TransactionButton } from "@coinbase/onchainkit/transaction";

function ClaimAndStake() {
  return (
    <Transaction
      chainId={8453}  // Base
      calls={[
        { to: rewardContract, data: encodedClaimCall },
        { to: stakingContract, data: encodedStakeCall },
      ]}
    >
      <TransactionButton text="Claim & Stake in one click" />
    </Transaction>
  );
}
```

---

## 6. OnchainKit Integration

OnchainKit is Coinbase's React component library for Base apps.

```bash
npm install @coinbase/onchainkit
```

```tsx
// _app.tsx or layout.tsx
import { OnchainKitProvider } from "@coinbase/onchainkit";
import { base } from "viem/chains";

export default function App({ children }) {
  return (
    <OnchainKitProvider
      apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
      chain={base}
    >
      {children}
    </OnchainKitProvider>
  );
}
```

### Key Components

```tsx
// Wallet connection (supports Coinbase Smart Wallet + MetaMask + WalletConnect)
import { ConnectWallet } from "@coinbase/onchainkit/wallet";
<ConnectWallet />

// Identity (show ENS/Base name + avatar)
import { Identity, Name, Avatar } from "@coinbase/onchainkit/identity";
<Identity address="0x...">
  <Avatar />
  <Name />
</Identity>

// Swap component (Uniswap V3 on Base)
import { Swap } from "@coinbase/onchainkit/swap";
<Swap />

// NFT mint
import { NFTMintCard } from "@coinbase/onchainkit/nft";
<NFTMintCard contractAddress="0x..." tokenId="1" />
```

---

## 7. Passkey Authentication

Passkeys use WebAuthn (FIDO2). The device generates a keypair; the private key never leaves the device.

```typescript
// Create a passkey (new wallet)
const credential = await navigator.credentials.create({
  publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: "My Base App", id: window.location.hostname },
    user: {
      id: crypto.getRandomValues(new Uint8Array(16)),
      name: userEmail,
      displayName: userDisplayName,
    },
    pubKeyCredParams: [
      { alg: -7, type: "public-key" },   // ES256 (secp256r1) — standard
      { alg: -257, type: "public-key" }, // RS256 — fallback
    ],
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  },
});

// The public key is used to derive the smart wallet address
// The private key stays on-device — never exported, never leaked
```

**What gets stored:** Public key (in your DB or the smart wallet contract). Nothing sensitive.

**Signing flow:**
1. User taps "Confirm transaction"
2. Device shows biometric prompt (Face ID / fingerprint / PIN)
3. Device signs the UserOperation hash with private key (on-device)
4. Signed UserOperation sent to bundler
5. EntryPoint verifies signature onchain

---

## 8. Cost Comparison

| Wallet Type | Deploy Cost | Per-TX Overhead | Complexity |
|---|---|---|---|
| EOA | $0 | 21,000 gas | None |
| Smart Wallet (first tx) | ~$0.50–2.00 | +80,000–120,000 gas | Low (SDK handles) |
| Smart Wallet (subsequent) | $0 | +80,000 gas | Low |
| Multisig Safe (3-of-5) | ~$5–15 | +100,000–200,000 gas | High |

On Base at 0.01 gwei gas price:
- EOA transfer: 21,000 gas × 0.01 gwei × ETH price (~$3,500) = ~$0.00073
- Smart wallet: ~120,000 gas × 0.01 gwei = ~$0.0042 per tx

The overhead is ~4–6× an EOA transaction, but at Base's gas prices this is $0.001–0.01 per transaction — negligible.

**With sponsorship:** Zero cost to user regardless.

---

## 9. Gasless UX Patterns

### Full Sponsorship (App Pays Everything)

```typescript
// Check if user is eligible for sponsorship
const isEligible = await checkSponsorshipEligibility(userAddress);

if (isEligible) {
  // Set paymaster in UserOperation
  userOp.paymasterAndData = await getPaymasterData(userOp);
  // User sees 0 ETH cost in their wallet
}
```

### Conditional Sponsorship (First N Transactions)

```typescript
// Common pattern: sponsor first 5 txs per user (onboarding)
const txCount = await getUserTxCount(userAddress);
if (txCount < 5) {
  userOp.paymasterAndData = await paymaster.sign(userOp);
}
```

### USDC Paymaster (No ETH Required)

```typescript
// User pays gas in USDC — never needs ETH
// Pimlico, Alchemy, Biconomy all offer this
const paymasterData = await pimlicoClient.getPaymasterData({
  userOperation,
  entryPoint,
  // Deducts USDC from user's smart wallet automatically
});
```

---

## 10. Deployment Process

```typescript
// 1. Setup (install dependencies)
npm install @coinbase/onchainkit viem wagmi

// 2. Get API key from Coinbase Developer Platform (CDP)
//    https://portal.cdp.coinbase.com/

// 3. Configure OnchainKit
NEXT_PUBLIC_ONCHAINKIT_API_KEY=your_key
NEXT_PUBLIC_CDP_API_KEY=your_key

// 4. Wrap your app with provider
<OnchainKitProvider apiKey={key} chain={base}>

// 5. Add ConnectWallet component
<ConnectWallet />

// 6. (Optional) Add paymaster for gasless UX
// Handled automatically by OnchainKit when CDP key is set

// 7. Test on Base mainnet
// Smart wallets are live on Base mainnet — no testnet needed for basic testing
```

---

## Common Mistakes

❌ **Building EOA-only apps** — excludes non-crypto users who won't install MetaMask. Use ConnectWallet which auto-detects smart wallet support.

❌ **Assuming users have ETH for gas** — new users don't. Add paymaster or show clear "you need ETH for gas" UI.

❌ **Not batching related transactions** — users hate clicking "Approve", "Confirm" twice. Bundle with executeBatch.

❌ **Storing passkey private keys** — you can't and shouldn't. Only store the public key.

❌ **Using EntryPoint v0.6 for new builds** — use v0.7. v0.6 is legacy.

✅ **Sponsor gas for first 5 transactions** — removes all friction for new users.

✅ **Check if wallet is smart wallet before using AA features** — EOA users need different flows.

✅ **Use OnchainKit's Transaction component** — handles bundling, paymaster, and error states automatically.

---

## Resources

- Coinbase Smart Wallet docs: `docs.base.org/identity/smart-wallet`
- OnchainKit: `onchainkit.xyz`
- ERC-4337 spec: `eips.ethereum.org/EIPS/eip-4337`
- Pimlico (bundler + paymaster): `docs.pimlico.io`
- Alchemy AA SDK: `alchemy.com/aa-sdk`
- CLI: `blue build "gasless app on Base"`, `blue validate --account-type erc4337`
