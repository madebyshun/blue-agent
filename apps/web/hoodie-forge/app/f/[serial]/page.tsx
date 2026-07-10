import type { Metadata } from "next";
import Link from "next/link";

const SITE = "https://hoodie-forge.vercel.app";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ serial: string }>;
}): Promise<Metadata> {
  const { serial } = await params;
  const title = `${serial} · Blue Forge`;
  const description =
    "Hood up. Stay based. A Blue Image experiment by BlueAgent.";
  const og = `${SITE}/api/og/${serial}`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: og, width: 1200, height: 630 }],
      siteName: "Blue Forge",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [og],
    },
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ serial: string }>;
}) {
  const { serial } = await params;
  const base = process.env.SUPABASE_URL;
  const forgedUrl = base
    ? `${base}/storage/v1/object/public/forges/${serial}.png`
    : "";
  const mono = "[font-family:'JetBrains_Mono',ui-monospace,monospace]";

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--fg)] flex flex-col items-center px-5 py-6">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className={`${mono} inline-flex items-center gap-2 text-[10px] text-[var(--mute-3)] tracking-widest hover:text-[#0052FF] transition-colors`}
        >
          <span className="text-[#0052FF]">■</span> BLUE FORGE
        </Link>
        <div className="mt-6 border border-[var(--line)] bg-[var(--panel)]">
          {forgedUrl ? (
            <img
              src={forgedUrl}
              alt={serial}
              className="w-full aspect-square object-cover"
            />
          ) : (
            <div className="w-full aspect-square flex items-center justify-center text-[var(--mute-3)] text-xs tracking-widest">
              IMAGE UNAVAILABLE
            </div>
          )}
          <div
            className={`${mono} flex items-center justify-between px-3 h-9 border-t border-[var(--line)] text-[10px] tracking-widest`}
          >
            <span className="text-[var(--mute-3)]">
              FORGE ID <span className="text-[#0052FF]">{serial}</span>
            </span>
            <span className="text-[#2ECC71]">✓ FORGED</span>
          </div>
        </div>
        <Link
          href="/"
          className="mt-4 block h-12 bg-[#0052FF] text-white text-sm font-medium tracking-wide text-center leading-[3rem] hover:bg-[#0047DD] transition-colors"
        >
          Forge yours →
        </Link>
        <p
          className={`${mono} mt-6 text-center text-[10px] text-[var(--mute-3)] tracking-widest`}
        >
          BLUE IMAGE IS COMING · ONCHAIN-NATIVE · PAY-PER-RENDER
        </p>
      </div>
    </main>
  );
}
