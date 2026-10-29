/**
 * docs-mcp-groups-check — every MCP tool renders on /docs/mcp, in exactly one group.
 *
 * MEASURED 2026-10-29 on https://blueagent.dev/docs/mcp: the header read
 * "Available tools · 13" and three tools rendered. The page grouped by name
 * prefix (`blue_` / `hub_` / `b20_`), MCP v2 had renamed ten tools to unprefixed
 * names, and `.filter(startsWith)` dropped them without a sound. The page's own
 * comment warned about it; nothing checked it.
 *
 * Asserts against the real manifest and price table, plus a synthetic tool with
 * a name no grouping rule has heard of — the case that broke last time.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { MCP_TOOLS } from "../src/lib/mcp-tools";
import { MCP_PRICES } from "../src/lib/mcp-paid";
import { groupMcpTools, formatUsdcMicros } from "../src/app/docs/mcp/groups";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

function placements(groups: ReturnType<typeof groupMcpTools>): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  for (const g of groups) for (const t of g.tools) seen.set(t.name, [...(seen.get(t.name) ?? []), g.key]);
  return seen;
}

console.log("1. the live manifest");
const groups = groupMcpTools();
const seen = placements(groups);
const rendered = groups.reduce((n, g) => n + g.tools.length, 0);
ok("rendered count == MCP_TOOLS.length", rendered === MCP_TOOLS.length, `${rendered} vs ${MCP_TOOLS.length}`);
for (const t of MCP_TOOLS) {
  const where = seen.get(t.name) ?? [];
  ok(`${t.name} in exactly one group`, where.length === 1, where.join(",") || "none");
}

console.log("2. prices");
for (const name of Object.keys(MCP_PRICES)) {
  ok(`priced ${name} is in the manifest`, MCP_TOOLS.some((t) => t.name === name));
  const shown = groups.find((g) => g.key === "paid")?.tools.find((t) => t.name === name);
  ok(`${name} shows ${formatUsdcMicros(MCP_PRICES[name])}`, shown?.priceMicros === MCP_PRICES[name]);
}
ok("no free tool carries a price", (groups.find((g) => g.key === "free")?.tools ?? []).every((t) => t.priceMicros === undefined));
ok("formatUsdcMicros(10_000) is $0.01", formatUsdcMicros(10_000) === "$0.01");

console.log("3. a tool name nobody planned for");
const synthetic = groupMcpTools(
  [...MCP_TOOLS, { name: "zz_unheard_of", description: "x" }, { name: "toString", description: "x" }],
  MCP_PRICES,
);
const synthSeen = placements(synthetic);
ok("zz_unheard_of still renders once", synthSeen.get("zz_unheard_of")?.length === 1);
ok("toString is not priced by Object.prototype", synthetic.find((g) => g.key === "free")?.tools.some((t) => t.name === "toString") === true);

console.log("4. the page renders the groups, not its own filter");
const page = readFileSync(path.resolve(__dirname, "../src/app/docs/mcp/page.tsx"), "utf8");
ok("page.tsx calls groupMcpTools()", /groupMcpTools\(\)/.test(page));
ok("page.tsx does not filter MCP_TOOLS by name", !/MCP_TOOLS\.filter\(/.test(page) && !/startsWith\(/.test(page));

console.log(`\n${failures === 0 ? "docs-mcp-groups-check: all passed" : `docs-mcp-groups-check: ${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
