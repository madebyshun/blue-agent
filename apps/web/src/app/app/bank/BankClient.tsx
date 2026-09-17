"use client";

// BlueBank dashboard — responsive grid layout: sidebar | grid content.
// Non-custodial Base neobank: real on-chain balances (wagmi), real transactions
// (Moralis). Nothing is fabricated.
//
// This wallet does NOT sell yield. The Earn entrance was closed one release ago
// (supply deferred to phase 2) and this one removes the shop window that stayed
// up after it: the APY boards, the rate sparkline, the DeFi app grid. What
// survives is the part that is about the user's own money — a position they
// already hold, and the exit from it. See the `earn*` block below.

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useAccount, useReadContract, useBalance } from "wagmi";
import { resolveRead } from "@/lib/wallet/read-state";
import { useWalletDisconnect } from "@/lib/walletSession";
import { useWallet } from "@/hooks/useWallet";
import PrivyLoginButton from "@/components/PrivyLoginButton";
import { PRIVY_ENABLED, describeLoginMethods } from "@/lib/privy/config";
import { formatUnits } from "viem";
import { QRCodeSVG } from "qrcode.react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { WALLET_CHAINS, WALLET_CHAIN_ORDER, type WalletChain } from "@/lib/wallet/chains";
// The two view-only switches, defined once for the card and all three tables.
// Read `lib/wallet/display.ts` before changing either — both are display-only by
// contract: a hidden row is still counted, and unpriced is never dust.
import { DUST_USD, maskFigure } from "@/lib/wallet/display";
import { warmRhHoldings } from "@/lib/wallet/rh-holdings-cache";
// ⚠️ EARN-ONLY import, and now WITHDRAW-only: the contract addresses needed to
// read a position the user already holds and hand them back out of it. The
// wallet's identity (chain, explorer, what counts as cash) comes from
// @/lib/wallet/chains — nothing here decides what the wallet IS.
//
// `AAVE_POOL_ABI` + `supplyApyPct` were dropped with the rate boards: an APY is
// only actionable if you can supply more, and you can't.
import { YIELD_NETWORKS, ERC20_ABI, ERC4626_ABI, VENUES } from "@/lib/yield-execution";
import { MoveToYieldCard } from "@/app/chat/components/ToolCards";
import { useBasename, shortAddr } from "@/lib/useBasename";
import Avatar from "@/components/Avatar";
import { useSpendSummary, scopeLabel, emptyState, creditSplit, usdc as fmtUsdcUnits, type Load as SpendLoad, type SpendSummaryDTO } from "@/components/SpendConsole";
import QrScanner from "./QrScanner";
import SwapCard, { type SellPreset } from "./SwapCard";
// SEND is one unified, chain-in-card component now (WalletSendCard): it carries
// its OWN Base/Robinhood selector and ports both proven money paths — a plain
// transfer on Base, /api/robinhood/router/send-prepare on 4663 — so the wallet no
// longer needs a top switcher to reach an RH send. It replaces the old
// `network === "robinhood" ? <RhSendCard> : <SendCard>` split; RhSendCard.tsx
// was left in the tree unused after that and is now DELETED, so there is no
// second RH send implementation to drift. CONVERT is still split by chain: RhSwapCard speaks
// the deployed RobinhoodSwapRouter on 4663 directly, and must mount BEFORE any
// `can.swap`-based Base mount because the Base SwapCard force-switches the wallet
// to Base mainnet before signing — letting a true `can.swap` fall through to it
// on 4663 would sign a Base swap under a Robinhood heading. See the
// `can.send`/`can.swap` note in lib/wallet/chains.ts.
import WalletSendCard from "./WalletSendCard";
import RhSwapCard from "./RhSwapCard";
// BRIDGE is the third money path and the only one that spans both chains at
// once. Like SEND it carries its own direction picker in-card, so there is no
// chain branch here either; unlike SEND and CONVERT it does not ask `can.*`,
// because the question "can this wallet bridge?" is answered by Relay's live
// list, not by the chain the wallet happens to be connected to.
import BridgeCard from "./BridgeCard";
import { Picker, PickerRow } from "@/components/wallet/Picker";
import { WalletCard, Field, NetworkPicker, CardNote } from "@/components/wallet/CardShell";
import { parsePaymentQr, buildPaymentUri, type ParsedPayment } from "@/lib/payment-qr";
// `B20_ENABLED` was imported alongside this, purely to hide the Orders tab.
// OrdersPanel reads the same flag itself and renders its own degraded-mode
// banner from it, so gating the entrance here only ever meant the user could
// not reach the explanation. See the VIEWS list below.
import OrdersPanel from "./OrdersPanel";
import TransactionHistory, { type WalletTx, type TxSource } from "./TransactionHistory";
import TokenTable from "./TokenTable";
import RhTokenTable from "./RhTokenTable";
import StockTable from "./StockTable";
import type { WalletHolding } from "@/lib/wallet/holdings";
import { useWalletIdentity } from "@/lib/wallet/identity";
import { useNetWorth } from "@/lib/wallet/useNetWorth";
// WHO is signed in, as opposed to WHAT wallet is attached — see the note at the
// `identityCard` derivation below for why this page needs both and why they are
// not the same import.
import { resolveIdentity } from "@/lib/identity/account-identity";
import { usePrivyIdentity } from "@/lib/privy/identity-bridge";
import { buildWalletState } from "@/lib/state";

const usd = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// A `CAMPAIGNS` array sat here with two entries — "Base Ecosystem Fund" and
// "Morpho Boost · +0.5% APY on USDC deposits" — and NOTHING rendered it. Dead
// on arrival, but the second one is why it goes in this commit rather than a
// tidy-up: it advertised a deposit bonus for an entrance that is closed, and a
// dead advert is one `{CAMPAIGNS.map(…)}` away from being a live lie.

// "withdraw" was "earn" until yield was deferred to phase 2. The panel still
// renders MoveToYieldCard, but withdraw-only: no new supply can be started from
// this surface, while anyone already deposited keeps a way out.
//
// `orders` left this union for the page-level `View` below. It was the one tab
// here that is not a transaction you start and finish in a modal — payment
// requests are a list you keep, come back to, and reconcile against — and it
// was gated on B20_ENABLED, which is off, so the panel had NO entrance at all
// while its own copy said "payment links work now". A feature with no door.
//
// `positions` left it too (not public yet). It was a READ — two rows restating
// the Aave/Morpho figures the account card already breaks out — parked in the
// modal you open to DO something, and it was the default tab, so every action
// click landed on a read-only screen first. The numbers stay where they were
// always visible; what went is the duplicate. The `withdraw` EXIT is untouched
// and still has its own tab: closing an entrance must never close an exit.
//
// `bridge` joined it 2026-09-11, once the bridge was PROVEN to work end to end
// (#253: our own `referrer` field was 401-ing every Relay quote, so the feature
// had an entrance in chat and no working path behind it). The order of those two
// facts is the rule — a button that opens a dead path is #143/#166/#196 again,
// and this one would have been dead in every direction for every token.
type Panel = "withdraw" | "send" | "receive" | "convert" | "bridge";

// The page's own long-tail sections, one at a time. Distinct from `Panel`:
// a Panel is a thing you DO (and it lives in a modal you dismiss), a View is a
// record you READ. Conflating them is what put Orders in a modal.
//
// `portfolio` SPLIT into `tokens` + `stocks` — the MetaMask tab shape the design
// asked for. It was one tab stacking six tables (three chains × crypto + equity),
// and with both real chains shown at once (the switcher is gone) the answer to
// "do I still hold NVDA?" was four scroll-screens below the fold. Tokens and
// stocks are different asset classes read from different sources, so they were
// already two questions sharing one tab.
//
// They stay SIBLINGS of activity/orders rather than nesting under a parent
// "Portfolio": a second tab row inside a tab is a place for state to hide. Both
// honour the same chain filter and the same dust toggle, so switching between
// them changes the asset class and nothing else.
type View = "tokens" | "stocks" | "activity" | "orders";

/** The two views that answer "what do I hold?" — the filter + dust controls
 *  belong to both of them and to neither of the other two. */
const isHoldingsView = (v: View) => v === "tokens" || v === "stocks";

// Sticky testnet unlock. Deliberately NOT the same key family as `bluebank:*`
// user settings — this is a developer escape hatch, not a preference.
const TESTNET_KEY = "bluebank:testnet";

// Hide-balances (the eye toggle, as in MetaMask). A DISPLAY preference and
// nothing else: it masks rendered figures, it cancels no read and changes no
// derivation, so a masked wallet behaves exactly like an unmasked one. Sticky
// because the reason to hide — someone can see your screen — outlives a reload.
const HIDE_BAL_KEY = "bluebank:hide-balances";
// Sticky dust filter, same reasoning: "stop showing me sub-dollar rows" is a
// standing preference, not a per-visit one.
const HIDE_DUST_KEY = "bluebank:hide-dust";

export default function BankPage() {
  // `chainId`/`chain` are deliberately NOT read here. The wallet's own chain is
  // a per-SIGNATURE concern now, owned by whichever action card is about to
  // sign (see the note where the mismatch banner used to live). Reading it at
  // page level only ever produced a comparison against a "current network" this
  // two-chain page no longer has.
  const { address, isConnected } = useAccount();
  const acct = address as `0x${string}` | undefined;

  // Cross-chain net worth — tokens + tokenized stocks on EVERY live chain, from
  // /api/wallet/net-worth. Called unconditionally at the top (React hook rules)
  // and no-ops when `acct` is undefined. It is READ-ONLY: it feeds the headline
  // figure, the per-chain $ on the sidebar, and nothing else. It never touches
  // the vetted single-chain `walletState.balance` / `balanceRead` derivation,
  // which still drives the health score, the missions, and the Base breakdown.
  const netWorth = useNetWorth(acct);

  // AGENT SPEND — the SAME hook /app/usage calls, against the same endpoint.
  //
  // This card used to be a bare link with no figures on it, which is why it read
  // as "not working": it named a number and then showed a chevron. #199 moved
  // the full <SpendConsole> to /app/usage for a good reason — two pages deriving
  // one ledger can disagree — and that reason is preserved here by REUSING the
  // derivation rather than copying it. `useSpendSummary` is the only fetch,
  // `scopeLabel` and `emptyState` are the only readings of it, so the wallet
  // literally cannot print a different number from the console it links to.
  const spend = useSpendSummary(acct);

  // Warm the Robinhood holdings read as soon as we know the address.
  //
  // `RhTokenTable` lives behind `showsChain("robinhood")`, so it does not exist
  // — and cannot start reading — until the user switches the chain filter to it.
  // That made the FIRST switch the slowest thing on this page: mount, fetch,
  // spinner, against an explorer measured at up to 16s on its tail (see
  // `blockscout.ts`). The read does not depend on the filter, only on the
  // address, so there is no reason to wait for the click.
  //
  // This is a prefetch, not a second reader: it goes through the same cache
  // entry the table uses, so warming can never produce a duplicate request or a
  // second answer that disagrees with the first. Nothing renders from it here.
  useEffect(() => {
    if (acct) warmRhHoldings(acct);
  }, [acct]);

  // Why the headline is a floor, in the SERVER's words — never ours. Each chain
  // ships its own `reasons`, and the same reason is usually true on more than
  // one chain ("some stocks have no price" holds on both today), so they are
  // de-duped; a chain that answered nothing at all contributes a reason of its
  // own, because `usd: 0` from an unreachable chain is ignorance, not an empty
  // wallet. This is the difference between "≥ $5.48" and "≥ $5.48 because the
  // token list fell back to majors" — the second is auditable, the first asks
  // the user to trust a symbol.
  const floorReasons = useMemo(() => {
    const out = new Set<string>();
    for (const c of netWorth.data?.chains ?? []) {
      const label = WALLET_CHAINS[c.chain]?.short ?? c.chain;
      if (c.status === "unavailable") out.add(`${label} could not be read`);
      for (const r of c.reasons) out.add(r);
    }
    return [...out];
  }, [netWorth.data]);

  // The same verdict as a boolean, because two places in the JSX below need it
  // and a statement cannot go there. `failed` is checked FIRST and separately:
  // a failed read still carries a `data` object, so `data.total.isFloor` on its
  // own would call a read that produced nothing "a floor" — a floor is a claim
  // about a measured amount, and there isn't one.
  const totalIsFloor = !netWorth.failed && !!netWorth.data && netWorth.data.total.isFloor;
  const { name } = useBasename(acct);
  const [fname, setFname] = useState<string | null>(null);
  useEffect(() => {
    if (!acct || name) { setFname(null); return; }
    fetch(`https://hub.pinata.cloud/v1/userDataByVerification?address=${acct}`)
      .then(r => r.json())
      .then(d => {
        const messages = d?.messages ?? [];
        const fid = messages[0]?.data?.fid;
        if (!fid) return;
        return fetch(`https://hub.pinata.cloud/v1/userDataByFid?fid=${fid}&user_data_type=6`)
          .then(r2 => r2.json())
          .then(d2 => {
            const v = d2?.messages?.[0]?.data?.userDataBody?.value;
            if (v) setFname(v);
          });
      })
      .catch(() => null);
  }, [acct, name]);
  const disconnect = useWalletDisconnect();

  // ── Who is this? ───────────────────────────────────────────────────────────
  //
  // TWO different things on this page are called "identity" and they answer
  // different questions. `identity` (further down, `useWalletIdentity`) is about
  // the WALLET — connector family, smart account, passkey. `identityCard` is
  // about the PERSON. Keeping the names apart is the point; conflating them is
  // how a greeting ends up addressing someone by their connector.
  //
  // The ladder is `resolveIdentity`, imported from
  // lib/identity/account-identity.ts and shared with the account menu in the app
  // shell and with /signup. That is the fix: this page had its own local ladder
  // (`name ?? fname ?? shortAddr`), inline in four places, with NO social rung at
  // all — so a user who signed in with Google, GitHub, Discord or email had a
  // real name in the shell's account menu directly above this header and a raw
  // `0x2266…608E` here, on the same screen, two inches apart: an identifier they
  // have never seen and did not choose. One ladder means the two places agree by
  // construction rather than by two copies happening to be edited together.
  //
  // `fname` goes THROUGH the ladder as `farcasterName` rather than being spliced
  // in after it. This call site used to do the splice itself — `who.source ===
  // "address" ? (fname ?? who.displayName) : …` — which produced the right
  // string with the WRONG PROVENANCE: the card still read `source: "address"`
  // while displaying a Farcaster handle, so every consumer that branches on
  // `source` (the greeting below is one) was reading a label that did not
  // describe the value beside it. The ladder now owns a `farcaster` rung at
  // exactly the rank the splice gave it — below a Basename, above a bare
  // address — and the label matches the value by construction.
  //
  // `usePrivyIdentity()` is a plain `useContext` and returns `null` on the
  // Privy-off tree, so this is safe to call unconditionally on both trees.
  const privy = usePrivyIdentity();
  const identityCard = resolveIdentity({
    social: privy?.social ?? null,
    basename: name ?? null,
    farcasterName: fname,
    address: acct ?? null,
    shortAddress: acct ? shortAddr(acct) : null,
  });
  // TRUE only when we have a name a human chose. The greeting hangs off this:
  // "Good evening, 0x9f3a…c41d" addresses a hex string in the second person,
  // and no fallback string fixes that — the fix is not to use the personal
  // register when we do not know the person.
  const isNamed = identityCard.source != null && identityCard.source !== "address";
  // Total (`string`, never null) so no consumer has to re-guess a fallback —
  // that re-guessing is how four different ladders got here in the first place.
  // The trailing `shortAddr` is `resolveIdentity`'s own last rung repeated for
  // the nothing-connected case, where there is no address to shorten either.
  const displayName = identityCard.displayName ?? shortAddr(acct);

  // ── Network ──────────────────────────────────────────────────────────────
  // Base MAINNET is the default and must stay that way. This used to default to
  // `baseSepolia` while every label around it said "Base", so the receive QR,
  // the payment link, and the transaction list were all testnet while the UI
  // claimed mainnet — a money-adjacent lie, not a cosmetic one.
  //
  // Testnet is now OPT-IN: the toggle does not render at all unless testnet mode
  // is unlocked with `?testnet=1` (sticky, cleared with `?testnet=0`). A normal
  // user therefore has no way to land on Sepolia by a stray click, and when
  // testnet IS active a banner says so in the one place they cannot miss.
  //
  // Both pieces of state start at their SSR-safe values and are only widened in
  // an effect — reading localStorage/searchParams during the first render would
  // hydration-mismatch, and the safe value (mainnet, locked) is the right first
  // paint anyway.
  // The wallet's home chain is Base, and it NO LONGER SWITCHES. The global
  // chain switcher (the sidebar CHAINS buttons + the mobile toggle) was removed:
  // it changed a heading and a balance figure and little else, while the actions
  // that genuinely differ per chain — Convert, Receive, Send — each now carry
  // their OWN chain selector. `network` is therefore a constant. It is typed as
  // the WIDE `WalletChain`, not the literal `"base"`, so the per-chain reads
  // below (`net.can`, `earnKey`, the tx-history fetch) keep type-checking against
  // Robinhood and Sepolia without TS collapsing them to dead branches.
  const network: WalletChain = "base";
  // Testnet stays OPT-IN (`?testnet=1`, sticky) but is no longer a global MODE —
  // nothing flips the whole page to Sepolia. All the flag does now is reveal a
  // testnet SECTION in the portfolio and a testnet OPTION in Receive, each of
  // which labels itself "test-only" locally. So this reads the flag and stops.
  const [testnetUnlocked, setTestnetUnlocked] = useState(false);
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("testnet");
      if (q === "1")      localStorage.setItem(TESTNET_KEY, "1");
      else if (q === "0") localStorage.removeItem(TESTNET_KEY);
      setTestnetUnlocked(localStorage.getItem(TESTNET_KEY) === "1");
    } catch { /* private mode — stay locked on mainnet */ }
  }, []);

  // Eye toggle. Starts SHOWN and is read from storage in an effect rather than
  // in the initialiser — `localStorage` does not exist during the server render,
  // and a lazy initialiser that touched it would hydrate-mismatch.
  const [hideBal, setHideBal] = useState(false);
  useEffect(() => {
    try { setHideBal(localStorage.getItem(HIDE_BAL_KEY) === "1"); } catch { /* private mode */ }
  }, []);
  const toggleHideBal = () => {
    setHideBal(h => {
      const next = !h;
      try { next ? localStorage.setItem(HIDE_BAL_KEY, "1") : localStorage.removeItem(HIDE_BAL_KEY); }
      catch { /* private mode — the toggle still works for this session */ }
      return next;
    });
  };
  /** Wrap a figure we WOULD have rendered. Never wraps a dash or an "unread". */
  const priv = (s: string) => maskFigure(s, hideBal);

  // Dust filter — the second half of "để không phải cuộn nhiều". Owned here and
  // pushed DOWN into the three tables rather than kept inside each of them, so
  // one control governs Base tokens, RH tokens and both stock venues at once and
  // they cannot disagree about what a small row is.
  const [hideDust, setHideDust] = useState(false);
  useEffect(() => {
    try { setHideDust(localStorage.getItem(HIDE_DUST_KEY) === "1"); } catch { /* private mode */ }
  }, []);
  const setDust = (next: boolean) => {
    setHideDust(next);
    try { next ? localStorage.setItem(HIDE_DUST_KEY, "1") : localStorage.removeItem(HIDE_DUST_KEY); }
    catch { /* private mode — the toggle still works for this session */ }
  };

  // Hoisted above the onramp handlers on purpose: `addCash` / `cashOut` read
  // `isTestnet` to refuse a mainnet-only flow, so it has to be initialised
  // before the first render that can bind those handlers.
  const net         = WALLET_CHAINS[network];
  const chainId     = net.chainId;
  const isTestnet   = net.testnet;
  // The trap this line used to describe has now been sprung and defused. It
  // read `const isBaseMainnet = network === "base"`, with a comment warning
  // that an `isTestnet` guard "waves real funds through to the wrong chain the
  // moment a third mainnet is listed" — and this commit lists one. So the
  // guards move from a chain NAME to the capability they actually depend on,
  // declared per chain in lib/wallet/chains.ts. `network === "base"` was right
  // for two of the three call sites by coincidence; `can.fiat` and `can.swap`
  // are right by construction, and a fourth chain has to answer them.
  const can = net.can;

  // ⚠️ EARN-ONLY — the wallet's last dependency on the yield module, deliberately
  // narrowed to these three lines so removing Earn is a delete, not a hunt.
  // Lending markets exist on Base only; `earnNet` is undefined on any chain
  // without one, and every read below is gated on it rather than assuming.
  const earnKey     = network === "base" || network === "baseSepolia" ? network : null;
  const earnNet     = earnKey ? YIELD_NETWORKS[earnKey] : undefined;
  const morphoVnet  = earnKey ? VENUES.morpho.nets[earnKey] : undefined;

  // The page-level chain-mismatch state (`chainMismatch`, `switchBusy`,
  // `switchToAppChain`, `useSwitchChain`) was REMOVED with the banner it fed —
  // see the note at its old render site below. It is deleted rather than left
  // unused because a mismatch derivation sitting in scope is an invitation to
  // render it again, and this page can no longer say anything true with it: it
  // shows two chains at once, so "the network this dashboard is reading" is not
  // a single value to compare the wallet against.
  //
  // The switching itself did NOT go away, it moved to where it can be correct.
  // Each action card calls `switchChainAsync` for the chain it is about to sign
  // on, immediately before signing — `RhSwapCard.doSwap` → 4663, the Base cards
  // → 8453 — so the prompt appears when the user has already chosen a chain and
  // an amount, and names the chain that transaction actually needs.

  // Default panel = `send`. Not a style pick: every entrance into this drawer
  // (`openAction`) names its own panel, so this value is only ever seen when the
  // drawer is opened without one. `positions` used to hold that slot and made
  // the FIRST screen of an action drawer a read-only list; `send` is the thing
  // the drawer exists to do.
  const [panel, setPanel]     = useState<Panel>("send");
  const [view, setView]       = useState<View>("tokens");
  const [actionOpen, setActionOpen] = useState(false);
  const [copied, setCopied]   = useState(false);
  // `linkCopied` went with `sharePayLink()` (#254) — see the note where that
  // function used to be. `copied` stays: Copy address still has a live target.
  const openAction = (p: Panel) => {
    if (p === "send") { setScanPrefill(null); setScanKey(k => k + 1); }
    setPanel(p); setActionOpen(true);
  };

  // Which chain the Convert panel is acting on. With the global switcher gone the
  // Convert card carries its own Base | Robinhood selector; this holds the choice.
  // Base is the default (0x-API swaps, the deep-liquidity venue); Robinhood routes
  // through its own RhSwapCard. Base Sepolia is deliberately NOT an option — 0x has
  // no testnet liquidity and SwapCard force-switches to Base mainnet.
  const [convertChain, setConvertChain] = useState<"base" | "robinhood">("base");

  // Which chain the PORTFOLIO tab is SHOWING. This narrows the ANSWER to "what do
  // I hold?", it does not change what the wallet acts on: Send, Convert and
  // Receive each pick their own chain and none of them reads this. Filtering a
  // read-only list moves no money, which is exactly why it is safe to offer here
  // and why the old global switcher — which silently re-aimed the spend paths
  // too — is not coming back.
  //
  // "all" is the default and stays the honest default: a wallet that shows every
  // chain unless asked otherwise can never quietly omit one. When a single chain
  // IS picked the view says so out loud (see the note beside the control), so a
  // filtered list is never mistaken for the whole portfolio.
  const [portfolioChain, setPortfolioChain] = useState<"all" | WalletChain>("all");
  const showsChain = (c: WalletChain) => portfolioChain === "all" || portfolioChain === c;

  // The Portfolio tab strip, so a click in the LEFT sidebar can scroll the RIGHT
  // pane to the table it just filtered. Without it the sidebar cards read as dead
  // buttons: they sit above the fold, the tables sit below it, and a state change
  // the user cannot see is indistinguishable from nothing happening.
  const portfolioRef = useRef<HTMLDivElement | null>(null);
  const showChain = (c: WalletChain) => {
    setPortfolioChain(c);
    // Filtering a tab that isn't open is a no-op to the user, so open one — but
    // NOT always `tokens`. A user reading Stocks who picks a chain is narrowing
    // the equities in front of them; snapping to Tokens would answer a question
    // they did not ask. Only jump when the open tab cannot show the filter.
    setView(v => (isHoldingsView(v) ? v : "tokens"));
    requestAnimationFrame(() =>
      portfolioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  // Quick-sell from the token table → pre-fill + open the Convert panel. Amount
  // is computed from the exact base-unit balance (Moralis `raw`), leaving a small
  // gas buffer when selling 100% of native ETH. The user reviews and signs in the
  // Convert card — this only pre-fills it, it never auto-executes.
  const [sellPreset, setSellPreset] = useState<SellPreset | null>(null);
  const quickSell = (h: WalletHolding, pct: number) => {
    try {
      let sellRaw = (BigInt(h.raw) * BigInt(pct)) / 100n;
      if (h.isNative && pct === 100) { const buf = 50_000_000_000_000n; sellRaw = sellRaw > buf ? sellRaw - buf : 0n; } // ~0.00005 ETH
      if (sellRaw <= 0n) return;
      setSellPreset({ addr: h.address, sym: h.symbol, decimals: h.decimals, amount: formatUnits(sellRaw, h.decimals), nonce: Date.now() });
      setConvertChain("base"); // the quick-sell tokens are read from the Base table
      openAction("convert");
    } catch { /* malformed raw — ignore */ }
  };

  // The same affordance on Robinhood Chain, for both RH tables (crypto tokens
  // and tokenized equities).
  //
  // ── Why this is a SECOND preset and not the one above ────────────────────────
  //
  // Convert is two different components on two different chains — `SwapCard`
  // signs on Base, `RhSwapCard` signs on 4663 — and a preset is an ADDRESS. One
  // shared preset would let a Base row arm the RH card, which is #219's
  // "the chain must travel with the fact" in the one place it costs money.
  //
  // No gas buffer, and none is missing: ETH is the OUT side of every sell on
  // 4663, so a native row is never sellable and `RhTokenTable` refuses to draw a
  // control on one. There is no 100%-of-native case for a buffer to protect.
  //
  // Both tables only call this on a row whose pool was MEASURED (see
  // lib/wallet/rh-sellable.ts) — this function does not re-check that, and must
  // not be wired to anything that has not.
  const [rhSellPreset, setRhSellPreset] =
    useState<{ addr: string; sym: string; amount: string; nonce: number } | null>(null);
  const rhQuickSell = (
    t: { addr: string; sym: string; decimals: number; raw: string },
    pct: number,
  ) => {
    try {
      const sellRaw = (BigInt(t.raw) * BigInt(pct)) / 100n;
      if (sellRaw <= 0n) return;
      setRhSellPreset({ addr: t.addr, sym: t.sym, amount: formatUnits(sellRaw, t.decimals), nonce: Date.now() });
      setConvertChain("robinhood");
      openAction("convert");
    } catch { /* malformed raw — ignore */ }
  };

  // Scan-to-pay
  const [scanOpen, setScanOpen] = useState(false);
  const [scanPrefill, setScanPrefill] = useState<ParsedPayment | null>(null);
  const [scanKey, setScanKey] = useState(0);
  function handleScan(text: string): string | void {
    const p = parsePaymentQr(text);
    if (!p || !p.to) return "Not a Base address or payment QR";
    setScanPrefill(p);
    setScanKey(k => k + 1);
    setPanel("send");
    setScanOpen(false);
    setActionOpen(true);
  }

  // Receive request.
  //
  // `reqAsset` is the EIP-681 key, not a display string: `"USDC"` means "this
  // chain's dollar", which `buildPaymentUri` resolves to `cfg.stable`. That
  // indirection is why the QR was already correct on Robinhood while every
  // label around it said USDC. `reqSymbol` is the display half, resolved from
  // the same config, so the two can no longer disagree.
  const [reqAmount, setReqAmount] = useState("");
  const [reqAsset, setReqAsset] = useState<"USDC" | "ETH">("USDC");
  // Which chain the Deposit/Receive QR is for. Component-level (not panel-local)
  // because `sharePayLink` below also needs it to stamp the right chain + symbol
  // into the shared link. Base default; Robinhood always offered; Base Sepolia
  // only when testnet is unlocked. The display symbol (`reqSymbol`) is derived
  // from THIS chain's config inside the panel, so USDC/USDG can no longer disagree
  // with the QR.
  const [receiveChain, setReceiveChain] = useState<WalletChain>("base");
  // Config + display symbol for the Receive QR, derived from `receiveChain` (NOT
  // the page's home `network`): the Deposit panel is the one surface that still
  // picks a chain, so its dollar label has to follow that pick. `reqAsset` stays
  // the EIP-681 key ("USDC" = "this chain's dollar"); `reqSymbol` is what the
  // human reads — USDC on Base, USDG on Robinhood — so the two never disagree.
  const rcv       = WALLET_CHAINS[receiveChain];
  const reqSymbol = reqAsset === "USDC" ? rcv.stableSymbol : "ETH";

  // Coinbase Onramp — add cash.
  //
  // ⚠️ The Onramp session is MAINNET-ONLY (`/api/onramp/session` pins
  // `blockchains: ["base"]`, and the popup URL below pins `defaultNetwork=base`).
  // While the app was defaulting to Sepolia, this shipped real USDC to Base
  // mainnet while the dashboard showed testnet balances — the money arrived
  // somewhere the UI was not looking. Refuse on testnet instead of hardcoding
  // `base` into a flow the rest of the page thinks is Sepolia.
  const [onrampBusy, setOnrampBusy] = useState(false);
  const [onrampMsg, setOnrampMsg]   = useState("");
  async function addCash() {
    if (!acct) return;
    if (!can.fiat) { setOnrampMsg(`Deposit is Base mainnet only — you are on ${net.short}.`); return; }
    setOnrampBusy(true); setOnrampMsg("");
    try {
      const j = await fetch(`/api/onramp/session?address=${acct}`).then(r => r.json());
      if (j.needsKey) { setOnrampMsg("Add cash needs a CDP key"); return; }
      if (j.error || !j.sessionToken) { setOnrampMsg(j.error || "couldn't start onramp"); return; }
      const url = `https://pay.coinbase.com/buy/select-asset?sessionToken=${encodeURIComponent(j.sessionToken)}&defaultAsset=USDC&defaultNetwork=base&presetFiatAmount=25&fiatCurrency=USD`;
      window.open(url, "_blank", "popup,width=470,height=720");
    } catch { setOnrampMsg("onramp failed"); }
    finally { setOnrampBusy(false); }
  }

  // Coinbase Offramp — cash out
  const [cashOutBusy, setCashOutBusy] = useState(false);
  async function cashOut() {
    if (!acct) return;
    if (!can.fiat) { setOnrampMsg(`Cash out is Base mainnet only — you are on ${net.short}.`); return; }
    setCashOutBusy(true); setOnrampMsg("");
    try {
      const j = await fetch(`/api/onramp/session?address=${acct}`).then(r => r.json());
      if (j.needsKey) { setOnrampMsg("Cash out needs a CDP key"); return; }
      if (j.error || !j.sessionToken) { setOnrampMsg(j.error || "couldn't start cash out"); return; }
      const url = `https://pay.coinbase.com/v3/sell/input?sessionToken=${encodeURIComponent(j.sessionToken)}&defaultAsset=USDC&defaultNetwork=base&fiatCurrency=USD`;
      window.open(url, "_blank", "popup,width=470,height=720");
    } catch { setOnrampMsg("cash out failed"); }
    finally { setCashOutBusy(false); }
  }

  // ── Live on-chain reads ──────────────────────────────────────────────────
  //
  // The whole query object is kept, not just `.data`. Every one of these returns
  // status / isError / isPending / isLoading alongside the value, and this file
  // used to destructure `{ data }` and drop the rest — which is how four
  // distinct read outcomes arrived here and got collapsed into one boolean 60
  // lines down. See the `balanceRead` block below.
  const usdcQ = useReadContract({
    address: net.stable, abi: ERC20_ABI, functionName: "balanceOf",
    args: acct ? [acct] : undefined, chainId, query: { enabled: !!acct },
  });
  const ethQ = useBalance({ address: acct, chainId, query: { enabled: !!acct } });
  // Balance reads only. The Aave `getReserveData` call that fed the supply-APY
  // display is gone with the display — a rate the user cannot act on is not
  // worth an RPC round-trip on every render of the wallet.
  const aaveQ = useReadContract({
    address: earnNet?.aUsdc, abi: ERC20_ABI, functionName: "balanceOf",
    args: acct ? [acct] : undefined, chainId, query: { enabled: !!acct && !!earnNet },
  });
  const morphoQ = useReadContract({
    address: morphoVnet?.target, abi: ERC4626_ABI, functionName: "maxWithdraw",
    args: acct ? [acct] : undefined, chainId,
    query: { enabled: !!acct && !!morphoVnet },
  });
  const walletRaw = usdcQ.data, ethRaw = ethQ.data, aaveRaw = aaveQ.data, morphoRaw = morphoQ.data;

  const walletUsdc = walletRaw != null ? Number(formatUnits(walletRaw as bigint, net.stableDecimals)) : null;
  const ethBal     = ethRaw ? Number(formatUnits(ethRaw.value, ethRaw.decimals)) : null;
  const aavePos    = aaveRaw != null ? Number(formatUnits(aaveRaw as bigint, 6)) : null;
  const morphoPos  = morphoRaw != null ? Number(formatUnits(morphoRaw as bigint, 6)) : null;

  // ── Two rate fetches used to run here, on every wallet load ──────────────
  // `/api/yield/rates` (DefiLlama) fed three APY boards, and
  // `/api/yield/morpho-history` fed a 30-day sparkline. All four surfaces are
  // gone, so the calls are too.
  //
  // Worth recording why they were a liability and not just clutter: neither was
  // passed `network`. They returned MAINNET pool yields regardless of the chain
  // the dashboard was reading, so on testnet the page quoted real-money APYs
  // over play-money balances. That was survivable only because mainnet is the
  // default — a comment used to sit here saying exactly that, load-bearing and
  // one config change from being wrong. Deleting the fetches deletes the trap.
  //
  // `/api/yield/morpho-history` goes in THIS commit rather than a cleanup pass:
  // its header named the sparkline above as its only consumer, and a repo-wide
  // grep confirms it now has zero callers. The retiring rule is one commit, and
  // an orphaned route that still answers is the shape of every surface this repo
  // has had to retire late. `/api/yield/rates` STAYS — the chat tool cards
  // (`chat/components/ToolCards.tsx`) still call it, so it is not orphaned.
  //
  // ── Real wallet history, leg 1 of 2: BASE, via Moralis ───────────────────
  type TxStats = { transferCountMonth: number; netFlowUsdcMonth: number; gasSavedUsd: number | null; ethUsdPrice: number | null };
  // `unsupported` is a THIRD outcome alongside data and error, and it is the
  // route telling us it refused rather than failed. Moralis does not index
  // Robinhood 4663, so there is no history HERE to fetch and no amount of
  // retrying will produce one — see that route's header, which explains why it
  // REFUSES an unlisted chain instead of defaulting to `"base"` and handing
  // back a Base transaction list under a Robinhood heading.
  //
  // Keeping it distinct from `error` is what stops the Activity tab offering a
  // Retry for a permanent gap: `activitySources` below folds it in with
  // `needsKey`, the not-retryable bucket. It is no longer `can.txHistory` that
  // carries that job — 4663 now HAS a reader (the Blockscout leg below), so the
  // flag is true for every chain the wallet lists and `unsupported` can only
  // fire if some future chain reaches this route without a Moralis slug.
  const [txData, setTxData] = useState<{ transactions: WalletTx[]; stats?: TxStats; needsKey?: boolean; unsupported?: boolean; error?: string } | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError]     = useState(false);
  const [txReload, setTxReload]   = useState(0);
  useEffect(() => {
    if (!acct) { setTxData(null); return; }
    // Do not even ask for a chain the route cannot answer for. The fetch would
    // succeed and come back `unsupported`, which renders the same — but this
    // guard skips a request known in advance to return nothing. (Activity pins
    // Base, whose `can.txHistory` is true, so it runs; the guard stays as the
    // honest gate should a no-history chain ever become the home chain.)
    if (!can.txHistory) { setTxData(null); setTxLoading(false); setTxError(false); return; }
    let off = false;
    setTxLoading(true); setTxError(false);
    fetch(`/api/wallet/transactions?address=${acct}&network=${network}`)
      .then(r => r.json())
      .then(d => {
        if (off) return;
        setTxData(d);
        // A 200 that CARRIES an error is a failed read, not an empty history.
        //
        // This line used to be `setTxData(d)` and nothing else, so `txError`
        // could only ever be set by a fetch that THREW. The route does not
        // throw: on a dead upstream it answers 200 with
        // `{ transactions: [], error: "moralis 401" }` — deliberately, so the
        // caller can say which source failed. Dropping that field handed the
        // empty array to the timeline as data, and the timeline printed
        // "No transactions yet" over a wallet with years of history.
        //
        // MEASURED 2026-09-12 against the live route, with Moralis on its
        // current 401 pause (#258): HTTP 200, `transactions: []`,
        // `error: "moralis 401"`, `txError` false. Every wallet on the app was
        // being told its on-chain history was empty.
        //
        // This is #211/#212/#213 for the fifth time — an absence produced by a
        // broken reader, rendered as a fact about the user. `unsupported` is
        // excluded because it is not a failure: it is the route refusing a
        // chain its index does not cover, which has its own branch and its own
        // explorer link, and must not be offered a Retry that cannot work.
        setTxError(!!d.error && !d.unsupported);
        setTxLoading(false);
      })
      .catch(() => { if (!off) { setTxError(true); setTxLoading(false); } });
    return () => { off = true; };
  }, [acct, network, txReload, can.txHistory]);

  // ── Robinhood history (that chain's own Blockscout) ──────────────────────
  //
  // A SECOND reader, not a second call to the one above — the same split as the
  // holdings tables, for the same reason: Moralis does not index 4663, so the
  // route above refuses that chain by name rather than defaulting to Base.
  //
  // This is the fix for "Activity là hiển thị hoạt động cả của ví, chứ không
  // phải của only base": the rest of this page is cross-chain — the total, the
  // Tokens tab, the Stocks tab — while the timeline covered Base alone. A
  // Robinhood send that was simply not indexed looked like a send that never
  // happened.
  //
  // Deliberately NOT folded into `txData`: two indexers with two trust models
  // and two failure modes cannot share one state object without losing which
  // chain failed, and "which chain failed" is the whole content of the footnote
  // the timeline draws.
  type RhTxRead = { transactions?: WalletTx[]; partial?: boolean; capped?: boolean; status?: string };
  const [rhTx, setRhTx] = useState<RhTxRead | null>(null);
  const [rhTxLoading, setRhTxLoading] = useState(false);
  const [rhTxError, setRhTxError]     = useState(false);
  useEffect(() => {
    if (!acct) { setRhTx(null); setRhTxLoading(false); setRhTxError(false); return; }
    if (!WALLET_CHAINS.robinhood.can.txHistory) { setRhTx(null); setRhTxLoading(false); setRhTxError(false); return; }
    let off = false;
    setRhTxLoading(true); setRhTxError(false);
    fetch(`/api/wallet/rh-transactions?address=${acct}`)
      .then(r => r.json())
      .then((d: RhTxRead) => {
        if (off) return;
        // `status` is the route's own word for "did the explorer answer", and it
        // is checked for exactly the reason the Base leg checks `error` above: a
        // 200 carrying `status:"unavailable"` is a FAILED read whose
        // `transactions: []` would otherwise be merged in as data and rendered
        // as a chain the user has never transacted on. Same family, sixth time.
        if (d?.status !== "ok") { setRhTx(null); setRhTxError(true); setRhTxLoading(false); return; }
        setRhTx(d); setRhTxLoading(false);
      })
      .catch(() => { if (!off) { setRhTxError(true); setRhTxLoading(false); } });
    return () => { off = true; };
  }, [acct, txReload]);

  // One timeline, two readers — merged here, ordered by time, and NEVER
  // flattened into a single loading/error pair. Each source reports its own
  // state so the card can render Base's rows while Robinhood is still in
  // flight, and name whichever chain went unread instead of implying the list
  // is complete. Both `can.txHistory` flags are load-bearing: they gate the
  // fetch AND the source entry, so a chain we cannot read is absent from the
  // scope line rather than stuck on a spinner.
  const activitySources: TxSource[] = useMemo(() => {
    const out: TxSource[] = [];
    if (can.txHistory) out.push({
      chain: network,
      // `unsupported` joins `needsKey` rather than `error`: both are permanent
      // gaps in a data source, and neither is fixed by pressing Retry.
      status: txLoading                              ? "loading"
            : txData?.needsKey || txData?.unsupported ? "needsKey"
            : txError                                 ? "error"
            : txData                                  ? "ok"
            : "loading",
    });
    if (WALLET_CHAINS.robinhood.can.txHistory) out.push({
      chain: "robinhood",
      status: rhTxLoading ? "loading" : rhTxError ? "error" : rhTx ? "ok" : "loading",
      partial: rhTx?.partial,
      capped:  rhTx?.capped,
    });
    return out;
  }, [can.txHistory, network, txLoading, txError, txData, rhTxLoading, rhTxError, rhTx]);

  const activityRows: WalletTx[] = useMemo(
    () => [...(txData?.transactions ?? []), ...(rhTx?.transactions ?? [])].sort((a, b) => b.ts - a.ts),
    [txData, rhTx],
  );

  // ── How much of the balance did we actually READ? ────────────────────────
  //
  // Four states, one derivation — `lib/wallet/read-state.ts`, the same module
  // the three holdings tables use. This file was the FOURTH hand-rolled copy of
  // that question and the only one gating a *score*. It read:
  //
  //     const balancesKnown = walletUsdc != null;
  //
  // One boolean where there are four answers. The comment that used to sit here
  // even NAMED the distinction — "null while the contract read is in flight or
  // has failed" — and then discarded it, so:
  //
  //   · a FAILED USDC read rendered "Reading…" forever, with no path out of the
  //     spinner. Identical to the bug fixed in RhTokenTable, one folder over.
  //   · a PARTIAL read (Aave or Morpho short) was graded as if complete, and its
  //     dollar total printed as a flat figure rather than the floor it is.
  //
  // The signals were never missing. wagmi hands back status/isError/isPending on
  // every query above; all three destructures took only `.data`.
  //
  // A leg that does not APPLY on this chain (no Aave market, no Morpho vault) is
  // not an unread leg — it is not a leg at all. `enabled: false` leaves a query
  // permanently `isPending`, so counting one would pin the page to "Reading…"
  // on every chain that lacks a venue.
  const legs = [
    { applies: !!acct,                 q: usdcQ },
    { applies: !!acct && !!earnNet,    q: aaveQ },
    { applies: !!acct && !!morphoVnet, q: morphoQ },
  ].filter(l => l.applies);

  // This wallet's "rows" are its FUNDED positions — the things there are to
  // show. A real count rather than a 0/1 flag, because each leg holds
  // independently and `resolveRead` uses it to decide whether a degraded read
  // still has something to display (qualify it) or nothing (say so plainly).
  const fundedLegs = [walletUsdc, aavePos, morphoPos].filter(v => v != null && v > 0).length;

  const balanceRead = resolveRead({
    loading:  legs.some(l => l.q.isLoading),
    received: legs.length > 0 && legs.every(l => !l.q.isPending),
    // USDC is the PRIMARY leg: `total` is denominated in it and every claim this
    // page makes rests on it. Without it nothing is known — strictly weaker than
    // "we got some", which is why `failed` outranks `partial` in the module.
    failed:   usdcQ.isError,
    // Any leg short of success makes `total` a FLOOR — the user holds at least
    // this much, possibly more. Rendered with "≥", never as a flat figure.
    partial:  legs.some(l => l.q.isError),
    rowCount: fundedLegs,
  });
  // "≥" wherever a total is printed from a read that did not cover everything.
  const floor = balanceRead.totalIsFloor ? "≥ " : "";

  // ── The way out of the failed state ──────────────────────────────────────
  //
  // Distinguishing four states is worth doing on its own, but three of them are
  // a DEAD END without this: the page learned to say "we couldn't read your
  // balance" and then offered nothing that would read it again. The only Retry
  // in the file belonged to TransactionHistory. The chat system prompt is the
  // sharpest evidence that this was an omission rather than a decision — it
  // instructs the model to "offer to retry", a retry the UI did not have.
  //
  // Refetches the SAME filtered `legs`, not the four queries: a leg that does
  // not apply on this chain has no market to read, and TanStack's `refetch`
  // ignores `enabled`, so retrying it would fire `balanceOf` at an undefined
  // address. `balanceRead` would not see the resulting error (it reads the
  // filtered list too), but the request is still wrong to make.
  //
  // ETH is refetched even though it is deliberately NOT one of the legs — it is
  // not part of `total`, but it is what three quarters of the health score rests
  // on, and a user pressing Retry means "read my wallet again", not "re-run the
  // three legs of a derivation they cannot see".
  async function retryBalance() {
    await Promise.all([...legs.map(l => l.q.refetch()), ethQ.refetch()]);
  }
  // Derived, not a `useState` flag — the same reason `balanceRead` is derived.
  // A stored "retrying" boolean is a fifth copy of a fact wagmi already owns,
  // and it is the copy that gets left true when a refetch throws. `isFetching`
  // is also true on the FIRST load, which is harmless here: every control that
  // reads it renders only in a non-pending branch.
  const rereading = legs.some(l => l.q.isFetching) || (!!acct && ethQ.isFetching);

  // ── Did the history read actually LAND? ──────────────────────────────────
  //
  // Derived once and read by everything downstream, for the same reason
  // `balanceRead` is: the score's activity leg and the timeline card must not
  // answer "do we know this wallet's activity?" with two separate `if`s.
  //
  // Four ways to not know it, and none of them is "zero transfers": still in
  // flight, the fetch failed, no Moralis key configured, or the chain is not in
  // Moralis's index at all. Only the last branch below is a measurement.
  const historyRead: "pending" | "unread" | "ok" =
    txLoading                                                     ? "pending"
    : txError || txData?.needsKey || txData?.unsupported          ? "unread"
    : txData                                                      ? "ok"
    : "pending";

  // Stats from real wallet history (this calendar month). `null`, not 0, when
  // the read did not land — a failed Moralis call must not be able to assert
  // "you made no transfers this month", which is what `?? 0` said.
  const netFlowMonth       = historyRead === "ok" ? txData?.stats?.netFlowUsdcMonth  ?? 0 : null;
  const transferCountMonth = historyRead === "ok" ? txData?.stats?.transferCountMonth ?? 0 : null;
  // Live ETH/USD (CoinGecko, via the transactions route). `null` = the feed did
  // not answer — kept null all the way to the render so nothing downstream can
  // quietly substitute a constant, which is what `ethBal * 2500` used to be.
  const ethUsdPrice        = txData?.stats?.ethUsdPrice ?? null;
  const gasSavedUsd        = txData?.stats?.gasSavedUsd ?? null;

  // ── AI Chat popup ────────────────────────────────────────────────────────
  const [chatOpen, setChatOpen]       = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput]     = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // ── Draggable AI FAB ─────────────────────────────────────────────────────
  const fabDrag = useRef<{ ox: number; oy: number; sx: number; sy: number; moved: boolean } | null>(null);
  const [fabXY, setFabXY]       = useState<{ x: number; y: number } | null>(null);
  const [fabDragging, setFabDragging] = useState(false);

  function fabDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
    const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
    fabDrag.current = { ox: r.left, oy: r.top, sx: e.clientX, sy: e.clientY, moved: false };
    setFabDragging(true);
  }
  function fabMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!fabDrag.current) return;
    const dx = e.clientX - fabDrag.current.sx;
    const dy = e.clientY - fabDrag.current.sy;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) fabDrag.current.moved = true;
    if (!fabDrag.current.moved) return;
    setFabXY({
      x: Math.max(8, Math.min(window.innerWidth  - 56, fabDrag.current.ox + dx)),
      y: Math.max(8, Math.min(window.innerHeight - 56, fabDrag.current.oy + dy)),
    });
  }
  function fabUp() {
    if (fabDrag.current && !fabDrag.current.moved) setChatOpen(o => !o);
    fabDrag.current = null;
    setFabDragging(false);
  }

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  async function sendChat(input: string) {
    if (!input.trim() || chatLoading) return;
    const userMsg = { role: "user" as const, content: input.trim() };
    const historySnapshot = [...chatMessages, userMsg];
    setChatMessages(historySnapshot);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: historySnapshot,
          // ── `address` — the fix for "No wallet is connected" (2026-09-13) ──
          //
          // This was MISSING, and its absence was the whole bug. `/api/chat`
          // reads the connected wallet from `body.address` and nowhere else;
          // `check_wallet` (the tool behind "show my balance breakdown") has no
          // address ARGUMENT by design — the schema says "it auto-uses the
          // connected address". So with no `address` on the body the tool took
          // its not-connected branch and returned the static line
          //
          //     "No wallet is connected — connect one to see your holdings."
          //
          // …to a user sitting on the wallet page, looking at their own
          // holdings, with `acct` in scope three lines from this fetch. That is
          // the #211/#212/#213 shape again: an absence produced by a broken
          // READER, rendered as a fact about the USER. The page never doubted
          // the connection; it simply never mentioned it.
          //
          // Sent only when truthy, matching ChatContext: a guest asking here
          // must still reach the guest path, not a malformed "" address.
          ...(acct ? { address: acct } : {}),
          // `tier`, not `model`. The body below used to carry `model: "fast"`,
          // which `/api/chat` does not destructure — so this assistant silently
          // ran (and BILLED) at the route's default `tier = "pro"`. The name of
          // the field is the whole fix; "fast" was never wrong, it was never
          // read. Kept cheap on purpose: this is a 2–3 sentence balance helper.
          tier: "fast",
          // ── `pageContext`, not `system` (2026-09-13) ───────────────────────
          //
          // This block used to be sent as `system`, and `/api/chat` does not
          // destructure `system` — so every word of it, including
          // `balanceForPrompt`, has been dropped on the floor on every message
          // this assistant has ever sent. The honesty engineering below was
          // real and the model never saw one line of it. Same shape as the
          // `address` bug above: written, never read.
          //
          // It moved to `pageContext` rather than teaching the route to accept
          // `system`, because a client-settable `system` REPLACES SOUL.md, the
          // B20 prohibitions and the tool dispatch table. This page wants to
          // add a paragraph, not to become the prompt.
          //
          // The label matters as much as the content. The model now also has
          // `check_wallet` — a live server read of this same wallet across both
          // chains — so these numbers are no longer its only source. They are a
          // SNAPSHOT OF THE SCREEN, and saying so is what stops the model
          // treating a stale figure as a second oracle and picking whichever it
          // likes. Anything the tool returns is fresher; this block's job is to
          // describe what the user is looking at, and to carry the READ STATE
          // the tool has no way to know.
          //
          // `balanceForPrompt` is that read state — see its definition. The old
          // string interpolated `$${usd(total)}` directly, which renders
          // "$0.00" for a read that had not landed or had failed: the page told
          // the assistant the wallet was empty while the page itself was still
          // showing dashes. `displayName` is the same derivation the header
          // greets with; this was a FOURTH copy of that ladder, and the most
          // degraded of them (it omitted even `fname`), so the assistant
          // addressed by hex a user the page had just greeted by name.
          //
          // No APY/yield steer: the yield entrance is closed, so there is no
          // rate to state. The old copy ended "In yield: $X at Y%", where Y was
          // `bestApy` — DefiLlama's best USDC pool, a market-wide figure the
          // assistant read back as this user's own rate.
          pageContext:
            `[Wallet page — what is on the user's screen right now]\n` +
            `The user is on their BlueAgent wallet page, not the general chat. User: ${displayName}.\n` +
            `${balanceForPrompt}\n` +
            `These figures are a snapshot of the page as rendered; check_wallet is a live read and wins on any disagreement. ` +
            `Never state a balance marked UNKNOWN or NOT YET READ, and never describe an unread balance as zero or empty. ` +
            `Help with balances, sending and receiving, and withdrawing supplied funds. ` +
            `Do not recommend yield strategies or quote APYs — this wallet no longer offers them.`,
        }),
      });
      if (!res.ok || !res.body) throw new Error("no body");
      // SSE stream — accumulate text_delta events
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let accumulated = "";
      setChatMessages(prev => [...prev, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;
          try {
            const parsed = JSON.parse(raw) as { type?: string; delta?: { text?: string } };
            if (parsed.delta?.text) {
              accumulated += parsed.delta.text;
              setChatMessages(prev => {
                const msgs = [...prev];
                msgs[msgs.length - 1] = { role: "assistant", content: accumulated };
                return msgs;
              });
            }
          } catch { /* ignore parse errors */ }
        }
      }
      if (!accumulated) {
        setChatMessages(prev => {
          const msgs = [...prev];
          msgs[msgs.length - 1] = { role: "assistant", content: "Sorry, couldn't get a response. Try again." };
          return msgs;
        });
      }
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", content: "Connection error. Try again." }]);
    } finally {
      setChatLoading(false);
    }
  }

  function copyAddr() {
    if (!acct) return;
    navigator.clipboard?.writeText(acct).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  // `sharePayLink()` lived here and is GONE (#254, 2026-09-16). It built
  // `${origin}/pay/${acct}?asset=…&network=…` and handed it to navigator.share.
  //
  // Every link it published was dead on arrival. `/pay[/…]` has been archived in
  // middleware.ts since the BlueAgent Relaunch — archivedRedirect() is the FIRST
  // statement of middleware(), so the 301 fires before routing and the address
  // segment is DROPPED on the way:
  //
  //     GET /pay/0x0295…9205?asset=USDC&network=base&amount=5
  //       → 301 → app.blueagent.dev/chat?asset=USDC&network=base&amount=5
  //
  // The payer lands in Blue Chat holding the amount but not the payee. Measured
  // in prod on both hostnames 2026-09-11, still true 2026-09-16.
  //
  // This is the shape the archive was never audited for. Its own comment assumed
  // the only live `/pay/` URLs were "QR codes generated earlier" — historical
  // ones already in the wild, which a 301 to /chat handles gracefully. That was
  // true the day it was written; it stopped being true when the wallet was
  // rebuilt at /app/wallet with this button still on it, MINTING NEW dead links
  // every time someone tapped share. Nothing failed, because nothing was
  // watching the join between "middleware archives X" and "the app still emits
  // X". `scripts/archived-routes-check.ts` is now watching it — it grew a third
  // section for exactly this, and it is CONDITIONAL: while middleware archives
  // `/pay`, no source file may build a `/pay/…` URL; if `/pay` is ever
  // un-archived, that ban lifts by itself and the script instead demands the
  // page has stopped narrowing every network to the Base family.
  //
  // Removed rather than repointed, on ShunTr's call (2026-09-16): restoring the
  // page is a PUBLIC PAYMENT SURFACE and a bigger decision than a dead button.
  // It also could not have been a one-line repoint — `pay/[address]/page.tsx`
  // types its network as `YieldNetwork = "base" | "baseSepolia"` and silently
  // narrows anything else to `base`, while this card's NetworkPicker offers
  // `robinhood`, whose dollar is USDG. Un-archiving as-is would have turned a
  // dead link into a Robinhood request rendered as "USDC on Base" — a live
  // money path asserting the wrong chain, which is worse than a 404.
  //
  // What survives is the path that always worked: the EIP-681 QR below, built
  // by `buildPaymentUri` from `receiveChain`, correct on all three chains. That
  // is the scan-to-pay wedge; the share link was a second door onto it.

  // ── Wallet state (canonical derived state) — MUST be before any early return ──
  const walletState = useMemo(() => buildWalletState({
    walletUsdc: walletUsdc ?? 0,
    aavePos: aavePos ?? 0,
    morphoPos: morphoPos ?? 0,
    ethBal: ethBal ?? 0,
    netFlowMonth,
    transferCountMonth,
    ethUsdPrice,
    gasSavedUsd,
  }), [walletUsdc, aavePos, morphoPos, ethBal, netFlowMonth, transferCountMonth, ethUsdPrice, gasSavedUsd]);

  // ── The wallet's totals — ONE definition, this one ────────────────────────
  //
  // These were `const inYield = (aavePos ?? 0) + (morphoPos ?? 0)` and
  // `const total = (walletUsdc ?? 0) + inYield`, sitting ~160 lines above.
  // `buildWalletState` computes byte-identical expressions (wallet-state.ts:24-25),
  // so the page carried two independent definitions of "what this wallet holds"
  // and rendered BOTH: the chat system prompt read `total`, the balance headings
  // read `walletState.balance`. They agree today only because the two
  // expressions happen to match character for character.
  //
  // KEPT: the module. It is shared, unit-testable, and already the source for
  // `ethUsd` / `pricedTotal` / `ethUnpriced` / `holdsAssets` — four values that
  // were collapsed into it for exactly this reason (see the note above
  // `portfolioData`). Leaving `total` and `inYield` behind meant that earlier
  // dedupe took four of six copies and the survivors kept breeding, which is why
  // the reason is written here instead of only in a commit message.
  //
  // DELETED: the local pair. Aliased rather than renamed at ~20 call sites so
  // the diff stays a dedupe rather than a rename, and so any future third copy
  // has to walk past this comment to get written.
  const { balance: total, inYield } = walletState;

  // `inYield` collapses "the read has not resolved" into 0, and the withdraw
  // path is gated on `inYield > 0` — so an RPC that fails and stays null would
  // hide the ONLY exit from a user who really does have USDC supplied. Anything
  // that gates the exit must ask "is it positively known to be zero", not "is it
  // zero". Cosmetic gates (widgets that print a dollar figure) stay on
  // `inYield > 0`: those must not assert $0.00 from a read that never landed.
  const noPositions = aavePos != null && morphoPos != null && inYield === 0;

  // ── What the chat assistant is told about the balance ────────────────────
  //
  // The prompt is the FIFTH consumer of this read and the one with the least
  // supervision: the user never sees the string, and an LLM handed
  // "Balance: $0.00" will state it back as fact in a confident sentence. On a
  // pending or failed read `total` is the number 0 (`(walletUsdc ?? 0) + …`),
  // so the assistant was being told the wallet was empty by a page that had
  // not managed to read it — and then asked to "help with balances".
  //
  // Every other consumer got a dash or a banner; this one got the number,
  // because a template literal has nowhere to put a caveat unless one is
  // written. So it is written. The instruction is explicit rather than implied
  // by an em-dash, since the model is the one thing here that will happily
  // interpolate around a missing value.
  //
  // `priv` deliberately does NOT reach this string. The eye toggle hides
  // figures from whoever is looking at the screen; it is not a data policy, and
  // masking here would hand the assistant "••••" as an amount — the one reader
  // that would try to reason with it.
  const balanceForPrompt =
    balanceRead.body === "pending"
      ? "Balance: NOT YET READ (request still in flight)."
      : balanceRead.body === "failed"
        ? `Balance: UNKNOWN — the ${net.short} balance read failed. Do not state or imply any amount, and do not say the wallet is empty; say the balance could not be read and offer to retry.`
        : `Balance: ${floor}$${usd(total)} · USDC: ${walletUsdc == null ? "UNREAD" : `$${usd(walletUsdc)}`} · Supplied, withdraw-only: $${usd(inYield)}. ETH: ${ethBal?.toFixed(4) ?? "UNREAD"}.${
            balanceRead.totalIsFloor
              ? " NOTE: part of this wallet could not be read, so these are LOWER BOUNDS. Say 'at least' and never present them as the full balance."
              : ""
          }`;

  // What the connected account IS — read off the live connector + on-chain
  // bytecode, never asserted. Called here (above the early return) because it
  // is a hook; it returns a fully "unknown" identity when nothing is connected.
  const identity = useWalletIdentity(chainId);

  if (!isConnected) {
    return <BankLanding />;
  }

  // The Withdraw tab is hidden only for a wallet POSITIVELY known to hold
  // nothing — it is the exit from a feature whose entrance is closed, so a
  // read that has not resolved keeps it visible. Hiding it on a stale null
  // would strand a depositor's funds; showing it on an empty wallet costs a
  // tab that reports "no positions".
  const TABS: { id: Panel; label: string; icon: string; desc: string }[] = [
    ...(noPositions ? [] : [{ id: "withdraw" as Panel, label: "Withdraw", icon: "↩︎", desc: "Exit yield" }]),
    // `receive` is labelled "Deposit" so the tab matches the ACTIONS button
    // that opens it, and its `desc` names all three things the panel now
    // holds — QR, card, bank — because the cash-out exit lives inside it and a
    // tab that says only "Get paid" would hide the way out.
    { id: "send",      label: "Send",      icon: "➡",  desc: "Pay anyone" },
    { id: "receive",   label: "Deposit",   icon: "⬇",  desc: "QR · card · bank" },
    { id: "convert",   label: "Convert",   icon: "⇅",  desc: "Swap tokens" },
    // Bridge is NOT gated on `can.*`, unlike Send and Convert. Those two ask
    // "does the chain the wallet is CONNECTED to support this?"; a bridge always
    // spans two chains and picks its own origin in-card, so the connected chain
    // is not the question. What it CAN do is answered by Relay's live list,
    // fetched by the panel itself, and an outage there renders "couldn't load"
    // rather than a tab that lies in either direction.
    { id: "bridge",    label: "Bridge",    icon: "⇄",  desc: "Base ↔ Robinhood" },
  ];

  // Orders is NOT gated on B20_ENABLED, unlike the modal tab it replaces.
  // That gate hid the whole panel while the panel's own banner read "Payment
  // links work now. B20 USDC auto-settlement … go live at B20 mainnet" — so the
  // flag that only turns off AUTO-SETTLEMENT was turning off the feature. With
  // it off today, the AI mission below still offered a "Try" button that opened
  // the modal onto a tab that did not exist: an empty box. OrdersPanel already
  // states its own degraded mode; the tab lets a user reach it to read that.
  const VIEWS: { id: View; label: string }[] = [
    { id: "tokens",   label: "Tokens" },
    { id: "stocks",   label: "Stocks" },
    { id: "activity", label: "Activity" },
    { id: "orders",   label: "Payment requests" },
  ];

  // ── Portfolio allocation (for pie chart) ─────────────────────────────────
  // `ethUsd` was `(ethBal ?? 0) * 2500` — a hardcoded ETH price, invented at a
  // moment when it happened to be roughly right and never true again. It fed
  // both this chart and `divScore` below, so a stale constant was silently
  // grading the user's portfolio. It is now the live price or nothing: `null`
  // drops the ETH slice out of the chart rather than drawing it at a made-up
  // size, and the caption says the leg is unpriced.
  //
  // These four values were then recomputed HERE with the same expressions that
  // `buildWalletState` already runs. Two copies of one derivation is how the
  // card ended up disagreeing with itself; the copies are gone and this reads
  // the canonical state.
  const { ethUsd, pricedTotal, ethUnpriced, holdsAssets } = walletState;
  const portfolioData = [
    { name: "Stablecoin", value: walletState.balance, color: "#4FC3F7" },
    { name: "ETH",        value: ethUsd ?? 0,         color: "#94A3B8" },
  ].filter(d => d.value > 0);

  // ── Chat popup position relative to FAB ──────────────────────────────────
  const FAB_SZ   = 48;
  const POPUP_W  = 320;
  const POPUP_H  = 432;
  const chatPopupStyle: React.CSSProperties = fabXY
    ? {
        left: Math.max(8, Math.min(
          (typeof window !== "undefined" ? window.innerWidth : 1440) - POPUP_W - 8,
          fabXY.x + FAB_SZ / 2 - POPUP_W / 2,
        )),
        top: Math.max(8, fabXY.y - POPUP_H - 12),
        height: POPUP_H,
      }
    : { right: 16, bottom: 76, height: POPUP_H };

  // ── Portfolio health score ────────────────────────────────────────────────
  // `null` means NO SCORE, and that is the whole point of this block.
  //
  // It used to read `total === 0 ? 0 : …`, which rendered a brand-new empty
  // wallet as a red **0/100 · D** with a Share button under it. That is worse
  // than an invented number: it invents a BAD one, out of the absence of data,
  // and shows it to the user least equipped to dismiss it — someone who just
  // connected and has no idea whether the app is grading them or their wallet.
  // Every input here (deployed ratio, diversification, gas, activity) is
  // undefined on an empty or unread wallet, so the honest output is "—", not a
  // failing grade. CLAUDE.md: missing data is "unknown", never an inferred
  // negative score.
  //
  // `balanceRead` guards the loading case too — during the RPC round-trip a
  // funded wallet also looks empty, and it must not flash a grade it is about
  // to contradict. It now guards two MORE cases that the old `balancesKnown`
  // boolean could not express: a read that FAILED, and one that came back
  // short. A grade is a claim about the user's whole position, so it requires a
  // COMPLETE read — a partial one would grade a wallet against a picture known
  // to be missing part of it.
  //
  // The heaviest term used to be `yieldScore` — 40% of the grade, keyed on what
  // fraction of the balance was supplied into Aave/Morpho, floor 20 for anyone
  // supplying nothing. With the Earn entrance closed that is a 40% penalty for
  // declining to use a feature the wallet no longer offers, which every user
  // now permanently fails and none of them can fix. A score has to be about
  // something the user can act on, so it is gone and the surviving three
  // dimensions are reweighted to sum to 1 rather than silently rescaled.
  // Diversification degrades honestly when ETH has no price: "holds ETH at all"
  // is still knowable from the balance, only the ">5% of portfolio" tier needs
  // a price. Previously both tiers were decided by a constant.
  const divScore       = ethUsd != null && pricedTotal > 0 && ethUsd / pricedTotal > 0.05 ? 88
                       : (ethBal ?? 0) > 0 ? 65 : 45;
  // `null`, not 50, when the ETH balance never arrived. This read
  // `ethBal == null ? 50 : …` — a middling grade invented out of an absent
  // measurement and then given 35% of the weight, with a second 40% flowing
  // through `divScore`'s ETH tiers. Three quarters of the score could be
  // fabricated from a failed `useBalance` and it still printed a letter grade.
  // CLAUDE.md: missing data is "unknown", never an inferred value.
  const gasScore: number | null =
    ethBal == null ? null : ethBal > 0.05 ? 95 : ethBal > 0.01 ? 80 : ethBal > 0.005 ? 60 : 20;
  // `null` when the history never landed — the third leg to learn the lesson
  // the two above it already carry, and the one that was still getting it wrong.
  //
  // It read `transferCountMonth > 10 ? 90 : … : 20` against a count that was
  // `?? 0` on a FAILED read, so a dead Moralis scored every wallet at the 20/100
  // floor for a quarter of the grade — a fabricated negative worth 17.5 points,
  // invented out of an outage. That is the exact defect the comment above
  // `gasScore` describes ("a middling grade invented out of an absent
  // measurement"), and the one `wallet-state.ts` removed a whole term for
  // ("the same wallet scored 25 lower during an API outage"). Live right now:
  // Moralis is 401-paused (#258), so this leg is currently floored for everyone.
  const actScore: number | null =
    transferCountMonth == null ? null
    : transferCountMonth > 10 ? 90 : transferCountMonth > 5 ? 75 : transferCountMonth > 1 ? 55 : 20;
  // COMPLETE, not merely "known" — see the note above. `gasScore != null` folds
  // in the ETH leg, which is not part of `total` and so is deliberately not one
  // of `balanceRead`'s legs, but which three quarters of this grade rests on.
  // `actScore != null` folds in the fourth: a grade is a claim about the whole
  // position, and it must not be published while one of its inputs is unread —
  // publishing it anyway is how the outage became a letter grade.
  const scoreReady     = balanceRead.state === "complete" && total > 0 && gasScore != null && actScore != null;
  const portfolioScore: number | null =
    scoreReady && gasScore != null && actScore != null
      ? Math.round(divScore * 0.4 + gasScore * 0.35 + actScore * 0.25) : null;
  const scoreGrade     = portfolioScore == null ? null : portfolioScore >= 85 ? "A" : portfolioScore >= 70 ? "B" : portfolioScore >= 55 ? "C" : "D";
  // Slate, not red, when there is no score — colour is a claim too.
  const scoreColor     = portfolioScore == null ? "#475569"
    : portfolioScore >= 85 ? "#34D399" : portfolioScore >= 70 ? "#4FC3F7" : portfolioScore >= 55 ? "#F59E0B" : "#EF4444";

  // ── Mission Control items ─────────────────────────────────────────────────
  interface MC { priority: "high"|"warn"|"good"|"info"; icon: string; text: string; action?: string; onAction?: () => void; color: string }
  const allMissions: MC[] = [];
  // A mission is ADVICE ABOUT THE USER'S POSITION, so it needs a position that
  // was actually read. Three of the five bodies produce none: not read yet, not
  // read at all, and read but short — the last of which used to fall through to
  // the `total === 0` branch and tell someone to fund a wallet whose balance we
  // had just failed to fetch. An empty list beats a confident wrong instruction.
  if (balanceRead.body === "pending" || balanceRead.body === "failed" || balanceRead.body === "partial") {
    /* nothing to advise until the balance read lands, in full */
  } else if (balanceRead.body === "empty") {
    allMissions.push({ priority: "info", icon: "💡", text: `Add USDC to fund your wallet on ${net.short}`, action: "Add cash", onAction: addCash, color: "#F59E0B" });
  } else {
    // The two missions that used to sit here — "$X idle, earn ~$Y/mo" and
    // "Enable Auto Earn" — both invited a NEW supply, which is the entrance
    // the last release closed. Only the passive one below survives: it reports
    // a position the user already holds rather than asking for another.
    //
    // Auto Earn is gone outright, not hidden. It persisted a flag to
    // localStorage and nothing anywhere read it back, so the toggle promised
    // an auto-deploy that never ran once.
    //
    // The surviving line no longer quotes a rate or projects a monthly figure.
    // Both came from `bestApy` — the TOP pool on DefiLlama, not the pool this
    // user is actually in — so "$500 earning 6.1% · ~$3/month" was a real
    // balance multiplied by someone else's yield. The balance is measured; the
    // return on it was never something this page could read.
    if (inYield > 0)
      allMissions.push({ priority: "good", icon: "✅", text: `${priv(`$${usd(inYield)}`)} supplied — withdrawable any time`, action: "Withdraw", onAction: () => openAction("withdraw"), color: "#34D399" });
    // A fourth mission used to sit here:
    //
    //   if (new Date() >= new Date("2026-06-25"))
    //     "⚡ Beryl live — B20 payments + faster L1 withdrawals"  [Try]
    //
    // It is gone, for two reasons that compound.
    //
    // 1. THE CLAIM IS FALSE IN PRODUCTION. B20 payments are gated on
    //    `NEXT_PUBLIC_B20_ENABLED` (lib/orders.ts), and that variable is not
    //    set in the production project — measured, 42 vars, not one of them
    //    this. So the wallet asserted a capability the build had compiled out.
    //    Same family as #143/#166: advertising something the product cannot do.
    //
    //    The root cause is the gate itself. A CALENDAR DATE cannot know whether
    //    a feature shipped — it only knows that a day someone once expected it
    //    on has passed. The flag knows. Anything that announces B20 must be
    //    gated on `B20_ENABLED`, never on a date.
    //
    // 2. IT WAS NOT A MISSION. Per this list's own definition four lines up, a
    //    mission is advice about the user's position. This was a product
    //    announcement, and a date-gated one, so from 2026-06-25 it was
    //    unconditionally true forever: a permanent banner holding one of only
    //    three slots, still calling a 74-day-old upgrade news.
    //
    // Those two hid each other. Because it never changed, it read as furniture
    // and nobody re-checked the claim; because the claim was in an "info" chip
    // rather than a control, nothing failed when it was wrong. The `Try` button
    // led to OrdersPanel, which — being honestly gated on the flag — told the
    // user the opposite in the same click: B20 settlement "goes live June 25",
    // future tense, 74 days after that date. Two surfaces, one flag, opposite
    // stories. OrdersPanel's copy is fixed in this commit too.
    //
    // When B20 actually ships, the place to say so is OrdersPanel, gated on
    // B20_ENABLED, where the feature lives.
  }

  // ── Gas, OUTSIDE the balance-read branch above ────────────────────────────
  // Every other mission reasons about `total`, so it needs the USDC read to
  // have landed. This one does not: it reasons about `ethBal`, which is its own
  // read (`ethQ`), and `ethBal != null` is already proof that read came back.
  // Gating it on the USDC read was an over-gate that silently cost coverage —
  // a wallet whose USDC read failed, or which read as empty, has a MEASURED
  // empty gas tank and was told nothing about it.
  //
  // It also has to live here rather than up there because the ON BASE
  // itemisation that carried a second copy of this warning is gone (see the
  // account card): this is now the only place the user is told they cannot
  // sign. Losing that was the one real risk in deleting those rows, so the
  // warning was moved BEFORE they were removed, not after.
  if (ethBal != null && ethBal < 0.005)
    allMissions.push({ priority: "warn", icon: "⛽", text: "ETH too low for gas fees", action: "Get ETH", onAction: () => openAction("convert"), color: "#F59E0B" });

  const topMissions = allMissions.slice(0, 3);
  // Gated on the BALANCE READ, not on `total`.
  //
  // The first branch used to be `total === 0 ? "Connect and add funds…"`, which
  // is unreachable-by-intent nonsense: this whole render sits below
  // `if (!isConnected) return <BankLanding/>`, so the wallet is ALREADY
  // connected here. A connected user with a zero balance — every new user, and
  // every existing user for the second or two the RPC takes — was told to
  // connect a wallet they were looking at the address of, right beside a
  // "Disconnect" button. Same defect family as the score above: a balance of
  // zero was read as a statement about the connection.
  //
  // The SECOND branch is the one that was live in production: `!balancesKnown`
  // where `balancesKnown === walletUsdc != null`. A USDC read that ERRORED
  // leaves `walletUsdc` null forever, so the line read "Reading your balances…"
  // for as long as the page stayed open — a spinner sentence describing a
  // request that had already finished, and failed. Nothing retried, nothing
  // said so. Now `pending` and `failed` are different sentences because they
  // are different facts, and neither is `empty`.
  const missionSummary =
    balanceRead.body === "pending" ? "Reading your balances…" :
    balanceRead.body === "failed"  ? `Couldn't read your balance on ${net.short} — unknown, not zero.` :
    balanceRead.body === "partial" ? `Part of your position on ${net.short} could not be read — unknown, not empty.` :
    balanceRead.body === "empty"   ? `Wallet connected · add USDC on ${net.short} to get started.` :
    // `body === "rows"`: something is funded. `rowCount > 0` outranks `failed`
    // in the module, so this branch is reachable with the USDC leg itself
    // errored and a supplied position still read — hence the liquid figure is
    // named only when it is known, rather than rendering "$—" as if that were
    // an amount. `floor` marks the total as a lower bound either way.
    //
    // `priv` wraps the AMOUNTS only, never the sentence around them: with the
    // eye toggle on this still reads "•••• liquid", so the user keeps the shape
    // of their situation without the figure. The four branches above carry no
    // amount at all and are left exactly as they are — a masked balance must
    // not look like an unread one.
    walletUsdc == null ? `${floor}${priv(`$${usd(inYield)}`)} supplied · liquid balance unread` :
    inYield > 0 ? `${floor}${priv(`$${usd(walletUsdc)}`)} liquid · ${priv(`$${usd(inYield)}`)} supplied` :
    `${floor}${priv(`$${usd(walletUsdc)}`)} USDC on ${net.short}`;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

  // ── The header trust strip — WHERE am I and WHOSE keys are these ──────────
  //
  // This row used to carry four chips: Non-custodial · {network} ·
  // {connectionLabel} · Passkey. The last two are gone, and the split is the
  // point: there are two different questions on this page and they had been
  // interleaved across two rows that each answered half of each.
  //
  //   header (here)      → where am I, whose keys           — never scrolls
  //   health-card chips  → what KIND of account is this      — captioned, wraps
  //
  // `connectionLabel` and `passkey` are read off `useWalletIdentity`, which
  // returns three facts about the account: connector family, smart-vs-EOA, and
  // passkey. The health card renders all three together; this row rendered two
  // of the three, so the header could say "Coinbase Wallet · Passkey" while
  // never saying whether the account is a smart wallet or an EOA — two thirds
  // of a derivation, which is a worse artifact than either the whole or none.
  //
  // KEPT here: the two that are NOT about the account. `net.short` is about the
  // chain (and is the one chip that can warn — it was the literal "Base" while
  // the app defaulted to Sepolia, directly above the receive QR). "Non-custodial"
  // is about THIS APP, which holds no key and no fund; it is the answer to the
  // question a stranger asks first, so it belongs beside the address in a bar
  // that never scrolls away.
  //
  // KEPT on the health card: the account triple, intact. It is the complete set
  // and it is the only row that has room for it.
  //
  // One array, two renderings — the chips at `sm` and up, and the `sm:hidden`
  // line under the greeting. Those two are complementary by construction, so
  // the same claim is never on screen twice.
  const trustChips: { label: string; warn: boolean }[] = [
    { label: "Non-custodial", warn: false },
    { label: net.short,       warn: isTestnet },
  ];

  return (
    <div className="flex flex-row h-full w-full bg-[#050508] text-slate-200 overflow-hidden">

      {/* ── PANE 2 · WALLET CONTEXT (272px) ─────────────────────────────────
          Layout "2a" (design image 7): the app-shell nav rail is pane 1, THIS
          is pane 2 — a wallet-context sidebar — and the scroll region is pane
          3. Mirrors the Hood three-pane (shell nav + HoodSidebar + board).

          What the design draws here vs. what we honestly render:
            ● // WALLET header   → kept
            ASK BLUEAGENT        → kept, wired to the real chat (chatInput/…)
            CHAINS cards         → a READOUT that also FILTERS, never a switcher.
                                   Each shows the chain's name, its per-chain $
                                   (from /api/wallet/net-worth, which reads BOTH
                                   real-money chains — measured, not asserted) and
                                   its capability caption. Clicking one points the
                                   holdings tabs at that chain and nothing else:
                                   no balance headline, no Activity, and above all
                                   no spend path is re-aimed. That is the whole
                                   difference from the switcher this replaced —
                                   filtering a read-only list cannot mis-send
                                   money, whereas a control that silently re-aimed
                                   Send/Convert/Receive could.
            CREDIT · x402        → design shows "$41.85 · 62% left" off no real
                                   source; credits are not dollar-denominated and
                                   this component reads none, so it is a link to
                                   /app/usage (#199), never a fabricated figure.
            RECENT feed          → DROPPED, a fabricated tx list with no source.
            footer               → displayName + explorer ↗ + Disconnect (real).

          Desktop only (`hidden lg:flex`); below lg the sidebar is hidden, the
          AppShell MobileTopBar prints "// WALLET", and the mobile control row
          inside pane 3 carries the chain toggle + Ask. */}
      <aside className="hidden lg:flex flex-col w-[272px] shrink-0 border-r border-[#1A1A2E] bg-[#07070c]">
        <div className="flex items-center gap-2 min-h-[56px] px-4 border-b border-[#1A1A2E] shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] shrink-0" style={{ boxShadow: "0 0 8px #4FC3F7" }} />
          <span className="font-mono text-[11px] font-semibold tracking-[0.16em] text-[#E2E8F0]">// WALLET</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">

          {/* ASK BLUEAGENT — the relocated command input, same handlers */}
          <div>
            <div className="font-mono text-[9px] font-medium tracking-[0.16em] text-[#64748B] mb-2">ASK BLUEAGENT</div>
            <div className="flex gap-1.5">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && chatInput.trim()) {
                    sendChat(chatInput);
                    setChatOpen(true);
                  }
                }}
                onClick={() => setChatOpen(true)}
                placeholder="Ask anything…"
                className="flex-1 min-w-0 bg-[#0D0D14] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-[8px] px-2.5 py-2 font-mono text-[11px] text-slate-200 placeholder:text-slate-600 outline-none"
              />
              <button
                onClick={() => { if (chatInput.trim()) sendChat(chatInput); setChatOpen(true); }}
                aria-label="Ask BlueAgent"
                className="w-[34px] shrink-0 rounded-[8px] bg-[#4FC3F7] text-[#050508] flex items-center justify-center font-mono text-[13px] font-semibold hover:bg-[#29ABE2] transition-colors"
              >→</button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {["what changed today", "top up gas"].map(q => (
                <button key={q} onClick={() => { setChatInput(q); setChatOpen(true); }}
                  className="font-mono text-[9.5px] text-[#94A3B8] border border-[#1A1A2E] rounded-full px-2 py-[3px] hover:border-[#4FC3F7]/40 hover:text-[#E2E8F0] transition-colors">{q}</button>
              ))}
            </div>
          </div>

          {/* CHAINS — a readout that FILTERS the holdings tabs. It used to flip
              the whole page's `network`; that control is gone (it changed a heading
              and a balance and little else, while the per-action cards —
              Convert/Receive/Send — are what actually differ per chain). Clicking a
              card now sets `portfolioChain` and scrolls to the tables: it narrows
              what you are LOOKING at, it re-aims nothing you can SPEND from. What
              survives is the honest part: each chain's name, its measured per-chain $ (from
              /api/wallet/net-worth, which reads BOTH real-money chains), and its
              capability caption. Same honesty as before — "≥" when a row was
              unpriced, "unread" when a chain would not answer (never $0), and no
              figure at all for Base Sepolia (testnet, no real $). Base carries a
              "home" tag because the balance headline + Activity read from it. */}
          <div>
            <div className="font-mono text-[9px] font-medium tracking-[0.16em] text-[#64748B] mb-2">CHAINS</div>
            <div className="flex flex-col gap-[7px]">
              {WALLET_CHAIN_ORDER.filter(nk => testnetUnlocked || !WALLET_CHAINS[nk].testnet).map(nk => {
                const c = WALLET_CHAINS[nk];
                const home = nk === "base"; // the wallet's home chain (headline + Activity)
                const caps = [c.can.fiat && "cash", c.can.send && "send", c.can.swap && "swap", "holdings"].filter(Boolean).join(" · ");
                // Per-chain $ — only for the two real-money chains net-worth
                // covers. An `undefined` lookup means still reading (show "…")
                // or a failed read (show nothing); an "unavailable" status means
                // the chain would not answer (show "unread", amber) — never $0.
                // Base Sepolia is a testnet and is absent from the sum → no
                // figure at all, because a "$" over play money would be exactly
                // the fabrication this wallet refuses.
                const cw = c.testnet ? undefined : netWorth.chain(nk as "base" | "robinhood");
                // `priv` wraps ONLY the branch that is a real figure — "unread"
                // and "…" pass through, because the eye toggle hides what the
                // wallet knows, never what it failed to learn.
                const worth = c.testnet ? null
                  : cw ? (cw.status === "unavailable" ? "unread" : priv(`${cw.isFloor ? "≥ " : ""}$${usd(cw.usd)}`))
                  : (acct && !netWorth.received) ? "…"
                  : null;
                // Selected = this chain is the one the holdings tabs are filtered
                // to. Distinct from `home`, which is a permanent fact about the
                // chain (headline + Activity read from Base); the two can both be
                // true and they mean different things, so they never share a style.
                const sel = portfolioChain === nk;
                return (
                  <button key={nk} type="button" onClick={() => showChain(nk)}
                    aria-pressed={sel}
                    aria-label={`Show ${c.label} holdings in the Tokens and Stocks tabs`}
                    className={`w-full text-left rounded-[10px] p-2.5 border transition-colors ${
                      sel   ? "border-[#4FC3F7]/60"
                      : home ? "border-[#4FC3F7]/20 hover:border-[#4FC3F7]/45"
                      :        "border-[#1A1A2E] hover:border-[#4FC3F7]/35"}`}
                    style={{ background: home ? "#4FC3F708" : "transparent" }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-medium flex items-center gap-1.5"
                        style={{ color: home ? "#4FC3F7" : c.testnet ? "#F59E0B" : "#94A3B8" }}>
                        {c.label}
                        {home && <span className="font-mono text-[8px] text-[#4FC3F7]/70 border border-[#4FC3F7]/25 rounded px-1 py-px">home</span>}
                      </span>
                      {worth != null && (
                        <span className="font-mono text-[10px] shrink-0"
                          style={{ color: worth === "unread" ? "#F59E0B99" : worth === "…" ? "#64748B" : "#E2E8F0" }}>
                          {worth}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <span className="font-mono text-[9.5px] text-[#64748B]">{caps}</span>
                      <span className="font-mono text-[9px] shrink-0"
                        style={{ color: sel ? "#4FC3F7" : "#334155" }}>
                        {sel ? "showing" : "show →"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CREDIT · x402 — a link, and staying a link.
              It used to be justified as "this component reads no credit data",
              which stopped being true in this change: the AGENT SPEND card in
              the main column now reads the real ledger. The justification is
              therefore replaced rather than left to rot — this card stays a
              link because the figures are ALREADY on screen a column away, and
              printing them twice on one viewport is how two copies of a number
              start drifting. What it must never become is the design's
              "$41.85 · 62% left": credits are not dollar-denominated, and no
              credit BALANCE is read anywhere on this page. */}
          <div>
            <div className="font-mono text-[9px] font-medium tracking-[0.16em] text-[#64748B] mb-2">CREDIT · x402</div>
            <a href="/app/usage"
              className="group block rounded-[10px] border border-[#1A1A2E] bg-[#0D0D14] p-3 hover:border-[#4FC3F7]/40 transition-colors">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-[#E2E8F0]">Usage &amp; spend</span>
                <span className="font-mono text-[11px] text-[#4FC3F7] group-hover:translate-x-0.5 transition-transform">→</span>
              </div>
              <div className="font-mono text-[9.5px] text-[#64748B] mt-1.5">Per-tool x402 spend on the Usage page</div>
            </a>
          </div>
        </div>

        {/* footer — the account triple: identity, explorer, disconnect */}
        <div className="border-t border-[#1A1A2E] px-4 py-3 shrink-0">
          <div className="font-mono text-[11px] font-medium text-[#E2E8F0] truncate">{displayName}</div>
          <div className="font-mono text-[9.5px] text-[#64748B] mt-[3px] flex items-center gap-1.5">
            <a href={`${net.explorer}/address/${acct}`} target="_blank" rel="noopener noreferrer"
              className="hover:text-[#4FC3F7] transition-colors">{net.explorerName} ↗</a>
            <span>·</span>
            <button onClick={() => disconnect()} className="hover:text-red-400 transition-colors">Disconnect</button>
          </div>
        </div>
      </aside>

      {/* ── PANE 3 · content column (nav rail is pane 1, sidebar above is pane 2) */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

      {/* ── PANE 3 header · greeting + trust chips (2a) ────────────────────
          Design "2a" content header: greeting on the left, trust chips right.
          The identity + Disconnect the 2b bar carried here have moved to the
          pane-2 footer, so they are not printed twice. The greeting uses the
          personal register ONLY when we know the person (`isNamed`); otherwise
          it greets no one rather than addressing a hex string in the second
          person. Desktop only — below lg the MobileTopBar prints "// WALLET". */}
      <div className="hidden lg:flex items-center justify-between shrink-0 min-h-[56px] px-5 py-2 border-b border-[#1A1A2E]">
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar
            photoUrl={identityCard.photoUrl}
            initials={identityCard.initials}
            colorSeed={identityCard.colorSeed}
            size={22}
          />
          <span className="font-mono text-[13px] text-[#E2E8F0] truncate">
            {isNamed
              ? <>Good {greeting}, <span className="text-[#4FC3F7]">{displayName}</span></>
              : <>Good {greeting}</>}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {trustChips.map(c => (
            <span key={c.label} className="font-mono text-[10px] px-2 py-1 rounded-md"
              style={c.warn
                ? { color: "#F59E0B", border: "1px solid #F59E0B40", background: "#F59E0B10" }
                : { color: "#94A3B8", border: "1px solid #1A1A2E", background: "#0d0d12" }}>{c.label}</span>
          ))}
          {new Date() >= new Date("2026-06-25") && (
            <span className="font-mono text-[10px] px-2 py-1 rounded-md font-medium"
              style={{ color: "#4FC3F7", border: "1px solid #4FC3F730", background: "#4FC3F710" }}>⌁ Beryl</span>
          )}
        </div>
      </div>

      {/* Mobile control row — below lg the header above is hidden and the
          MobileTopBar carries only the title, so the Ask entry lives here. The
          chain toggle that used to sit here is gone with the global switcher;
          the home chain is named on the left instead, and the per-action cards
          carry their own chain choice. Complementary by breakpoint with the
          desktop bar, so no control is ever on screen twice. */}
      <div className="lg:hidden flex items-center gap-1.5 shrink-0 px-3 py-2 border-b border-[#1A1A2E]">
        <span className="font-mono text-[10px] flex items-center gap-1.5" style={{ color: "#4FC3F7" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] shrink-0" /> {net.short}
          <span className="font-mono text-[8px] text-[#4FC3F7]/70 border border-[#4FC3F7]/25 rounded px-1 py-px">home</span>
        </span>
        <button onClick={() => setChatOpen(true)}
          className="ml-auto shrink-0 font-mono text-[10px] font-semibold px-3 py-1 rounded-md"
          style={{ background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
          Ask BlueAgent
        </button>
      </div>


      {/* The wallet's own <main> + the h-14 identity header were removed here.
          The app shell already renders the page <main>, so a wallet <main> was
          a nested-main (invalid), and layout 2b folds the identity, greeting
          and trust chips into the command bar above — so this sub-header would
          have printed all of them a second time. The scroll region below is now
          a direct child of the page flex-col. */}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 xl:p-5 2xl:p-6 3xl:p-8">

          {/* The global testnet banner was removed with the switcher. Testnet is
              no longer a page MODE, so there is no whole-page state to warn about
              here — the home chain is always Base mainnet. Base Sepolia now
              appears only as an opt-in portfolio SECTION and a Receive OPTION,
              each of which carries its own "test-only" caption locally. */}

          {/* ── The "Switch to Base" banner was REMOVED here (ShunTr, 2026-09-13) ──
              It said "Wallet is on X / Balances below are read from Base mainnet"
              with a Switch button, gated on `chainMismatch`. It was correct when
              this page was single-chain and `network` was a MODE: one chain was
              read, one chain was signed on, and a mismatch between them was a
              real thing to warn about.

              Both halves of that premise are gone. `network` is a hard-pinned
              const (see its definition) and the Portfolio below renders BOTH
              Base and Robinhood at once, so:

                · "Balances below are read from Base mainnet" is FALSE as written
                  — a user scrolled to their Robinhood holdings was being told
                  the numbers in front of them came from the other chain.
                · "Switch to Base" pointed AWAY from whichever chain the user was
                  actually reading. On the RH section it offered to move them off
                  4663 — the one action guaranteed to be wrong there.

              Nothing is lost by deleting it, because the warning it was trying
              to give now lives where it can be accurate: each action card owns
              an in-card network selector (#246) and switches the wallet itself
              at sign time — `RhSwapCard` does `switchChainAsync({ chainId })`
              inside `doSwap`, and the Base cards do the same for 8453. A card
              that knows which chain it will sign on can state the mismatch
              precisely; a page-level banner over a two-chain page cannot. */}

          {/* ── Section 1: Account (balance + actions) | Health ─────────────
              This was three equal columns: Balance | Actions | Health. The
              middle card held a 2×2 grid plus a two-button row, and once the
              controls dropped to three the column became a short box with a
              column of empty space under it — the gap in the screenshot.

              The fix is a merge rather than a filler. A balance and the buttons
              that move it are ONE thing (which is how Bankr's wallet reads: the
              figure and Deposit/Send/Swap share a header, they are not
              neighbouring widgets), so they now share a card, side by side on
              desktop and stacked on a phone. The card spans two columns and
              Health keeps the third.

              `items-stretch` (2026-09-13), replacing `items-start`. The row now
              holds exactly TWO boxes, and with `items-start` their heights were
              whatever their contents happened to come to — which is how the
              Share button, one wrapped row inside a `flex-wrap` chip list, made
              Health visibly taller than the card beside it. Deleting Share fixed
              THAT instance and fixed nothing structural: the next chip to wrap,
              on the next narrow viewport, reopens the same gap. Stretching makes
              the two equal by construction, so a ragged row stops being a thing
              the layout can express. This is not the "filler" the paragraph
              above argued against — that was about a THIRD box with nothing in
              it, and the argument was for deleting the box, which we did. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 items-stretch">

            {/* Account card — balance, breakdown, and the three controls */}
            <div className="md:col-span-2 rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-4">
             <div className="flex flex-col sm:flex-row sm:justify-between gap-4">
              <div className="min-w-0 flex-1">
              {/* ── THE HEADLINE ────────────────────────────────────────────
                  The 28px figure is the WHOLE wallet, every chain, tokens and
                  tokenized stocks — the question a wallet's biggest number is
                  assumed to be answering.

                  It used to be one chain's cash (`walletState.balance`, headed
                  `net.stableSymbol`). That was honest when a switcher sat on top
                  of it and the heading changed with it. The switcher is gone —
                  `network` is a const now — so the same figure had become a
                  fixed Base-USDC number wearing the position of a total: it did
                  not move when the user looked at Robinhood, and a number that
                  ignores half the wallet while occupying the headline is read as
                  the wallet. That Base figure is not deleted; it lives in the
                  Tokens tab below, per chain and per token, where it is one row
                  among all of them instead of a second scope competing with the
                  headline. (It spent one release directly under this figure, in
                  an "ON BASE" block — near enough to read as a breakdown of a
                  number it did not break down. Removed 2026-09-12.)

                  The "≥" is the SERVER'S verdict (net-worth.ts), not a guess
                  made here: it means a row was unpriced, a chain went unread, or
                  a list was truncated, so the true total is at least this. We
                  render that verdict and the reasons behind it; we never
                  fabricate a fill — and we never merge it with a single-chain
                  figure read elsewhere, because "the bigger of the two" is a
                  number no reader produced.

                  A dash is not a worse number, it is the absence of a claim. A
                  read in flight and a read that failed both get one; only a
                  landed read may print a figure. */}
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-mono text-[9px] text-slate-500 tracking-widest">TOTAL · ALL CHAINS</span>
                {/* Display-only, and deliberately reversible in one click. It
                    masks figures the page has ALREADY read — it never suppresses
                    an "unread" or a warning, because a hidden balance and an
                    unknown balance must stay distinguishable. */}
                <button type="button" onClick={toggleHideBal}
                  aria-pressed={hideBal}
                  aria-label={hideBal ? "Show balance amounts" : "Hide balance amounts"}
                  title={hideBal ? "Show amounts" : "Hide amounts"}
                  className="font-mono text-[9px] px-1.5 py-0.5 rounded-md text-slate-600 hover:text-slate-300 hover:bg-[#13131f] transition-colors">
                  {hideBal ? "👁 show" : "👁 hide"}
                </button>
              </div>
              {/* The "≥" stays. The paragraph that used to explain it does not.
                  ShunTr, 2026-09-16, looking at his own connected wallet: under
                  a headline balance, two lines of indexer plumbing — "Found
                  on-chain without Moralis — a token the explorer has not indexed
                  would not appear here. · some tokens have no price" — read as a
                  malfunction rather than as a caveat. It is the right fact in
                  the wrong register: a wallet's first line is a balance.

                  What is removed is the PROSE, not the verdict. The claim the
                  server makes is "at least", and that claim is still rendered,
                  at 28px, in the figure itself — the "≥" is not a decoration we
                  may drop for tidiness. The reasons move into `title`, so "at
                  least according to what?" is one hover away instead of being
                  shouted permanently.

                  Deliberate and known: `title` does not exist on touch. That
                  costs the EXPLANATION, never the claim — a phone still sees the
                  "≥", and the per-chain rows below still name any chain that
                  went unread, which is the reason that matters most. Flagged to
                  ShunTr so he can say whether he wants the reasons gone
                  outright; removing them silently is his call to make, not
                  ours. */}
              <div
                className={`font-mono text-[28px] font-bold text-white leading-none${totalIsFloor ? " cursor-help" : ""}`}
                title={totalIsFloor && floorReasons.length > 0
                  ? `Holds at least this much — ${floorReasons.join(" · ")}`
                  : undefined}>
                {netWorth.failed || !netWorth.data
                  ? "—"
                  : priv(`${netWorth.data.total.isFloor ? "≥ " : ""}$${usd(netWorth.data.total.usd)}`)}
              </div>
              {/* Why the figure is a dash. `netWorth.failed` is checked before
                  `.data` because a failed read still carries a `data` object —
                  one with an `error`. Both of these are states where there is NO
                  figure, so they keep their line; the floor case has one and
                  explains itself through the `title` above. */}
              {netWorth.failed ? (
                <div className="font-mono text-[9px] text-amber-500/80 mt-1.5 leading-relaxed">
                  Couldn&apos;t read across chains — unknown, not zero.
                </div>
              ) : !netWorth.data ? (
                <div className="font-mono text-[9px] text-slate-600 mt-1.5">reading every chain…</div>
              ) : null}

              {/* Per-chain, `lg:hidden` — the sidebar carries these same figures
                  and is itself `hidden lg:flex`, so the two never show at once:
                  below `lg` this IS the per-chain breakdown, above it the card
                  stays clean. Driven off WALLET_CHAIN_ORDER, so a third chain
                  appears here by being added to the config. Tapping one filters
                  the holdings tabs, exactly as the sidebar card does. */}
              {acct && netWorth.data && !netWorth.failed && (
                <div className="flex flex-wrap gap-1.5 mt-3 lg:hidden">
                  {WALLET_CHAIN_ORDER.filter(nk => testnetUnlocked || !WALLET_CHAINS[nk].testnet).map(nk => {
                    // Same guard as the sidebar: a testnet is absent from the
                    // cross-chain sum by design, so it is never asked for a
                    // figure — play money with a "$" on it is a fabrication.
                    const cw = WALLET_CHAINS[nk].testnet
                      ? undefined : netWorth.chain(nk as "base" | "robinhood");
                    const on = portfolioChain === nk;
                    return (
                      <button key={nk} type="button" onClick={() => showChain(nk)}
                        aria-pressed={on}
                        aria-label={`Show ${WALLET_CHAINS[nk].label} holdings in the Tokens and Stocks tabs`}
                        className="font-mono text-[9.5px] px-2 py-1 rounded-md transition-colors"
                        style={on
                          ? { background: "#4FC3F712", color: "#4FC3F7", border: "1px solid #4FC3F730" }
                          : { color: "#64748b", border: "1px solid #1A1A2E" }}>
                        {WALLET_CHAINS[nk].short}{" "}
                        <span className="text-slate-400">
                          {WALLET_CHAINS[nk].testnet ? "test"
                            : !cw ? "…"
                            : cw.status === "unavailable" ? "unread"
                            : priv(`${cw.isFloor ? "≥" : ""}$${usd(cw.usd)}`)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              </div>

              {/* Actions — the same three controls, now inside the card whose
                  number they change.

                  NOTHING was deleted to get from six to three; every path still
                  has an entrance, it just stopped competing for one 2×2 grid:
                    Receive → renamed "Deposit" (same panel, `openAction("receive")`)
                    💵 Add  → a button INSIDE that panel, next to the QR, where
                              "put money in" actually belongs
                    🏦 Out  → beside it, under a "card ↔ bank" heading. It is an
                              EXIT from real funds, so it keeps a route by rule:
                              a user who cannot find "cash out" has money
                              stranded, not a missing button.
                    📷 Scan → already Send's first control, unchanged.

                  `disabledReason` is a STRING, not a boolean, and it comes from
                  `can` rather than from `network === "base"`. A disabled button
                  that cannot say why reads as a bug; one that says "Swaps route
                  through Base mainnet" reads as a fact about the chain the user
                  just picked. */}
              <div className="sm:w-[17.5rem] sm:shrink-0">
                <div className="font-mono text-[9px] text-slate-500 tracking-widest mb-2">ACTIONS</div>
                {/* 1×4, not 2×2 (reversed 2026-09-11). The old comment here
                    argued four buttons "do not fit legibly across a 13.5rem
                    column" — true of that column, which is why the column moved
                    instead of the layout: 17.5rem with a smaller label gives
                    each button ~65px, and the headline beside it is `min-w-0
                    flex-1` so it yields the space rather than overflowing.

                    One row also stops implying a ranking the app does not have.
                    A 2×2 grid reads as two tiers — Deposit/Send on top, the
                    lesser two below — when all four are peers: four ways money
                    moves.

                    Bridge carries NO `disabledReason` on purpose —
                    `can.send`/`can.swap` answer "does the CONNECTED chain
                    support this?", and a bridge names its own origin in-card,
                    so the connected chain is not what decides. The panel asks
                    Relay what is actually movable and says so there. */}
                <div className="grid grid-cols-4 gap-1.5">
                  <ActionButton icon="⬇" label="Deposit" onClick={() => openAction("receive")} />
                  <ActionButton icon="➡" label="Send" primary onClick={() => openAction("send")}
                    disabledReason={can.send ? null : `Not on ${net.short}`} />
                  <ActionButton icon="⇅" label="Swap" onClick={() => openAction("convert")}
                    disabledReason={can.swap ? null : `Base only`} />
                  <ActionButton icon="⇄" label="Bridge" onClick={() => openAction("bridge")} />
                </div>
                {onrampMsg && <div className="font-mono text-[9px] text-amber-400 mt-2">{onrampMsg}</div>}
              </div>
             </div>

              {/* ── What used to be here: the ON BASE itemisation ───────────
                  Four rows — USDC, aUSDC (Aave), Morpho, ETH (gas) — plus a
                  low-gas warning, under an "ON BASE" heading.

                  REMOVED 2026-09-12. This card's whole job is one number that
                  covers every chain; the rows under it listed ONE chain and did
                  not sum to the figure above them, so the card was answering two
                  questions in two scopes and the smaller answer sat directly
                  beneath the bigger one. "$1.28 USDC" under "≥ $5.88" reads as a
                  breakdown no matter how the heading is worded — and the earlier
                  comment here was already arguing against exactly that
                  misreading, which is a sign the layout, not the wording, was
                  the problem.

                  Nothing was deleted, only de-duplicated. Every row still has a
                  home that is BETTER than this one:
                    · USDC + ETH → the Tokens tab below, per chain, with prices
                      and a Sell control. It lists every token, not four.
                    · aUSDC / Morpho → the same tab; the Withdraw exit is its own
                      mission ("supplied — withdrawable any time").
                    · Low gas → AI Mission Control, which says the same thing AND
                      carries a `Get ETH` button. That warning was moved up there
                      (and un-gated from the USDC read) in this same change,
                      BEFORE these rows came out — losing the "you cannot sign"
                      signal was the one real risk here.

                  What does NOT leave with them is the way out of a failed read.
                  A read that broke with no Retry beside it is #214, and it is
                  not re-introduced: the caption below keeps the escape hatch,
                  and only renders when something is actually wrong. The
                  "reading…" and "no USDC yet" branches are gone with the rows —
                  they were commentary on an itemisation that no longer exists,
                  and the tables carry their own read-state banners. */}
              {(balanceRead.body === "failed" || balanceRead.totalIsFloor) && (
                <div className="mt-3 pt-3 border-t border-[#13131f] flex items-start justify-between gap-2">
                  <span className="font-mono text-[9px] text-amber-500/80 leading-relaxed">
                    {balanceRead.body === "failed"
                      ? `Couldn't read your balance on ${net.short}. Unknown — not zero.`
                      : `Part of your ${net.short} position could not be read — it holds at least this much.`}
                  </span>
                  <RetryRead onRetry={retryBalance} busy={rereading} />
                </div>
              )}
            </div>

            {/* Health card */}
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-4">
              <div className="font-mono text-[9px] text-slate-500 tracking-widest mb-2">PORTFOLIO HEALTH</div>
              <div className="flex items-end gap-2 mb-3">
                <div className="font-mono text-[32px] font-bold leading-none" style={{ color: scoreColor }}>
                  {portfolioScore ?? "—"}
                </div>
                {/* WHY there is no score, in the caller's own words. This was
                    `balancesKnown ? "No data yet" : "Reading…"` — two labels for
                    five outcomes, and the one that shipped was the wrong one:
                    an errored USDC read left `balancesKnown` false forever, so
                    a failed read displayed "Reading…" indefinitely. "No data
                    yet" was no better on a failed read — it reads as a fact
                    about the wallet ("nothing here") rather than about our
                    read ("we didn't get it"). Each branch below names which
                    input is missing, so the absence is attributable. */}
                <div className="font-mono text-[13px] text-slate-500 mb-1">
                  {portfolioScore != null ? `/100 · ${scoreGrade}`
                    /* `!!acct &&` for the same reason the legs are filtered by
                       `applies`: a disabled wagmi query is permanently
                       `isPending`, so an unguarded read of it would pin this to
                       "Reading…" rather than describe anything. */
                    : balanceRead.body === "pending" || (!!acct && ethQ.isPending) ? "Reading…"
                    : historyRead === "pending"       ? "Reading…"
                    : balanceRead.body === "failed"   ? "Balance unread"
                    : balanceRead.state === "partial" ? "Partial read"
                    : ethBal == null                  ? "Gas balance unread"
                    /* The fourth input, named like the other three. Without this
                       rung the score simply vanished when the history read
                       failed, which is an absence with no attribution — the
                       thing this ladder exists to prevent. */
                    : actScore == null                ? "Activity unread"
                    : "No data yet"}
                </div>
              </div>
              {/* Every chip below is DERIVED. `identity` comes from the live
                  connector + on-chain bytecode (lib/wallet/identity.ts); the
                  Basename chip from the ENS/Basename lookup. The two that used
                  to be `active={true}` — "Smart Wallet" and "Passkey" — were
                  true only for Coinbase Smart Wallet users and were shown to
                  everyone, so a MetaMask EOA was told it had a passkey.

                  This is now the ONLY place the account triple is rendered —
                  the header carried `connectionLabel` and the passkey too, and
                  it kept the two that are about the account while dropping the
                  one (`accountLabel`) that completes them. See `trustChips`. */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                <IdentityChip label={identity.connectionLabel} active={identity.family !== "unknown"} color="#4FC3F7" />
                <IdentityChip label={identity.accountLabel} active={identity.accountKind === "smart"} color="#4FC3F7" />
                <IdentityChip label={identity.passkeyLabel} active={identity.passkey === "yes"} color="#34D399" />
                {/* Was #A78BFA — the only violet in the file, one chip in a row
                    of five, carrying no meaning the other four don't. The
                    palette is one primary plus three semantic colours (green
                    good / amber warn / red danger); a fifth hue used once is
                    decoration pretending to be a category.

                    KEPT despite the greeting above already printing a Basename
                    when there is one, because it is not the same claim: the
                    greeting answers "what do we call you" and this answers "does
                    this account have a Basename", which is a checklist item next
                    to Smart Wallet and Passkey and is the only one that renders
                    a NEGATIVE ("No Basename") the greeting can never say.

                    `?? fname` is gone though, and that is the price of keeping
                    it. A Farcaster username is not a Basename. With `fname`
                    accepted, someone with `@shun` on Farcaster and no Basename
                    saw a lit chip reading `@shun` in the slot whose unlit text
                    is "No Basename" — the chip asserting a Basename that does
                    not exist. Exactly the defect the passkey chip had two
                    paragraphs up. They still get greeted by name: `fname` is a
                    rung of its own on the shared ladder (`source: "farcaster"`),
                    ranked below a Basename and above a bare address, so the
                    header can use the name without this chip having to claim it
                    came from the Basename registry. */}
                <IdentityChip label={name ?? "No Basename"} active={!!name} color="#4FC3F7" />
                {/* "Non-custodial" was a sixth chip here. It is a CONSTANT in a
                    row of five per-user derivations — its own note used to say
                    so ("unlike the chips above it cannot drift away from a
                    per-user truth it was never reading"), which is the argument
                    for moving it, not for keeping it here. It now appears once,
                    in the header trust strip, where it sits beside the address
                    and answers the question a stranger asks first. */}
              </div>
              {/* ── What used to be here: a "Share" button ───────────────────
                  It copied `My <chain> wallet health: <score>/100 @blueagent_`
                  to the clipboard, and it rendered only when `portfolioScore !=
                  null` — the guard that kept an empty wallet's absent grade from
                  being broadcast as a real one.

                  REMOVED 2026-09-12, for LAYOUT, and nothing about the guard
                  above changed: it sat below a `flex-wrap` chip row, so it was
                  always a row of its own, and that extra row made this card
                  taller than the TOTAL · ALL CHAINS card it sits beside in the
                  same `items-start` grid. Two cards in one row at two different
                  heights reads as one of them being broken.

                  Nothing is stranded by its absence. The score is a DERIVED
                  local reading, not a record — every input is re-computed on
                  each render from the live balance/gas/activity reads, so there
                  is no artifact here that only this button could have gotten
                  out. The wallet's one genuinely shareable object lives in the
                  Deposit panel, where the thing being shared actually is.

                  That used to read "the pay link, keeps its own button" — and
                  #254 deleted that button, which would have left this note
                  pointing a reader at something that isn't there. The
                  shareable object is the EIP-681 QR; the link was never one,
                  because middleware 301s it away. */}
            </div>

          </div>

          {/* ── Two-pane 2b body: portfolio (wide) + agent context rail ──────
              Below the full-width Section 1 KPI strip the body splits. The RAIL
              (Section 2 — AI Mission Control + Allocation) is declared FIRST, so
              that below xl it stacks right under the balance/health where "what
              should I do next" belongs; `xl:flex-row-reverse` then floats it to
              the RIGHT at desktop while the portfolio tables take the wide left
              column. This is the handoff's right column, folded in — the wallet
              no longer carries its own second sidebar to hold it. */}
          <div className="flex flex-col xl:flex-row-reverse gap-3 mb-3 items-start">

            {/* RIGHT rail (pane A) — 340px at xl, full-width stacked below it. */}
            <div className="w-full xl:w-[340px] xl:shrink-0 space-y-3">

          {/* ── Section 2: AI Mission Control | Portfolio Allocation ────────
              A "WALLET" card led the left column here, listing USDC, aUSDC,
              Morpho and a GAS RESERVE row. Those are the same four rows the
              balance card in Section 1 already renders, from the same four
              variables, one screen-height apart — the same number written twice
              on one page, which is the defect the previous release fixed
              BETWEEN two pages. Two copies of one derivation is how a surface
              ends up disagreeing with itself; the wallet's own history has that
              happening three separate times (see the allocation card below).

              Its one non-duplicate pixel was the low-gas warning, which is why
              this is a merge and not a delete: that moved up into the Section 1
              ETH row, where it now also fires at exactly zero.

              A "YIELD RATES · BASE" board sat under it — the top four DefiLlama
              pools with comparison bars. The previous release gated it to
              holders only, on the argument that for them it was "context on the
              money they have in". It wasn't: it ranked FOUR pools, of which the
              user's was at most one, and the only action it offered was to go
              somewhere else. Context you can't act on is an advert with a
              smaller audience.

              With both gone the left column held nothing; the two surviving
              cards now stack in the 2b right rail (Mission Control over
              Allocation) instead of sitting side by side. */}
          <div className="space-y-3">

              {/* AI Mission Control */}
              <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {/* No `opacity-90`. The mark is a clipped JPEG whose bars
                        are cut-outs, so fading it does not soften a logo — it
                        blends the brand blue toward the card and lets the card
                        bleed through the counters. Full opacity, rounded to the
                        artwork's own corner. */}
                    <img src="/logomark.svg" alt="" aria-hidden className="w-4 h-4 rounded-sm" />
                    <span className="font-mono text-[9px] text-slate-500 tracking-widest">AI MISSION CONTROL</span>
                  </div>
                  <button onClick={() => setChatOpen(o => !o)}
                    className="font-mono text-[9px] px-2.5 py-1 rounded-lg font-bold transition-colors"
                    style={{ background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
                    Ask BlueAgent →
                  </button>
                </div>
                <p className="font-mono text-[11px] text-slate-300 mb-3 leading-relaxed">{missionSummary}</p>
                <div className="space-y-2">
                  {topMissions.map((item, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 p-2.5 rounded-xl"
                      style={{ background: `${item.color}08`, border: `1px solid ${item.color}20` }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.priority === "high" && <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] animate-pulse" />}
                          {item.priority === "warn" && <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />}
                          {item.priority === "good" && <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />}
                          {item.priority === "info" && <span className="w-1.5 h-1.5 rounded-full bg-[#64748b]" />}
                          <span className="text-sm leading-none">{item.icon}</span>
                        </div>
                        <span className="font-mono text-[10px] text-slate-300 leading-snug">{item.text}</span>
                      </div>
                      {item.action && item.onAction && (
                        <button onClick={item.onAction}
                          className="font-mono text-[9px] px-2 py-1 rounded-lg shrink-0 font-bold whitespace-nowrap"
                          style={{ background: `${item.color}20`, color: item.color, border: `1px solid ${item.color}40` }}>
                          {item.action}
                        </button>
                        )}
                    </div>
                  ))}
                  {/* The last place on this page where an empty list was read
                      as a clean bill of health.

                      `allMissions` is built by an if-chain that deliberately
                      pushes NOTHING on pending, failed or partial — an empty
                      list beats a confident wrong instruction. Correct in the
                      derivation, and then this slot turned that silence back
                      into "✓ All good": a GREEN all-clear over a wallet whose
                      balance we had just failed to read. Same shape as the
                      `$0.00` and the "No assets yet" this batch has been
                      closing, and the last one standing — the derivation was
                      honest and the rendering re-asserted underneath it.

                      "No actions needed" is a claim about the user's position.
                      `state === "complete"` is the only thing that licenses it,
                      exactly as `canAssertEmpty` licenses the empty branches
                      elsewhere. The other two branches say which fact is
                      missing, and the degraded one carries the way out. */}
                  {topMissions.length === 0 && (
                    balanceRead.state === "complete" ? (
                      <div className="font-mono text-[10px] text-slate-600 py-2 text-center">✓ All good — no actions needed</div>
                    ) : balanceRead.body === "pending" ? (
                      <div className="font-mono text-[10px] text-slate-600 py-2 text-center">reading {net.short}…</div>
                    ) : (
                      <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl"
                        style={{ background: "#F59E0B08", border: "1px solid #F59E0B20" }}>
                        <span className="font-mono text-[10px] text-amber-500/80 leading-snug">
                          No checklist over a wallet we couldn&apos;t finish reading — this is not an all-clear.
                        </span>
                        <RetryRead onRetry={retryBalance} busy={rereading} />
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Portfolio Allocation with donut chart */}
              <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-4">
                <div className="font-mono text-[9px] text-slate-500 tracking-widest mb-3">PORTFOLIO ALLOCATION</div>
                {/* ONE predicate for the whole card. It used to be two — the
                    chart asked `balance > 0` (stables only) and the bar below
                    asked whether a ratio existed (stables + priced ETH) — and
                    on a wallet holding dust ETH and no stables the card said
                    "No assets yet" and then drew "Stablecoin 0%" underneath.
                    Everything empty-able now hangs off `holdsAssets`, and the
                    bar is INSIDE this branch so it cannot escape again.

                    But `holdsAssets` answers "is there anything to chart", not
                    "did we manage to look" — it is derived from `pricedTotal`,
                    which is `(walletUsdc ?? 0) + inYield + …`, so an unread
                    balance reaches it as the number 0 and this card printed
                    "No assets yet" over a request that had failed. Same
                    sentence as the balance card's "$0.00", same cause, and the
                    module says only `canAssertEmpty` licenses it.

                    The branch order below is `resolveRead`'s own precedence,
                    deliberately: pending → rows → failed → partial → empty.
                    `holdsAssets` sits in the "rows" slot rather than
                    `body === "rows"` because it counts a leg this read does
                    not — a wallet holding only ETH has zero funded USDC legs
                    and is still not empty. */}
                {balanceRead.body === "pending" ? (
                  <div className="font-mono text-[10px] text-slate-600">reading {net.short}…</div>
                ) : holdsAssets ? (
                  <>
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={portfolioData} cx="50%" cy="50%" innerRadius={24} outerRadius={36}
                            dataKey="value" strokeWidth={0}>
                            {portfolioData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: unknown) => priv(`$${usd(v as number)}`)}
                            contentStyle={{ background: "#0a0a0f", border: "1px solid #1A1A2E", fontSize: 10 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      {portfolioData.map(d => (
                        <div key={d.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                            <span className="font-mono text-[10px] text-slate-400">{d.name}</span>
                          </div>
                          <span className="font-mono text-[10px] text-slate-300">{priv(`$${usd(d.value)}`)}</span>
                        </div>
                      ))}
                      {/* Say so when the ETH leg is missing, rather than letting
                          the chart imply the wallet holds no ETH. */}
                      {ethUnpriced && (
                        <div className="font-mono text-[9px] text-slate-500">
                          {ethBal?.toFixed(4)} ETH — price unavailable, not charted
                        </div>
                      )}
                      {/* The other reason a slice can be too small: not an
                          unpriced leg, an unread one. Same caveat as the "≥"
                          on the balance card, in the shape it takes here. */}
                      {balanceRead.totalIsFloor && (
                        <div className="font-mono text-[9px] text-amber-500/80">
                          Part of the wallet was not read — slices are lower bounds
                        </div>
                      )}
                      <div className="font-mono text-[8px] text-slate-700 pt-1">ETH counted as gas reserve</div>
                      {walletState.gasSavedUsd != null && (
                        <div className="font-mono text-[9px] text-[#34D399]">~${walletState.gasSavedUsd} saved vs mainnet</div>
                      )}
                    </div>
                  </div>
                  {/* Nested inside `holdsAssets`, not a sibling of it. As a
                      sibling it rendered a percentage under "No assets yet" —
                      twice, in two different releases. `stablecoin != null` is
                      still required because a ratio can be unknown even when
                      the wallet plainly holds something (unpriced ETH leg). */}
                  {walletState.allocation.stablecoin != null ? (
                    <>
                      <div className="mt-3 flex items-center justify-between font-mono text-[10px]">
                        <span className="text-slate-500">Stablecoin</span>
                        <span className="text-[#4FC3F7] font-bold">{walletState.allocation.stablecoin}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#1A1A2E] overflow-hidden mt-1">
                        <div className="h-full rounded-full bg-[#4FC3F7]"
                          style={{ width: `${walletState.allocation.stablecoin}%` }} />
                      </div>
                    </>
                  ) : (
                    <div className="mt-3 font-mono text-[9px] text-slate-600">
                      Split unknown — ETH price unavailable
                    </div>
                  )}
                  </>
                ) : balanceRead.body === "failed" ? (
                  <div className="rounded-lg px-3 py-2.5 flex items-start justify-between gap-2"
                    style={{ border: "1px solid #F59E0B30", background: "#F59E0B08" }}>
                    <span className="font-mono text-[9px] leading-relaxed text-amber-500/80">
                      Your balance on {net.short} could not be read. The allocation is unknown —
                      this is not an empty wallet.
                    </span>
                    <RetryRead onRetry={retryBalance} busy={rereading} />
                  </div>
                ) : balanceRead.body === "partial" ? (
                  <div className="rounded-lg px-3 py-2.5 flex items-start justify-between gap-2"
                    style={{ border: "1px solid #F59E0B30", background: "#F59E0B08" }}>
                    <span className="font-mono text-[9px] leading-relaxed text-amber-500/80">
                      Nothing was found in the part that could be read, but part of this wallet was
                      not read at all. Incomplete, not empty.
                    </span>
                    <RetryRead onRetry={retryBalance} busy={rereading} />
                  </div>
                ) : (
                  // The one branch that ASSERTS something about the user, and
                  // it is now reached only from a complete read that found
                  // nothing — `resolveRead`'s `canAssertEmpty`.
                  <div className="font-mono text-[10px] text-slate-600">No assets yet</div>
                )}
              </div>

          </div>
            {/* end RIGHT rail (pane A) */}
            </div>

            {/* LEFT main (pane B) — the wide column: the AGENT SPEND link at its
                head (relocated from above Section 2 so the split can put the
                tables here and Mission Control in the rail), then the tables. */}
            <div className="flex-1 min-w-0 w-full space-y-3">

          {/* ── Section 1.5: AGENT SPEND — two figures, then the link ────────
              This was a bare <Link>: an "AGENT SPEND" heading, one line of
              description, and a `Usage →` chevron. No number anywhere on it. It
              named a quantity and then showed none, which is indistinguishable
              from a panel that failed to load — reported as "chưa hiển thị".

              #199 moved the full <SpendConsole> to /app/usage for a real reason:
              two pages answering "what did I spend on BlueAgent" off one ledger
              can disagree without either being wrong. That reason is honoured by
              REUSING the derivation, not by withholding the number — the fetch
              is `useSpendSummary`, the window caption is `scopeLabel`, the
              nothing-here wording is `emptyState`, and the dollar formatting is
              SpendConsole's own `usdc()`. There is no second derivation here to
              drift, so this card cannot print a figure the console contradicts.

              What stays behind on /app/usage: the per-tool table and the
              calls-per-day chart. This is the headline only. */}
          <AgentSpendCard spend={spend} priv={priv} />

          {/* ── Section 3: the long tail, behind tabs ───────────────────────
              Three full-width sections used to stack here — the token table,
              the stock table, and the transaction list — each of which paginates
              or scrolls internally. Below three cards and a link, that put the
              transaction history somewhere between two and five screens down,
              and nothing above it told you it was there.

              Tabs, not an accordion or a "show more": these are answers to
              different questions ("what do I hold", "what did I do"), only one
              of which is being asked at a time, and a tab bar is the only form
              that states the other options exist while showing one.

              Stocks used to sit WITH tokens under one "Portfolio" tab, on the
              argument that they are the same question asked of a second venue.
              True, and still not enough: with both chains rendered at once that
              tab stacked up to six tables, so the equity leg — the thing the
              stock desk exists for — was consistently below the fold. They are
              now siblings, sharing one chain filter and one dust toggle so that
              switching asset class changes nothing else. */}
          <div ref={portfolioRef} className="flex items-center gap-1 mb-3 border-b border-[#1A1A2E] scroll-mt-4 overflow-x-auto">
            {VIEWS.map(v => (
              <button key={v.id} onClick={() => setView(v.id)}
                aria-current={view === v.id ? "page" : undefined}
                className="font-mono text-[11px] px-3 py-2 -mb-px border-b-2 transition-colors whitespace-nowrap"
                style={view === v.id
                  ? { color: "#4FC3F7", borderColor: "#4FC3F7" }
                  : { color: "#64748b", borderColor: "transparent" }}>
                {v.label}
              </button>
            ))}
          </div>

          {/* TOKENS + STOCKS — BOTH real-money chains, stacked, each under a
              clear chain header.

              This is the switcher's replacement. The page used to show ONE
              chain's tables, gated on the global `network`, and picking Robinhood
              swapped the whole view. With the switcher gone there is nothing to
              swap TO, so the honest answer to "what do I hold?" is: everything, on
              every chain, labelled by chain. Base first (the home chain), then
              Robinhood Chain, then Base Sepolia ONLY when testnet is unlocked.

              The tables are still written out, not mapped — they are NOT
              interchangeable: different data sources (Moralis / Blockscout /
              registry+RPC), different trust models, different reasons to be
              absent. Each renders its OWN read-state honesty (partial/failed/
              empty), so a dead source on one chain never speaks for the other. */}
          {isHoldingsView(view) && (
            <div className="space-y-5">
              {/* THE HOLDINGS CONTROL ROW — shared by Tokens and Stocks, which is
                  the whole reason the two are siblings and not nested tabs. Both
                  switches are VIEW-ONLY (lib/wallet/display.ts): neither cancels a
                  read, neither moves a total, and both say out loud when they are
                  hiding something.

                  CHAIN FILTER — the sidebar cards' other half. "All chains" is the
                  default and the honest default: everything, labelled. Picking one
                  chain hides the others' TABLES and nothing else — no read is
                  cancelled, no figure is recomputed, and the account card's
                  TOTAL · ALL CHAINS line keeps covering every chain, so the total
                  never silently follows the filter.

                  The amber note is the point. A one-chain view looks exactly like a
                  wallet that holds one chain, and "hidden" reading as "empty" is the
                  same failure as an unread balance reading as $0 — so the view says
                  which one it is instead of leaving the user to infer it. */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex gap-1">
                  {(["all", ...WALLET_CHAIN_ORDER.filter(nk => testnetUnlocked || !WALLET_CHAINS[nk].testnet)] as Array<"all" | WalletChain>).map(f => {
                    const on = portfolioChain === f;
                    return (
                      <button key={f} type="button" onClick={() => setPortfolioChain(f)}
                        aria-pressed={on}
                        className="font-mono text-[10px] px-3 py-1.5 rounded-lg transition-colors"
                        style={on
                          ? { background: "#4FC3F712", color: "#4FC3F7", border: "1px solid #4FC3F730" }
                          : { color: "#64748b", border: "1px solid #1A1A2E" }}>
                        {f === "all" ? "All chains" : WALLET_CHAINS[f].short}
                      </button>
                    );
                  })}
                </div>

                {/* NOISE TOGGLE. Removes two different kinds of row and says so:
                    priced under $DUST_USD, and priced at nothing at all because
                    no feed would quote them. The threshold is printed from
                    DUST_USD rather than typed in, so the control can never
                    advertise a cutoff the filter does not use.

                    The label deliberately does NOT read "Hide < $1". It used to,
                    while the filter really did only remove sub-dollar rows — and
                    a label naming a threshold over a filter that also drops
                    UNPRICED rows would be claiming a price for rows we failed to
                    price. MEASURED on a real Base wallet: 41 rows, 29 of them
                    unpriced airdrop spam, none of which "< $1" describes. Each
                    table restates below how many of EACH it hid, worded apart,
                    with `show all` beside it. */}
                <button type="button" onClick={() => setDust(!hideDust)}
                  aria-pressed={hideDust}
                  title={hideDust
                    ? `Showing everything, including rows under $${DUST_USD} and rows with no price`
                    : `Hide rows priced under $${DUST_USD}, and rows with no price at all. Neither moves a total: a small row is already in it, an unpriced row never could be.`}
                  className="font-mono text-[10px] px-3 py-1.5 rounded-lg transition-colors ml-auto"
                  style={hideDust
                    ? { background: "#4FC3F712", color: "#4FC3F7", border: "1px solid #4FC3F730" }
                    : { color: "#64748b", border: "1px solid #1A1A2E" }}>
                  {hideDust ? "✓ " : ""}Hide small &amp; unpriced
                </button>

                {portfolioChain !== "all" && (
                  <span className="font-mono text-[9.5px] w-full" style={{ color: "#F59E0B99" }}>
                    filtered — other chains hidden, not empty
                  </span>
                )}
              </div>

              {/* Base — the home chain. Crypto via Moralis, B20 shares via the
                  registry: two sources, so two tabs, one chain heading each. */}
              {showsChain("base") && (
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#4FC3F7" }} />
                    <span className="font-mono text-[11px] font-medium text-[#E2E8F0]">Base</span>
                    <span className="font-mono text-[9px] text-slate-600">
                      {view === "tokens" ? "crypto tokens" : "tokenized stocks"}
                    </span>
                  </div>
                  {view === "tokens"
                    ? <TokenTable address={acct} network="base" onQuickSell={quickSell}
                        hideDust={hideDust} hideAmounts={hideBal} onShowDust={() => setDust(false)} />
                    : <StockTable address={acct} venue="base"
                        hideDust={hideDust} hideAmounts={hideBal} onShowDust={() => setDust(false)} />}
                </section>
              )}

              {/* Robinhood Chain — its own tokens (Blockscout) + RWA equities */}
              {showsChain("robinhood") && (
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#94A3B8" }} />
                    <span className="font-mono text-[11px] font-medium text-[#E2E8F0]">Robinhood Chain</span>
                    <span className="font-mono text-[9px] text-slate-600">
                      {view === "tokens" ? "crypto tokens" : "RWA equities"}
                    </span>
                  </div>
                  {/* Both tables take a seller now. Passing it does NOT put a
                      control on every row — each table probes for a live
                      token/WETH V3 pool per row and draws Sell only where one
                      was measured (lib/wallet/rh-sellable.ts). That is the whole
                      gate: `swap-prepare`'s sell mode builds ONE single-hop
                      swapExactInputSingleForETH, so a pool is not evidence of a
                      route, it IS the route. */}
                  {view === "tokens"
                    ? <RhTokenTable address={acct}
                        onQuickSell={(h, pct) => rhQuickSell(
                          { addr: h.address, sym: h.symbol, decimals: h.decimals, raw: h.raw }, pct)}
                        hideDust={hideDust} hideAmounts={hideBal} onShowDust={() => setDust(false)} />
                    : <StockTable address={acct} venue="robinhood"
                        onQuickSell={(h, pct) => rhQuickSell(
                          { addr: h.contract, sym: h.symbol, decimals: h.decimals, raw: h.raw }, pct)}
                        hideDust={hideDust} hideAmounts={hideBal} onShowDust={() => setDust(false)} />}
                </section>
              )}

              {/* Base Sepolia — testnet, opt-in only. No stock table: B20 shares
                  live on Base 8453 and the RWA registry on RH 4663, and neither
                  venue has a testnet deployment, so mounting one here would render
                  MAINNET positions under a "no real value" heading. That absence
                  is SAID on the Stocks tab rather than left as a missing section —
                  a chain that silently drops off a tab is the same defect as a
                  chain that reads as empty. `quickSell` is dropped for the reason
                  it is disabled inside TokenTable — 0x has no testnet liquidity. */}
              {testnetUnlocked && showsChain("baseSepolia") && (
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#F59E0B" }} />
                    <span className="font-mono text-[11px] font-medium" style={{ color: "#F59E0B" }}>Base Sepolia</span>
                    <span className="font-mono text-[9px] text-slate-600">testnet · no real value</span>
                  </div>
                  {view === "tokens" ? (
                    <TokenTable address={acct} network="baseSepolia"
                      hideDust={hideDust} hideAmounts={hideBal} onShowDust={() => setDust(false)} />
                  ) : (
                    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-4">
                      <div className="font-mono text-[9px] text-slate-500 tracking-widest mb-1.5">STOCKS</div>
                      <p className="font-mono text-[10px] text-slate-600 leading-relaxed">
                        Tokenized shares are issued on Base mainnet and Robinhood Chain only — there is no
                        testnet deployment to read.
                      </p>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {/* The "this chain has no history index" card that used to sit here is
              GONE, and not because the problem was ignored — because a second
              reader answered it. It existed for the case `can.txHistory ===
              false`, which after /api/wallet/rh-transactions shipped is true of
              no chain the wallet lists, so the card was a whole branch that
              could not render. The honest exit it offered (the explorer, never
              a Retry) survives INSIDE TransactionHistory, per source, where it
              can still fire for a chain that genuinely goes unread. */}
          {view === "activity" && (
            <TransactionHistory
              transactions={activityRows}
              sources={activitySources}
              onRetry={() => setTxReload(k => k + 1)}
              address={acct}
            />
          )}

          {view === "orders" && <OrdersPanel />}

            {/* end LEFT main (pane B) */}
            </div>
          {/* end two-pane 2b body */}
          </div>

        </div>

        {/* Action modal — fixed overlay (was inside the removed <main>) */}
        {actionOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setActionOpen(false)} />
            <div className="relative z-10 w-full max-w-md h-[580px] max-h-[85vh] rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] shadow-2xl flex flex-col">
              <div className="flex items-center gap-1 p-3 border-b border-[#1A1A2E] shrink-0">
                {TABS.map(tb => (
                  <button key={tb.id} onClick={() => { if (tb.id === "send") { setScanPrefill(null); setScanKey(k => k + 1); } setPanel(tb.id); }}
                    className="flex-1 font-mono text-[10px] py-1.5 rounded-md transition-colors"
                    style={panel === tb.id
                      ? { background: "#4FC3F712", color: "#4FC3F7", border: "1px solid #4FC3F730" }
                      : { color: "#64748b", border: "1px solid transparent" }}>
                    {tb.label}
                  </button>
                ))}
                <button onClick={() => setActionOpen(false)} className="ml-1 w-7 h-7 rounded-md font-mono text-[13px] text-slate-500 hover:text-white hover:bg-[#1A1A2E] shrink-0">✕</button>
              </div>

              <div className="overflow-y-auto p-4 min-h-0">
                {/* The Positions panel stood here: two rows restating the Aave and
                    Morpho figures, plus a Withdraw button. Both figures still show
                    in the account card's breakdown, and Withdraw kept its own tab
                    above — so this removed a duplicate READ, not the EXIT. The
                    distinction is the whole rule: the yield ENTRANCE is closed, and
                    an entrance being closed is never a reason to hide the way out. */}
                {/* `withdrawOnly` is what actually closes the entrance. Hiding
                    the buttons above is not enough on its own — the card ships
                    a Supply/Withdraw toggle, so without this prop a user who
                    reached the exit could flip straight back into a deposit. */}
                {/* `earnKey`, not `network` — MoveToYieldCard takes `network` as a
                    loose string and reads anything that isn't "base" as
                    baseSepolia, so handing it a chain with no lending market
                    would silently move the user onto a TESTNET withdraw form.
                    Passing the narrowed key means the card can only ever be given
                    a network it can actually represent. */}
                {panel === "withdraw" && (earnKey
                  ? <MoveToYieldCard result={{ network: earnKey, action: "withdraw" }} account={acct} withdrawOnly />
                  : <p className="font-mono text-[11px] text-slate-500">Earn positions are on Base. Switch to Base to withdraw.</p>
                )}
                {/* CONVERT — chain chosen HERE, in the panel, on its own selector.
                    The two venues are NOT interchangeable and the branch order is
                    fund-safety, not style:

                    robinhood → RhSwapCard, which speaks the deployed
                      RobinhoodSwapRouter on 4663 directly. Checked FIRST because
                      the Base SwapCard force-switches the wallet to Base mainnet
                      before signing — routing a Robinhood intent through it would
                      sign a Base swap under a Robinhood heading, the wrong funds
                      on the wrong chain.
                    base → the 0x-API SwapCard, real funds, real mainnet.

                    Base Sepolia is deliberately NOT offered: 0x has no testnet
                    liquidity and SwapCard force-switches to Base MAINNET, so a
                    testnet convert would move REAL funds under a "no value" label.
                    `convertChain` is typed `"base" | "robinhood"`, so that third
                    case cannot even be selected — the old refusal is unreachable
                    by construction and is gone. */}
                {/* The chain row that used to sit ABOVE the card is gone: the
                    card now carries its own NETWORK dropdown, the same control
                    Send and Bridge use, so the choice is inside the thing it
                    configures instead of floating over it.

                    `onChain` — a callback, never a `chain` value. Each card
                    hardcodes what it displays (see their headers), so choosing
                    the other venue does not reconfigure a card, it swaps which
                    card is mounted. That is what keeps the branch below the only
                    thing that decides which chain gets signed on.

                    The cast narrows `WalletChain` back to the two `convertChain`
                    accepts. Safe because each card's `chains` list is exactly
                    those two — Sepolia is never offered, so it can never arrive. */}
                {/* `key` is load-bearing, not cosmetic. RhSwapCard seeds from its
                    `initial*` props ONCE, in a lazy useState initialiser — a
                    deliberate choice there, so that a later prop change cannot
                    stomp a token the user had since edited by hand. The cost is
                    that a SECOND quick-sell would land on an already-seeded card
                    and silently do nothing. Keying on the preset's nonce remounts
                    it, which is the only way to re-seed without breaking the rule
                    that makes the card safe to type into. */}
                {panel === "convert" && (convertChain === "robinhood"
                  ? <RhSwapCard
                      key={rhSellPreset?.nonce ?? "rh"}
                      account={acct}
                      initialDirection={rhSellPreset ? "sell" : undefined}
                      /* An ADDRESS, never the ticker — RhSwapCard ignores a symbol
                         on purpose, and on a chain where two tokens can share a
                         name that is the difference between selling the user's
                         asset and selling an impostor's. */
                      initialToken={rhSellPreset?.addr}
                      initialSymbol={rhSellPreset?.sym}
                      initialAmount={rhSellPreset?.amount}
                      initialNote={rhSellPreset ? `Pre-filled from your Robinhood Chain holdings — ${rhSellPreset.sym}. Review before signing.` : undefined}
                      onChain={c => setConvertChain(c as "base" | "robinhood")} />
                  : <SwapCard account={acct} preset={sellPreset} onChain={c => setConvertChain(c as "base" | "robinhood")} />
                )}
                {/* BRIDGE — Base ↔ Robinhood over Relay. Like SEND, the chain is
                    chosen IN the card, so there is no branch here and no
                    `can.*` gate; unlike SEND, the card is an EDITOR wrapped
                    around the same confirm-only component chat uses
                    (RobinhoodBridgeCard), so the quote, the delivered token, the
                    total cost, the guaranteed floor and the fail-closed balance
                    gate all live in exactly ONE place for both surfaces.

                    `account={acct}` and nothing else: the panel fetches its own
                    token list from the route that also validates the bridge, so
                    it cannot advertise a pair the server would refuse. */}
                {panel === "bridge" && <BridgeCard account={acct} />}
                {/* SEND — one card, chain chosen in-card (WalletSendCard). It
                    carries its OWN Base/Robinhood selector and both money paths,
                    so there is no chain branch here and no `can.send` gate: the
                    card supports Base and Robinhood natively, and Base Sepolia is
                    deliberately not offered as a send target (real-money card).

                    The scanner stays here, above the card. A QR carries its own
                    `network` and `asset`; both are passed as the card's INITIAL
                    values (remounted by `scanKey`), so a scanned Robinhood code
                    opens the card on Robinhood rather than smuggling a Base-shaped
                    send onto 4663. `scanPrefill.network` maps baseSepolia → base
                    because the card is mainnet-Base + Robinhood only. */}
                {panel === "send" && (
                  <div>
                    <button onClick={() => setScanOpen(true)}
                      className="w-full font-mono text-[11px] font-bold py-2 rounded-xl mb-3 flex items-center justify-center gap-2"
                      style={{ background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
                      📷 Scan to pay
                    </button>
                    {scanPrefill && (
                      <div className="font-mono text-[9px] text-[#34D399] mb-2">
                        ✓ scanned{scanPrefill.amount ? ` · request ${scanPrefill.amount} ${scanPrefill.asset ?? "USDC"}` : ""} — confirm + sign below
                      </div>
                    )}
                    <WalletSendCard key={scanKey}
                      account={acct}
                      initialNetwork={scanPrefill?.network === "robinhood" ? "robinhood" : "base"}
                      initialTo={scanPrefill?.to}
                      initialAmount={scanPrefill?.amount}
                      initialAsset={scanPrefill?.asset === "ETH" ? "native" : "cash"} />
                  </div>
                )}
                {panel === "receive" && (
                  <WalletCard title="DEPOSIT" chain={receiveChain}>
                    {/* Receive is the one action that still picks a chain. The
                        deposit ADDRESS is identical on all of them (same EOA), but
                        the QR's dollar (USDC vs USDG), the pay-link, and the fiat
                        rails all key off `receiveChain`, so the pick has to be
                        local and explicit rather than inherited from a page mode
                        that no longer exists. Base + Robinhood always; Base
                        Sepolia only when testnet is unlocked (test-only deposits,
                        never a real-money default) — and it is the ONE card whose
                        list can include a testnet, which is why `NetworkPicker`
                        takes its chains as a parameter instead of defaulting. */}
                    <NetworkPicker label="NETWORK" value={receiveChain} onChange={setReceiveChain}
                      chains={["base", "robinhood", ...(testnetUnlocked ? ["baseSepolia"] : [])] as WalletChain[]} />

                    {/* The picker's two options are "the chain's dollar" and
                        "the chain's gas token", NOT two fixed tickers. The
                        state key stays `"USDC"` because that is the contract
                        `buildPaymentUri` reads (and it already resolves it to
                        `cfg.stable`, so the QR was right on Robinhood while the
                        BUTTON said USDC) — but the label is `rcv.stableSymbol`
                        (from `receiveChain`), so on 4663 it reads USDG, which is
                        what a payer would actually be sending. ETH needs no such
                        treatment: RH's nativeCurrency is Ether too. */}
                    <Picker label="ASSET"
                      summary={
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-[12px] text-white truncate">{reqSymbol}</span>
                          <span className="text-[9px] text-slate-600 shrink-0">
                            {reqAsset === "USDC" ? `${rcv.short} cash` : "gas token"}
                          </span>
                        </span>
                      }>
                      {close => (["USDC", "ETH"] as const).map(a => (
                        <PickerRow key={a} selected={reqAsset === a} onClick={() => { setReqAsset(a); close(); }}>
                          <span className="text-[12px] text-white flex-1">{a === "USDC" ? rcv.stableSymbol : a}</span>
                          <span className="text-[9px] text-slate-600">
                            {a === "USDC" ? `${rcv.short} cash` : "gas token"}
                          </span>
                        </PickerRow>
                      ))}
                    </Picker>

                    <Field label="AMOUNT — OPTIONAL"
                      right={reqAmount ? (
                        <button onClick={() => setReqAmount("")}
                          className="text-[9px] text-slate-500 hover:text-white">clear</button>
                      ) : undefined}>
                      <div className="flex items-center gap-2">
                        <input value={reqAmount} onChange={e => setReqAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                          inputMode="decimal" placeholder="0.0"
                          className="flex-1 w-0 bg-transparent text-[16px] text-white outline-none placeholder:text-slate-700" />
                        <span className="text-[11px] text-slate-300 px-2 py-1.5 rounded-lg border border-[#1A1A2E] shrink-0">{reqSymbol}</span>
                      </div>
                    </Field>

                    <div className="flex flex-col items-center text-center">
                      <div className="bg-white p-2.5 rounded-xl">
                        <QRCodeSVG value={acct ? buildPaymentUri({ to: acct, amount: reqAmount, asset: reqAsset, network: receiveChain }) : ""} size={180} bgColor="#ffffff" fgColor="#0a0a0f" level="M" />
                      </div>
                      {parseFloat(reqAmount) > 0 && (
                        <div className="text-[12px] text-[#34D399] mt-3 font-bold">requesting {reqAmount} {reqSymbol}</div>
                      )}
                      {name && <div className="text-[13px] text-[#4FC3F7] mt-2">{name}</div>}
                      <div className="text-[9px] text-slate-400 mt-1.5 break-all px-2">{acct}</div>
                      {/* "🔗 Share pay link" stood here until #254. It published
                          /pay/<address> URLs that middleware 301s to /chat with
                          the address stripped — see the note where sharePayLink()
                          was defined. The QR above is the surviving share path and
                          the one that was never broken: it is an EIP-681 URI built
                          from `receiveChain`, so it is correct on Robinhood (USDG)
                          as well as Base, which the /pay page is not. */}
                      <div className="flex items-center gap-2 mt-3">
                        <button onClick={copyAddr} className="text-[11px] px-4 py-2 rounded-lg" style={{ background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
                          {copied ? "✓ Copied" : "Copy address"}
                        </button>
                      </div>
                    </div>
                    {/* The two fiat rails, moved here from the ACTIONS card.
                        They travel TOGETHER and neither was deleted.

                        💵 Add was an entrance and 🏦 Out is an EXIT from real
                        funds — the exit is the one that must not be dropped for
                        tidiness, because a user who cannot find "cash out" has
                        money stranded, not a missing button. Both are the same
                        Coinbase rail and the same `can.fiat` dependency, so the
                        place to look for one is the place to find the other;
                        that is what the "card ↔ bank" heading is for.

                        The refusal is TEXT, not a `title` tooltip. The old
                        version disabled both buttons with title="Base mainnet
                        only" — invisible on touch, on a wallet whose wedge is a
                        phone. */}
                    <div className="rounded-lg border border-[#1A1A2E] bg-[#0d0d12] p-3 mt-4">
                      <div className="text-[9px] text-slate-500 tracking-widest mb-2">CASH · CARD ↔ BANK</div>
                      <div className="flex gap-2">
                        <button onClick={addCash} disabled={onrampBusy || !isConnected || !rcv.can.fiat}
                          className="flex-1 text-[11px] font-bold py-2.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-80"
                          style={{ background: "#34D39910", color: "#34D399", border: "1px solid #34D39930" }}>
                          {onrampBusy ? "opening…" : `💵 Buy ${rcv.stableSymbol}`}
                        </button>
                        <button onClick={cashOut} disabled={cashOutBusy || !isConnected || !rcv.can.fiat}
                          className="flex-1 text-[11px] py-2.5 rounded-xl text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:text-white"
                          style={{ border: "1px solid #1A1A2E" }}>
                          {cashOutBusy ? "opening…" : "🏦 Cash out"}
                        </button>
                      </div>
                      {!rcv.can.fiat && (
                        <div className="text-[9px] text-slate-600 mt-2 leading-relaxed">
                          Coinbase Onramp and Offramp settle on Base mainnet only — not {rcv.short}. Pick
                          Base above to move cash in or out.
                        </div>
                      )}
                    </div>
                    <CardNote>
                      {parseFloat(reqAmount) > 0
                        ? <>Payment-request QR — a payer scanning it (Wallet <b className="text-slate-300">Scan to pay</b>, or any EIP-681 wallet) gets <b className="text-slate-300">{reqAmount} {reqSymbol}</b> prefilled.</>
                        : <>Scan the QR with any wallet, or set an amount above to make a payment request. <b className="text-slate-300">{rcv.stableSymbol} / ETH on {rcv.label}</b> only.</>}
                    </CardNote>
                  </WalletCard>
                )}
              </div>
            </div>
          </div>
        )}

        {scanOpen && <QrScanner onResult={handleScan} onClose={() => setScanOpen(false)} />}

      {/* ── Chat popup: fixed bottom-4 right-4 ─────────────────────────── */}
      {chatOpen && (
        <div className="fixed bottom-4 right-4 z-[60] w-72 sm:w-80 h-[420px] flex flex-col rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#1A1A2E] shrink-0"
            style={{ background: "#4FC3F708" }}>
            <div className="flex items-center gap-2">
              <img src="/logomark.svg" alt="" aria-hidden className="w-5 h-5 rounded-md" />
              <span className="font-mono text-[11px] text-[#4FC3F7] font-bold">BlueAgent</span>
              <span className="font-mono text-[9px] text-slate-600">Wallet mode</span>
            </div>
            <button onClick={() => setChatOpen(false)}
              className="font-mono text-slate-500 hover:text-white text-sm w-6 h-6 flex items-center justify-center rounded">✕</button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {chatMessages.length === 0 && (
              <div className="space-y-1.5">
                {/* These three are the assistant's ACTUAL brief, copied off the
                    system prompt above ("balances, sending and receiving on
                    Base, and withdrawing supplied funds"), not a wish list.

                    The first one used to be "What's my best yield option?" — a
                    question the very same prompt instructs the model to refuse:
                    "Do not recommend yield strategies or quote APYs — this
                    wallet no longer offers them." The product offered a chip
                    and then declined to answer it. That is the #143/#166 defect
                    (advertising a capability the model does not have) in its
                    smallest possible form, and it survived the Earn removal
                    because the prompt was updated and the chips were not. */}
                <div className="font-mono text-[10px] text-slate-600 mb-2">Balances, sending, and withdrawals on {net.short}:</div>
                {["Show my balance breakdown", "How do I send USDC?", "How do I withdraw supplied funds?"].map(q => (
                  <button key={q} onClick={() => sendChat(q)}
                    className="w-full text-left font-mono text-[10px] px-2 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                    style={{ background: "#0d0d12", border: "1px solid #1A1A2E" }}>
                    {q}
                  </button>
                ))}
              </div>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`font-mono text-[10px] p-2 rounded-lg leading-relaxed ${
                m.role === "user"
                  ? "ml-6 bg-[#4FC3F715] text-[#4FC3F7] border border-[#4FC3F730]"
                  : "mr-6 bg-[#0d0d12] text-slate-300 border border-[#1A1A2E]"
              }`}>
                {m.content || (m.role === "assistant" && <span className="text-slate-600 animate-pulse">▌</span>)}
              </div>
            ))}
            {chatLoading && chatMessages[chatMessages.length - 1]?.role !== "assistant" && (
              <div className="font-mono text-[10px] text-slate-600 p-2">thinking…</div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2 p-2.5 border-t border-[#1A1A2E] shrink-0">
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChat(chatInput)}
              placeholder="Ask anything…"
              className="flex-1 bg-[#050508] border border-[#1A1A2E] rounded-lg px-3 py-1.5 font-mono text-[11px] text-slate-200 placeholder:text-slate-700 outline-none focus:border-[#4FC3F7]/40"
            />
            <button onClick={() => sendChat(chatInput)} disabled={chatLoading || !chatInput.trim()}
              className="font-mono text-[11px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-40"
              style={{ background: "#4FC3F7", color: "#050508" }}>
              →
            </button>
          </div>
        </div>
      )}

      {/* ── FAB: simple toggle, moves up when chat open ─────────────────────
          The plate is DARK in both states. It used to flip to `#4FC3F7` when
          closed — i.e. exactly when the logomark is the thing on it — and that
          is the reported logo-background bug, for a reason that is a property of
          the asset rather than a matter of taste:

          `/logomark.svg` is a JPEG (no alpha) clipped by an SVG path, and that
          path punches the mark's two vertical bars out as HOLES. So the negative
          space of the logo is transparent and whatever sits behind it becomes
          part of the mark. On the cyan plate the bars rendered cyan-on-blue —
          the logo's own counters filled with a colour it never contains — while
          on every other surface in the app (all dark) they read as intended.

          Same reason the img carries `rounded-md`: the artwork is a rounded
          square with a ~24% radius, so square corners clip the curve. Every
          other `/logomark.svg` in this repo is already wrapped in a `rounded-*`;
          the three in this file were the exceptions. */}
      <button
        onClick={() => setChatOpen(o => !o)}
        className="fixed z-[65] w-12 h-12 rounded-full shadow-2xl flex items-center justify-center transition-all hover:shadow-[0_0_24px_#4FC3F750]"
        style={{
          right: "16px",
          bottom: chatOpen ? "444px" : "16px",
          background: "#050508",
          color: "#4FC3F7",
          border: "2px solid #4FC3F7",
          transition: "bottom 0.2s ease",
        }}
        aria-label={chatOpen ? "Close BlueAgent" : "Ask BlueAgent"}
      >
        {chatOpen
          ? <span className="text-base leading-none">✕</span>
          : <img src="/logomark.svg" alt="" aria-hidden className="w-7 h-7 rounded-md" />
        }
      </button>

      </div>{/* ── end PANE 3 content column ── */}
    </div>
  );
}

// ── UI primitives ─────────────────────────────────────────────────────────────

// `Identicon` lived here — an address-seeded two-hue gradient swatch. Its one
// call site was the header avatar, now <Avatar>, which draws the SAME gradient
// from the SAME hues for an address (avatarHues() keeps Identicon's exact
// `parseInt(slice, 16) % 360` on anything matching /^0x[0-9a-f]{40}$/), and a
// photo or initials when the account actually has a name. So this is not a
// swatch that was replaced by a different swatch: it is the bottom rung of a
// ladder, extracted so the wallet and the shell account menu share it.
//
// Deleted rather than left behind, on the same rule as `AssetRow` below: it
// went dead IN this branch, so it is this branch's to remove. A local copy of
// a shared primitive is how the wallet grew its own identity chain in the first
// place — the bug this change exists to fix.

function AssetPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="font-mono text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1"
      style={{ background: `${color}15`, border: `1px solid ${color}30`, color }}>
      <span className="text-slate-500">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

// `AssetRow` lived here. Its three call sites were the USDC / aUSDC / Morpho
// rows of the Section 2 WALLET card, which this release deleted as a duplicate
// of the Section 1 balance card. Deleted with them rather than left behind: the
// component it duplicated renders those rows inline, so a second row primitive
// is an invitation to grow the duplicate back.
//
// `AssetPill`, `AISuggestion` and `StatMini` below/above are ALSO unreferenced,
// but they were already dead before this branch (0 call sites at its base
// commit), so removing them belongs to its own change, not to a wallet rebuild.

function AISuggestion({ icon, text, action, onAction, color }: {
  icon: string; text: string; action?: string; onAction?: () => void; color: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 p-2 rounded-lg"
      style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm shrink-0">{icon}</span>
        <span className="font-mono text-[10px] text-slate-300 truncate">{text}</span>
      </div>
      {action && onAction && (
        <button onClick={onAction}
          className="font-mono text-[9px] px-2 py-1 rounded-md shrink-0 font-bold"
          style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>
          {action}
        </button>
      )}
    </div>
  );
}

function StatMini({ label, value, sub, color }: { label: string; value: string | number; sub: string; color: string }) {
  return (
    <div className="rounded-xl border border-[#1A1A2E] bg-[#050508] p-2.5">
      <div className="font-mono text-[9px] text-slate-500 mb-1">{label}</div>
      <div className="font-mono text-[14px] font-bold" style={{ color }}>{value}</div>
      <div className="font-mono text-[8px] text-slate-600 mt-0.5">{sub}</div>
    </div>
  );
}

function IdentityChip({ label, active, color }: { label: string; active: boolean; color: string }) {
  return (
    <div className="font-mono text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1"
      style={active
        ? { background: `${color}15`, border: `1px solid ${color}30`, color }
        : { background: "#0d0d12", border: "1px solid #1A1A2E", color: "#475569" }}>
      {active && <span className="text-[8px]">✓</span>}
      {label}
    </div>
  );
}

// One of the four top-level money controls (Deposit / Send / Swap / Bridge).
//
// It takes `disabledReason: string | null` rather than `disabled: boolean`
// because of what the wallet learned from the network switcher: a control that
// is off for a chain-specific reason must SAY the reason at the point of
// refusal. The old version of this row disabled two buttons with
// `title="Base mainnet only"` — a native tooltip, invisible on touch, on a
// wallet whose whole VN scan-to-pay wedge is a phone. So the reason renders as
// text under the button, always, and `title` is a bonus rather than the only
// copy of it.
//
// A null reason means enabled. There is deliberately no way to disable this
// button without supplying one.
function ActionButton({ icon, label, onClick, primary, disabledReason }: {
  icon: string; label: string; onClick: () => void; primary?: boolean; disabledReason?: string | null;
}) {
  const off = !!disabledReason;
  return (
    <div className="flex flex-col">
      {/* Sized for FOUR across, not two: label at 10px and horizontal padding at
          1 unit so "Deposit" — the longest of the four — still sits on one line
          in a ~65px cell. It is a single button per column, so a label that
          wrapped would make one control two lines tall and break the row's
          baseline. */}
      <button onClick={onClick} disabled={off} title={disabledReason ?? undefined}
        className="font-mono text-[10px] font-bold py-2.5 px-1 rounded-xl flex flex-col items-center gap-1 transition-opacity hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed"
        style={off
          ? { background: "#0d0d12", color: "#475569", border: "1px solid #1A1A2E" }
          : primary
            ? { background: "#4FC3F7", color: "#050508" }
            : { background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F740" }}>
        <span className="text-[14px] leading-none">{icon}</span>
        {label}
      </button>
      {off && (
        <div className="font-mono text-[8px] text-slate-600 mt-1 text-center leading-tight">{disabledReason}</div>
      )}
    </div>
  );
}

// The control that turns "we couldn't read this" from a statement into a
// recoverable one. A component rather than three inline buttons because it
// appears in all three places a degraded read is admitted (balance caption,
// mission list, allocation card) and they must not drift into three different
// affordances for one action — the same argument that made `resolveRead` a
// module. It carries no state: `busy` is `isFetching`, derived from the very
// queries it re-runs.
function RetryRead({ onRetry, busy }: { onRetry: () => void; busy: boolean }) {
  return (
    <button onClick={onRetry} disabled={busy}
      className="shrink-0 font-mono text-[9px] px-2 py-1 rounded-lg font-bold transition-opacity hover:opacity-80 disabled:opacity-50"
      style={{ background: "#F59E0B15", color: "#F59E0B", border: "1px solid #F59E0B35" }}>
      {busy ? "reading…" : "Retry"}
    </button>
  );
}

/** One AGENT SPEND figure. `unavailable` is a THIRD state, not a styled zero. */
function SpendRail({ label, value, sub, accent, unavailable }: {
  label: string; value: string; sub: string; accent: string; unavailable: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#1A1A2E] bg-[#0d0d12] px-3 py-2.5">
      <div className="font-mono text-[8.5px] text-slate-600 tracking-widest uppercase">{label}</div>
      {unavailable ? (
        <>
          <div className="font-mono text-[14px] font-bold text-slate-600 mt-1">—</div>
          <div className="font-mono text-[8.5px] text-[#F59E0B] mt-0.5">store unreachable</div>
        </>
      ) : (
        <>
          <div className="font-mono text-[15px] font-bold mt-1 truncate" style={{ color: accent }}>{value}</div>
          <div className="font-mono text-[8.5px] text-slate-600 mt-0.5 truncate">{sub}</div>
        </>
      )}
    </div>
  );
}

/**
 * What the credits on the rail above were actually SPENT ON.
 *
 * This replaced one sentence that read the whole from a proper subset:
 *
 *     spend.d.tools.length > 0
 *       ? `Across ${n} tools — per-tool breakdown on Usage.`
 *       : "Per-tool breakdown and calls-per-day on Usage."
 *
 * `spend-summary.ts` keeps Blue Chat OUT of `tools` deliberately ("Real, but
 * not a tool — kept out of `tools` so it can't pose as one"), so `tools` is a
 * SUBSET of the spending and `tools.length` is not a fact about the total
 * beside it. MEASURED 2026-09-13 on a live ledger: a wallet with 22 debits and
 * 1,100 credits had `tools: []` and `chat: {credits: 1100}` — the rail printed
 * "1,100 cr · 22 calls" and this line printed "Per-tool breakdown … on Usage",
 * pointing at a table with no rows in it. A second wallet spent 608 credits of
 * which 288 were chat, and the card called that "Across 1 tool".
 *
 * The split itself lives in SpendConsole (`creditSplit`) for the same reason
 * `read-state.ts` exists: /app/usage answers this off the same ledger, and two
 * independent arithmetics over one ledger can disagree while both look right.
 *
 * Two things it refuses to do:
 *   · Sum credits with USDC, or price a credit that drained the free daily
 *     allowance. The ONE credits→dollars figure is `paidAllTime`, a lifetime
 *     aggregate the route publishes with its own divisor.
 *   · Point at /app/usage unconditionally. When every receipt predates the
 *     30-day chart, both surfaces there are empty and the pointer would be
 *     advertising a screen that cannot answer (#143/#166/#196).
 */
function SpendSplit({ d }: { d: SpendSummaryDTO }) {
  const s = creditSplit(d);
  const crDown  = d.credits.status === "unavailable";
  const paidUsd = d.credits.paidAllTime / d.creditsPerUsdc;

  // Only buckets that actually carry credits get a chip. A zero bucket is not
  // a category the user spent in, and naming it would pad the split with rows
  // that mean "no".
  const parts: { k: string; label: string; value: string }[] = [];
  if (s.tools.credits > 0) parts.push({ k: "tools", label: `${s.tools.rows} Hub tool${s.tools.rows === 1 ? "" : "s"}`, value: `${s.tools.credits.toLocaleString()} cr` });
  if (s.chat.credits  > 0) parts.push({ k: "chat",  label: "Blue Chat",    value: `${s.chat.credits.toLocaleString()} cr` });
  if (s.other.credits > 0) parts.push({ k: "other", label: "Unattributed", value: `${s.other.credits.toLocaleString()} cr` });

  // The pointer, derived from what /app/usage can actually show for THIS wallet:
  // its by-tool table reads `tools`, its chart reads the 30-day `days`.
  const hasTools = d.tools.length > 0;
  const inWindow = d.days.some(x => x.calls > 0);

  return (
    <div className="mt-2 space-y-1.5">
      {!crDown && parts.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {parts.map(p => (
            <span key={p.k} className="font-mono text-[9px] text-slate-500">
              {p.label} <span className="text-slate-300 font-bold">{p.value}</span>
            </span>
          ))}
        </div>
      )}

      {/* A split that does not add up to the rail above it is a data defect,
          not a rounding artefact — `spend-summary.ts` touches exactly one
          bucket per debit. Say so rather than letting the parts quietly
          disagree with the whole. */}
      {!crDown && parts.length > 0 && !s.balances && (
        <p className="font-mono text-[9px] text-[#F59E0B]">
          These parts don&apos;t add up to the rail above — some debits went uncategorised.
        </p>
      )}

      {!crDown && d.credits.paidAllTime > 0 && (
        <p className="font-mono text-[9px] text-slate-600">
          {d.credits.paidAllTime.toLocaleString()} cr bought all-time ≈ ${paidUsd.toFixed(2)}
          <span className="text-slate-700"> — the rest came from the free daily allowance.</span>
        </p>
      )}

      <p className="font-mono text-[9px] text-slate-600">
        {hasTools || inWindow ? (
          <>
            {hasTools ? "Per-tool breakdown" : "Calls per day"}{hasTools && inWindow ? " and calls per day" : ""} on{" "}
            <Link href="/app/usage" className="text-[#4FC3F7] hover:underline">Usage</Link>.
          </>
        ) : (
          <>Nothing falls inside the {d.days.length}-day chart on Usage — these totals reach further back than it does.</>
        )}
      </p>
    </div>
  );
}

/**
 * AGENT SPEND, in the wallet — the headline only, linking to the full console.
 *
 * Every number here comes from the `SpendSummaryDTO` the caller already fetched
 * with `useSpendSummary`, and every judgement ABOUT those numbers is delegated
 * to SpendConsole's own exported helpers (`scopeLabel`, `emptyState`, `usdc`).
 * That is deliberate and it is the whole design: /app/usage answers the same
 * question off the same ledger, and #199 exists because two independent
 * renderings of one ledger can disagree while both look right. Reusing the
 * derivation makes disagreement impossible rather than unlikely.
 *
 * The three rules this card inherits from that console, all load-bearing:
 *   · USDC and credits are NEVER summed and never share a unit. A credit debit
 *     drains the free daily allowance first, so a 50-credit call may have cost
 *     nothing; converting it to dollars here would invent a charge.
 *   · `status === "unavailable"` renders "—", never 0. Both rails down prints a
 *     sentence saying so — an unreadable store is not an unspent wallet.
 *   · "loading", "failed" and "disconnected" are each distinct from zero and
 *     from each other (SpendConsole's `Load`), so each gets its own line.
 */
function AgentSpendCard({ spend, priv }: { spend: SpendLoad; priv: (s: string) => string }) {
  // Two gates, same as the console: `s === "ok"` rules out spinner/error/no
  // address; `scopeLabel` returning null rules out a 200 whose rails came back
  // dead. A window caption over dead rails is the adjacency lie from #322.
  const scope = spend.s === "ok" ? scopeLabel(spend.d) : null;

  return (
    <div className="mb-3 rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-mono text-[9px] text-slate-500 tracking-widest">AGENT SPEND</div>
        <div className="flex items-baseline gap-2 shrink-0">
          {scope && <span className="font-mono text-[9px] text-slate-700">{scope}</span>}
          <Link href="/app/usage" className="font-mono text-[10px] text-[#4FC3F7] hover:underline">Usage →</Link>
        </div>
      </div>

      {spend.s === "disconnected" ? (
        <p className="font-mono text-[10px] text-slate-600 mt-2">
          Connect a wallet to see what it has spent — receipts are per address.
        </p>
      ) : spend.s === "loading" ? (
        <p className="font-mono text-[10px] text-slate-600 mt-2">Reading spend…</p>
      ) : spend.s === "failed" ? (
        <p className="font-mono text-[10px] text-[#F59E0B] mt-2 leading-relaxed">
          Couldn&apos;t load spending. A read failure, not a zero — your history is intact.
        </p>
      ) : spend.d.usdc.status === "unavailable" && spend.d.credits.status === "unavailable" ? (
        <p className="font-mono text-[10px] text-[#F59E0B] mt-2 leading-relaxed">
          Both spend stores are unreachable right now.{" "}
          <span className="text-slate-600">That is not the same as zero.</span>
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <SpendRail
              label="USDC · x402"
              value={priv(fmtUsdcUnits(spend.d.usdc.units))}
              accent="#4FC3F7"
              unavailable={spend.d.usdc.status === "unavailable"}
              sub={`${spend.d.usdc.calls.toLocaleString()} paid call${spend.d.usdc.calls === 1 ? "" : "s"} · on Base`}
            />
            <SpendRail
              label="Credits"
              // Deliberately NOT priced. The hide-balance mask covers dollars,
              // and this is not one: credits are metered units drawn against a
              // free daily allowance before anything is charged.
              value={`${spend.d.credits.spentInWindow.toLocaleString()} cr`}
              accent="#A78BFA"
              unavailable={spend.d.credits.status === "unavailable"}
              sub={`${spend.d.credits.callsInWindow.toLocaleString()} call${spend.d.credits.callsInWindow === 1 ? "" : "s"} · metered, not USDC`}
            />
          </div>

          {/* The nothing-here line, and WHICH nothing it is. "unreadable" must
              never be worded as an empty wallet — one rail answered and was
              empty, the other never answered at all. */}
          {emptyState(spend.d) === "none" ? (
            <p className="font-mono text-[9px] text-slate-600 mt-2">
              Nothing spent yet — Hub tool calls and chat runs show up here.
            </p>
          ) : emptyState(spend.d) === "unreadable" ? (
            <p className="font-mono text-[9px] text-[#F59E0B] mt-2">
              Nothing on the rail we can read, and the other is unreachable — half the picture.
            </p>
          ) : (
            <SpendSplit d={spend.d} />
          )}
        </>
      )}
    </div>
  );
}

// Dependency-free area sparkline for the sidebar
// A local `Spark` SVG line-chart component lived here. Its ONE call site was
// the Morpho APY sparkline in the sidebar, so it goes with it. (BaseTokensCard
// has its own `Spark` — different file, different component, still in use.)

// `apy` was a prop here, appended to the balance as " · ~4.12%". Dropped with
// the rest of the rate surface: it came from the Aave reserve read for one row
// and from DefiLlama's top pool for the other, so two rows in the same list
// quoted rates measured two different ways and only one of them was this user's.
// `PositionRow` lived here and rendered the Positions panel's two rows. It went
// with that panel rather than being left behind: a component with no call site
// is the thing that quietly comes back, and the Aave/Morpho figures it showed
// are still on screen in the account card's breakdown.

// ── Landing hero (shown until the wallet connects) ───────────────────────────
function BankLanding() {
  // The lead bullet MIRRORS the panel's primary control so the two can never
  // disagree. With Privy on, the way in is "sign in, we make the wallet" — and
  // the method name is read from the same config the button reads, not typed
  // out here. With Privy off (local dev, no NEXT_PUBLIC_PRIVY_APP_ID) the only
  // way in is your own wallet, so the copy says that instead of advertising an
  // onboarding path the panel does not render.
  //
  // What used to sit here — "Sign in with Face ID … Coinbase Smart Wallet" —
  // described the CTA removed from `ConnectButton` below; see the comment there
  // for why that promise stopped being true.
  const signIn = PRIVY_ENABLED
    ? { icon: "✉️", title: `Sign in with ${describeLoginMethods()} — no seed phrase`, body: "No extension, no app, no 12-word phrase. Signing in creates a wallet that is yours — we never hold the keys." }
    : { icon: "🔌", title: "Bring your own wallet", body: "MetaMask, Coinbase Wallet, Rabby, Phantom, or any WalletConnect wallet. Connect in one tap." };
  // The second bullet used to promise "Earn ~X% APY on idle USDC". It is the
  // first thing an unconnected visitor reads, and it sold the one feature this
  // phase withdraws — so it advertised a door that is now closed. Replaced with
  // the agent spend console, which is the thing about this product no other
  // wallet can show.
  //
  // The console itself now lives on /app/usage, so the bullet says where. A
  // landing bullet describing a panel that is no longer on the page it lands
  // you on is the same defect as the APY promise it replaced: copy that outlived
  // the thing it described.
  const features: { icon: string; title: string; body: string }[] = [
    signIn,
    { icon: "📊", title: "See every payment your agent made", body: "Each x402 tool call your agent paid for, itemised in USDC on your Usage page — the ledger a generic wallet cannot reconstruct." },
    { icon: "➡", title: "Send to any wallet or name.base", body: "Pay anyone on Base by address or Basename. Instant, 24/7, no cut-off times." },
    { icon: "🔒", title: "Non-custodial — you hold the keys", body: "You sign every transaction from your own wallet. BlueAgent never holds your keys or funds." },
    { icon: "🌐", title: "On-chain, withdraw anytime", body: "Your money lives on Base, not in a silo. Pull it out whenever you want, in one click." },
  ];
  return (
    <div className="min-h-full bg-[#050508] flex items-center justify-center p-5 sm:p-8">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-6 items-center">
        <div>
          {/* A headline and a paragraph used to sit between this label and the
              bullets: "A wallet you actually own." over "Hold USDC, move money,
              and track every agent payment on Base — non-custodial. You hold the
              keys; BlueAgent only prepares the transaction, you sign it."

              Every clause of it is repeated verbatim below. "Hold USDC, move
              money" is bullet 3, "track every agent payment" is bullet 2,
              "non-custodial / you hold the keys" is bullet 4 — which states it
              twice more in its own title and body. Five claims, three of them
              said twice within 200px, and the paragraph was the copy a reader
              hits first, so the bullets under it read as a restatement rather
              than as the detail.

              The label is the heading now rather than a decorative eyebrow over
              one: dropping the <h1> without promoting something would leave the
              page with no heading at all. */}
          <h1 className="font-mono text-[13px] tracking-widest text-[#4FC3F7] font-bold mb-4">🔵 WALLET</h1>
          <div className="space-y-3">
            {features.map(f => (
              <div key={f.title} className="flex gap-3">
                <span className="text-base shrink-0">{f.icon}</span>
                <div>
                  <div className="font-mono text-[12px] text-slate-200">{f.title}</div>
                  <div className="font-mono text-[10px] text-slate-600 leading-relaxed">{f.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-6">
          <div className="font-mono text-[14px] font-bold text-white mb-1">Open your account</div>
          {/* Describes the control DIRECTLY BELOW IT, which is why it tracks
              PRIVY_ENABLED: with Privy off there is no "we create your wallet"
              path on this panel, only the wallet list. The old line promised
              Face ID and a passkey — the CTA that delivered that is gone. */}
          <p className="font-mono text-[11px] text-slate-500 mb-5">
            {PRIVY_ENABLED
              ? "Sign in and we create your wallet — no seed phrase, no app to install."
              : "Connect a wallet you already own — no signup, no KYC, no custody."}
          </p>
          <ConnectButton />
          <div className="flex items-center gap-2 my-4">
            <div className="h-px flex-1 bg-[#1A1A2E]" /><span className="font-mono text-[9px] text-slate-700">SECURED BY YOU</span><div className="h-px flex-1 bg-[#1A1A2E]" />
          </div>
          <div className="flex items-center justify-center gap-4 font-mono text-[9px] text-slate-600">
            <span>🔒 Non-custodial</span><span>·</span><span>⛓ On Base</span><span>·</span><span>🔑 You sign everything</span>
          </div>
          {/* Named Aave v3 and Morpho, which this surface no longer sends money
              to — the only thing left pointing at them is the withdraw path,
              and an unconnected visitor has no position to withdraw. Naming a
              lender under the signup button reads as "your deposit goes here".
              "Withdraw anytime" left the row above for the same reason: it
              answers a question about a deposit you can no longer make. */}
          <p className="font-mono text-[9px] text-slate-700 text-center mt-4">Powered by Base · USDC</p>
        </div>
      </div>
    </div>
  );
}

// Connect-wallet CTA — two controls, nothing else: sign in (we make the wallet)
// vs bring your own. Same split Halo ships.
//
// ⚠️ THE "🔵 Create a free wallet" CTA THAT USED TO HEAD THIS PANEL IS GONE, and
// it should not come back in that form. It called `coinbase.select()`, where
// `coinbase` is just `wallets.find(name includes "coinbase")` — byte-for-byte
// the same call as the "Coinbase Wallet" row inside the dropdown below. One
// button, listed twice.
//
// It also stopped telling the truth. Before Privy, `coinbase` resolved to the
// wagmi `coinbaseWallet({ preference: { options: "all" } })` connector, which
// really does surface Smart Wallet creation — so "Face ID · no seed phrase" was
// accurate. Routing external wallets through Privy changed what that entry
// resolves to WITHOUT changing the copy, leaving a button that promised a
// passkey and opened Coinbase's generic connect flow. The genuine passkey
// product is `base_account`, which is its own row in the list and is labelled
// as such there.
//
// The seedless pitch now lives on the Privy control, which actually delivers it
// (sign in → embedded wallet, no seed phrase), and whose label is derived from
// the configured login methods so it cannot drift the same way.
function ConnectButton() {
  const { wallets, isPending } = useWallet();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      {/* Sign in → embedded wallet. Guarded by PRIVY_ENABLED so PrivyLoginButton
          never mounts outside its provider; with the var unset this panel falls
          back to the wallet list alone (dev-only — prod has Privy on). */}
      {PRIVY_ENABLED && (
        <>
          <PrivyLoginButton variant="primary" />
          {/* No sub-caption here on purpose: the panel line right above the
              button already carries "no seed phrase, no app to install", and a
              second copy of the same promise two rows apart reads as clutter.
              One claim, one place — it also means there is only one string to
              keep honest if the sign-in path changes again. */}
          <div className="flex items-center gap-2 mt-3">
            <div className="h-px flex-1 bg-[#1A1A2E]" />
            <span className="font-mono text-[9px] text-slate-600 uppercase tracking-widest">or</span>
            <div className="h-px flex-1 bg-[#1A1A2E]" />
          </div>
        </>
      )}
      <button onClick={() => setOpen(o => !o)} disabled={isPending}
        className="w-full font-mono text-[11px] text-slate-400 hover:text-slate-200 py-2.5 mt-3 rounded-xl border border-[#1A1A2E] transition-colors disabled:opacity-60">
        I already have a wallet
      </button>
      {open && (
        <>
          <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-xl border border-[#1A1A2E] bg-[#0A0A12] shadow-2xl overflow-hidden">
            <p className="font-mono text-[10px] text-slate-600 px-3 pt-3 pb-2 tracking-widest">SELECT WALLET</p>
            {wallets.map(w => (
              <button key={w.key} onClick={() => { w.select(); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[#1A1A2E] transition-colors">
                <span className="w-7 h-7 rounded-lg bg-[#1A1A2E] flex items-center justify-center text-base shrink-0">{w.icon}</span>
                <span className="font-mono text-xs text-slate-200">{w.name}</span>
              </button>
            ))}
          </div>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        </>
      )}
    </div>
  );
}
