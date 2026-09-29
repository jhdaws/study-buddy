"use client";

/**
 * The header's main navigation. A Client Component only to read the current
 * path, so the current page's link gets `aria-current="page"` and a visible
 * marker. Built by W5 (#12).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/sessions", label: "Sessions" },
  { href: "/sessions/new", label: "Host a session" },
] as const;

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <ul className="flex gap-1">
      {LINKS.map(({ href, label }) => {
        const current = pathname === href;
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={current ? "page" : undefined}
              className={
                current
                  ? "inline-flex min-h-11 items-center border-b-2 border-current px-3 text-base font-semibold"
                  : "inline-flex min-h-11 items-center border-b-2 border-transparent px-3 text-base text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
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
