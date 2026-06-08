import Link from "next/link";
import type { Metadata } from "next";
import DocLayout from "../_components/DocLayout";
import CodeBlock from "../_components/CodeBlock";

export const metadata: Metadata = {
  title: "x402 payment flow · Docs · Blue Hub",
  description: "How pay-per-call USDC settlement on Base works. EIP-3009 signature, X-Payment header.",
};

export default function X402Doc() {
  return (
    <DocLayout
      title="x402 payment flow"
      intro="Pay-per-call USDC on Base. One signature, no accounts, no API keys."
    >
      <h2 className="font-mono text-lg font-bold mt-6 mb-3">The 4-step flow</h2>
      <ol className="font-mono text-[13px] text-slate-400 leading-relaxed space-y-1.5 list-decimal pl-5">
        <li>Client POSTs the request normally.</li>
        <li>Server returns <strong>HTTP 402 Payment Required</strong> with payment instructions (recipient, USDC amount, asset address).</li>
        <li>Client signs an EIP-3009 <code className="text-[#4FC3F7]">TransferWithAuthorization</code> for that amount.</li>
        <li>Client retries with the <code className="text-[#4FC3F7]">X-Payment</code> header → server validates, settles USDC, returns the real result.</li>
      </ol>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Step 1 — Request without payment</h2>
      <CodeBlock
        hint="HTTP request"
        code={`POST https://blueagent.dev/api/x402/honeypot-check
Content-Type: application/json

{ "token": "0x..." }`}
      />

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Step 2 — Server returns 402</h2>
      <CodeBlock
        hint="HTTP response"
        code={`HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "accepts": [{
    "scheme":    "exact",
    "network":   "eip155:8453",
    "asset":     "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payTo":     "0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f",
    "maxAmountRequired": "50000",
    "extra":     { "name": "USD Coin", "version": "2" }
  }]
}`}
      />

      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        <code className="text-[#4FC3F7]">maxAmountRequired</code> is in USDC base units — 6 decimals.
        <code className="text-[#4FC3F7]"> 50000</code> = $0.05.
      </p>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Step 3 — Sign the authorization</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Sign an EIP-3009 typed data structure with your wallet. Most wagmi / viem hooks handle this in one call:
      </p>

      <CodeBlock
        hint="TypeScript (viem)"
        code={`import { signTypedData } from "viem/actions";

const signature = await signTypedData(walletClient, {
  account,
  domain: {
    name:              "USD Coin",
    version:           "2",
    chainId:           8453,
    verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  types: {
    TransferWithAuthorization: [
      { name: "from",        type: "address" },
      { name: "to",          type: "address" },
      { name: "value",       type: "uint256" },
      { name: "validAfter",  type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce",       type: "bytes32" },
    ],
  },
  primaryType: "TransferWithAuthorization",
  message: {
    from:        account.address,
    to:          payTo,
    value:       BigInt(maxAmountRequired),
    validAfter:  0n,
    validBefore: BigInt(Math.floor(Date.now() / 1000) + 300),
    nonce:       randomBytes32(),
  },
});`}
      />

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Step 4 — Retry with X-Payment</h2>
      <CodeBlock
        hint="HTTP request"
        code={`POST https://blueagent.dev/api/x402/honeypot-check
Content-Type: application/json
X-Payment: <base64({ signature, authorization })>

{ "token": "0x..." }`}
      />

      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Server validates the signature, settles USDC on-chain via the CDP x402 facilitator,
        runs the tool, returns the real JSON response.
      </p>

      <div className="rounded-xl border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 p-4 my-6">
        <p className="font-mono text-sm font-bold text-[#4FC3F7] mb-2">💡 Use a client SDK</p>
        <p className="font-mono text-[12px] text-slate-400 leading-relaxed">
          The whole flow is ~3 lines with{" "}
          <a href="https://www.npmjs.com/package/@coinbase/x402" target="_blank" rel="noopener noreferrer" className="text-[#4FC3F7] hover:underline">@coinbase/x402</a>{" "}
          — handles 402 detection, signature, retry. No need to manually wire EIP-3009 unless you want to.
        </p>
      </div>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Quick reference</h2>
      <ul className="font-mono text-[13px] text-slate-400 leading-relaxed space-y-2 list-disc pl-5">
        <li><strong>Network:</strong> Base mainnet (<code className="text-[#4FC3F7]">eip155:8453</code>)</li>
        <li><strong>Asset:</strong> USDC native (<code className="text-[#4FC3F7]">0x833589fCD6…02913</code>)</li>
        <li><strong>Facilitator:</strong> Coinbase CDP x402</li>
        <li><strong>Settlement window:</strong> <code className="text-[#4FC3F7]">validBefore</code> set to ~5 min by convention</li>
        <li><strong>Revenue split:</strong> 80% to API provider, 20% to Hub treasury</li>
      </ul>
    </DocLayout>
  );
}
