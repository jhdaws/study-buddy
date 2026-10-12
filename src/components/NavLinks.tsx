"use client";

/**
 * The top bar's main navigation on wider screens (phones get <TabBar>).
 * A Client Component only to read the current path, so the current page's
 * link gets `aria-current="page"` and the filled pill. Built by W5 (#12),
 * restyled to the Claude Design spec.
 *
 * Only pages that exist are linked: map, my sessions and study requests come
 * in later sprints.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/sessions", label: "Sessions" },
  { href: "/sessions/new", label: "Host a session" },
] as const;

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <ul className="flex items-center gap-1 rounded-full bg-white/60 p-1">
      {NAV_LINKS.map(({ href, label }) => {
        const current = pathname === href;
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={current ? "page" : undefined}
              className={
                "inline-flex min-h-11 items-center rounded-full px-4 text-base font-semibold whitespace-nowrap transition-colors " +
                (current
                  ? "bg-navy-900 text-white"
                  : "text-navy-muted hover:bg-white hover:text-navy-900")
              }
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
