# Frames & Mini Apps Guide

Grounding for `blue build` — Farcaster Frames v2, OnchainKit components, Telegram Mini Apps, gasless UX patterns.

---

## 1. What Are Frames?

Frames are **interactive apps embedded inside social media posts** — users interact without leaving the feed.

### Farcaster Frames v2 (Current Standard)

```
Farcaster Frame v2:
  - Full web app (HTML/JS/CSS) rendered in Warpcast
  - Can access user's wallet + sign transactions
  - Can show full UI (not just images + buttons like v1)
  - URL-based: any HTTPS URL with frame meta tags

Frame v1 (legacy):
  - Image + 4 buttons only
  - POST to server on button click
  - No wallet access
  - Deprecated for most use cases
```

### Telegram Mini Apps

```
Telegram Mini Apps:
  - Full web app in a Telegram bot
  - Access to user identity (telegram_id, first_name, username)
  - Payment via Stars or crypto
  - Native feel with Telegram's UI components
  
Both Frames and Mini Apps:
  - Embedded web apps in social/messaging platforms
  - User doesn't install anything
  - Share-native: tap a link → app opens inline
```

---

## 2. Farcaster Frame v2 Architecture

### Frame Metadata

```html
<!-- Your web app at https://myapp.vercel.app/ -->
<html>
  <head>
    <!-- Frame v2 meta tags -->
    <meta property="fc:frame" content="vNext" />
    <meta property="fc:frame:image" content="https://myapp.vercel.app/og-image.png" />
    
    <!-- Frame v2: URL that opens in mini-app viewer -->
    <meta property="of:version" content="vNext" />
    <meta property="of:accepts:farcaster" content="vNext" />
    <meta property="of:image" content="https://myapp.vercel.app/og.png" />
  </head>
  <body>
    <!-- Your React/Next.js app -->
  </body>
</html>
```

### Using OnchainKit for Frames

```typescript
// @coinbase/onchainkit — official toolkit for Base frames

import { FrameMetadata } from "@coinbase/onchainkit/frame";

// Next.js: generate frame metadata for a route
export async function generateMetadata(): Promise<Metadata> {
  const frameMetadata = getFrameMetadata({
    buttons: [
      { label: "Open App", action: "link", target: "https://myapp.vercel.app/app" },
    ],
    image: {
      src: "https://myapp.vercel.app/og.png",
      aspectRatio: "1.91:1",
    },
    postUrl: "https://myapp.vercel.app/api/frame",
  });
  
  return {
    title: "My Base App",
    openGraph: { ... },
    other: { ...frameMetadata },
  };
}

// App component inside the frame
export default function FrameApp() {
  return (
    <FrameProvider>
      <MyApp />
    </FrameProvider>
  );
}
```

### Frame Context and Wallet Access

```typescript
"use client";
import { useFrame } from "@coinbase/onchainkit/frame";
import { ConnectWallet, Wallet } from "@coinbase/onchainkit/wallet";
import { Transaction, TransactionButton } from "@coinbase/onchainkit/transaction";

export function SwapFrame() {
  // Access frame context: user's FID, verified address, etc.
  const { context } = useFrame();
  
  console.log("Farcaster user:", context?.user?.username);
  console.log("Verified address:", context?.user?.verifiedAddresses?.ethAddresses[0]);
  
  const calls = [
    {
      to: USDC_ADDRESS,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [RECIPIENT, parseUnits("10", 6)],
      }),
    },
  ];
  
  return (
    <div>
      <p>Hello @{context?.user?.username}</p>
      
      {/* Wallet connection — auto-connects in frame context */}
      <Wallet>
        <ConnectWallet>
          <p>Connect wallet</p>
        </ConnectWallet>
      </Wallet>
      
      {/* Transaction — one-click, no leave-app */}
      <Transaction
        chainId={8453}
        calls={calls}
        onSuccess={(receipt) => console.log("Done!", receipt)}
      >
        <TransactionButton text="Send 10 USDC" />
      </Transaction>
    </div>
  );
}
```

---

## 3. OnchainKit Components

OnchainKit is Coinbase's official React component library for Base apps.

### Wallet Components

```tsx
import {
  Wallet,
  ConnectWallet,
  ConnectWalletText,
  WalletDropdown,
  WalletDropdownBasename,
  WalletDropdownFundLink,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import { Avatar, Name, Identity } from "@coinbase/onchainkit/identity";

// Full wallet UI with Base Name, avatar, fund link
export function WalletUI() {
  return (
    <Wallet>
      <ConnectWallet>
        <Avatar className="h-6 w-6" />
        <Name />
      </ConnectWallet>
      <WalletDropdown>
        <Identity hasCopyAddressOnClick>
          <Avatar />
          <Name />
        </Identity>
        <WalletDropdownBasename />
        <WalletDropdownFundLink />
        <WalletDropdownDisconnect />
      </WalletDropdown>
    </Wallet>
  );
}
```

### Transaction Components

```tsx
import {
  Transaction,
  TransactionButton,
  TransactionSponsor,
  TransactionStatus,
  TransactionStatusAction,
  TransactionStatusLabel,
} from "@coinbase/onchainkit/transaction";
import type { Call } from "@coinbase/onchainkit/transaction";

const calls: Call[] = [
  {
    to: NFT_CONTRACT,
    data: encodeFunctionData({
      abi: nftAbi,
      functionName: "mint",
      args: [userAddress, tokenId],
    }),
  },
];

export function MintButton() {
  return (
    <Transaction
      chainId={8453}
      calls={calls}
      capabilities={{
        // Gasless via Coinbase paymaster (free for Base users)
        paymasterService: {
          url: process.env.NEXT_PUBLIC_PAYMASTER_URL!,
        },
      }}
    >
      <TransactionButton text="Mint NFT" />
      <TransactionSponsor />  {/* Shows "Gas sponsored by Coinbase" */}
      <TransactionStatus>
        <TransactionStatusLabel />
        <TransactionStatusAction />
      </TransactionStatus>
    </Transaction>
  );
}
```

### Swap Components

```tsx
import { Swap, SwapAmountInput, SwapButton, SwapMessage, SwapToggleButton } from "@coinbase/onchainkit/swap";
import type { Token } from "@coinbase/onchainkit/token";

const ETH: Token = {
  address: "",  // Empty = native ETH
  chainId: 8453,
  decimals: 18,
  name: "Ethereum",
  symbol: "ETH",
  image: "...",
};

const USDC: Token = {
  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  chainId: 8453,
  decimals: 6,
  name: "USD Coin",
  symbol: "USDC",
  image: "...",
};

export function SwapWidget() {
  return (
    <Swap>
      <SwapAmountInput label="Sell" swappableTokens={[ETH, USDC]} token={ETH} type="from" />
      <SwapToggleButton />
      <SwapAmountInput label="Buy" swappableTokens={[ETH, USDC]} token={USDC} type="to" />
      <SwapButton />
      <SwapMessage />
    </Swap>
  );
}
```

### Identity Components

```tsx
import { Address, Avatar, Badge, Identity, Name } from "@coinbase/onchainkit/identity";

// Display user's Base Name (like ENS for Base)
export function UserProfile({ address }: { address: Address }) {
  return (
    <Identity address={address} hasCopyAddressOnClick>
      <Avatar />
      <Name />       {/* Shows basename (e.g., "vitalik.base") or truncated address */}
      <Address />    {/* Shows 0x... address */}
      <Badge />      {/* Verified badge if they have a basename */}
    </Identity>
  );
}
```

---

## 4. Gasless UX — Coinbase Paymaster

```typescript
// For Base apps: users can transact without ETH for gas

// 1. Get paymaster URL from Coinbase Developer Platform
const PAYMASTER_URL = process.env.NEXT_PUBLIC_PAYMASTER_URL;

// 2. Use with viem/wagmi
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { createSmartAccountClient } from "permissionless";
import { coinbaseSmartAccount } from "permissionless/accounts";

const smartAccount = await coinbaseSmartAccount(publicClient, {
  owners: [walletClient],
});

const smartAccountClient = createSmartAccountClient({
  account: smartAccount,
  chain: base,
  bundlerTransport: http(PAYMASTER_URL),
  middleware: {
    sponsorUserOperation: paymasterClient.sponsorUserOperation,
  },
});

// Now send transactions — user pays NO gas
const txHash = await smartAccountClient.sendTransaction({
  to: NFT_CONTRACT,
  data: encodeFunctionData({ abi: nftAbi, functionName: "mint", args: [...] }),
});
```

### Coinbase Smart Wallet + Paymaster

```tsx
import { OnchainKitProvider } from "@coinbase/onchainkit";

// Wrap your app — automatic paymaster for all OnchainKit transactions
export function App({ children }: { children: ReactNode }) {
  return (
    <OnchainKitProvider
      apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
      chain={base}
      config={{
        appearance: {
          name: "My Base App",
          logo: "/logo.png",
          mode: "dark",  // or "light" or "auto"
          theme: "base",
        },
        wallet: {
          display: "modal",
          termsUrl: "https://myapp.com/terms",
          privacyUrl: "https://myapp.com/privacy",
        },
      }}
    >
      {children}
    </OnchainKitProvider>
  );
}
```

---

## 5. Telegram Mini App Architecture

### Setup

```javascript
// Telegram Mini App runs inside Telegram's WebView
// Access Telegram context via window.Telegram.WebApp

const tg = window.Telegram.WebApp;

// Initialize
tg.ready();                    // Tell Telegram the app is ready
tg.expand();                   // Expand to full height

// User data (passed from Telegram, verified server-side)
console.log(tg.initDataUnsafe.user.id);         // Telegram user ID
console.log(tg.initDataUnsafe.user.username);   // @username
console.log(tg.initDataUnsafe.user.first_name); // First name

// UI customization
tg.MainButton.setText("Buy Now");
tg.MainButton.show();
tg.MainButton.onClick(() => handlePurchase());

tg.BackButton.show();
tg.BackButton.onClick(() => navigate(-1));
```

### Validating initData Server-Side

```typescript
// IMPORTANT: Validate initData on server before trusting user identity
import * as crypto from "crypto";

function validateTelegramWebAppData(initData: string, botToken: string): boolean {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  params.delete("hash");
  
  // Sort params alphabetically
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  
  // HMAC-SHA256 with secret key derived from bot token
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  
  return hash === expectedHash;
}

// API route handler
app.post("/api/verify", (req, res) => {
  const { initData } = req.body;
  const isValid = validateTelegramWebAppData(initData, process.env.BOT_TOKEN!);
  
  if (!isValid) {
    return res.status(401).json({ error: "Invalid Telegram data" });
  }
  
  const params = new URLSearchParams(initData);
  const user = JSON.parse(params.get("user")!);
  res.json({ userId: user.id, username: user.username });
});
```

### Telegram Mini App + Base Wallet

```typescript
// Connect Telegram identity to Base wallet
// Pattern: Telegram user → link to ETH address → sign TG user ID

async function linkTelegramToWallet(
  telegramUserId: number,
  userAddress: Address,
  signature: Hex
): Promise<void> {
  // User signs their Telegram user ID with their ETH wallet
  const message = `Link Telegram ${telegramUserId} to ${userAddress}`;
  const isValid = await verifyMessage({ address: userAddress, message, signature });
  
  if (!isValid) throw new Error("Invalid signature");
  
  // Store link: telegramUserId → ethAddress
  await db.upsert("telegram_links", {
    telegram_id: telegramUserId,
    eth_address: userAddress,
    linked_at: new Date(),
  });
}
```

---

## 6. Frame vs Mini App Comparison

| Feature | Farcaster Frame v2 | Telegram Mini App |
|---|---|---|
| Platform | Warpcast, other Farcaster clients | Telegram |
| Auth | Farcaster account + verified ETH address | Telegram user ID |
| Wallet access | Native (Coinbase Smart Wallet, MetaMask) | Requires WalletConnect or in-app wallet |
| UI | Full web app | Full web app |
| Distribution | Cast (post) → any Farcaster client | Bot message → tap button |
| Gasless | Via Coinbase paymaster (easy) | Via paymaster (manual setup) |
| User base | ~500K+ Farcaster users | 900M+ Telegram users |
| Crypto-native | Yes (most users have wallets) | Mixed (many non-crypto users) |

---

## 7. Example: One-Click Mint Frame

```tsx
// Complete example: NFT mint inside a Farcaster Frame

// app/page.tsx — frame entry point
import { Metadata } from "next";
import { getFrameMetadata } from "@coinbase/onchainkit/frame";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Mint Blue Agent NFT",
    other: getFrameMetadata({
      buttons: [{ label: "Mint NFT →", action: "link", target: "https://myapp.vercel.app/mint" }],
      image: { src: "https://myapp.vercel.app/nft-preview.png", aspectRatio: "1:1" },
    }),
  };
}

// app/mint/page.tsx — actual mint UI
"use client";
import { Transaction, TransactionButton, TransactionSponsor } from "@coinbase/onchainkit/transaction";
import { ConnectWallet, Wallet } from "@coinbase/onchainkit/wallet";
import { useAccount } from "wagmi";
import { encodeFunctionData } from "viem";

const NFT_CONTRACT = "0x...";  // Verify on Basescan
const nftAbi = [...] as const;

export default function MintPage() {
  const { address, isConnected } = useAccount();
  
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center gap-4 p-8">
        <h1>Blue Agent NFT</h1>
        <Wallet><ConnectWallet /></Wallet>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col items-center gap-4 p-8">
      <img src="/nft-preview.png" alt="NFT" className="w-64 h-64 rounded-xl" />
      <h1 className="text-2xl font-bold">Blue Agent NFT</h1>
      <p className="text-gray-400">Minting to {address?.slice(0, 6)}...{address?.slice(-4)}</p>
      
      <Transaction
        chainId={8453}
        calls={[{
          to: NFT_CONTRACT,
          data: encodeFunctionData({
            abi: nftAbi,
            functionName: "mint",
            args: [address!],
          }),
        }]}
        capabilities={{
          paymasterService: { url: process.env.NEXT_PUBLIC_PAYMASTER_URL! },
        }}
        onSuccess={(receipt) => alert("Minted! " + receipt.transactionHash)}
      >
        <TransactionButton text="Mint Free (Gas Sponsored)" />
        <TransactionSponsor />
      </Transaction>
    </div>
  );
}
```

---

## 8. Distribution Strategy

### Frame Distribution on Farcaster

```
1. Cast the frame URL → appears in feed as interactive card
2. Target channels: /dev, /base, /defi for technical frames
3. Frame analytics: use hub.farcaster.xyz to track interactions
4. Viral mechanic: frame actions that require sharing to unlock
5. Notifications: Farcaster v2 frames can send push notifications
   (user must opt-in via frame UI)
```

### Telegram Mini App Distribution

```
1. Create bot: @BotFather → /newbot → get token
2. Set web app: /setmenubutton or inline keyboard button
3. Deep links: t.me/MyBot/app?startapp=ref123
   (startapp param passes referral/routing data)
4. Channels: Post bot link in Telegram channels
5. Inline mode: Users type @MyBot in any chat → your app appears
```

---

## Common Mistakes

❌ **Forgetting to validate Telegram initData server-side** — trivially spoofed without validation. Never trust client-only.

❌ **Building Frame v1 (image + buttons) in 2025** — Frame v2 with full web app is the standard now.

❌ **Not handling wallet disconnection gracefully** — user can disconnect mid-flow. Always check `isConnected`.

❌ **Using mainnet in a frame** — always Base (chain ID 8453). Frames are Base-native.

❌ **Paymaster URL in client-side env without restrictions** — add domain/IP allowlist in Coinbase Developer Platform.

✅ **Use OnchainKit for Base frames** — saves 80% of implementation time vs building from scratch.

✅ **Test frames with Warpcast frame validator** — `warpcast.com/~/developers/frames` before posting.

✅ **Gasless UX via paymaster** — removes the biggest onboarding friction for new users.

---

## Resources

- OnchainKit: `onchainkit.xyz`
- OnchainKit docs: `docs.base.org/buildkit`
- Farcaster frames spec: `docs.farcaster.xyz/developers/frames`
- Warpcast frame validator: `warpcast.com/~/developers/frames`
- Telegram Mini Apps: `core.telegram.org/bots/webapps`
- Coinbase paymaster: `docs.cloud.coinbase.com/developer-platform/docs/paymaster`
- Related skills: `base-account-integration.md`, `account-abstraction-deep-dive.md`
- CLI: `blue build "Farcaster frame on Base"`, `blue build "Telegram mini app with wallet"`
