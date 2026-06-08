import Link from "next/link";

export default function NotFound() {
  return (
    <div className="px-5 sm:px-8 py-20 max-w-2xl mx-auto text-center">
      <p className="font-mono text-[120px] font-bold leading-none mb-2 bg-clip-text text-transparent bg-gradient-to-r from-[#4FC3F7] to-[#A78BFA]">
        404
      </p>
      <h1 className="font-mono text-2xl font-bold tracking-tight mb-2">Page not found</h1>
      <p className="font-mono text-sm text-slate-500 mb-8 leading-relaxed max-w-md mx-auto">
        The page you&apos;re looking for doesn&apos;t exist on the Blue Hub marketplace.
        Maybe it&apos;s a tool that hasn&apos;t been registered yet.
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link href="/"
          className="font-mono text-sm font-semibold px-5 py-2.5 rounded-lg bg-[#4FC3F7] text-[#050508] hover:bg-[#29ABE2] transition-colors">
          ← Back home
        </Link>
        <Link href="/marketplace"
          className="font-mono text-sm font-semibold px-5 py-2.5 rounded-lg border border-[#A78BFA]/30 text-[#A78BFA] hover:bg-[#A78BFA]/5 transition-colors">
          Browse marketplace
        </Link>
      </div>
    </div>
  );
}
