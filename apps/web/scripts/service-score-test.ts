// Pins lib/service-score: no score under MIN_RUNS, Wilson ordering, hard-mapped verdicts.
import assert from "node:assert/strict";
import { scoreService, MIN_RUNS } from "../src/lib/service-score";

const t = (settled: number, notCharged: number, ms = 0, timed = 0) => ({ settled, notCharged, units: 0, ms, timed });

assert.equal(scoreService(undefined).verdict, "insufficient data");
assert.equal(scoreService(t(MIN_RUNS - 1, 0)).score, null, "few runs must not get a score");
const small = scoreService(t(5, 0)).score!;
const big = scoreService(t(196, 4)).score!;
assert.ok(big > small, `196/200 (${big}) must outrank 5/5 (${small})`);
assert.equal(scoreService(t(196, 4)).verdict, "reliable");
assert.equal(scoreService(t(10, 10)).verdict, "unreliable");
assert.equal(scoreService(t(10, 0, 3000, 3)).avgMs, 1000);
console.log("service-score-test: ok");
