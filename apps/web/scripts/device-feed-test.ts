/**
 * device-feed-test — what a linked BlueCube / BlueBot reads.
 *
 *   §5  feed item tones come from fields the item already has
 *   §6  the cube is a first-class device kind
 *   §7  a cube is capped at `read` on the server, whatever the page asks for
 *
 * Hermetic: KV env cleared (in-memory store), no network.
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
  delete process.env[k];
}

import { itemTone } from "../src/lib/device-feed";
import { DEVICE_KINDS, cleanDeviceName, grantForKind, startDeviceLink, approveCode, pollForToken } from "../src/lib/devices";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

async function main() {
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
  console.log("\ndevice-feed-test: all passed");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
