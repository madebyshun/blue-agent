// GET /.well-known/farcaster.json
// Base App / Farcaster Mini App manifest. accountAssociation is signed later
// (Warpcast/Base App "Manifest" tool) — leave the three fields blank until then.
// A static copy lives at public/.well-known/farcaster.json as a fallback.

export const dynamic = "force-static";

export function GET() {
  return Response.json({
    accountAssociation: {
      header: "",
      payload: "",
      signature: "",
    },
    miniapp: {
      version: "1",
      name: "BlueAgent",
      iconUrl: "https://blueagent.dev/icon.png",
      homeUrl: "https://blueagent.dev/app/chat",
      imageUrl: "https://blueagent.dev/og-chat.png",
      buttonTitle: "Open Blue Chat",
      splashImageUrl: "https://blueagent.dev/splash.png",
      splashBackgroundColor: "#4FC3F7",
      webhookUrl: "https://blueagent.dev/api/farcaster/webhook",
      primaryCategory: "finance",
      tags: ["base", "ai", "defi", "agents", "tools"],
      subtitle: "AI agent tools on Base",
      description: "69 AI tools. Pay per call via x402 USDC on Base. No signup, no API key.",
    },
  });
}
