"use client";

import { useEffect, useState } from "react";
import { useBasename, shortAddr } from "@/lib/useBasename";
import { TOPUP_TREASURY } from "@/lib/payments";
import { WALLET_CHAINS, type WalletChain } from "@/lib/wallet/chains";

/**
 * Counterparties we can name from their ADDRESS ALONE.
 *
 * That qualifier is the whole rule. An address is a fact on Base and this map
 * is a fact we own, so the join is a lookup, not a guess. Nothing else in this
 * file may name a counterparty — no "amount looks like a tool price", no "this
 * happened around the time of that call". Those are inferences wearing a label.
 *
 * The treasury entries are why the timeline exists in this form: every Hub tool
 * call and every Blue Chat top-up settles USDC to `TOPUP_TREASURY`, and until
 * now the wallet rendered its own product as anonymous hex — `Sent to 0x0295…`,
 * indistinguishable from a payment to a stranger.
 *
 * The address is IMPORTED, not retyped. It is already hand-copied into eleven
 * files across this repo (one of which carries a comment saying it MUST match
 * another), and a twelfth copy that silently drifts would mislabel real money.
 */
const RETIRED_TREASURY = "0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f";

const KNOWN: Record<string, string> = {
  "0xa238dd80c259a72e81d7e4664a9801593f98d1c5": "Aave v3",
  "0x4e65fe4dba92790696d040ac24aa414708f5c0ab": "Aave · aUSDC",
  "0xee8f4ec5672f09119b96ab6fb59c27e1b7e44b61": "Morpho",
  "0x0000000000001ff3684f28c67538d4d072c22734": "0x Swap",
  "0x8bab6d1b75f19e9ed9fce8b9bd338844ff79ae27": "Aave v3",
  "0x10f1a9d11cdf50041f3f8cb7191cbe2f31750acc": "Aave · aUSDC",
  [TOPUP_TREASURY.toLowerCase()]: "Blue Agent",
  // Retired 2026-08-18 in favour of the address above (provenance: CLAUDE.md).
  // Kept because the payments made to it are permanent and still in history —
  // a retired payee is still a known payee, and dropping it would turn real
  // past spending back into hex.
  [RETIRED_TREASURY]: "Blue Agent · old treasury",
};

/** True for the addresses that are US — the ones a receipt can explain. */
const isBlueTreasury = (addr?: string): boolean => {
  const a = addr?.toLowerCase();
  return a === TOPUP_TREASURY.toLowerCase() || a === RETIRED_TREASURY;
};

/**
 * The chains the map above, `isBlueTreasury` and basenames are facts ABOUT.
 *
 * Every one of those is twenty bytes with no chain attached, and this timeline
 * is now cross-chain. The same hex on Robinhood Chain 4663 is a DIFFERENT
 * account — the two chains share no state — so a `KNOWN[...]` hit on a 4663 row
 * would caption a stranger's contract "Aave v3", and a basename lookup would
 * paste a Base identity onto a 4663 counterparty. Both are the #219/#230 defect
 * (a fact from one chain rendered under another's identity), arriving through
 * the door this file opened by merging two readers.
 *
 * Written as a whitelist, not `!== "robinhood"`, so a fourth chain is unnamed
 * until someone decides these addresses mean something there — which is the
 * direction that fails safe.
 */
const isBaseFamily = (chain: WalletChain): boolean => chain === "base" || chain === "baseSepolia";

export type WalletTx = {
  /**
   * Which chain this row came from — stamped by the reader that queried the
   * index (/api/wallet/transactions for Base, /api/wallet/rh-transactions for
   * Robinhood), never inferred here.
   *
   * Not optional, because everything downstream of it is chain-specific: the
   * explorer href, whether the counterparty may be named, and whether an x402
   * receipt can explain the row at all. A row that arrived without its chain
   * would force this component to guess, and the guess renders as a link — a
   * Basescan href for a 4663 hash resolves to nothing.
   */
  chain: WalletChain;
  hash: string; ts: number; category: string;
  kind: "received"|"sent"|"swap"|"contract";
  dir: "in"|"out"|"none";
  counterparty?: string; amount: number|null; asset?: string;
  status: "complete"|"pending"|"failed";
};

/**
 * One history reader's answer for one chain — the unit this card reports on.
 *
 * It is a LIST because the timeline is a merge, and a merge of two readers has
 * failure modes a single boolean cannot express: Base answering while Robinhood
 * is down is neither "loading" nor "error", and rendering it as either lies in
 * one of the two directions that matter (a spinner that never ends, or an empty
 * timeline for a wallet that has transacted). Rows still render; the footnote
 * names the chain that went unread.
 *
 * `partial` and `capped` are separate on purpose and must not be merged:
 *   partial  a LEG of that chain's read did not answer. The list is short from
 *            inside its own window, it is retryable, and the user should be
 *            told the read failed.
 *   capped   every leg answered and there is simply more history than one page.
 *            Expected, not a failure; the exit is the explorer, not Retry.
 * Collapsing them would make a Blockscout 500 read as "you've reached the end".
 */
export type TxSourceStatus = "loading" | "ok" | "error" | "needsKey";
export interface TxSource {
  chain: WalletChain;
  status: TxSourceStatus;
  partial?: boolean;
  capped?: boolean;
}

/** One x402 receipt as `/api/wallet/spend` returns it. `name` is null when the
 *  tool id is no longer in the catalog — the row then prints the raw id. */
export type Receipt = { ts: number; tool: string; name: string | null; units: number; usd: number; tx: string | null };

/**
 * Receipts for the connected wallet, keyed by settlement tx hash.
 *
 * Three states, not two. "loading" and "unavailable" are both NOT "there are
 * none": the first is temporary, the second means the receipt store could not
 * be reached. Collapsing either into an empty map would make this component
 * tell a paying user that their payments bought nothing — which is exactly the
 * failure `getSpendLog`'s null-vs-[] contract exists to prevent, so the
 * distinction is carried all the way to the pixels rather than dropped here.
 *
 * `all` is the full list and is NOT redundant with `byTx`. The map exists to
 * DECORATE rows the index returned; the list exists because a receipt is a fact
 * in its own right, and a receipt the index never mentioned still has to reach
 * the screen (see `receiptRows`). While this state carried only the map, every
 * agent payment was invisible the moment the Base indexer went quiet.
 */
type ReceiptState = {
  status: "loading" | "ok" | "unavailable";
  byTx: Map<string, Receipt>;
  all: Receipt[];
};

const NO_RECEIPTS: ReceiptState = { status: "ok", byTx: new Map(), all: [] };

function useSpendReceipts(address?: string): ReceiptState {
  const [state, setState] = useState<ReceiptState>({ status: "loading", byTx: new Map(), all: [] });
  useEffect(() => {
    if (!address) { setState(NO_RECEIPTS); return; }
    let alive = true;
    setState({ status: "loading", byTx: new Map(), all: [] });
    fetch(`/api/wallet/spend?address=${address}`)
      .then(r => r.json())
      .then((j: { known?: boolean; receipts?: Receipt[] }) => {
        if (!alive) return;
        if (j.known === false) { setState({ status: "unavailable", byTx: new Map(), all: [] }); return; }
        const all = j.receipts ?? [];
        const byTx = new Map<string, Receipt>();
        // Only receipts that carry a settlement hash can be joined to a row.
        // A receipt without one is real but unmatchable, and guessing which
        // row it belongs to is the one thing this file must never do.
        for (const r of all) if (r.tx) byTx.set(r.tx.toLowerCase(), r);
        setState({ status: "ok", byTx, all });
      })
      .catch(() => { if (alive) setState({ status: "unavailable", byTx: new Map(), all: [] }); });
    return () => { alive = false; };
  }, [address]);
  return state;
}

/**
 * Rows for payments WE recorded that the index did not return.
 *
 * The other half of "Activity … và chi tiêu cho agent". Until now a receipt
 * could only DECORATE a row Moralis had already produced, which quietly made
 * agent spending a derivative of someone else's uptime: with Moralis paused
 * (#258 — 401 in production right now) the Base leg returns zero rows, so there
 * was nothing to decorate, and the Agent filter said "No agent spending on this
 * wallet yet" over a wallet holding first-party proof of the opposite. That is
 * the #211/#212/#213 shape again — an absence produced by a broken reader,
 * rendered as a fact about the user — except here we own the STRONGER fact and
 * were discarding it in favour of the weaker one.
 *
 * What a receipt proves, exactly. `recordToolPayment` has two call sites
 * (`api/x402/[tool]` and `api/hub/community/[slug]/invoke`) and BOTH are inside
 * an `if (settle.ok)`, writing `settle.tx` — the hash the CDP facilitator
 * returned for a cleared EIP-3009 settlement. So a stored receipt is a record of
 * a payment that WENT THROUGH, not of one that was attempted. That distinction
 * is the whole licence for this function: task #204 was "chat writes fake tool
 * receipts", and the rule that came out of it is that a row may be synthesized
 * from a settlement and never from an intent.
 *
 * Hence the two hard limits below, both of which are about not inventing:
 *   - `!r.tx` receipts are SKIPPED. Without a hash there is nothing to link to,
 *     and a row whose "view on Basescan" goes nowhere is a claim the user cannot
 *     check. They are counted by the caller and footnoted instead of dropped in
 *     silence.
 *   - `chain: "base"` is not a default, it is the only correct value: x402
 *     settles USDC on Base 8453 through CDP, and there is no other chain a
 *     receipt could be about. It is also what keeps `classify` willing to attach
 *     the receipt at all — that join is Base-mainnet-gated.
 *
 * `counterparty` is deliberately LEFT OFF. The treasury address is the obvious
 * thing to stamp here and we do not actually know it: a 2026-07 receipt was paid
 * to the retired treasury, a 2026-09 one to the current wallet, and the receipt
 * records neither. Nothing renders it (an agent row with a receipt is headed
 * "Blue Hub · <tool>"), so filling it in would buy nothing and assert something
 * unverified on a screen about money.
 */
export function receiptRows(receipts: Receipt[], indexed: WalletTx[]): WalletTx[] {
  // Deduped against the index by hash: when Moralis IS healthy these rows all
  // collapse and this function returns nothing, which is the correct no-op. A
  // hash seen twice is never drawn twice.
  //
  // Scoped to BASE rows, not every row. A receipt is a Base fact, so only a Base
  // row can be the same transaction; matching it against a 4663 hash would let
  // an unrelated Robinhood transfer suppress a real payment. Vanishingly
  // unlikely either way — but "unlikely" decides which way to write it, not
  // whether to bother.
  const seen = new Set(indexed.filter(t => t.chain === "base").map(t => t.hash.toLowerCase()));
  const out: WalletTx[] = [];
  for (const r of receipts) {
    if (!r.tx) continue;
    const hash = r.tx.toLowerCase();
    if (seen.has(hash)) continue;
    seen.add(hash);
    out.push({
      chain: "base",
      hash: r.tx,
      // The server clock at settlement, not the block timestamp. Close enough to
      // sort by and honest about what it is; nothing here claims block time.
      ts: r.ts,
      category: "x402",
      kind: "sent",
      dir: "out",
      amount: r.usd,
      asset: "USDC",
      // `settle.ok` was true or this receipt would not exist.
      status: "complete",
    });
  }
  return out;
}

export type Group = "earn" | "swap" | "agent" | "send" | "receive" | "other";

/**
 * Everything the UI knows about one row, derived ONCE.
 *
 * `txMeta` and `matchFilter` each used to look up `KNOWN[...]` themselves. Two
 * independent derivations of one fact is the defect this wallet work keeps
 * finding (the allocation card printed "No assets yet" above "Stablecoin 0%"
 * for the same reason), so the lookup happens here, once, and the filter and
 * the label read the same object. They cannot disagree about what a row is.
 */
export interface TxClass {
  /** Name from the address alone, or null when we genuinely don't know it. */
  payee: string | null;
  /** The x402 receipt for THIS tx, matched BY HASH ONLY. */
  receipt: Receipt | null;
  group: Group;
  /** Resolve the counterparty via basename only when nothing else names it. */
  wantsBasename: boolean;
  icon: string; color: string; bg: string; dot: string;
}

/**
 * Exported, and not only for tests: P2's spend console needs "is this row the
 * agent spending, and on what?" for the same rows. If it answers that question
 * with its own `if`, the console and the timeline will eventually disagree
 * about the same transaction — the failure mode this file was just refactored
 * to remove. One classifier, imported, or it happens again.
 */
export function classify(tx: WalletTx, matchedReceipt: Receipt | null): TxClass {
  const namable = isBaseFamily(tx.chain);
  const payee = namable && tx.counterparty ? KNOWN[tx.counterparty.toLowerCase()] ?? null : null;

  /**
   * An x402 receipt is a BASE MAINNET fact, so it may only explain a Base
   * mainnet row.
   *
   * Every Hub tool call settles USDC on Base 8453 through the CDP facilitator —
   * that is the only chain the payment path runs on. The caller matches receipts
   * to rows BY HASH, and a hash is just 32 bytes with no chain attached, so once
   * this timeline merged a second chain the join became able to caption a
   * Robinhood transfer "Blue Hub · token-price". A hash collision across chains
   * is vanishingly unlikely, but "unlikely" is not the standard this file holds
   * itself to for a row about someone's money: the receipt is dropped here, once,
   * by the only thing that knows both facts.
   */
  const receipt = tx.chain === "base" ? matchedReceipt : null;
  const base = { payee, receipt, wantsBasename: false };

  // Agent spending, by either of two independent proofs:
  //
  //   a receipt for THIS hash — our own server wrote it at settle time, which
  //   is a stronger fact than anything an indexer infers about the row. The
  //   settlement is an EIP-3009 `transferWithAuthorization` SUBMITTED BY THE
  //   CDP FACILITATOR, so the wallet is the token sender but not the tx sender;
  //   if Moralis ever reads that as a plain contract call with no direction,
  //   requiring `dir === "out"` here would silently drop the tool name on every
  //   real payment and make this whole feature a no-op that still typechecks.
  //
  //   or USDC leaving for our treasury — no receipt, but the payee is known, so
  //   these still group as agent spending. Absence of a receipt removes the
  //   tool NAME and nothing else; the row never falls back to hex. Base mainnet
  //   only, for the same reason as the receipt above: `TOPUP_TREASURY` is an
  //   address we control ON BASE, and the identical hex on 4663 is an account
  //   we have never touched.
  if (receipt || (tx.chain === "base" && tx.dir === "out" && isBlueTreasury(tx.counterparty)))
    return { ...base, group: "agent", icon: "🔵", color: "#4FC3F7", bg: "#4FC3F715", dot: "#4FC3F7" };

  if (payee?.startsWith("Aave") || payee?.startsWith("Morpho"))
    return tx.dir === "out"
      ? { ...base, group: "earn", icon: "🌾", color: "#34D399", bg: "#34D39915", dot: "#34D399" }
      : { ...base, group: "earn", icon: "🏦", color: "#A78BFA", bg: "#A78BFA15", dot: "#A78BFA" };

  if (payee?.includes("Swap") || tx.kind === "swap")
    return { ...base, group: "swap", icon: "⇄", color: "#4FC3F7", bg: "#4FC3F715", dot: "#4FC3F7" };

  // `namable &&` for the same reason the `KNOWN` lookup carries it: a basename
  // is a record on Base, and pasting it over a 4663 counterparty would assert a
  // Base identity for an account on a chain that has never heard of basenames.
  if (tx.kind === "received")
    return { ...base, wantsBasename: namable && !payee, group: "receive", icon: "↓", color: "#34D399", bg: "#34D39915", dot: "#34D399" };

  if (tx.kind === "sent")
    return { ...base, wantsBasename: namable && !payee, group: "send", icon: "↑", color: "#EF4444", bg: "#EF444415", dot: "#EF4444" };

  return { ...base, group: "other", icon: "⚡", color: "#A78BFA", bg: "#A78BFA15", dot: "#A78BFA" };
}

/** The heading, from the class + whatever name the counterparty resolved to. */
export function headingFor(tx: WalletTx, c: TxClass, cpLabel: string): string {
  if (c.group === "agent")
    return c.receipt
      // The join only this app can make: a transfer to 0x0295… is, specifically,
      // this tool. `name ?? tool` degrades to the raw id for a retired tool —
      // an unfamiliar id is honest, an invented label would not be.
      ? `Blue Hub · ${c.receipt.name ?? c.receipt.tool}`
      // No receipt: we know who was paid, not what for. Both are true; only the
      // second is missing, and the row says exactly that much.
      : `Paid ${cpLabel}`;
  if (c.group === "earn")    return tx.dir === "out" ? `Deposit → ${cpLabel}` : `Withdraw ← ${cpLabel}`;
  if (c.group === "swap")    return "Token swap";
  if (c.group === "receive") return `Received from ${cpLabel}`;
  if (c.group === "send")    return `Sent to ${cpLabel}`;
  return c.payee ?? "Contract call";
}

export type Filter = "All"|"Agent"|"Earn"|"Send"|"Receive"|"Swap";
const FILTERS: Filter[] = ["All", "Agent", "Earn", "Send", "Receive", "Swap"];

/** Reads the class computed above — no second lookup, by construction. */
export function matches(c: TxClass, f: Filter): boolean {
  if (f === "All") return true;
  if (f === "Agent")   return c.group === "agent";
  if (f === "Earn")    return c.group === "earn";
  if (f === "Swap")    return c.group === "swap";
  if (f === "Send")    return c.group === "send";
  if (f === "Receive") return c.group === "receive";
  return true;
}

const fmtDay  = (ts: number) => new Date(ts).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

type Row = { tx: WalletTx; c: TxClass };

const shortOf = (c: WalletChain) => WALLET_CHAINS[c].short;

/** "Base", "Base and Robinhood", "Base, Robinhood and Sepolia". */
function proseList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function groupByDay(rows: Row[]): { day: string; items: Row[] }[] {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const key = new Date(row.tx.ts).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return Array.from(map.entries()).map(([, items]) => ({ day: fmtDay(items[0].tx.ts), items }));
}

export default function TransactionHistory({
  transactions, sources, onRetry, address,
}: {
  /** Already merged and sorted by the caller — every row carries its `chain`. */
  transactions: WalletTx[];
  /**
   * One entry per history reader the caller asked. Replaces the old
   * `loading`/`error`/`needsKey`/`explorer`/`explorerName`/`chainShort` props,
   * all six of which described EXACTLY ONE chain.
   *
   * That single-chain shape is what ShunTr's complaint was about: the rest of
   * this page is cross-chain — the total, the Tokens tab and the Stocks tab all
   * cover Base AND Robinhood — while this card covered Base alone and said so
   * only in a small heading. A Robinhood send that was simply not indexed here
   * looked like a send that never happened. Taking a LIST is what makes the
   * fix structural rather than cosmetic: the card can no longer render at all
   * without being told which chains it is speaking for.
   */
  sources: TxSource[];
  onRetry: () => void;
  address?: string;
}) {
  const [filter, setFilter] = useState<Filter>("All");
  const receipts = useSpendReceipts(address);

  // Two sources of rows, merged here and nowhere else: the chain indexers, and
  // our own settlement receipts for payments those indexers did not return. The
  // second is why agent spending no longer disappears when Moralis does.
  const fromReceipts = receiptRows(receipts.all, transactions);
  const merged = fromReceipts.length
    ? [...transactions, ...fromReceipts].sort((a, b) => b.ts - a.ts)
    : transactions;

  const rows: Row[] = merged.map(tx => ({
    tx, c: classify(tx, receipts.byTx.get(tx.hash.toLowerCase()) ?? null),
  }));
  const filtered = rows.filter(r => matches(r.c, filter));
  const groups = groupByDay(filtered);

  // Receipts we hold but cannot place: no settlement hash, so no explorer link
  // and nothing for the user to verify. Footnoted rather than silently dropped —
  // "we know you paid, we can't show you where" is a different sentence from
  // never mentioning the payment.
  const unplaceable = receipts.all.filter(r => !r.tx).length;

  // Agent payments we could not attach a tool to. Two very different reasons,
  // and the footnote must not merge them: the store was unreachable (we don't
  // know), or the payment predates receipts (nobody wrote it down). Silently
  // showing a bare payee for both would make an outage look like history.
  const unexplained = rows.filter(r => r.c.group === "agent" && !r.c.receipt).length;

  // Partition once. Every branch below reads these — the card must never derive
  // "did anything answer?" twice and get two answers, which is the defect the
  // `TxClass` refactor removed from the row labels and that a list of sources
  // reintroduces if each branch tests `sources` its own way.
  const pending = sources.filter(s => s.status === "loading");
  const live    = sources.filter(s => s.status === "ok");
  const down    = sources.filter(s => s.status === "error" || s.status === "needsKey");
  const retryable = down.filter(s => s.status === "error");
  const unconfigured = down.filter(s => s.status === "needsKey");
  const partialLive = live.filter(s => s.partial);
  const cappedLive  = live.filter(s => s.capped);

  // A skeleton means "we don't know yet". It may only cover the whole card when
  // NOTHING is known yet — once one chain has answered, its rows are facts, and
  // hiding them behind a spinner because a second reader is slow would make a
  // fast chain wait on a slow one.
  //
  // `&& rows.length === 0` on both: the indexers are no longer the only source.
  // A receipt-backed row is a settled payment we recorded ourselves, so it must
  // survive both the spinner and the failure state — covering it with either
  // would hand the whole feature back to Moralis's uptime, which is the exact
  // dependency this card was just rebuilt to break.
  const allPending = sources.length > 0 && pending.length === sources.length && rows.length === 0;
  // Nothing answered and nothing still might. Distinct from "answered, empty".
  const noneAnswered =
    sources.length > 0 && pending.length === 0 && live.length === 0 && rows.length === 0;
  // The chain chip on each row earns its space only in a genuine merge.
  const showChain = sources.length > 1;

  const liveNames = live.map(s => shortOf(s.chain));
  const downNames = down.map(s => shortOf(s.chain));

  // Which chains this list actually SPEAKS FOR: the readers that answered, plus
  // any chain that got a row onto the screen by another route — a receipt-backed
  // Base row outlives its indexer. Naming only the live readers would print
  // "· ROBINHOOD" above a row chipped "Base", and the chip is the one telling
  // the truth. This label has never meant "complete" (the list is capped at a
  // page on every chain); it means "these are the chains in this list", and the
  // footnotes below say which of them is short and why.
  //
  // Ordered by `sources`, not by row order, so the heading doesn't reshuffle
  // depending on which chain happened to settle a transaction most recently.
  const covered: WalletChain[] = sources
    .map(s => s.chain)
    .filter(c => live.some(s => s.chain === c) || merged.some(t => t.chain === c));

  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="font-mono text-[9px] text-slate-500 tracking-widest">
          {/* Named chains, never "ALL CHAINS". The heading states the scope it
              can actually back: if Robinhood is down, this list is Base's, and
              a banner reading "ALL CHAINS" over it would be the same wrong
              claim in a smaller font. */}
          ONCHAIN TIMELINE{covered.length > 0 ? ` · ${covered.map(shortOf).join(" · ").toUpperCase()}` : ""}
        </div>
        {address && (
          <div className="flex items-center gap-2 shrink-0">
            {/* One explorer per chain, each labelled by ITS OWN `explorerName`.
                A single "Basescan ↗" beside a two-chain list would send someone
                looking for a 4663 transfer to an index that has never seen it.
                Keyed off `covered` so a chain with rows on screen always has its
                explorer here — that link matters MOST when our index is the part
                that failed. */}
            {(covered.length > 0 ? covered : sources.map(s => s.chain)).map(c => (
              <a key={c} href={`${WALLET_CHAINS[c].explorer}/address/${address}`}
                target="_blank" rel="noopener noreferrer"
                className="font-mono text-[9px] text-slate-600 hover:text-[#4FC3F7] transition-colors">
                {WALLET_CHAINS[c].explorerName} ↗
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-1 mb-4 flex-wrap">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="font-mono text-[9px] px-2.5 py-1 rounded-full transition-colors"
            style={filter === f
              ? { background: "#4FC3F712", color: "#4FC3F7", border: "1px solid #4FC3F730" }
              : { color: "#475569", border: "1px solid #1A1A2E" }}>
            {f}
          </button>
        ))}
      </div>
      {allPending ? <Skeleton /> : noneAnswered ? (
        /* "Unknown, not empty" — the same sentence the balance card makes, for
           the same reason. This branch was effectively unreachable until the
           caller stopped discarding the route's `error` field: a dead upstream
           answers 200 with an empty array, so every outage fell through to
           "No transactions yet" below. Now that it fires, it has to distinguish
           itself from that message clearly, or the fix buys nothing.
           Retry AND the explorer: one for a blip, one for an outage — and Retry
           is offered only when something is actually retryable, because a
           missing index key is not fixed by pressing a button. */
        <div className="py-6 text-center">
          <div className="font-mono text-[11px] text-slate-300 mb-1">
            Couldn&apos;t load your {proseList(downNames)} history
          </div>
          <div className="font-mono text-[9px] text-slate-600 mb-3 leading-relaxed">
            {unconfigured.length === down.length
              /* Addressed to the USER, about their wallet — not to us, about our
                 config. It used to read "Live history needs a Moralis key
                 (MORALIS_API_KEY)", which hands someone looking for their own
                 transactions an environment variable they cannot set, on a
                 screen that is otherwise about their money. */
              ? "Our index isn't configured. Your transactions are on-chain and unaffected."
              : "Unknown — not empty. Your transactions are on-chain either way."}
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {retryable.length > 0 && (
              <button onClick={onRetry} className="font-mono text-[10px] px-3 py-1.5 rounded-lg"
                style={{ background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>Retry</button>
            )}
            {address && down.map(s => (
              <a key={s.chain} href={`${WALLET_CHAINS[s.chain].explorer}/address/${address}`}
                target="_blank" rel="noopener noreferrer"
                className="font-mono text-[10px] px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                style={{ border: "1px solid #1A1A2E" }}>{WALLET_CHAINS[s.chain].explorerName} ↗</a>
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <p className="font-mono text-[11px] text-slate-600 py-6 text-center">
          {filter === "Agent"
            // "None" is a claim, and it needs the receipt store to make it. With
            // the store unreachable the honest answer is that we don't know —
            // the same null-vs-[] distinction `getSpendLog` carries all the way
            // from KV, spent here instead of being rounded down to zero.
            ? receipts.status === "unavailable"
              ? "Couldn't reach the receipt store — agent spending is unknown, not zero"
              : "No agent spending on this wallet yet"
            : `No ${filter !== "All" ? filter.toLowerCase() + " " : ""}transactions yet`}
          {/* Qualified the moment a chain is missing. "No transactions yet" is a
              claim about the WALLET; with one reader down, the only claim we can
              back is about the chains that answered. */}
          {down.length > 0 && live.length > 0 ? ` on ${proseList(liveNames)}` : ""}
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map(g => (
            <div key={g.day}>
              <div className="font-mono text-[9px] text-slate-600 mb-2 pl-1">{g.day}</div>
              <div className="relative">
                <div className="absolute left-3 top-2 bottom-2 w-px bg-[#1A1A2E]" />
                {g.items.map(({ tx, c }) => (
                  <TxRow key={`${tx.chain}-${tx.hash}-${tx.ts}-${tx.asset ?? ""}`}
                    tx={tx} c={c} showChain={showChain} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Footnotes. Every one of these describes a way this list is SHORT or
          where a row came from, and they are separate lines because they are
          separate facts with separate remedies — a reader that died, a leg that
          died, a page boundary, a receipt we vouched for ourselves, and a
          receipt store that could not be reached. Merging any two of them into
          "some data may be missing" would be the honest-sounding sentence that
          tells the user nothing they can act on.

          The condition mirrors the child conditions EXACTLY; an OR that is
          merely close to them renders a bordered strip with nothing in it. */}
      {(down.length > 0 && rows.length > 0) ||
       partialLive.length > 0 || cappedLive.length > 0 ||
       fromReceipts.length > 0 || unplaceable > 0 ||
       (unexplained > 0 && receipts.status !== "loading") ? (
        <div className="mt-3 pt-3 border-t border-[#12121c] space-y-1.5">
          {retryable.length > 0 && rows.length > 0 && (
            <p className="font-mono text-[9px] text-amber-500/70 leading-relaxed">
              {/* It used to end "…so nothing from that chain is listed here."
                  That sentence is now capable of being false: a Blue Hub row
                  reconstructed from a receipt IS from that chain, and it renders
                  while the chain's indexer is down. Dropping the clause keeps
                  the footnote true in both cases; the line below says where the
                  rows that DID survive came from. */}
              {proseList(retryable.map(s => shortOf(s.chain)))} didn&apos;t answer, so this list is short — not complete.
            </p>
          )}
          {unconfigured.length > 0 && rows.length > 0 && (
            <p className="font-mono text-[9px] text-slate-600 leading-relaxed">
              {/* "Full" for the same reason: our own receipts can still put rows
                  on screen for a chain we have no index for. */}
              Full {proseList(unconfigured.map(s => shortOf(s.chain)))} history isn&apos;t available — our index for{" "}
              {unconfigured.length > 1 ? "those chains isn't" : "that chain isn't"} configured. Those transactions are on-chain and unaffected.
            </p>
          )}
          {fromReceipts.length > 0 && (
            <p className="font-mono text-[9px] text-slate-600 leading-relaxed">
              {/* Says which rows we are vouching for ourselves. The user can tell
                  a reconstructed row from an indexed one — it carries the tool
                  id and links to the settlement — but they should not have to
                  work it out from the layout. */}
              {fromReceipts.length} Blue Hub payment{fromReceipts.length > 1 ? "s" : ""} listed from our own settlement
              receipts rather than the chain index. Each links to its USDC settlement on Base.
            </p>
          )}
          {unplaceable > 0 && (
            <p className="font-mono text-[9px] text-slate-600 leading-relaxed">
              {unplaceable} more Blue Hub payment{unplaceable > 1 ? "s aren't" : " isn't"} listed — we recorded{" "}
              {unplaceable > 1 ? "them" : "it"} without a settlement hash, so there is nothing to link to.
            </p>
          )}
          {partialLive.length > 0 && (
            <p className="font-mono text-[9px] text-amber-500/70 leading-relaxed">
              Part of the {proseList(partialLive.map(s => shortOf(s.chain)))} read didn&apos;t answer, so rows from{" "}
              {partialLive.length > 1 ? "those chains" : "that chain"} may be missing.
            </p>
          )}
          {cappedLive.length > 0 && (
            <p className="font-mono text-[9px] text-slate-600 leading-relaxed">
              Showing the most recent activity on {proseList(cappedLive.map(s => shortOf(s.chain)))} — older history is on the explorer.
            </p>
          )}
          {unexplained > 0 && receipts.status !== "loading" && (
            <p className="font-mono text-[9px] text-slate-600 leading-relaxed">
              {receipts.status === "unavailable"
                ? `${unexplained} payment${unexplained > 1 ? "s" : ""} to Blue Agent — couldn't reach the receipt store, so the tool isn't shown. Retry later.`
                : `${unexplained} payment${unexplained > 1 ? "s" : ""} to Blue Agent from before receipts existed. The payee is on-chain; which tool it bought was never recorded, so it isn't shown.`}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function TxRow({ tx, c, showChain }: { tx: WalletTx; c: TxClass; showChain: boolean }) {
  const cp = tx.counterparty;
  const { name } = useBasename(c.wantsBasename ? cp : undefined);
  const cpLabel = c.payee ?? name ?? (cp ? shortAddr(cp) : "");
  const heading = headingFor(tx, c, cpLabel);
  const statusColor = tx.status === "pending" ? "#F59E0B" : tx.status === "failed" ? "#EF4444" : "#475569";
  // Derived from the ROW, not from a card-level prop. The card used to be handed
  // one explorer URL for all of its rows, which is correct exactly until the
  // list holds two chains — and then every link is right for one of them and
  // silently dead for the other.
  const chainCfg = WALLET_CHAINS[tx.chain];
  return (
    <a href={`${chainCfg.explorer}/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-3 pl-7 py-2 -ml-1 rounded-lg hover:bg-[#0d0d12] transition-colors relative">
      <span className="absolute left-[9px] w-3 h-3 rounded-full border-2 border-[#050508] top-1/2 -translate-y-1/2"
        style={{ background: c.dot }} />
      <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[12px] shrink-0"
        style={{ background: c.bg, color: c.color }}>{c.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[11px] text-slate-200 truncate">{heading}</div>
        <div className="font-mono text-[9px] flex items-center gap-1.5 mt-0.5">
          <span style={{ color: statusColor }}>{tx.status !== "complete" ? tx.status : fmtTime(tx.ts)}</span>
          {/* Which chain this row happened on, shown only when the list actually
              holds more than one. In a merged timeline the date and the amount
              are not enough to tell two chains apart, and the chain is the one
              fact that decides whether the link above goes anywhere. */}
          {showChain && (
            <span className="px-1 rounded text-[8px] tracking-wide shrink-0"
              style={{ background: "#12121c", color: "#64748b" }}>{chainCfg.short}</span>
          )}
          {/* The catalog id behind the display name. Small, but it is the thing
              you paste into an x402 call — and it proves the row was matched to
              a real tool rather than captioned by a heuristic. */}
          {c.receipt && <span className="text-slate-700 truncate">{c.receipt.tool}</span>}
        </div>
      </div>
      {tx.amount != null && (
        <div className="font-mono text-[11px] shrink-0"
          style={{ color: tx.dir === "in" ? "#34D399" : tx.dir === "out" ? "#94a3b8" : "#64748b" }}>
          {tx.dir === "in" ? "+" : tx.dir === "out" ? "−" : ""}
          {tx.amount.toLocaleString("en-US", { maximumFractionDigits: tx.asset === "ETH" ? 5 : 2 })} {tx.asset ?? ""}
        </div>
      )}
    </a>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2 pl-7">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-3 py-2">
          <div className="w-7 h-7 rounded-lg bg-[#13131f] animate-pulse shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-36 rounded bg-[#13131f] animate-pulse" />
            <div className="h-2 w-16 rounded bg-[#13131f] animate-pulse" />
          </div>
          <div className="h-2.5 w-16 rounded bg-[#13131f] animate-pulse" />
        </div>
      ))}
    </div>
  );
}
