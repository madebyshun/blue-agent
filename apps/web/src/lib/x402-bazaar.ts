import { BAZAAR, bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import type { AgentTool } from "@/lib/agent-tools";
import { wireSchema } from "@/lib/tool-wire-schema";

/**
 * Build the Bazaar extension object for a tool — with the OFFICIAL helper.
 *
 * 🔴 MEASURED 2026-10-22: this was hand-built from 2026-05-31 (d1f67f4f) with
 * `info` only and NO `schema`, and Bazaar indexed nothing from this payee for
 * the whole ~5 months since. The SDK's own `extractDiscoveryInfo` — the step a
 * facilitator runs before cataloging — rejects that shape with "Schema
 * validation failed: schema must be object or boolean" and returns null, while
 * verify and settle both succeed. That is why a real paid settle (block
 * 52,927,120) still left `discovery/merchant?payTo=0x0295…` at total 0.
 *
 * `declareDiscoveryExtension` emits `info` + a matching JSON `schema`; the
 * server extension's `enrichDeclaration` then adds `method` to both atomically
 * (it is "absent at declaration time" by design). No `routePattern` is passed,
 * so no `routeTemplate` — each tool is listed at its own URL, which is what
 * the May entry's `:tool` template got wrong. `scripts/bazaar-extension-test.ts`
 * runs every catalog tool through `extractDiscoveryInfo` so this cannot
 * silently regress to a shape the facilitator drops.
 */
export function buildBazaarExtension(meta: AgentTool | undefined) {
  // This is the WIRE shape, from wireSchema — NOT `meta.inputs`, which is the
  // /hub FORM. x402Body renames form keys for 17 of the 111 live tools, and
  // this object is the literal template a Bazaar agent copies into its POST,
  // so publishing the form here meant handing the caller a body the handler
  // destructures nothing out of. See lib/tool-wire-schema.ts.
  const fields = meta ? wireSchema(meta).fields : [];
  // The example must satisfy the schema published beside it, or the
  // facilitator drops the listing ("/input/body/limit: must be number"):
  // a typed placeholder for required fields, the Hub's constant where there is
  // one, and optional fields with no default left out rather than sent as "".
  const placeholder = (f: (typeof fields)[number]) =>
    f.type === "number" ? 0 : f.type === "boolean" ? false : f.type === "object" ? {} : `<${f.name}>`;
  const bodyExample = Object.fromEntries(
    fields
      .filter(f => f.required || f.default !== undefined)
      .map(f => [f.name, f.default !== undefined ? f.default : placeholder(f)]),
  );
  const declared = declareDiscoveryExtension({
    bodyType: "json",
    input: bodyExample,
    inputSchema: {
      type: "object",
      properties: Object.fromEntries(
        fields.map(f => [f.name, { type: f.type, description: f.description }]),
      ),
      required: fields.filter(f => f.required).map(f => f.name),
    },
    output: {
      example: {
        tool: meta?.id ?? "tool",
        result: "Tool output (JSON)",
        _settle: { ok: true, status: 200, tx: "0x..." },
      },
    },
  })[BAZAAR.key];
  return bazaarResourceServerExtension.enrichDeclaration!(declared, { method: "POST", adapter: {} });
}
