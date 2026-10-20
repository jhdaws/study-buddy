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
    <ul className="flex items-center gap-1">
      {NAV_LINKS.map(({ href, label }) => {
        const current = pathname === href;
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={current ? "page" : undefined}
              className={
                "inline-flex min-h-11 items-center px-3 text-[15px] font-semibold whitespace-nowrap " +
                (current
                  ? "text-ink underline decoration-2 underline-offset-[18px]"
                  : "text-ink-2 hover:text-ink")
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
