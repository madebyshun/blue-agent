/**
 * devices-test — BlueBot linking (lib/devices.ts), the parts that need no KV:
 * code format and normalisation, name cleaning, token shape, and the line
 * that must hold — a device token is never accepted as a session.
 */
import { NextRequest } from "next/server";
import { cleanDeviceName, isTokenShaped, newUserCode, normalizeUserCode, readDeviceToken, sha256 } from "../src/lib/devices";
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

  console.log(failures === 0 ? "\ndevices-test: PASS" : `\ndevices-test: FAIL — ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
