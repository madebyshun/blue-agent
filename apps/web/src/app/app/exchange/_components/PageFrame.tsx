import WorkspaceIntro from "@/components/workspace/WorkspaceIntro";
// Frame for the signed-in Agents pages (sell, usage, following, docs): the
// shared `// EXCHANGE` header, a title and one line of purpose.
import ExchangeHeader from "../ExchangeHeader";
import SubTabs from "./SubTabs";

export default function PageFrame({ chip, title, lede, children, tabs }: { chip: string; title: string; lede: React.ReactNode; children: React.ReactNode; tabs?: { list: { href: string; label: string }[]; active: string } }) {
  return (
    <div className="workspace-surface flex flex-col h-full overflow-hidden font-mono [&_a]:font-mono [&_button]:font-mono">
      <ExchangeHeader active={null} chip={chip} />
      <div className="workspace-scroll flex-1 min-h-0 overflow-y-auto">
        <div className="workspace-content">
          {tabs && <SubTabs tabs={tabs.list} active={tabs.active} />}
          <WorkspaceIntro eyebrow="YOUR AGENT WORKSPACE / BASE 8453" title={title} description={lede} />
          {children}
        </div>
      </div>
    </div>
  );
}
