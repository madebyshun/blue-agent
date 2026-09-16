import { NextRequest, NextResponse } from "next/server";
import { probeWethPool, type SellProbe } from "@/lib/robinhood/pool";

// GET /api/robinhood/swap/sellable?tokens=0x…,0x…
//
// "Which of these Robinhood Chain tokens can actually be sold right now?"
//
// ── Why this route exists ────────────────────────────────────────────────────
//
// The Base token table has carried a per-row `Sell ▾` for a long time; the two
// Robinhood tables carried nothing, and RhTokenTable's own header explained the
// absence with a sentence that had gone stale — "none of those flags is true on
// 4663", written before `can.swap` flipped true and RhSwapCard shipped. So the
// wallet could sell on 4663 and was declining to offer it.
//
// The fix is NOT "draw the button on RH rows too". Most RWA tokens on this chain
// have no Uniswap V3 pool at all, and a Sell that opens a card which then says
// NO_ROUTE is a promise the app cannot keep — worse than no button, because the
// user has already decided to sell by the time they learn they can't. This route
// is the measurement that earns the button: one on-chain probe per token, and a
// control rendered only where the probe came back `pool`.
//
// ── What is being measured, exactly ──────────────────────────────────────────
//
// `/api/robinhood/router/swap-prepare` in `sell` mode builds a single
// `swapExactInputSingleForETH` against one fee tier. There is no multi-hop on
// that path. So the route for a sell IS a live token/WETH V3 pool, and
// `probeWethPool` reads precisely that — no proxy, no heuristic, no index.
//
// ── Read-only ────────────────────────────────────────────────────────────────
//
// `eth_call` against the verified factory and the pools it names. No keys, no
// signing, no funds, no user state. Nothing here can move money; it can only
// decide whether a button that PRE-FILLS a card is drawn. The user still reviews
// and signs in RhSwapCard, and the on-chain `amountOutMinimum` still bounds the
// fill.

/** Per-token probe results, keyed by lowercase address. */
type Answers = Record<string, SellProbe>;

/**
 * How many tokens one request may ask about.
 *
 * A probe is up to 4 `getPool` calls plus a `liquidity` read per hit, against
 * ONE public RPC that we do not run. The portfolio driving this is capped at 200
 * rows upstream (RH_MAX_TOKEN_PAGES), so without a cap here a fat wallet could
 * aim ~800 calls at rpc.mainnet.chain.robinhood.com from a single page load.
 *
 * Over-cap addresses are DROPPED, not silently answered: they simply do not
 * appear in the response, and the client renders an unmeasured row as
 * unmeasured. Inventing a `none` for them would be the bug this whole file is
 * built to avoid, at the one moment the user is least able to notice.
 */
const MAX_TOKENS = 40;

/** Probes in flight at once. Politeness to a public RPC, not a correctness knob. */
const CONCURRENCY = 6;

/**
 * How long a MEASUREMENT stays servable.
 *
 * Pool existence is close to static — a token either has a V3 pool on 4663 or it
 * does not, and that changes when someone deploys one, not second to second. Ten
 * minutes is long enough that switching tabs re-renders instantly and short
 * enough that a freshly-created pool shows up within one coffee.
 */
const TTL_MS = 10 * 60_000;

/**
 * Process-local memo. Deliberately NOT KV.
 *
 * This is a derived, re-derivable fact about a public chain — it is not user
 * state, nobody's money depends on it being durable, and a cold lambda simply
 * measures again. Upstash has been suspended three times on budget (#148); a
 * read path that writes a KV entry per token per wallet is exactly the kind of
 * traffic that did it.
 */
const memo = new Map<string, { probe: SellProbe; at: number }>();

function cached(addr: string): SellProbe | null {
  const hit = memo.get(addr);
  if (!hit) return null;
  if (Date.now() - hit.at >= TTL_MS) { memo.delete(addr); return null; }
  return hit.probe;
}

function remember(addr: string, probe: SellProbe): void {
  // Only a real answer is worth keeping. `unreadable` is the ABSENCE of a
  // measurement, and pinning one for ten minutes would turn a single RPC blip
  // into a wallet that spends the rest of the session unable to say whether the
  // user can sell — the same law `rh-holdings-cache.ts` applies to a failed
  // explorer read, for the same reason.
  if (probe.state === "unreadable") return;
  memo.set(addr, { probe, at: Date.now() });
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const raw = new URL(req.url).searchParams.get("tokens") ?? "";

    // Deduped and lowercased before anything is counted, so a list that repeats
    // one address does not eat the cap with one token.
    const wanted = Array.from(
      new Set(
        raw
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter((s) => /^0x[a-f0-9]{40}$/.test(s)),
      ),
    );

    if (!wanted.length) {
      return NextResponse.json({ ok: true, sellable: {} as Answers, truncated: 0 });
    }

    const asked = wanted.slice(0, MAX_TOKENS);
    const truncated = wanted.length - asked.length;

    const answers: Answers = {};
    const cold: string[] = [];
    for (const a of asked) {
      const hit = cached(a);
      if (hit) answers[a] = hit;
      else cold.push(a);
    }

    const fresh = await mapLimit(cold, CONCURRENCY, async (addr): Promise<[string, SellProbe]> => {
      try {
        return [addr, await probeWethPool(addr as `0x${string}`)];
      } catch (e) {
        // A throw is not a "no". Same discrimination the probe itself makes.
        return [addr, { state: "unreadable", reason: (e as Error).message || "probe failed" }];
      }
    });

    for (const [addr, probe] of fresh) {
      answers[addr] = probe;
      remember(addr, probe);
    }

    return NextResponse.json({
      ok: true,
      chainId: 4663,
      sellable: answers,
      /** Addresses past the cap, answered by NOBODY — the client must treat them
       *  as unmeasured, never as unsellable. */
      truncated,
    });
  } catch (e) {
    // A 500 leaves the client with no answers at all, which its unmeasured
    // branch already renders honestly ("couldn't check"). Nothing is defaulted
    // to a sellable state on the way out.
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
