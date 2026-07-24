/**
 * P0 dry-run — proves PR #220 is safe to merge.
 *
 * 1. VOID backfill preview: fetches prod arrows and applies the exact
 *    same logic as `backfillVoidGrades()`. Prints hit rate before + after.
 * 2. OPEN arrows preview: for every currently-open drift/arb arrow,
 *    shows wall-clock hours elapsed vs the new REGULAR-SESSION hours
 *    elapsed so a reader can see how the market-aware clock changes
 *    each arrow's next grade-attempt time.
 *
 * Read-only. Does NOT hit KV. Uses public /api/hood/arrows on prod.
 *
 * Run: cd apps/web && npx tsx scripts/p0-dry-run.ts
 */

// ── COPY of PR #220 helpers, verbatim, so the script IS the code ─────────
const REGULAR_OPEN_MIN = 9 * 60 + 30;
const REGULAR_CLOSE_MIN = 16 * 60;

function nyseOpenAt(tMs: number): boolean {
  const ny = new Date(tMs - 4 * 3600 * 1000);
  const day = ny.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minutes = ny.getUTCHours() * 60 + ny.getUTCMinutes();
  return minutes >= REGULAR_OPEN_MIN && minutes < REGULAR_CLOSE_MIN;
}

function regularHoursElapsed(fireIso: string, nowMs: number): number {
  const fireMs = new Date(fireIso).getTime();
  if (!Number.isFinite(fireMs) || nowMs <= fireMs) return 0;
  const STEP = 5 * 60 * 1000;
  let acc = 0;
  for (let t = fireMs; t < nowMs; t += STEP) {
    if (nyseOpenAt(t)) acc += STEP;
  }
  return acc / 3_600_000;
}

// ── Fetch prod arrows ────────────────────────────────────────────────────

interface Arrow {
  id: string;
  serial: string;
  ticker: string;
  type: "drift" | "arb" | "flow" | "whale";
  status: "open" | "graded" | "informational";
  outcome: "hit" | "miss" | "void" | "informational" | null;
  grading_window_h: number;
  fired_at: string;
  graded_at: string | null;
}

async function main() {
  const r = await fetch("https://blueagent.dev/api/hood/arrows?limit=500");
  const j = (await r.json()) as { ok: boolean; arrows: Arrow[] };
  if (!j.ok) { console.error("prod fetch failed"); process.exit(1); }
  const arrows = j.arrows;
  const now = Date.now();

  // ── 1. VOID BACKFILL PREVIEW ───────────────────────────────────────────
  const graded = arrows.filter((a) => a.status === "graded");
  const oldMisses = graded.filter((a) => a.outcome === "miss");
  const oldHits = graded.filter((a) => a.outcome === "hit");
  const oldInfo = graded.filter((a) => a.outcome === "informational");
  const wouldVoid: Arrow[] = [];

  for (const a of graded) {
    if (a.outcome !== "miss") continue;
    if (a.type !== "drift" && a.type !== "arb") continue;
    if (!a.graded_at) continue;
    const gradedMs = new Date(a.graded_at).getTime();
    if (!Number.isFinite(gradedMs)) continue;
    const gradedDuringClosed = !nyseOpenAt(gradedMs);
    const regHrs = regularHoursElapsed(a.fired_at, gradedMs);
    if (gradedDuringClosed && regHrs < 0.5) {
      wouldVoid.push(a);
    }
  }

  const newMissCount = oldMisses.length - wouldVoid.length;
  const oldDenom = oldHits.length + oldMisses.length;
  const newDenom = oldHits.length + newMissCount;
  const oldHitPct = oldDenom > 0 ? Math.round((oldHits.length / oldDenom) * 100) : 0;
  const newHitPct = newDenom > 0 ? Math.round((oldHits.length / newDenom) * 100) : 0;

  console.log("═══ VOID BACKFILL PREVIEW ═══");
  console.log(`total arrows fetched:        ${arrows.length}`);
  console.log(`graded arrows:               ${graded.length}`);
  console.log(`  hits:                      ${oldHits.length}`);
  console.log(`  misses:                    ${oldMisses.length}`);
  console.log(`  informational:             ${oldInfo.length}`);
  console.log(`  already void:              ${graded.filter((a) => a.outcome === "void").length}`);
  console.log();
  console.log(`WOULD be VOIDED by this PR:  ${wouldVoid.length}`);
  console.log(`  → misses after backfill:   ${newMissCount}`);
  console.log();
  console.log(`Hit rate BEFORE (all misses count):   ${oldHits.length}/${oldDenom} = ${oldHitPct}%`);
  console.log(`Hit rate AFTER  (voids excluded):     ${oldHits.length}/${newDenom} = ${newHitPct}%`);
  console.log();

  if (wouldVoid.length > 0) {
    console.log("Voided arrows (up to 20):");
    console.log(`${"serial".padEnd(8)} ${"ticker".padEnd(7)} ${"type".padEnd(6)} ${"fired (ET-ish)".padEnd(20)} ${"graded (ET-ish)".padEnd(20)} reg_hrs`);
    for (const a of wouldVoid.slice(0, 20)) {
      const fireLocal = new Date(new Date(a.fired_at).getTime() - 4 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
      const gradeLocal = a.graded_at ? new Date(new Date(a.graded_at).getTime() - 4 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ") : "—";
      const regHrs = a.graded_at ? regularHoursElapsed(a.fired_at, new Date(a.graded_at).getTime()).toFixed(2) : "?";
      console.log(`${a.serial.padEnd(8)} ${a.ticker.padEnd(7)} ${a.type.padEnd(6)} ${fireLocal.padEnd(20)} ${gradeLocal.padEnd(20)} ${regHrs}`);
    }
    if (wouldVoid.length > 20) console.log(`  … and ${wouldVoid.length - 20} more`);
  }

  // ── 2. OPEN ARROWS UNDER NEW CLOCK ─────────────────────────────────────
  const openArrows = arrows.filter((a) => a.status === "open");
  const openDriftArb = openArrows.filter((a) => a.type === "drift" || a.type === "arb");

  console.log("\n═══ OPEN ARROWS UNDER NEW MARKET-AWARE CLOCK ═══");
  console.log(`open arrows total:              ${openArrows.length}`);
  console.log(`  drift/arb (affected):         ${openDriftArb.length}`);
  console.log(`  flow/whale (wall-clock kept): ${openArrows.length - openDriftArb.length}`);
  console.log();

  if (openDriftArb.length > 0) {
    console.log(`Effect on drift/arb open arrows (wall-clock vs new regular-session clock):`);
    console.log(`${"serial".padEnd(8)} ${"ticker".padEnd(7)} ${"type".padEnd(6)} ${"window".padEnd(7)} ${"wall_hrs".padEnd(10)} ${"reg_hrs".padEnd(9)} ${"ready?".padEnd(8)} status`);
    let readyNow = 0, willWait = 0;
    for (const a of openDriftArb) {
      const fireMs = new Date(a.fired_at).getTime();
      const wallHrs = (now - fireMs) / 3_600_000;
      const regHrs = regularHoursElapsed(a.fired_at, now);
      const readyOld = wallHrs >= a.grading_window_h;
      const readyNew = regHrs >= a.grading_window_h;
      let status = "";
      if (readyOld && readyNew) { status = "grade both"; readyNow++; }
      else if (readyOld && !readyNew) { status = "OLD graded ↦ WAITS under new"; willWait++; }
      else if (!readyOld && readyNew) { status = "impossible?"; }
      else { status = "stays open (both clocks agree)"; }
      console.log(`${a.serial.padEnd(8)} ${a.ticker.padEnd(7)} ${a.type.padEnd(6)} ${(a.grading_window_h + "h").padEnd(7)} ${wallHrs.toFixed(2).padEnd(10)} ${regHrs.toFixed(2).padEnd(9)} ${(readyNew ? "yes" : "no").padEnd(8)} ${status}`);
    }
    console.log();
    console.log(`Ready to grade under new clock:      ${readyNow}`);
    console.log(`Would have been graded (old clock)`);
    console.log(`   but now WAITS for regular hours:  ${willWait}`);
  }

  console.log("\n═══ END OF DRY RUN ═══");
}

main().catch((e) => { console.error(e); process.exit(1); });
