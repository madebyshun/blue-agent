import H from "./src/app/api/x402/_handlers/index.ts";
import A from "./src/lib/agent-tools.ts";
const HANDLERS = H.HANDLERS ?? H.default?.HANDLERS ?? H;
const AGENT_TOOLS = A.AGENT_TOOLS ?? A.default?.AGENT_TOOLS ?? A.default ?? A;

const RUNS = Number(process.env.RUNS || 3);
const ONLY = process.env.ONLY;
const SCORE_TOL = Number(process.env.SCORE_TOL || 10);
const GRADER_KEY = process.env.BANKR_API_KEY ?? process.env.LLM_API_KEY;

const FIX = {
  // on-chain / địa chỉ
  address: "0xacfe6019ed1a7dc6f7b508c02d1b04ec88cc21bf",
  contract: "0xacfe6019ed1a7dc6f7b508c02d1b04ec88cc21bf",
  wallet: "0xF70Bf88796cd0FE1f184146676A428aFb1419778",
  // token cho advisory tools = TÊN dự án, không phải address
  token: "BlueAgent",
  ticker: "BLUE",
  total_supply: 1000000000,
  symbol: "BLUE",
  name: "BlueAgent",
  agent: "madebyshun",
  builder: "madebyshun",
  competitor: "Virtuals Protocol",
  competitors: "Virtuals Protocol, aixbt",
  agent_name: "BlueAgent",
  repo: "madebyshun/blue-agent",
  // handle / social
  handle: "madebyshun",
  github: "madebyshun",
  farcaster: "blueagent",
  // text / concept
  description: "agent tool marketplace on Base with x402 payments",
  context: "AI agent tokens on Base",
  idea: "agent-native neobank on Base",
  focus: "Base DeFi",
  project: "BlueAgent",
  goal: "launch agent tool marketplace",
  stage: "MVP",
  chain: "base",
};

function makeInput(tool) {
  const v = {};
  for (const inp of tool.inputs || []) {
    if (FIX[inp.key] !== undefined) v[inp.key] = FIX[inp.key];
    else if (inp.required) v[inp.key] = FIX.description; // required mà ko có fixture → text an toàn
    // optional ko có fixture → bỏ trống, để tool tự xử
  }
  return tool.x402Body ? tool.x402Body(v) : v;
}

function signals(o) {
  const s = {}; const j = JSON.stringify(o).toLowerCase();
  for (const k of ["composite", "score", "verdict", "action", "security", "market", "fundamentals", "recommendation"]) {
    const m = j.match(new RegExp(`"${k}"\\s*:\\s*"?([a-z0-9_.]+)`));
    if (m) s[k] = m[1];
  }
  return s;
}
function variance(runs) {
  const sigs = runs.map(signals);
  const num = ["composite", "score", "security", "market", "fundamentals"];
  const drift = [];
  for (const k of new Set(sigs.flatMap(Object.keys))) {
    const raw = sigs.map((s) => s[k]).filter(Boolean);
    if (new Set(raw).size <= 1) continue;
    if (num.includes(k)) {
      const ns = raw.map(Number).filter((n) => !isNaN(n));
      const sp = Math.max(...ns) - Math.min(...ns);
      if (sp > SCORE_TOL) drift.push(`${k}:spread${sp}`);
    } else drift.push(`${k}:{${[...new Set(raw)].join("|")}}`);
  }
  const flip = new Set(sigs.map((s) => s.verdict || s.action).filter(Boolean)).size > 1;
  return { stable: drift.length === 0, flip, detail: drift.join(", ") || "stable" };
}

const GRADER_SYS = `Bạn là QA NGHIÊM KHẮC VỚI CHÍNH MÌNH cho tool DD onchain. Chấm OUTPUT.
Mặc định tool ĐÚNG. Chỉ chấm fail khi có bằng chứng RÕ RÀNG. Khi nghi ngờ → pass.

KHÔNG được nhầm các trường hợp HỢP LỆ sau thành lỗi:
- ownership_risk/tokenomics_risk = high khi CÓ data on-chain (mint chưa renounce, FDV gap) → ĐÚNG, không phải hallucination.
- Nhiều câu cùng chủ đề rủi ro (mint vô hạn + chưa renounce) → BỔ SUNG nhau, KHÔNG phải inconsistency.
- Nêu volume/liquidity thật để nói "tradeable, not honeypot" → ĐÚNG, không phải logic-inversion.
- Field = "unknown" khi thiếu data off-chain → ĐÚNG (đây là hành vi mong muốn).

CHỈ chấm 4 lỗi khi thực sự xảy ra:
1 HALLUCINATION: gán giá trị KHÔNG có data nào chứng minh (vd whale=high trong khi tự ghi "cannot assess").
2 NEGATIVE_INFER: field thiếu data bị chấm low/bad/high-RISK thay vì "unknown". (unknown = KHÔNG phải lỗi.)
3 LOGIC_INVERSION: trình bày việc THIẾU một quyền lực owner (no pause, no blacklist) như RỦI RO; hoặc kết luận an toàn từ tín hiệu rủi ro.
4 INCONSISTENCY: hai câu PHỦ ĐỊNH trực tiếp nhau về cùng một biến.

Với MỖI lỗi: phải trích nguyên văn câu vi phạm + giải thích vì sao chắc chắn là lỗi. Không chắc thì bỏ.
Trả JSON thuần: {"pass":bool,"severity":"none|minor|major|critical","errors":[{"type":"...","quote":"...","why":"..."}],"one_line":"..."}`;

async function grade(toolId, output) {
  if (!GRADER_KEY) return { pass: null, severity: "skip", one_line: "no grader key" };
  const r = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: { "x-api-key": GRADER_KEY, "content-type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: GRADER_SYS,
      messages: [{ role: "user", content: `TOOL: ${toolId}\nOUTPUT:\n${JSON.stringify(output).slice(0, 6000)}` }],
    }),
  });
  if (!r.ok) return { pass: false, severity: "graderr", one_line: `grader HTTP ${r.status}` };
  const d = await r.json();
  let t = (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  t = t.replace(/```json|```/g, "").trim();
  const i = t.indexOf("{"), j = t.lastIndexOf("}");
  if (i >= 0 && j > i) t = t.slice(i, j + 1);
  try { return JSON.parse(t); } catch { return { pass: false, severity: "parsefail", one_line: t.slice(0, 100) }; }
}

async function callLocal(toolId, body) {
  const handler = HANDLERS[toolId];
  if (!handler) throw new Error(`no handler for ${toolId}`);
  const req = new Request(`http://local/api/x402/${toolId}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-test": "1" },
    body: JSON.stringify(body),
  });
  const res = await handler(req);
  return res.json();
}

async function main() {
  let tools = AGENT_TOOLS.filter((t) => HANDLERS[t.id]);
  if (ONLY) tools = tools.filter((t) => t.id === ONLY);
  console.log(`\n${tools.length} tool có handler local. RUNS=${RUNS}/tool. Grader: ${GRADER_KEY ? "on" : "OFF"}\n`);

  const results = [];
  for (const tool of tools) {
    const body = makeInput(tool);
    const runs = []; let err = null;
    for (let i = 0; i < RUNS; i++) {
      try { runs.push(await callLocal(tool.id, body)); }
      catch (e) { err = e.message; break; }
    }
    if (err) { results.push({ id: tool.id, ok: false, stage: "EXEC", err }); console.log(`  x ${tool.id} — ${err}`); continue; }

    const v = variance(runs);
    const g = await grade(tool.id, runs[0]);
    const ok = v.stable && (g.pass !== false) && !["major", "critical"].includes(g.severity);
    results.push({ id: tool.id, ok, variance: v.detail, flip: v.flip, severity: g.severity, errors: g.errors, one_line: g.one_line });
    console.log(`  ${ok ? "OK" : "XX"} ${tool.id.padEnd(28)} ${v.flip ? "FLIP " : ""}${v.stable ? "" : "var:" + v.detail + " "}${g.severity || ""}`);
    await new Promise(r=>setTimeout(r, 1500));
  }

  const { writeFileSync } = await import("node:fs");
  writeFileSync("test-hub-report.json", JSON.stringify(results, null, 2));
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${"=".repeat(56)}\n${results.length - fails.length}/${results.length} PASS\n`);
  if (fails.length) {
    console.log("CAN SUA (critical truoc):");
    fails.sort((a, b) => (a.severity === "critical" ? -1 : 1)).forEach((f) => {
      console.log(`\n  ${f.id} [${f.severity || f.stage}]`);
      if (f.flip) console.log(`    verdict flip giua cac lan chay`);
      if (f.variance && f.variance !== "stable") console.log(`    variance: ${f.variance}`);
      if (f.err) console.log(`    error: ${f.err}`);
      (f.errors || []).forEach((e) => console.log(`    ${e.type}: "${(e.quote || "").slice(0, 70)}"`));
    });
  }
  console.log(`\ntest-hub-report.json\n`);
}
main();
