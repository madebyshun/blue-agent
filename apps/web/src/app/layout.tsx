import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import Providers from "@/components/Providers";
import { TOOL_COUNT } from "@/lib/agent-tools";

const SITE = "https://blueagent.dev";
const TITLE = "BlueAgent — The onchain Agent OS";
/* 🔴 Said "live Base intelligence" until 2026-09-26 — ONE chain, in the string
   every link unfurl on the whole site quotes. Hard rule #1: state the chain,
   and there are two.
   MEASURED the same day, and this is the part worth keeping: `/docs/page.tsx`
   exports its own two-chain `metadata.description`, it deployed green, and
   `curl https://blueagent.dev/docs` STILL served the one-chain copy in
   `og:description` and `twitter:description`. Next.js merges `metadata`
   shallowly per top-level field — a page-level `description` replaces only
   `<meta name="description">`; `openGraph` and `twitter` are separate fields and
   keep inheriting THIS constant untouched. So the tag a human reads was fixed
   while the three tags Twitter, Discord and Farcaster actually render were not,
   and the page-level diff looked complete from the source.
   Two consequences. (1) Fix site-wide copy HERE, not page by page — a page
   override buys you one tag out of four. (2) Overriding `openGraph` on a page is
   not the cheap patch it looks like: setting `openGraph: { description }` drops
   the root's `images`/`url`/`siteName` with it, so /docs would silently lose its
   OG image. Left inheriting on purpose.
   Verify by content, never by deploy status — but `curl -s <url> | grep -c` is
   NOT enough on its own, and this comment said it was for about two hours.
   `/app/chat` 301s to app.blueagent.dev, so without `-L` curl returns an empty
   body, every `grep -c` returns 0, and a "this string must be GONE" assertion
   passes for free on a page it never read. An absence check that passes on an
   empty body is not a check. Use `-L`, and assert the body is large before
   trusting a zero:
     body=$(curl -sL "$url"); [ ${#body} -gt 2000 ] || echo "empty, check is void"
   🔴 That byte floor is NOT sufficient either — measured 2026-09-26, about two
   hours after this comment prescribed it. Polling a deploy in a tight loop
   tripped Vercel's own bot mitigation, and from request #7 onward EVERY path on
   the domain answered `403 text/html` + `x-vercel-mitigated: challenge` with a
   33,972-byte "Vercel Security Checkpoint" page. (Before that, requests #1–#6 of
   the same loop returned a real 96,777-byte `image/png`, so the loop broke
   itself mid-run.) That body is not empty, so `> 2000` passes; it does not
   contain the old copy, so `grep -c` returns 0; so the recipe above reports "the
   fix is live" about a page that was never served. Verifying harder is what
   causes it.
   Check the STATUS, and assert a string you expect to be PRESENT — an
   absence-only check cannot tell your page apart from someone else's error page:
     out=$(curl -sL -w '\n%{http_code}' "$url"); code=${out##*$'\n'}
     [ "$code" = 200 ] || echo "http $code — check is void"
   Once challenged, STOP curling: the 403 is keyed to the caller, so retrying
   only extends it. Read the deploy state from the Vercel API, or fetch through
   different egress (the WebFetch tool) — which is how the two-chain copy above
   was finally confirmed live. Never attempt to satisfy the challenge itself.
   (`scripts/link-liveness-check.ts` does not have either hole — it resolves
   paths against the route tree statically and never fetches. Both traps are
   specific to ad-hoc post-deploy greps.) */
const DESCRIPTION =
  `${TOOL_COUNT} x402 tools, pay per call in USDC with no API key. Agent chat that hands you transactions to sign, plus live reads on Base 8453 and Robinhood Chain 4663.`;

// Farcaster v2 mini-app embed — what Base App reads when blueagent.dev is
// shared in a feed. Tap the button → launches /app/chat inside the wallet's
// in-app browser with the splash card while it loads.
const fcFrame = JSON.stringify({
  version: "next",
  imageUrl: `${SITE}/opengraph-image`,
  button: {
    title: "Open Blue Agent",
    action: {
      type: "launch_frame",
      name: "Blue Agent",
      url: `${SITE}/app/chat`,
      splashImageUrl: `${SITE}/splash.png`,
      splashBackgroundColor: "#050508",
    },
  },
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#050508",
  // Prevent zoom-in on form focus inside Base App's in-app browser
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // "Base builders" until 2026-09-26 — same one-chain error as DESCRIPTION above,
  // and it renders on every page including /docs. Both chain ids are spelled out:
  // a ticker or an address is meaningless without one and these two share no state.
  keywords: ["Blue Agent", "Base 8453", "Robinhood Chain 4663", "Blue Hub", "AI tools", "x402", "onchain agents", "BLUEAGENT", "Farcaster", "Base App"],
  metadataBase: new URL(SITE),
  applicationName: "Blue Agent",
  appleWebApp: {
    title: "Blue Agent",
    capable: true,
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: SITE,
    siteName: "Blue Agent",
    images: [{ url: "/og-chat.png", width: 1200, height: 630, alt: "Blue Agent" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    creator: "@blueagent_",
    site: "@blueagent_",
    images: ["/og-chat.png"],
  },
  other: {
    // Base App domain ownership verification (base.dev "Add Domain")
    "base:app_id": "69a6f7796b102959c7f25eaa",
    "fc:frame": fcFrame,
    // Legacy fallback for Farcaster v1 clients that haven't migrated to v2
    "fc:frame:image": `${SITE}/opengraph-image`,
    "fc:frame:button:1": "Open Blue Agent",
    "fc:frame:button:1:action": "launch_frame",
    "fc:frame:button:1:target": `${SITE}/app/chat`,
  },
};

// Commits the landing theme to <html data-theme> BEFORE first paint so a
// light-mode visitor never flashes dark. localStorage (explicit choice) wins;
// otherwise follow the OS. Only the landing reads it — see ThemeProvider.
const themeBootstrap = `(function(){try{var t=localStorage.getItem('blueagent_theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body><Providers>{children}</Providers><Analytics /></body>
    </html>
  );
}
