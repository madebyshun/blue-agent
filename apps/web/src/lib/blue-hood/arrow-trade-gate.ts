/**
 * Server half of ARROW_TRADE_ENABLED (`arrow-freeze.ts`), kept in its own file
 * so the client components that read the flag never import `next/server`.
 *
 * Three routes exist only for the Review & Sign panel — `/api/hood/trade/quote`,
 * `/api/hood/trade/prepare` and `/api/hood/arrows/[id]/user-action`. Hiding the
 * button does not close them: quote/prepare are free proxies over the paid
 * `rh-stock-swap-*` x402 tools (via the internal bypass), and user-action is an
 * unauthenticated write. With no caller left they would be exactly the kind of
 * surface CLAUDE.md's retirement law is about — maintained by nobody, reachable
 * by anyone. So the same switch that hides the panel closes all three.
 */
import { NextResponse } from "next/server";

export function arrowTradeDisabledResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "arrow_trade_disabled",
      detail:
        "Trading straight from a Blue Hood signal is off (2026-09-30). Swap in Wallet or Chat instead.",
    },
    { status: 410 },
  );
}
