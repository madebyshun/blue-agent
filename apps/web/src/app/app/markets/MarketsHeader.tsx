// The `// MARKETS` header bar shared by /markets, a token page, Launch token and
// /portfolio. No tab row: the sidebar (and the mobile drawer) is the navigation.
export default function MarketsHeader(props: { active?: "markets" | "launch" | "portfolio" | null; chip?: string }) {
  return (
    <div className="hidden lg:flex items-center gap-3.5 flex-wrap shrink-0 min-h-[56px] px-5 py-2 border-b border-[#1A1A2E]">
      <span className="font-mono text-[14px] font-semibold tracking-[0.16em] text-[#E2E8F0]">// MARKETS</span>
      <span className="font-mono text-[13px] text-[#94A3B8]">Base 8453 + Robinhood Chain 4663 · you sign every trade</span>
      {props.chip && <span className="ml-auto font-mono text-[13px] text-[#94A3B8] border border-[#1A1A2E] rounded-[7px] px-2.5 py-[5px]">{props.chip}</span>}
    </div>
  );
}
