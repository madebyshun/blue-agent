/**
 * Source parsing for `hub-receipts-report.ts`, extracted so the REFUSAL path can
 * be tested. Pure: strings in, values out. No fs, no network, no imports.
 *
 * WHY IT IS ITS OWN FILE
 * ----------------------
 * The report's one genuinely dangerous row is "MCP hidden endpoints" — names that
 * are `tools/call`-able while absent from the advertised manifest, so no client
 * can discover them and any client can invoke them. 67 existed before the
 * 2026-09-26 trim.
 *
 * 🔴 That row is computed as a SET DIFFERENCE, and a set difference against a
 * failed parse is EMPTY — which renders as "0 hidden endpoints", the single most
 * reassuring wrong answer this report could produce. It would look like the
 * invariant holding. It would in fact mean nobody looked.
 *
 * So every function here distinguishes "found, and it is empty" from "not found",
 * and `hiddenMcpEndpoints` refuses outright if ANY of its three sources is
 * missing. `null` and `{ ok: false }` are load-bearing; do not "simplify" either
 * to `[]`.
 *
 * This is the same failure the repo already paid for once: `MCP_COUNT` was a
 * regex over the mcp route, the manifest moved to `lib/mcp-tools.ts`, the regex
 * matched nothing, the count silently became 0, and four pins started demanding
 * "MCP serves 0 tools". Written up in the header of `docs-truth-check.ts`.
 *
 * Not named `-check.ts` / `-test.ts`: `run-tests.ts` discovers those by suffix,
 * and this is a library, not a suite. Its suite is `hub-receipts-check.ts`.
 */

/** Strip `//` line comments so a commented-out key is not counted as live. */
function stripLineComments(s: string): string {
  return s.replace(/\/\/[^\n]*/g, "");
}

/**
 * Find `const <name> ... = { … }` and return its TOP-LEVEL keys.
 *
 * `null` means the declaration was not found — NOT that it has no keys. The
 * caller must treat those differently; see the header.
 *
 * Anchored on the `const <name>` declaration rather than a bare substring search,
 * because these names also appear in prose comments in the same file ("Trimmed
 * 2026-09-26 alongside HUB_MAP: …"). A substring search can land on the comment
 * and then parse whatever object happens to follow it.
 */
export function literalKeys(src: string, name: string): string[] | null {
  const decl = new RegExp(`const\\s+${name}\\b[^=\\n]*=\\s*\\{`).exec(src);
  if (!decl) return null;

  const brace = src.indexOf("{", decl.index + decl[0].length - 1);
  if (brace < 0) return null;

  let depth = 0;
  let end = -1;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return null; // unbalanced — refuse rather than guess

  // Only depth-0 keys of THIS object. A nested object's keys are not callable
  // names, and counting them would inflate `callable` and hide a real finding.
  const body = stripLineComments(src.slice(brace + 1, end));
  const keys: string[] = [];
  let d = 0;
  for (const line of body.split("\n")) {
    const atZero = d === 0;
    // Quoted keys count too — `"hub_x": "y"` is as callable as `hub_x: "y"`,
    // and matching only bare identifiers would drop it silently.
    const m = atZero ? /^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*:/.exec(line) : null;
    if (m) keys.push(m[1] ?? m[2] ?? m[3]);
    for (const ch of line) {
      if (ch === "{" || ch === "[" || ch === "(") d++;
      else if (ch === "}" || ch === "]" || ch === ")") d--;
    }
  }
  return keys;
}

/**
 * Find `const <name> ... = new Set([ … ])` and return its string literals.
 * `null` means the declaration was not found.
 */
export function setLiterals(src: string, name: string): string[] | null {
  const decl = new RegExp(`const\\s+${name}\\b[^=\\n]*=\\s*new\\s+Set\\(\\[([\\s\\S]*?)\\]\\)`).exec(src);
  if (!decl) return null;
  return [...stripLineComments(decl[1]).matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
}

export type HiddenResult =
  /** Parsed cleanly. `hidden` is the finding; `[]` means the invariant holds. */
  | { ok: true; callable: string[]; hidden: string[] }
  /** A source was not found, so no claim is made. `missing` names which. */
  | { ok: false; missing: string[] };

/**
 * MCP names reachable through `tools/call` but absent from the advertised list.
 *
 * Refuses (`ok: false`) if any of the three maps cannot be located, because an
 * empty difference is indistinguishable from a clean bill of health. A caller
 * must render that as "unknown", never as 0.
 */
export function hiddenMcpEndpoints(src: string, advertised: Iterable<string>): HiddenResult {
  const sources: [string, string[] | null][] = [
    ["HUB_MAP", literalKeys(src, "HUB_MAP")],
    ["CONSOLE_MAP", literalKeys(src, "CONSOLE_MAP")],
    ["B20_ENCODE_TOOLS", setLiterals(src, "B20_ENCODE_TOOLS")],
  ];

  const missing = sources.filter(([, v]) => v === null).map(([k]) => k);
  if (missing.length) return { ok: false, missing };

  const advertisedSet = new Set(advertised);
  const callable = sources.flatMap(([, v]) => v as string[]);
  return { ok: true, callable, hidden: callable.filter((n) => !advertisedSet.has(n)) };
}
