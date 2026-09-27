/**
 * Which tool was called, from WHERE, on WHICH day, and did it work.
 *
 * WHY THIS EXISTS
 * ---------------
 * `usage:<id>` already counts tool runs, and several surfaces read it (/api/usage,
 * /api/stats, the Hub tool cards, the builder dashboard). It is a good counter and
 * this module does not replace it. But it collapses three things the catalog needs
 * kept apart, and the collapse is why "which tools do people actually use?" has
 * been unanswerable:
 *
 *   SURFACE — `usage:<id>` is incremented by the paid x402 route, by the free MCP
 *             bypass, and by /api/hub/tools/<id>/call, into the SAME integer. So a
 *             tool with 40 runs might be 40 paid calls or 40 free MCP calls, and
 *             those imply opposite decisions. MEASURED 2026-09-24: /api/mcp is
 *             public, unauthenticated and CORS-open, and calls the x402 route with
 *             `internalX402Headers()` — no payment, no `X-Blue-User`. It is
 *             plausibly the surface with the most real traffic and it is exactly
 *             the one the aggregate cannot isolate.
 *
 *   TIME    — it is a forward-only lifetime total. "111 tools, N runs" cannot tell
 *             you whether a tool was used last week or once in May. Trend is the
 *             whole question when deciding what to deepen and what to retire.
 *
 *   OUTCOME — the MCP path increments only AFTER a 2xx, so a tool that is called
 *             constantly and fails every time reads as a tool nobody calls. That
 *             is the single most misleading shape in the data: demand exists and
 *             the number says it does not.
 *
 * DELIBERATELY NOT COLLECTED
 * --------------------------
 * No wallet, no IP, no arguments, no prompt text, no user identifier of any kind.
 * The field key is `<surface>|<tool>|<outcome>` and nothing else, so this can
 * never become a per-user behaviour log. Counting which TOOL is popular does not
 * require knowing WHO called it, and the cheapest way to keep that promise is to
 * have no field to put it in.
 *
 * The `usage:mcpinit:<day>` counter at the bottom of this file is the one thing
 * that records anything about the CALLER, and it is bucketed software identity
 * (`claude_code`, `cursor`, `other`), never a person — see its own header for
 * why the bucket list is closed and why the client VERSION is dropped.
 *
 * COST
 * ----
 * Upstash bills per command, and an Upstash budget overrun is what unscheduled
 * the research-loop cron (#148), so the shape here is chosen for command count,
 * not convenience:
 *
 *   write — exactly ONE `HINCRBY` per tool call, on top of the existing
 *           `usage:<id>` `INCR`. A flat key per (tool, surface, day) would cost
 *           the same to write but would make reads impossible: there is no SCAN
 *           in our KV client, so a reader would have to construct and GET
 *           111 tools × 4 surfaces × 14 days ≈ 6k keys for one report.
 *   read  — ONE `HGETALL` per day. A 14-day report is 14 commands.
 *   TTL   — `RETENTION_DAYS`, set lazily (see `expirySet`) so it costs ~1 extra
 *           command per serverless instance per day rather than one per call.
 *   init  — ONE more `HINCRBY` per MCP `initialize`, which is once per client
 *           session rather than once per call, so it is noise next to the above.
 *
 * Both functions swallow their errors. A metering failure must never turn into a
 * failed tool call — the counter is the least important thing in the request.
 */
import { kv } from "@/lib/kv";

/**
 * Where the call came in. Keep this list closed and short: it is the dimension
 * the whole module exists to preserve, and a free-form string would let a typo
 * silently create a phantom surface that looks like a real one in the report.
 */
export type UsageSurface =
  /** Paid x402 — a caller signed a USDC authorization and it settled. */
  | "x402"
  /** /api/mcp — free internal bypass, no payment, no wallet. */
  | "mcp"
  /** /api/hub/tools/<id>/call — the Hub's own in-page runner. */
  | "hub"
  /** /api/console — the 5 `blue_*` commands. */
  | "console";

export type UsageOutcome = "ok" | "err";

/** Days of history kept. Past this, the daily hash expires and is gone. */
export const RETENTION_DAYS = 90;

const KEY = (day: string) => `usage:day:${day}`;

/**
 * UTC, always. A local-timezone bucket would shift when Vercel schedules a
 * function in a different region, which silently splits one real day across two
 * buckets and makes a fortnight of data unreadable.
 */
export function utcDay(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Keys we have already set a TTL on, per serverless instance. Holds the FULL
 * key, not the day, because two different daily hashes live in here now and a
 * bare `2026-09-27` would make the first writer suppress the second one's
 * `EXPIRE` — leaving a hash with no TTL, which is the one failure this cache
 * exists to prevent.
 *
 * `HINCRBY` on a missing key creates it with no expiry, so something has to call
 * `EXPIRE`. Doing it on every write doubles the command cost of the whole module.
 * Instances are ephemeral and not shared, so this is a best-effort cache: the
 * worst case is a handful of redundant EXPIRE calls on the first request each
 * instance serves, and the key is guaranteed to carry a TTL after the first
 * write on any instance. Re-setting the same TTL is idempotent in Redis.
 */
const expirySet = new Set<string>();

/**
 * Record one tool call. Never throws.
 *
 * `tool` is the CATALOG id (`token-price`), not the MCP alias (`hub_token_price`),
 * so a tool reached through two surfaces aggregates into one row.
 */
export async function recordCall(
  tool: string,
  surface: UsageSurface,
  outcome: UsageOutcome,
): Promise<void> {
  if (!tool) return;
  const key = KEY(utcDay());
  try {
    await kv.hincrby(key, `${surface}|${tool}|${outcome}`, 1);
    if (!expirySet.has(key)) {
      expirySet.add(key);
      await kv.expire(key, RETENTION_DAYS * 86_400);
    }
  } catch {
    // Metering is best-effort by design. See the header: a KV outage must not
    // fail a tool call the caller may have paid for.
  }
}

export interface DayUsage {
  day: string;
  /** null = the HGETALL threw. NOT the same as a day with no calls, which is {}. */
  rows: Record<string, { surface: UsageSurface; tool: string; ok: number; err: number }> | null;
}

const SURFACES = new Set<string>(["x402", "mcp", "hub", "console"]);

/**
 * Read the last `days` UTC days, newest first.
 *
 * `rows: null` vs `rows: {}` is the #150 distinction and it matters here as much
 * as anywhere: a throttled read rendering as "0 calls" would be read as "nobody
 * uses this tool", which is a conclusion, not a missing datapoint.
 */
export async function readDays(days: number): Promise<DayUsage[]> {
  const n = Math.max(1, Math.min(days, RETENTION_DAYS));
  const out: DayUsage[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.now() - i * 86_400_000);
    const day = utcDay(d);
    let rows: DayUsage["rows"];
    try {
      const h = await kv.hgetall(KEY(day));
      rows = {};
      for (const [field, raw] of Object.entries(h ?? {})) {
        // Field shape is `<surface>|<tool>|<outcome>`. Anything else is junk from
        // a bad write or a future format; skip it rather than let it land in a
        // report as a tool named "undefined".
        const parts = field.split("|");
        if (parts.length !== 3) continue;
        const [surface, tool, outcome] = parts;
        if (!SURFACES.has(surface) || !tool) continue;
        if (outcome !== "ok" && outcome !== "err") continue;
        const count = Number(raw);
        if (!Number.isFinite(count)) continue;
        const id = `${surface}|${tool}`;
        rows[id] ??= { surface: surface as UsageSurface, tool, ok: 0, err: 0 };
        rows[id][outcome] += count;
      }
    } catch {
      rows = null;
    }
    out.push({ day, rows });
  }
  return out;
}

/* ─────────────────────── MCP handshakes ───────────────────────────────────────
 *
 * How many agents CONNECT, which is a different question from how many tool
 * calls they make, and the one nobody could answer. "Is anyone actually running
 * `claude mcp add blue-agent`?" was unanswerable in either direction: the tool
 * counters above only move when a client both connects AND picks one of the 19
 * tools, so a client that installed, listed, and never called is invisible, and
 * a client that called one tool forty times is indistinguishable from forty
 * clients. `initialize` is the one message every MCP client must send exactly
 * once before it can do anything, so counting it is the closest thing to a
 * session count that exists in the protocol.
 *
 * WHAT THIS IS NOT. It is not an install count and must never be quoted as one.
 * Every editor restart re-handshakes, so one developer who restarts Cursor ten
 * times is ten handshakes. It bounds the answer from above and it distinguishes
 * "nobody" from "somebody", which is the decision it exists to support.
 *
 * WHY THE BUCKET LIST IS CLOSED. `clientInfo.name` is attacker-controlled: the
 * route is public, unauthenticated and CORS-open, so writing the raw string as a
 * hash field is an unbounded-cardinality KV write that anyone can spray. The
 * families below are the whole range, plus `other` and `unnamed`, so the hash
 * can never exceed a couple of dozen fields no matter what arrives.
 *
 * The cost of that: a genuinely popular new client lands in `other` and its name
 * is nowhere.
 *
 * 🔴 THAT COST CAME DUE WITHIN A DAY, and the rule written here to handle it was
 * not executable. This paragraph used to end: "If `other` starts to dominate, the
 * fix is to add a family here and wait a day, NOT to open the field up."
 * MEASURED 2026-09-27, the first full day of data: `other` = 10 of 19 handshakes,
 * the largest bucket, every other bucket in single digits. So `other` dominated —
 * and "add a family" is an instruction that needs to know WHICH family, which is
 * precisely the one thing a bucket-only counter cannot say. The rule assumed the
 * dominant unknown would be guessable from the outside. It was not: three guesses
 * that day (`claude`, `claude_ai`, `mcp_remote`) all drew real traffic and `other`
 * still led. Because bucketing is forward-only, each day spent guessing destroys
 * that day's identities permanently.
 *
 * The rule's error was conflating TWO things: "record raw names" and "unbounded
 * cardinality". The safety argument above is only about the second one. So
 * `usage:mcpraw:<day>` now keeps a HARD-CAPPED sample of the folded raw names that
 * fell through to `other` — at most `RAW_NAME_CAP` distinct fields per day, each
 * truncated, plus an `_overflow` counter so a full sample can never read as a
 * complete one. The cardinality bound is the same order as the bucket hash itself,
 * which is the property the closed list existed to guarantee. What stays true: the
 * BUCKETS remain a closed set, and a spray attack can still cost you the sample —
 * it cannot cost you the counts, and it cannot grow the key without bound.
 *
 * NOT RECORDED: `clientInfo.version`. It multiplies cardinality by every point
 * release and there is no decision anyone would make differently knowing it.
 */

const INIT_KEY = (day: string) => `usage:mcpinit:${day}`;

/**
 * Bounded sample of RAW names that matched no family. Separate key from the bucket
 * hash on purpose: a reader of `usage:mcpinit:<day>` keeps the closed-set guarantee
 * it has always had, and this one can be dropped wholesale without touching a
 * single count.
 */
const RAW_KEY = (day: string) => `usage:mcpraw:${day}`;

/**
 * Distinct unmatched names kept per day. Small because the job is "name the
 * dominant unknown", not "enumerate the tail" — and because this is the number
 * that bounds what a sprayer can write.
 */
export const RAW_NAME_CAP = 12;

/** Truncation for one sampled name. A client name longer than this is not a client name. */
export const RAW_NAME_MAXLEN = 40;

/**
 * Sentinel for "names were dropped because the cap was full". A leading `_` is
 * UNREACHABLE by any folded real name — `foldClientName` strips leading
 * underscores — so no caller can impersonate this field by naming itself
 * `_overflow`. Structural, not a naming convention to remember.
 */
const RAW_OVERFLOW_FIELD = "_overflow";

/**
 * Known MCP client families, matched as a SUBSTRING of the normalized name
 * because real clients send decorated variants (`cursor-vscode`,
 * `Claude Code`) rather than a bare family name.
 *
 * ⚠️ ORDER IS LOAD-BEARING — first match wins. `cursor_vscode` contains both
 * `cursor` and `vscode`, so `cursor` has to come first or every Cursor session
 * is filed as VS Code. Add new families ABOVE any shorter string they contain.
 *
 * That rule was broken by the first version of this list and nothing caught it:
 * `cline` sat above `roo_cline`, so every Roo session filed as Cline and the
 * `roo_cline` bucket was unreachable — a dead entry that still read as coverage.
 * The fix is not vigilance. `scripts/usage-meter-check.ts` now asserts
 * `normalizeMcpClient(f) === f` for every family, which is exactly the property
 * "this entry can be reached", and it needs no exemption list to say so. A family
 * that cannot bucket its own name is a bug in every case, so the check has no
 * legitimate counterexample to carve out.
 *
 * ⚠️ UNDERSCORES, NOT HYPHENS, and that is not cosmetic. `claude-code` beside
 * `claude-sonnet-5` is indistinguishable from a model id, and
 * scripts/model-id-check.ts correctly flagged all three `claude-*` entries when
 * this list was hyphenated. That check deliberately has no value allowlist — it
 * narrows structurally — and the structure it relies on is that every real
 * Virtuals model id is lowercase and HYPHENATED. So an underscored bucket is in a
 * namespace that provably cannot collide, rather than an exemption that has to be
 * argued for once per entry. `normalizeMcpClient` folds the wire name to `_` for
 * the same reason. Do not "tidy" these back to hyphens.
 */
export const MCP_CLIENT_FAMILIES = [
  "claude_code",
  "claude_desktop",
  "claude_ai",
  "claude_agent_sdk",
  // Bare brand name, LAST of the `claude_*` group: anything containing "claude" is
  // a Claude client, so this is a safe catch-all, but only after the specific ones.
  "claude",
  "cursor",
  // `roo_cline` before `cline`, per the ordering rule above — it contains it.
  "roo_cline",
  "cline",
  "windsurf",
  "continue",
  "librechat",
  "goose",
  "mcp_inspector",
  // The stdio↔HTTP bridge named in our own install instructions, so it is the
  // likeliest name on the wire for a desktop client reaching a remote server.
  "mcp_remote",
  "langchain",
  "langgraph",
  "openai",
  "chatgpt",
  "n8n",
  "jetbrains",
  "intellij",
  "postman",
  "zed",
  "vscode",
  "visual_studio_code",
] as const;

const VALID_CLIENT = new Set<string>([...MCP_CLIENT_FAMILIES, "other", "unnamed"]);

/**
 * Bucket a caller-supplied `clientInfo.name` into one of the closed set above.
 *
 * `unnamed` and `other` are kept apart on purpose: `unnamed` is a caller that
 * sent no name at all (a raw `curl`, a smoke script, our own CI), `other` is a
 * real client we do not have a bucket for. Collapsing them would hide the only
 * signal that says "add a family to the list".
 */
/**
 * The ONE definition of "fold a wire name into our namespace". Both the bucketer
 * and the unmatched-name sampler go through it, so the two can never disagree
 * about what a name is — the sampler recording a charset the bucketer would have
 * folded differently is exactly how you get a sample you cannot act on.
 */
export function foldClientName(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function normalizeMcpClient(raw: unknown): string {
  if (typeof raw !== "string") return "unnamed";
  const s = foldClientName(raw);
  if (!s) return "unnamed";
  for (const family of MCP_CLIENT_FAMILIES) {
    if (s.includes(family)) return family;
  }
  return "other";
}

/** Record one MCP `initialize`. Never throws — same contract as `recordCall`. */
export async function recordMcpHandshake(clientName: unknown): Promise<void> {
  const bucket = normalizeMcpClient(clientName);
  const key = INIT_KEY(utcDay());
  try {
    await kv.hincrby(key, bucket, 1);
    if (!expirySet.has(key)) {
      expirySet.add(key);
      await kv.expire(key, RETENTION_DAYS * 86_400);
    }
  } catch {
    // Best-effort by design. A metering failure must not break the handshake
    // that every MCP session depends on.
  }
  // Only the unknowns pay the extra commands, and they are the only ones whose
  // name we do not already have. A recognised client costs exactly what it did
  // before this feature existed.
  if (bucket === "other" && typeof clientName === "string") {
    await sampleUnmatchedName(clientName);
  }
}

/**
 * Record one folded unmatched name, under a hard cap on distinct names per day.
 *
 * Admission rule: an ALREADY-SEEN name always increments, a NEW name is admitted
 * only while the day is under cap. That ordering is what makes the sample useful
 * under spray — whoever got in first keeps climbing, so a genuinely repeated
 * client out-counts noise instead of being crowded out by it.
 *
 * Costs 2 Upstash commands per unmatched handshake (one `HGETALL` of a ≤13-field
 * hash, one `HINCRBY`). Bounded by the size of `other`, which is the population
 * this exists to identify, and which shrinks as the guess list improves.
 */
async function sampleUnmatchedName(raw: string): Promise<void> {
  const field = foldClientName(raw).slice(0, RAW_NAME_MAXLEN);
  // An empty fold is `unnamed`, never `other`, so this cannot fire from the
  // caller above — kept because it is the one input that would write a nameless
  // field, and a guard is cheaper than the reasoning needed to prove it can't.
  if (!field) return;

  const key = RAW_KEY(utcDay());
  try {
    const existing = await kv.hgetall(key);
    const fields = Object.keys(existing ?? {});
    // The sentinel must not consume one of the sample slots.
    const distinct = fields.filter((f) => f !== RAW_OVERFLOW_FIELD).length;
    if (!fields.includes(field) && distinct >= RAW_NAME_CAP) {
      await kv.hincrby(key, RAW_OVERFLOW_FIELD, 1);
      return;
    }
    await kv.hincrby(key, field, 1);
    if (!expirySet.has(key)) {
      expirySet.add(key);
      await kv.expire(key, RETENTION_DAYS * 86_400);
    }
  } catch {
    // Same contract as above: a metering failure never breaks a handshake.
  }
}

export interface DayHandshakes {
  day: string;
  /** null = the HGETALL threw. NOT the same as {}, which is "read fine, nobody connected". */
  clients: Record<string, number> | null;
}

/** Read the last `days` UTC days of handshakes, newest first. */
export async function readHandshakeDays(days: number): Promise<DayHandshakes[]> {
  const n = Math.max(1, Math.min(days, RETENTION_DAYS));
  const out: DayHandshakes[] = [];
  for (let i = 0; i < n; i++) {
    const day = utcDay(new Date(Date.now() - i * 86_400_000));
    let clients: DayHandshakes["clients"];
    try {
      const h = await kv.hgetall(INIT_KEY(day));
      clients = {};
      for (const [field, raw] of Object.entries(h ?? {})) {
        // Anything outside the closed set is junk from a bad write or a family
        // since removed; skip it rather than let it surface as a real client.
        if (!VALID_CLIENT.has(field)) continue;
        const count = Number(raw);
        if (!Number.isFinite(count)) continue;
        clients[field] = (clients[field] ?? 0) + count;
      }
    } catch {
      clients = null;
    }
    out.push({ day, clients });
  }
  return out;
}

export interface DayUnmatched {
  day: string;
  /** null = the HGETALL threw. NOT the same as {}, which is "read fine, no unknowns". */
  names: Record<string, number> | null;
  /** Handshakes whose name was dropped because the day's sample was already full. */
  dropped: number;
}

/**
 * Read the sampled unmatched client names, newest day first.
 *
 * `dropped` is split out of `names` rather than left in it as a pseudo-name,
 * because a caller summing `names` to "how many unknown handshakes were there"
 * would otherwise double-count: the dropped ones are already in
 * `by_client.other`. Same reason `unreadable_days` is not folded in as a zero.
 */
export async function readUnmatchedClientNames(days: number): Promise<DayUnmatched[]> {
  const n = Math.max(1, Math.min(days, RETENTION_DAYS));
  const out: DayUnmatched[] = [];
  for (let i = 0; i < n; i++) {
    const day = utcDay(new Date(Date.now() - i * 86_400_000));
    let names: DayUnmatched["names"];
    let dropped = 0;
    try {
      const h = await kv.hgetall(RAW_KEY(day));
      names = {};
      for (const [field, raw] of Object.entries(h ?? {})) {
        const count = Number(raw);
        if (!Number.isFinite(count)) continue;
        if (field === RAW_OVERFLOW_FIELD) { dropped += count; continue; }
        names[field] = (names[field] ?? 0) + count;
      }
    } catch {
      names = null;
    }
    out.push({ day, names, dropped });
  }
  return out;
}
