"use client";

/**
 * Sponsored gas, client half (server half: lib/paymaster-token.ts).
 *
 * A wallet saying it SUPPORTS a paymaster is no longer enough to promise
 * "gasless": since 2026-09-30 /api/paymaster only sponsors a signed-in wallet's
 * own operations. So a card asks two questions — can the wallet do it (its
 * EIP-5792 capability), and will we sponsor THIS wallet (a token from
 * /api/paymaster/token, which reads the SIWE session and the wallet's hourly
 * sponsorship budget) — and shows the badge only when both are yes.
 *
 * `sendCalls()` mints a new token at send time rather than reusing the one the
 * badge was drawn from: tokens live 15 minutes, and a card can sit open longer.
 * No token means "send without sponsorship" — never an error: not signed in, a
 * DIFFERENT wallet signed in (the paymaster would refuse its sender), no
 * paymaster configured, or this wallet's budget is spent or unreadable.
 *
 * And a token is not a promise either. The paymaster can still refuse a send
 * it was minted for — the budget ran out between mint and call, or the token
 * expired while a wallet popup sat open — and a wallet REJECTS a batch whose
 * paymaster capability fails (EIP-5792: the capability is not optional). Until
 * 2026-10-01 nothing handled that: the card showed the error, kept its "gas
 * sponsored" badge, and every retry failed the same way for up to an hour,
 * while the refusal text told the user to "send without sponsorship" — which
 * no control on the card could do. `sendWithSponsorFallback` is that control:
 * a refused send is retried ONCE with no paymaster, so the wallet asks the
 * user for gas, and the card stops advertising sponsorship for this wallet.
 *
 * Both send cards go through `sendCalls` — WalletSendCard (/app/bank, and chat)
 * and ToolCards' SendCard (/pay/[address]) — so the fallback cannot drift
 * between them.
 */
import { useCallback, useEffect, useState } from "react";
import { sessionFetch } from "@/lib/session-client";

export type SponsoredNetwork = "base" | "baseSepolia";

/** The ERC-8021 builder-code capability every card attaches (optional:true). */
export type DataSuffixCapability = { value: `0x${string}`; optional?: boolean };

/** What a sponsored-or-not EIP-5792 send hands `wallet_sendCalls`. */
export type SendCapabilities = {
  dataSuffix: DataSuffixCapability;
  paymasterService?: { url: string };
};

export async function fetchSponsoredPaymasterUrl(
  network: SponsoredNetwork,
  account: string | undefined,
): Promise<string | null> {
  if (!account || typeof window === "undefined") return null;
  try {
    const r = await sessionFetch("/api/paymaster/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { token?: unknown; wallet?: unknown };
    if (typeof j.token !== "string" || typeof j.wallet !== "string") return null;
    if (j.wallet.toLowerCase() !== account.toLowerCase()) return null;
    return `${window.location.origin}/api/paymaster?network=${network}&t=${encodeURIComponent(j.token)}`;
  } catch {
    return null;
  }
}

// The codes /api/paymaster refuses with: -32001 no/bad/expired token, -32002
// sender is not the signed-in wallet, -32003 wrong chain, -32005 budget spent
// or unreadable. Every one of its refusal messages also says "gas sponsorship".
const REFUSAL_CODES = new Set([-32001, -32002, -32003, -32005]);

/**
 * Did this `wallet_sendCalls` fail because the PAYMASTER refused it?
 *
 * Walks the error's `cause` chain (viem wraps the wallet's JSON-RPC error, and
 * wallets wrap the paymaster's) looking for one of the refusal codes above or
 * for "paymaster" / "gas sponsorship" in the text. A user cancel is never a
 * refusal, even when the text mentions the paymaster: the user said no, and
 * answering with a second prompt would be the card overruling them.
 *
 * Why retrying on this is SAFE, not just convenient: the paymaster is asked
 * before the user operation is signed, and a refused paymaster call means
 * there is nothing to sign — no operation went out. Transport errors (a popup
 * closed after approval, a timeout) carry neither the codes nor the words, so
 * they are NOT retried: that is the one case where a second prompt could send
 * the same transfer twice.
 */
export function isSponsorshipRefusal(e: unknown): boolean {
  const codes: number[] = [];
  const texts: string[] = [];
  let cur: unknown = e;
  for (let depth = 0; depth < 8 && cur != null; depth++) {
    if (typeof cur === "string") { texts.push(cur); break; }
    if (typeof cur !== "object") break;
    const o = cur as { code?: unknown; message?: unknown; shortMessage?: unknown; details?: unknown; cause?: unknown };
    if (typeof o.code === "number") codes.push(o.code);
    for (const t of [o.message, o.shortMessage, o.details]) if (typeof t === "string") texts.push(t);
    cur = o.cause;
  }
  const text = texts.join("\n");
  if (codes.includes(4001) || /user (rejected|denied|cancell?ed)|rejected by (the )?user/i.test(text)) return false;
  return codes.some((c) => REFUSAL_CODES.has(c)) || /paymaster|gas sponsorship/i.test(text);
}

/**
 * Send with sponsorship when there is a paymaster URL, and fall back to
 * user-paid gas — once — if the paymaster refuses. Without a URL it is a plain
 * user-paid send. Any other failure (a cancel, a revert, a transport error) is
 * rethrown untouched for the card to show.
 */
export async function sendWithSponsorFallback<R>(opts: {
  paymasterUrl: string | null;
  dataSuffix: DataSuffixCapability;
  send: (capabilities: SendCapabilities) => Promise<R>;
  onRefused: () => void;
}): Promise<R> {
  const { paymasterUrl, dataSuffix, send, onRefused } = opts;
  if (!paymasterUrl) return send({ dataSuffix });
  try {
    return await send({ paymasterService: { url: paymasterUrl }, dataSuffix });
  } catch (e) {
    if (!isSponsorshipRefusal(e)) throw e;
    onRefused();
    return send({ dataSuffix });
  }
}

export function useSponsoredGas(
  network: SponsoredNetwork,
  account: string | undefined,
  walletSupportsPaymaster: boolean,
) {
  const [minted, setMinted] = useState(false);
  // The wallet+network our paymaster refused while this card was open. Keyed,
  // not a boolean: the budget is per wallet, so switching wallet or network
  // starts clean, and a refusal on one says nothing about another.
  const [refusedFor, setRefusedFor] = useState<string | null>(null);
  const key = `${network}:${(account ?? "").toLowerCase()}`;
  const sponsored = walletSupportsPaymaster && minted && refusedFor !== key;

  useEffect(() => {
    let live = true;
    if (!walletSupportsPaymaster || !account) {
      setMinted(false);
      return;
    }
    fetchSponsoredPaymasterUrl(network, account).then((url) => {
      if (live) setMinted(url !== null);
    });
    return () => { live = false; };
  }, [network, account, walletSupportsPaymaster]);

  const sendCalls = useCallback(
    async <R>(send: (capabilities: SendCapabilities) => Promise<R>, dataSuffix: DataSuffixCapability): Promise<R> => {
      // Only a card showing the badge asks for a token, so the badge and the
      // attempt can never disagree in the direction of a surprise gas prompt.
      const paymasterUrl = sponsored ? await fetchSponsoredPaymasterUrl(network, account) : null;
      // The badge was drawn from an older token; if none is minted NOW (budget
      // spent since), the badge is stale — drop it along with the paymaster.
      if (sponsored && paymasterUrl === null) setMinted(false);
      return sendWithSponsorFallback({
        paymasterUrl,
        dataSuffix,
        send,
        onRefused: () => setRefusedFor(key),
      });
    },
    [sponsored, network, account, key],
  );

  return { sponsored, sendCalls };
}
