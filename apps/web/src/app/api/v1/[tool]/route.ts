/**
 * /api/v1/[tool] — legacy alias for /api/x402/[tool]
 *
 * Kept for backward compatibility with @blueagent/skill (published on npm)
 * and any external consumers that linked the older URL. The canonical
 * endpoint is /api/x402/[tool]; this re-exports the same POST handler so
 * both URLs behave identically (verify → run → settle via Coinbase CDP).
 */
export { POST } from "@/app/api/x402/[tool]/route";

export const runtime = "nodejs";
export const maxDuration = 30; // legacy alias — tools complete well under 30s
