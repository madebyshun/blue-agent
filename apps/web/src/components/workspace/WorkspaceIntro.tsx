import type { ReactNode } from "react";

/** Presentation only: live counts and actions stay with their owning surface. */
export default function WorkspaceIntro({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: ReactNode; children?: ReactNode }) {
  return <section className="workspace-intro">
    <div className="min-w-0 max-w-[760px]">
      <p className="workspace-eyebrow"><span aria-hidden />{eyebrow}</p>
      <h1>{title}</h1>
      <div className="workspace-description">{description}</div>
    </div>
    {children && <div className="workspace-intro-aside">{children}</div>}
  </section>;
}
