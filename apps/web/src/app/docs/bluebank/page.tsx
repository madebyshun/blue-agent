import Link from "next/link";
import { DocHeader, H2, P, CardGrid, Card, Callout, PrevNext } from "../_ui";

export const metadata = { title: "BlueBank — Blue Agent Docs" };

const FEATURES = [
  { title: "Smart Wallet", color: "#4FC3F7", desc: "Open an account with Face ID — Coinbase Smart Wallet, no seed phrase. Recoverable, passkey-secured." },
  { title: "Earn", color: "#34D399", desc: "Supply idle USDC into Aave v3 or Morpho via a best-rate router. Withdraw anytime; you sign every move." },
  { title: "Send / Pay", color: "#A78BFA", desc: "Pay anyone on Base by address or Basename (name.base). USDC or ETH, instant, 24/7." },
  { title: "Scan-to-pay", color: "#4FC3F7", desc: "Scan a QR (address, Basename, or EIP-681 request) → the Send card prefills amount + recipient. Receive makes payment-request QRs." },
  { title: "Convert", color: "#fbbf24", desc: "Swap ETH / WETH / USDC / cbBTC in-app, routed via 0x. Best price, you sign, non-custodial." },
  { title: "Add cash / Cash out", color: "#34D399", desc: "Buy USDC by card / Apple Pay / bank (Coinbase Onramp) and cash out USDC → bank (Offramp). Region-gated by Coinbase." },
  { title: "Gasless", color: "#A78BFA", desc: "With a Smart Wallet, gas is sponsored by Coinbase Paymaster (EIP-5792) — no ETH needed to transact." },
  { title: "Activity", color: "#64748b", desc: "Real on-chain history — Supplied / Withdrew / Sent / Received — classified against verified Aave/Morpho addresses." },
];

export default function BlueBankDoc() {
  return (
    <article>
      <DocHeader
        eyebrow="Products"
        title="BlueBank"
        lead="A non-custodial consumer neobank on Base. Sign in with Face ID, hold USDC, earn real yield, and move money — no seed phrase, no custody. BlueBank only prepares the transaction; you sign it from your own wallet."
      />

      <Callout color="#34D399" title="Non-custodial by design">
        BlueBank never holds your keys or funds. Every action — supply, send, swap, withdraw — is signed by you and verifiable on Basescan. Base mainnet (8453) and Base Sepolia for testing.
      </Callout>

      <H2 id="features">What you can do</H2>
      <CardGrid cols={2}>
        {FEATURES.map((f) => (
          <Card key={f.title} title={f.title} color={f.color}>{f.desc}</Card>
        ))}
      </CardGrid>

      <H2 id="rails">Built on Base&apos;s consumer rails</H2>
      <P>
        BlueBank uses Base natively: <strong className="text-slate-200">Coinbase Smart Wallet</strong> (passkey onboarding),
        <strong className="text-slate-200"> Paymaster</strong> (gasless), <strong className="text-slate-200">Basenames</strong> (pay-by-name),
        <strong className="text-slate-200"> Onramp / Offramp</strong> (fiat in/out), and blue-chip DeFi (Aave v3, Morpho) for yield.
      </P>

      <Callout title="Status">
        BlueBank is in local testing and gated off production while it&apos;s finished. Testnet pass complete on Base Sepolia; mainnet pass in progress.
      </Callout>

      <P>
        Want to integrate the same money-movement primitives? See <Link href="/docs/develop" className="text-[#4FC3F7] underline">For Developers</Link>.
      </P>

      <PrevNext current="/docs/bluebank" />
    </article>
  );
}
