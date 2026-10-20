"use client";

/**
 * State the shell shares with pages: the breadcrumb trail (a page that knows
 * more than its path -- a session page knows its course and topic -- sets it
 * with <PageCrumbs>), and whether the phone drawer is open.
 */

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";

export type Crumb = { label: string; href?: string };

type Shell = {
  crumbs: Crumb[] | null;
  setCrumbs: (crumbs: Crumb[] | null) => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
};

const ShellContext = createContext<Shell | null>(null);

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[] | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // A new page closes the drawer and drops the last page's trail. Adjusting
  // state while rendering, keyed on the path, rather than in an effect.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setDrawerOpen(false);
    setCrumbs(null);
  }

  return (
    <ShellContext.Provider value={{ crumbs, setCrumbs, drawerOpen, setDrawerOpen }}>
      {children}
    </ShellContext.Provider>
  );
}

export function useShell(): Shell {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error("useShell() outside <ShellProvider>");
  return shell;
}

/** The trail for paths that need nothing more than the path. */
export function crumbsForPath(pathname: string): Crumb[] {
  if (pathname === "/") return [{ label: "Home" }];
  if (pathname === "/sessions/new") return [{ label: "Host a session" }];
  if (pathname === "/my") return [{ label: "My sessions" }];
  if (pathname.startsWith("/sessions/")) return [{ label: "Sessions", href: "/sessions" }, { label: "Session" }];
  if (pathname === "/sessions") return [{ label: "Sessions" }];
  return [{ label: "Study Buddy" }];
}

/** Set this page's breadcrumb trail. Renders nothing; a no-op outside the shell. */
export function PageCrumbs({ trail }: { trail: Crumb[] }) {
  const setCrumbs = useContext(ShellContext)?.setCrumbs;
  const key = JSON.stringify(trail);
  useEffect(() => {
    setCrumbs?.(JSON.parse(key) as Crumb[]);
  }, [key, setCrumbs]);
  return null;
}
