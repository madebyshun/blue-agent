/**
 * Cron: the weekend scorecard + Blue's weekend book (lib/weekend/*).
 *
 * Runs hourly Sunday–Wednesday UTC and does whichever step is due:
 *   1. CALL  — Sunday 22:00–23:59 UTC, once per weekend: read the archive's
 *      Sunday 22:00 point for the Base desk, store it as the pending call, and
 *      open the diary entry (positions decided by code, note by the model).
 *   2. GRADE — once the next regular-session open has an oracle round, grade the
 *      pending call and close the diary entry.
 * `?backfill=1` (and the first run, while the record is empty) grades every
 * archived weekend not yet on record (no diary entries: the book is forward-only). One KV read + one write per run.
 * Auth: `Authorization: Bearer $CRON_SECRET` (what Vercel Cron sends).
 */
import { NextRequest, NextResponse } from "next/server";
import {
  CALL_HOUR_UTC,
  callInstant,
  callFromArchive,
  fridayOf,
  gradeCall,
  loadStore,
  saveStore,
} from "@/lib/weekend/scorecard";
import { closeEntry, openEntry } from "@/lib/weekend/diary";
import { refreshSessionVolume } from "@/lib/weekend/sessions";
import { BASE_SERIES_ARCHIVE_START } from "@/lib/blue-hood/kv-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date();
  const log: string[] = [];
  let changed = false;
  try {
    const store = await loadStore();
    if (store === "error") return NextResponse.json({ error: "KV unreadable; nothing written" }, { status: 503 });
    const known = new Set([...store.weekends.map((w) => w.friday), ...(store.pending ? [store.pending.friday] : [])]);

    // 1. CALL
    if (now.getUTCDay() === 0 && now.getUTCHours() >= CALL_HOUR_UTC) {
      const friday = fridayOf(now);
      if (!known.has(friday)) {
        const call = await callFromArchive(friday);
        if (call && call.rows.length) {
          store.pending = { ...call, source: "live" };
          store.diary.push(await openEntry(store.pending, now));
          known.add(friday);
          changed = true;
          log.push(`call ${friday}: ${call.rows.length} rows, ${call.excluded.length} excluded`);
        } else {
          log.push(`call ${friday}: archive point for Sunday ${CALL_HOUR_UTC}:00 UTC not found yet`);
        }
      }
    }

    // 2. GRADE
    if (store.pending) {
      const graded = await gradeCall(store.pending, now);
      if (graded) {
        store.weekends.push(graded);
        const i = store.diary.findIndex((e) => e.friday === graded.friday && !e.closed_at);
        if (i >= 0) store.diary[i] = await closeEntry(store.diary[i], graded, now);
        log.push(`graded ${graded.friday}: ${graded.rows.length} rows, ${graded.ungraded.length} ungraded`);
        store.pending = null;
        changed = true;
      } else {
        log.push(`pending ${store.pending.friday}: open not on record yet`);
      }
    }

    // 3. BACKFILL
    // Missing weekends are filled every run (last 3 weeks); the first run and
    // ?backfill=1 walk the whole archive.
    const full = req.nextUrl.searchParams.get("backfill") === "1" || store.weekends.length === 0;
    {
      const start = `${BASE_SERIES_ARCHIVE_START.slice(0, 4)}-${BASE_SERIES_ARCHIVE_START.slice(4, 6)}-${BASE_SERIES_ARCHIVE_START.slice(6)}`;
      let f = start;
      while (new Date(f).getUTCDay() !== 5) f = addDays(f, 1);
      // Every weekend whose Sunday call time has passed; the current one too,
      // once its call is due (fridayOf(Wednesday) is the weekend just graded).
      // Hourly runs only look back 3 weeks, so a weekend that can never be
      // graded costs nothing forever; ?backfill=1 walks the whole archive.
      const floor = full ? "" : addDays(now.toISOString().slice(0, 10), -21);
      for (; callInstant(f).getTime() < now.getTime(); f = addDays(f, 7)) {
        if (known.has(f) || f < floor) continue;
        const call = await callFromArchive(f);
        if (!call || !call.rows.length) { log.push(`backfill ${f}: no Sunday call point`); continue; }
        const graded = await gradeCall(call, now);
        if (graded) { store.weekends.push(graded); changed = true; log.push(`backfill ${f}: ${graded.rows.length} rows`); }
        else log.push(`backfill ${f}: open not found`);
      }
    }

    if (changed) await saveStore(store);

    // 4. SESSION VOLUME: weekly, from Monday on (its own KV key and write).
    if (now.getUTCDay() !== 0) {
      try { log.push(await refreshSessionVolume(now, now.getTime() + 200_000)); } catch (e) { log.push(`sessions failed: ${(e as Error).message.slice(0, 120)}`); }
    }
    return NextResponse.json({ status: "ok", changed, log });
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    console.error(`[cron:weekend] ${msg}`);
    return NextResponse.json({ error: msg, log }, { status: 500 });
  }
}

export const POST = GET;
