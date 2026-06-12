"use client";

/**
 * App chrome context — shared between the /app layout and individual pages.
 *
 * The mobile navigation drawer lives in the layout, but some pages (notably
 * Blue Chat) need to inject their OWN contextual sub-navigation into that
 * drawer (Models / Tools / Skills / Scheduled, plus recent conversations).
 * A page registers its contextual nav via `setContextual(...)` on mount and
 * clears it on unmount, so the layout's drawer can render it without the
 * layout knowing anything about chat internals.
 */
import { createContext, useContext, useState, type ReactNode } from "react";

export interface DrawerNavItem {
  id: string;
  label: string;
  icon?: ReactNode;
  active?: boolean;
  onSelect: () => void;
}

export interface DrawerRecent {
  id: string;
  title: string;
  active?: boolean;
  onSelect: () => void;
}

export interface ContextualNav {
  /** Title shown in the mobile top bar (e.g. "Blue Chat", "Models"). */
  barTitle: string;
  /** Heading for the contextual group inside the drawer. */
  groupTitle: string;
  items: DrawerNavItem[];
  recents?: DrawerRecent[];
}

interface AppChromeValue {
  drawerOpen: boolean;
  setDrawerOpen: (b: boolean) => void;
  contextual: ContextualNav | null;
  setContextual: (n: ContextualNav | null) => void;
}

const Ctx = createContext<AppChromeValue | null>(null);

export function AppChromeProvider({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [contextual, setContextual]   = useState<ContextualNav | null>(null);
  return (
    <Ctx.Provider value={{ drawerOpen, setDrawerOpen, contextual, setContextual }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAppChrome(): AppChromeValue {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAppChrome must be used inside AppChromeProvider");
  return c;
}
