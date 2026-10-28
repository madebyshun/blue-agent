// Frame for the signed-in Agents pages (sell, usage, following, docs): the
// shared `// EXCHANGE` header, a title and one line of purpose.
import ExchangeHeader from "../ExchangeHeader";

export default function PageFrame({ chip, title, lede, children }: { chip: string; title: string; lede: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden font-mono [&_a]:font-mono [&_button]:font-mono">
      <ExchangeHeader active={null} chip={chip} />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-5 py-[18px] w-full max-w-[1100px]">
          <h1 className="text-[15px] font-semibold text-[#E2E8F0]">{title}</h1>
          <p className="mt-1.5 mb-4 max-w-[900px] text-[11px] leading-[1.7] text-[#94A3B8]">{lede}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
