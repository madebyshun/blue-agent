/**
 * device-agent-test — "your agent is working" on a linked BlueCube / BlueBot.
 *
 *   §1  a wallet with no linked device is never written (KV budget, #148)
 *   §2  start → thinking with a ≤21-char label; end → not thinking, still active
 *   §3  a turn that never ended stops reading as thinking after MAX_TURN_S
 *   §4  the active window closes → the device is told to stop fast polling
 *   §5  feed item tones come from fields the item already has
 *   §6  the cube is a first-class device kind
 *   §7  a cube is capped at `read` on the server, whatever the page asks for
 *
 * Hermetic: KV env cleared (in-memory store), no network.
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
  delete process.env[k];
}

import { kv } from "../src/lib/kv";
import {
  agentLabel, noteAgentStart, noteAgentEnd, readAgentState, agentStateOf, markAgentTurn, itemTone,
  ACTIVE_WINDOW_S, AGENT_POLL_S, MAX_TURN_S,
} from "../src/lib/device-agent";
import { DEVICE_KINDS, cleanDeviceName, grantForKind, startDeviceLink, approveCode, pollForToken } from "../src/lib/devices";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

const LINKED = "0xa11ce00000000000000000000000000000000001";
const LONELY = "0xb0b0000000000000000000000000000000000002";

async function main() {
  await kv.set(`dev:list:${LINKED}`, [
    { id: "d1", hash: "h", name: "BlueCube", kind: "cube", createdAt: Date.now(), expiresAt: Date.now() + 86_400_000 },
  ]);

  console.log("§1 no device, no write");
  await noteAgentStart(LONELY, ["hub_hood_live"]);
  ok("unlinked wallet: nothing stored", (await kv.get(`dev:agent:${LONELY}`)) == null);
  const idle = await readAgentState(LONELY);
  ok("unlinked wallet reads idle", !!idle && !idle.thinking && !idle.active && idle.next_poll_s === null);

  console.log("§2 start / end");
  const t0 = Date.now();
  await noteAgentStart(LINKED, ["hub_hood_live", "blue_swap_tx"], t0);
  const s1 = await readAgentState(LINKED, t0 + 1000);
  ok("start → thinking", !!s1 && s1.thinking && s1.active && s1.next_poll_s === AGENT_POLL_S);
  ok("label names the first tool and the rest", s1?.label === "Running hood live +1", String(s1?.label));
  await noteAgentEnd(LINKED, t0 + 5000);
  const s2 = await readAgentState(LINKED, t0 + 6000);
  ok("end → not thinking, still active (keep polling a while)", !!s2 && !s2.thinking && s2.active && s2.label === null);

  console.log("§3 a turn that never ended");
  const stuck = agentStateOf({ label: "Running x", startedAt: 0 }, MAX_TURN_S * 1000 + 1);
  ok("thinking expires after MAX_TURN_S", !stuck.thinking);

  console.log("§4 active window closes");
  const done = agentStateOf({ label: "x", startedAt: 0, endedAt: 1 }, ACTIVE_WINDOW_S * 1000 + 2);
  ok("inactive → stop fast polling", !done.active && done.next_poll_s === null);
  ok("no record → idle", JSON.stringify(agentStateOf(null)) === '{"thinking":false,"label":null,"active":false,"next_poll_s":null}');

  console.log("§1b labels");
  for (const names of [[], ["hub_a_really_long_tool_name_here"], ["mcp__github_search", "x", "y"], ["check_wallet"]]) {
    const l = agentLabel(names);
    ok(`label ${JSON.stringify(names)} ≤ 21 chars`, l.length <= 21, l);
  }
  ok("no tools → Thinking", agentLabel([]) === "Thinking");
  ok("outside a request scope, markAgentTurn does not throw", (() => { try { markAgentTurn(LINKED, ["x"]); return true; } catch { return false; } })());
  ok("no wallet → no-op", (() => { try { markAgentTurn(undefined, ["x"]); return true; } catch { return false; } })());

  console.log("§5 tones");
  ok("confirmed trade → good", itemTone({ kind: "trade", title: "Trade confirmed" }) === "good");
  ok("reverted trade → alert", itemTone({ kind: "trade", title: "Trade reverted" }) === "alert");
  ok("refused by pre-trade check → alert", itemTone({ kind: "trade_refused" as never, title: "Trade refused by the pre-trade check" }) === "alert");
  ok("fired watch → warn", itemTone({ kind: "alert", title: "Price alert fired" }) === "warn");
  ok("pending → info", itemTone({ kind: "trade", title: "Trade pending" }) === "info");

  console.log("§6 device kind");
  ok("cube is a device kind", (DEVICE_KINDS as readonly string[]).includes("cube"));
  ok("unnamed cube is called BlueCube", cleanDeviceName("", "cube") === "BlueCube");

  console.log("§7 cube is read-only");
  ok("grantForKind(cube) drops chat + alerts", JSON.stringify(grantForKind("cube", { scopes: ["read", "chat", "alerts"] })) === '{"scopes":["read"]}');
  ok("grantForKind(mac) keeps them", JSON.stringify(grantForKind("mac", { scopes: ["read", "chat", "alerts"] })) === '{"scopes":["read","chat","alerts"]}');
  const OWNER = "0xc0be000000000000000000000000000000000003";
  for (const kind of ["cube", "mac"] as const) {
    const started = await startDeviceLink(kind === "cube" ? "BlueCube" : "BlueBot for Mac", kind);
    if ("error" in started) { ok(`${kind}: link started`, false, started.error); continue; }
    await approveCode(started.userCode, OWNER, { scopes: ["read", "chat", "alerts"] });
    const tok = await pollForToken(started.deviceCode);
    const scopes = "status" in tok && tok.status === "issued" ? tok.device.scopes : null;
    ok(`${kind}: approved with chat+alerts asked → token scopes ${JSON.stringify(scopes)}`,
      JSON.stringify(scopes) === (kind === "cube" ? '["read"]' : '["read","chat","alerts"]'));
  }

  if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
  console.log("\ndevice-agent-test: all passed");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
