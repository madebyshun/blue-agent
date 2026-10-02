/**
 * devices-test — BlueBot linking (lib/devices.ts), the parts that need no KV:
 * code format and normalisation, name cleaning, token shape, and the line
 * that must hold — a device token is never accepted as a session. Then
 * scopes (2026-10-02): the grant can only narrow, a pre-scope token is read
 * only, and a route names the scope it needs. The full link flow
 * runs against the in-memory KV fallback, so it is skipped if a real KV is
 * configured in the environment.
 */
import { NextRequest } from "next/server";
import {
  addDeviceSpend, approveCode, cleanDeviceName, cleanGrant, deviceScopes, deviceSpentToday, hasScope, isTokenShaped,
  newUserCode, normalizeUserCode, pollForToken, readDeviceToken, sha256, startDeviceLink, DEFAULT_CHAT_CAP, MAX_CHAT_CAP,
  type DeviceRecord,
} from "../src/lib/devices";
import { requireDevice } from "../src/lib/device-auth";
import { sessionToken } from "../src/lib/session";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

async function main() {
  console.log("1. user codes");
  const codes = Array.from({ length: 500 }, () => newUserCode());
  ok("format XXXX-XXXX from the safe alphabet", codes.every((c) => /^[BCDFGHJKLMNPQRSTVWXZ2-9]{4}-[BCDFGHJKLMNPQRSTVWXZ2-9]{4}$/.test(c)), codes[0]);
  ok("no look-alikes or vowels ever", codes.every((c) => !/[AEIOUY01]/.test(c)));
  ok("codes vary", new Set(codes).size > 490);
  ok("lower case and spaces normalise", normalizeUserCode("bcdf gh23") === "BCDF-GH23");
  ok("no dash normalises", normalizeUserCode("BCDFGH23") === "BCDF-GH23");
  ok("a vowel is refused", normalizeUserCode("BCDA-GH23") === null);
  ok("wrong length is refused", normalizeUserCode("BCDF-GH2") === null && normalizeUserCode("BCDF-GH234") === null);
  ok("non-strings are refused", normalizeUserCode(42) === null && normalizeUserCode(undefined) === null);

  console.log("2. device names");
  ok("blank → default by kind", cleanDeviceName("  ", "mac") === "BlueBot for Mac" && cleanDeviceName(null, "bot") === "BlueBot");
  ok("markup and control chars are stripped", cleanDeviceName("<b>Shun's\u0007 Mac</b>", "mac") === "bShun's Mac/b");
  ok("capped at 40 chars", cleanDeviceName("x".repeat(100), "mac").length === 40);

  console.log("3. tokens");
  const tok = `bbt_${"a".repeat(64)}`;
  ok("token shape", isTokenShaped(tok) && !isTokenShaped(`bbt_${"g".repeat(64)}`) && !isTokenShaped("a".repeat(64)));
  ok("only the hash is a KV key (64 hex)", /^[0-9a-f]{64}$/.test(sha256(tok)) && sha256(tok) !== tok);
  ok("no header → invalid, no KV read", (await readDeviceToken(null)).status === "invalid");
  ok("a session-shaped token is not a device token", (await readDeviceToken(`Bearer ${"a".repeat(64)}`)).status === "invalid");

  console.log("4. a device token is never a session");
  const asHeader = new NextRequest("https://app.blueagent.dev/api/chat", { headers: { "x-blue-session": tok } });
  ok("x-blue-session: bbt_… is ignored", sessionToken(asHeader) === null);
  const asCookie = new NextRequest("https://app.blueagent.dev/api/chat", { headers: { cookie: `blue_session=${tok}` } });
  ok("cookie blue_session=bbt_… is ignored", sessionToken(asCookie) === null);

  console.log("5. scopes");
  ok("read is always granted", cleanGrant([], 500).scopes.join() === "read");
  ok("asked scopes are kept", cleanGrant(["alerts", "chat"], 500).scopes.join() === "read,chat,alerts");
  ok("unknown scopes are dropped, never widened", cleanGrant(["admin", "sign", "chat"], 1).scopes.join() === "read,chat");
  ok("cap clamps to [0, MAX]", cleanGrant(["chat"], 99_999).chatDailyCap === MAX_CHAT_CAP && cleanGrant(["chat"], -5).chatDailyCap === 0);
  ok("garbage cap → default", cleanGrant(["chat"], "lots").chatDailyCap === DEFAULT_CHAT_CAP);
  ok("a pre-scope token is read-only", deviceScopes({}).join() === "read" && !hasScope({}, "chat") && !hasScope({}, "alerts"));

  if (process.env.KV_REST_API_URL) {
    console.log("6. link flow — SKIPPED (a real KV is configured)");
  } else {
    console.log("6. link flow on the in-memory KV");
    const wallet = `0x${"3".repeat(40)}`;
    const start = await startDeviceLink("Test Mac", "mac");
    ok("a code is issued", "userCode" in start);
    if ("userCode" in start) {
      const ap = await approveCode(start.userCode, wallet, cleanGrant(["chat"], 500));
      ok("approve with chat + cap", "ok" in ap);
      const t = await pollForToken(start.deviceCode);
      ok("token issued once", t.status === "issued");
      ok("a second poll gets nothing", (await pollForToken(start.deviceCode)).status === "expired");
      if (t.status === "issued") {
        const dev: DeviceRecord = t.device;
        ok("scopes travel to the token", dev.scopes?.join() === "read,chat" && dev.chatDailyCap === 500);
        const req = (p: string) => new Request(`https://app.blueagent.dev${p}`, { headers: { authorization: `Bearer ${t.token}` } });
        ok("chat scope → allowed", !("res" in (await requireDevice(req("/api/devices/chat"), "chat"))));
        const denied = await requireDevice(req("/api/watches"), "alerts");
        ok("alerts NOT granted → 403 DEVICE_SCOPE", "res" in denied && denied.res.status === 403);
        ok("spend starts at 0", (await deviceSpentToday(dev.id)) === 0);
        await addDeviceSpend(dev.id, 50); await addDeviceSpend(dev.id, 12); await addDeviceSpend(dev.id, -12);
        ok("spend adds and gives back", (await deviceSpentToday(dev.id)) === 50);

      }
    }
  }

  console.log(failures === 0 ? "\ndevices-test: PASS" : `\ndevices-test: FAIL — ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
