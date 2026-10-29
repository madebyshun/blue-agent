// The `// EXCHANGE` header bar shared by every /exchange page: title, one line of
// purpose and a chip. No tab row: the sidebar (and the mobile drawer) is the one
// navigation, and in-page switches (SubTabs) cover sibling views (2026-10-29).
export default function ExchangeHeader(props: { active?: string | null; chip?: string }) {
  return (
    <div className="hidden lg:flex items-center gap-3.5 flex-wrap shrink-0 min-h-[56px] px-5 py-2 border-b border-[#1A1A2E]">
      <span className="font-mono text-[14px] font-semibold tracking-[0.16em] text-[#E2E8F0]">// AGENTS</span>
      <span className="font-mono text-[13px] text-[#94A3B8]">agents on Base · measured on chain · paid seller to buyer</span>
      {props.chip && <span className="ml-auto font-mono text-[13px] text-[#94A3B8] border border-[#1A1A2E] rounded-[7px] px-2.5 py-[5px]">{props.chip}</span>}
    </div>
  );
}
