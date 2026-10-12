"use client";

/**
 * The desktop sidebar's menu. A Client Component only to read the current
 * path for `aria-current="page"`. Only pages that exist.
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
    <ul className="flex flex-col gap-0.5">
      {ITEMS.map(({ href, label, icon }) => {
        const current = pathname === href;
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={current ? "page" : undefined}
              className={
                "flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-semibold " +
                (current ? "bg-paper text-brand" : "text-ink-2 hover:bg-paper hover:text-ink")
              }
            >
              <Icon name={icon} className="size-5" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
