"use client";

/**
 * The desktop sidebar's main menu (Claude Design spec, page 18). A Client
 * Component only to read the current path for `aria-current="page"`.
 * Only pages that exist: Map, My sessions and Study requests join this list
 * when they are built.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import Icon, { type IconName } from "@/components/ui/Icon";

const ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/sessions", label: "Browse sessions", icon: "search" },
  { href: "/sessions/new", label: "Host a session", icon: "plus" },
];

export default function SidebarNav() {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-1">
      {ITEMS.map(({ href, label, icon }) => {
        const current = pathname === href;
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={current ? "page" : undefined}
              className={
                "flex min-h-11 items-center gap-3 rounded-2xl px-3.5 text-base font-semibold transition-colors " +
                (current
                  ? "border border-white/15 bg-white/[0.14] text-white"
                  : "border border-transparent text-white/80 hover:bg-white/[0.07] hover:text-white")
              }
            >
              <Icon name={icon} className={current ? "size-5 text-blue-200" : "size-5"} />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
