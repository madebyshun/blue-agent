// /openapi.json — the same spec as /.well-known/openapi.json, at the root path
// agent-readiness checkers look for first (Circle's agents.circle.com/sell/score
// scored blueagent.dev 0/100 on 2026-11-05 because only the .well-known path
// existed). One spec, two URLs: this re-exports the handler, nothing is copied.
export { GET } from "../.well-known/openapi.json/route";

export const runtime = "nodejs";
export const revalidate = 3600;
