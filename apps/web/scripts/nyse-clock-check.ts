/**
 * Prove the NYSE clock against instants whose New York answer is known
 * independently of this code.
 *
 * Run: `cd apps/web && npx tsx scripts/nyse-clock-check.ts`
 *
 * The instants are chosen for the two failures the fixed-UTC-4 version could
 * not survive: the hour after the EST switch (once the regular session and
 * once after it), and a published holiday that falls on a weekday.
 *
 * `old` is what the shipped helper answered before this change, kept here as a
 * witness: if a future refactor reintroduces a fixed offset, the diff column
 * shows it again instead of the test quietly passing.
 */
import { nyseMarketStatus, nyUtcOffsetHours } from "@/lib/market-hours";

let failures = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}  want=${JSON.stringify(want)} got=${JSON.stringify(got)}`);
}

/** The old implementation, verbatim in behaviour: fixed UTC-4. */
function oldStatus(now: Date) {
  const ny = new Date(now.getTime() - 4 * 3600 * 1000);
  const day = ny.getUTCDay();
  const minutes = ny.getUTCHours() * 60 + ny.getUTCMinutes();
  if (day === 0 || day === 6) return "weekend";
  if (minutes < 9 * 60 + 30) return "premarket";
  if (minutes >= 16 * 60) return "afterhours";
  return "regular";
}

const CASES: Array<[string, string, string, boolean]> = [
  // [label, iso instant, expected session, expected is_open]
  ["EDT open, 09:30 ET Wed", "2026-07-15T13:30:00Z", "regular", true],
  ["EDT premarket, 09:29 ET Wed", "2026-07-15T13:29:00Z", "premarket", false],
  ["EST premarket, 09:00 ET Fri", "2026-11-13T14:00:00Z", "premarket", false],
  ["EST open, 09:30 ET Fri", "2026-11-13T14:30:00Z", "regular", true],
  ["EST mid, 15:30 ET Fri", "2026-11-13T20:30:00Z", "regular", true],
  ["EST close, 16:00 ET Fri", "2026-11-13T21:00:00Z", "afterhours", false],
  ["EST 20:19 ET Fri (after-hours done)", "2026-11-14T01:19:00Z", "afterhours", false],
  ["Saturday in New York", "2026-11-14T15:00:00Z", "weekend", false],
  ["Thanksgiving Thu 10:00 ET", "2026-11-26T15:00:00Z", "holiday", false],
  ["Day after Thanksgiving 10:00 ET", "2026-11-27T15:00:00Z", "regular", true],
  ["Early close day 13:30 ET", "2026-11-27T18:30:00Z", "afterhours", false],
  ["Christmas Day", "2026-12-25T15:00:00Z", "holiday", false],
];

console.log("label | session | old session | offset | is_open | calendar_known");
for (const [label, iso, wantSession, wantOpen] of CASES) {
  const d = new Date(iso);
  const s = nyseMarketStatus(d);
  const old = oldStatus(d);
  const tz = s.utc_offset_hours === -5 ? "EST" : "EDT";
  console.log(
    `${label} | ${s.session} | ${old}${old !== s.session ? " <-- differed" : ""} | UTC-${-s.utc_offset_hours} ${tz} | ${s.is_open} | ${s.calendar_known}`,
  );
  check(label, s.session, wantSession);
  check(`${label} is_open`, s.is_open, wantOpen);
}

// The NY wall clock must read what the label claims: 15:30 ET at 20:30Z in EST.
check("wall clock 20:30Z EST", nyseMarketStatus(new Date("2026-11-13T20:30:00Z")).ny_time_iso, "2026-11-13T15:30:00.000Z");
check("wall clock 13:30Z EDT", nyseMarketStatus(new Date("2026-07-15T13:30:00Z")).ny_time_iso, "2026-07-15T09:30:00.000Z");
check("offset at 2026-07-15", nyUtcOffsetHours(new Date("2026-07-15T13:30:00Z")), 4);
check("offset at 2026-11-13", nyUtcOffsetHours(new Date("2026-11-13T20:30:00Z")), 5);
check("calendar unknown past 2028", nyseMarketStatus(new Date("2029-03-14T15:00:00Z")).calendar_known, false);

console.log(failures === 0 ? "\nALL NYSE CLOCK CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
