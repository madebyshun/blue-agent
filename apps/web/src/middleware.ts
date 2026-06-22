import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const { pathname } = request.nextUrl;

  // Redirect docs subdomain → Mintlify
  if (host.startsWith("docs.blueagent.dev")) {
    const url = request.nextUrl.clone();
    const path = url.pathname + url.search;
    return NextResponse.redirect(
      `https://mbs-001decf1.mintlify.app${path}`,
      { status: 301 }
    );
  }

  // Redirect public /hub, /market, /sentinel → in-app versions.
  // Preserve the query string so deep links like /hub?tool=blue-idea survive.
  if (pathname === "/hub" || pathname === "/hub/") {
    return NextResponse.redirect(new URL(`/app/hub${request.nextUrl.search}`, request.url), { status: 301 });
  }

  // ── BlueBank private preview gate ──────────────────────────────────────────
  // BlueBank (/app/bank) and its public /pay payment surface aren't GA yet. On
  // production they stay blocked — EXCEPT for someone holding the preview token:
  // visiting /app/bank?key=<BANK_PREVIEW_TOKEN> sets an unlock cookie, then the
  // surface is reachable on the real domain without ever listing it publicly.
  // Everyone else is redirected to chat (same as before). Local dev
  // (NODE_ENV !== "production") leaves BlueBank fully open for testing.
  // NOTE: this gate lives in middleware, not next.config redirects, because
  // config redirects run BEFORE middleware and can't be conditionally bypassed.
  const isBankSurface =
    ((pathname === "/app/bank" || pathname.startsWith("/app/bank/")) &&
    pathname !== "/app/bank/access") ||
    pathname === "/pay" || pathname.startsWith("/pay/");
  if (isBankSurface && process.env.NODE_ENV === "production") {
    const token = process.env.BANK_PREVIEW_TOKEN;
    const COOKIE = "bank_preview";
    const unlocked = !!token && request.cookies.get(COOKIE)?.value === token;
    const queryKey = request.nextUrl.searchParams.get("key");

    // Valid ?key=<token> → drop the unlock cookie, bounce to the clean URL.
    if (token && queryKey && queryKey === token) {
      const clean = request.nextUrl.clone();
      clean.searchParams.delete("key");
      const res = NextResponse.redirect(clean);
      res.cookies.set(COOKIE, token, {
        httpOnly: true, secure: true, sameSite: "lax",
        path: "/", maxAge: 60 * 60 * 24 * 30, // 30 days
      });
      return res;
    }
    // No valid cookie (or token not configured) → show Early Access page.
    if (!unlocked) {
      return NextResponse.redirect(new URL("/app/bank/access", request.url));
    }
    // Unlocked — fall through to the app.
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
