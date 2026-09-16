"use client";

/**
 * What can this wallet actually SEND on this chain? — the Send picker's list.
 *
 * ─── Why the list is not `[cash, ETH]` ───────────────────────────────────────
 *
 * It was. The Send card offered exactly two buttons — the chain's dollar and
 * its gas token — so a wallet holding cbBTC, a B20 share, or any RH RWA token
 * had no way to move it from the wallet screen. The portfolio table listed
 * those rows; Send could not reach them. A surface that displays an asset it
 * cannot act on is the softer half of #143/#166/#196: not a button that lies,
 * but a holding with no exit.
 *
 * ─── Where the list comes from, and why not from here ────────────────────────
 *
 * The SAME two endpoints that fill the Tokens tables:
 *
 *     base       GET /api/wallet/holdings?address=…&network=base
 *                (Moralis → keyless on-chain discovery → curated majors)
 *     robinhood  GET /api/wallet/rh-holdings?address=…             (Blockscout)
 *
 * Not a second discovery path, and deliberately not a hardcoded majors list.
 * The picker therefore cannot offer a token the portfolio does not show, and
 * cannot miss one it does — the two are the same read. `trust` is computed
 * SERVER-side by those routes, so the impostor verdict on a Send row is the
 * identical verdict the table renders; there is no client-side re-derivation to
 * drift. (Only a PASTED address is classified here, because by definition no
 * holdings read has seen it.)
 *
 * ─── What this hook may NOT be used for ──────────────────────────────────────
 *
 * `decimals` and `amount` are carried for DISPLAY. They must never reach
 * `parseUnits`. The quantity a transfer signs for is scaled by the decimals
 * `useSpendableBalance` reads ON-CHAIN at send time — see that file's header
 * for the measured USDG-at-18 bug this rule exists to prevent. A holdings
 * payload is a report about the past; a signature is a claim about now.
 *
 * ─── Three read states, never two ────────────────────────────────────────────
 *
 *   loading   the fetch is in flight — say so, do not render "no tokens"
 *   failed    it did not land. The list falls back to the two PINNED rows, and
 *             the caller must say the list is short. An empty holdings array
 *             from a dead endpoint is not "you hold nothing"; conflating those
 *             is the exact defect #211/#212/#213 fixed in the three tables.
 *   partial   it landed but is known-incomplete (Moralis unavailable → RPC
 *             majors only, RH paging cap hit, RH native unread). The rows shown
 *             are real; the LIST is short by an unknown amount.
 *
 * In all three, the paste field is the way out — which is why it is not an
 * "advanced" affordance but the first thing in the open panel.
 */

import { useEffect, useState } from "react";
import { classifyToken, type TokenTrust } from "@/lib/wallet/token-trust";
import type { WalletHolding } from "@/lib/wallet/holdings";
import type { RhHoldingsResult } from "@/lib/wallet/rh-holdings";
import { WALLET_CHAINS } from "@/lib/wallet/chains";

export type SendChain = "base" | "robinhood";

export interface SendableAsset {
  /** `null` means the chain's NATIVE gas token. Not the zero address and not
   *  the 0xeee… sentinel: a nullable is the one spelling the send path cannot
   *  accidentally hand to `writeContract` as a contract address. */
  address: `0x${string}` | null;
  /** Read, never guessed. Empty string when a pasted token's `symbol()`
   *  reverted — the caller renders the address instead of inventing a ticker. */
  symbol: string;
  name?: string;
  /** DISPLAY ONLY. See the header — never feed this to parseUnits. */
  decimals?: number;
  /** DISPLAY ONLY — what the holdings read saw, human-scale. */
  amount?: string;
  usdValue?: number;
  trust: TokenTrust;
  /** Pinned rows are the chain's native token and its cash. They are listed
   *  even at a zero balance, because "send me some ETH for gas" is a thing a
   *  user does before holding any, and because a picker whose contents depend
   *  on a read that can fail would go empty exactly when it is least helpful. */
  pinned?: boolean;
}

export interface SendableAssets {
  assets: SendableAsset[];
  loading: boolean;
  /** The holdings read did not land. `assets` is the pinned pair ONLY. */
  failed: boolean;
  /** It landed and is known short. Rows are real; the list is incomplete. */
  partial: boolean;
  /** Re-run the holdings read. */
  refetch: () => void;
}

/** Moralis/Blockscout both spell native ETH with this sentinel. */
const NATIVE_RE = /^0xe{3,}/i;

/**
 * The two rows this app pins on every chain: `[native, cash]`.
 *
 * Exported because the Send card needs the SAME pair to seed its armed asset
 * and to reset it when the chain changes. Writing that literal twice is how the
 * card ends up sending Base USDC's address on Robinhood — the wrong-chain
 * mistake `WALLET_CHAINS` exists to make impossible, re-introduced one file
 * later by a copy.
 */
export function pinnedAssets(chain: SendChain): SendableAsset[] {
  const cfg = WALLET_CHAINS[chain];
  return [
    { address: null, symbol: "ETH", decimals: 18, trust: "verified", pinned: true },
    {
      address: cfg.stable, symbol: cfg.stableSymbol, decimals: cfg.stableDecimals,
      // Classified rather than asserted: `stable` is a pinned address in
      // `VERIFIED`, so this returns "verified" — but it returns it by the same
      // function every other row goes through, not by a hand-written literal
      // that would keep saying "verified" if the config address ever changed.
      trust: classifyToken({ symbol: cfg.stableSymbol, address: cfg.stable }, chain),
      pinned: true,
    },
  ];
}

/** Sort: pinned first (native, then cash), then by value, impostors last. */
function order(a: SendableAsset, b: SendableAsset): number {
  const rank = (x: SendableAsset) =>
    x.trust === "impostor" ? 3 : x.pinned ? (x.address === null ? 0 : 1) : 2;
  const d = rank(a) - rank(b);
  if (d !== 0) return d;
  return (b.usdValue ?? 0) - (a.usdValue ?? 0);
}

/**
 * Fold a holdings row into the list, letting a real read ENRICH a pinned row
 * rather than duplicate it. Match is by address (lowercased) for ERC-20s and by
 * the native flag for gas — never by symbol, which is the whole point of
 * token-trust.ts: a ticker does not identify a token.
 *
 * EXPORTED for `scripts/send-picker-test.ts` and nothing else. It is the one
 * rule in this file with enough branches to be worth executing rather than
 * grepping — "does a read at the pinned address enrich the pin or duplicate it"
 * is a question a regex cannot answer, and a duplicated USDC row is two buttons
 * that send the same token while looking like a choice.
 */
export function mergeAssets(pins: SendableAsset[], rows: SendableAsset[]): SendableAsset[] {
  const out = [...pins];
  for (const r of rows) {
    const i = out.findIndex(p =>
      r.address === null
        ? p.address === null
        : p.address !== null && p.address.toLowerCase() === r.address.toLowerCase());
    if (i >= 0) {
      // Keep the pin's identity, take the read's figures. `trust` comes from the
      // server row when present: it was computed against the same chain with
      // the same function, and it knows about `isB20`, which a pin does not.
      out[i] = { ...out[i], amount: r.amount, usdValue: r.usdValue, name: r.name, trust: r.trust };
    } else {
      out.push(r);
    }
  }
  return out.sort(order);
}

export function useSendableAssets(
  address: `0x${string}` | undefined,
  chain: SendChain,
): SendableAssets {
  const [assets, setAssets] = useState<SendableAsset[]>(() => pinnedAssets(chain));
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [partial, setPartial] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const pins = pinnedAssets(chain);
    // Reset to the pins on every chain change, synchronously. Otherwise the
    // previous chain's rows stay on screen under the new chain's label — a
    // Robinhood token offered as a Base send, which is #219's bare-ticker
    // family in UI form.
    setAssets(pins);
    setFailed(false);
    setPartial(false);
    if (!address) return;

    let off = false;
    setLoading(true);

    const url = chain === "robinhood"
      ? `/api/wallet/rh-holdings?address=${address}`
      : `/api/wallet/holdings?address=${address}&network=base`;

    fetch(url, { cache: "no-store" })
      .then(r => r.json())
      .then((d: unknown) => {
        if (off) return;
        if (chain === "robinhood") {
          const j = d as RhHoldingsResult;
          if (!j || j.status !== "ok") { setFailed(true); return; }
          setPartial(!!j.truncated || !!j.nativeUnread);
          setAssets(mergeAssets(pins, (j.holdings ?? []).map(h => ({
            address: h.isNative || NATIVE_RE.test(h.address) ? null : (h.address as `0x${string}`),
            symbol: h.symbol, name: h.name, decimals: h.decimals,
            amount: h.amount, usdValue: h.usdValue, trust: h.trust,
          }))));
        } else {
          const j = d as { holdings?: WalletHolding[]; partial?: boolean; error?: string };
          if (!j || j.error) { setFailed(true); return; }
          setPartial(!!j.partial);
          setAssets(mergeAssets(pins, (j.holdings ?? []).map(h => ({
            address: h.isNative || NATIVE_RE.test(h.address) ? null : (h.address as `0x${string}`),
            symbol: h.symbol, name: h.name, decimals: h.decimals,
            amount: h.amount, usdValue: h.usdValue, trust: h.trust,
          }))));
        }
      })
      // A fetch that threw knows NOTHING. It is `failed`, never an empty list —
      // see the header.
      .catch(() => { if (!off) setFailed(true); })
      .finally(() => { if (!off) setLoading(false); });

    return () => { off = true; };
  }, [address, chain, nonce]);

  return { assets, loading, failed, partial, refetch: () => setNonce(n => n + 1) };
}
