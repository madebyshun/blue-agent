/**
 * The POST body a tool actually receives — derived, not retyped.
 *
 * WHY THIS EXISTS
 * ---------------
 * `AgentTool.inputs` describes the HUB FORM: the labelled boxes a human fills
 * in on /hub. `AgentTool.x402Body` then translates those box values into the
 * JSON that is POSTed to `/api/x402/<id>`. For 93 of 111 tools the two are the
 * same shape and nobody notices the difference. For 18 they are not, and the
 * gap is invisible from either side:
 *
 *   stack-recommender   form[project_type, constraints]
 *                       → wire{ project, description, team_size, timeline }
 *
 * `/api/catalog` published `inputs[].key` as if it were the API contract. That
 * is the form, so an agent that read the catalog and POSTed
 * `{ project_type, constraints }` hit a handler that destructures
 * `{ project, description, team_size, timeline }`, got every field's default,
 * and paid full price for a run with no input in it. The Hub UI was fine the
 * whole time — it goes through x402Body — so nothing in the product looked
 * broken. Only direct callers were affected, and a direct caller is precisely
 * who a machine-readable catalog is for.
 *
 * MEASURED 2026-09-24, before this module existed: of 111 tools, 100 had a wire
 * shape the handler reads, 9 take no input at all, and 2 were broken outright —
 * `ecosystem-digest` (handler signature is `handler()`, so it cannot read a body
 * under any name, yet a "Focus area" box was advertised) and
 * `token-momentum-scanner` (wire sent `{chain, context}`; the handler reads only
 * `min_mcap`). Both are fixed in agent-tools.ts; this module is what stops a
 * third from appearing unnoticed.
 *
 * HOW IT WORKS
 * ------------
 * Probe, don't parse. Every form key is fed a unique sentinel string, x402Body
 * is run for real, and each resulting field is classified by whether a sentinel
 * survived into it:
 *
 *   sentinel present  → caller-supplied. Required iff some contributing form
 *                       input was required.
 *   no sentinel       → a constant x402Body injects (`stage: "pre-seed"`,
 *                       `audience: "Base builders"`). A direct caller MAY send
 *                       it; if they don't, this is the value the Hub sends, so
 *                       it is published as the documented default rather than
 *                       as an input the caller must guess.
 *
 * Running the real function is the point: a regex over the source would go
 * stale the moment someone writes a ternary, and template literals like
 * `` `${v.a} ${v.b}` `` would be unreadable. The sentinel survives string
 * interpolation, `??` defaults and object spread, which is most of what these
 * functions do.
 *
 * This module is the single source for BOTH published surfaces — `/api/catalog`
 * and the generated tool tables in SKILL.md — so the two cannot drift from each
 * other or from the wire. `scripts/skill-catalog-check.ts` additionally asserts
 * every derived field is one the handler actually reads.
 */
import type { AgentTool } from "@/lib/agent-tools";

/**
 * Unlikely to occur in any real placeholder, safe inside a template literal,
 * and free of characters that JSON or a shell would mangle. Deliberately NOT a
 * control character: these values get interpolated into strings and compared,
 * and a NUL byte breaks process spawning on Node.
 */
const sentinel = (key: string) => `__BLUE_PROBE_${key}__`;

export interface WireField {
  /** Field name as it appears in the POST body. */
  name:        string;
  type:        "string" | "number" | "boolean" | "object";
  required:    boolean;
  /** Human label, from the form input(s) that feed this field. */
  description: string;
  /** For constants injected by x402Body: the value the Hub sends. */
  default?:    string | number | boolean;
}

export interface WireSchema {
  type:       "object";
  properties: Record<string, { type: string; description: string; default?: unknown }>;
  required:   string[];
  /** Flat list, in wire order — easier for doc generation than the JSON-Schema shape. */
  fields:     WireField[];
}

function typeOf(v: unknown): WireField["type"] {
  if (typeof v === "number")  return "number";
  if (typeof v === "boolean") return "boolean";
  if (v && typeof v === "object") return "object";
  return "string";
}

/**
 * Derive the real POST body schema for one tool.
 *
 * Tools with no `x402Body` post their form values verbatim, so the form IS the
 * wire shape and the two paths agree.
 */
export function wireSchema(tool: AgentTool): WireSchema {
  const probe: Record<string, string> = {};
  for (const i of tool.inputs) probe[i.key] = sentinel(i.key);

  let body: Record<string, unknown>;
  try {
    body = (tool.x402Body ? tool.x402Body(probe) : { ...probe }) as Record<string, unknown>;
  } catch {
    // A throwing x402Body is a bug, but this module is on the read path of a
    // public endpoint — degrade to the form shape rather than 500 the catalog.
    body = { ...probe };
  }

  const byKey  = new Map(tool.inputs.map((i) => [i.key, i]));
  const fields: WireField[] = [];

  for (const [name, value] of Object.entries(body)) {
    const rendered = typeof value === "string" ? value : JSON.stringify(value) ?? "";
    const sources  = tool.inputs.filter((i) => rendered.includes(sentinel(i.key)));

    // A sentinel does NOT survive numeric coercion: `Number(v.min_mcap ?? 0) || 0`
    // turns the probe string into NaN and then 0, so the field looks like a
    // constant when it is in fact caller-supplied. Name-matching is the fallback,
    // and it is narrow on purpose — it only fires when the wire field has the
    // SAME name as a form input, which is the case coercion destroys. A renamed
    // field that is also coerced would still be misread, so the check in
    // scripts/skill-catalog-check.ts verifies against the handler rather than
    // trusting this classification.
    const coerced = !sources.length && byKey.has(name) ? [byKey.get(name)!] : [];
    const from    = sources.length ? sources : coerced;

    if (from.length) {
      fields.push({
        name,
        type:        coerced.length ? typeOf(value) : "string",
        // One required contributor is enough: omit it and the handler gets a
        // blank where a value was meant to be.
        required:    from.some((s) => byKey.get(s.key)?.required === true),
        description: from.map((s) => s.label).join(" + "),
      });
    } else {
      fields.push({
        name,
        type:        typeOf(value),
        required:    false,
        description: "Fixed by the Hub; override if you need a different value",
        default:     value as string | number | boolean,
      });
    }
  }

  return {
    type:       "object",
    properties: Object.fromEntries(
      fields.map((f) => [
        f.name,
        f.default === undefined
          ? { type: f.type, description: f.description }
          : { type: f.type, description: f.description, default: f.default },
      ]),
    ),
    required: fields.filter((f) => f.required).map((f) => f.name),
    fields,
  };
}
