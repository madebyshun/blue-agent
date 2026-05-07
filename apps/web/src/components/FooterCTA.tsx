export default function FooterCTA() {
  return (
    <section className="max-w-5xl mx-auto px-6 mb-20">
      <div className="relative rounded-2xl overflow-hidden border border-[#1A52FF]/25 bg-[#0F1C35]">
        {/* Glow effect */}
        <div className="absolute inset-0 bg-blue-glow opacity-50" />

        <div className="relative z-10 px-8 sm:px-16 py-16 text-center">
          <div className="inline-flex items-center gap-2 border border-[#1A52FF]/25 bg-[#1A52FF]/8 rounded-full px-4 py-1.5 mb-8">
            <span className="w-2 h-2 rounded-full bg-[#1A52FF] animate-pulse" />
            <span className="font-mono text-xs text-[#33C3FF] tracking-widest">START BUILDING</span>
          </div>

          <h2 className="font-sans font-bold text-3xl sm:text-5xl text-white mb-4 leading-tight">
            Build the Base-native<br />
            <span className="text-gradient-blue">founder console</span>
          </h2>

          <p className="text-[#B8CBE8] text-lg mb-3 max-w-lg mx-auto">
            Start with ideas, build plans, audits, and launch workflows.
          </p>
          <p className="text-sm text-[#3D5275] mb-10">
            Then expand into chat, agent launch, marketplace, and rewards.
          </p>

          <div className="flex flex-wrap gap-4 justify-center">
            <a href="/code"
              className="btn-primary text-sm font-semibold px-8 py-3 rounded-lg">
              Open Founder Console
            </a>
            <a href="/rewards"
              className="text-sm text-[#B8CBE8] hover:text-white border border-white/15 hover:border-[#1A52FF]/40 px-8 py-3 rounded-lg transition-all">
              View Rewards
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
