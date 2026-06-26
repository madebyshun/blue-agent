import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const APP_HOST = "app.blueagent.dev";

// Top-level segments that belong to the in-app surface (src/app/app/*). On the
// app subdomain these are served from the internal /app/* tree while the URL
// stays clean (app.blueagent.dev/chat → renders src/app/app/chat). Everything
// else (/pay, /docs, public assets) is a real root route and is served as-is.
const APP_SEGMENTS = new Set([
  "alerts",
  "b20",
  "bank",
  "chat",
  "dashboard",
  "feed",
  "hub",
  "launches",
  "profile",
  "rewards",
  "terminal",
]);

// BlueBank private preview gate. BlueBank and its public /pay payment surface
// aren't GA yet — on production they stay blocked EXCEPT for someone holding the
// preview token (?key=<BANK_PREVIEW_TOKEN> sets an unlock cookie). `accessUrl`
// is host-aware so we bounce to the right (clean vs /app) Early Access page.
// NOTE: this gate lives in middleware, not next.config redirects, because config
// redirects run BEFORE middleware and can't be conditionally bypassed.
function bankGate(
  request: NextRequest,
  isBankSurface: boolean,
  accessUrl: string,
): NextResponse | null {
  if (!isBankSurface || process.env.NODE_ENV !== "production") return null;
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
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    return res;
  }
  // No valid cookie (or token not configured) → show Early Access page.
  if (!unlocked) {
    return NextResponse.redirect(new URL(accessUrl, request.url));
  }
  // Unlocked — fall through to the app.
  return null;
}

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

  const isAppHost = host.startsWith(APP_HOST);
  const firstSeg = pathname.split("/")[1] || "";

  // ── app.blueagent.dev ──────────────────────────────────────────────────────
  // Serve the in-app surface from a clean, /app-less URL on the subdomain.
  if (isAppHost) {
    // API + framework internals + static files (anything with a dot) pass through.
    if (
      pathname.startsWith("/api") ||
      pathname.startsWith("/_next") ||
      pathname.includes(".")
    ) {
      return NextResponse.next();
    }

    // Legacy /app/* links → strip the prefix so the canonical URL stays clean.
    if (pathname === "/app" || pathname.startsWith("/app/")) {
      const clean = request.nextUrl.clone();
      clean.pathname = pathname.replace(/^\/app/, "") || "/";
      return NextResponse.redirect(clean, { status: 301 });
    }

    // BlueBank preview gate (clean URL /bank == internal /app/bank).
    const isBankSurface =
      ((pathname === "/bank" || pathname.startsWith("/bank/")) &&
        pathname !== "/bank/access") ||
      pathname === "/pay" ||
      pathname.startsWith("/pay/");
    const gate = bankGate(request, isBankSurface, "/bank/access");
    if (gate) return gate;

    // Root of the app host → Blue Chat (product home). Rewrite straight to
    // /app/chat so the URL stays "/" with no redirect hop through /app.
    if (pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/app/chat";
      return NextResponse.rewrite(url);
    }

    // Known app segment → render from the internal /app/* tree (URL stays clean).
    if (APP_SEGMENTS.has(firstSeg)) {
      const url = request.nextUrl.clone();
      url.pathname = `/app${pathname}`;
      return NextResponse.rewrite(url);
    }

    // Anything else (/pay, /docs, public assets) is a real root route — serve as-is.
    return NextResponse.next();
  }

  // ── blueagent.dev (main host) ───────────────────────────────────────────────
  // Move the in-app surface to the subdomain; keep old deep links alive via 301.
  if (pathname === "/app" || pathname.startsWith("/app/")) {
    const clean = pathname.replace(/^\/app/, "") || "/";
    return NextResponse.redirect(
      `https://${APP_HOST}${clean}${request.nextUrl.search}`,
      { status: 301 }
    );
  }

  // Public /hub → app Hub on the subdomain (preserve query, e.g. ?tool=blue-idea).
  if (pathname === "/hub" || pathname === "/hub/") {
    return NextResponse.redirect(
      `https://${APP_HOST}/hub${request.nextUrl.search}`,
      { status: 301 }
    );
  }

  // BlueBank public /pay gate stays on the main host too (defensive).
  const isBankSurface = pathname === "/pay" || pathname.startsWith("/pay/");
  const gate = bankGate(request, isBankSurface, "/app/bank/access");
  if (gate) return gate;

  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
