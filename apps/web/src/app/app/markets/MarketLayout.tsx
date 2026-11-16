import type { ReactNode } from "react";

/** Shared geometry keeps every Markets view aligned, including when scrollbars appear. */
export function MarketScroll({ children }: { children: ReactNode }) {
  return <main className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]">{children}</main>;
}

export function MarketContainer({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-5 px-5 pb-8 md:px-8">{children}</div>;
}
