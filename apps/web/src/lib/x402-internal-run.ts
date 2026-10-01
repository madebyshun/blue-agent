/**
 * Run an x402 catalog tool IN-PROCESS for our own server — the body of the
 * "internal bypass" of /api/x402/[tool], callable without an HTTP hop.
 *
 * WHY THIS EXISTS
 * ---------------
 * Chat's `callHubTool` and MCP's `callHubTool` used to reach every Hub tool by
 * `fetch(`${NEXT_PUBLIC_APP_URL ?? "https://blueagent.dev"}/api/x402/<id>`)`
 * with the internal-key headers. That URL is not "this deployment", it is
 * whatever the env var says, and the default is PRODUCTION. MEASURED on the
 * rebuild preview (2026-09-30):
 *
 *   - "what's trending on base" answered `payment required` until the preview
 *     was given prod's exact INTERNAL_SERVICE_KEY — the preview's own key was
 *     being presented to prod's route, which rejected it as a stranger;
 *   - once it was, honeypot / risk-gate answers came from PROD's build ("SAFE
 *     70%", "known_drainer"), not the branch's UNKNOWN verdicts. A branch's tool
 *     changes were never exercised from chat on any preview or localhost, so
 *     "it works in chat on the preview" proved nothing about the branch.
 *
 * Plus an HTTP round trip, a second function invocation and a second cold
 * start on every tool call. The Hood poller reached the same conclusion first
 * (lib/blue-hood/tool-caller.ts runs HANDLERS locally by default).
 *
 * WHAT MOVED HERE, AND WHAT DID NOT
 * ---------------------------------
 * Moved, byte-for-byte in behaviour: the internal branch of the x402 route —
 * halt check, the X-Blue-User credit debit (ref'd, refunded on a failed run),
 * WALLET_REQUIRED for a guest on a paid tool, the free bypass for an internal
 * service job, and the credits-debited figure. The route's internal branch now
 * calls `runInternalTool` and serialises the result, so the HTTP door and the
 * in-process callers cannot drift: there is one implementation.
 *
 * NOT moved, and must never be: the USDC path (X-PAYMENT → cdpVerify → handler
 * → cdpSettle). That stays in the route and is unreachable from here. Nothing
 * in this module settles, signs, or quotes a price. MCP's `blue_call` keeps
 * calling the route over HTTP WITHOUT the bypass on purpose — it is the paid
 * door and has to hand the external caller a real 402 (CLAUDE.md).
 *
 * TRUST: there is no key check here because there is nothing to prove — a
 * caller of this function is already our own server code. The key check stays
 * in the route, where the caller is a network peer. `user` must therefore be a
 * PROVEN wallet (chat passes the SIWE/internal-proven `payer`), never a value
 * read off a request body; this function bills whoever it is handed.
 */
import { AGENT_TOOLS } from "@/lib/agent-tools";
import { haltReason } from "@/lib/tool-halts";

type Handler = (req: Request) => Promise<Response>;

// Lazy, like lib/blue-hood/tool-caller.ts: the registry imports every handler
// module, and a chat turn that runs no tool should not pay for loading them.
let handlers: Record<string, Handler> | null = null;
async function loadHandlers(): Promise<Record<string, Handler>> {
  if (handlers) return handlers;
  handlers = (await import("@/app/api/x402/_handlers")).HANDLERS;
  return handlers;
}

// tool id → price in USDC micro-units (6 decimals), parsed from "$0.20"
function priceToUnits(price?: string): number | null {
  if (!price) return null;
  const n = parseFloat(price.replace("$", "").trim());
  return Number.isNaN(n) ? null : Math.round(n * 1_000_000);
}
/**
 * Built once, at import, from AGENT_TOOLS. The x402 route reads it too, so an
 * id the route would answer "unavailable" is one this module refuses as well.
 */
export const PRICE_UNITS = new Map<string, number>(
  AGENT_TOOLS
    .map(t => [t.id, priceToUnits(t.price)] as const)
    .filter((e): e is readonly [string, number] => e[1] !== null)
);

/** A JSON answer with its status — the route adds HTTP headers, callers here don't need them. */
export interface ToolAnswer {
  status: number;
  body: Record<string, unknown>;
}

// TWO different failures reach here, and until 2026-09-28 they shared one
// message that was only ever true of the rarer one. Originally this was a 503
// with a terse "Tool not available", which agents read as an intermittent
// upstream error and retried in a loop; the status was fixed to 501 and the
// prose was not, so it went on producing a wrong CONCLUSION instead of a wrong
// retry. Both branches still say "you were not charged" — nothing is settled on
// either path, and no `payment-required` header is sent.
//
// 🔴 The old hint asserted "this id exists in the public catalog" unconditionally,
// and that case is provably EMPTY in production while the other is unbounded.
// `/api/catalog` reports `{listed: 114, withHandler: 114, noOrphans: true}` and
// dead-tool-check.ts pins catalog == handlers in CI, so essentially all real
// traffic here is a typo'd or hallucinated id being told the id is RIGHT and the
// server is at fault. That is the direction that costs the caller: the agent
// concludes "transient outage" and retries or reports a false failure, instead
// of re-checking the id. The mirror-image bug is written up in the header of
// `.well-known/ai-tool/[tool]/route.ts` — "the reader is a machine that will
// conclude the id is wrong and stop asking". This was that, inverted.
//
// 404 for the unknown id, because 501 means "the server does not support this
// functionality" and that misdescribes a resource which simply does not exist.
// Checked against consumers first: no test and none of the four published
// manifests encode 501, and `scripts/p4-x402-smoke.ts` — named in the comment
// this replaces — only iterates AGENT_TOOLS, so it never reached this branch at
// all. `packages/agentkit` did branch on 501 and now accepts both.
//
// (Moved here from api/x402/[tool]/route.ts on 2026-10-01 so the in-process
// callers answer an unrunnable id exactly as the HTTP door does.)
export function unavailableAnswer(tool: string): ToolAnswer {
  // Looked up live rather than hoisted into a module-level Set on purpose: a
  // Set built at import cannot be given a synthetic orphan, and production has
  // no real one to test against (see case 7 in x402-free-and-validation-test).
  if (!AGENT_TOOLS.some(t => t.id === tool)) {
    return {
      status: 404,
      body: {
        error: "Unknown tool id — you were not charged.",
        code:  "UNKNOWN_TOOL_ID",
        tool,
        hint:  "This id is not in the Blue Hub catalog. Do not retry — re-check the id against the authoritative list at https://blueagent.dev/api/catalog.",
        catalogUrl: "https://blueagent.dev/api/catalog",
      },
    };
  }
  return {
    status: 501,
    body: {
      error: "Tool temporarily unavailable — you were not charged.",
      code:  "TOOL_UNAVAILABLE",
      tool,
      hint:  "This tool id exists in the public catalog but is not currently implemented. Do not retry; the catalog listing will be removed shortly.",
    },
  };
}

// A listed id that is paused (lib/tool-halts.ts). Answered BEFORE any payment
// requirement is issued and before the credit-debit path, so nothing is settled
// and no credit is debited. 501 with an explicit "do not retry", for the same
// reason unavailableAnswer() moved off 503: agents read 503 as a transient
// outage and retry in a loop.
export function haltedAnswer(tool: string, reason: string): ToolAnswer {
  return {
    status: 501,
    body: {
      error: "Tool halted — you were not charged.",
      code:  "TOOL_HALTED",
      tool,
      reason,
      hint:  "Do not retry: this id is paused until the reason above is resolved. The live catalog is at https://blueagent.dev/api/catalog.",
    },
  };
}

export interface InternalRunResult extends ToolAnswer {
  /**
   * Credits this call left debited from `user`'s ledger — 0 when nothing was
   * charged or the charge was returned. `undefined` when the call was refused
   * before the handler could run (unavailable, halted, INSUFFICIENT_CREDITS,
   * WALLET_REQUIRED): the route sends no `X-Credits-Debited` header for those,
   * exactly as it never did.
   */
  creditsDebited?: number;
}

export interface InternalRunOptions {
  tool: string;
  body: Record<string, unknown>;
  /**
   * The PROVEN wallet to bill (route: X-Blue-User). A valid 0x address flips the
   * run from free into "debit this ledger"; anything else is ignored and the
   * call is treated as having no user, as the route always treated it.
   */
  user?: string | null;
  /**
   * An authorized server job with no end user (route: X-Blue-Service:
   * internal). Free-bypasses paid tools. Without it, and without a user, paid
   * tools answer 402 WALLET_REQUIRED — the guest guard.
   */
  service?: boolean;
  /**
   * Give up on the handler after this long. In-process callers lost the fetch
   * timeout they used to have, so this replaces it — and unlike an aborted
   * fetch, it RETURNS the debit: the caller is answered "failed" and must not
   * also be billed for it. Omitted by the route, which keeps its old behaviour.
   */
  timeoutMs?: number;
}

const TIMED_OUT = Symbol("timed-out");

export async function runInternalTool(opts: InternalRunOptions): Promise<InternalRunResult> {
  const { tool, body, user, service = false, timeoutMs } = opts;

  const handler = (await loadHandlers())[tool];
  if (!handler || PRICE_UNITS.get(tool) === undefined) return unavailableAnswer(tool);
  // Halted ids stop HERE, before the credit-debit path below, so no caller is
  // charged for them. The route checks this too, but in-process callers never
  // pass through the route — this is the check that protects them.
  const halt = haltReason(tool);
  if (halt) return haltedAnswer(tool, halt);

  // Credit-debit path (chat user calling a tool). Tracks the actually-
  // debited amount so we can echo it back (the route as an X-Credits-Debited
  // header) — the chat backend reads it to populate the in-message credit chip
  // with the real spend, not just the chat-message cost.
  let creditsDebited = 0;
  // The debit happens BEFORE the handler (so a failing call cannot serve
  // free compute), which made it the one rail that charged for failures: the
  // USDC path settles only after a successful run, this one kept the credits
  // when the handler threw or answered an error (Scheduled research L-table,
  // W0-6(f), 2026-09-30). Each debit now carries a ref, and a failed run
  // returns exactly that debit through the ledger's idempotent refund().
  let creditRef: string | undefined;
  const wallet = user && /^0x[a-fA-F0-9]{40}$/.test(user) ? user : undefined;
  if (wallet) {
    const { fetchBlueBalance, getTierInfo } = await import("@/lib/credits");
    const { toolCreditCost }                = await import("@/lib/credit-pricing");
    const { spend }                         = await import("@/lib/credit-ledger");

    const blueBalance = await fetchBlueBalance(wallet);
    const holderTier  = getTierInfo(blueBalance);
    const cost        = toolCreditCost(tool, holderTier);

    if (cost > 0) {
      const ref = `tool:${tool}:${crypto.randomUUID()}`;
      try {
        await spend(wallet, cost, `tool:${tool}`, ref);
        creditsDebited = cost;
        creditRef = ref;
      } catch (e) {
        const err = e as Error & { code?: string };
        if (err.code === "INSUFFICIENT_CREDITS") {
          // The REAL balance, read now. Callers used to fill this in with a
          // hard-coded 0 (chat → "balance was 0" in every Scheduled pause
          // note, whatever the wallet held). Unreadable → omitted, not 0.
          let balance: number | undefined;
          try {
            const { getBalance } = await import("@/lib/credit-ledger");
            balance = (await getBalance(wallet)).balance;
          } catch { /* leave it out rather than invent one */ }
          return {
            status: 402,
            body: {
              error:  "Insufficient credits to call this tool",
              code:   "INSUFFICIENT_CREDITS",
              tool,
              needed: cost,
              ...(typeof balance === "number" ? { balance } : {}),
              // Was "…or stake more BLUE for a bigger daily accrual." Staking
              // stopped feeding credits before the stake surface was retired;
              // the daily bucket is flat per wallet and extra is bought in USDC.
              hint:   "Top up credits in USDC, or wait for the 24h daily allowance to refresh.",
            },
          };
        }
        // Non-payment error during spend — log + degrade to free bypass
        // rather than block the chat experience.
        console.error("[x402] credit debit failed:", err.message);
      }
    }
  } else if (!service) {
    // No user AND not an authorized internal service job (cron). Free utility
    // tools ($0) still run for anyone, but PAID tools require a connected
    // wallet — closes the guest free-tool loophole. (Cron sets `service`, which
    // only our own server can — over HTTP it is X-Blue-Service: internal behind
    // the internal key — so it falls through and free-bypasses; a browser guest
    // can never set it.)
    const { toolCreditCostFor } = await import("@/lib/credit-pricing");
    if (toolCreditCostFor(tool, 0) > 0) {
      return {
        status: 402,
        body: { error: "This tool requires a connected wallet.", code: "WALLET_REQUIRED", tool },
      };
    }
  }

  const innerReq = new Request(`https://blueagent.dev/api/x402/${tool}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  // Give back THIS request's debit, if it made one. Never throws: a refund
  // that fails is logged and the error answer still goes out.
  const returnCredits = async () => {
    if (!creditRef || !wallet) return false;
    try {
      const { refund } = await import("@/lib/credit-ledger");
      const r = await refund(wallet, creditRef);
      return r.status === "refunded" || r.status === "already";
    } catch (err) {
      console.error("[x402] tool credit refund failed:", (err as Error).message, creditRef);
      return false;
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const run = handler(innerReq).then(async (resp) => ({
      resp,
      data: (await resp.json().catch(() => ({}))) as Record<string, unknown>,
    }));
    const outcome = timeoutMs === undefined
      ? await run
      : await Promise.race([
          run,
          new Promise<typeof TIMED_OUT>((resolve) => { timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs); }),
        ]);
    if (outcome === TIMED_OUT) {
      // The handler is still running and cannot be cancelled; keep its eventual
      // rejection from surfacing as an unhandled one. Its answer is discarded,
      // so the debit for it goes back now.
      run.catch(() => {});
      const refunded = await returnCredits();
      return {
        status: 504,
        body: {
          error: refunded ? "Tool timed out — your credits were returned" : "Tool timed out",
          message: `no answer within ${timeoutMs}ms`,
        },
        creditsDebited: refunded ? 0 : creditsDebited,
      };
    }
    const { resp, data } = outcome;
    if (!resp.ok && (await returnCredits())) creditsDebited = 0;
    return { status: resp.ok ? 200 : resp.status, body: data, creditsDebited };
  } catch (e) {
    const refunded = await returnCredits();
    return {
      status: 502,
      body: {
        error: refunded ? "Tool failed — your credits were returned" : "Tool failed",
        message: (e as Error).message,
      },
      creditsDebited: refunded ? 0 : creditsDebited,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
