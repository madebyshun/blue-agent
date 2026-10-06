/**
 * aeon-null-path-check — rebuild plan §4 #4 (2026-09-30): with no Aeon data,
 * the Aeon-reading tools SAY so, to the model and to the caller, instead of
 * handing the model a placeholder it reads as research.
 *
 *   §1  aeonStatus: none / partial / fresh, with the note whenever data is missing
 *   §2  every Aeon-reading handler: no `${x ?? "<words>"}` / `${x ?? target}`
 *       placeholder for an Aeon read, and its response carries `aeon_data`
 *   §3  runAeonSkill: real KV output or null — never a GitHub SKILL.md drafted
 *       into a skill-shaped answer
 *   §4  two real handlers on an empty KV and a stubbed model: the prompt the
 *       model receives says NONE, and the response says status "none"
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
  delete process.env[k];
}
process.env.VIRTUALS_API_KEY ??= "test-key-not-a-secret";

import fs from "node:fs";
import path from "node:path";
import { aeonStatus, AEON_NONE_NOTE, AEON_NONE_PROMPT } from "../src/app/api/_lib/aeon-kv";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// Every model request is captured; the answer is a generic JSON object so each
// handler's parse succeeds and returns its success path.
const prompts: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("compute.virtuals.io")) {
    if (url.includes("/models")) return new Response("catalog not stubbed", { status: 503 });
    prompts.push(String(init?.body ?? ""));
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ summary: "stub", score: 50 }) } }] });
  }
  return new Response("{}", { status: 404 });
}) as typeof fetch;

(async () => {
  console.log("\n1. aeonStatus");
  let st = aeonStatus({ "narrative-tracker": null });
  ok("nothing read → none, with the note", st.status === "none" && st.note === AEON_NONE_NOTE && st.skills["narrative-tracker"] === "none");
  st = aeonStatus({ "token-movers": "x", digest: undefined });
  ok("one of two → partial, with the note", st.status === "partial" && st.note === AEON_NONE_NOTE);
  st = aeonStatus({ "deep-research": "x" });
  ok("all read → fresh, no note", st.status === "fresh" && st.note === undefined);

  console.log("\n2. every Aeon-reading handler");
  const dir = path.resolve(__dirname, "../src/app/api/x402/_handlers");
  const readers = fs.readdirSync(dir).filter((f) => f.endsWith(".ts") && /getAeonOutput|runAeonSkill/.test(code(fs.readFileSync(path.join(dir, f), "utf8"))));
  // 14 readers until 2026-10-06; 13 of them were the Aeon-backed advisory tools
  // retired that day. The floor only guards against this scan matching nothing.
  ok(`found the Aeon readers (${readers.length})`, readers.length >= 1, readers.join(", "));
  for (const f of readers) {
    const src = code(fs.readFileSync(path.join(dir, f), "utf8"));
    // Variables that hold an Aeon read.
    const vars = new Set<string>();
    for (const m of src.matchAll(/const (\w+) = await (?:aeon|runAeonSkill)\(/g)) vars.add(m[1]);
    for (const m of src.matchAll(/const \[([^\]]+)\] = await Promise\.all\(\[\s*([\s\S]*?)\]\)/g)) {
      const names = m[1].split(",").map((x) => x.trim());
      const calls = m[2].split(/,\s*\n/).map((x) => x.trim());
      names.forEach((n, i) => { if (/^(aeon|runAeonSkill)\(/.test(calls[i] ?? "")) vars.add(n); });
    }
    const placeholders = [...vars].filter((v) => new RegExp(`\\$\\{${v} \\?\\? (?:"[^"]*"|target)\\}`).test(src));
    ok(`${f}: no placeholder stands in for a missing Aeon read`, placeholders.length === 0, placeholders.join(", "));
    ok(`${f}: the response carries aeon_data`, /aeon_data: aeonStatus\(/.test(src));
  }

  console.log("\n3. runAeonSkill");
  const llm = code(fs.readFileSync(path.resolve(__dirname, "../src/app/api/_lib/llm.ts"), "utf8"));
  const fn = llm.slice(llm.indexOf("export async function runAeonSkill"), llm.indexOf("export async function runMiroSharkSkill"));
  ok("no GitHub SKILL.md, no model draft — KV or null", fn.length > 0 && !/loadSkillFile|callBankrLLM|callLLM|githubusercontent/.test(fn), fn.slice(0, 120));
  const { runAeonSkill } = await import("../src/app/api/_lib/llm");
  const before = prompts.length;
  ok("an empty KV → null", (await runAeonSkill("narrative-tracker", "anything")) === null && prompts.length === before);

  console.log("\n4. the last Aeon reader, empty KV, stubbed model");
  // gtm-brief and roadmap-validator were the subjects here until 2026-10-06,
  // when the Aeon-backed advisory tools were retired. builder-deep-dd is the
  // one handler left that reads Aeon KV; a non-GitHub target keeps it offline.
  const { HANDLERS } = await import("../src/app/api/x402/_handlers/index");
  for (const [id, body] of [
    ["builder-deep-dd", { target: "Example project (offline test)" }],
  ] as const) {
    prompts.length = 0;
    const res = await HANDLERS[id](new Request(`https://blueagent.dev/api/x402/${id}`, { method: "POST", body: JSON.stringify(body) }));
    const j = (await res.json()) as { aeon_data?: { status?: string; note?: string } };
    ok(`${id}: response says aeon_data.status "none", with the note`, j.aeon_data?.status === "none" && j.aeon_data?.note === AEON_NONE_NOTE, JSON.stringify(j.aeon_data));
    const slots = prompts.filter((p) => /Research:|Project research:|Project:/.test(p));
    ok(`${id}: every prompt with an Aeon slot says NONE`,
      slots.length > 0 && slots.every((p) => p.includes(AEON_NONE_PROMPT.slice(0, 40))),
      `${slots.length} prompt(s)`);
  }

  console.log(failures === 0 ? "\naeon-null-path-check: PASS" : `\naeon-null-path-check: FAIL — ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
