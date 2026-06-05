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

  // Redirect public /hub, /market, /sentinel → in-app versions
  if (pathname === "/hub" || pathname === "/hub/") {
    return NextResponse.redirect(new URL("/app/hub", request.url), { status: 301 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
